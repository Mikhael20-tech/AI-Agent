import { db } from './database.js';
import { LLMService } from './llm_service.js';
import { sendFileToTelegram } from './send_telegram_file.js';
import { ReportGenerator } from './report_generator.js';

export class TelegramBotService {
  constructor(eventBus, agent1 = null) {
    this.eventBus = eventBus;
    this.agent1 = agent1;
    this.pollInterval = null;
    this.lastUpdateId = 0;
    this.isPolling = false;
    this.chatHistories = new Map(); // chatId -> [{ role, content }]
    this.lastActiveEmployees = new Map(); // chatId -> empId
  }

  setAgent1(agent1) {
    this.agent1 = agent1;
  }

  getCredentials() {
    const settings = db.getSettings();
    const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token || '';
    const chatId = process.env.TELEGRAM_CHAT_ID || settings.telegram_chat_id || '';
    return { token, chatId };
  }

  async sendChatAction(chatId, action = 'typing') {
    const { token } = this.getCredentials();
    if (!token || !chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
      });
    } catch (e) {}
  }

  /**
   * Kirim notifikasi draft transaksi baru ke Telegram Finance Lead
   * Dilengkapi Inline Keyboard [Approve / Reject]
   */
  async notifyPendingApproval(draft) {
    const { token, chatId } = this.getCredentials();

    const formattedAmount = (draft.grand_total || 0).toLocaleString('id-ID');
    const subtotalFormatted = (draft.subtotal || 0).toLocaleString('id-ID');
    const ppnFormatted = (draft.ppn || 0).toLocaleString('id-ID');

    // Pesan terformat HTML/Markdown dengan kepatuhan UU PDP (Data di-masking)
    const messageText = `
🔔 <b>[PERMINTAAN OTORISASI DRAFT SEVENTHSOFT]</b>
─────────────────────────────
📄 <b>No. Faktur:</b> <code>${draft.invoice_number}</code>
🏢 <b>Vendor:</b> ${draft.vendor_name}
🔒 <b>NPWP (Masked):</b> <code>${draft.vendor_masked_npwp}</code>
💳 <b>Rekening:</b> <code>${draft.vendor_masked_rek}</code>
📅 <b>Tanggal:</b> ${draft.date}

<b>Rincian Finansial:</b>
• Subtotal: Rp ${subtotalFormatted}
• PPN (11%): Rp ${ppnFormatted}
• <b>Grand Total: Rp ${formattedAmount}</b>

<b>Alokasi Akun (COA):</b>
• Debet: ${draft.coa_debet}
• Kredit: ${draft.coa_kredit}

🤖 <i>Dibuat oleh: ${draft.creator_agent_id}</i>
⚖️ <i>Four-Eyes Principle: Menunggu otorisasi resmi Finance Lead untuk posting ke General Ledger.</i>
`.trim();

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Setujui (Posting GL)', callback_data: `APPROVE:${draft.id}` },
          { text: '❌ Tolak (Revisi Staf)', callback_data: `REJECT:${draft.id}` }
        ]
      ]
    };

    // 1. Simpan pesan ke history simulasi (agar dashboard UI selalu bisa melihat notifikasi live)
    this.eventBus.emit('telegram_message_sent', {
      type: 'NOTIFICATION_DRAFT',
      draft_id: draft.id,
      text: messageText,
      buttons: inlineKeyboard.inline_keyboard[0],
      timestamp: new Date().toISOString()
    });

    // 2. Jika token & chat ID nyata tersedia, kirim ke Telegram Bot API
    if (token && chatId) {
      try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard
          })
        });
        const data = await res.json();
        if (!data.ok) {
          console.warn('Telegram API response error:', data.description);
        } else {
          console.log(`Telegram notification berhasil terkirim untuk draft ${draft.id}`);
        }
      } catch (err) {
        console.error('Gagal mengirim notifikasi ke Telegram Bot:', err.message);
      }
    } else {
      console.log(`[SIMULASI TELEGRAM] Draft ${draft.id} siap di-approve (Token belum diatur, simulator aktif).`);
    }

    return true;
  }

  /**
   * Eksekusi aksi persetujuan / penolakan (Bisa dipanggil oleh Telegram Webhook atau UI Simulator)
   */
  async handleCallbackAction(actionData, fromUser = null) {
    const [action, draftId] = actionData.split(':');
    const draft = db.getDraftById(draftId);

    if (!draft) {
      return { success: false, message: 'Draft tidak ditemukan atau sudah dihapus.' };
    }

    if (draft.status !== 'PENDING_APPROVAL') {
      return {
        success: false,
        message: `Draft sudah diproses sebelumnya dengan status: ${draft.status}.`
      };
    }

    const approverName = fromUser 
      ? `${fromUser.first_name || 'Hendra'} (${fromUser.username ? '@' + fromUser.username : 'Finance Lead'})`
      : db.getSettings().finance_lead_name;

    if (action === 'APPROVE') {
      // Update draft jadi POSTED di Seventhsoft
      db.updateDraftStatus(draftId, {
        status: 'POSTED',
        approver_user_id: approverName,
        notes: 'Disetujui dan diotorisasi via Telegram Bot Inline Button'
      });

      // Beritahu avatar: Avatar Mengangguk (nodding)
      this.eventBus.emit('avatar_state', {
        state: 'approved',
        speech: `Draft ${draft.invoice_number} disetujui oleh Finance Lead! Jurnal resmi diposting ke General Ledger Seventhsoft.`
      });

      this.eventBus.emit('draft_updated', {
        id: draftId,
        status: 'POSTED',
        approver: approverName
      });

      return {
        success: true,
        action: 'APPROVED',
        text: `✅ <b>BERHASIL DIPOSTING</b>\nDraft ${draft.invoice_number} (Rp ${draft.grand_total.toLocaleString('id-ID')}) telah resmi diposting ke GL Seventhsoft oleh ${approverName}.`
      };

    } else if (action === 'REJECT') {
      db.updateDraftStatus(draftId, {
        status: 'REJECTED',
        approver_user_id: approverName,
        notes: 'Ditolak via Telegram Bot (Perlu cek fisik dokumen)'
      });

      // Beritahu avatar: Avatar Menggeleng/Waspada (rejected)
      this.eventBus.emit('avatar_state', {
        state: 'rejected',
        speech: `Draft ${draft.invoice_number} ditolak oleh Finance Lead. Dokumen dikembalikan ke Staf Verifikator untuk pengecekan fisik.`
      });

      this.eventBus.emit('draft_updated', {
        id: draftId,
        status: 'REJECTED',
        approver: approverName
      });

      return {
        success: true,
        action: 'REJECTED',
        text: `❌ <b>DRAFT DITOLAK</b>\nDraft ${draft.invoice_number} telah dikembalikan ke Staf Verifikator untuk penyesuaian fisik.`
      };
    }

    return { success: false, message: 'Aksi tidak dikenal' };
  }

  /**
   * Memproses satu update objek dari Telegram (baik via Long-Polling maupun Webhook)
   */
  async processUpdate(update) {
    const { token } = this.getCredentials();
    if (!token || !update) return;

    try {
      // Handle klik inline button
      if (update.callback_query) {
        const cq = update.callback_query;
        const result = await this.handleCallbackAction(cq.data, cq.from);

        let toastText = 'Aksi berhasil diproses';
        if (result.success) {
          toastText = result.action === 'APPROVED' ? '✅ Otorisasi Disetujui (Posting GL)!' : '❌ Draft Ditolak (Perlu Revisi)';
        } else {
          toastText = `⚠️ ${result.message || 'Draft sudah diproses sebelumnya'}`;
        }

        // Jawab callback query Telegram agar spinner berhenti & tampilkan pesan yang benar
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cq.id,
            text: toastText
          })
        });

        // Kirim pesan status konfirmasi ke chat jika berhasil
        if (result.success && result.text) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cq.message.chat.id,
              text: result.text,
              parse_mode: 'HTML'
            })
          });
        }
      }

      // Handle pengiriman invoice berupa foto atau dokumen langsung dari Telegram (OCR & Auto-Drafting)
      if (update.message && (update.message.photo || update.message.document)) {
        const chatId = update.message.chat.id;
        const fromUser = update.message.from;
        const caption = update.message.caption || '';
        await this.sendChatAction(chatId, 'typing');

        await this.sendCustomMessage(chatId, `📸 <b>[AI AGENT 1: SCAN INVOICE DITERIMA]</b>\nDokumen tagihan diterima dari <b>${fromUser?.first_name || 'Finance Lead'}</b>.\n\n⚙️ <i>Memulai ekstraksi OCR, verifikasi DPP & PPN 11%, masking data pribadi (UU No. 27/2022), dan perumusan draf transaksi Seventhsoft...</i>`);

        try {
          const docName = update.message.document?.file_name || `Nota_Scan_${Date.now()}.jpg`;
          const rawDocText = caption || `Faktur Pembelian Pengadaan Operasional ${docName}`;

          if (this.agent1) {
            const { draft } = await this.agent1.processInvoiceDocument({
              fileName: docName,
              rawContent: rawDocText,
              docType: 'PEMBELIAN'
            });

            // Kirim notifikasi otorisasi lengkap dengan tombol Approve & Reject
            await this.notifyPendingApproval(draft);
          } else {
            await this.sendCustomMessage(chatId, `⚠️ Agent 1 sedang offline.`);
          }
        } catch (scanErr) {
          console.error('Gagal memproses dokumen invoice via Telegram:', scanErr.message);
          await this.sendCustomMessage(chatId, `⚠️ Gagal membaca dokumen: ${scanErr.message}`);
        }
        return;
      }

      // Handle pesan chat teks (Interaksi dialog dua arah dengan 30 pegawai)
      if (update.message && update.message.text) {
        const rawText = update.message.text.trim();
        const chatId = update.message.chat.id;
        const fromUser = update.message.from;

        console.log(`[TELEGRAM CHAT MASUK] Dari ${fromUser?.first_name || 'User'} (${chatId}): "${rawText}"`);

        if (rawText === '/start') {
          await this.sendCustomMessage(chatId, `🤖 <b>Halo Finance Lead (${fromUser.first_name || 'Bpk. Mikhael'})!</b>\n\nSelamat datang di Bot Resmi <b>AI Agent Akuntansi Seventhsoft</b>.\n\n✨ <b>Apa saja yang bisa Anda lakukan:</b>\n1. Menerima & mengotorisasi draf transaksi secara aman <i>(Four-Eyes Principle)</i>.\n2. Mengirim foto struk/nota/invoice langsung di chat ini untuk di-OCR dan dibuatkan draf transaksi otomatis.\n3. Mengobrol langsung dengan 30 staf kantor! (Contoh: ketik <i>"Gimana kabarmu Bagus"</i>, <i>"Doni minta rekap gaji pdf"</i>, <i>"Koko minta kopi"</i>, atau <i>"Budi antar berkas"</i>).`);
          return;
        }

        // Tampilkan indikator mengetik / mengunggah file di Telegram
        const isRequestingFile = /(excel|xlsx|spreadsheet|pdf|dokumen|rekap|laporan|kirim.*file|buatkan.*excel|kirim.*excel|export.*excel|unduh|download|minta.*file|minta.*excel|kirimkan.*excel|bikin.*excel|minta.*pdf|kirim.*pdf|buatkan.*pdf)/i.test(rawText);
        await this.sendChatAction(chatId, isRequestingFile ? 'upload_document' : 'typing');

        // Deteksi jika user mengajak traktir kopi / ngantri
        if (/traktir.*kopi|ngantri|antre|kopi\s*semua|kopi\s*bareng|ngopi\s*semua/i.test(rawText)) {
          console.log(`[TELEGRAM EVENT] Triggering coffee queue event from ${fromUser?.first_name || 'Finance Lead'}`);
          this.eventBus.emit('coffee_queue', { initiator: fromUser?.first_name || 'Finance Lead' });
        }

        if (isRequestingFile) {
          try {
            const isPayroll = /\b(gaji|payroll|upah|slip|tunjangan|bpjs|pph\s*21)\b/i.test(rawText);
            const wantsPdf = /\b(pdf|dokumen)\b/i.test(rawText);

            let filePath = '';
            let caption = '';

            if (isPayroll) {
              if (wantsPdf) {
                console.log(`[TELEGRAM PAYROLL PDF] Mengenerate file PDF rekap gaji untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
                filePath = await ReportGenerator.generatePayrollPdf();
                caption = `📑 <b>Rekapitulasi Gaji Karyawan Seventhsoft (PDF)</b>\nPeriode: September 2026 (Bulan Kemarin)\nBerikut dokumen rekapitulasi gaji resmi yang disiapkan oleh Doni (Payroll Specialist) untuk Finance Lead.`;
              } else {
                console.log(`[TELEGRAM PAYROLL EXCEL] Mengenerate file Excel rekap gaji untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
                filePath = ReportGenerator.generatePayrollExcel();
                caption = `📊 <b>Laporan Spreadsheet Payroll Seventhsoft (EXCEL)</b>\nPeriode: September 2026\nRekapitulasi slip gaji, tunjangan, potongan BPJS dan PPh 21 seluruh karyawan.`;
              }
            } else {
              // Laporan transaksi umum
              let reportType = 'all';
              if (/rekon|bank|mutasi/i.test(rawText)) reportType = 'reconciliation';
              else if (/pajak|ppn|pph/i.test(rawText)) reportType = 'tax';
              else if (/audit|log/i.test(rawText)) reportType = 'audit';
              else if (/draft|faktur|pembelian|invoice/i.test(rawText)) reportType = 'drafts';

              console.log(`[TELEGRAM EXCEL EXPORT] Mengenerate file Excel untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
              filePath = ReportGenerator.generateExcelReport(reportType);
              caption = `📊 <b>Laporan Excel Seventhsoft (${reportType.toUpperCase()})</b>\nBerikut file spreadsheet yang diminta oleh ${fromUser?.first_name || 'Finance Lead'}. Data siap dianalisis.`;
            }

            if (filePath) {
              await sendFileToTelegram(filePath, caption, chatId);
              console.log(`[TELEGRAM FILE SENT] File berhasil dikirim ke ${chatId}: ${filePath}`);
            }
          } catch (fileErr) {
            console.error('Gagal mengirim file otomatis ke Telegram:', fileErr.message);
          }
        }

        const reply = await this.generateEmployeeResponse(rawText, fromUser, chatId);
        if (reply) {
          console.log(`[TELEGRAM CHAT BALAS] Ke ${chatId} | ${reply.name}: "${reply.speech}"`);

          // Pancarkan event ke Virtual Office via WebSocket (jika ada client terhubung)
          this.eventBus.emit('employee_speech', {
            empId: reply.empId,
            name: reply.name,
            role: reply.role,
            speech: reply.speech,
            fromUser: fromUser?.first_name || 'Finance Lead'
          });

          // Kirim balasan Telegram
          await this.sendCustomMessage(chatId, `💬 <b>${reply.name} (${reply.role}):</b>\n"${reply.speech}"`);
        }
      }
    } catch (err) {
      console.error('Error processing Telegram update:', err.message);
    }
  }

  /**
   * Background polling untuk menerima respons klik tombol dari Telegram nyata
   * (Digunakan saat run di Localhost atau VPS yang menyala 24/7)
   */
  startPolling() {
    // Jangan polling jika berjalan di serverless environment seperti Vercel
    if (process.env.VERCEL) {
      console.log('Environment Vercel terdeteksi: Long-Polling dinonaktifkan (Gunakan Webhook Telegram)');
      return;
    }

    const { token } = this.getCredentials();
    if (!token || this.isPolling) return;

    this.isPolling = true;
    console.log('Memulai Telegram Long-Polling...');

    const poll = async () => {
      if (!this.isPolling) return;
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=20`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.lastUpdateId = update.update_id;
            await this.processUpdate(update);
          }
        }
      } catch (err) {
        // Polling retry
      }

      if (this.isPolling) {
        this.pollInterval = setTimeout(poll, 2500);
      }
    };

    poll();
  }

  /**
   * Router Cerdas Pegawai Seventhsoft
   * Mendukung memori percakapan berlanjut (follow-up questions) & persona LLM dinamis
   */
  async generateEmployeeResponse(text, fromUser, chatId) {
    const callerName = fromUser?.first_name || 'Pak Mikhael';
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    let timeState = 'jam kerja produktif';
    if (currentHour >= 12 && currentHour < 13) {
      timeState = 'jam istirahat makan siang (12:00 - 13:00)';
    } else if (currentHour >= 17) {
      timeState = 'jam pulang kantor / lembur santai';
    } else if (currentHour < 8) {
      timeState = 'pagi hari menjelang jam kantor';
    }
    const timeContext = `Waktu kantor sekarang: pukul ${currentHour}:${currentMinute} WIB (${timeState}). Anda sedang mengobrol santai & profesional dengan ${callerName} (Finance Lead Seventhsoft).`;

    // Roster 30 Pegawai Lengkap dengan Karakter Manusiawi yang Nyata
    const EMPLOYEES = [
      {
        id: 'staff-doni',
        name: 'Doni',
        role: 'Payroll Specialist',
        dept: 'finance',
        nameTriggers: [/\bdoni\b/i],
        topicTriggers: [/\bgaji\b/i, /slip\s*gaji/i, /\bpayroll\b/i, /pph\s*21/i, /\bupah\b/i, /\btunjangan\b/i, /\bbpjs\b/i, /\bthr\b/i],
        persona: 'Anda adalah Doni, Payroll Specialist di Seventhsoft. Anda sosok yang teliti, santai tapi cekatan soal angka, paham dinamika tanggal tua/muda karyawan kantor. Anda mengurus slip gaji, potongan BPJS Ketenagakerjaan/Kesehatan, dan PPh 21. Jadwal transfer gaji rutin setiap tanggal 25, dan draf rekap Anda siapkan paling lambat tanggal 23-24.'
      },
      {
        id: 'cafe-koko',
        name: 'Koko',
        role: 'Barista Pantry',
        dept: 'lounge',
        nameTriggers: [/\bkoko\b/i, /\bbarista\b/i],
        topicTriggers: [/\bkopi\b/i, /\bespresso\b/i, /\blatte\b/i, /\bamericano\b/i, /\bcappuccino\b/i, /\bteh\b/i, /\bminum\b/i],
        persona: 'Anda adalah Koko, Barista Pantry di Seventhsoft. Anda ramah, gaul, energik, dan hafal racikan kopi favorit semua staf (espresso, caffe latte, americano). Anda suka bercanda santai soal asupan kafein biar rekan kerja tetap melek dan semangat.'
      },
      {
        id: 'cafe-buan',
        name: 'Bu Ani',
        role: 'Chef Kantin',
        dept: 'lounge',
        nameTriggers: [/bu\s*ani\b/i, /\bani\b/i],
        topicTriggers: [/\bmakan\b/i, /\bkantin\b/i, /\bsnack\b/i, /\bkue\b/i, /\blapar\b/i, /\bmenu\b/i],
        persona: 'Anda adalah Bu Ani, Chef Kantin Seventhsoft. Anda sosok keibuan yang hangat dan perhatian. Anda selalu memastikan makan siang staf bergizi, nasi box lezat, dan kue camilan sore selalu tersedia agar tim tidak kelaparan saat kerja.'
      },
      {
        id: 'staff-maya',
        name: 'Maya',
        role: 'Senior Auditor',
        dept: 'finance',
        nameTriggers: [/\bmaya\b/i],
        topicTriggers: [/\baudit\b/i, /\bauditor\b/i, /sha-?256/i, /\btemuan\b/i, /\bkejanggalan\b/i, /\bintegritas\b/i],
        persona: 'Anda adalah Maya, Senior Auditor di Seventhsoft. Anda kritis, teliti, tapi suportif. Anda mengawasi jejak audit transaksi GL dengan hash SHA-256 untuk memastikan laporan keuangan bebas rekayasa.'
      },
      {
        id: 'staff-rian',
        name: 'Rian',
        role: 'Staf Pajak e-Faktur',
        dept: 'finance',
        nameTriggers: [/\brian\b/i],
        topicTriggers: [/\bpajak\b/i, /e-?faktur\b/i, /\bppn\b/i, /pph\s*23/i, /\bspt\b/i],
        persona: 'Anda adalah Rian, Staf Pajak e-Faktur di Seventhsoft. Anda cermat urusan perpajakan PPN 11%, bukti potong PPh 23, dan e-Faktur. Anda selalu tenang dan rapi dalam menyiapkan draf SPT Masa.'
      },
      {
        id: 'staff-nadia',
        name: 'Nadia',
        role: 'Billing & AR Specialist',
        dept: 'finance',
        nameTriggers: [/\bnadia\b/i],
        topicTriggers: [/\bpiutang\b/i, /\btagihan\b/i, /\bbilling\b/i, /\bjatuh\s*tempo\b/i, /\bar\b/i, /invoice\s*klien/i],
        persona: 'Anda adalah Nadia, Billing & AR Specialist di Seventhsoft. Anda punya kemampuan komunikasi dan negosiasi yang luwes saat memonitor piutang dagang dan mengirimkan reminder invoice ke klien agar cash flow kantor tetap lancar.'
      },
      {
        id: 'staff-dimas',
        name: 'Dimas',
        role: 'Junior Accountant',
        dept: 'finance',
        nameTriggers: [/\bdimas\b/i],
        topicTriggers: [/surat\s*jalan/i, /\bfisik\s*barang/i, /\bpenerimaan\s*barang/i],
        persona: 'Anda adalah Dimas, Junior Accountant di Seventhsoft. Anda anak muda yang cekatan dan teliti mencocokkan surat jalan fisik vendor dengan data draf pembelian di sistem Seventhsoft.'
      },
      {
        id: 'staff-budi-kurir',
        name: 'Budi',
        role: 'Kurir Berkas Akuntansi',
        dept: 'finance',
        nameTriggers: [/\bbudi\b/i, /\bkurir\b/i],
        topicTriggers: [/antar\s*berkas/i, /map\s*invoice/i, /dokumen\s*fisik/i],
        persona: 'Anda adalah Budi, Kurir Berkas Akuntansi di Seventhsoft. Anda gesit, sopan, dan langkah kakinya cepat saat mengantarkan map dokumen invoice antar meja kerja di kantor.'
      },
      {
        id: 'lead-finance',
        name: 'Mikhael',
        role: 'Finance Lead (Approver GL)',
        dept: 'finance',
        nameTriggers: [/\bmikhael\b/i, /finance\s*lead/i, /\bapprover\b/i],
        topicTriggers: [/four-?eyes/i, /\botorisasi\b/i, /posting\s*gl/i, /approval\s*lead/i],
        persona: 'Anda adalah Mikhael, Finance Lead Seventhsoft. Anda memegang otoritas persetujuan Four-Eyes Principle dengan bijak dan teliti sebelum draf diposting ke General Ledger.'
      },
      {
        id: 'agent-entry',
        name: 'Tari',
        role: 'Spesialis OCR & Data Entry',
        dept: 'finance',
        nameTriggers: [/\btari\b/i, /\bentry\b/i, /\bocr\b/i],
        topicTriggers: [/ekstraksi\s*faktur/i, /scan\s*invoice/i, /masking\s*pdp/i],
        persona: 'Anda adalah Tari, Spesialis Data Entry & OCR di Seventhsoft. Anda membaca faktur vendor dengan cepat dan otomatis menyamarkan data sensitif NIK/NPWP sesuai UU PDP.'
      },
      {
        id: 'agent-rekon',
        name: 'Bayu',
        role: 'Spesialis Rekonsiliasi Bank',
        dept: 'finance',
        nameTriggers: [/\bbayu\b/i, /\brekon\b/i],
        topicTriggers: [/rekonsiliasi\s*bank/i, /\bbca\b/i, /rekening\s*koran/i, /\bmutasi\b/i],
        persona: 'Anda adalah Bayu, Spesialis Rekonsiliasi Bank di Seventhsoft. Anda teliti mencocokkan mutasi rekening koran BCA dengan buku kas sampai selisihnya benar-benar nol.'
      },
      {
        id: 'agent-pajak',
        name: 'Citra',
        role: 'Analis Pajak & Margin',
        dept: 'finance',
        nameTriggers: [/\bcitra\b/i, /\banalis\s*pajak\b/i],
        topicTriggers: [/proyeksi\s*ppn/i, /anomali\s*hpp/i, /\bmargin\b/i],
        persona: 'Anda adalah Citra, Analis Pajak & Margin di Seventhsoft. Anda jeli menganalisis beban pajak bulanan dan mendeteksi anomali harga pokok penjualan (HPP).'
      },
      {
        id: 'dev-kevin',
        name: 'Kevin',
        role: 'Lead Backend Engineer',
        dept: 'tech',
        nameTriggers: [/\bkevin\b/i],
        topicTriggers: [/\bbackend\b/i, /\brest\s*api\b/i, /\bendpoint\b/i, /\bwebhook\b/i, /\bn8n\b/i],
        persona: 'Anda adalah Kevin, Lead Backend Engineer Seventhsoft. Anda santai, geek, suka ngopi sambil menjaga REST API Seventhsoft dan webhook n8n tetap cepat di bawah 40ms.'
      },
      {
        id: 'dev-sarah',
        name: 'Sarah',
        role: 'Frontend React Engineer',
        dept: 'tech',
        nameTriggers: [/\bsarah\b/i],
        topicTriggers: [/\bfrontend\b/i, /\breact\b/i, /virtual\s*office/i, /\bcanvas\b/i],
        persona: 'Anda adalah Sarah, Frontend React Engineer Seventhsoft. Anda ceria, visual-oriented, dan bangga membangun Virtual Office 2D Pixel Art yang interaktif dan nyaman dilihat.'
      },
      {
        id: 'dev-reza',
        name: 'Reza',
        role: 'System Architect',
        dept: 'tech',
        nameTriggers: [/\breza\b/i],
        topicTriggers: [/arsitektur/i, /microservices/i, /high\s*availability/i, /failover/i],
        persona: 'Anda adalah Reza, System Architect Seventhsoft. Anda visioner, suka memikirkan arsitektur microservices dan sistem failover database jangka panjang.'
      },
      {
        id: 'dev-aris',
        name: 'Aris',
        role: 'AI & LLM Engineer',
        dept: 'tech',
        nameTriggers: [/\baris\b/i],
        topicTriggers: [/prompt\s*engineering/i, /model\s*ai/i, /fine\s*tuning/i, /uu\s*pdp/i],
        persona: 'Anda adalah Aris, AI & LLM Engineer Seventhsoft. Anda antusias dengan perkembangan model LLM, prompt engineering, dan penerapan etika AI privasi data.'
      },
      {
        id: 'dev-bambang',
        name: 'Bambang',
        role: 'Database Administrator',
        dept: 'tech',
        nameTriggers: [/\bbambang\b/i],
        topicTriggers: [/\bdatabase\b/i, /\bquery\b/i, /\bindexing\b/i, /\bsql\b/i, /tabel\s*jurnal/i],
        persona: 'Anda adalah Bambang, Database Administrator Seventhsoft. Anda teliti, menjaga kestabilan query General Ledger, indexing database, dan backup otomatis.'
      },
      {
        id: 'dev-yoga',
        name: 'Yoga',
        role: 'IT Support & Infra',
        dept: 'tech',
        nameTriggers: [/\byoga\b/i],
        topicTriggers: [/\bserver\b/i, /\blan\b/i, /\bkabel\b/i, /\bjaringan\b/i, /\btemperatur\b/i, /\brouter\b/i],
        persona: 'Anda adalah Yoga, IT Support & Infra Seventhsoft. Anda sigap, praktis, suka memastikan temperatur ruang server stabil 20°C dan kabel jaringan LAN rapi.'
      },
      {
        id: 'dev-deni',
        name: 'Deni',
        role: 'DevOps & Cloud Engineer',
        dept: 'tech',
        nameTriggers: [/\bdeni\b/i],
        topicTriggers: [/\bdevops\b/i, /\bdocker\b/i, /\bssl\b/i, /\bcaddy\b/i, /\bvps\b/i, /\buptime\b/i],
        persona: 'Anda adalah Deni, DevOps & Cloud Engineer Seventhsoft. Anda siaga mengawal container Docker, sertifikat SSL HTTPS Caddy, dan VPS tetap hijau 100% uptime.'
      },
      {
        id: 'dev-clara',
        name: 'Clara',
        role: 'QA & Test Automation',
        dept: 'tech',
        nameTriggers: [/\bclara\b/i],
        topicTriggers: [/\bqa\b/i, /\btesting\b/i, /test\s*suite/i, /regression/i],
        persona: 'Anda adalah Clara, QA Tester Seventhsoft. Anda detail-oriented dan gigih memastikan semua alur posting jurnal bebas bug sebelum digunakan pengguna.'
      },
      {
        id: 'dev-adit',
        name: 'Adit',
        role: 'Cybersecurity Engineer',
        dept: 'tech',
        nameTriggers: [/\badit\b/i],
        topicTriggers: [/keamanan/i, /cyber/i, /enkripsi/i, /penetrasi/i],
        persona: 'Anda adalah Adit, Cybersecurity Engineer Seventhsoft. Anda punya intuisi protektif yang kuat dalam menjaga enkripsi dan integritas sistem dari ancaman siber.'
      },
      {
        id: 'dev-fikri',
        name: 'Fikri',
        role: 'Mobile App Developer',
        dept: 'tech',
        nameTriggers: [/\bfikri\b/i],
        topicTriggers: [/\bmobile\b/i, /\bandroid\b/i, /aplikasi\s*hp/i, /notifikasi\s*hp/i],
        persona: 'Anda adalah Fikri, Mobile App Developer Seventhsoft. Anda bersemangat merancang aplikasi mobile approval akuntansi agar manajer bisa approve dari mana saja.'
      },
      {
        id: 'biz-farhan',
        name: 'Farhan',
        role: 'Product Manager',
        dept: 'product',
        nameTriggers: [/\bfarhan\b/i, /\bpm\b/i],
        topicTriggers: [/product\s*manager/i, /\broadmap\b/i, /\bsprint\b/i, /fitur\s*baru/i],
        persona: 'Anda adalah Farhan, Product Manager Seventhsoft. Anda teratur, komunikatif, dan fokus memastikan roadmap fitur akuntansi v3.2 dieksekusi tepat waktu.'
      },
      {
        id: 'biz-lina',
        name: 'Lina',
        role: 'UI/UX Designer',
        dept: 'product',
        nameTriggers: [/\blina\b/i],
        topicTriggers: [/\bui\b/i, /\bux\b/i, /desain/i, /prototipe/i],
        persona: 'Anda adalah Lina, UI/UX Designer Seventhsoft. Anda empatik, merancang antarmuka sistem pembukuan yang nyaman di mata para akuntan yang bekerja seharian.'
      },
      {
        id: 'biz-tania',
        name: 'Tania',
        role: 'Customer Success',
        dept: 'product',
        nameTriggers: [/\btania\b/i],
        topicTriggers: [/\bcs\b/i, /customer/i, /keluhan/i, /onboarding/i],
        persona: 'Anda adalah Tania, Customer Success Seventhsoft. Anda sabar dan solutif mendampingi klien akuntan baru saat migrasi data atau belajar fitur baru.'
      },
      {
        id: 'biz-putri',
        name: 'Putri',
        role: 'Technical Writer',
        dept: 'product',
        nameTriggers: [/\bputri\b/i],
        topicTriggers: [/\bsop\b/i, /dokumentasi/i, /panduan/i, /manual/i],
        persona: 'Anda adalah Putri, Technical Writer Seventhsoft. Anda mahir menerjemahkan prosedur teknis akuntansi menjadi buku panduan SOP yang mudah dipahami siapa saja.'
      },
      {
        id: 'lobby-bella',
        name: 'Bella',
        role: 'Front Desk Receptionist',
        dept: 'lounge',
        nameTriggers: [/\bbella\b/i],
        topicTriggers: [/\bresepsionis\b/i, /\blobby\b/i, /\btamu\b/i, /front\s*desk/i, /\bbuku\s*tamu\b/i],
        persona: 'Anda adalah Bella, Receptionist Front Desk Seventhsoft. Anda anggun, ramah, dan selalu tersenyum menyambut tamu dan klien korporasi di lobi utama kantor.'
      },
      {
        id: 'lounge-gilang',
        name: 'Gilang',
        role: 'Staff Lounge',
        dept: 'lounge',
        nameTriggers: [/\bgilang\b/i],
        topicTriggers: [/santai/i, /istirahat/i, /main\s*game/i, /rehat/i],
        persona: 'Anda adalah Gilang, staf kantor yang santai. Anda suka rehat sejenak di sofa lounge sambil main konsol game atau bermain bersama maskot kucing Gitcat.'
      },
      {
        id: 'staff-siti-jalan',
        name: 'Siti',
        role: 'Staff Keuangan',
        dept: 'lounge',
        nameTriggers: [/\bsiti\b/i],
        topicTriggers: [/kas\s*kecil/i, /petty\s*cash/i],
        persona: 'Anda adalah Siti, staf administrasi keuangan operasional yang rapi mengarsipkan kuitansi kas kecil dan nota operasional harian.'
      },
      {
        id: 'biz-bagus',
        name: 'Bagus',
        role: 'Enterprise Sales & AI Assistant',
        dept: 'product',
        nameTriggers: [/\bbagus\b/i],
        topicTriggers: [/\bsales\b/i, /\bdemo\b/i, /\bproposal\b/i, /\bkorporasi\b/i, /harga\s*paket/i, /excel/i, /laporan/i, /file/i, /dokumen/i],
        persona: 'Anda adalah Bagus, Enterprise Sales Lead & AI Assistant Seventhsoft. Anda supel, berwawasan luas tentang modul Seventhsoft, dan memiliki akses penuh untuk membuat serta mengirimkan file laporan Excel/PDF langsung sebagai attachment dokumen di chat Telegram.'
      }
    ];

    // 1. Tentukan Siapa Pegawai yang Merespons
    let targetEmp = null;

    // Prioritas A: Disebut namanya secara eksplisit (e.g. "Doni", "Kevin", "Koko", "Mbak Nadia")
    targetEmp = EMPLOYEES.find(e => e.nameTriggers && e.nameTriggers.some(rgx => rgx.test(text)));

    // Prioritas B: Topik spesifik yang jelas (e.g. "slip gaji", "kopi", "server", "piutang")
    if (!targetEmp) {
      targetEmp = EMPLOYEES.find(e => e.topicTriggers && e.topicTriggers.some(rgx => rgx.test(text)));
    }

    // Prioritas C: Pertanyaan lanjutan / Follow-up (e.g. "kapan jadinya?", "bulan kemarin ada?", "siapa aja?")
    if (!targetEmp && chatId) {
      const lastEmpId = this.lastActiveEmployees.get(chatId);
      if (lastEmpId) {
        targetEmp = EMPLOYEES.find(e => e.id === lastEmpId);
      }
    }

    // Fallback default: Bagus (Enterprise Sales & AI Assistant)
    if (!targetEmp) {
      targetEmp = EMPLOYEES.find(e => e.id === 'biz-bagus') || EMPLOYEES[0];
    }

    // Simpan konteks pegawai aktif untuk chat ini
    if (chatId) {
      this.lastActiveEmployees.set(chatId, targetEmp.id);
    }

    // Ambil riwayat chat sebelumnya untuk chat ini
    const chatHistory = (chatId ? this.chatHistories.get(chatId) : null) || [];

    // 2. Tanyakan ke LLM Cerdas (DeepSeek / Gemini) dengan persona pegawai & riwayat percakapan
    try {
      const ai = await LLMService.askAI(text, {
        characterName: targetEmp.name,
        characterRole: targetEmp.role,
        personaDetails: `${targetEmp.persona}\n${timeContext}`,
        history: chatHistory.slice(-8)
      });

      if (ai && ai.text) {
        // Simpan pesan ke memori percakapan
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: ai.text });
        if (chatHistory.length > 20) chatHistory.splice(0, chatHistory.length - 20);
        if (chatId) this.chatHistories.set(chatId, chatHistory);

        return {
          empId: targetEmp.id,
          name: targetEmp.name,
          role: targetEmp.role,
          speech: ai.text
        };
      }
    } catch (e) {
      console.warn('[TelegramBot] LLM Service error, beralih ke fallback cerdas:', e.message);
    }

    // 3. Fallback Cerdas Kontekstual jika LLM offline (Bukan satu kalimat template kaku!)
    let fallbackText = `Halo ${callerName}! Saya ${targetEmp.name} (${targetEmp.role}) dari Seventhsoft. Ada yang bisa saya bantu terkait tugas dan operasional hari ini?`;
    if (targetEmp.id === 'staff-doni') {
      if (/gaji|payroll|rekap|pdf|slip|bulan\s*kemarin/i.test(text)) {
        fallbackText = `Siap Pak ${callerName}! Dokumen rekapitulasi gaji karyawan periode September 2026 (bulan kemarin) sudah saya siapkan dan lampirkan langsung di chat ini ya Pak. Seluruh rincian BPJS dan PPh 21 sudah tervalidasi rapi.`;
      } else {
        fallbackText = `Halo ${callerName}! Saya Doni, Payroll Specialist Seventhsoft. Urusan slip gaji, potongan BPJS Ketenagakerjaan/Kesehatan, dan perhitungan PPh 21 karyawan siap saya bantu.`;
      }
    } else if (targetEmp.id === 'cafe-koko') {
      fallbackText = `Siap ${callerName}! Kopi espresso dan aneka minuman segar siap diseduh di pantry. Mau dibikinkan latte atau americano hari ini?`;
    } else if (targetEmp.id === 'staff-maya') {
      fallbackText = `Siap ${callerName}. Jejak audit SHA-256 dan kepatuhan transaksi pembukuan General Ledger kami monitor secara berkala untuk menjaga integritas data.`;
    }

    return {
      empId: targetEmp.id,
      name: targetEmp.name,
      role: targetEmp.role,
      speech: fallbackText
    };
  }

  async sendCustomMessage(chatId, htmlText) {
    const { token } = this.getCredentials();
    if (!token || !chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlText,
          parse_mode: 'HTML'
        })
      });
    } catch (e) {
      console.error('Gagal kirim custom message ke Telegram:', e.message);
    }
  }

  stopPolling() {
    this.isPolling = false;
    if (this.pollInterval) clearTimeout(this.pollInterval);
  }
}

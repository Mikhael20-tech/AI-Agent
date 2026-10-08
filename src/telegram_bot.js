import { db } from './database.js';

export class TelegramBotService {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.pollInterval = null;
    this.lastUpdateId = 0;
    this.isPolling = false;
  }

  getCredentials() {
    const settings = db.getSettings();
    return {
      token: process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token || '',
      chatId: process.env.TELEGRAM_CHAT_ID || settings.telegram_chat_id || ''
    };
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
   * Background polling untuk menerima respons klik tombol dari Telegram nyata
   */
  startPolling() {
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

            // Handle pesan chat teks (Interaksi dialog dua arah dengan 30 pegawai)
            if (update.message && update.message.text) {
              const rawText = update.message.text.trim();
              const chatId = update.message.chat.id;
              const fromUser = update.message.from;

              if (rawText === '/start') {
                await this.sendCustomMessage(chatId, `🤖 <b>Halo Finance Lead (${fromUser.first_name || 'Bpk. Mikhael'})!</b>\n\nSelamat datang di Bot Resmi <b>AI Agent Akuntansi Seventhsoft</b>.\n\n✨ <b>Apa saja yang bisa Anda lakukan:</b>\n1. Menerima & mengotorisasi draf transaksi secara aman <i>(Four-Eyes Principle)</i>.\n2. Mengobrol langsung dengan 30 staf kantor! (Contoh: ketik <i>"Gimana kabarmu Bagus"</i>, <i>"Halo Kevin"</i>, <i>"Koko minta kopi"</i>, atau <i>"Budi antar berkas"</i>).`);
                continue;
              }

              const reply = this.generateEmployeeResponse(rawText, fromUser);
              if (reply) {
                // Pancarkan event ke Virtual Office 3D via WebSocket
                this.eventBus.emit('employee_speech', {
                  empId: reply.empId,
                  name: reply.name,
                  role: reply.role,
                  speech: reply.speech,
                  fromUser: fromUser.first_name || 'Finance Lead'
                });

                // Kirim balasan Telegram
                await this.sendCustomMessage(chatId, `💬 <b>${reply.name} (${reply.role}):</b>\n"${reply.speech}"`);
              }
            }
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

  generateEmployeeResponse(text, fromUser) {
    const lower = text.toLowerCase();
    const callerName = fromUser ? (fromUser.first_name || 'Pak') : 'Pak';

    if (lower.includes('bagus')) {
      return {
        empId: 'biz-bagus',
        name: 'Bagus',
        role: 'Enterprise Sales Lead',
        speech: `Baik ${callerName}! Alhamdulillah lancar, ini saya lagi siapin proposal demo sistem Seventhsoft buat 3 klien korporasi baru. Bapak butuh bantuan laporan penjualan?`
      };
    }

    if (lower.includes('doni') || lower.includes('payroll') || lower.includes('gaji')) {
      return {
        empId: 'staff-doni',
        name: 'Doni',
        role: 'Payroll Specialist',
        speech: `Halo ${callerName}! Kabar baik. Saya sedang memproses rekapitulasi slip gaji dan perhitungan PPh 21 karyawan bulan ini.`
      };
    }

    if (lower.includes('yoga') || lower.includes('infra') || lower.includes('jaringan')) {
      return {
        empId: 'dev-yoga',
        name: 'Yoga',
        role: 'IT Support & Infra',
        speech: `Siap ${callerName}, kabar baik! Jaringan LAN dan server Seventhsoft stabil, temperatur ruang server aman 21°C.`
      };
    }

    if (lower.includes('kevin')) {
      return {
        empId: 'dev-kevin',
        name: 'Kevin',
        role: 'Lead Backend Engineer',
        speech: `Aman dan sehat ${callerName}! REST API Seventhsoft berjalan lancar 99.9%, webhook n8n juga aktif stabil. Sedang memantau query transaksi General Ledger.`
      };
    }

    if (lower.includes('sarah')) {
      return {
        empId: 'dev-sarah',
        name: 'Sarah',
        role: 'Frontend React Engineer',
        speech: `Halo ${callerName}! Kabar baik, ini saya lagi optimasi dashboard Virtual Office 3D biar makin interaktif dan ringan di layar Bapak.`
      };
    }

    if (lower.includes('reza') || lower.includes('architect')) {
      return {
        empId: 'dev-reza',
        name: 'Reza',
        role: 'System Architect',
        speech: `Halo ${callerName}! Kabar baik, saya lagi menyusun blueprint high-availability microservices Seventhsoft agar siap menampung ribuan transaksi simultan.`
      };
    }

    if (lower.includes('aris') || lower.includes('llm') || lower.includes('ai engineer')) {
      return {
        empId: 'dev-aris',
        name: 'Aris',
        role: 'AI & LLM Engineer',
        speech: `Baik ${callerName}! Model OCR dan sanitasi data pribadi (UU PDP) berjalan dengan akurasi 99.4% pada modul ekstraksi invoice.`
      };
    }

    if (lower.includes('bambang') || lower.includes('database') || lower.includes('db')) {
      return {
        empId: 'dev-bambang',
        name: 'Bambang',
        role: 'Database Administrator',
        speech: `Halo ${callerName}! Query General Ledger Seventhsoft sudah dioptimasi, indexing tabel jurnal berjalan mulus tanpa beban berat.`
      };
    }

    if (lower.includes('deni') || lower.includes('devops') || lower.includes('cloud')) {
      return {
        empId: 'dev-deni',
        name: 'Deni',
        role: 'DevOps & Cloud Engineer',
        speech: `Aman ${callerName}! Container Docker di VPS, sertifikat SSL Caddy, dan webhook n8n terpantau hijau 100% uptime.`
      };
    }

    if (lower.includes('clara') || lower.includes('qa') || lower.includes('tester')) {
      return {
        empId: 'dev-clara',
        name: 'Clara',
        role: 'QA & Test Automation',
        speech: `Kabar baik ${callerName}! Seluruh 48 test suite otomatis untuk siklus posting jurnal transaksi lulus 100% tanpa error.`
      };
    }

    if (lower.includes('fikri') || lower.includes('mobile') || lower.includes('android')) {
      return {
        empId: 'dev-fikri',
        name: 'Fikri',
        role: 'Mobile App Developer',
        speech: `Halo ${callerName}! Aplikasi mobile approval akuntansi sedang kami sinkronisasi agar notifikasi persetujuan transaksi muncul instan di smartphone.`
      };
    }

    if (lower.includes('adit') || lower.includes('security') || lower.includes('cyber')) {
      return {
        empId: 'dev-adit',
        name: 'Adit',
        role: 'Cybersecurity Engineer',
        speech: `Siap ${callerName}! Enkripsi hash SHA-256 pada audit trail transaksi terlindungi ketat sesuai standar UU ITE.`
      };
    }

    if (lower.includes('budi') || lower.includes('kurir')) {
      return {
        empId: 'staff-budi-kurir',
        name: 'Budi',
        role: 'Kurir Berkas Akuntansi',
        speech: `Siap ${callerName}, kabar baik! Ini saya baru selesai antar tumpukan map invoice dari meja Entry ke meja Finance Lead.`
      };
    }

    if (lower.includes('koko') || lower.includes('kopi') || lower.includes('barista')) {
      return {
        empId: 'cafe-koko',
        name: 'Koko',
        role: 'Barista Pantry',
        speech: `Kabar baik dan semangat ${callerName}! Kopi espresso hangat sudah siap di pantry. Mau saya buatkan americano atau latte hari ini?`
      };
    }

    if (lower.includes('maya') || lower.includes('auditor') || lower.includes('audit')) {
      return {
        empId: 'staff-maya',
        name: 'Maya',
        role: 'Senior Auditor',
        speech: `Kabar baik ${callerName}. Sedang mereview jejak audit SHA-256 dan kepatuhan UU ITE untuk pembukuan transaksi minggu ini.`
      };
    }

    if (lower.includes('rian') || lower.includes('faktur')) {
      return {
        empId: 'staff-rian',
        name: 'Rian',
        role: 'Staf Pajak e-Faktur',
        speech: `Baik ${callerName}! Sedang merekap e-Faktur PPN 11% dan bukti potong PPh 23 untuk draf laporan perpajakan.`
      };
    }

    if (lower.includes('dimas')) {
      return {
        empId: 'staff-dimas',
        name: 'Dimas',
        role: 'Junior Accountant',
        speech: `Kabar baik ${callerName}! Sedang mencocokkan fisik surat jalan vendor dengan draf pembelian di Seventhsoft.`
      };
    }

    if (lower.includes('nadia') || lower.includes('ar') || lower.includes('piutang') || lower.includes('billing')) {
      return {
        empId: 'staff-nadia',
        name: 'Nadia',
        role: 'Billing & AR Specialist',
        speech: `Kabar baik ${callerName}! Monitor piutang dagang berjalan tertib, reminder otomatis ke klien yang mendekati tempo sudah siap dikirim.`
      };
    }

    if (lower.includes('farhan') || lower.includes('pm') || lower.includes('product manager')) {
      return {
        empId: 'biz-farhan',
        name: 'Farhan',
        role: 'Product Manager',
        speech: `Kabar baik ${callerName}! Roadmap fitur automasi Seventhsoft v3.2 sudah final dan siap masuk sprint engineering minggu depan.`
      };
    }

    if (lower.includes('lina') || lower.includes('ui') || lower.includes('ux') || lower.includes('desain')) {
      return {
        empId: 'biz-lina',
        name: 'Lina',
        role: 'UI/UX Designer',
        speech: `Halo ${callerName}! Sedang merapikan prototipe antarmuka modern untuk modul stok gudang Seventhsoft biar makin intuitif.`
      };
    }

    if (lower.includes('tania') || lower.includes('cs') || lower.includes('customer')) {
      return {
        empId: 'biz-tania',
        name: 'Tania',
        role: 'Customer Success',
        speech: `Selamat beraktivitas ${callerName}! CS score kepuasan klien akuntansi kita mencapai 98.7% bulan ini, klien sangat terbantu dengan sistem AI kita.`
      };
    }

    if (lower.includes('putri') || lower.includes('writer') || lower.includes('sop') || lower.includes('dokumen')) {
      return {
        empId: 'biz-putri',
        name: 'Putri',
        role: 'Technical Writer',
        speech: `Halo ${callerName}! Dokumentasi panduan SOP Four-Eyes Principle dan audit trail AI Seventhsoft sudah saya perbarui dengan rapi.`
      };
    }

    if (lower.includes('bella') || lower.includes('resepsionis') || lower.includes('lobby')) {
      return {
        empId: 'lobby-bella',
        name: 'Bella',
        role: 'Front Desk Receptionist',
        speech: `Selamat beraktivitas ${callerName}! Di lobby depan saat ini aman dan kondusif, siap menyambut kunjungan tamu atau klien.`
      };
    }

    if (lower.includes('gilang') || lower.includes('game') || lower.includes('santai')) {
      return {
        empId: 'lounge-gilang',
        name: 'Gilang',
        role: 'Staff Lounge',
        speech: `Haha baik dan santai ${callerName}! Lagi istirahat sejenak di sofa lounge sambil refresh otak setelah audit tadi.`
      };
    }

    if (lower.includes('bu ani') || lower.includes('ani') || lower.includes('makan') || lower.includes('snack')) {
      return {
        empId: 'cafe-buan',
        name: 'Bu Ani',
        role: 'Chef Kantin',
        speech: `Kabar baik ${callerName}! Snack sehat dan kue sore hangat sudah siap di kantin, monggo mampir ${callerName}!`
      };
    }

    if (lower.includes('siti')) {
      return {
        empId: 'staff-siti-jalan',
        name: 'Siti',
        role: 'Staff Keuangan',
        speech: `Halo ${callerName}! Kabar baik, ini saya tadi habis ambil air di dispenser pantry sambil antar map kas kecil ke divisi akuntansi.`
      };
    }

    if (lower.includes('mikhael') || lower.includes('lead finance') || lower.includes('approver')) {
      return {
        empId: 'lead-finance',
        name: 'Mikhael',
        role: 'Finance Lead (Approver GL)',
        speech: `Halo ${callerName}! Standar Four-Eyes Principle aktif penuh: saya memvalidasi setiap draf sebelum diotorisasi ke General Ledger Seventhsoft.`
      };
    }

    if (lower.includes('entry') || lower.includes('ocr') || lower.includes('invoice')) {
      return {
        empId: 'agent-entry',
        name: 'AI-Agent 01',
        role: 'Data Entry & OCR',
        speech: `Modul ekstraksi invoice aktif. Perlindungan data pribadi NIK & NPWP (UU PDP) siap diterapkan pada setiap faktur masuk.`
      };
    }

    if (lower.includes('rekon') || lower.includes('bank')) {
      return {
        empId: 'agent-rekon',
        name: 'AI-Agent 02',
        role: 'Reconciliation Agent',
        speech: `Status audit normal. Tidak ditemukan selisih nominal mencurigakan antara rekening koran BCA dan buku kas Seventhsoft.`
      };
    }

    if (lower.includes('pajak') || lower.includes('ppn') || lower.includes('margin')) {
      return {
        empId: 'agent-pajak',
        name: 'AI-Agent 03',
        role: 'Tax & Reporting Analyst',
        speech: `Perhitungan proyeksi PPN Keluaran vs Masukan terverifikasi seimbang. Margin laba kotor dalam batas aman.`
      };
    }

    // Default ramah jika menyapa umum
    return {
      empId: 'biz-bagus',
      name: 'Bagus',
      role: 'Enterprise Sales',
      speech: `Baik ${callerName}! Seluruh 30 staf di Kantor AI Seventhsoft dalam keadaan aktif dan siap membantu. Bapak mau bicara dengan Doni, Yoga, Kevin, Sarah, atau siapa?`
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

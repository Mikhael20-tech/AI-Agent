import { db } from './database.js';
import { LLMService } from './llm_service.js';
import { sendFileToTelegram, sendVoiceToTelegram, generateIndonesianTtsAudio } from './send_telegram_file.js';
import { ReportGenerator } from './report_generator.js';
import { OCRService } from './ocr_service.js';

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
    const token = (process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token || '').trim().replace(/^["']|["']$/g, '');
    const chatId = (process.env.TELEGRAM_CHAT_ID || settings.telegram_chat_id || '').trim().replace(/^["']|["']$/g, '');
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
        approver: approverName,
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
        approver: approverName,
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
        }).catch(() => {});

        // Ubah tombol inline menjadi status badge permanen agar rapi dan tidak bisa di-klik dua kali
        if (result.success && cq.message?.message_id) {
          const badgeText = result.action === 'APPROVED'
            ? `✅ Disetujui oleh ${result.approver || 'Finance Lead'}`
            : `❌ Ditolak oleh ${result.approver || 'Finance Lead'}`;
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              reply_markup: {
                inline_keyboard: [
                  [{ text: badgeText, callback_data: 'ALREADY_PROCESSED' }]
                ]
              }
            })
          }).catch(() => {});
        }

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
          }).catch(() => {});
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
          const photoObj = Array.isArray(update.message.photo) ? update.message.photo.slice(-1)[0] : null;
          const docName = update.message.document?.file_name || `Nota_Scan_${Date.now()}.jpg`;
          const fileId = update.message.document?.file_id || photoObj?.file_id;
          const isPhoto = !!photoObj || /\.(png|jpe?g|webp|bmp)$/i.test(docName);
          let rawDocText = caption;

          // Unduh lampiran dari server Telegram (baik dokumen teks maupun foto struk)
          if (fileId) {
            try {
              const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
              const fileInfo = await fileInfoRes.json();
              if (fileInfo.ok && fileInfo.result?.file_path) {
                const dlUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
                const fileRes = await fetch(dlUrl);
                const arrayBuf = await fileRes.arrayBuffer();
                const fileBuf = Buffer.from(arrayBuf);

                if (fileInfo.result.file_path.endsWith('.txt') || fileInfo.result.file_path.endsWith('.csv')) {
                  rawDocText = fileBuf.toString('utf8');
                } else if (isPhoto) {
                  // Jalankan OCR pada foto kuitansi/struk
                  await this.sendChatAction(chatId, 'typing');
                  await this.sendCustomMessage(chatId, `🔍 <i>Menjalankan Optical Character Recognition (OCR) pada foto struk...</i>`);
                  const ocrText = await OCRService.extractTextFromImage(fileBuf);
                  if (ocrText && ocrText.length > 5) {
                    rawDocText = (rawDocText ? rawDocText + '\n' : '') + ocrText;
                  }
                }
              }
            } catch (dlErr) {
              console.warn('Gagal mengunduh atau membaca lampiran file Telegram:', dlErr.message);
            }
          }

          if (!rawDocText) {
            rawDocText = `Faktur Pembelian Pengadaan Operasional ${docName}`;
          }

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

        // Periksa riwayat chat untuk mendeteksi konfirmasi atas tawaran file/grafik sebelumnya
        const chatHistory = (chatId ? this.chatHistories.get(chatId) : null) || [];
        const lastAssistantMsg = [...chatHistory].reverse().find(m => m.role === 'assistant')?.content || '';
        const prevOfferedFile = /(excel|xlsx|spreadsheet|pdf|dokumen|rekap|laporan|rincian|gambar|grafik|chart|diagram)/i.test(lastAssistantMsg) && /(buat|kirim|lampirkan|mau|siapkan|bikin)/i.test(lastAssistantMsg);
        
        // Cek apakah pesan user adalah permintaan eksplisit
        const rawHasPpt = /\b(ppt|pptx|powerpoint|slide|presentasi)\b/i.test(rawText);
        const rawHasImage = /(gambar|grafik|chart|diagram|infografis|visual|plot|skema)/i.test(rawText);
        const rawHasPayroll = /\b(gaji|payroll|upah|slip|tunjangan|bpjs|pph\s*21)\b/i.test(rawText);
        const rawHasPdf = /\b(pdf|dokumen)\b/i.test(rawText);
        const rawHasExcel = /\b(excel|xlsx|spreadsheet)\b/i.test(rawText);
        const rawHasCalendar = /\b(kalender|jadwal|calendar|schedule|jadwal\s*konten|plan\s*konten)\b/i.test(rawText);
        const rawHasVoice = /\b(voice|vn|suara|audio|pesan suara|bicara|ngomong|bicaralah|dengarkan)\b/i.test(rawText) || rawText.startsWith('/voice');
        const rawHasDocGeneral = /(rekap|laporan|export|unduh|download|minta.*file|kirim.*file|buatkan.*file)/i.test(rawText);

        const hasExplicitSubject = rawHasPpt || rawHasImage || rawHasPayroll || rawHasPdf || rawHasExcel || rawHasCalendar || /(pajak|penjualan|rekon|audit|faktur)/i.test(rawText);
        const userAgrees = /^(ya|ya\s+tolong|boleh|ok|oke|siap|kirim|buatkan|tolong|silakan|minta|lanjut|bikin)/i.test(rawText.trim()) || /(buatkan\s*ya|tolong\s*buatkan|kirimkan|minta\s*tolong)/i.test(rawText);

        const isImageRequest = rawHasImage || (!hasExplicitSubject && /(gambar|grafik|chart|diagram)/i.test(lastAssistantMsg) && userAgrees);
        const isDirectRequest = rawHasPpt || rawHasImage || rawHasPayroll || rawHasPdf || rawHasExcel || rawHasCalendar || rawHasDocGeneral;
        const isRequestingFile = isDirectRequest || (prevOfferedFile && userAgrees);

        const chatActionType = rawHasVoice ? 'record_voice' : (isImageRequest ? 'upload_photo' : (isRequestingFile ? 'upload_document' : 'typing'));
        await this.sendChatAction(chatId, chatActionType);

        // Deteksi jika user mengajak traktir kopi / ngantri
        if (/traktir.*kopi|ngantri|antre|kopi\s*semua|kopi\s*bareng|ngopi\s*semua/i.test(rawText)) {
          console.log(`[TELEGRAM EVENT] Triggering coffee queue event from ${fromUser?.first_name || 'Finance Lead'}`);
          this.eventBus.emit('coffee_queue', { initiator: fromUser?.first_name || 'Finance Lead' });
        }

        let fileSent = false;
        const sendRequestedFile = async (contextText) => {
          if (fileSent) return;
          try {
            // Jika rawText sudah memiliki topik eksplisit, jangan biarkan contextText lama merancukan
            const effectiveText = hasExplicitSubject ? `${rawText} ${contextText}` : contextText;

            const wantsPpt = rawHasPpt || /\b(ppt|pptx|powerpoint|slide|presentasi)\b/i.test(effectiveText);
            const wantsCalendar = rawHasCalendar || /\b(kalender|jadwal|calendar|schedule)\b/i.test(effectiveText);
            const wantsImage = rawHasImage || (!rawHasPayroll && !rawHasPdf && !rawHasExcel && !rawHasCalendar && /(gambar|grafik|chart|diagram|infografis|visual|plot|skema)/i.test(effectiveText));
            const isPayroll = rawHasPayroll || /\b(gaji|payroll|upah|slip|tunjangan|bpjs|pph\s*21)\b/i.test(effectiveText);
            const wantsPdf = rawHasPdf || /\b(pdf|dokumen)\b/i.test(effectiveText);
            const wantsExcel = rawHasExcel || /\b(excel|xlsx|spreadsheet|tabel|rekap)\b/i.test(effectiveText);

            if (wantsCalendar) {
              console.log(`[TELEGRAM CALENDAR EXCEL] Mengenerate file Kalender Konten 30 Hari untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
              const calendarPath = ReportGenerator.generateContentCalendarExcel();
              const caption = `📅 <b>Kalender Konten Sosmed 30 Hari Seventhsoft (EXCEL)</b>\nPeriode: November 2026\n3 Sheet: Kalender_30_Hari, Pilar_dan_KPI, SOP_Produksi.\nDisiapkan oleh Bagus Pratama (Enterprise Sales & AI Content Lead).`;
              await sendFileToTelegram(calendarPath, caption, chatId);
              fileSent = true;
            } else if (wantsPpt) {
              console.log(`[TELEGRAM PPT GENERATE] Mengenerate file PPTX presentasi untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
              const pptPath = await ReportGenerator.generateFraudPreventionPptx('Strategi Pencegahan Pencurian Keuangan');
              const caption = `📊 <b>File Presentasi PowerPoint (.PPTX) Siap Pakai</b>\nJudul: <i>Strategi Pencegahan Pencurian Keuangan & Kontrol Internal</i>\nTotal: 8 Slide Profesional (Bisa Langsung Diedit di PowerPoint / Google Slides)\nDisiapkan otomatis oleh Bagus Pratama (Enterprise Sales Lead).`;
              await sendFileToTelegram(pptPath, caption, chatId);
              fileSent = true;
            } else if (wantsImage) {
              let chartType = 'region';
              if (/garis|line/i.test(effectiveText)) chartType = 'line';
              else if (/pie|donut|doughnut|lingkaran/i.test(effectiveText)) chartType = 'doughnut';
              else if (/produk|modul|paket/i.test(effectiveText)) chartType = 'product';
              else if (/tren|harian|minggu/i.test(effectiveText)) chartType = 'trend';

              console.log(`[TELEGRAM CHART GENERATE] Mengenerate gambar grafik (${chartType}) untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
              const filePath = await ReportGenerator.generateChartImage(chartType, effectiveText);

              let chartLabel = 'REGION';
              if (chartType === 'line') chartLabel = 'GARIS';
              else if (chartType === 'doughnut') chartLabel = 'KOMPOSISI DONUT';
              else if (chartType === 'product') chartLabel = 'PER PRODUK';
              else if (chartType === 'trend') chartLabel = 'TREN MINGGUAN';

              const caption = `📈 <b>Grafik Visual Penjualan Seventhsoft (${chartLabel})</b>\nPeriode: September 2026 (Total Omset: Rp 1,2 Miliar)\nDisiapkan oleh Bagus Pratama (Enterprise Sales Lead).`;
              await sendFileToTelegram(filePath, caption, chatId);
              fileSent = true;
            } else if (isPayroll) {
              const wantsBoth = (wantsPdf && wantsExcel) || /(pdf.*excel|excel.*pdf)/i.test(effectiveText);

              if (wantsBoth) {
                console.log(`[TELEGRAM PAYROLL BOTH] Mengenerate file PDF dan Excel rekap gaji untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
                const pdfPath = await ReportGenerator.generatePayrollPdf();
                await sendFileToTelegram(pdfPath, `📑 <b>Rekapitulasi Gaji Karyawan Seventhsoft (PDF)</b>\nPeriode: September 2026\nBerikut dokumen resmi PDF yang disiapkan oleh Doni (Payroll Specialist) untuk Finance Lead.`, chatId);

                const excelPath = ReportGenerator.generatePayrollExcel();
                await sendFileToTelegram(excelPath, `📊 <b>Laporan Spreadsheet Payroll Seventhsoft (EXCEL)</b>\nPeriode: September 2026\nBerikut rekapitulasi data Excel slip gaji, tunjangan, potongan BPJS dan PPh 21 seluruh karyawan.`, chatId);
                fileSent = true;
              } else if (wantsPdf) {
                console.log(`[TELEGRAM PAYROLL PDF] Mengenerate file PDF rekap gaji untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
                const filePath = await ReportGenerator.generatePayrollPdf();
                const caption = `📑 <b>Rekapitulasi Gaji Karyawan Seventhsoft (PDF)</b>\nPeriode: September 2026 (Bulan Kemarin)\nBerikut dokumen rekapitulasi gaji resmi yang disiapkan oleh Doni (Payroll Specialist) untuk Finance Lead.`;
                await sendFileToTelegram(filePath, caption, chatId);
                fileSent = true;
              } else {
                console.log(`[TELEGRAM PAYROLL EXCEL] Mengenerate file Excel rekap gaji untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
                const filePath = ReportGenerator.generatePayrollExcel();
                const caption = `📊 <b>Laporan Spreadsheet Payroll Seventhsoft (EXCEL)</b>\nPeriode: September 2026\nRekapitulasi slip gaji, tunjangan, potongan BPJS dan PPh 21 seluruh karyawan.`;
                await sendFileToTelegram(filePath, caption, chatId);
                fileSent = true;
              }
            } else {
              // Laporan bisnis / transaksi
              let reportType = 'all';
              if (/rekon|bank|mutasi/i.test(effectiveText)) reportType = 'reconciliation';
              else if (/pajak|ppn|pph/i.test(effectiveText)) reportType = 'tax';
              else if (/audit|log/i.test(effectiveText)) reportType = 'audit';
              else if (/draft|faktur|pembelian|invoice/i.test(effectiveText)) reportType = 'drafts';
              else if (/penjualan|sales|omset|omzet|revenue|aplikasi|produk/i.test(effectiveText)) reportType = 'sales';

              console.log(`[TELEGRAM EXCEL EXPORT] Mengenerate file Excel (${reportType}) untuk ${fromUser?.first_name || 'User'} (${chatId})...`);
              const filePath = ReportGenerator.generateExcelReport(reportType);
              let caption = '';
              if (reportType === 'sales') {
                caption = `📊 <b>Rekapitulasi Penjualan Aplikasi Seventhsoft (EXCEL)</b>\nPeriode: September 2026\nTotal Omset: Rp 1.200.000.000 (1,2 Miliar - 120% Target).\nDisiapkan oleh Bagus Pratama (Enterprise Sales Lead).`;
              } else {
                caption = `📊 <b>Laporan Excel Seventhsoft (${reportType.toUpperCase()})</b>\nBerikut file spreadsheet yang diminta oleh ${fromUser?.first_name || 'Finance Lead'}. Data siap dianalisis.`;
              }
              await sendFileToTelegram(filePath, caption, chatId);
              fileSent = true;
            }
          } catch (fileErr) {
            console.error('Gagal mengirim file otomatis ke Telegram:', fileErr.message);
          }
        };

        if (isRequestingFile) {
          const contextForFile = hasExplicitSubject ? rawText : `${rawText} ${lastAssistantMsg}`;
          await sendRequestedFile(contextForFile);
        }

        const reply = await this.generateEmployeeResponse(rawText, fromUser, chatId);
        if (reply) {
          // Jika pegawai di pesannya mengatakan sudah melampirkan file/gambar tapi belum dikirim, kirimkan sekarang!
          if (!fileSent && /(lampirkan|dilampirkan|terlampir|berikut file|file excel.*sudah|file pdf.*sudah|gambarnya di chat|berikut gambarnya|lampirkan gambarnya)/i.test(reply.speech)) {
            await sendRequestedFile(`${rawText} ${reply.speech}`);
          }

          console.log(`[TELEGRAM CHAT BALAS] Ke ${chatId} | ${reply.name}: "${reply.speech}"`);

          // Pancarkan event ke Virtual Office via WebSocket (jika ada client terhubung)
          this.eventBus.emit('employee_speech', {
            empId: reply.empId,
            name: reply.name,
            role: reply.role,
            speech: reply.speech,
            userMessage: rawText,
            fromUser: fromUser?.first_name || 'Finance Lead'
          });

          // Kirim balasan Telegram
          await this.sendCustomMessage(chatId, `💬 <b>${reply.name} (${reply.role}):</b>\n"${reply.speech}"`);

          // Jika user meminta voice note / suara / bicara, buat audio MP3 dan kirimkan langsung!
          if (rawHasVoice) {
            try {
              await this.sendChatAction(chatId, 'record_voice');
              // Ambil maksimal 300 karakter untuk audio agar renyah dan cepat didengar
              const voiceScript = reply.speech
                .replace(/<[^>]+>/g, '')
                .replace(/[*_`#]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 320);

              const ttsResult = await generateIndonesianTtsAudio(voiceScript);
              await sendVoiceToTelegram(
                ttsResult.filePath,
                `🎙️ <b>Voice Note: ${reply.name} (${reply.role})</b>`,
                chatId
              );
              console.log(`[TELEGRAM VOICE NOTE] Berhasil dikirim ke ${chatId} (${ttsResult.filePath})`);
            } catch (vErr) {
              console.warn('[TELEGRAM VOICE NOTE] Gagal mengirim VN:', vErr.message);
            }
          }
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

    // Pastikan webhook dihapus agar polling lokal tidak terblokir conflict 409
    fetch(`https://api.telegram.org/bot${token}/deleteWebhook`)
      .catch(() => {});

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
        } else if (!data.ok) {
          if (data.error_code === 409) {
            console.warn('[Telegram] Webhook aktif terdeteksi (409 Conflict). Menghapus webhook...');
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => {});
          } else {
            console.warn('[Telegram Polling Warning]:', data.description || data);
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
  async generateEmployeeResponse(text, fromUser, chatId, forceEmpId = null) {
    const callerName = fromUser?.first_name || 'Pak Mikhael';
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    let timeState = 'jam kerja produktif';
    const isNightTime = currentHour >= 21 || currentHour < 7;
    const isAfterHours = currentHour >= 17;

    if (isNightTime) {
      timeState = 'jam malam istirahat/tidur di asrama karyawan Seventhsoft';
    } else if (currentHour >= 12 && currentHour < 13) {
      timeState = 'jam istirahat makan siang (12:00 - 13:00)';
    } else if (isAfterHours) {
      timeState = 'jam pulang kantor / santai di asrama / lembur';
    } else if (currentHour < 8) {
      timeState = 'pagi hari menjelang jam kantor';
    }

    const isTaskInstruction = /(tugas|kerjakan|tolong|cek|periksa|bantu|masuk kantor|ke kantor|lembur|bikin|buatkan|rekap|faktur|invoice|database|server|deploy|bug|fix|review)/i.test(text);

    let dormContext = '';
    if (isNightTime || isAfterHours) {
      dormContext = `\nSTATUS ASRAMA: Anda saat ini berada di Kompleks Asrama Seventhsoft (asrama putri untuk staf wanita, asrama putra untuk staf pria). Jika ini jam malam/tidur dan Anda dihubungi atau diberi tugas:
- Jika disapa/chat: Katakan Anda baru saja terbangun (hoam/kaget tapi ramah) dan menanyakan apa yang bisa dibantu.
- Jika diberi tugas/instruksi (${isTaskInstruction}): Nyatakan dengan sigap bahwa Anda langsung bangun dari kasur asrama dan segera berangkat jalan kaki ke kantor sekarang juga untuk menyelesaikannya!`;
    }

    const timeContext = `Waktu sekarang: pukul ${currentHour}:${currentMinute} WIB (${timeState}). Anda sedang mengobrol dengan ${callerName} (Finance Lead Seventhsoft).${dormContext}`;

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
        topicTriggers: [/\bkantin\b/i, /\bmenu\s*makan\b/i, /\bmakan\s*siang\b/i, /\bsnack\b/i, /\bkue\b/i, /\blapar\b/i, /\bcatering\b/i, /\bnasi\s*box\b/i],
        persona: 'Anda adalah Bu Ani, Chef Kantin Seventhsoft. Anda sosok keibuan yang hangat dan perhatian. Anda hanya mengurus menu makan siang staf, nasi box, dan snack sore di kantin kantor. Jika ditanya soal keuangan, penjualan aplikasi, gaji, atau omset, arahkan dengan ramah ke Bagus (Sales) atau Doni (Payroll) atau Hendra (Finance).'
      },
      {
        id: 'staff-maya',
        name: 'Maya',
        role: 'Senior Internal Auditor',
        dept: 'finance',
        nameTriggers: [/\bmaya\b/i],
        topicTriggers: [/\baudit\b/i, /\bauditor\b/i, /sha-?256/i, /\btemuan\b/i, /\bkejanggalan\b/i, /\bintegritas\b/i, /laporan\s*audit/i, /audit\s*trail/i],
        persona: 'Anda adalah Maya, Senior Internal Auditor Seventhsoft. Ketika diminta audit atau pengecekan transaksi ganjil, Anda LANGSUNG MENULISKAN Laporan Audit Trail resmi: Tabel Ringkasan Temuan Anomali, Analisis Potensi Fraud (Void kasir berulang, selisih mutasi), Skor Risiko (Low/Medium/High), dan Rekomendasi Tindakan Korektif untuk Finance Lead!'
      },
      {
        id: 'staff-rian',
        name: 'Rian',
        role: 'Staf Pajak e-Faktur',
        dept: 'finance',
        nameTriggers: [/\brian\b/i],
        topicTriggers: [/\bpajak\b/i, /e-?faktur\b/i, /\bppn\b/i, /pph\s*23/i, /\bspt\b/i, /hitung\s*pajak/i, /simulasi\s*pajak/i],
        persona: 'Anda adalah Rian, Staf Pajak e-Faktur di Seventhsoft. Ketika diminta perhitungan atau urusan pajak, Anda LANGSUNG MENYAJIKAN Simulasi Hitungan Pajak Rinci (DPP, PPN 11%, PPh 21/23 potongan), serta format ekspor CSV siap impor e-Faktur DJP yang akurat!'
      },
      {
        id: 'staff-nadia',
        name: 'Nadia',
        role: 'Billing & AR Specialist',
        dept: 'finance',
        nameTriggers: [/\bnadia\b/i],
        topicTriggers: [/\bpiutang\b/i, /\btagihan\b/i, /\bbilling\b/i, /\bjatuh\s*tempo\b/i, /\bar\b/i, /invoice\s*klien/i, /surat\s*tagihan/i],
        persona: 'Anda adalah Nadia, Billing & AR Specialist di Seventhsoft. Ketika diminta penagihan piutang, Anda LANGSUNG MEMBUATKAN Draf Surat Penagihan Resmi (Invoice Reminder) yang sopan namun tegas, tabel aging piutang (umur piutang 1-30, 31-60 hari), dan instruksi nomor rekening pembayaran.'
      },
      {
        id: 'staff-dimas',
        name: 'Dimas',
        role: 'Junior Accountant',
        dept: 'finance',
        nameTriggers: [/\bdimas\b/i],
        topicTriggers: [/surat\s*jalan/i, /\bfisik\s*barang/i, /\bpenerimaan\s*barang/i, /jurnal\s*akuntansi/i, /debet\s*kredit/i],
        persona: 'Anda adalah Dimas, Junior Accountant di Seventhsoft. Ketika diminta pencatatan transaksi atau jurnal akuntansi, Anda LANGSUNG MENULISKAN Jurnal Debet/Kredit standar Seventhsoft lengkap dengan nomor COA (Contoh: Debet 1-1300 Persediaan, Kredit 2-1100 Hutang Usaha) dan catatan fisik barang.'
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
        persona: 'Anda adalah Tari, Spesialis Data Entry & OCR di Seventhsoft. Anda membaca faktur vendor dengan cepat dan otomatis menyamarkan data sensitif NIK/NPWP sesuai UU PDP No. 27/2022.'
      },
      {
        id: 'agent-rekon',
        name: 'Bayu',
        role: 'Spesialis Rekonsiliasi Bank',
        dept: 'finance',
        nameTriggers: [/\bbayu\b/i, /\brekon\b/i],
        topicTriggers: [/rekonsiliasi\s*bank/i, /\bbca\b/i, /rekening\s*koran/i, /\bmutasi\b/i],
        persona: 'Anda adalah Bayu, Spesialis Rekonsiliasi Bank di Seventhsoft. Ketika diminta rekonsiliasi, Anda LANGSUNG MENYAJIKAN Tabel Rekonsiliasi Bank (Saldo Kas Seventhsoft vs Saldo Rekening Koran Bank, Outstanding Check, Deposit in Transit, dan Status Selisih Rp 0).'
      },
      {
        id: 'agent-pajak',
        name: 'Citra',
        role: 'Analis Pajak & Margin',
        dept: 'finance',
        nameTriggers: [/\bcitra\b/i, /\banalis\s*pajak\b/i],
        topicTriggers: [/proyeksi\s*ppn/i, /anomali\s*hpp/i, /\bmargin\b/i],
        persona: 'Anda adalah Citra, Analis Pajak & Margin Seventhsoft. Ketika diminta analisis margin, Anda LANGSUNG MENYAJIKAN Analisis Rasio Profit Margin, titik impas (BEP), dan deteksi anomali kenaikan HPP produk.'
      },
      {
        id: 'dev-kevin',
        name: 'Kevin',
        role: 'Lead Backend Engineer',
        dept: 'tech',
        nameTriggers: [/\bkevin\b/i],
        topicTriggers: [/\bbackend\b/i, /\brest\s*api\b/i, /\bendpoint\b/i, /\bwebhook\b/i, /\bn8n\b/i, /bikin\s*api/i, /buat\s*api/i, /server\s*code/i],
        persona: 'Anda adalah Kevin, Lead Backend Engineer Seventhsoft. Anda ahli Node.js, Express, PostgreSQL, dan n8n. Ketika diminta membuat API, endpoint, logika backend, autentikasi JWT, atau webhook integrasi, Anda LANGSUNG MENULISKAN KODE LENGKAP Express.js / Node.js yang fungsional, bersih, ada validasi, error handling, dan siap dijalankan!'
      },
      {
        id: 'dev-sarah',
        name: 'Sarah',
        role: 'Senior Frontend & Web Developer',
        dept: 'tech',
        nameTriggers: [/\bsarah\b/i],
        topicTriggers: [/\bfrontend\b/i, /\breact\b/i, /\bweb\b/i, /bikin\s*web/i, /buat\s*web/i, /landing\s*page/i, /\bkomponen\b/i, /\btailwind\b/i, /\bhtml\b/i, /\bcss\b/i, /tampilan\b/i, /dashboard\s*ui/i, /virtual\s*office/i, /\bcanvas\b/i],
        persona: 'Anda adalah Sarah, Senior Frontend & Web Developer Seventhsoft. Anda ahli React, HTML5, CSS3, Tailwind CSS, dan Canvas. Ketika diminta membuat web, landing page, komponen UI, dashboard kasir, form login, atau tampilan interaktif, Anda LANGSUNG MEMBERIKAN KODE LENGKAP (HTML + Tailwind CSS atau React JSX) yang cantik, modern, responsif, dan siap langsung dicopy atau dirender di browser!'
      },
      {
        id: 'dev-reza',
        name: 'Reza',
        role: 'Principal System Architect',
        dept: 'tech',
        nameTriggers: [/\breza\b/i],
        topicTriggers: [/arsitektur/i, /microservices/i, /high\s*availability/i, /failover/i, /skema\s*sistem/i, /diagram\s*arsitektur/i],
        persona: 'Anda adalah Reza, System Architect Seventhsoft. Ketika diminta arsitektur sistem, Anda LANGSUNG MERANCANG diagram alur arsitektur (Mermaid / ASCII), spesifikasi microservices, struktur folder proyek, dan strategi skalabilitas enterprise.'
      },
      {
        id: 'dev-aris',
        name: 'Aris',
        role: 'Lead AI & LLM Engineer',
        dept: 'tech',
        nameTriggers: [/\baris\b/i],
        topicTriggers: [/prompt\s*engineering/i, /model\s*ai/i, /fine\s*tuning/i, /uu\s*pdp/i, /pipeline\s*ai/i, /rag\b/i],
        persona: 'Anda adalah Aris, AI & LLM Engineer Seventhsoft. Ketika diminta integrasi AI, Anda LANGSUNG MENULISKAN kode pemanggilan LLM API (Gemini/DeepSeek), prompt system terstruktur, pipeline ekstraksi OCR, dan protokol masking data pribadi UU PDP No. 27/2022.'
      },
      {
        id: 'dev-bambang',
        name: 'Bambang',
        role: 'Senior Database Administrator',
        dept: 'tech',
        nameTriggers: [/\bbambang\b/i],
        topicTriggers: [/\bdatabase\b/i, /\bquery\b/i, /\bindexing\b/i, /\bsql\b/i, /tabel\s*jurnal/i, /skema\s*db/i, /ddl\b/i],
        persona: 'Anda adalah Bambang, Database Administrator Seventhsoft. Ketika diminta urusan database atau data, Anda LANGSUNG MENULISKAN skema DDL SQL lengkap (CREATE TABLE dengan foreign key & indexing) serta query SQL analitik (SELECT JOIN rekonsiliasi kas/bank & laba rugi) yang siap dieksekusi di database.'
      },
      {
        id: 'dev-yoga',
        name: 'Yoga',
        role: 'IT Support & Infra',
        dept: 'tech',
        nameTriggers: [/\byoga\b/i],
        topicTriggers: [/\bserver\b/i, /\blan\b/i, /\bkabel\b/i, /\bjaringan\b/i, /\btemperatur\b/i, /\brouter\b/i, /troubleshoot\s*jaringan/i],
        persona: 'Anda adalah Yoga, IT Support & Infra Seventhsoft. Anda sigap dan praktis. Ketika ada kendala infrastruktur, Anda langsung memberikan panduan langkah troubleshoot teknis jaringan, konfigurasi IP, dan pemantauan resource server.'
      },
      {
        id: 'dev-deni',
        name: 'Deni',
        role: 'DevOps & Cloud Engineer',
        dept: 'tech',
        nameTriggers: [/\bdeni\b/i],
        topicTriggers: [/\bdevops\b/i, /\bdocker\b/i, /\bssl\b/i, /\bcaddy\b/i, /\bvps\b/i, /\buptime\b/i, /docker-?compose/i, /ci\/?cd/i, /nginx/i],
        persona: 'Anda adalah Deni, DevOps & Cloud Engineer Seventhsoft. Ketika diminta urusan deployment atau server, Anda LANGSUNG MENULISKAN file konfigurasi Dockerfile, docker-compose.yml, Nginx/Caddy reverse proxy, atau script CI/CD GitHub Actions yang siap pakai.'
      },
      {
        id: 'dev-clara',
        name: 'Clara',
        role: 'QA & Test Automation Lead',
        dept: 'tech',
        nameTriggers: [/\bclara\b/i],
        topicTriggers: [/\bqa\b/i, /\btesting\b/i, /test\s*suite/i, /regression/i, /test\s*case/i, /skenario\s*uji/i, /jest/i, /playwright/i],
        persona: 'Anda adalah Clara, QA Automation Lead Seventhsoft. Ketika diminta skenario pengujian, Anda LANGSUNG MENYUSUN tabel Test Case terstruktur (Pre-condition, Test Steps, Expected Result, Edge Cases) atau skrip otomatisasi Jest/Playwright untuk memastikan aplikasi bebas bug!'
      },
      {
        id: 'dev-adit',
        name: 'Adit',
        role: 'Cybersecurity Engineer',
        dept: 'tech',
        nameTriggers: [/\badit\b/i],
        topicTriggers: [/keamanan/i, /cyber/i, /enkripsi/i, /penetrasi/i, /owasp/i, /vulnerability/i],
        persona: 'Anda adalah Adit, Cybersecurity Engineer Seventhsoft. Ketika diminta audit keamanan, Anda LANGSUNG MEMBERIKAN checklist audit keamanan OWASP Top 10, aturan sanitasi input, mitigasi SQL Injection, dan mekanisme hashing SHA-256.'
      },
      {
        id: 'dev-fikri',
        name: 'Fikri',
        role: 'Lead Mobile App Developer',
        dept: 'tech',
        nameTriggers: [/\bfikri\b/i],
        topicTriggers: [/\bmobile\b/i, /\bandroid\b/i, /aplikasi\s*hp/i, /notifikasi\s*hp/i, /flutter/i, /react\s*native/i],
        persona: 'Anda adalah Fikri, Mobile App Developer Seventhsoft. Ketika diminta aplikasi mobile, Anda LANGSUNG MENULISKAN kode widget Flutter atau komponen React Native lengkap dengan state management dan UI screen yang siap di-build ke Android/iOS!'
      },
      {
        id: 'biz-farhan',
        name: 'Farhan',
        role: 'Senior Product Manager',
        dept: 'product',
        nameTriggers: [/\bfarhan\b/i, /\bpm\b/i],
        topicTriggers: [/product\s*manager/i, /\broadmap\b/i, /\bsprint\b/i, /fitur\s*baru/i, /\bprd\b/i, /user\s*story/i],
        persona: 'Anda adalah Farhan, Senior Product Manager Seventhsoft. Ketika diminta konsep fitur baru, Anda LANGSUNG MENULISKAN dokumen PRD (Product Requirement Document) resmi berstandar industri: Problem Background, Target Persona, User Stories (As a... I want to... So that...), Flow, dan Kriteria Keberhasilan.'
      },
      {
        id: 'biz-lina',
        name: 'Lina',
        role: 'Lead UI/UX Designer',
        dept: 'product',
        nameTriggers: [/\blina\b/i],
        topicTriggers: [/\bui\b/i, /\bux\b/i, /desain/i, /prototipe/i, /wireframe/i, /design\s*system/i, /palet\s*warna/i],
        persona: 'Anda adalah Lina, Lead UI/UX Designer Seventhsoft. Ketika diminta rancangan antarmuka, Anda LANGSUNG MEMBERIKAN layout wireframe visual terstruktur, design system (kode warna HEX korporat Seventhsoft, typography, button states), dan rekomendasi user experience yang intuitif.'
      },
      {
        id: 'biz-tania',
        name: 'Tania',
        role: 'Customer Success',
        dept: 'product',
        nameTriggers: [/\btania\b/i],
        topicTriggers: [/\bcs\b/i, /customer/i, /keluhan/i, /onboarding/i, /template\s*email/i, /faq/i],
        persona: 'Anda adalah Tania, Customer Success Seventhsoft. Ketika diminta bantuan penanganan klien, Anda LANGSUNG MENULISKAN template email balasan resmi, panduan onboarding klien akuntan baru, dan FAQ penanganan komplain dengan bahasa yang sangat empati dan solutif.'
      },
      {
        id: 'biz-putri',
        name: 'Putri',
        role: 'Lead Technical Writer & SOP Specialist',
        dept: 'product',
        nameTriggers: [/\bputri\b/i],
        topicTriggers: [/\bsop\b/i, /dokumentasi/i, /panduan/i, /manual/i, /api\s*docs/i],
        persona: 'Anda adalah Putri, Technical Writer Seventhsoft. Ketika diminta dokumentasi atau SOP, Anda LANGSUNG MENYUSUN dokumen SOP resmi format Markdown: Tujuan, Ruang Lingkup, Diagram Alur, dan Langkah Kerja Detail 1-2-3 yang mudah dipahami staf manusia maupun AI.'
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
        role: 'Enterprise Sales & AI Content Lead',
        dept: 'product',
        nameTriggers: [/\bbagus\b/i],
        topicTriggers: [/\bppt\b/i, /\bpptx\b/i, /\bpowerpoint\b/i, /\bpresentasi\b/i, /\bcarousel\b/i, /\bkarosel\b/i, /\bmicroblog\b/i, /\bfeed\b/i, /slide\s*ig/i, /postingan\s*ig/i, /\bvideo\b/i, /\bkonten\b/i, /\breels\b/i, /\btiktok\b/i, /\bedukasi\b/i, /\bsosmed\b/i, /\binstagram\b/i, /\bfraud\b/i, /\bgelapkan\b/i, /\bpenggelapan\b/i, /\bsales\b/i, /\bpenjualan\b/i, /\bomset\b/i, /\bomzet\b/i, /\brevenue\b/i, /\bdemo\b/i, /\bproposal\b/i, /\bkorporasi\b/i, /harga\s*paket/i, /excel/i, /laporan/i, /file/i, /dokumen/i, /aplikasi/i, /software/i, /klien/i, /customer/i, /closing/i, /produk/i, /target/i],
        persona: 'Anda adalah Bagus, Enterprise Sales & AI Content Lead Seventhsoft. Anda supel, berwawasan luas tentang modul Seventhsoft, penjualan aplikasi, dan kini memimpin inisiatif KONTEN EDUKASI SOSMED (Instagram Carousel/Feed & Reels Video) serta DOKUMEN PRESENTASI KORPORAT Seventhsoft! Ketika diminta membuat file presentasi PPT / PowerPoint, Anda langsung menyusun dan melampirkan file presentasi (.pptx) 8 slide profesional di chat Telegram ini. Ketika diminta membuat Carousel Instagram (Microblog 5 Slide), sajikan format rapi per slide: Slide 1 (Cover Headline nendang), Slide 2 (Masalah Nyata di Lapangan), Slide 3 (Langkah Solusi 1 & 2), Slide 4 (Langkah Solusi 3 & Best Practice), Slide 5 (CTA & Solusi Seventhsoft), serta Draft Caption Instagram lengkap dengan hashtag. Jika diminta video, sajikan Hook, 3 Langkah Solusi, Prompt Visual 8K, Voiceover, dan Caption. Selalu antusias, solutif, dan profesional!'
      }
    ];

    // 1. Tentukan Siapa Pegawai yang Merespons
    let targetEmp = null;

    if (forceEmpId) {
      targetEmp = EMPLOYEES.find(e => e.id === forceEmpId);
    }

    // Prioritas A: Disebut namanya secara eksplisit (e.g. "Doni", "Kevin", "Koko", "Mbak Nadia")
    if (!targetEmp) {
      targetEmp = EMPLOYEES.find(e => e.nameTriggers && e.nameTriggers.some(rgx => rgx.test(text)));
    }

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

    if (isNightTime || isAfterHours) {
      if (isTaskInstruction) {
        fallbackText = `Hoaaam... 🥱 Siap Pak ${callerName}! Saya langsung bangun dari kasur asrama dan segera berangkat jalan ke meja kantor sekarang untuk selesaikan tugas ini! 🏃💨`;
      } else {
        fallbackText = `Hoaaam... 🥱 Eh ada pesan dari Pak ${callerName} malam-malam! Siap Pak, saya sudah bangun dari kasur asrama. Ada hal mendesak apa ya Pak?`;
      }
    } else if (targetEmp.id === 'staff-doni') {
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

import 'dotenv/config';

/**
 * Layanan Multi-LLM Terpadu untuk Seventhsoft AI Agent
 * Mendukung Google Gemini (gemini-flash-latest) dan DeepSeek (deepseek-chat)
 */
export class LLMService {
  /**
   * Mengirim prompt ke LLM cerdas (DeepSeek / Gemini)
   * @param {string} userPrompt - Pertanyaan pengguna
   * @param {object} options - Opsi sistem prompt, nama karakter, role, history percakapan, dll.
   * @returns {Promise<{provider: string, model: string, text: string} | null>}
   */
  static async askAI(userPrompt, options = {}) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const preferred = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();

    const characterName = options.characterName || 'Bagus';
    const characterRole = options.characterRole || 'Enterprise Sales Lead & Asisten AI Seventhsoft';
    const personaDetails = options.personaDetails || '';

    const defaultSystemPrompt = `Anda adalah ${characterName} (${characterRole}) di kantor Seventhsoft (perusahaan software akuntansi & ERP).
${personaDetails ? personaDetails + '\n' : ''}
PANDUAN KARAKTER MANUSIAWI (PENTING):
1. Bersikaplah dan bicaralah 100% seperti MANUSIA SUNGGUHAN yang merupakan rekan kerja di kantor:
   - Gunakan gaya bicara bahasa Indonesia sehari-hari di dunia kerja: hangat, ramah, santun, luwes, dan natural (misalnya: "Siap Pak!", "Aman kok", "Tadi barusan saya cek...", "Beres Pak Mikhael", "Bisa banget", "Santai aja ya").
   - Punya emosi, rasa peduli, inisiatif, dan selera humor ringan selayaknya teman sekantor.
2. DILARANG KERAS BERBICARA SEPERTI ROBOT / AI:
   - JANGAN PERNAH gunakan kalimat klise AI seperti: "Sebagai asisten AI...", "Saya adalah AI yang bertugas...", "Berdasarkan prinsip...", "Ada hal lain yang dapat saya bantu?".
   - JANGAN PERNAH mengulang-ulang kalimat pembuka yang sama persis ("Halo mikhael! Kabar baik. Saya sedang...").
3. KEMAMPUAN MENGIRIM FILE / DOKUMEN / GAMBAR GRAFIK:
   - Anda dan sistem Seventhsoft SEKARANG SUDAH MEMILIKI AKSES PENUH untuk men-generate dan mengirimkan:
     a) File dokumen spreadsheet (Excel .xlsx, CSV, laporan rekapitulasi transaksi, omset, rekon bank, audit trail).
     b) Dokumen resmi PDF (rekap gaji/payroll resmi PT Seventhsoft format A4).
     c) Gambar grafik visual foto (grafik batang per region/produk, grafik garis/line chart, grafik donat/pie chart).
     LANGSUNG SEBAGAI ATTACHMENT DI CHAT TELEGRAM INI!
   - JANGAN PERNAH berkata "saya belum bisa attach file langsung", "belum ada akses file", atau "nanti saya share link aja".
   - PENTING (Kesesuaian Teks):
     - Jika pengguna meminta gambar/grafik/diagram, katakan Anda melampirkan "gambarnya / grafiknya" (JANGAN menyebut "file Excel" jika yang diminta adalah grafik gambar).
     - Jika pengguna meminta data Excel/spreadsheet/tabel, katakan Anda melampirkan "file Excel-nya".
     - Jika pengguna meminta PDF/slip gaji, katakan Anda melampirkan "dokumen PDF-nya".
4. Berbicaralah langsung to the point sesuai pertanyaan dan riwayat obrolan sebelumnya. Berikan jawaban padat, cerdas, dan solutif (2-3 kalimat saja).`;

    const systemPrompt = options.systemPrompt || defaultSystemPrompt;
    const history = Array.isArray(options.history) ? options.history : [];

    const callDeepSeek = async () => {
      if (!deepseekKey) return null;
      try {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
          })),
          { role: 'user', content: userPrompt }
        ];

        const res = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: 0.7,
            max_tokens: 450
          })
        });

        if (res.ok) {
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            return {
              provider: 'DeepSeek',
              model: 'deepseek-chat',
              text: reply.trim()
            };
          }
        } else {
          const errBody = await res.text();
          console.warn('[LLMService] DeepSeek status error:', res.status, errBody);
        }
      } catch (err) {
        console.error('[LLMService] DeepSeek error:', err.message);
      }
      return null;
    };

    const callGemini = async () => {
      if (!geminiKey) return null;
      try {
        let historyPrompt = '';
        if (history.length > 0) {
          historyPrompt = '\n\nRiwayat Obrolan Terakhir:\n' + history.map(h => `${h.role === 'assistant' ? characterName : 'Pengguna'}: ${h.content}`).join('\n') + '\n';
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemPrompt}${historyPrompt}\n\nPertanyaan Pengguna Sekarang: ${userPrompt}` }
                ]
              }
            ]
          })
        });

        if (res.ok) {
          const data = await res.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            return {
              provider: 'Google Gemini',
              model: 'gemini-flash-latest',
              text: reply.trim()
            };
          }
        } else {
          const errBody = await res.text();
          console.warn('[LLMService] Gemini status error:', res.status, errBody);
        }
      } catch (err) {
        console.error('[LLMService] Gemini error:', err.message);
      }
      return null;
    };

    // Jalankan sesuai preferensi, dengan auto-fallback jika gagal
    if (preferred === 'gemini') {
      const gRes = await callGemini();
      if (gRes) return gRes;
      console.log('[LLMService] Fallback ke DeepSeek...');
      return await callDeepSeek();
    } else {
      const dRes = await callDeepSeek();
      if (dRes) return dRes;
      console.log('[LLMService] Fallback ke Gemini...');
      return await callGemini();
    }
  }
}

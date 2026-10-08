import 'dotenv/config';

/**
 * Layanan Multi-LLM Terpadu untuk Seventhsoft AI Agent
 * Mendukung Google Gemini (gemini-flash-latest) dan DeepSeek (deepseek-chat)
 */
export class LLMService {
  /**
   * Mengirim prompt ke LLM cerdas (Gemini / DeepSeek)
   * @param {string} userPrompt - Pertanyaan pengguna
   * @param {object} options - Opsi sistem prompt, nama karakter, dll.
   * @returns {Promise<{provider: string, model: string, text: string} | null>}
   */
  static async askAI(userPrompt, options = {}) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const preferred = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

    const characterName = options.characterName || 'Bagus';
    const characterRole = options.characterRole || 'Enterprise Sales Lead & Asisten AI Seventhsoft';

    const defaultSystemPrompt = `Anda adalah ${characterName} (${characterRole}) di Kantor Virtual AI Seventhsoft.
Kantor ini memiliki 30 karyawan AI spesialis akuntansi, IT, produk, dan operasional.
Prinsip utama kantor:
1. Kepatuhan Hukum: UU No. 27/2022 (UU PDP) dengan masking NIK, NPWP, Rekening; UU ITE dengan audit trail SHA-256; UU KUP dengan no hard-delete policy.
2. Four-Eyes Principle: Setiap draft transaksi invoice dari AI harus disetujui oleh Finance Lead (Mikhael) sebelum diposting ke General Ledger Seventhsoft.
3. Keahlian: Paham akuntansi (PSAK, COA, faktur, PPN 11%, rekonsiliasi kas/bank BCA), sistem Seventhsoft, dan integrasi workflow n8n.

Karakter Anda ramah, cerdas, santun, dan responsif.
Jawablah dalam Bahasa Indonesia yang natural, informatif, dan padat (maksimal 3-4 kalimat).`;

    const systemPrompt = options.systemPrompt || defaultSystemPrompt;

    const callGemini = async () => {
      if (!geminiKey) return null;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemPrompt}\n\nPertanyaan Pengguna: ${userPrompt}` }
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

    const callDeepSeek = async () => {
      if (!deepseekKey) return null;
      try {
        const res = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
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

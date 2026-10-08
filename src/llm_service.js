import 'dotenv/config';

/**
 * Layanan Multi-LLM Terpadu untuk Seventhsoft AI Agent
 * Mendukung DeepSeek (deepseek-chat) dan Google Gemini (gemini-1.5-flash)
 */
export class LLMService {
  /**
   * Mengirim prompt ke LLM cerdas (DeepSeek / Gemini)
   * @param {string} userPrompt - Pertanyaan pengguna
   * @param {object} options - Opsi sistem prompt, nama karakter, dll.
   * @returns {Promise<{provider: string, text: string} | null>}
   */
  static async askAI(userPrompt, options = {}) {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    const characterName = options.characterName || 'Bagus';
    const characterRole = options.characterRole || 'Enterprise Sales Lead & Asisten AI Seventhsoft';

    const defaultSystemPrompt = `Anda adalah ${characterName} (${characterRole}) di Kantor Virtual AI Seventhsoft.
Kantor ini memiliki 30 karyawan AI spesialis akuntansi, IT, produk, dan operasional.
Prinsip utama kantor adalah:
1. Kepatuhan Hukum: UU No. 27/2022 (UU PDP) dengan masking data NIK, NPWP, Rekening; UU ITE dengan audit trail SHA-256; UU KUP dengan no hard-delete policy.
2. Four-Eyes Principle: Semua transaksi draft invoice dari AI harus disetujui oleh Finance Lead (Mikhael) sebelum diposting ke General Ledger Seventhsoft.
3. Keahlian: Anda memahami akuntansi (PSAK, COA, faktur, PPN 11%, rekonsiliasi kas/bank), sistem Seventhsoft, dan integrasi workflow n8n.

Karakter Anda ramah, cerdas, santun, dan responsif.
Jawablah dalam Bahasa Indonesia yang natural, informatif, dan padat (maksimal 3-4 kalimat).`;

    const systemPrompt = options.systemPrompt || defaultSystemPrompt;

    // 1. Prioritas Utama: DeepSeek (deepseek-chat)
    if (deepseekKey) {
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
        console.error('[LLMService] DeepSeek connection error:', err.message);
      }
    }

    // 2. Cadangan: Google Gemini (gemini-1.5-flash)
    if (geminiKey && (geminiKey.startsWith('AIzaSy') || geminiKey.length > 20)) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemPrompt}\n\nPengguna: ${userPrompt}` }
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
              model: 'gemini-1.5-flash',
              text: reply.trim()
            };
          }
        }
      } catch (err) {
        console.error('[LLMService] Gemini connection error:', err.message);
      }
    }

    return null;
  }
}

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { db } from './database.js';

dotenv.config();

/**
 * Mengirim file (Excel, PDF, CSV, gambar, dll) ke Telegram Chat yang terdaftar
 * @param {string} filePath - Path absolut atau relatif file
 * @param {string} caption - Pesan/keterangan file
 * @param {string} [customChatId] - (Opsional) Chat ID tujuan
 */
export async function sendFileToTelegram(filePath, caption = '', customChatId = null) {
  const settings = db?.getSettings ? db.getSettings() : {};
  const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token;
  const chatId = customChatId || process.env.TELEGRAM_CHAT_ID || settings.telegram_chat_id;

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum dikonfigurasi di file .env / Vercel Environment Variables');
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File tidak ditemukan di path: ${resolvedPath}`);
  }

  const fileName = path.basename(resolvedPath);
  const fileBuffer = fs.readFileSync(resolvedPath);
  const blob = new Blob([fileBuffer]);

  const isImage = /\.(png|jpe?g|webp)$/i.test(fileName);
  const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
  const fileFieldName = isImage ? 'photo' : 'document';

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append(fileFieldName, blob, fileName);
  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  if (!result.ok) {
    // Jika sendPhoto gagal, fallback ke sendDocument
    if (isImage) {
      const fallbackForm = new FormData();
      fallbackForm.append('chat_id', chatId);
      fallbackForm.append('document', blob, fileName);
      if (caption) {
        fallbackForm.append('caption', caption);
        fallbackForm.append('parse_mode', 'HTML');
      }
      const fallbackRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: fallbackForm
      });
      const fallbackJson = await fallbackRes.json();
      if (!fallbackJson.ok) {
        throw new Error(`Telegram API Error: ${fallbackJson.description}`);
      }
      return fallbackJson;
    }
    throw new Error(`Telegram API Error: ${result.description}`);
  }

  return result;
}

/**
 * Mengirim pesan suara / Voice Note (.mp3 / .ogg) ke Telegram Chat yang terdaftar
 * Tampil sebagai native waveform voice bubble di aplikasi Telegram
 * @param {string|Buffer} audioInput - Path file audio atau Buffer audio MP3
 * @param {string} caption - Keterangan/caption suara
 * @param {string} [customChatId] - Chat ID penerima
 */
export async function sendVoiceToTelegram(audioInput, caption = '', customChatId = null) {
  const settings = db?.getSettings ? db.getSettings() : {};
  const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token;
  const chatId = customChatId || process.env.TELEGRAM_CHAT_ID || settings.telegram_chat_id;

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum dikonfigurasi.');
  }

  let buffer;
  let fileName = `voice_${Date.now()}.mp3`;

  if (Buffer.isBuffer(audioInput)) {
    buffer = audioInput;
  } else if (typeof audioInput === 'string') {
    const resolvedPath = path.resolve(audioInput);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File audio tidak ditemukan di: ${resolvedPath}`);
    }
    buffer = fs.readFileSync(resolvedPath);
    fileName = path.basename(resolvedPath);
  } else {
    throw new Error('audioInput harus berupa Buffer atau path string file audio.');
  }

  const blob = new Blob([buffer]);
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('voice', blob, fileName);
  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram sendVoice Error: ${result.description}`);
  }

  return result;
}

/**
 * Menghasilkan file audio MP3 Bahasa Indonesia via Google TTS
 * Mendukung teks panjang dengan auto-chunking & stitching MP3 frames
 * @param {string} text - Kalimat / naskah yang akan diucapkan
 * @returns {Promise<{ filePath: string, buffer: Buffer }>}
 */
export async function generateIndonesianTtsAudio(text) {
  const isVercel = !!process.env.VERCEL;
  const voiceDir = isVercel ? '/tmp/voice' : path.join(process.cwd(), 'uploads/voice');
  if (!fs.existsSync(voiceDir)) {
    fs.mkdirSync(voiceDir, { recursive: true });
  }

  // Bersihkan teks dari markup HTML & markdown
  const cleanedText = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_~`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Pecah teks ke potongan maksimal 180 karakter agar tidak melewati batas Google TTS
  const sentences = cleanedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanedText];
  const chunks = [];
  let currentChunk = '';

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((currentChunk + ' ' + trimmed).trim().length <= 180) {
      currentChunk = (currentChunk + ' ' + trimmed).trim();
    } else {
      if (currentChunk) chunks.push(currentChunk);
      if (trimmed.length > 180) {
        // Potong paksa per kata jika satu kalimat terlalu panjang
        const words = trimmed.split(' ');
        let temp = '';
        for (const w of words) {
          if ((temp + ' ' + w).trim().length <= 180) {
            temp = (temp + ' ' + w).trim();
          } else {
            if (temp) chunks.push(temp);
            temp = w;
          }
        }
        if (temp) currentChunk = temp;
        else currentChunk = '';
      } else {
        currentChunk = trimmed;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  // Ambil audio MP3 per chunk
  const buffers = [];
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=id&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!res.ok) {
      throw new Error(`Google TTS gagal dengan status ${res.status}`);
    }
    const arrayBuf = await res.arrayBuffer();
    buffers.push(Buffer.from(arrayBuf));
  }

  const finalBuffer = Buffer.concat(buffers);
  const fileName = `vn_${Date.now()}.mp3`;
  const filePath = path.join(voiceDir, fileName);
  fs.writeFileSync(filePath, finalBuffer);

  return { filePath, buffer: finalBuffer };
}

// Eksekusi via CLI: node src/send_telegram_file.js <path_file> [caption]
if (process.argv[1] && process.argv[1].endsWith('send_telegram_file.js')) {
  const targetFile = process.argv[2];
  const caption = process.argv[3] || 'Berikut dokumen yang diminta.';

  if (!targetFile) {
    console.error('Penggunaan: node src/send_telegram_file.js <path_file> [caption]');
    process.exit(1);
  }

  sendFileToTelegram(targetFile, caption)
    .then(res => {
      console.log('✅ Dokumen berhasil terkirim ke Telegram!');
      console.log('File:', targetFile);
    })
    .catch(err => {
      console.error('❌ Gagal mengirim dokumen:', err.message);
      process.exit(1);
    });
}

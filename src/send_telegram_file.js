import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Mengirim file (Excel, PDF, CSV, gambar, dll) ke Telegram Chat yang terdaftar
 * @param {string} filePath - Path absolut atau relatif file
 * @param {string} caption - Pesan/keterangan file
 * @param {string} [customChatId] - (Opsional) Chat ID tujuan
 */
export async function sendFileToTelegram(filePath, caption = '', customChatId = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = customChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum dikonfigurasi di file .env');
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File tidak ditemukan di path: ${resolvedPath}`);
  }

  const fileName = path.basename(resolvedPath);
  const fileBuffer = fs.readFileSync(resolvedPath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', blob, fileName);
  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API Error: ${result.description}`);
  }

  return result;
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

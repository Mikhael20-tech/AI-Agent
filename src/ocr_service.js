import Tesseract from 'tesseract.js';
import fs from 'fs';

export class OCRService {
  /**
   * Mengekstrak teks dari foto struk, invoice, atau nota pembelian fisik
   * @param {string|Buffer} imageInput - Path file gambar atau Buffer gambar
   * @returns {Promise<string>} - Hasil teks OCR
   */
  static async extractTextFromImage(imageInput) {
    try {
      console.log('[OCR] Memulai proses OCR optical character recognition pada gambar...');
      const { data: { text } } = await Tesseract.recognize(
        imageInput,
        'eng', // eng mengenali angka, huruf kapital, simbol mata uang dengan sangat akurat
        {
          logger: (m) => {
            if (m.status === 'recognizing text' && Math.round(m.progress * 100) % 30 === 0) {
              console.log(`[OCR Progress] ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );

      console.log(`[OCR Selesai] Berhasil mengekstrak ${text.length} karakter teks dari gambar.`);
      return text.trim();
    } catch (err) {
      console.error('[OCR Error] Gagal membaca gambar:', err.message);
      return '';
    }
  }
}

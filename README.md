# AI Agent Akuntansi Seventhsoft

Sistem implementasi otomatisasi akuntansi Seventhsoft berbasis Multi-Agent AI dengan pengawasan manusia (*Human-in-the-Loop / Four-Eyes Principle*), kepatuhan hukum Indonesia (UU PDP, UU ITE, UU KUP), integrasi bot Telegram, dan visual avatar interaktif 2D/3D.

---

## 1. Arsitektur & Alokasi Agen AI

1. **Agent 1: Transaction & Data Entry (Modul Beli, Jual, Stok)**
   * Ekstraksi dokumen faktur / invoice (OCR)
   * Sanitasi data pribadi (NIK, NPWP, Rekening) sebelum diproses LLM
   * Pembuatan draf transaksi di Seventhsoft berstatus `PENDING_APPROVAL` (Dilarang langsung posting final)
2. **Agent 2: Reconciliation & Audit (Modul Kas/Bank & GL)**
   * Pencocokan mutasi e-statement perbankan dengan buku kas Seventhsoft
   * Deteksi selisih nominal dan transaksi yang belum dicatat di General Ledger
   * Hak akses: *Read-Only*
3. **Agent 3: Tax & Reporting Analyst (Modul Pajak & Laporan)**
   * Rekapitulasi proyeksi PPN Keluaran vs PPN Masukan dan estimasi PPh 21 & PPh 23
   * Deteksi anomali lonjakan HPP atau margin abnormal
   * Hak akses: *Read & Compute* (tanpa otorisasi kirim ke DJP)

---

## 2. Kepatuhan Hukum & Tata Kelola

* **UU No. 27 Tahun 2022 (Perlindungan Data Pribadi):** NIK, NPWP, dan No. Rekening disaring dan di-masking secara otomatis.
* **Prinsip Four-Eyes (Human-in-the-Loop):** Keputusan posting jurnal final ke General Ledger mutlak berada di tangan Finance Lead / Senior Accountant melalui tombol Telegram Inline Keyboard atau Web Dashboard.
* **UU ITE & PP PSTE (Jejak Audit):** Seluruh aksi dicatat dalam format *immutable audit log* dengan tanda tangan digital checksum `SHA-256`.
* **UU KUP Perpajakan (Integritas Arsip):** Sistem menolak perintah *Hard Delete*. Pembatalan transaksi disimpan dalam arsip minimal 5–10 tahun.

---

## 3. Cara Menjalankan Sistem

### A. Prasyarat
* Node.js v18+ atau v22+
* npm

### B. Menjalankan Server
```bash
# Jalankan aplikasi (port default: 3000)
npm start
```
Buka peramban di: `http://localhost:3000`

### C. Menghubungkan Bot Telegram Asli (Opsional)
1. Buat bot baru melalui `@BotFather` di Telegram dan dapatkan **Bot Token**.
2. Dapatkan **Chat ID** Anda melalui `@userinfobot`.
3. Buka tab **Pengaturan Bot Telegram** di dashboard web (`http://localhost:3000`), masukkan token dan Chat ID, lalu klik **Simpan Konfigurasi**.
*(Catatan: Jika token belum diisi, sistem tetap berfungsi 100% menggunakan Simulator Smartphone Telegram interaktif di dashboard).*

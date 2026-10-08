# Arsitektur & SOP Implementasi AI Agent Akuntansi Seventhsoft

Dokumen ini merangkum struktur tim, pembagian agen AI, kepatuhan hukum, serta arsitektur teknis integrasi bot Telegram dengan visual avatar (2D/3D).

---

## 1. Struktur Organisasi & Alokasi Peran

Operasional berada di bawah **1 Divisi (Finance & Accounting)** dengan total tim:
* **Manusia:** 2–3 orang (verifikator & penanggung jawab hukum)
* **AI Agent:** 3 modul tugas

### Matriks Tanggung Jawab SDM (Manusia)

| Posisi | Jumlah | Hak Akses Seventhsoft | Tanggung Jawab Hukum |
| :--- | :---: | :--- | :--- |
| **Finance Lead / Senior Accountant** | 1 | Admin / Approver (GL, Kas/Bank, Laporan, COA) | Otorisasi final posting jurnal, persetujuan transfer/pembayaran, pertanggungjawaban resmi laporan pajak (SPT). |
| **Junior Accountant / Staff Verifikator** | 1–2 | Reviewer / Operator (Pembelian, Penjualan, Stok) | Verifikasi fisik dokumen, validasi draft yang dibuat AI, tinjauan selisih rekonsiliasi kas/bank. |

---

## 2. Alokasi 3 AI Agent

* **Agent 1: Transaction & Data Entry (Modul Beli, Jual, Stok)**
  * *Tugas:* Ekstraksi dokumen (OCR invoice/PO) dan pembuatan draft transaksi di Seventhsoft.
  * *Izin:* Draft creation only (dilarang posting final).
* **Agent 2: Reconciliation & Audit (Modul Kas/Bank & GL)**
  * *Tugas:* Pencocokan mutasi e-statement bank dengan kas Seventhsoft, mendeteksi selisih atau anomali.
  * *Izin:* Read-only pada mutasi dan buku besar.
* **Agent 3: Tax & Reporting Analyst (Modul Pajak & Laporan)**
  * *Tugas:* Rekap proyeksi PPN/PPh, draf laporan laba-rugi mingguan, dan peringatan margin/HPP ganjil.
  * *Izin:* Read & compute only (tanpa otorisasi kirim ke DJP).

---

## 3. Matriks Kepatuhan Hukum & SOP

* **Human-in-the-Loop (Four-Eyes Principle):** Seluruh transaksi hasil proses AI berstatus *Draft/Pending Review*. Status resmi posting GL hanya sah via klik manual oleh Lead/Staf manusia.
* **Pembatasan Transaksi Kas:** AI Agent tidak memiliki hak akses pembuatan Bukti Kas Keluar atau Bilyet Giro. Transaksi pengeluaran wajib melalui otorisasi perbankan manual.
* **Perlindungan Data Pribadi (UU No. 27/2022):** Data NIK, NPWP, dan rekening vendor/pelanggan di-masking sebelum diproses LLM pihak ketiga (*zero-retention policy*).
* **Jejak Audit (UU ITE & PP PSTE):** Log database Seventhsoft wajib merekam metadata: Creator (AI Agent ID), Approver (User ID manusia), dan timestamp eksekusi.
* **Integritas Arsip (UU KUP Perpajakan):** Dilarang memberikan fitur *Hard Delete* kepada AI. Arsip digital dan riwayat transaksi wajib tersimpan aman minimal 5–10 tahun.

---

## 4. Arsitektur Teknis Sistem (Telegram & Avatar)

```text
[ Dokumen / Invoice ]
          │
          ▼
   [ AI Core Engine ] ──(Ekstraksi & Drafting)──► [ Database Seventhsoft ]
          │
          ├──(WebSocket Event)──► [ Frontend Avatar 2D/3D ] (Dashboard Layar)
          │                        └─ Idle / Mengetik / Notifikasi / Mengangguk
          │
          └──(Telegram Bot API)──► [ Smartphone Finance Lead ]
                                   └─ Inline Keyboard [Approve / Reject]
```

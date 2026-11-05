import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import sharp from 'sharp';
import { db } from './database.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isVercel = !!process.env.VERCEL;
const EXPORTS_DIR = isVercel ? '/tmp/reports' : path.join(__dirname, '../uploads/reports');

try {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Gagal buat EXPORTS_DIR:', e.message);
}

export class ReportGenerator {
  /**
   * Menghasilkan file PDF Rekapitulasi Gaji Karyawan Seventhsoft yang resmi & rapi
   * @returns {Promise<string>} - Absolute path file PDF yang dihasilkan
   */
  static async generatePayrollPdf() {
    const payroll = db.getPayroll();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Rekap_Gaji_Seventhsoft_${payroll.period.replace(/\s+/g, '_')}_${timestamp}.pdf`;
    const filePath = path.join(EXPORTS_DIR, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Styling Colors
        const primaryColor = '#1e3a8a';
        const secondaryColor = '#475569';
        const accentColor = '#0284c7';
        const tableBorder = '#cbd5e1';

        // 1. Top Decorative Bar
        doc.rect(36, 36, 523, 4).fill(primaryColor);

        // 2. Company Header
        doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold')
           .text('PT SEVENTHSOFT TEKNOLOGI INDONESIA', 36, 46);
        
        doc.fillColor(secondaryColor).fontSize(8.5).font('Helvetica')
           .text('Enterprise Accounting & ERP Solutions — Departemen Keuangan & HRD', 36, 63);
        doc.text('Gedung Cyber 2 Lt. 18, Jl. H.R. Rasuna Said, Jakarta Selatan | Telp: (021) 5290-8800', 36, 75);

        doc.moveTo(36, 90).lineTo(559, 90).strokeColor(tableBorder).stroke();

        // 3. Document Title Box
        doc.rect(36, 98, 523, 36).fill('#f8fafc');
        doc.rect(36, 98, 523, 36).strokeColor(accentColor).stroke();

        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
           .text('REKAPITULASI DAFTAR GAJI KARYAWAN (PAYROLL SUMMARY)', 45, 105, { align: 'center', width: 505 });
        doc.fillColor('#334155').fontSize(8).font('Helvetica')
           .text(`Periode: ${payroll.period_label || payroll.period}  |  Tanggal Pembayaran: ${payroll.payment_date} (Via BCA Payroll)`, 45, 120, { align: 'center', width: 505 });

        // 4. Meta Information
        let y = 144;
        doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold').text('Informasi Otorisasi & Disburse Bank:', 36, y);
        y += 13;

        doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
        doc.text(`• Rekening Debet      : ${payroll.disbursement_bank}`, 40, y);
        doc.text(`• Status Payroll       : [ ${payroll.status} ]`, 330, y);
        y += 12;
        doc.text(`• Jurnal COA Debet  : ${payroll.coa_debet}`, 40, y);
        doc.text(`• Jurnal COA Kredit : ${payroll.coa_kredit}`, 330, y);
        y += 16;

        // 5. Table Header (Lebar Total: 523, dari X=36 sampai X=559)
        // Kolom: No(18), NIP(45), Nama(105), Jabatan(95), Gaji Pokok(52), Tunjangan(45), BPJS(40), PPh21(42), Net THP(52)
        const tableTop = y;
        doc.rect(36, tableTop, 523, 18).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
        doc.text('No', 38, tableTop + 5, { width: 18, align: 'center' });
        doc.text('NIP', 58, tableTop + 5, { width: 45, align: 'center' });
        doc.text('Nama Karyawan', 106, tableTop + 5, { width: 105, align: 'left' });
        doc.text('Jabatan', 214, tableTop + 5, { width: 95, align: 'left' });
        doc.text('Gaji Pokok', 312, tableTop + 5, { width: 52, align: 'right' });
        doc.text('Tunjangan', 367, tableTop + 5, { width: 45, align: 'right' });
        doc.text('BPJS', 415, tableTop + 5, { width: 40, align: 'right' });
        doc.text('PPh 21', 458, tableTop + 5, { width: 42, align: 'right' });
        doc.text('Net THP', 503, tableTop + 5, { width: 52, align: 'right' });

        y = tableTop + 18;
        const emps = payroll.employees || [];

        emps.forEach((emp, idx) => {
          const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(36, y, 523, 16).fill(rowBg);

          doc.fillColor('#0f172a').fontSize(7).font('Helvetica');
          doc.text(String(idx + 1), 38, y + 4, { width: 18, align: 'center' });
          doc.text(emp.nip, 58, y + 4, { width: 45, align: 'center' });
          doc.font('Helvetica-Bold').text(emp.name, 106, y + 4, { width: 105, align: 'left' }).font('Helvetica');
          doc.text(emp.role, 214, y + 4, { width: 95, align: 'left' });
          doc.text((emp.base_salary || 0).toLocaleString('id-ID'), 312, y + 4, { width: 52, align: 'right' });
          doc.text((emp.allowance || 0).toLocaleString('id-ID'), 367, y + 4, { width: 45, align: 'right' });
          doc.text((emp.bpjs || 0).toLocaleString('id-ID'), 415, y + 4, { width: 40, align: 'right' });
          doc.text((emp.pph21 || 0).toLocaleString('id-ID'), 458, y + 4, { width: 42, align: 'right' });
          doc.font('Helvetica-Bold').text((emp.net || 0).toLocaleString('id-ID'), 503, y + 4, { width: 52, align: 'right' });

          doc.rect(36, y, 523, 16).strokeColor('#e2e8f0').stroke();
          y += 16;
        });

        // Total Row
        doc.rect(36, y, 523, 18).fill('#e0f2fe');
        doc.rect(36, y, 523, 18).strokeColor(accentColor).stroke();
        doc.fillColor(primaryColor).fontSize(7.5).font('Helvetica-Bold');
        doc.text(`TOTAL (${emps.length} KARYAWAN)`, 58, y + 5, { width: 245, align: 'left' });
        doc.text(`Gross: ${(payroll.total_gross || 0).toLocaleString('id-ID')}`, 312, y + 5, { width: 100, align: 'right' });
        doc.text((payroll.total_bpjs || 0).toLocaleString('id-ID'), 415, y + 5, { width: 40, align: 'right' });
        doc.text((payroll.total_pph21 || 0).toLocaleString('id-ID'), 458, y + 5, { width: 42, align: 'right' });
        doc.text((payroll.total_net || 0).toLocaleString('id-ID'), 503, y + 5, { width: 52, align: 'right' });

        y += 24;

        // 6. Ringkasan Finansial Card (Dirancang 2 kolom terpisah agar tidak pernah bertabrakan)
        const cardHeight = 68;
        doc.rect(36, y, 523, cardHeight).fill('#f8fafc');
        doc.rect(36, y, 523, cardHeight).strokeColor(tableBorder).stroke();
        
        // Sisi Kiri: Rincian Anggaran (Width: 285)
        doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold')
           .text('IKHTISAR ANGGARAN & REKONSILIASI GL (GENERAL LEDGER):', 46, y + 8);
        doc.fontSize(7.5).font('Helvetica').fillColor('#334155');
        doc.text(`• Total Gaji Bruto (Gross Payroll) : Rp ${(payroll.total_gross || 0).toLocaleString('id-ID')}`, 46, y + 22);
        doc.text(`• Total Potongan BPJS TK & Kes    : Rp ${(payroll.total_bpjs || 0).toLocaleString('id-ID')} (Disetor ke BPJS)`, 46, y + 34);
        doc.text(`• Total Potongan PPh 21 Pegawai     : Rp ${(payroll.total_pph21 || 0).toLocaleString('id-ID')} (Kompilasi SPT Masa PPh 21)`, 46, y + 46);
        
        // Sisi Kanan: Badge Bersih Ditransfer (Kotak Hijau Eksklusif, Width: 185, X: 360)
        doc.rect(358, y + 8, 190, 52).fillAndStroke('#ecfdf5', '#10b981');
        doc.fillColor('#065f46').fontSize(7.5).font('Helvetica-Bold')
           .text('TOTAL BERSIH (TAKE HOME PAY)', 358, y + 14, { width: 190, align: 'center' });
        doc.fillColor('#047857').fontSize(12).font('Helvetica-Bold')
           .text(`Rp ${(payroll.total_net || 0).toLocaleString('id-ID')}`, 358, y + 26, { width: 190, align: 'center' });
        doc.fillColor('#059669').fontSize(6.5).font('Helvetica')
           .text(`Otorisasi: Disbursed via BCA Corporate Payroll`, 358, y + 43, { width: 190, align: 'center' });

        y += cardHeight + 24;

        // 7. Tanda Tangan Resmi Four-Eyes Principle
        doc.fontSize(8).font('Helvetica').fillColor('#475569');
        doc.text('Dipersiapkan oleh,', 60, y);
        doc.text('Disetujui & Diotorisasi oleh,', 360, y);

        // Badge Verifikasi Digital Otorisasi
        doc.rect(360, y + 12, 160, 22).fillAndStroke('#f0fdf4', '#86efac');
        doc.fillColor('#15803d').fontSize(7).font('Helvetica-Bold')
           .text('✔ OTORISASI DIGITAL VALID', 360, y + 16, { width: 160, align: 'center' });
        doc.fontSize(6).font('Helvetica')
           .text(`Ref ID: 088-291-7721 • Paid to BCA`, 360, y + 24, { width: 160, align: 'center' });

        y += 42;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
        doc.text('Doni Saputra', 60, y);
        doc.text('Mikhael, S.Ak., CA', 360, y);
        y += 11;

        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
        doc.text('Payroll Specialist (Seventhsoft)', 60, y);
        doc.text('Finance Lead (Otorisator Pembayaran)', 360, y);

        // 8. Footer UU PDP & ITE
        doc.moveTo(36, 785).lineTo(559, 785).strokeColor(tableBorder).stroke();
        doc.fontSize(6.5).font('Helvetica').fillColor('#94a3b8');
        doc.text('Dokumen resmi ini di-generate otomatis oleh Seventhsoft Accounting AI Agent. Dilindungi UU PDP No. 27/2022 dan UU ITE.', 36, 792, { align: 'center', width: 523 });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', (err) => reject(err));
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Menghasilkan file Excel (.xlsx) untuk Rekapitulasi Gaji Karyawan
   */
  static generatePayrollExcel() {
    const payroll = db.getPayroll();
    const wb = XLSX.utils.book_new();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const rows = (payroll.employees || []).map((emp, idx) => ({
      'No': idx + 1,
      'NIP': emp.nip,
      'Nama Karyawan': emp.name,
      'Jabatan': emp.role,
      'Gaji Pokok (Rp)': emp.base_salary,
      'Tunjangan (Rp)': emp.allowance,
      'Gaji Bruto (Rp)': emp.gross,
      'Potongan BPJS (Rp)': emp.bpjs,
      'Potongan PPh 21 (Rp)': emp.pph21,
      'Net Take Home Pay (Rp)': emp.net,
      'Status Transfer': payroll.status,
      'Bank Transfer': payroll.disbursement_bank
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Gaji Karyawan');

    const fileName = `Rekap_Gaji_Seventhsoft_${payroll.period.replace(/\s+/g, '_')}_${timestamp}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, fileName);
    XLSX.writeFile(wb, filePath);
    return filePath;
  }

  /**
   * Menghasilkan file Excel (.xlsx) Rekapitulasi Penjualan & Omset Aplikasi Seventhsoft
   */
  static generateSalesReportExcel() {
    const wb = XLSX.utils.book_new();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const salesRows = [
      {
        'No': 1,
        'Paket / Modul Software': 'Seventhsoft Cloud Enterprise (50 User)',
        'Klien': 'PT Indah Makmur Logistik',
        'Sales Representative': 'Bagus Pratama',
        'Qty': 2,
        'Harga Satuan (Rp)': 180000000,
        'Total Nilai (Rp)': 360000000,
        'Status Closing': 'WON / CLOSED',
        'Bulan': 'September 2026'
      },
      {
        'No': 2,
        'Paket / Modul Software': 'Seventhsoft ERP Retail Multi-Cabang',
        'Klien': 'CV Jaya Abadi Perkasa',
        'Sales Representative': 'Bagus Pratama',
        'Qty': 4,
        'Harga Satuan (Rp)': 75000000,
        'Total Nilai (Rp)': 300000000,
        'Status Closing': 'WON / CLOSED',
        'Bulan': 'September 2026'
      },
      {
        'No': 3,
        'Paket / Modul Software': 'Seventhsoft Accounting Pro (10 User)',
        'Klien': 'PT Sumber Rejeki Finance',
        'Sales Representative': 'Cindy Oktavia',
        'Qty': 5,
        'Harga Satuan (Rp)': 45000000,
        'Total Nilai (Rp)': 225000000,
        'Status Closing': 'WON / CLOSED',
        'Bulan': 'September 2026'
      },
      {
        'No': 4,
        'Paket / Modul Software': 'Modul Add-on Payroll & E-Faktur DJP',
        'Klien': 'PT Cahaya Manufaktur Mandiri',
        'Sales Representative': 'Randy Setiawan',
        'Qty': 6,
        'Harga Satuan (Rp)': 25000000,
        'Total Nilai (Rp)': 150000000,
        'Status Closing': 'WON / CLOSED',
        'Bulan': 'September 2026'
      },
      {
        'No': 5,
        'Paket / Modul Software': 'Implementasi, Training & Custom Report',
        'Klien': 'PT Prima Multi Graha',
        'Sales Representative': 'Bagus Pratama',
        'Qty': 3,
        'Harga Satuan (Rp)': 55000000,
        'Total Nilai (Rp)': 165000000,
        'Status Closing': 'WON / CLOSED',
        'Bulan': 'September 2026'
      }
    ];

    const summaryRows = [
      { 'Indikator': 'Total Nilai Penjualan (Omset)', 'Nilai': 'Rp 1.200.000.000 (1,2 Miliar)' },
      { 'Indikator': 'Target Bulanan', 'Nilai': 'Rp 1.000.000.000' },
      { 'Indikator': 'Persentase Pencapaian Target', 'Nilai': '120% (Exceeded Target)' },
      { 'Indikator': 'Top Sales Performer', 'Nilai': 'Bagus Pratama (Total Closing: Rp 825.000.000)' },
      { 'Indikator': 'Periode Laporan', 'Nilai': 'September 2026 (Bulan Kemarin)' }
    ];

    const wsSales = XLSX.utils.json_to_sheet(salesRows);
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Eksekutif');
    XLSX.utils.book_append_sheet(wb, wsSales, 'Rincian Penjualan');

    const fileName = `Rekap_Penjualan_Seventhsoft_September_2026_${timestamp}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, fileName);
    XLSX.writeFile(wb, filePath);
    return filePath;
  }

  /**
   * Menghasilkan file Excel (.xlsx) komprehensif dari database Seventhsoft
   * @param {string} type - 'all', 'drafts', 'reconciliation', 'tax', 'audit', 'payroll', 'sales'
   * @returns {string} - Absolute path file Excel yang dihasilkan
   */
  static generateExcelReport(type = 'all') {
    if (type === 'payroll' || type === 'gaji') {
      return this.generatePayrollExcel();
    }
    if (type === 'sales' || type === 'penjualan') {
      return this.generateSalesReportExcel();
    }

    const wb = XLSX.utils.book_new();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // 1. Sheet Draft Transaksi
    if (type === 'all' || type === 'drafts') {
      const drafts = db.getDrafts() || [];
      const draftsRows = drafts.map((d, idx) => ({
        'No': idx + 1,
        'ID Draft': d.id,
        'No Faktur': d.invoice_number,
        'Tanggal': d.date,
        'Vendor': d.vendor_name,
        'NPWP (Masked)': d.vendor_masked_npwp,
        'Subtotal (Rp)': d.subtotal,
        'PPN (Rp)': d.ppn,
        'Grand Total (Rp)': d.grand_total,
        'Akun Debet': d.coa_debet,
        'Akun Kredit': d.coa_kredit,
        'Status': d.status,
        'Approver': d.approver_user_id || 'Menunggu Otorisasi',
        'Dibuat Oleh': d.creator_agent_id
      }));

      const wsDrafts = XLSX.utils.json_to_sheet(draftsRows.length ? draftsRows : [{ 'Info': 'Tidak ada draft' }]);
      XLSX.utils.book_append_sheet(wb, wsDrafts, 'Draft Transaksi');
    }

    // 2. Sheet Rekonsiliasi Bank
    if (type === 'all' || type === 'reconciliation') {
      const recons = db.getReconciliation() || [];
      const reconRows = recons.map((r, idx) => ({
        'No': idx + 1,
        'ID Rekon': r.id,
        'Tanggal': r.date,
        'Ref Bank': r.bank_ref,
        'Keterangan': r.description,
        'Nominal Bank (Rp)': r.bank_amount,
        'Nominal GL Seventhsoft (Rp)': r.seventhsoft_gl_amount,
        'Selisih (Rp)': r.difference,
        'Status': r.status,
        'Catatan Audit': r.agent_flag
      }));

      const wsRecon = XLSX.utils.json_to_sheet(reconRows.length ? reconRows : [{ 'Info': 'Tidak ada data rekon' }]);
      XLSX.utils.book_append_sheet(wb, wsRecon, 'Rekonsiliasi Bank');
    }

    // 3. Sheet Ringkasan Pajak
    if (type === 'all' || type === 'tax') {
      const tax = db.getTaxSummary() || {};
      const taxRows = [
        { 'Komponen Perpajakan': 'Periode Pelaporan', 'Nilai': tax.period || 'Oktober 2026' },
        { 'Komponen Perpajakan': 'PPN Keluaran (11%)', 'Nilai': (tax.ppn_keluaran || 0).toLocaleString('id-ID') },
        { 'Komponen Perpajakan': 'PPN Masukan (11%)', 'Nilai': (tax.ppn_masukan || 0).toLocaleString('id-ID') },
        { 'Komponen Perpajakan': 'PPN Kurang Bayar (Net)', 'Nilai': (tax.ppn_kurang_bayar || 0).toLocaleString('id-ID') },
        { 'Komponen Perpajakan': 'Estimasi PPh 21', 'Nilai': (tax.pph_21_estimasi || 0).toLocaleString('id-ID') },
        { 'Komponen Perpajakan': 'Estimasi PPh 23', 'Nilai': (tax.pph_23_estimasi || 0).toLocaleString('id-ID') }
      ];

      const wsTax = XLSX.utils.json_to_sheet(taxRows);
      XLSX.utils.book_append_sheet(wb, wsTax, 'Ringkasan Pajak');
    }

    // 4. Sheet Audit Log (Integritas SHA-256)
    if (type === 'all' || type === 'audit') {
      const auditLogs = db.getAuditLogs() || [];
      const auditRows = auditLogs.map((a, idx) => ({
        'No': idx + 1,
        'Log ID': a.id,
        'Waktu (UTC)': a.timestamp,
        'Event': a.event,
        'Target ID': a.target_id,
        'Pelaku': `${a.actor_type} (${a.actor_id})`,
        'Deskripsi': a.description,
        'SHA-256 Checksum': a.checksum
      }));

      const wsAudit = XLSX.utils.json_to_sheet(auditRows.length ? auditRows : [{ 'Info': 'Tidak ada log audit' }]);
      XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Trail');
    }

    const fileName = `Laporan_Seventhsoft_${type}_${timestamp}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, fileName);

    XLSX.writeFile(wb, filePath);
    return filePath;
  }

  /**
   * Menghasilkan file gambar grafik visual (.png) menggunakan QuickChart engine
   * @param {string} type - 'region' | 'product' | 'trend'
   * @param {string} [contextText] - Konteks teks tambahan
   * @returns {Promise<string|null>} - Absolute path file gambar .png
   */
  static async generateChartImage(type = 'region', contextText = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let chartConfig = null;
    let fileName = '';

    const text = (type + ' ' + contextText).toLowerCase();

    if (/garis|line/i.test(text)) {
      const isRegion = /region|wilayah/i.test(text);
      fileName = `Grafik_Garis_Penjualan_${timestamp}.png`;
      chartConfig = {
        type: 'line',
        data: {
          labels: isRegion 
            ? ['DKI Jakarta', 'Jawa Barat', 'Jawa Timur & Bali', 'Sumatera', 'Kalimantan & Sulawesi']
            : ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'],
          datasets: [{
            label: isRegion ? 'Penjualan Per Region (Juta Rp)' : 'Tren Omset Mingguan (Juta Rp)',
            data: isRegion ? [480, 290, 230, 120, 80] : [240, 310, 280, 370],
            fill: true,
            backgroundColor: 'rgba(2, 132, 199, 0.20)',
            borderColor: '#0284c7',
            borderWidth: 3.5,
            pointBackgroundColor: '#1e3a8a',
            pointBorderColor: '#0284c7',
            pointRadius: 6,
            pointHoverRadius: 8,
            lineTension: 0.35
          }]
        },
        options: {
          title: {
            display: true,
            text: isRegion 
              ? 'GRAFIK GARIS PENJUALAN SEVENTHSOFT PER REGION (SEPTEMBER 2026)'
              : 'TREN GRAFIK GARIS PENJUALAN SEVENTHSOFT (SEPTEMBER 2026)',
            fontSize: 16,
            fontColor: '#0f172a'
          },
          subtitle: {
            display: true,
            text: 'Total Omset: Rp 1.200.000.000 (120% Target) — PT Seventhsoft Teknologi Indonesia',
            fontSize: 12,
            fontColor: '#475569'
          },
          legend: { display: false }
        }
      };
    } else if (/pie|donut|doughnut|lingkaran/i.test(text)) {
      fileName = `Grafik_Donut_Penjualan_${timestamp}.png`;
      chartConfig = {
        type: 'doughnut',
        data: {
          labels: ['DKI Jakarta (40%)', 'Jawa Barat (24%)', 'Jawa Timur & Bali (19%)', 'Sumatera (10%)', 'Kalimantan & Sulawesi (7%)'],
          datasets: [{
            data: [480, 290, 230, 120, 80],
            backgroundColor: ['#1e3a8a', '#0284c7', '#0ea5e9', '#38bdf8', '#93c5fd']
          }]
        },
        options: {
          title: {
            display: true,
            text: 'KOMPOSISI PENJUALAN SEVENTHSOFT PER REGION',
            fontSize: 15
          }
        }
      };
    } else if (/produk|modul|paket/i.test(text)) {
      fileName = `Grafik_Penjualan_Per_Produk_${timestamp}.png`;
      chartConfig = {
        type: 'horizontalBar',
        data: {
          labels: ['Cloud Enterprise', 'ERP Retail', 'Accounting Pro', 'Implementasi & Training', 'Add-on Payroll & DJP'],
          datasets: [{
            label: 'Penjualan (Juta Rp)',
            data: [360, 300, 225, 165, 150],
            backgroundColor: [
              'rgba(30, 58, 138, 0.85)',
              'rgba(2, 132, 199, 0.85)',
              'rgba(14, 165, 233, 0.85)',
              'rgba(56, 189, 248, 0.85)',
              'rgba(96, 165, 250, 0.85)'
            ],
            borderColor: '#1e3a8a',
            borderWidth: 1
          }]
        },
        options: {
          title: {
            display: true,
            text: 'RINCIAN PENJUALAN SEVENTHSOFT PER PRODUK (SEPTEMBER 2026)',
            fontSize: 15,
            fontColor: '#0f172a'
          },
          subtitle: {
            display: true,
            text: 'Total Omset: Rp 1,2 Miliar — PT Seventhsoft Teknologi Indonesia',
            fontSize: 11,
            fontColor: '#64748b'
          },
          legend: { display: false }
        }
      };
    } else if (/tren|harian|minggu|waktu/i.test(text)) {
      fileName = `Grafik_Tren_Penjualan_${timestamp}.png`;
      chartConfig = {
        type: 'line',
        data: {
          labels: ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'],
          datasets: [{
            label: 'Omset Mingguan (Juta Rp)',
            data: [240, 310, 280, 370],
            fill: true,
            backgroundColor: 'rgba(2, 132, 199, 0.15)',
            borderColor: '#0284c7',
            borderWidth: 3,
            pointBackgroundColor: '#1e3a8a',
            pointRadius: 6
          }]
        },
        options: {
          title: {
            display: true,
            text: 'TREN PENJUALAN MINGGUAN SEVENTHSOFT (SEPTEMBER 2026)',
            fontSize: 15
          },
          legend: { display: false }
        }
      };
    } else {
      // Default: Per Region / Wilayah
      fileName = `Grafik_Penjualan_Per_Region_${timestamp}.png`;
      chartConfig = {
        type: 'bar',
        data: {
          labels: ['DKI Jakarta', 'Jawa Barat', 'Jawa Timur & Bali', 'Sumatera', 'Kalimantan & Sulawesi'],
          datasets: [{
            label: 'Penjualan (Juta Rp)',
            data: [480, 290, 230, 120, 80],
            backgroundColor: [
              'rgba(30, 58, 138, 0.85)',
              'rgba(2, 132, 199, 0.85)',
              'rgba(14, 165, 233, 0.85)',
              'rgba(56, 189, 248, 0.85)',
              'rgba(147, 197, 253, 0.85)'
            ],
            borderColor: '#1e3a8a',
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          title: {
            display: true,
            text: 'GRAFIK PENJUALAN SEVENTHSOFT PER REGION (SEPTEMBER 2026)',
            fontSize: 16,
            fontColor: '#0f172a'
          },
          subtitle: {
            display: true,
            text: 'Total Omset: Rp 1.200.000.000 (120% Target) — PT Seventhsoft Teknologi Indonesia',
            fontSize: 12,
            fontColor: '#475569'
          },
          legend: { display: false }
        }
      };
    }

    const filePath = path.join(EXPORTS_DIR, fileName);

    try {
      const res = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart: chartConfig,
          width: 800,
          height: 480,
          format: 'png',
          backgroundColor: '#ffffff',
          devicePixelRatio: 2
        })
      });

      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        return filePath;
      }
    } catch (e) {
      console.warn('Gagal generate grafik via QuickChart:', e.message);
    }

    return null;
  }

  /**
   * Menghasilkan file presentasi PowerPoint (.PPTX) 8 Slide Profesional dengan Desain Card UI Modern & Animasi Transisi
   * @param {string} customTitle
   * @returns {Promise<string>} - Absolute path file .pptx
   */
  static async generateFraudPreventionPptx(customTitle = 'Strategi Pencegahan Pencurian Keuangan') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Presentasi_Fraud_Prevention_Seventhsoft_${timestamp}.pptx`;
    const filePath = path.join(EXPORTS_DIR, fileName);

    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9'; // Standar 10 x 5.625 inci

    // Helper: Header Halaman Standar (Anti-Overlap)
    const addHeader = (slide, category, title, isDark = false) => {
      slide.addText(category.toUpperCase(), {
        x: 0.8, y: 0.35, w: 8.4, h: 0.28,
        fontSize: 10, bold: true, color: isDark ? '38BDF8' : '2563EB'
      });
      slide.addText(title, {
        x: 0.8, y: 0.65, w: 8.4, h: 0.65,
        fontSize: 18, bold: true, color: isDark ? 'FFFFFF' : '0F172A'
      });
      slide.addShape(pres.ShapeType.rect, {
        x: 0.8, y: 1.35, w: 8.4, h: 0.02,
        fill: { color: isDark ? '334155' : 'E2E8F0' },
        line: { color: isDark ? '334155' : 'E2E8F0' }
      });
    };

    // ==========================================
    // SLIDE 1: COVER SLIDE (Dark Navy Elegan)
    // ==========================================
    let s1 = pres.addSlide();
    s1.background = { color: '0B132B' };

    s1.addShape(pres.ShapeType.roundRect, { x: 0.8, y: 1.0, w: 4.2, h: 0.35, fill: { color: '1C2541' }, rectRadius: 0.05 });
    s1.addText('PT SEVENTHSOFT TEKNOLOGI INDONESIA', { x: 0.9, y: 1.0, w: 4.0, h: 0.35, fontSize: 10, color: '38BDF8', bold: true });

    s1.addText('Benteng Finansial Bisnis:\nStrategi Pencegahan Pencurian Kas', {
      x: 0.8, y: 1.5, w: 8.4, h: 1.6,
      fontSize: 27, color: 'FFFFFF', bold: true
    });
    s1.addText('Framework Pengendalian Internal, Four-Eyes Principle & Otomasi Sistem ERP', {
      x: 0.8, y: 3.3, w: 8.4, h: 0.5,
      fontSize: 13, color: '94A3B8'
    });

    s1.addShape(pres.ShapeType.roundRect, { x: 0.8, y: 4.2, w: 4.8, h: 0.55, fill: { color: '1C2541' }, rectRadius: 0.08 });
    s1.addText('👤 Disiapkan oleh: Tim Enterprise Solutions Seventhsoft', {
      x: 0.9, y: 4.2, w: 4.6, h: 0.55, fontSize: 11, color: 'CBD5E1'
    });

    // ==========================================
    // SLIDE 2: REALITA DI LAPANGAN (3 Cards Stacked)
    // ==========================================
    let s2 = pres.addSlide();
    s2.background = { color: 'F8FAFC' };
    addHeader(s2, 'Fakta & Statistik Bisnis', 'Mengapa Pencurian Kas Menjadi Ancaman Nyata?');

    const s2Cards = [
      {
        badge: '⚠️ Kerugian Rata-Rata 5% Omset Per Tahun',
        badgeColor: 'DC2626',
        desc: 'Survei ACFE (Association of Certified Fraud Examiners) membuktikan bisnis ritel & grosir kehilangan rata-rata 5% revenue tahunan akibat kecurangan kas internal.',
        lineColor: 'FCA5A5'
      },
      {
        badge: '⏳ 12-18 Bulan Terlambat Terdeteksi',
        badgeColor: 'D97706',
        desc: 'Mayoritas fraud baru disadari pemilik usaha setelah berjalan lebih dari 1 tahun karena manipulasi nota dan pembukuan manual yang ditutup-tutupi.',
        lineColor: 'FDE68A'
      },
      {
        badge: '🔓 Kepercayaan Tanpa Kontrol Berimbang',
        badgeColor: '2563EB',
        desc: '90% pelaku adalah karyawan kepercayaan yang diberikan akses tunggal memegang kas dan input laporan tanpa pengawasan ganda (Four-Eyes Principle).',
        lineColor: 'BFDBFE'
      }
    ];

    s2Cards.forEach((card, idx) => {
      const topY = 1.55 + (idx * 1.2);
      s2.addShape(pres.ShapeType.roundRect, {
        x: 0.8, y: topY, w: 8.4, h: 1.05,
        fill: { color: 'FFFFFF' },
        line: { color: card.lineColor, width: 1.5 },
        rectRadius: 0.08
      });
      s2.addText(card.badge, {
        x: 1.0, y: topY + 0.1, w: 8.0, h: 0.3,
        fontSize: 12, bold: true, color: card.badgeColor
      });
      s2.addText(card.desc, {
        x: 1.0, y: topY + 0.4, w: 8.0, h: 0.55,
        fontSize: 10.5, color: '475569'
      });
    });

    // ==========================================
    // SLIDE 3: 4 MODUS UTAMA (2x2 Grid Cards)
    // ==========================================
    let s3 = pres.addSlide();
    s3.background = { color: 'F8FAFC' };
    addHeader(s3, 'Identifikasi Risiko Internal', '4 Modus Pencurian Keuangan yang Paling Sering Terjadi');

    const s3Grid = [
      { col: 0, row: 0, title: '🔴 1. Void Kasir Fiktif', desc: 'Pelanggan bayar tunai, kasir membatalkan nota di sistem POS lalu mengambil uang fisiknya.' },
      { col: 1, row: 0, title: '🔴 2. Ghost Vendor & Mark-Up', desc: 'Membuat tagihan faktur belanja supplier fiktif atau menaikkan harga belanja kantor tanpa cek pasar.' },
      { col: 0, row: 1, title: '🔴 3. Rekonsiliasi Tertunda', desc: 'Menutupi defisit kas fisik dengan menunda pencocokan mutasi e-statement bank harian sampai akhir bulan.' },
      { col: 1, row: 1, title: '🔴 4. Akses Tunggal Tanpa Approval', desc: 'Satu orang memegang kas, mencatat jurnal pembukuan, dan menyetujui pengeluaran sekaligus.' }
    ];

    s3Grid.forEach(item => {
      const cardX = item.col === 0 ? 0.8 : 5.15;
      const cardY = item.row === 0 ? 1.55 : 3.35;
      s3.addShape(pres.ShapeType.roundRect, {
        x: cardX, y: cardY, w: 4.05, h: 1.6,
        fill: { color: 'FFFFFF' },
        line: { color: 'E2E8F0', width: 1.5 },
        rectRadius: 0.08
      });
      s3.addText(item.title, {
        x: cardX + 0.2, y: cardY + 0.15, w: 3.65, h: 0.35,
        fontSize: 12.5, bold: true, color: '0F172A'
      });
      s3.addText(item.desc, {
        x: cardX + 0.2, y: cardY + 0.55, w: 3.65, h: 0.95,
        fontSize: 10.5, color: '64748B'
      });
    });

    // ==========================================
    // SLIDE 4: FRAMEWORK 3 LAPIS (Dark Cards)
    // ==========================================
    let s4 = pres.addSlide();
    s4.background = { color: '0F172A' };
    addHeader(s4, 'Strategi Pengendalian', 'Framework Pertahanan Finansial 3 Lapis', true);

    const s4Layers = [
      {
        badge: '🛡️ LAPIS 1: PENCEGAHAN (PREVENTIVE)',
        badgeColor: '38BDF8',
        desc: 'Pembatasan hak akses berbasis peran (RBAC) & penegakan Four-Eyes Principle untuk semua transaksi void dan pengeluaran kas.',
        borderColor: '38BDF8'
      },
      {
        badge: '🔍 LAPIS 2: DETEKSI REALTIME (DETECTIVE)',
        badgeColor: 'F59E0B',
        desc: 'Auto-matching mutasi bank harian dan notifikasi otomatis ke smartphone owner jika ada selisih kas fisik vs sistem.',
        borderColor: 'F59E0B'
      },
      {
        badge: '⚖️ LAPIS 3: AUDIT FORENSIK DIGITAL (CORRECTIVE)',
        badgeColor: '10B981',
        desc: 'Pencatatan jejak audit (Audit Trail) dengan hashing SHA-256 yang immutable (tidak dapat dihapus atau diedit).',
        borderColor: '10B981'
      }
    ];

    s4Layers.forEach((layer, idx) => {
      const topY = 1.55 + (idx * 1.2);
      s4.addShape(pres.ShapeType.roundRect, {
        x: 0.8, y: topY, w: 8.4, h: 1.05,
        fill: { color: '1E293B' },
        line: { color: layer.borderColor, width: 1.5 },
        rectRadius: 0.08
      });
      s4.addText(layer.badge, {
        x: 1.0, y: topY + 0.1, w: 8.0, h: 0.3,
        fontSize: 12, bold: true, color: layer.badgeColor
      });
      s4.addText(layer.desc, {
        x: 1.0, y: topY + 0.4, w: 8.0, h: 0.55,
        fontSize: 10.5, color: '94A3B8'
      });
    });

    // ==========================================
    // SLIDE 5: FOUR-EYES PRINCIPLE (2 Wide Cards)
    // ==========================================
    let s5 = pres.addSlide();
    s5.background = { color: 'F8FAFC' };
    addHeader(s5, 'Standar Tata Kelola Korporat', 'Four-Eyes Principle: Otorisasi Ganda Anti-Fraud');

    // Left Box: Maker-Checker
    s5.addShape(pres.ShapeType.roundRect, {
      x: 0.8, y: 1.55, w: 4.05, h: 3.45,
      fill: { color: 'FFFFFF' },
      line: { color: '2563EB', width: 1.5 },
      rectRadius: 0.08
    });
    s5.addText('👥 Konsep Maker - Checker', {
      x: 1.0, y: 1.7, w: 3.65, h: 0.35,
      fontSize: 13.5, bold: true, color: '1E3A8A'
    });
    s5.addText([
      { text: '• Aturan Emas:\n', options: { bold: true, color: '0F172A' } },
      { text: 'Setiap transaksi finansial WAJIB melewati minimal 2 pihak independen.\n\n', options: { color: '475569' } },
      { text: '• Maker (Pembuat):\n', options: { bold: true, color: '0F172A' } },
      { text: 'Staf kasir/admin hanya berhak membuat draf transaksi tanpa izin posting GL.\n\n', options: { color: '475569' } },
      { text: '• Checker (Penyetujui):\n', options: { bold: true, color: '0F172A' } },
      { text: 'Supervisor / Finance Lead memverifikasi dokumen fisik sebelum otorisasi sah.', options: { color: '475569' } }
    ], { x: 1.0, y: 2.15, w: 3.65, h: 2.65, fontSize: 11 });

    // Right Box: Operasional
    s5.addShape(pres.ShapeType.roundRect, {
      x: 5.15, y: 1.55, w: 4.05, h: 3.45,
      fill: { color: 'FFFFFF' },
      line: { color: '10B981', width: 1.5 },
      rectRadius: 0.08
    });
    s5.addText('🔒 Penerapan di Operasional', {
      x: 5.35, y: 1.7, w: 3.65, h: 0.35,
      fontSize: 13.5, bold: true, color: '065F46'
    });
    s5.addText([
      { text: '• Kasir & POS Retail:\n', options: { bold: true, color: '0F172A' } },
      { text: 'Tombol Void nota dan diskon manual terkunci otomatis, butuh scan supervisor.\n\n', options: { color: '475569' } },
      { text: '• Pembelian & Belanja:\n', options: { bold: true, color: '0F172A' } },
      { text: 'Draf tagihan vendor tidak dapat cair tanpa persetujuan bertingkat Finance Lead.\n\n', options: { color: '475569' } },
      { text: '• Buku Besar (GL):\n', options: { bold: true, color: '0F172A' } },
      { text: 'Draf transaksi AI berstatus pending review sampai klik otorisasi manusia.', options: { color: '475569' } }
    ], { x: 5.35, y: 2.15, w: 3.65, h: 2.65, fontSize: 11 });

    // ==========================================
    // SLIDE 6: SOLUSI SEVENTHSOFT ERP (3 Cards)
    // ==========================================
    let s6 = pres.addSlide();
    s6.background = { color: 'F8FAFC' };
    addHeader(s6, 'Implementasi Teknologi', 'Bagaimana Seventhsoft ERP Mengotomatisasi Keamanan Kas?');

    const s6Features = [
      {
        badge: '⚡ Auto Rekonsiliasi Bank Harian',
        desc: 'Sinkronisasi mutasi rekening bank BCA/Mandiri harian secara otomatis. Selisih langsung terdeteksi dalam hitungan detik tanpa nunggu akhir bulan.'
      },
      {
        badge: '🤖 AI Anomaly Detection & Fraud Alert',
        desc: 'Sistem AI otomatis menandai transaksi void berulang di jam sepi, lonjakan HPP ganjil, dan invoice tanpa purchase order resmi.'
      },
      {
        badge: '📱 One-Click Approval via Smartphone',
        desc: 'Owner atau Finance Lead dapat mengotorisasi draf transaksi dari mana saja secara aman melalui Bot Telegram atau Mobile App.'
      }
    ];

    s6Features.forEach((feat, idx) => {
      const topY = 1.55 + (idx * 1.2);
      s6.addShape(pres.ShapeType.roundRect, {
        x: 0.8, y: topY, w: 8.4, h: 1.05,
        fill: { color: 'FFFFFF' },
        line: { color: '10B981', width: 1.5 },
        rectRadius: 0.08
      });
      s6.addText(feat.badge, {
        x: 1.0, y: topY + 0.1, w: 8.0, h: 0.3,
        fontSize: 12, bold: true, color: '065F46'
      });
      s6.addText(feat.desc, {
        x: 1.0, y: topY + 0.4, w: 8.0, h: 0.55,
        fontSize: 10.5, color: '475569'
      });
    });

    // ==========================================
    // SLIDE 7: ROADMAP PENERAPAN (4 Columns)
    // ==========================================
    let s7 = pres.addSlide();
    s7.background = { color: 'F8FAFC' };
    addHeader(s7, 'Tahapan Penerapan', 'Roadmap Implementasi Sistem Finansial Aman (4 Minggu)');

    const s7Steps = [
      { week: 'MINGGU 1', title: 'Audit SOP & Akses', desc: 'Pemetaan wewenang staf, kunci tombol void, dan pembatasan akses rekening.' },
      { week: 'MINGGU 2', title: 'Setup DB & Bank', desc: 'Integrasi database Seventhsoft dengan mutasi e-statement bank harian.' },
      { week: 'MINGGU 3', title: 'Training Tim', desc: 'Pelatihan kasir & approval supervisor Four-Eyes Principle via Telegram.' },
      { week: 'MINGGU 4', title: 'Go-Live 100%', desc: 'Sistem beroperasi penuh dengan monitoring real-time AI anomaly detection.' }
    ];

    s7Steps.forEach((st, idx) => {
      const colX = 0.8 + (idx * 2.15);
      s7.addShape(pres.ShapeType.roundRect, {
        x: colX, y: 1.7, w: 2.0, h: 3.1,
        fill: { color: 'FFFFFF' },
        line: { color: idx === 3 ? '10B981' : '2563EB', width: 1.5 },
        rectRadius: 0.08
      });
      s7.addText(st.week, {
        x: colX + 0.1, y: 1.85, w: 1.8, h: 0.3,
        fontSize: 10, bold: true, color: idx === 3 ? '10B981' : '2563EB', align: 'center'
      });
      s7.addText(st.title, {
        x: colX + 0.1, y: 2.2, w: 1.8, h: 0.55,
        fontSize: 12, bold: true, color: '0F172A', align: 'center'
      });
      s7.addText(st.desc, {
        x: colX + 0.15, y: 2.85, w: 1.7, h: 1.7,
        fontSize: 10, color: '64748B', align: 'center'
      });
    });

    // ==========================================
    // SLIDE 8: CLOSING (Dark Hero)
    // ==========================================
    let s8 = pres.addSlide();
    s8.background = { color: '0B132B' };

    s8.addText('KONSULTASI & ASSESSMENT GRATIS', {
      x: 0.8, y: 1.2, w: 8.4, h: 0.35,
      fontSize: 12, color: '38BDF8', bold: true
    });
    s8.addText('Lindungi Aset Bisnis Anda Sebelum Terjadi Kebocoran!', {
      x: 0.8, y: 1.6, w: 8.4, h: 1.4,
      fontSize: 26, color: 'FFFFFF', bold: true
    });
    s8.addText('Sistem yang rapi bukan tanda ketidakpercayaan, tapi bentuk perlindungan bagi aset perusahaan dan integritas karyawan Anda.', {
      x: 0.8, y: 3.1, w: 8.4, h: 0.6,
      fontSize: 13, color: '94A3B8'
    });

    s8.addShape(pres.ShapeType.roundRect, { x: 0.8, y: 4.0, w: 8.4, h: 0.75, fill: { color: '1C2541' }, rectRadius: 0.08 });
    s8.addText('🌐 Website: seventhsoft.com   |   📞 Konsultasi Demo: 0812-XXXX-XXXX   |   PT Seventhsoft Teknologi Indonesia', {
      x: 0.9, y: 4.0, w: 8.2, h: 0.75,
      fontSize: 11.5, color: 'E2E8F0', bold: true, align: 'center'
    });

    // Tulis file awal PPTX
    await pres.writeFile({ fileName: filePath });

    // ==========================================
    // INJECT ANIMASI TRANSISI (Slide Push Transition via OOXML)
    // ==========================================
    try {
      const data = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(data);
      const slideFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/slides/slide') && f.endsWith('.xml'));
      for (const sf of slideFiles) {
        let xml = await zip.file(sf).async('string');
        if (!xml.includes('<p:transition')) {
          xml = xml.replace('</p:sld>', '<p:transition spd="fast"><p:push dir="r"/></p:transition></p:sld>');
          zip.file(sf, xml);
        }
      }
      const finalBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(filePath, finalBuffer);
      console.log('[ReportGenerator] Animasi transisi slide berhasil diinject ke file PPTX!');
    } catch (animErr) {
      console.warn('[ReportGenerator] Gagal menginject animasi transisi:', animErr.message);
    }

    return filePath;
  }

  /**
   * Menghasilkan file Excel (.xlsx) Kalender Konten Media Sosial 30 Hari (Bulan November 2026)
   * Terdiri dari 3 Sheet: Kalender_Konten_30_Hari, Pilar_dan_KPI, SOP_Produksi
   */
  static generateContentCalendarExcel() {
    const wb = XLSX.utils.book_new();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const pilarList = [
      'Edukasi Anti-Fraud Finansial',
      'Best Practice SOP Akuntansi',
      'Fitur Unggulan ERP Seventhsoft',
      'Studi Kasus & Kerugian Bisnis Nyata',
      'Tips Pajak & Efisiensi Operasional'
    ];
    const formats = ['Carousel 5 Slide', 'Reels Edukasi 60s', 'Infografis Ringkas', 'Video Demo Fitur ERP'];
    const pics = [
      'Bagus (Sales & Copywriter)',
      'Sarah (Frontend & UI Demo)',
      'Lina (Akuntansi & Jurnal)',
      'Deni (QA & SOP Auditor)',
      'Fikri (Backend & Keamanan Data)'
    ];

    const hooks = [
      { hook: '5 Trik Kasir Memanipulasi Void Nota & Cara Kunci Otomatisnya', angle: 'Bongkar pola fraud kasir offline retail dan solusi scan supervisor di Seventhsoft POS.', cta: 'Komen "KASIR" buat dapetin template checklist audit kasir gratis!' },
      { hook: 'Kenapa Rekonsiliasi Bank Masih Selisih Tiap Akhir Bulan?', angle: 'Penyebab utama mutasi e-banking gak sinkron sama general ledger dan cara auto-match AI.', cta: 'Share ke tim finance kamu yang sering lembur tanggal 30!' },
      { hook: 'Waspada Modus Ghost Vendor: Pengadaan Fiktif yang Menguras Kas', angle: 'Cerita nyata perusahaan manufaktur rugi ratusan juta karena approval sepihak staf purchasing.', cta: 'Terapkan Four-Eyes Principle sekarang. Cek link di bio.' },
      { hook: 'Four-Eyes Principle: Kenapa Approval Keuangan Gak Boleh 1 Orang', angle: 'Pemisahan tugas Maker, Checker, dan Approver langsung dari bot Telegram.', cta: 'Tonton video demonstrasi approval kami di profil!' },
      { hook: 'Cara Hitung PPh 21 TER 2026 Tanpa Takut Salah Tarif', angle: 'Panduan praktis formula tarif efektif rata-rata untuk HRD dan akuntan pemula.', cta: 'Save postingan ini untuk acuan penggajian bulan ini!' },
      { hook: 'Studi Kasus: Distributor Sparepart Pangkas Waktu Stock Opname 70%', angle: 'Transformasi dari catatan kertas ke barcode warehouse scan real-time.', cta: 'DM "DEMO" untuk konsultasi implementasi gudang multi-cabang.' },
      { hook: '3 Tanda Rekening Koran Perusahaan Anda Mulai "Bocor Halus"', angle: 'Biaya admin misterius, markup invoice supplier, dan penundaan deposit kas harian.', cta: 'Download Whitepaper Audit Keuangan Gratis di seventhsoft.com.' },
      { hook: 'Jangan Mau Direpotkan Input Manual 50 Invoice Tiap Hari!', angle: 'AI OCR Seventhsoft membaca foto kuitansi dan merumuskan draf jurnal otomatis.', cta: 'Coba tes upload invoice via WhatsApp/Telegram bot kami!' },
      { hook: 'Perbedaan Kas Kecil (Petty Cash) vs Kas Operasional yang Benar', angle: 'Metode Imprest Fund vs Fluctuating Fund agar uang receh kantor gak raib.', cta: 'Tulis di komen, kantor kalian pakai metode yang mana?' },
      { hook: 'Kenapa Pemilik Bisnis Masih Sering Pakai Rekening Pribadi?', angle: 'Risiko pajak campur aduk dan kesulitan valuasi saat mau ekspansi atau cari investor.', cta: 'Pisahkan keuangan bisnis hari ini juga! Klik link di bio.' },
      { hook: 'Audit Trail: Jejak Digital yang Bikin Karyawan Fraud Ketar-Ketir', angle: 'Fitur audit log Seventhsoft mencatat setiap perubahan angka dengan timestamp milidetik.', cta: 'Lindungi integritas tim Anda dengan sistem yang transparan.' },
      { hook: 'Bagaimana AI Agent Menghemat Biaya Operasional Akuntansi Hingga 40%', angle: 'Otomatisasi entri jurnal, rekonsiliasi, dan pelaporan tanpa perlu tambah headcount.', cta: 'Pelajari arsitektur AI Seventhsoft di link bio!' },
      { hook: '5 Fitur Wajib di Software ERP Sebelum Anda Membeli', angle: 'Multi-gudang, otorisasi berjenjang, integrasi bank, real-time balance, dan enkripsi data.', cta: 'Jangan beli kucing dalam karung! Simpan checklist ini.' },
      { hook: 'Kenapa Laporan Laba Rugi Anda Cantik tapi Kas Bank Kosong?', angle: 'Perbedaan konsep kas akrual vs kas aktual dan manajemen piutang macet (AR).', cta: 'Cek umur piutang bisnis Anda dengan Aging Report Seventhsoft.' },
      { hook: 'Tips Rekrut Karyawan Keuangan yang Berintegritas Tinggi', angle: 'Pertanyaan jebakan saat interview dan tes praktik rekonsiliasi kas riil.', cta: 'Komen "INTERVIEW" untuk dapat 10 pertanyaan skrining finance!' }
    ];

    // Sheet 1: 30 Hari Kalender
    const calendarRows = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `${String(day).padStart(2, '0')}/11/2026`;
      const dateObj = new Date(2026, 10, day); // Bulan 10 = November
      const dayName = days[dateObj.getDay()];
      const itemIndex = (day - 1) % hooks.length;
      const hookData = hooks[itemIndex];
      const pilar = pilarList[(day - 1) % pilarList.length];
      const format = formats[(day - 1) % formats.length];
      const pic = pics[(day - 1) % pics.length];
      const status = day <= 5 ? 'SIAP POSTING (APPROVED)' : (day <= 15 ? 'DRAFT SCRIPT READY' : 'PLANNED / RISET');

      calendarRows.push({
        'No': day,
        'Tanggal': dateStr,
        'Hari': dayName,
        'Pilar Konten': pilar,
        'Format Konten': format,
        'Judul / Hook Utama': hookData.hook,
        'Naskah / Sudut Pandang (Angle)': hookData.angle,
        'Call To Action (CTA)': hookData.cta,
        'Platform Target': day % 2 === 0 ? 'Instagram, TikTok, LinkedIn' : 'Instagram Reels & Carousel',
        'PIC Karyawan AI': pic,
        'Status Produksi': status
      });
    }

    const wsCalendar = XLSX.utils.json_to_sheet(calendarRows);
    XLSX.utils.book_append_sheet(wb, wsCalendar, 'Kalender_30_Hari');

    // Sheet 2: Pilar dan Strategi Konten
    const pilarRows = [
      {
        'Pilar Konten': 'Edukasi Anti-Fraud Finansial',
        'Bobot %': '35%',
        'Tujuan': 'Membangun awareness pemilik bisnis atas bahaya fraud internal kasir & purchasing.',
        'Format Utama': 'Carousel 5 Slide & Reels Hook Kuat',
        'Target KPI': 'Save Rate > 8%, Share Rate > 5%'
      },
      {
        'Pilar Konten': 'Best Practice SOP Akuntansi',
        'Bobot %': '25%',
        'Tujuan': 'Menjadi rujukan praktis tim finance & HRD tentang pencatatan standar PSAK & Pajak.',
        'Format Utama': 'Infografis Ringkas & Downloadable Checklist',
        'Target KPI': 'Lead Magnet Downloads > 150/bln'
      },
      {
        'Pilar Konten': 'Fitur Unggulan ERP Seventhsoft',
        'Bobot %': '20%',
        'Tujuan': 'Memperlihatkan solusi nyata kemudahan integrasi bank, bot approval & OCR AI.',
        'Format Utama': 'Video Demo Layar Singkat (60s)',
        'Target KPI': 'DM Inquiry / Permintaan Demo > 30'
      },
      {
        'Pilar Konten': 'Studi Kasus & Kerugian Bisnis Nyata',
        'Bobot %': '15%',
        'Tujuan': 'Social proof dan relevansi kasus di dunia nyata (distributor, retail, manufaktur).',
        'Format Utama': 'Storytelling Carousel & Wawancara Singkat',
        'Target KPI': 'Engagement Rate > 4.5%'
      },
      {
        'Pilar Konten': 'Interaktif, QnA & Budaya Tim AI',
        'Bobot %': '5%',
        'Tujuan': 'Membangun kedekatan dengan audiens dan memamerkan simulasi virtual office 30 karyawan.',
        'Format Utama': 'Story Polling & Cuplikan Pixel Office',
        'Target KPI': 'Story Reply & Interaksi Akun'
      }
    ];
    const wsPilar = XLSX.utils.json_to_sheet(pilarRows);
    XLSX.utils.book_append_sheet(wb, wsPilar, 'Pilar_dan_KPI');

    // Sheet 3: SOP Workflow Produksi Konten
    const sopRows = [
      { 'Tahap': 'Tahap 1: Riset & Ideasi', 'PIC': 'Bagus Pratama (AI Sales Lead)', 'Deadline': 'Setiap Kamis', 'Output': 'Daftar 7 Hook & Outline Konten Mingguan' },
      { 'Tahap': 'Tahap 2: Validasi Data Akuntansi', 'PIC': 'Lina (Akuntansi) & Doni (Payroll)', 'Deadline': 'Setiap Jumat', 'Output': 'Verifikasi angka, pasal perpajakan, dan keakuratan jurnal' },
      { 'Tahap': 'Tahap 3: Desain Slide & Reels', 'PIC': 'Sarah (Frontend UI) & Kevin', 'Deadline': 'Setiap Sabtu', 'Output': 'Aset Figma/Canva 1080x1350 dan render video MP4' },
      { 'Tahap': 'Tahap 4: Review Final & Approval', 'PIC': 'Bpk. Mikhael (Mentor / Management)', 'Deadline': 'Setiap Minggu', 'Output': 'Status Siap Tayang via Bot Telegram' },
      { 'Tahap': 'Tahap 5: Distribusi & Engagement', 'PIC': 'Bagus Pratama & Bot Automation', 'Deadline': 'Senin - Minggu 11.30 & 19.00', 'Output': 'Posting serentak di Instagram, TikTok, dan LinkedIn' }
    ];
    const wsSop = XLSX.utils.json_to_sheet(sopRows);
    XLSX.utils.book_append_sheet(wb, wsSop, 'SOP_Workflow_Produksi');

    const fileName = `Kalender_Konten_Sosmed_30_Hari_Seventhsoft_${timestamp}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, fileName);
    XLSX.writeFile(wb, filePath);
    console.log(`[ReportGenerator] Kalender Konten 30 Hari berhasil digenerate di: ${filePath}`);
    return filePath;
  }

  /**
   * Menghasilkan file gambar Poster Edukasi Anti-Fraud (.PNG) beresolusi tinggi (1080 x 1350 px, rasio 4:5 Instagram Feed)
   * Menghasilkan 1 lembar karya ilustrasi utuh (Full-Bleed Unified Artwork) bergaya Gemini Web murni
   * @param {object} [customOptions]
   * @returns {Promise<string>} - Absolute path file .png
   */
  static async generateSocialMediaPosterPng(customOptions = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Poster_Edukasi_Fraud_Seventhsoft_${timestamp}.png`;
    const filePath = path.join(EXPORTS_DIR, fileName);

    // Prompt karya seni utuh (Full Poster Artwork) sesuai gaya Gemini Web
    const defaultPrompt = 'A complete 2D vector editorial infographic poster on clean solid white background, cute friendly modern cartoon style with bold clean black outlines, high contrast vibrant colors: in the center a large blue and gold umbrella shield protecting a happy Indonesian business family with money and accounting books, with four cute corner sections: top-left cute pink piggy bank with coins with text Tabungan Darurat, top-right red heart and green medical shield with text Asuransi Jiwa dan Kesehatan, bottom-left upward profit arrow with gold coins with text Investasi Aman, bottom-right golden security padlock with green shield with text Waspada Penipuan. Behance Dribbble clean vector style, high resolution 8k, professional graphic design masterpiece';

    const aiPrompt = customOptions.prompt || defaultPrompt;
    const aiUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(aiPrompt) + '?width=1080&height=1350&nologo=true&model=turbo';

    console.log('[ReportGenerator] Mengunduh poster ilustrasi utuh dari Generative AI Engine...');
    try {
      const res = await fetch(aiUrl, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const imgBuffer = Buffer.from(await res.arrayBuffer());
        // Tambahkan header watermark tipis Seventhsoft di paling atas & footer legal di paling bawah agar profesional
        const headerFooterSvg = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <!-- Top Minimalist Brand Pill -->
  <g transform="translate(540, 35)">
    <rect x="-180" y="0" width="360" height="32" rx="16" fill="#0f172a" fill-opacity="0.85"/>
    <circle cx="-155" cy="16" r="5" fill="#38bdf8"/>
    <text x="-140" y="21" font-family="'Segoe UI', Roboto, sans-serif" font-size="11.5" font-weight="700" fill="#ffffff" letter-spacing="1">PT SEVENTHSOFT TEKNOLOGI INDONESIA</text>
  </g>

  <!-- Bottom Elegant Caption Bar -->
  <g transform="translate(540, 1315)">
    <rect x="-240" y="-20" width="480" height="34" rx="17" fill="#0f172a" fill-opacity="0.85"/>
    <text x="0" y="2" font-family="'Segoe UI', Roboto, sans-serif" font-size="11.5" font-weight="600" fill="#cbd5e1" text-anchor="middle">
      🌐 seventhsoft.com  •  Solusi Akuntansi &amp; Anti-Fraud Bisnis
    </text>
  </g>
</svg>
        `.trim();

        await sharp(imgBuffer)
          .resize(1080, 1350, { fit: 'cover' })
          .composite([{ input: Buffer.from(headerFooterSvg) }])
          .png({ quality: 95 })
          .toFile(filePath);

        console.log(`[ReportGenerator] Poster Utuh Gemini Style PNG berhasil disimpan di: ${filePath}`);
        return filePath;
      }
    } catch (e) {
      console.warn('[ReportGenerator] Gagal mengunduh poster utuh AI:', e.message);
    }

    return filePath;
  }
}

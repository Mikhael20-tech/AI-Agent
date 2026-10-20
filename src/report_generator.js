import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
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
        doc.fillColor(primaryColor).fontSize(15).font('Helvetica-Bold')
           .text('PT SEVENTHSOFT TEKNOLOGI INDONESIA', 36, 46);
        
        doc.fillColor(secondaryColor).fontSize(8.5).font('Helvetica')
           .text('Enterprise Accounting & ERP Solutions — Departemen Keuangan & HRD', 36, 64);
        doc.text('Gedung Cyber 2 Lt. 18, Jl. H.R. Rasuna Said, Jakarta Selatan | Telp: (021) 5290-8800', 36, 76);

        doc.moveTo(36, 92).lineTo(559, 92).strokeColor(tableBorder).stroke();

        // 3. Document Title Box
        doc.rect(36, 100, 523, 38).fill('#f8fafc');
        doc.rect(36, 100, 523, 38).strokeColor(accentColor).stroke();

        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
           .text('REKAPITULASI DAFTAR GAJI KARYAWAN (PAYROLL SUMMARY)', 45, 108, { align: 'center', width: 505 });
        doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
           .text(`Periode: ${payroll.period_label || payroll.period}  |  Tanggal Pembayaran: ${payroll.payment_date} (Via BCA Payroll)`, 45, 123, { align: 'center', width: 505 });

        // 4. Meta Information
        let y = 148;
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text('Informasi Otorisasi & Disburse Bank:', 36, y);
        y += 14;

        doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
        doc.text(`• Rekening Debet      : ${payroll.disbursement_bank}`, 40, y);
        doc.text(`• Status Payroll       : [ ${payroll.status} ]`, 320, y);
        y += 12;
        doc.text(`• Jurnal COA Debet  : ${payroll.coa_debet}`, 40, y);
        doc.text(`• Jurnal COA Kredit : ${payroll.coa_kredit}`, 320, y);
        y += 18;

        // 5. Table Header
        const tableTop = y;
        doc.rect(36, tableTop, 523, 18).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
        doc.text('No', 40, tableTop + 5, { width: 18 });
        doc.text('NIP', 60, tableTop + 5, { width: 45 });
        doc.text('Nama Karyawan', 108, tableTop + 5, { width: 105 });
        doc.text('Jabatan', 215, tableTop + 5, { width: 95 });
        doc.text('Gaji Pokok', 315, tableTop + 5, { width: 55, align: 'right' });
        doc.text('Tunjangan', 375, tableTop + 5, { width: 50, align: 'right' });
        doc.text('BPJS', 430, tableTop + 5, { width: 38, align: 'right' });
        doc.text('PPh 21', 472, tableTop + 5, { width: 38, align: 'right' });
        doc.text('Net THP', 514, tableTop + 5, { width: 42, align: 'right' });

        y = tableTop + 18;
        const emps = payroll.employees || [];

        emps.forEach((emp, idx) => {
          const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(36, y, 523, 16).fill(rowBg);

          doc.fillColor('#0f172a').fontSize(7).font('Helvetica');
          doc.text(String(idx + 1), 40, y + 4, { width: 18 });
          doc.text(emp.nip, 60, y + 4, { width: 45 });
          doc.font('Helvetica-Bold').text(emp.name, 108, y + 4, { width: 105 }).font('Helvetica');
          doc.text(emp.role, 215, y + 4, { width: 95 });
          doc.text((emp.base_salary || 0).toLocaleString('id-ID'), 315, y + 4, { width: 55, align: 'right' });
          doc.text((emp.allowance || 0).toLocaleString('id-ID'), 375, y + 4, { width: 50, align: 'right' });
          doc.text((emp.bpjs || 0).toLocaleString('id-ID'), 430, y + 4, { width: 38, align: 'right' });
          doc.text((emp.pph21 || 0).toLocaleString('id-ID'), 472, y + 4, { width: 38, align: 'right' });
          doc.font('Helvetica-Bold').text((emp.net || 0).toLocaleString('id-ID'), 514, y + 4, { width: 42, align: 'right' });

          doc.rect(36, y, 523, 16).strokeColor('#e2e8f0').stroke();
          y += 16;
        });

        // Total Row
        doc.rect(36, y, 523, 18).fill('#e0f2fe');
        doc.rect(36, y, 523, 18).strokeColor(accentColor).stroke();
        doc.fillColor(primaryColor).fontSize(7.5).font('Helvetica-Bold');
        doc.text('TOTAL SELURUH KARYAWAN', 60, y + 5, { width: 250 });
        doc.text((payroll.total_gross || 0).toLocaleString('id-ID'), 315, y + 5, { width: 110, align: 'right' });
        doc.text((payroll.total_bpjs || 0).toLocaleString('id-ID'), 430, y + 5, { width: 38, align: 'right' });
        doc.text((payroll.total_pph21 || 0).toLocaleString('id-ID'), 472, y + 5, { width: 38, align: 'right' });
        doc.text(`Rp ${(payroll.total_net || 0).toLocaleString('id-ID')}`, 500, y + 5, { width: 56, align: 'right' });

        y += 28;

        // 6. Ringkasan Finansial Card
        doc.rect(36, y, 523, 56).fill('#f8fafc');
        doc.rect(36, y, 523, 56).strokeColor(tableBorder).stroke();
        
        doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold').text('IKHTISAR ANGGARAN PAYROLL (GENERAL LEDGER RECONCILIATION):', 45, y + 7);
        doc.fontSize(7.5).font('Helvetica').fillColor('#334155');
        doc.text(`• Total Gaji Bruto (Gross Payroll)           : Rp ${(payroll.total_gross || 0).toLocaleString('id-ID')}`, 45, y + 21);
        doc.text(`• Total Pemotongan BPJS TK & Kes        : Rp ${(payroll.total_bpjs || 0).toLocaleString('id-ID')} (Disetor ke BPJS Ketenagakerjaan & Kesehatan)`, 45, y + 32);
        doc.text(`• Total Potongan PPh 21 Pegawai          : Rp ${(payroll.total_pph21 || 0).toLocaleString('id-ID')} (Kompilasi SPT Masa PPh 21)`, 45, y + 43);
        
        doc.fillColor('#047857').font('Helvetica-Bold');
        doc.text(`Total Bersih Ditransfer (Take Home Pay) :`, 320, y + 21);
        doc.fontSize(11).text(`Rp ${(payroll.total_net || 0).toLocaleString('id-ID')}`, 320, y + 34);

        y += 70;

        // 7. Tanda Tangan Resmi Four-Eyes Principle
        doc.fontSize(8).font('Helvetica').fillColor('#0f172a');
        doc.text('Dipersiapkan oleh,', 60, y);
        doc.text('Disetujui dan Diotorisasi,', 380, y);
        y += 38;

        doc.font('Helvetica-Bold');
        doc.text('Doni Saputra', 60, y);
        doc.text('Mikhael, S.Ak., CA', 380, y);
        y += 10;

        doc.font('Helvetica').fontSize(7).fillColor('#64748b');
        doc.text('Payroll Specialist (Seventhsoft)', 60, y);
        doc.text('Finance Lead (Otorisator Pembayaran)', 380, y);

        // 8. Footer UU PDP & ITE
        doc.moveTo(36, 765).lineTo(559, 765).strokeColor(tableBorder).stroke();
        doc.fontSize(6.5).font('Helvetica').fillColor('#94a3b8');
        doc.text('Dokumen resmi ini di-generate otomatis oleh Seventhsoft Accounting AI Agent. Dilindungi UU PDP No. 27/2022 dan UU ITE.', 36, 772, { align: 'center', width: 523 });

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
}

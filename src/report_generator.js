import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { db } from './database.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
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
   * Menghasilkan file Excel (.xlsx) komprehensif dari database Seventhsoft
   * @param {string} type - 'all', 'drafts', 'reconciliation', 'tax', 'audit'
   * @returns {string} - Absolute path file Excel yang dihasilkan
   */
  static generateExcelReport(type = 'all') {
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
}

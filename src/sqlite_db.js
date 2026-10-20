import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isVercel = !!process.env.VERCEL;
const DATA_DIR = isVercel ? '/tmp/data' : path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'seventhsoft.sqlite');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {}

let sqliteInstance = null;
try {
  sqliteInstance = new DatabaseSync(DB_PATH);
  initTables();
  console.log('[SQLite] Terhubung ke database relasional:', DB_PATH);
} catch (err) {
  console.warn('[SQLite] Gagal inisialisasi DatabaseSync, fallback ke JSON:', err.message);
}

function initTables() {
  if (!sqliteInstance) return;

  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      invoice_number TEXT,
      date TEXT,
      vendor_name TEXT,
      vendor_masked_npwp TEXT,
      vendor_masked_rek TEXT,
      type TEXT,
      items_json TEXT,
      subtotal REAL,
      ppn REAL,
      grand_total REAL,
      coa_debet TEXT,
      coa_kredit TEXT,
      status TEXT,
      creator_agent_id TEXT,
      approver_user_id TEXT,
      approval_notes TEXT,
      created_at TEXT,
      posted_at TEXT,
      is_deleted INTEGER DEFAULT 0,
      hash_signature TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      event TEXT,
      target_id TEXT,
      actor_type TEXT,
      actor_id TEXT,
      description TEXT,
      checksum TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS reconciliation (
      id TEXT PRIMARY KEY,
      date TEXT,
      bank_ref TEXT,
      description TEXT,
      bank_amount REAL,
      seventhsoft_gl_amount REAL,
      difference REAL,
      status TEXT,
      agent_flag TEXT
    );

    CREATE TABLE IF NOT EXISTS tax_summary (
      id TEXT PRIMARY KEY,
      period TEXT,
      ppn_keluaran REAL,
      ppn_masukan REAL,
      ppn_kurang_bayar REAL,
      pph_21_estimasi REAL,
      pph_23_estimasi REAL
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      period TEXT,
      total_gross REAL,
      total_bpjs REAL,
      total_pph21 REAL,
      total_net REAL,
      status TEXT,
      disbursement_bank TEXT,
      employees_json TEXT
    );
  `);
}

export class SQLiteStore {
  static isAvailable() {
    return !!sqliteInstance;
  }

  static getDB() {
    return sqliteInstance;
  }

  static syncAllFromJSON(jsonData) {
    if (!sqliteInstance || !jsonData) return;

    try {
      // 1. Sync Settings
      if (jsonData.settings) {
        const stmt = sqliteInstance.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(jsonData.settings)) {
          stmt.run(k, String(v));
        }
      }

      // 2. Sync Drafts
      if (Array.isArray(jsonData.drafts)) {
        const stmt = sqliteInstance.prepare(`
          INSERT OR REPLACE INTO drafts (
            id, invoice_number, date, vendor_name, vendor_masked_npwp, vendor_masked_rek,
            type, items_json, subtotal, ppn, grand_total, coa_debet, coa_kredit, status,
            creator_agent_id, approver_user_id, approval_notes, created_at, posted_at, is_deleted, hash_signature
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const d of jsonData.drafts) {
          stmt.run(
            d.id,
            d.invoice_number,
            d.date,
            d.vendor_name,
            d.vendor_masked_npwp,
            d.vendor_masked_rek,
            d.type || 'PEMBELIAN',
            JSON.stringify(d.items || []),
            d.subtotal || 0,
            d.ppn || 0,
            d.grand_total || 0,
            d.coa_debet,
            d.coa_kredit,
            d.status,
            d.creator_agent_id,
            d.approver_user_id || '',
            d.approval_notes || '',
            d.created_at || '',
            d.posted_at || '',
            d.is_deleted ? 1 : 0,
            d.hash_signature || ''
          );
        }
      }

      // 3. Sync Audit Logs
      if (Array.isArray(jsonData.audit_logs)) {
        const stmt = sqliteInstance.prepare(`
          INSERT OR REPLACE INTO audit_logs (id, timestamp, event, target_id, actor_type, actor_id, description, checksum)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const a of jsonData.audit_logs) {
          stmt.run(a.id, a.timestamp, a.event, a.target_id, a.actor_type, a.actor_id, a.description, a.checksum);
        }
      }

      // 4. Sync Reconciliation
      if (Array.isArray(jsonData.reconciliation)) {
        const stmt = sqliteInstance.prepare(`
          INSERT OR REPLACE INTO reconciliation (id, date, bank_ref, description, bank_amount, seventhsoft_gl_amount, difference, status, agent_flag)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const r of jsonData.reconciliation) {
          stmt.run(r.id, r.date, r.bank_ref, r.description, r.bank_amount || 0, r.seventhsoft_gl_amount || 0, r.difference || 0, r.status, r.agent_flag || '');
        }
      }

      // 5. Sync Tax Summary
      if (jsonData.tax_summary) {
        const t = jsonData.tax_summary;
        const stmt = sqliteInstance.prepare(`
          INSERT OR REPLACE INTO tax_summary (id, period, ppn_keluaran, ppn_masukan, ppn_kurang_bayar, pph_21_estimasi, pph_23_estimasi)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run('current_tax', t.period || '', t.ppn_keluaran || 0, t.ppn_masukan || 0, t.ppn_kurang_bayar || 0, t.pph_21_estimasi || 0, t.pph_23_estimasi || 0);
      }

      // 6. Sync Payroll
      if (jsonData.payroll) {
        const p = jsonData.payroll;
        const stmt = sqliteInstance.prepare(`
          INSERT OR REPLACE INTO payroll (id, period, total_gross, total_bpjs, total_pph21, total_net, status, disbursement_bank, employees_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run('current_payroll', p.period || '', p.total_gross || 0, p.total_bpjs || 0, p.total_pph21 || 0, p.total_net || 0, p.status || '', p.disbursement_bank || '', JSON.stringify(p.employees || []));
      }

      console.log('[SQLite] Berhasil sinkronisasi data relasional dari store JSON.');
    } catch (e) {
      console.warn('[SQLite] Gagal sinkronisasi data dari JSON:', e.message);
    }
  }

  static getDrafts() {
    if (!sqliteInstance) return null;
    try {
      const rows = sqliteInstance.prepare('SELECT * FROM drafts WHERE is_deleted = 0 ORDER BY created_at DESC').all();
      return rows.map(r => ({
        ...r,
        items: r.items_json ? JSON.parse(r.items_json) : [],
        is_deleted: !!r.is_deleted
      }));
    } catch (e) {
      return null;
    }
  }

  static getAuditLogs() {
    if (!sqliteInstance) return null;
    try {
      return sqliteInstance.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC').all();
    } catch (e) {
      return null;
    }
  }
}

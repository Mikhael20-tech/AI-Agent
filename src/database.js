import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'seventhsoft_store.json');

// Pastikan direktori data tersedia
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inisialisasi struktur database default
const DEFAULT_DATA = {
  settings: {
    telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
    telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '',
    finance_lead_name: 'Bpk. Hendra Wijaya, S.Ak., CA (Finance Lead)',
    approver_user_id: 'USR-FIN-001',
    seventhsoft_branch: 'CAB-JAKARTA-PUSAT',
    auto_notify_telegram: true
  },
  drafts: [
    {
      id: 'DFT-202610-001',
      invoice_number: 'INV/2026/X/0891',
      date: '2026-10-06',
      vendor_name: 'PT Mitra Sukses Logistik',
      vendor_masked_npwp: '01.***.***.*-054.000',
      vendor_masked_rek: 'BCA ****5678',
      type: 'PEMBELIAN',
      items: [
        { item_code: 'BRG-LOG-01', name: 'Jasa Angkut Kontainer 40ft', qty: 2, price: 3500000, total: 7000000 }
      ],
      subtotal: 7000000,
      ppn: 770000, // 11%
      grand_total: 7770000,
      coa_debet: '5-1100 (Beban Pengangkutan)',
      coa_kredit: '2-1100 (Hutang Usaha)',
      status: 'POSTED',
      creator_agent_id: 'AI-AGENT-01 (Data Entry Modul Beli)',
      approver_user_id: 'USR-FIN-001 (Finance Lead)',
      approval_notes: 'Faktur & Berita Acara pengiriman valid.',
      created_at: '2026-10-06T09:30:00.000Z',
      posted_at: '2026-10-06T10:15:20.000Z',
      is_deleted: false,
      hash_signature: '7a9e5b92df3e2b...'
    },
    {
      id: 'DFT-202610-002',
      invoice_number: 'INV/2026/X/0904',
      date: '2026-10-07',
      vendor_name: 'CV Sentosa Office Supply',
      vendor_masked_npwp: '02.***.***.*-011.000',
      vendor_masked_rek: 'Mandiri ****9012',
      type: 'PEMBELIAN',
      items: [
        { item_code: 'ATK-KRT-A4', name: 'Kertas PaperOne A4 80gr (Rim)', qty: 20, price: 55000, total: 1100000 },
        { item_code: 'ATK-TNR-01', name: 'Toner Cartridge LaserJet Black', qty: 2, price: 850000, total: 1700000 }
      ],
      subtotal: 2800000,
      ppn: 308000,
      grand_total: 3108000,
      coa_debet: '5-1200 (Beban Perlengkapan Kantor)',
      coa_kredit: '2-1100 (Hutang Usaha)',
      status: 'PENDING_APPROVAL',
      creator_agent_id: 'AI-AGENT-01 (Data Entry Modul Beli)',
      approver_user_id: null,
      approval_notes: null,
      created_at: '2026-10-07T14:20:00.000Z',
      posted_at: null,
      is_deleted: false,
      hash_signature: 'Pending verification'
    }
  ],
  reconciliation: [
    {
      id: 'REC-001',
      date: '2026-10-06',
      bank_ref: 'E-STMT-MDR-88912',
      description: 'Transfer Masuk Penjualan Grosir PT ABC',
      bank_amount: 15540000,
      seventhsoft_gl_amount: 15540000,
      gl_voucher: 'BKM-202610-044',
      difference: 0,
      status: 'MATCHED',
      agent_flag: 'Normal'
    },
    {
      id: 'REC-002',
      date: '2026-10-07',
      bank_ref: 'E-STMT-BCA-10293',
      description: 'Biaya Administrasi Bank Bulanan',
      bank_amount: -25000,
      seventhsoft_gl_amount: 0,
      gl_voucher: 'BELUM_TERCATAT',
      difference: -25000,
      status: 'UNMATCHED',
      agent_flag: 'Perlu Input Voucher Biaya Bank'
    },
    {
      id: 'REC-003',
      date: '2026-10-07',
      bank_ref: 'E-STMT-BCA-10294',
      description: 'Pelunasan Pelanggan Toko Maju Jaya',
      bank_amount: 8880000,
      seventhsoft_gl_amount: 8800000,
      gl_voucher: 'BKM-202610-048',
      difference: 80000,
      status: 'DISCREPANCY',
      agent_flag: 'Selisih Rp 80.000 (Potensi Diskon/Biaya Transfer)'
    }
  ],
  tax_summary: {
    period: 'Oktober 2026',
    ppn_keluaran: 45800000,
    ppn_masukan: 28450000,
    ppn_kurang_bayar: 17350000,
    pph_21_estimasi: 6200000,
    pph_23_estimasi: 1450000,
    hpp_anomalies: [
      {
        item_code: 'BRG-ELK-12',
        item_name: 'Smart Display Unit 24"',
        avg_hpp: 2100000,
        recent_hpp: 2950000,
        pct_increase: '+40.4%',
        reason: 'Lonjakan harga beli vendor > 20% tanpa notifikasi kenaikan bahan baku'
      }
    ]
  },
  audit_logs: [
    {
      id: 'AUD-LOG-0001',
      timestamp: '2026-10-06T09:30:05.000Z',
      event: 'DRAFT_CREATED',
      target_id: 'DFT-202610-001',
      actor_type: 'AI_AGENT',
      actor_id: 'AI-AGENT-01',
      description: 'Ekstraksi invoice INV/2026/X/0891 selesai. Data pribadi NIK/NPWP di-masking sesuai UU No. 27/2022. Draft dibuat.',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    {
      id: 'AUD-LOG-0002',
      timestamp: '2026-10-06T10:15:20.000Z',
      event: 'GL_POSTED',
      target_id: 'DFT-202610-001',
      actor_type: 'HUMAN_APPROVER',
      actor_id: 'USR-FIN-001',
      description: 'Otorisasi posting jurnal Seventhsoft disetujui oleh Finance Lead via Telegram Bot Inline Button.',
      checksum: 'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78'
    },
    {
      id: 'AUD-LOG-0003',
      timestamp: '2026-10-07T14:20:02.000Z',
      event: 'DRAFT_CREATED',
      target_id: 'DFT-202610-002',
      actor_type: 'AI_AGENT',
      actor_id: 'AI-AGENT-01',
      description: 'Ekstraksi dokumen ATK selesai. Draf menunggu review Four-Eyes Principle.',
      checksum: 'c2b48991a0c8427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149af'
    }
  ]
};

class Database {
  constructor() {
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Gagal membaca DB file, menginisialisasi default store:', e.message);
    }
    this.saveData(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  saveData(data = this.data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saat menyimpan ke DB:', e.message);
    }
  }

  generateChecksum(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload) + Date.now()).digest('hex');
  }

  // Record Audit Trail Sesuai UU ITE & PP PSTE
  logAudit({ event, target_id, actor_type, actor_id, description, metadata = {} }) {
    const logEntry = {
      id: `AUD-LOG-${String(this.data.audit_logs.length + 1).padStart(4, '0')}`,
      timestamp: new Date().toISOString(),
      event,
      target_id,
      actor_type,
      actor_id,
      description,
      metadata,
      checksum: this.generateChecksum({ event, target_id, actor_id, description })
    };
    this.data.audit_logs.push(logEntry);
    this.saveData();
    return logEntry;
  }

  getDrafts() {
    return this.data.drafts.filter(d => !d.is_deleted);
  }

  getDraftById(id) {
    return this.data.drafts.find(d => d.id === id && !d.is_deleted);
  }

  addDraft(draftData) {
    const id = `DFT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(this.data.drafts.length + 1).padStart(3, '0')}`;
    const newDraft = {
      id,
      invoice_number: draftData.invoice_number,
      date: draftData.date || new Date().toISOString().split('T')[0],
      vendor_name: draftData.vendor_name,
      vendor_masked_npwp: draftData.vendor_masked_npwp,
      vendor_masked_rek: draftData.vendor_masked_rek,
      type: draftData.type || 'PEMBELIAN',
      items: draftData.items || [],
      subtotal: draftData.subtotal || 0,
      ppn: draftData.ppn || 0,
      grand_total: draftData.grand_total || 0,
      coa_debet: draftData.coa_debet || '5-1000 (Beban Operasional)',
      coa_kredit: draftData.coa_kredit || '2-1100 (Hutang Usaha)',
      status: 'PENDING_APPROVAL', // Strict Four-Eyes Principle: Never direct post
      creator_agent_id: draftData.creator_agent_id || 'AI-AGENT-01 (Data Entry)',
      approver_user_id: null,
      approval_notes: null,
      created_at: new Date().toISOString(),
      posted_at: null,
      is_deleted: false,
      hash_signature: this.generateChecksum(draftData)
    };

    this.data.drafts.push(newDraft);
    this.logAudit({
      event: 'DRAFT_CREATED',
      target_id: id,
      actor_type: 'AI_AGENT',
      actor_id: newDraft.creator_agent_id,
      description: `Draft transaksi ${newDraft.invoice_number} berhasil dibuat oleh AI Agent. Status: PENDING_APPROVAL.`
    });

    this.saveData();
    return newDraft;
  }

  updateDraftStatus(id, { status, approver_user_id, notes }) {
    const draft = this.data.drafts.find(d => d.id === id);
    if (!draft) throw new Error('Draft tidak ditemukan');

    draft.status = status;
    draft.approver_user_id = approver_user_id || this.data.settings.approver_user_id;
    draft.approval_notes = notes || (status === 'POSTED' ? 'Disetujui oleh Finance Lead' : 'Ditolak/revisi');
    if (status === 'POSTED') {
      draft.posted_at = new Date().toISOString();
    }
    draft.updated_at = new Date().toISOString();

    this.logAudit({
      event: status === 'POSTED' ? 'GL_POSTED' : 'DRAFT_REJECTED',
      target_id: id,
      actor_type: 'HUMAN_APPROVER',
      actor_id: draft.approver_user_id,
      description: status === 'POSTED' 
        ? `Draft ${draft.invoice_number} disetujui dan resmi di-posting ke General Ledger Seventhsoft.`
        : `Draft ${draft.invoice_number} ditolak oleh verifikator: "${notes || 'Perlu perbaikan fisik'}".`
    });

    this.saveData();
    return draft;
  }

  // Kepatuhan UU KUP Perpajakan: Dilarang HARD DELETE (Soft delete only)
  softDeleteDraft(id, reason, userId) {
    const draft = this.data.drafts.find(d => d.id === id);
    if (!draft) throw new Error('Draft tidak ditemukan');

    draft.is_deleted = true;
    draft.deleted_at = new Date().toISOString();
    draft.delete_reason = reason;

    this.logAudit({
      event: 'DRAFT_ARCHIVED',
      target_id: id,
      actor_type: 'HUMAN_APPROVER',
      actor_id: userId || this.data.settings.approver_user_id,
      description: `Draft diarsipkan/soft-delete (Kepatuhan UU KUP, arsip tersimpan): "${reason}".`
    });

    this.saveData();
    return true;
  }

  getAuditLogs() {
    return [...this.data.audit_logs].reverse();
  }

  getReconciliation() {
    return this.data.reconciliation;
  }

  getTaxSummary() {
    return this.data.tax_summary;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.saveData();
    return this.data.settings;
  }
}

export const db = new Database();

import { db } from './database.js';

// ============================================================================
// 1. DATA PRIVACY & MASKING ENGINE (UU NO. 27/2022 PERLINDUNGAN DATA PRIBADI)
// ============================================================================
export class DataPrivacyMasker {
  /**
   * Masking NIK, NPWP, No. Rekening Bank, dan data pribadi sensitif
   * Sesuai mandat UU PDP sebelum data dikirim ke LLM / log eksternal.
   */
  static maskSensitiveData(text) {
    if (!text || typeof text !== 'string') return text;

    let masked = text;

    // 1. Mask NIK (16 digit angka) -> 3201************12
    masked = masked.replace(/\b(\d{4})\d{8,10}(\d{2})\b/g, '$1********$2 (MASKED-NIK)');

    // 2. Mask NPWP (e.g., 01.234.567.8-054.000 atau format 15/16 digit)
    masked = masked.replace(/(\d{2})\.(\d{3})\.(\d{3})\.(\d{1})-(\d{3})\.(\d{3})/g, '$1.***.***.*-$5.$6 (MASKED-NPWP)');
    masked = masked.replace(/\b(\d{2})(\d{7,10})(\d{3})\b/g, '$1*******$3 (MASKED-NPWP)');

    // 3. Mask Nomor Rekening Bank (10 - 14 digit)
    masked = masked.replace(/(Rekening|No\.?\s*Rek|Acc\.?\s*No|A\/C)\s*[:=]?\s*(\d{2,4})\d{4,8}(\d{3,4})/gi, '$1: $2******$3 (MASKED-REK)');

    return masked;
  }
}

// ============================================================================
// 2. AGENT 1: TRANSACTION & DATA ENTRY (MODUL BELI, JUAL, STOK)
// ============================================================================
export class TransactionDataEntryAgent {
  constructor(eventBus) {
    this.agentId = 'AI-AGENT-01 (Data Entry & Drafting)';
    this.eventBus = eventBus;
  }

  /**
   * Ekstraksi dokumen (Invoice / PO) & pembuatan draft Seventhsoft.
   * Kepatuhan: DILARANG posting final langsung. Wajib status PENDING_APPROVAL.
   */
  async processInvoiceDocument({ fileName, rawContent, docType = 'PEMBELIAN' }) {
    // 1. Broadcast event ke Avatar: Avatar mulai membaca & mengetik
    this.eventBus.emit('avatar_state', {
      state: 'typing',
      speech: `Agent 1 sedang menganalisis dokumen ${fileName}... Memvalidasi perhitungan & kepatuhan UU PDP.`
    });

    // Simulasi jeda analitik OCR AI
    await new Promise(r => setTimeout(r, 1200));

    // 2. Masking data pribadi
    const maskedRaw = DataPrivacyMasker.maskSensitiveData(rawContent || '');

    // 3. Parsing data invoice (bisa dari text mentah atau template terstruktur)
    const invoiceData = this.parseInvoiceDetails(maskedRaw, fileName, docType);

    // 4. Hitung PPN 11% & Validasi Angka
    const subtotal = invoiceData.items.reduce((sum, item) => sum + (item.qty * item.price), 0);
    const ppn = Math.round(subtotal * 0.11);
    const grand_total = subtotal + ppn;

    // 5. Simpan sebagai DRAFT di Database Seventhsoft
    const draft = db.addDraft({
      invoice_number: invoiceData.invoice_number,
      date: invoiceData.date,
      vendor_name: invoiceData.vendor_name,
      vendor_masked_npwp: invoiceData.vendor_masked_npwp,
      vendor_masked_rek: invoiceData.vendor_masked_rek,
      type: docType,
      items: invoiceData.items,
      subtotal,
      ppn,
      grand_total,
      coa_debet: docType === 'PEMBELIAN' ? '5-1200 (Beban Perlengkapan/Persediaan)' : '1-1200 (Piutang Usaha)',
      coa_kredit: docType === 'PEMBELIAN' ? '2-1100 (Hutang Usaha)' : '4-1100 (Pendapatan Penjualan)',
      creator_agent_id: this.agentId
    });

    // 6. Broadcast event ke Avatar: Menunggu Approval (Four-Eyes Principle)
    this.eventBus.emit('avatar_state', {
      state: 'waiting_approval',
      speech: `Draft ${draft.invoice_number} (Rp ${grand_total.toLocaleString('id-ID')}) selesai dibuat. Notifikasi terkirim ke Telegram Finance Lead untuk otorisasi final.`,
      draft
    });

    return { draft, maskedRaw };
  }

  parseInvoiceDetails(text, fileName, docType) {
    // Parser toleran yang bisa membaca struktur terstruktur maupun simulasi dokumen
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const today = new Date().toISOString().split('T')[0];

    // Deteksi nomor invoice bila ada
    const invMatch = text.match(/INV[\/\-\w\d]+/i) || text.match(/No\.?\s*Faktur\s*[:=]?\s*([\w\d\-\/]+)/i);
    const invNumber = invMatch ? (invMatch[1] || invMatch[0]) : `INV/2026/X/${randomSuffix}`;

    // Deteksi vendor
    const vendorMatch = text.match(/(PT|CV|UD|Toko)\s+[\w\s\.]+/i);
    const vendorName = vendorMatch ? vendorMatch[0].trim() : 'PT Sinergi Distribusi Prima';

    return {
      invoice_number: invNumber,
      date: today,
      vendor_name: vendorName,
      vendor_masked_npwp: '01.***.***.*-102.000',
      vendor_masked_rek: 'BCA ****7712',
      items: [
        {
          item_code: 'BRG-SPL-01',
          name: 'Paket Pengadaan Komponen Server',
          qty: 1,
          price: 12500000,
          total: 12500000
        },
        {
          item_code: 'SRV-INST-02',
          name: 'Jasa Konfigurasi & Kalibrasi',
          qty: 1,
          price: 2500000,
          total: 2500000
        }
      ]
    };
  }
}

// ============================================================================
// 3. AGENT 2: RECONCILIATION & AUDIT (MODUL KAS/BANK & GL)
// ============================================================================
export class ReconciliationAuditAgent {
  constructor(eventBus) {
    this.agentId = 'AI-AGENT-02 (Reconciliation & Audit)';
    this.eventBus = eventBus;
  }

  /**
   * Pencocokan mutasi e-statement bank dengan Kas Seventhsoft
   * Izin: Read-only pada mutasi dan buku besar
   */
  async performAuditCheck() {
    this.eventBus.emit('avatar_state', {
      state: 'typing',
      speech: 'Agent 2 sedang merekonsiliasi mutasi rekening koran bank dengan buku kas Seventhsoft...'
    });

    await new Promise(r => setTimeout(r, 1000));

    const records = db.getReconciliation();
    const unmatched = records.filter(r => r.status !== 'MATCHED');

    const result = {
      total_checked: records.length,
      matched: records.filter(r => r.status === 'MATCHED').length,
      unmatched_count: unmatched.length,
      discrepancies: unmatched,
      summary: unmatched.length === 0 
        ? 'Seluruh mutasi bank dan buku kas Seventhsoft 100% klop.'
        : `Ditemukan ${unmatched.length} catatan mutasi dengan selisih atau belum tercatat di GL.`
    };

    this.eventBus.emit('avatar_state', {
      state: unmatched.length > 0 ? 'alert' : 'idle',
      speech: result.summary
    });

    return result;
  }
}

// ============================================================================
// 4. AGENT 3: TAX & REPORTING ANALYST (MODUL PAJAK & LAPORAN)
// ============================================================================
export class TaxReportingAnalystAgent {
  constructor(eventBus) {
    this.agentId = 'AI-AGENT-03 (Tax & Reporting Analyst)';
    this.eventBus = eventBus;
  }

  /**
   * Rekap proyeksi PPN/PPh, draf laporan laba-rugi, dan peringatan margin/HPP ganjil.
   * Izin: Read & compute only (tanpa otorisasi kirim ke DJP).
   */
  async generateTaxAndMarginAnalysis() {
    this.eventBus.emit('avatar_state', {
      state: 'typing',
      speech: 'Agent 3 sedang menghitung rekapitulasi PPN, estimasi PPh, dan analisis anomali HPP...'
    });

    await new Promise(r => setTimeout(r, 1000));

    const summary = db.getTaxSummary();
    const drafts = db.getDrafts();

    // Hitung akumulasi PPN dari draft yang posted
    const postedPpn = drafts
      .filter(d => d.status === 'POSTED')
      .reduce((sum, d) => sum + (d.ppn || 0), 0);

    const analysis = {
      period: summary.period,
      ppn_keluaran: summary.ppn_keluaran,
      ppn_masukan_total: summary.ppn_masukan + postedPpn,
      ppn_kurang_bayar_est: Math.max(0, summary.ppn_keluaran - (summary.ppn_masukan + postedPpn)),
      pph_21: summary.pph_21_estimasi,
      pph_23: summary.pph_23_estimasi,
      hpp_anomalies: summary.hpp_anomalies,
      compliance_notes: 'Draft komputasi internal akuntansi. Belum dan tidak dapat dikirim ke sistem DJP secara otomatis.'
    };

    this.eventBus.emit('avatar_state', {
      state: 'idle',
      speech: `Analisis Pajak Selesai. PPN Kurang Bayar estimasi Rp ${analysis.ppn_kurang_bayar_est.toLocaleString('id-ID')}.`
    });

    return analysis;
  }
}

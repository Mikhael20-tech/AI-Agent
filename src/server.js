import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

import { db } from './database.js';
import { TransactionDataEntryAgent, ReconciliationAuditAgent, TaxReportingAnalystAgent, DataPrivacyMasker } from './ai_core.js';
import { TelegramBotService } from './telegram_bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const eventBus = new EventEmitter();

// Setup Multer untuk upload invoice
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: UPLOAD_DIR });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Inisialisasi Layanan & AI Agent
const telegramService = new TelegramBotService(eventBus);
const agent1 = new TransactionDataEntryAgent(eventBus);
const agent2 = new ReconciliationAuditAgent(eventBus);
const agent3 = new TaxReportingAnalystAgent(eventBus);

// Mulai polling Telegram jika token disiapkan
telegramService.startPolling();

// ============================================================================
// WEBSOCKET BROADCAST SYSTEM
// ============================================================================
const connectedClients = new Set();
let lastEmployeeSpeech = {
  empId: 'biz-bagus',
  name: 'Bagus',
  role: 'Enterprise Sales Lead',
  speech: 'Baik Pak Mikhael! Seluruh 30 staf di Kantor AI Seventhsoft dalam keadaan aktif dan siap membantu.'
};

wss.on('connection', (ws) => {
  connectedClients.add(ws);
  console.log(`[WS] Client terhubung. Total klien aktif: ${connectedClients.size}`);

  // Kirim status awal ke dashboard klien baru
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    avatar: { state: 'idle', speech: 'Halo, saya AI Accounting Assistant Seventhsoft. Sistem siap menerima invoice.' },
    drafts: db.getDrafts(),
    audit_logs: db.getAuditLogs().slice(0, 15),
    reconciliation: db.getReconciliation(),
    tax_summary: db.getTaxSummary(),
    settings: db.getSettings(),
    recent_speech: lastEmployeeSpeech
  }));

  ws.on('close', () => {
    connectedClients.delete(ws);
  });
});

function broadcast(eventType, data) {
  const payload = JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() });
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Teruskan event internal ke WebSocket
eventBus.on('avatar_state', (payload) => broadcast('AVATAR_STATE', payload));
eventBus.on('telegram_message_sent', (payload) => broadcast('TELEGRAM_MESSAGE', payload));
eventBus.on('draft_updated', (payload) => broadcast('DRAFT_UPDATED', payload));
eventBus.on('employee_speech', (payload) => {
  lastEmployeeSpeech = payload;
  console.log(`[WS BROADCAST] employee_speech: ${payload.name} -> "${payload.speech}" ke ${connectedClients.size} klien`);
  broadcast('EMPLOYEE_SPEECH', payload);
});

// ============================================================================
// REST API ROUTES
// ============================================================================

// 1. Status Umum & Info Agen
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    agents: [
      { id: 'AGENT_1', name: 'Transaction & Data Entry', role: 'OCR & Draft Creator (Four-Eyes Locked)', status: 'ACTIVE' },
      { id: 'AGENT_2', name: 'Reconciliation & Audit', role: 'Kas/Bank & GL Anomaly Detector (Read-Only)', status: 'ACTIVE' },
      { id: 'AGENT_3', name: 'Tax & Reporting Analyst', role: 'PPN/PPh & Margin Analysis (Read & Compute)', status: 'ACTIVE' }
    ],
    compliance: {
      uu_pdp: 'ACTIVE (Masking NIK, NPWP, Rekening)',
      uu_ite: 'ACTIVE (SHA-256 Audit Trail Signature)',
      uu_kup: 'ACTIVE (Strict No Hard-Delete Policy)'
    }
  });
});

// 2. Daftar Draft Seventhsoft
app.get('/api/drafts', (req, res) => {
  res.json(db.getDrafts());
});

// 3. Upload Dokumen & Jalankan Agent 1 (Ekstraksi & Pembuatan Draft)
app.post('/api/upload-document', upload.single('document'), async (req, res) => {
  try {
    let rawContent = req.body.raw_text || '';
    let fileName = req.file ? req.file.originalname : (req.body.filename || 'Dokumen_Invoice.pdf');

    if (req.file) {
      try {
        const fileBytes = fs.readFileSync(req.file.path, 'utf8');
        rawContent = fileBytes || rawContent;
      } catch (e) {
        // Fallback jika file biner
      }
    }

    if (!rawContent) {
      rawContent = `INVOICE PEMBELIAN
No: INV/2026/X/${Math.floor(1000 + Math.random() * 9000)}
Vendor: PT Cahaya Logistik Nusantara
NPWP: 01.382.912.4-012.000
No Rek: Mandiri 142001928374
Tanggal: ${new Date().toISOString().split('T')[0]}
Item 1: Server Rack 42U Server Storage (Qty: 1 @ Rp 14.500.000)
Subtotal: Rp 14.500.000
PPN 11%: Rp 1.595.000
Total: Rp 16.095.000`;
    }

    // Jalankan Agent 1
    const { draft, maskedRaw } = await agent1.processInvoiceDocument({
      fileName,
      rawContent,
      docType: req.body.doc_type || 'PEMBELIAN'
    });

    // Kirim notifikasi ke Telegram Finance Lead
    await telegramService.notifyPendingApproval(draft);

    broadcast('DRAFT_CREATED', draft);
    broadcast('AUDIT_UPDATED', db.getAuditLogs().slice(0, 10));

    res.json({
      success: true,
      message: 'Draft berhasil dibuat oleh AI Agent 1 dan notifikasi telah dikirim ke Telegram.',
      draft,
      masked_content: maskedRaw
    });
  } catch (err) {
    console.error('Error saat upload dokumen:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Human-in-the-Loop Review (Approval / Rejection Manual dari UI)
app.post('/api/drafts/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'APPROVE' | 'REJECT'
    const userApprover = db.getSettings().finance_lead_name;

    const result = await telegramService.handleCallbackAction(`${action}:${id}`, {
      first_name: userApprover,
      username: 'finance_lead_web'
    });

    broadcast('AUDIT_UPDATED', db.getAuditLogs().slice(0, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Jalankan Agent 2 (Rekonsiliasi Kas/Bank)
app.get('/api/reconciliation', (req, res) => {
  res.json(db.getReconciliation());
});

app.post('/api/reconciliation/run', async (req, res) => {
  try {
    const result = await agent2.performAuditCheck();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Jalankan Agent 3 (Analisis Pajak & HPP)
app.get('/api/tax-report', (req, res) => {
  res.json(db.getTaxSummary());
});

app.post('/api/tax-report/run', async (req, res) => {
  try {
    const result = await agent3.generateTaxAndMarginAnalysis();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Audit Logs (Kepatuhan UU ITE & UU KUP)
app.get('/api/audit-logs', (req, res) => {
  res.json(db.getAuditLogs());
});

// 8. Pengaturan & Telegram Config
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    // Restart polling jika token diubah
    if (req.body.telegram_bot_token) {
      telegramService.stopPolling();
      telegramService.startPolling();
    }
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Simulator Telegram Callback (Uji tombol inline approve/reject langsung dari UI)
app.post('/api/simulate-telegram-action', async (req, res) => {
  try {
    const { action_data } = req.body; // e.g. "APPROVE:DFT-202610-002"
    const result = await telegramService.handleCallbackAction(action_data, {
      first_name: 'Hendra Wijaya, CA',
      username: 'finance_lead_sim'
    });
    broadcast('AUDIT_UPDATED', db.getAuditLogs().slice(0, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Uji Kirim Pesan Langsung ke Telegram Bot
app.post('/api/test-telegram', async (req, res) => {
  try {
    const { token, chatId } = telegramService.getCredentials();
    if (!token || !chatId) {
      return res.status(400).json({ success: false, error: 'Token atau Chat ID Telegram belum diatur!' });
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🤖 <b>KONEKSI BERHASIL!</b>\nSistem AI Agent Akuntansi Seventhsoft berhasil terhubung ke Telegram Finance Lead.',
        parse_mode: 'HTML'
      })
    });
    const result = await response.json();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AI AGENT AKUNTANSI SEVENTHSOFT AKTIF PADA PORT ${PORT}`);
  console.log(`📡 URL Web: http://localhost:${PORT}`);
  console.log(`🤖 Agent 1: Data Entry & Drafting (Four-Eyes Protected)`);
  console.log(`🔍 Agent 2: Reconciliation & Audit (Bank vs Kas GL)`);
  console.log(`📊 Agent 3: Tax & Reporting Analyst (PPN/PPh & HPP)`);
  console.log(`🔒 Kepatuhan: UU PDP No. 27/2022, UU ITE, UU KUP`);
  console.log(`=======================================================`);
});

export default app;

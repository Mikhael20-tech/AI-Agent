import { VirtualOffice3D } from './office_3d.js';

// Inisialisasi 3D Virtual Office
let office3D = null;
try {
  office3D = new VirtualOffice3D('office-canvas-container', 'office-overlay-layer');
} catch (e) {
  console.error('Gagal menginisialisasi Three.js Virtual Office:', e);
}

// Elemen DOM
const draftsTableBody = document.getElementById('drafts-tbody');
const auditTableBody = document.getElementById('audit-tbody');
const recTableBody = document.getElementById('rec-tbody');
const tgChatArea = document.getElementById('tg-chat-area');
const liveSyncTimeEl = document.getElementById('live-sync-time');

// Update jam sinkronisasi
function updateClock() {
  if (liveSyncTimeEl) {
    const now = new Date();
    liveSyncTimeEl.textContent = now.toTimeString().split(' ')[0].replace(/:/g, '.');
  }
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================================
// 1. WEBSOCKET REAL-TIME CONNECTION
// ============================================================================
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}`;
let socket = null;

function connectWebSocket() {
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Terhubung ke Kantor AI WebSocket');
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('Error parse WS message:', e);
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'INIT_STATE':
      if (msg.drafts) renderDrafts(msg.drafts);
      if (msg.audit_logs) renderAuditLogs(msg.audit_logs);
      if (msg.reconciliation) renderReconciliation(msg.reconciliation);
      if (msg.tax_summary) renderTaxSummary(msg.tax_summary);
      if (msg.settings) populateSettings(msg.settings);
      break;

    case 'AVATAR_STATE':
      handleAgentVisualState(msg.data);
      break;

    case 'DRAFT_CREATED':
      loadDrafts();
      if (office3D) {
        office3D.updateAgentTask('agen-entry', `Ekstraksi ${msg.data.invoice_number} selesai (Masking NIK/NPWP)`, 'active');
        office3D.updateAgentTask('lead-finance', `⚠️ Menunggu persetujuan Telegram: ${msg.data.invoice_number}`, 'waiting');
      }
      break;

    case 'DRAFT_UPDATED':
      loadDrafts();
      if (office3D) {
        if (msg.data.status === 'POSTED') {
          office3D.triggerCelebration(`Draft ${msg.data.id} resmi disetujui & diposting ke General Ledger Seventhsoft oleh ${msg.data.approver || 'Lead'}`);
          office3D.updateAgentTask('lead-finance', `✅ Disetujui: Jurnal ${msg.data.id} resmi diposting ke GL`, 'approved');
          office3D.updateAgentTask('agen-rekon', `Mencatat mutasi GL untuk ${msg.data.id}`, 'active');
        } else {
          office3D.updateAgentTask('lead-finance', `❌ Ditolak: Dokumen ${msg.data.id} dikembalikan ke staf`, 'rejected');
        }
      }
      break;

    case 'AUDIT_UPDATED':
      renderAuditLogs(msg.data);
      break;

    case 'TELEGRAM_MESSAGE':
      appendTelegramMockMessage(msg.data);
      break;

    case 'EMPLOYEE_SPEECH':
      if (office3D) {
        office3D.triggerEmployeeSpeech(msg.data.empId, msg.data.name, msg.data.speech);
      }
      break;
  }
}

function handleAgentVisualState(payload) {
  if (!office3D) return;

  if (payload.state === 'typing') {
    office3D.updateAgentTask('agen-entry', payload.speech, 'typing');
  } else if (payload.state === 'approved') {
    office3D.updateAgentTask('lead-finance', payload.speech, 'approved');
  } else if (payload.state === 'rejected') {
    office3D.updateAgentTask('lead-finance', payload.speech, 'rejected');
  } else if (payload.state === 'waiting_approval') {
    office3D.updateAgentTask('lead-finance', payload.speech, 'waiting');
  }
}

// ============================================================================
// 2. TAB CONTROLS
// ============================================================================
document.querySelectorAll('.nav-pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-pill-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// ============================================================================
// 3. DRAFTS & APPROVAL TABLE
// ============================================================================
async function loadDrafts() {
  try {
    const res = await fetch('/api/drafts');
    const drafts = await res.json();
    renderDrafts(drafts);
  } catch (e) {
    console.error('Gagal mengambil draft:', e);
  }
}

function renderDrafts(drafts) {
  if (!draftsTableBody) return;

  draftsTableBody.innerHTML = drafts.map(d => {
    let chipClass = 'pending';
    let statusLabel = 'Pending Review';
    if (d.status === 'POSTED') { chipClass = 'posted'; statusLabel = 'GL Posted'; }
    if (d.status === 'REJECTED') { chipClass = 'rejected'; statusLabel = 'Ditolak'; }

    const isPending = d.status === 'PENDING_APPROVAL';

    return `
      <tr>
        <td><strong>${d.invoice_number}</strong><br><small style="color:#64748b">${d.id}</small></td>
        <td>${d.date}</td>
        <td>
          <strong>${d.vendor_name}</strong><br>
          <small style="color:#00f2fe;font-family:monospace">${d.vendor_masked_npwp || '-'}</small>
        </td>
        <td><strong style="color:#f8fafc">Rp ${d.grand_total.toLocaleString('id-ID')}</strong><br><small style="color:#64748b">PPN 11%: Rp ${(d.ppn || 0).toLocaleString('id-ID')}</small></td>
        <td><small style="color:#94a3b8">${d.coa_debet}<br>&rarr; ${d.coa_kredit}</small></td>
        <td>
          <span class="badge-status ${chipClass}">
            ${d.status === 'POSTED' ? '✓ ' : ''}${statusLabel}
          </span>
          ${d.approver_user_id ? `<br><small style="color:#64748b">${d.approver_user_id}</small>` : ''}
        </td>
        <td>
          ${isPending ? `
            <div style="display:flex;gap:4px;">
              <button class="btn-sm-action btn-sm-approve" onclick="window.approveDraft('${d.id}')">
                ✓ Setujui (GL)
              </button>
              <button class="btn-sm-action btn-sm-reject" onclick="window.rejectDraft('${d.id}')">
                ✕ Tolak
              </button>
            </div>
          ` : `
            <span style="color:#64748b;font-size:0.75rem;">Selesai (${d.status})</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

window.approveDraft = async function(id) {
  try {
    const res = await fetch(`/api/drafts/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'APPROVE', notes: 'Disetujui dari Konsol Kantor AI' })
    });
    const result = await res.json();
    if (result.success) {
      loadDrafts();
      loadAuditLogs();
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
};

window.rejectDraft = async function(id) {
  try {
    const notes = prompt('Alasan penolakan draft:', 'Fisik faktur tidak sesuai PO');
    if (notes === null) return;

    const res = await fetch(`/api/drafts/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REJECT', notes })
    });
    const result = await res.json();
    if (result.success) {
      loadDrafts();
      loadAuditLogs();
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
};

// ============================================================================
// 4. QUICK TRIGGER SAMPLE INVOICE (HERMES DEMO ACTION)
// ============================================================================
window.triggerSampleInvoice = async function() {
  if (office3D) {
    office3D.updateAgentTask('agen-entry', '⚡ Membaca invoice & masking data pribadi NIK/NPWP...', 'typing');
  }

  const sampleText = `FAKTUR PENGADAAN EXPEDISI
No: INV/2026/X/${Math.floor(1000 + Math.random() * 9000)}
Vendor: PT Buana Logistik Kargo
NPWP: 01.554.892.1-018.000
No Rekening: BCA 88201948291
Tanggal: 2026-10-07
Item: Jasa Sewa Kontainer (Qty: 2 @ Rp 6.000.000)
Subtotal: Rp 12.000.000
PPN 11%: Rp 1.320.000
Total: Rp 13.320.000`;

  try {
    const res = await fetch('/api/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_text: sampleText,
        filename: 'Invoice_Buana_Kargo.txt',
        doc_type: 'PEMBELIAN'
      })
    });
    const result = await res.json();
    if (result.success) {
      loadDrafts();
      loadAuditLogs();
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
};

// ============================================================================
// 5. TELEGRAM SMARTPHONE MOCKUP
// ============================================================================
function appendTelegramMockMessage(data) {
  if (!tgChatArea) return;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = `
    <div>${data.text.replace(/\n/g, '<br>')}</div>
    <div class="msg-actions">
      ${data.buttons.map(btn => `
        <button class="btn-tg-inline ${btn.callback_data.startsWith('APPROVE') ? 'ok' : 'no'}" 
                onclick="window.simulateTgCallback('${btn.callback_data}')">
          ${btn.text}
        </button>
      `).join('')}
    </div>
    <div style="font-size:0.65rem;color:#64748b;margin-top:0.4rem;text-align:right;">
      ${new Date().toLocaleTimeString('id-ID')}
    </div>
  `;

  tgChatArea.appendChild(bubble);
  tgChatArea.scrollTop = tgChatArea.scrollHeight;
}

window.simulateTgCallback = async function(callbackData) {
  try {
    const res = await fetch('/api/simulate-telegram-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_data: callbackData })
    });
    const result = await res.json();
    if (result.success) {
      const reply = document.createElement('div');
      reply.className = 'msg-bubble';
      reply.style.borderLeftColor = result.action === 'APPROVED' ? '#10b981' : '#f43f5e';
      reply.innerHTML = `<div>${result.text.replace(/\n/g, '<br>')}</div><div style="font-size:0.65rem;color:#64748b;margin-top:0.4rem;text-align:right;">${new Date().toLocaleTimeString('id-ID')}</div>`;
      tgChatArea.appendChild(reply);
      tgChatArea.scrollTop = tgChatArea.scrollHeight;

      loadDrafts();
      loadAuditLogs();
    } else {
      alert(result.message);
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
};

// ============================================================================
// 6. RECONCILIATION & AUDIT (AGENT 2)
// ============================================================================
function renderReconciliation(recs) {
  if (!recTableBody) return;

  recTableBody.innerHTML = recs.map(r => {
    let statusClass = 'posted';
    if (r.status === 'UNMATCHED') statusClass = 'rejected';
    if (r.status === 'DISCREPANCY') statusClass = 'pending';

    return `
      <tr>
        <td><strong>${r.bank_ref}</strong><br><small style="color:#64748b">${r.date}</small></td>
        <td>${r.description}</td>
        <td><strong>Rp ${r.bank_amount.toLocaleString('id-ID')}</strong></td>
        <td>${r.gl_voucher !== 'BELUM_TERCATAT' ? `Rp ${r.seventhsoft_gl_amount.toLocaleString('id-ID')} (${r.gl_voucher})` : '<em style="color:#f43f5e">Belum Tercatat di GL</em>'}</td>
        <td><strong style="color:${r.difference === 0 ? '#10b981' : '#f59e0b'}">Rp ${r.difference.toLocaleString('id-ID')}</strong></td>
        <td><span class="badge-status ${statusClass}">${r.status}</span></td>
        <td><small style="color:#cbd5e1">${r.agent_flag}</small></td>
      </tr>
    `;
  }).join('');
}

window.triggerAgent2Audit = async function() {
  if (office3D) {
    office3D.updateAgentTask('agen-rekonsiliasi', '⚡ Membandingkan e-statement bank vs Kas Seventhsoft...', 'typing');
  }

  try {
    const res = await fetch('/api/reconciliation/run', { method: 'POST' });
    const data = await res.json();
    renderReconciliation(db_recs => db_recs);
    alert(`Audit Rekonsiliasi Selesai:\n${data.summary}`);
  } catch (e) {
    alert('Error: ' + e.message);
  }
};

// ============================================================================
// 7. TAX REPORT & AUDIT LOGS
// ============================================================================
function renderTaxSummary(tax) {
  const elKeluaran = document.getElementById('tax-ppn-keluaran');
  const elMasukan = document.getElementById('tax-ppn-masukan');
  const elKurang = document.getElementById('tax-ppn-kurang');
  const hppBody = document.getElementById('hpp-tbody');

  if (elKeluaran) elKeluaran.textContent = `Rp ${(tax.ppn_keluaran || 0).toLocaleString('id-ID')}`;
  if (elMasukan) elMasukan.textContent = `Rp ${(tax.ppn_masukan || 0).toLocaleString('id-ID')}`;
  if (elKurang) elKurang.textContent = `Rp ${(tax.ppn_kurang_bayar || 0).toLocaleString('id-ID')}`;

  if (hppBody && tax.hpp_anomalies) {
    hppBody.innerHTML = tax.hpp_anomalies.map(a => `
      <tr>
        <td><strong>${a.item_code}</strong></td>
        <td>${a.item_name}</td>
        <td>Rp ${a.avg_hpp.toLocaleString('id-ID')}</td>
        <td><strong style="color:#f59e0b">Rp ${a.recent_hpp.toLocaleString('id-ID')}</strong></td>
        <td><span class="badge-status rejected">${a.pct_increase}</span></td>
        <td><small style="color:#f43f5e">${a.reason}</small></td>
      </tr>
    `).join('');
  }
}

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/audit-logs');
    const logs = await res.json();
    renderAuditLogs(logs);
  } catch (e) {
    console.error('Gagal mengambil audit log:', e);
  }
}

function renderAuditLogs(logs) {
  if (!auditTableBody) return;

  auditTableBody.innerHTML = logs.map(l => {
    const isHuman = l.actor_type === 'HUMAN_APPROVER';
    return `
      <tr>
        <td><code>${l.id}</code></td>
        <td><small style="color:#94a3b8">${new Date(l.timestamp).toLocaleString('id-ID')}</small></td>
        <td><span class="badge-status ${l.event.includes('POSTED') ? 'posted' : (l.event.includes('REJECTED') ? 'rejected' : 'pending')}">${l.event}</span></td>
        <td><code>${l.target_id}</code></td>
        <td>
          <span style="color:${isHuman ? '#34d399' : '#38bdf8'};font-weight:700;">
            ${isHuman ? '👤 ' : '🤖 '}${l.actor_id}
          </span>
        </td>
        <td><small style="color:#cbd5e1">${l.description}</small></td>
        <td><code style="font-size:0.68rem;color:#00f2fe">${(l.checksum || '').substring(0, 16)}...</code></td>
      </tr>
    `;
  }).join('');
}

function populateSettings(settings) {
  const token = document.getElementById('cfg-bot-token');
  const chat = document.getElementById('cfg-chat-id');
  const approver = document.getElementById('cfg-approver-name');

  if (token && settings.telegram_bot_token) token.value = settings.telegram_bot_token;
  if (chat && settings.telegram_chat_id) chat.value = settings.telegram_chat_id;
  if (approver && settings.finance_lead_name) approver.value = settings.finance_lead_name;
}

// Inisialisasi awal
window.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  loadDrafts();
  loadAuditLogs();

  // 1. FILTER DIVISI PEGAWAI
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (office3D) office3D.setDivisionFilter(btn.dataset.filter);
    });
  });

  // 2. TOGGLE LABELS & RESET CAMERA
  const btnToggleLabels = document.getElementById('btn-toggle-labels');
  if (btnToggleLabels) {
    btnToggleLabels.addEventListener('click', () => {
      if (office3D) {
        const isVis = office3D.toggleLabels();
        btnToggleLabels.textContent = isVis ? '🏷️ Label: ON' : '🏷️ Label: OFF';
        btnToggleLabels.style.background = isVis ? '' : '#f43f5e';
        btnToggleLabels.style.color = isVis ? '' : '#fff';
      }
    });
  }

  const btnResetCam = document.getElementById('btn-reset-cam');
  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
      if (office3D && office3D.controls) {
        office3D.camera.position.copy(office3D.defaultCameraPos);
        office3D.controls.target.copy(office3D.cameraTarget);
      }
    });
  }

  // 3. EMPLOYEE DOSSIER INSPECTOR
  const inspector = document.getElementById('employee-inspector');
  const closeInspector = document.getElementById('close-inspector');
  if (closeInspector && inspector) {
    closeInspector.addEventListener('click', () => {
      inspector.classList.remove('open');
    });
  }

  window.addEventListener('employee_selected', (e) => {
    const emp = e.detail;
    if (!inspector) return;
    const nameEl = document.getElementById('insp-name');
    const roleEl = document.getElementById('insp-role');
    const deptEl = document.getElementById('insp-dept');
    const taskEl = document.getElementById('insp-task');
    const avatarEl = document.getElementById('insp-avatar');

    if (nameEl) nameEl.textContent = emp.name;
    if (roleEl) roleEl.textContent = emp.role;
    if (deptEl) deptEl.textContent = `DIVISI ${emp.dept.toUpperCase()}`;
    if (taskEl) taskEl.textContent = emp.task;

    const avatars = { finance: '📊', tech: '💻', product: '🚀', lounge: '☕' };
    if (avatarEl) avatarEl.textContent = avatars[emp.dept] || '👤';

    inspector.classList.add('open');
  });

  document.getElementById('btn-insp-chat')?.addEventListener('click', () => {
    const name = document.getElementById('insp-name')?.textContent || 'Pegawai';
    alert(`💬 Anda menyapa ${name}: "Semangat kerjanya ya!" Pegawai tersenyum dan mengangguk ramah.`);
  });

  document.getElementById('btn-insp-task')?.addEventListener('click', () => {
    const name = document.getElementById('insp-name')?.textContent || 'Pegawai';
    alert(`⚡ Tugas prioritas baru berhasil dikirimkan ke antrean kerja ${name}!`);
  });
});

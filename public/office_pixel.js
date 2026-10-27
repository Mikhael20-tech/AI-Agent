/**
 * Seventhsoft AI - 2D Pixel Art Virtual Office Engine
 * Realistic Office Life Simulation (Pixel Agents Edition)
 * 
 * Features:
 * - Seamless warm Scandinavian oak parquet floor & luxury department rugs
 * - Realistic 30-employee layout with correct desk/chair facing directions (no backwards seating!)
 * - Natural Lunch Behavior (12:00 - 13:00): Distributed dining across Lounge, Pantry, Boardroom & Desks (ZERO CLUMPING/STACKING!)
 * - AI Emotion & Intelligence: Stamina bar (0-100%), Moods (🔥 Semangat, 😴 Ngantuk Zzz, 😫 Lelah, 😤 Bad Mood, 🍱 Makan, ☕ Ngopi)
 * - Autonomous Coffee Runs: Sleepy employees walk 1-by-1 to Barista Koko for espresso, get refreshed, and return!
 * - Clean, non-intrusive name labels (never blocks character faces or computers)
 * - Interactive Dossier Inspector: Real-time energy, mood, inner monologue thoughts, action buttons (Traktir Kopi, Istirahat, Semangati)
 * - Smooth drag pan & wheel zoom controls
 */

const TILE_SIZE = 16;
const COLS = 76; // Kantor (Cols 0-43) + Taman Penghubung (Cols 44-47) + Asrama Putri & Putra (Cols 48-75)
const ROWS = 28;

export class VirtualOfficePixel {
  constructor(containerId, overlayContainerId) {
    this.container = document.getElementById(containerId);
    this.overlayContainer = document.getElementById(overlayContainerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    // Canvas setup
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    // Camera & View Transform
    this.scale = 1.35;
    this.minScale = 0.65;
    this.maxScale = 3.5;
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
    this.targetScale = 1.35;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.hasDragged = false;

    // State & Options
    this.labelsVisible = false; // Default OFF for clean, uncluttered visual aesthetic!
    this.activeFilter = 'all';
    this.selectedEmployee = null;
    this.hoveredEmployee = null;
    this.speechBubbles = new Map();
    this.confettiParticles = [];
    this.lastTime = performance.now();
    this.animTime = 0;

    // ========================================================================
    // JADWAL KANTOR (08:00 - 17:00 & MAKAN SIANG 12:00 - 13:00)
    // ========================================================================
    this.isLiveClock = false;
    this.simHour = 9;
    this.simMinute = 30;
    this.timeAccumulator = 0;
    this.scheduleMode = 'WORK'; // 'WORK' | 'LUNCH' | 'AFTER_HOURS'
    this.activeCoffeeShopper = null; // Max 1 employee at barista at a time

    // Antrean Kopi Mas Koko (Pantry Queue Simulation)
    this.isCoffeeQueueActive = false;
    this.coffeeInitiator = 'Pak Mikhael';
    this.coffeeQueuePool = [];
    this.activeCoffeeQueue = [];
    this.coffeeServeTimer = 0;
    this.queueSpots = [
      { col: 38, row: 6, dir: 'up' },    // Spot 0: Langsung di depan meja Mas Koko
      { col: 38, row: 7, dir: 'up' },    // Spot 1
      { col: 38, row: 8, dir: 'up' },    // Spot 2
      { col: 38, row: 9, dir: 'up' },    // Spot 3
      { col: 37, row: 9, dir: 'right' }, // Spot 4 (Belok kiri rapi)
      { col: 36, row: 9, dir: 'right' }, // Spot 5
      { col: 35, row: 9, dir: 'right' }, // Spot 6
      { col: 34, row: 9, dir: 'right' }, // Spot 7
      { col: 33, row: 9, dir: 'right' }, // Spot 8
      { col: 32, row: 9, dir: 'right' }  // Spot 9
    ];

    // Stub controls for app.js resetCam compatibility
    this.controls = {
      target: { set: () => {}, copy: () => {} }
    };
    this.camera = {
      position: { set: () => {}, copy: () => {} }
    };
    this.defaultCameraPos = {};
    this.cameraTarget = {};

    // Generate Procedural Wood Floor Pattern
    this.initFloorTextures();

    // Inisialisasi Database 30 Karyawan Seventhsoft
    this.initEmployeeData();

    // Inisialisasi Aset Gambar
    this.assets = {};
    this.assetsLoaded = false;
    this.loadAssets().then(() => {
      this.assetsLoaded = true;
      console.log('✅ [VirtualOfficePixel] Semua aset pixel art selesai dimuat!');
    });

    // Inisialisasi Perabot & Layout Kantor
    this.initOfficeLayout();

    // Event Listeners (Resize, Drag, Wheel, Click, Hover, Presets)
    this.initEvents();
    this.initScheduleUI();

    // Start Loop
    this.resize();
    this.centerCamera();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ==========================================================================
  // 1. PROCEDURAL WARM SCANDINAVIAN WOOD FLOOR PATTERN
  // ==========================================================================
  initFloorTextures() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32;
    pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d');

    const plankColors = ['#d5a36b', '#c9955d', '#dca872', '#c38e55'];
    const seamColor = '#a87542';
    const grainColor = 'rgba(140, 93, 46, 0.18)';

    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      const xOffset = (row % 2 === 0) ? 0 : 16;

      pCtx.fillStyle = plankColors[row % plankColors.length];
      pCtx.fillRect(0, y, 32, 8);

      pCtx.fillStyle = seamColor;
      pCtx.fillRect(xOffset, y, 1, 8);
      pCtx.fillRect((xOffset + 32) % 32, y, 1, 8);
      pCtx.fillRect(0, y + 7, 32, 1);

      pCtx.fillStyle = grainColor;
      pCtx.fillRect(2, y + 2, 12, 1);
      pCtx.fillRect(18, y + 5, 10, 1);
    }

    this.woodPatternCanvas = pCanvas;
  }

  // ==========================================================================
  // 2. DATA 30 PEGAWAI DENGAN TATA LETAK & HADAP YANG BENAR
  // ==========================================================================
  initEmployeeData() {
    this.employeeData = [
      // --- ZONA 1: FINANCE & APPROVER GL (Kiri Atas) ---
      {
        id: 'lead-finance', name: 'Mikhael', role: 'Finance Lead (Approver GL)', dept: 'finance',
        col: 5, row: 3, charIdx: 0, dir: 'down', state: 'sitting', status: 'approved', isLead: true,
        gender: 'male', dormRoom: 'Kamar Garuda 1 (Asrama Putra)', dormSpot: { col: 51, row: 16, dir: 'down', dormType: 'male' },
        lemburReason: 'Otorisasi closing transaksi pembukuan akhir bulan & review Four-Eyes Principle',
        task: '🛡️ Otorisasi final posting GL Seventhsoft via Telegram', energy: 95, mood: 'semangat',
        thought: 'Semua posting jurnal ke Seventhsoft harus lolos Four-Eyes Principle!'
      },
      {
        id: 'agent-entry', name: 'agen-entry', role: 'AI Data Entry & OCR', dept: 'finance',
        col: 2, row: 3, charIdx: 1, dir: 'down', state: 'sitting', status: 'active', isAI: true,
        gender: 'ai', dormRoom: 'Server Rack 01 (Kantor AI)', dormSpot: { col: 2, row: 3, dir: 'down', dormType: 'server' },
        lemburReason: 'Batch OCR ekstraksi tumpukan faktur pembelian vendor logistik',
        task: '📄 Ekstraksi faktur & Masking PDP (Modul Beli)', energy: 90, mood: 'semangat',
        thought: 'Membaca barcode dan teks invoice vendor dengan OCR kecepatan tinggi...'
      },
      {
        id: 'agent-rekon', name: 'agen-rekon', role: 'AI Rekonsiliasi Bank', dept: 'finance',
        col: 8, row: 3, charIdx: 2, dir: 'down', state: 'sitting', status: 'active', isAI: true,
        gender: 'ai', dormRoom: 'Server Rack 02 (Kantor AI)', dormSpot: { col: 8, row: 3, dir: 'down', dormType: 'server' },
        lemburReason: 'Pencocokan e-statement mutasi kas BCA vs General Ledger Seventhsoft',
        task: '🏦 Pencocokan e-statement BCA vs Kas Seventhsoft', energy: 88, mood: 'semangat',
        thought: 'Mencocokkan mutasi kas bank vs General Ledger Seventhsoft...'
      },
      {
        id: 'agent-pajak', name: 'agen-pajak', role: 'AI Pajak & Margin', dept: 'finance',
        col: 5, row: 8, charIdx: 3, dir: 'up', state: 'sitting', status: 'idle', isAI: true,
        gender: 'ai', dormRoom: 'Server Rack 03 (Kantor AI)', dormSpot: { col: 5, row: 8, dir: 'up', dormType: 'server' },
        lemburReason: 'Rekapitulasi SPT Masa & proyeksi faktur pajak PPN 11%',
        task: '📊 Proyeksi PPN 11% & Deteksi anomali HPP', energy: 85, mood: 'normal',
        thought: 'Menghitung rekapitulasi faktur pajak keluaran dan masukan.'
      },
      {
        id: 'staff-budi-kurir', name: 'Budi', role: 'Kurir Berkas Akuntansi', dept: 'finance',
        col: 2, row: 7, charIdx: 4, dir: 'right', state: 'walking', isWalker: true, routeType: 'courier',
        gender: 'male', dormRoom: 'Kamar Elang 5 (Asrama Putra)', dormSpot: { col: 67, row: 24, dir: 'down', dormType: 'male' },
        lemburReason: 'Pengiriman map berkas fisik invoice mendesak ke kantor cabang',
        task: '🚶 Antar map invoice dari meja Entry ke meja Lead', energy: 82, mood: 'semangat',
        thought: 'Mengantarkan map berkas fisik dari meja Entry ke meja Pak Mikhael.'
      },

      // --- ZONA 2: CODING & TECH LAB (Tengah Atas) ---
      {
        id: 'dev-kevin', name: 'Kevin', role: 'Lead Backend Engineer', dept: 'tech',
        col: 14, row: 6, charIdx: 0, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Garuda 2 (Asrama Putra)', dormSpot: { col: 55, row: 16, dir: 'down', dormType: 'male' },
        lemburReason: 'Deploy hotfix high-traffic REST API Seventhsoft & webhook n8n',
        task: '💻 Maintain REST API Seventhsoft & Webhook n8n', energy: 92, mood: 'semangat',
        thought: 'Optimasi endpoint webhook transaksi agar respon di bawah 40ms!'
      },
      {
        id: 'dev-sarah', name: 'Sarah', role: 'Frontend React Engineer', dept: 'tech',
        col: 17, row: 6, charIdx: 1, dir: 'up', state: 'sitting', status: 'active',
        gender: 'female', dormRoom: 'Kamar Melati 1 (Asrama Putri)', dormSpot: { col: 51, row: 3, dir: 'down', dormType: 'female' },
        lemburReason: 'Penyempurnaan visual rendering canvas virtual office & modul asrama',
        task: '⚛️ Build UI Virtual Office & Live Dashboard', energy: 86, mood: 'semangat',
        thought: 'Rendering pixel canvas 60fps dengan dynamic lighting & asrama!'
      },
      {
        id: 'dev-reza', name: 'Reza', role: 'System Architect', dept: 'tech',
        col: 20, row: 6, charIdx: 2, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Garuda 3 (Asrama Putra)', dormSpot: { col: 59, row: 16, dir: 'down', dormType: 'male' },
        lemburReason: 'Evaluasi load balancer failover cluster database Seventhsoft',
        task: '🏗️ Arsitektur High-Availability Microservices', energy: 80, mood: 'normal',
        thought: 'Mengevaluasi load balancer dan failover cluster database Seventhsoft.'
      },

      {
        id: 'dev-aris', name: 'Aris', role: 'AI & LLM Engineer', dept: 'tech',
        col: 14, row: 9, charIdx: 3, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Garuda 4 (Asrama Putra)', dormSpot: { col: 63, row: 16, dir: 'down', dormType: 'male' },
        lemburReason: 'Fine-tuning dataset OCR faktur pajak & perlindungan data PDP',
        task: '🧠 Fine-tuning Model OCR & Sanitasi Data PDP', energy: 84, mood: 'semangat',
        thought: 'Prompt engineering & regex masking untuk perlindungan data pribadi UU PDP.'
      },
      {
        id: 'dev-bambang', name: 'Bambang', role: 'Database Administrator', dept: 'tech',
        col: 17, row: 9, charIdx: 4, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Garuda 5 (Asrama Putra)', dormSpot: { col: 67, row: 16, dir: 'down', dormType: 'male' },
        lemburReason: 'Maintenance query database General Ledger & re-indexing tengah malam',
        task: '🗄️ Optimasi query General Ledger & Indexing DB', energy: 78, mood: 'normal',
        thought: 'Tuning query SQL transaksi jurnal besar akhir bulan.'
      },
      {
        id: 'dev-fikri', name: 'Fikri', role: 'Mobile App Developer', dept: 'tech',
        col: 20, row: 9, charIdx: 5, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Garuda 6 (Asrama Putra)', dormSpot: { col: 71, row: 16, dir: 'down', dormType: 'male' },
        lemburReason: 'Testing modul sinkronisasi notifikasi approval invoice di Android/iOS',
        task: '📱 Sinkronisasi Mobile App Seventhsoft', energy: 85, mood: 'semangat',
        thought: 'Push notifikasi approval invoice langsung ke gadget approver.'
      },

      // --- ZONA 3: DEVOPS & INFRA POD (Kanan Atas) ---
      {
        id: 'dev-deni', name: 'Deni', role: 'DevOps & Cloud Engineer', dept: 'tech',
        col: 26, row: 6, charIdx: 2, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Rajawali 1 (Asrama Putra)', dormSpot: { col: 51, row: 20, dir: 'down', dormType: 'male' },
        lemburReason: 'Pembaruan container Docker & monitoring sertifikat SSL Caddy',
        task: '🐳 Monitoring Docker, Caddy HTTPS, & VPS', energy: 88, mood: 'semangat',
        thought: 'Cek container Docker & sertifikat SSL Caddy HTTPS tetap aman.'
      },
      {
        id: 'dev-clara', name: 'Clara', role: 'QA & Test Automation', dept: 'tech',
        col: 29, row: 6, charIdx: 1, dir: 'up', state: 'sitting', status: 'active',
        gender: 'female', dormRoom: 'Kamar Melati 2 (Asrama Putri)', dormSpot: { col: 55, row: 3, dir: 'down', dormType: 'female' },
        lemburReason: 'Eksekusi automated regression testing rilis siklus posting v3.2',
        task: '🧪 Automasi testing siklus posting transaksi', energy: 82, mood: 'normal',
        thought: 'Menjalankan e2e regression testing siklus approval jurnal.'
      },
      {
        id: 'dev-adit', name: 'Adit', role: 'Cybersecurity Engineer', dept: 'tech',
        col: 27, row: 9, charIdx: 0, dir: 'up', state: 'sitting', status: 'active',
        gender: 'male', dormRoom: 'Kamar Rajawali 2 (Asrama Putra)', dormSpot: { col: 55, row: 20, dir: 'down', dormType: 'male' },
        lemburReason: 'Audit jejak kriptografi hash SHA-256 untuk kepatuhan UU ITE',
        task: '🔒 Penetrasi testing & Verifikasi hash SHA-256', energy: 85, mood: 'semangat',
        thought: 'Audit checksum SHA-256 pada ledger anti-manipulasi.'
      },
      {
        id: 'dev-yoga', name: 'Yoga', role: 'IT Support & Infra', dept: 'tech',
        col: 26, row: 9, charIdx: 4, dir: 'right', state: 'walking', isWalker: true, routeType: 'devops',
        gender: 'male', dormRoom: 'Kamar Rajawali 3 (Asrama Putra)', dormSpot: { col: 59, row: 20, dir: 'down', dormType: 'male' },
        lemburReason: 'Pemeriksaan suhu pendingin rak server & switch gigabit LAN',
        task: '🚶 Cek kabel LAN switch & temperatur server', energy: 80, mood: 'normal',
        thought: 'Suhu rak server utama stabil di 20 derajat Celsius.'
      },

      // --- ZONA 4: RUANG MEETING & AUDIT (Kiri Bawah) ---
      {
        id: 'staff-maya', name: 'Maya', role: 'Senior Auditor', dept: 'finance',
        col: 4, row: 18, charIdx: 1, dir: 'right', state: 'sitting', status: 'idle',
        gender: 'female', dormRoom: 'Kamar Melati 3 (Asrama Putri)', dormSpot: { col: 59, row: 3, dir: 'down', dormType: 'female' },
        lemburReason: 'Audit komparasi dokumen invoice fisik vs transaksi buku besar',
        task: '🔍 Tinjau audit log checksum SHA-256', energy: 84, mood: 'normal',
        thought: 'Memverifikasi jejak audit transaksi GL tidak ada kejanggalan.'
      },
      {
        id: 'staff-rian', name: 'Rian', role: 'Staf Pajak e-Faktur', dept: 'finance',
        col: 4, row: 20, charIdx: 0, dir: 'right', state: 'sitting', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Rajawali 4 (Asrama Putra)', dormSpot: { col: 63, row: 20, dir: 'down', dormType: 'male' },
        lemburReason: 'Pengecekan kelengkapan bukti potong e-Faktur PPh 23 masa pajak',
        task: '📑 Rekapitulasi SPT Masa & PPh 23', energy: 78, mood: 'normal',
        thought: 'Menyiapkan arsip bukti potong PPh 23 untuk rekonsiliasi masa pajak.'
      },
      {
        id: 'staff-dimas', name: 'Dimas', role: 'Junior Accountant', dept: 'finance',
        col: 8, row: 18, charIdx: 5, dir: 'left', state: 'sitting', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Rajawali 5 (Asrama Putra)', dormSpot: { col: 67, row: 20, dir: 'down', dormType: 'male' },
        lemburReason: 'Pencocokan fisik surat jalan logistik vs faktur vendor',
        task: '📋 Verifikasi fisik surat jalan & invoice vendor', energy: 86, mood: 'semangat',
        thought: 'Membandingkan fisik surat jalan vs angka faktur vendor Seventhsoft.'
      },
      {
        id: 'staff-nadia', name: 'Nadia', role: 'Billing & AR Specialist', dept: 'finance',
        col: 8, row: 20, charIdx: 3, dir: 'left', state: 'sitting', status: 'idle',
        gender: 'female', dormRoom: 'Kamar Melati 4 (Asrama Putri)', dormSpot: { col: 63, row: 3, dir: 'down', dormType: 'female' },
        lemburReason: 'Follow-up penagihan piutang dagang customer jatuh tempo',
        task: '💳 Monitor piutang dagang jatuh tempo', energy: 82, mood: 'normal',
        thought: 'Mengirimkan pengingat invoice jatuh tempo ke customer Seventhsoft.'
      },
      {
        id: 'staff-doni', name: 'Doni', role: 'Payroll Specialist', dept: 'finance',
        col: 6, row: 21, charIdx: 4, dir: 'up', state: 'sitting', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Rajawali 6 (Asrama Putra)', dormSpot: { col: 71, row: 20, dir: 'down', dormType: 'male' },
        lemburReason: 'Finalisasi rekapitulasi slip gaji bulanan & iuran BPJS karyawan',
        task: '💼 Perhitungan slip gaji & potongan PPh 21', energy: 76, mood: 'normal',
        thought: 'Menghitung rincian potongan BPJS dan PPh 21 staf Seventhsoft.'
      },

      // --- ZONA 5: PRODUCT & SALES WING (Tengah Bawah) ---
      {
        id: 'biz-farhan', name: 'Farhan', role: 'Product Manager', dept: 'product',
        col: 14, row: 16, charIdx: 0, dir: 'up', state: 'sitting', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Elang 1 (Asrama Putra)', dormSpot: { col: 51, row: 24, dir: 'down', dormType: 'male' },
        lemburReason: 'Penyusunan sprint backlog fitur baru otomatisasi akuntansi AI',
        task: '📅 Perencanaan rilis fitur Seventhsoft v3.2', energy: 90, mood: 'semangat',
        thought: 'Menyusun roadmap rilis otomatisasi GL AI di kuartal berikutnya.'
      },
      {
        id: 'biz-lina', name: 'Lina', role: 'UI/UX Designer', dept: 'product',
        col: 17, row: 16, charIdx: 1, dir: 'up', state: 'sitting', status: 'idle',
        gender: 'female', dormRoom: 'Kamar Melati 5 (Asrama Putri)', dormSpot: { col: 67, row: 3, dir: 'down', dormType: 'female' },
        lemburReason: 'Eksplorasi wireframe antarmuka modul gudang Seventhsoft',
        task: '🎨 Desain prototipe navigasi modul gudang', energy: 84, mood: 'semangat',
        thought: 'Membuat palet warna UI Seventhsoft yang nyaman untuk mata akuntan.'
      },
      {
        id: 'biz-bagus', name: 'Bagus', role: 'Enterprise Sales', dept: 'product',
        col: 20, row: 16, charIdx: 2, dir: 'up', state: 'sitting', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Elang 2 (Asrama Putra)', dormSpot: { col: 55, row: 24, dir: 'down', dormType: 'male' },
        lemburReason: 'Persiapan materi demo proposal lisensi korporasi untuk klien',
        task: '🤝 Demo otomatisasi AI ke klien korporasi', energy: 94, mood: 'semangat',
        thought: 'Siap presentasi demo otomatisasi invoice Seventhsoft ke calon klien!'
      },
      {
        id: 'biz-putri', name: 'Putri', role: 'Technical Writer', dept: 'product',
        col: 15, row: 19, charIdx: 3, dir: 'up', state: 'sitting', status: 'idle',
        gender: 'female', dormRoom: 'Kamar Mawar 1 (Asrama Putri)', dormSpot: { col: 51, row: 8, dir: 'down', dormType: 'female' },
        lemburReason: 'Penyempurnaan panduan SOP Four-Eyes Principle di GitHub repo',
        task: '📖 Update dokumentasi SOP Four-Eyes Principle', energy: 80, mood: 'normal',
        thought: 'Menyempurnakan panduan SOP Four-Eyes Principle di GitHub repo.'
      },
      {
        id: 'biz-tania', name: 'Tania', role: 'Customer Success', dept: 'product',
        col: 19, row: 19, charIdx: 4, dir: 'up', state: 'sitting', status: 'idle',
        gender: 'female', dormRoom: 'Kamar Mawar 2 (Asrama Putri)', dormSpot: { col: 55, row: 8, dir: 'down', dormType: 'female' },
        lemburReason: 'Menangani tiket bantuan teknis pelanggan prioritas modul Kas',
        task: '🎧 Pandu klien akuntan baru via ticketing', energy: 86, mood: 'semangat',
        thought: 'Membantu onboarding klien baru mengoperasikan modul Kas & Bank.'
      },

      // --- ZONA 6: PANTRY & BREAK LOUNGE (Kanan) ---
      {
        id: 'cafe-koko', name: 'Koko', role: 'Barista Kantor', dept: 'lounge',
        col: 38, row: 4, charIdx: 5, dir: 'down', state: 'standing', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Elang 3 (Asrama Putra)', dormSpot: { col: 59, row: 24, dir: 'down', dormType: 'male' },
        lemburReason: 'Pembersihan mesin espresso & restock biji kopi arabika',
        task: '☕ Seduh kopi espresso untuk programmer & akuntan', energy: 98, mood: 'semangat',
        thought: 'Biji kopi arabika fresh grind siap seduh untuk semua tim!'
      },
      {
        id: 'cafe-buan', name: 'Bu Ani', role: 'Chef Kantin', dept: 'lounge',
        col: 41, row: 4, charIdx: 3, dir: 'down', state: 'standing', status: 'idle',
        gender: 'female', dormRoom: 'Kamar Mawar 3 (Asrama Putri)', dormSpot: { col: 59, row: 8, dir: 'down', dormType: 'female' },
        lemburReason: 'Persiapan menu sarapan pagi & snack box karyawan asrama',
        task: '🥪 Siapkan snack sehat & kue sore kantor', energy: 95, mood: 'semangat',
        thought: 'Menu makan siang jam 12:00 hari ini nasi box lezat & snack sehat!'
      },
      {
        id: 'lounge-gilang', name: 'Gilang', role: 'Staff Istirahat Lounge', dept: 'lounge',
        col: 34, row: 16, charIdx: 2, dir: 'right', state: 'sitting', status: 'idle',
        gender: 'male', dormRoom: 'Kamar Elang 4 (Asrama Putra)', dormSpot: { col: 63, row: 24, dir: 'down', dormType: 'male' },
        lemburReason: 'Pengecekan fasilitas lounge dan kebersihan area santai kantor',
        task: '🎮 Main game konsol di sofa lounge', energy: 90, mood: 'semangat',
        thought: 'Rehat sejenak sambil main game konsol bareng Gitcat!'
      },
      {
        id: 'staff-siti-jalan', name: 'Siti', role: 'Staff Keuangan', dept: 'lounge',
        col: 22, row: 11, charIdx: 1, dir: 'right', state: 'walking', isWalker: true, routeType: 'coffee',
        gender: 'female', dormRoom: 'Kamar Mawar 4 (Asrama Putri)', dormSpot: { col: 63, row: 8, dir: 'down', dormType: 'female' },
        lemburReason: 'Penyusunan rekapitulasi bukti kas operasional harian',
        task: '🚶 OTW ambil kopi espresso di pantry', energy: 84, mood: 'semangat',
        thought: 'Jalan santai ke pantry Mas Koko buat refill kopi espresso.'
      },

      // --- ZONA 7: LOBBY & RECEPTION (Bawah Tengah) ---
      {
        id: 'lobby-bella', name: 'Bella', role: 'Front Desk Receptionist', dept: 'lounge',
        col: 28, row: 22, charIdx: 5, dir: 'down', state: 'sitting', status: 'active',
        gender: 'female', dormRoom: 'Kamar Mawar 5 (Asrama Putri)', dormSpot: { col: 67, row: 8, dir: 'down', dormType: 'female' },
        lemburReason: 'Rekapitulasi buku tamu kunjungan klien akuntansi hari ini',
        task: '🛎️ Sambut tamu klien akuntansi di lobby', energy: 92, mood: 'semangat',
        thought: 'Menyapa tamu korporasi Seventhsoft dengan ramah di front desk.'
      }
    ];

    this.employeeData.forEach(emp => {
      emp.homeCol = emp.col;
      emp.homeRow = emp.row;
      emp.homeDir = emp.dir;
      emp.x = emp.col * TILE_SIZE + 8;
      emp.y = emp.row * TILE_SIZE + 8;
      emp.coffeeCount = 0;
      emp.actionTimer = 2 + Math.random() * 5;
      emp.typingBurst = 0;
      emp.headTurnTimer = 3 + Math.random() * 6;
      emp.fidgetFrame = 0;
      emp.subAction = null;
      emp.pathTarget = null;
      emp.waypoints = [];
      emp.isLembur = false;
      emp.isSleeping = false;
      emp.wakeEmoteTimer = 0;
    });

    // Inisialisasi Daftar Kasur Asrama
    this.initDormBeds();

    this.pets = [
      { id: 'gitcat', name: 'Gitcat', type: 'cat', col: 37, row: 19, dir: 'down', state: 'idle', frame: 0, timer: 0 },
      { id: 'claudio', name: 'Claudio', type: 'dog', col: 31, row: 23, dir: 'left', state: 'idle', frame: 0, timer: 0 }
    ];

    this.initWalkerRoutes();
  }

  initWalkerRoutes() {
    this.walkerRoutes = {
      courier: [
        { col: 2, row: 7 },
        { col: 5, row: 7 },
        { col: 5, row: 5 },
        { col: 5, row: 7 },
        { col: 2, row: 7 }
      ],
      devops: [
        { col: 25, row: 8 },
        { col: 30, row: 8 },
        { col: 30, row: 10 },
        { col: 25, row: 10 }
      ],
      coffee: [
        { col: 10, row: 10 },
        { col: 22, row: 10 },
        { col: 35, row: 10 },
        { col: 38, row: 6 },
        { col: 35, row: 10 },
        { col: 10, row: 10 }
      ]
    };

    this.employeeData.forEach(emp => {
      if (emp.isWalker) {
        emp.targetIndex = 0;
        emp.speed = 0.8;
      }
    });
  }

  // ==========================================================================
  // 2.1 PEMETAAN KASUR ASRAMA PUTRI & ASRAMA PUTRA
  // ==========================================================================
  initDormBeds() {
    this.dormBeds = [
      // --- ASRAMA PUTRI (10 Kasur, Rows 2-13, Cols 49-74) ---
      // Baris 1 (Row 3): Sarah, Clara, Maya, Nadia, Lina
      { col: 51, row: 3, empId: 'dev-sarah', dormType: 'female', label: 'Sarah' },
      { col: 55, row: 3, empId: 'dev-clara', dormType: 'female', label: 'Clara' },
      { col: 59, row: 3, empId: 'staff-maya', dormType: 'female', label: 'Maya' },
      { col: 63, row: 3, empId: 'staff-nadia', dormType: 'female', label: 'Nadia' },
      { col: 67, row: 3, empId: 'biz-lina', dormType: 'female', label: 'Lina' },

      // Baris 2 (Row 8): Putri, Tania, Bu Ani, Siti, Bella
      { col: 51, row: 8, empId: 'biz-putri', dormType: 'female', label: 'Putri' },
      { col: 55, row: 8, empId: 'biz-tania', dormType: 'female', label: 'Tania' },
      { col: 59, row: 8, empId: 'cafe-buan', dormType: 'female', label: 'Bu Ani' },
      { col: 63, row: 8, empId: 'staff-siti-jalan', dormType: 'female', label: 'Siti' },
      { col: 67, row: 8, empId: 'lobby-bella', dormType: 'female', label: 'Bella' },

      // --- ASRAMA PUTRA (17 Kasur, Rows 15-27, Cols 49-74) ---
      // Baris 1 (Row 16): Mikhael, Kevin, Reza, Aris, Bambang, Fikri
      { col: 51, row: 16, empId: 'lead-finance', dormType: 'male', label: 'Mikhael' },
      { col: 55, row: 16, empId: 'dev-kevin', dormType: 'male', label: 'Kevin' },
      { col: 59, row: 16, empId: 'dev-reza', dormType: 'male', label: 'Reza' },
      { col: 63, row: 16, empId: 'dev-aris', dormType: 'male', label: 'Aris' },
      { col: 67, row: 16, empId: 'dev-bambang', dormType: 'male', label: 'Bambang' },
      { col: 71, row: 16, empId: 'dev-fikri', dormType: 'male', label: 'Fikri' },

      // Baris 2 (Row 20): Deni, Adit, Yoga, Rian, Dimas, Doni
      { col: 51, row: 20, empId: 'dev-deni', dormType: 'male', label: 'Deni' },
      { col: 55, row: 20, empId: 'dev-adit', dormType: 'male', label: 'Adit' },
      { col: 59, row: 20, empId: 'dev-yoga', dormType: 'male', label: 'Yoga' },
      { col: 63, row: 20, empId: 'staff-rian', dormType: 'male', label: 'Rian' },
      { col: 67, row: 20, empId: 'staff-dimas', dormType: 'male', label: 'Dimas' },
      { col: 71, row: 20, empId: 'staff-doni', dormType: 'male', label: 'Doni' },

      // Baris 3 (Row 24): Farhan, Bagus, Koko, Gilang, Budi
      { col: 51, row: 24, empId: 'biz-farhan', dormType: 'male', label: 'Farhan' },
      { col: 55, row: 24, empId: 'biz-bagus', dormType: 'male', label: 'Bagus' },
      { col: 59, row: 24, empId: 'cafe-koko', dormType: 'male', label: 'Koko' },
      { col: 63, row: 24, empId: 'lounge-gilang', dormType: 'male', label: 'Gilang' },
      { col: 67, row: 24, empId: 'staff-budi-kurir', dormType: 'male', label: 'Budi' }
    ];
  }

  // ==========================================================================
  // 3. PRELOAD ASSETS
  // ==========================================================================
  async loadAssets() {
    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn(`[VirtualOfficePixel] Gagal muat: ${src}`);
        resolve(null);
      };
      img.src = src;
    });

    const basePath = '/pixel-assets/assets/';
    const toLoad = {
      char_0: basePath + 'characters/char_0.png',
      char_1: basePath + 'characters/char_1.png',
      char_2: basePath + 'characters/char_2.png',
      char_3: basePath + 'characters/char_3.png',
      char_4: basePath + 'characters/char_4.png',
      char_5: basePath + 'characters/char_5.png',
      pet_cat: basePath + 'pets/gitcat/pet.png',
      pet_dog: basePath + 'pets/claudio/pet.png',
      wall: basePath + 'walls/wall_0.png',

      desk_front: basePath + 'furniture/DESK/DESK_FRONT.png',
      desk_side: basePath + 'furniture/DESK/DESK_SIDE.png',
      table_front: basePath + 'furniture/TABLE_FRONT/TABLE_FRONT.png',
      small_table: basePath + 'furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png',
      coffee_table: basePath + 'furniture/COFFEE_TABLE/COFFEE_TABLE.png',

      pc_front_off: basePath + 'furniture/PC/PC_FRONT_OFF.png',
      pc_front_on1: basePath + 'furniture/PC/PC_FRONT_ON_1.png',
      pc_front_on2: basePath + 'furniture/PC/PC_FRONT_ON_2.png',
      pc_front_on3: basePath + 'furniture/PC/PC_FRONT_ON_3.png',
      pc_side: basePath + 'furniture/PC/PC_SIDE.png',

      chair_front: basePath + 'furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png',
      chair_side: basePath + 'furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png',
      chair_back: basePath + 'furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png',
      cushion_front: basePath + 'furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png',
      cushion_side: basePath + 'furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_SIDE.png',
      sofa_front: basePath + 'furniture/SOFA/SOFA_FRONT.png',
      sofa_side: basePath + 'furniture/SOFA/SOFA_SIDE.png',

      coffee_machine: basePath + 'furniture/COFFEE/COFFEE.png',
      whiteboard: basePath + 'furniture/WHITEBOARD/WHITEBOARD.png',
      bookshelf: basePath + 'furniture/BOOKSHELF/BOOKSHELF.png',
      double_bookshelf: basePath + 'furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png',
      plant_small: basePath + 'furniture/PLANT/PLANT.png',
      plant_leafy: basePath + 'furniture/PLANT_2/PLANT_2.png',
      plant_large: basePath + 'furniture/LARGE_PLANT/LARGE_PLANT.png',
      cactus: basePath + 'furniture/CACTUS/CACTUS.png',
      clock: basePath + 'furniture/CLOCK/CLOCK.png',
      painting_large: basePath + 'furniture/LARGE_PAINTING/LARGE_PAINTING.png',
      painting_small: basePath + 'furniture/SMALL_PAINTING/SMALL_PAINTING.png',
      bin: basePath + 'furniture/BIN/BIN.png'
    };

    const entries = Object.entries(toLoad);
    const loaded = await Promise.all(entries.map(async ([key, src]) => [key, await loadImage(src)]));
    this.assets = Object.fromEntries(loaded);
  }

  // ==========================================================================
  // 4. DESAIN TATA RUANG PERABOT KANTOR
  // ==========================================================================
  initOfficeLayout() {
    this.furnitureList = [];

    const add = (assetKey, col, row, zOffset = 0, extra = {}) => {
      this.furnitureList.push({
        assetKey,
        col,
        row,
        x: col * TILE_SIZE,
        y: row * TILE_SIZE,
        zOffset,
        ...extra
      });
    };

    // --- ZONA 1: FINANCE & APPROVER GL (Kiri Atas) ---
    add('double_bookshelf', 4, 1);
    add('painting_large', 4, 0);
    // Meja Mikhael (Col 4, Row 4). Kursi di Row 3 (di belakang meja).
    add('desk_front', 4, 4);
    add('pc_front_on1', 5, 4, 0, { isMonitor: true, empId: 'lead-finance' });
    add('cushion_front', 5, 3);
    add('plant_large', 2, 2);

    // Meja agen-entry
    add('desk_front', 1, 4);
    add('pc_front_on1', 2, 4, 0, { isMonitor: true, empId: 'agent-entry' });
    add('chair_front', 2, 3);
    add('bin', 1, 5);

    // Meja agen-rekon
    add('desk_front', 7, 4);
    add('pc_front_on1', 8, 4, 0, { isMonitor: true, empId: 'agent-rekon' });
    add('chair_front', 8, 3);

    // Meja agen-pajak (Row 7, kursi Row 8)
    add('desk_front', 4, 7);
    add('pc_front_on1', 5, 7, 0, { isMonitor: true, empId: 'agent-pajak' });
    add('chair_front', 5, 8);
    add('plant_small', 7, 7);

    // --- ZONA 2: TECH LAB & ENGINEERING (Tengah Atas) ---
    add('whiteboard', 16, 0);
    add('clock', 19, 0);

    // Pod 1 (Kevin, Sarah, Reza: Desks Row 5, Kursi Row 6)
    add('desk_front', 13, 5);
    add('pc_front_on1', 14, 5, 0, { isMonitor: true, empId: 'dev-kevin' });
    add('chair_front', 14, 6);

    add('desk_front', 16, 5);
    add('pc_front_on1', 17, 5, 0, { isMonitor: true, empId: 'dev-sarah' });
    add('chair_front', 17, 6);

    add('desk_front', 19, 5);
    add('pc_front_on1', 20, 5, 0, { isMonitor: true, empId: 'dev-reza' });
    add('chair_front', 20, 6);

    // Pod 2 (Aris, Bambang, Fikri: Desks Row 8, Kursi Row 9)
    add('desk_front', 13, 8);
    add('pc_front_on1', 14, 8, 0, { isMonitor: true, empId: 'dev-aris' });
    add('chair_front', 14, 9);

    add('desk_front', 16, 8);
    add('pc_front_on1', 17, 8, 0, { isMonitor: true, empId: 'dev-bambang' });
    add('chair_front', 17, 9);

    add('desk_front', 19, 8);
    add('pc_front_on1', 20, 8, 0, { isMonitor: true, empId: 'dev-fikri' });
    add('chair_front', 20, 9);

    add('plant_leafy', 22, 5);
    add('plant_leafy', 22, 8);

    // --- ZONA 3: DEVOPS & INFRA LAB (Kanan Tengah) ---
    add('double_bookshelf', 26, 1);
    add('painting_small', 29, 0);

    add('desk_front', 25, 5);
    add('pc_front_on1', 26, 5, 0, { isMonitor: true, empId: 'dev-deni' });
    add('chair_front', 26, 6);

    add('desk_front', 28, 5);
    add('pc_front_on1', 29, 5, 0, { isMonitor: true, empId: 'dev-clara' });
    add('chair_front', 29, 6);

    add('desk_front', 26, 8);
    add('pc_front_on1', 27, 8, 0, { isMonitor: true, empId: 'dev-adit' });
    add('chair_front', 27, 9);

    // --- ZONA 4: RUANG MEETING & AUDIT (Kiri Bawah) ---
    add('whiteboard', 5, 14);
    add('table_front', 5, 17); // Boardroom table 3x4 tiles
    // Kursi sisi kiri (Row 18, 20)
    add('cushion_side', 4, 18, 0, { flipX: false });
    add('cushion_side', 4, 20, 0, { flipX: false });
    // Kursi sisi kanan (Row 18, 20)
    add('cushion_side', 8, 18, 0, { flipX: true });
    add('cushion_side', 8, 20, 0, { flipX: true });
    // Kursi bawah ujung (Row 21)
    add('cushion_front', 6, 21);
    add('cactus', 2, 14);

    // --- ZONA 5: PRODUCT & SALES WING (Tengah Bawah) ---
    add('painting_large', 17, 13);
    // Row 15 desks, Row 16 chairs
    add('desk_front', 13, 15);
    add('pc_front_on1', 14, 15, 0, { isMonitor: true, empId: 'biz-farhan' });
    add('chair_front', 14, 16);

    add('desk_front', 16, 15);
    add('pc_front_on1', 17, 15, 0, { isMonitor: true, empId: 'biz-lina' });
    add('chair_front', 17, 16);

    add('desk_front', 19, 15);
    add('pc_front_on1', 20, 15, 0, { isMonitor: true, empId: 'biz-bagus' });
    add('chair_front', 20, 16);

    // Row 18 desks, Row 19 chairs
    add('desk_front', 14, 18);
    add('pc_front_on1', 15, 18, 0, { isMonitor: true, empId: 'biz-putri' });
    add('chair_front', 15, 19);

    add('desk_front', 18, 18);
    add('pc_front_on1', 19, 18, 0, { isMonitor: true, empId: 'biz-tania' });
    add('chair_front', 19, 19);

    // --- ZONA 6: PANTRY & BREAK LOUNGE (Kanan) ---
    add('desk_front', 37, 4);
    add('coffee_machine', 38, 3);
    add('small_table', 40, 4);
    add('painting_small', 38, 0);
    add('clock', 41, 0);

    // Lounge Sofas di sekitar Meja Kopi
    add('sofa_side', 34, 16);
    add('coffee_table', 36, 16);
    add('sofa_side', 38, 16, 0, { flipX: true });
    add('sofa_front', 36, 18);
    add('large_plant', 33, 14);
    add('painting_large', 36, 13);

    // --- ZONA 7: LOBBY & RECEPTION (Bawah Tengah) ---
    add('desk_front', 27, 23);
    add('pc_front_on1', 28, 23, 0, { isMonitor: true, empId: 'lobby-bella' });
    add('cushion_front', 28, 22);
    add('plant_large', 25, 23);
    add('plant_large', 31, 23);

    // --- ZONA 8: JALUR TAMAN PENGHUBUNG KANTOR - ASRAMA (Cols 44-47) ---
    add('plant_large', 44, 2);
    add('plant_large', 44, 25);
    add('plant_leafy', 47, 3);
    add('plant_leafy', 47, 24);

    // --- ZONA 9: ASRAMA PUTRI (Cols 48-75, Rows 2-13) ---
    add('painting_small', 52, 0);
    add('clock', 60, 0);
    add('painting_large', 68, 0);

    // Meja samping tempat tidur (nightstands) Asrama Putri
    add('small_table', 53, 3);
    add('small_table', 57, 3);
    add('small_table', 61, 3);
    add('small_table', 65, 3);
    add('small_table', 69, 3);
    add('small_table', 53, 8);
    add('small_table', 57, 8);
    add('small_table', 61, 8);
    add('small_table', 65, 8);
    add('small_table', 69, 8);

    // Lounge & Rak Buku Asrama Putri
    add('double_bookshelf', 72, 1);
    add('plant_leafy', 49, 2);
    add('plant_large', 49, 11);
    add('sofa_front', 71, 6);
    add('coffee_table', 71, 8);
    add('cushion_front', 73, 8);

    // --- ZONA 10: ASRAMA PUTRA (Cols 48-75, Rows 15-27) ---
    add('painting_large', 54, 14);
    add('clock', 62, 14);
    add('painting_small', 70, 14);

    // Meja samping tempat tidur (nightstands) Asrama Putra
    add('small_table', 53, 16);
    add('small_table', 57, 16);
    add('small_table', 61, 16);
    add('small_table', 65, 16);
    add('small_table', 69, 16);
    add('small_table', 53, 20);
    add('small_table', 57, 20);
    add('small_table', 61, 20);
    add('small_table', 65, 20);
    add('small_table', 69, 20);
    add('small_table', 53, 24);
    add('small_table', 57, 24);
    add('small_table', 61, 24);
    add('small_table', 65, 24);

    // Gaming Lounge & Rak Buku Asrama Putra
    add('double_bookshelf', 73, 15);
    add('sofa_front', 72, 21);
    add('coffee_table', 72, 23);
    add('cactus', 49, 15);
    add('plant_large', 49, 25);
  }

  // ==========================================================================
  // 5. EVENT LISTENERS & SCHEDULE CONTROLLER UI
  // ==========================================================================
  initEvents() {
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);

    this.container.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.hasDragged = false;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
      this.container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.abs(dx - this.panX) > 3 || Math.abs(dy - this.panY) > 3) {
          this.hasDragged = true;
        }
        this.panX = dx;
        this.panY = dy;
        this.targetPanX = dx;
        this.targetPanY = dy;
      } else {
        this.checkHover(e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        this.container.style.cursor = this.hoveredEmployee ? 'pointer' : 'grab';
        if (!this.hasDragged) {
          this.handleClick(e);
        }
      }
    });

    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));

      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;
      this.targetScale = newScale;
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
    }, { passive: false });
  }

  initScheduleUI() {
    document.querySelectorAll('.preset-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.id === 'btn-toggle-live-clock') {
          this.isLiveClock = true;
          this.updateClockFromLive();
        } else {
          this.isLiveClock = false;
          const h = parseInt(btn.dataset.hour, 10);
          const m = parseInt(btn.dataset.min, 10);
          this.setTime(h, m);
          if (btn.id === 'btn-preset-afternoon' || h === 15) {
            this.startCoffeeQueue('Pak Mikhael');
          }
        }
      });
    });

    document.getElementById('btn-insp-coffee')?.addEventListener('click', () => {
      if (!this.selectedEmployee) return;
      this.treatCoffee(this.selectedEmployee);
    });

    document.getElementById('btn-insp-break')?.addEventListener('click', () => {
      if (!this.selectedEmployee) return;
      this.sendToLounge(this.selectedEmployee);
    });

    document.getElementById('btn-insp-cheer')?.addEventListener('click', () => {
      if (!this.selectedEmployee) return;
      this.cheerUp(this.selectedEmployee);
    });
  }

  setTime(h, m) {
    this.simHour = h;
    this.simMinute = m;
    this.checkScheduleRules();
    this.updateScheduleDisplay();
  }

  updateClockFromLive() {
    const now = new Date();
    this.simHour = now.getHours();
    this.simMinute = now.getMinutes();
    this.checkScheduleRules();
    this.updateScheduleDisplay();
  }

  checkScheduleRules() {
    const timeVal = this.simHour + this.simMinute / 60;
    const oldMode = this.scheduleMode;

    if (timeVal >= 12.0 && timeVal < 13.0) {
      this.scheduleMode = 'LUNCH';
    } else if (timeVal >= 8.0 && timeVal < 17.0) {
      this.scheduleMode = 'WORK';
    } else if (timeVal >= 17.0 && timeVal < 21.0) {
      this.scheduleMode = 'AFTER_HOURS';
    } else {
      this.scheduleMode = 'NIGHT';
    }

    if (oldMode !== this.scheduleMode) {
      this.handleScheduleTransition(this.scheduleMode);
    }
  }

  // ==========================================================================
  // 6. JADWAL KANTOR, PULANG KE ASRAMA & SISTEM LEMBUR REALISTIS
  // ==========================================================================
  handleScheduleTransition(mode) {
    if (mode === 'LUNCH') {
      console.log('🍱 [Jadwal] Jam 12.00 - 13.00: Istirahat Makan Siang!');
      this.triggerCelebration('🍱 Jam 12.00 - Istirahat Makan Siang Dimulai!');

      const loungeGroup = ['biz-farhan', 'biz-bagus', 'biz-putri'];
      const loungeSpots = [
        { col: 36, row: 18, dir: 'up' },
        { col: 38, row: 16, dir: 'left' },
        { col: 36, row: 15, dir: 'down' }
      ];
      loungeGroup.forEach((id, i) => {
        const emp = this.employeeData.find(e => e.id === id);
        if (emp) {
          emp.subAction = 'to_lunch';
          emp.lunchSpot = loungeSpots[i];
          emp.mood = 'makan';
          emp.thought = 'Makan siang santai bareng teman di sofa lounge.';
        }
      });

      const pantryGroup = ['dev-clara', 'dev-fikri', 'staff-siti-jalan'];
      const pantrySpots = [
        { col: 37, row: 6, dir: 'up' },
        { col: 39, row: 6, dir: 'up' },
        { col: 41, row: 6, dir: 'up' }
      ];
      pantryGroup.forEach((id, i) => {
        const emp = this.employeeData.find(e => e.id === id);
        if (emp && !emp.isWalker) {
          emp.subAction = 'to_lunch';
          emp.lunchSpot = pantrySpots[i];
          emp.mood = 'makan';
          emp.thought = 'Pesan makan siang lezat Bu Ani dan kopi segar Mas Koko.';
        }
      });

      const meetingGroup = ['staff-maya', 'staff-rian', 'staff-dimas', 'staff-nadia', 'staff-doni'];
      meetingGroup.forEach(id => {
        const emp = this.employeeData.find(e => e.id === id);
        if (emp) {
          emp.mood = 'makan';
          emp.thought = 'Makan siang bersama tim audit di ruang meeting.';
        }
      });

      this.employeeData.forEach(emp => {
        if (!loungeGroup.includes(emp.id) && !pantryGroup.includes(emp.id)) {
          emp.mood = 'makan';
          if (!emp.isWalker) {
            emp.thought = 'Rehat makan siang sejenak di meja kerja.';
          }
        }
      });

    } else if (mode === 'WORK') {
      console.log('💼 [Jadwal] Jam Kerja Aktif (08:00 - 17:00)!');
      this.triggerCelebration('☀️ Jam 08:00 Kantor Dibuka! Semua staf kembali ke meja kerja.');

      // Semua yang sedang di asrama / makan kembali ke meja masing-masing
      this.employeeData.forEach(emp => {
        emp.isSleeping = false;
        emp.isLembur = false;
        emp.energy = 100;
        emp.mood = 'semangat';
        emp.thought = 'Pagi cerah! Semangat bekerja di Kantor Seventhsoft!';

        if (emp.subAction === 'at_lunch' || emp.subAction === 'to_lunch') {
          emp.subAction = 'back_desk';
        } else if (emp.isWalker) {
          emp.subAction = null;
        } else if (emp.col !== emp.homeCol || emp.row !== emp.homeRow) {
          // Buat jalur kembali dari asrama ke kantor
          emp.subAction = 'back_desk';
          const dormDoorRow = emp.gender === 'female' ? 7 : 18;
          emp.waypoints = [
            { col: emp.col, row: emp.row + 2 },
            { col: 48, row: dormDoorRow },
            { col: 45, row: 12 },
            { col: 43, row: 12 },
            { col: 24, row: 12 },
            { col: emp.homeCol, row: 12 },
            { col: emp.homeCol, row: emp.homeRow }
          ];
        } else {
          emp.state = 'sitting';
          emp.dir = emp.homeDir;
          emp.status = 'active';
        }
      });

    } else if (mode === 'AFTER_HOURS' || mode === 'NIGHT') {
      console.log(`🌙 [Jadwal] Jam Pulang / Malam (${mode}).`);

      // 5 Pegawai Kunci yang Lembur Kantor beserta alasan spesifiknya
      const defaultLemburIds = ['lead-finance', 'dev-kevin', 'dev-aris', 'dev-bambang', 'dev-clara'];

      this.employeeData.forEach(emp => {
        // AI Agents tetap standby di server rack kantor
        if (emp.gender === 'ai') {
          emp.isLembur = true;
          emp.state = 'sitting';
          emp.status = 'active';
          emp.typingBurst = 15.0;
          emp.thought = `Standby server: ${emp.lemburReason}`;
          return;
        }

        // Karyawan Lembur: Tetap di meja kantor, bekerja aktif dengan monitor menyala
        if (defaultLemburIds.includes(emp.id) || emp.isLembur) {
          emp.isLembur = true;
          emp.isSleeping = false;
          emp.subAction = null;
          emp.state = 'sitting';
          emp.dir = emp.homeDir;
          emp.status = 'active';
          emp.typingBurst = 30.0;
          emp.mood = 'semangat';
          emp.thought = `Masih lembur di meja kantor: ${emp.lemburReason}`;
        } else {
          // Karyawan Non-Lembur: Pulang berjalan kaki ke Asrama Putri / Putra!
          emp.isLembur = false;
          emp.status = 'idle';
          emp.typingBurst = 0;

          if (emp.col === emp.homeCol && emp.row === emp.homeRow) {
            emp.subAction = 'to_dorm';
            const dormDoorRow = emp.gender === 'female' ? 7 : 18;

            emp.waypoints = [
              { col: emp.col, row: 12 },      // Ke lorong tengah kantor
              { col: 43, row: 12 },           // Pintu keluar kantor
              { col: 45, row: 12 },           // Masuk jalan setapak taman
              { col: 45, row: dormDoorRow },  // Jalan setapak depan asrama
              { col: 48, row: dormDoorRow },  // Masuk pintu asrama
              { col: emp.dormSpot.col, row: emp.dormSpot.row + 2 }, // Lorong depan kasur
              { col: emp.dormSpot.col, row: emp.dormSpot.row }      // Tiba di kasur kamar!
            ];

            emp.thought = `Jam kantor selesai. Berjalan santai pulang ke ${emp.dormRoom}...`;
          } else if (mode === 'NIGHT' && emp.dormSpot) {
            // Jika sudah di asrama dan malam hari, masuk kasur dan tidur!
            emp.isSleeping = true;
            emp.state = 'sleeping';
            emp.mood = 'tidur';
            emp.thought = 'Zzz... Tidur nyenyak di kasur asrama...';
          }
        }
      });

      // Notifikasi perayaan & dialog lembur
      if (mode === 'AFTER_HOURS') {
        this.triggerCelebration('🌙 Jam 17:00 Kantor Tutup! 5 Pegawai Lembur & 22 Pegawai Pulang ke Asrama');
        this.triggerEmployeeSpeech('dev-kevin', 'Kevin', '🌙 Masih lembur nih: Deploy hotfix webhook API Seventhsoft & load testing!');
      } else {
        this.triggerCelebration('💤 Pukul 22:00 Waktu Tidur Asrama! Pegawai lembur tetap siaga di kantor.');
        this.triggerEmployeeSpeech('lead-finance', 'Mikhael', '🌙 Masih lembur otorisasi closing GL akhir bulan. Teman-teman selamat istirahat di asrama!');
      }
    }

    window.dispatchEvent(new CustomEvent('lembur_updated'));
    this.updateScheduleDisplay();
  }

  updateScheduleDisplay() {
    const timeEl = document.getElementById('office-clock-time');
    const badgeEl = document.getElementById('office-schedule-badge');

    if (timeEl) {
      const hStr = String(this.simHour).padStart(2, '0');
      const mStr = String(this.simMinute).padStart(2, '0');
      timeEl.textContent = `${hStr}:${mStr}`;
    }

    if (badgeEl) {
      badgeEl.className = `schedule-mode-pill ${this.scheduleMode.toLowerCase().replace('_', '-')}`;
      const lemburCount = this.employeeData.filter(e => e.isLembur).length;
      if (this.scheduleMode === 'WORK') {
        badgeEl.textContent = '🟢 JAM KERJA (08:00 - 17:00)';
      } else if (this.scheduleMode === 'LUNCH') {
        badgeEl.textContent = '🍱 MAKAN SIANG (12:00 - 13:00)';
      } else if (this.scheduleMode === 'AFTER_HOURS') {
        badgeEl.textContent = `🌙 PULANG KANTOR (${lemburCount} LEMBUR)`;
      } else {
        badgeEl.textContent = `💤 MALAM / TIDUR ASRAMA (${lemburCount} LEMBUR)`;
      }
    }

    const lemburCountEl = document.getElementById('lembur-count');
    if (lemburCountEl) {
      const count = this.employeeData.filter(e => e.isLembur).length;
      lemburCountEl.textContent = String(count);
    }
  }

  // ==========================================================================
  // 7. KECERDASAN EMOSIONAL & INTERAKSI (KOPI, BREAK, CHEER)
  // ==========================================================================
  treatCoffee(emp) {
    emp.coffeeCount++;
    emp.energy = 100;
    emp.mood = 'semangat';
    emp.thought = 'Wih mantap! Baru ditraktir kopi espresso segar Mas Koko. Energi langsung 100% full!';
    this.triggerEmployeeSpeech(emp.id, emp.name, '☕ Segar banget kopinya! Makasih traktiran kopinya! 🔥');
    this.updateInspectorUI(emp);
  }

  sendToLounge(emp) {
    emp.subAction = 'to_lunch';
    emp.lunchSpot = { col: 36, row: 18, dir: 'up' };
    emp.energy = Math.min(100, emp.energy + 25);
    emp.mood = 'normal';
    emp.thought = 'Rehat sejenak selonjoran di sofa lounge sambil ngobrol santai.';
    this.triggerEmployeeSpeech(emp.id, emp.name, '🌴 Siap, izin rehat sejenak 5 menit di lounge ya!');
    this.updateInspectorUI(emp);
  }

  cheerUp(emp) {
    emp.energy = Math.min(100, emp.energy + 20);
    emp.mood = 'semangat';
    emp.thought = 'Dapat suntikan motivasi luar biasa! Gas selesaikan semua antrean transaksi!';
    this.triggerEmployeeSpeech(emp.id, emp.name, '⚡ Siap gaspol! Semangat membara! 🔥');
    this.updateInspectorUI(emp);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  centerCamera() {
    const officePixelW = COLS * TILE_SIZE;
    const officePixelH = ROWS * TILE_SIZE;
    this.scale = Math.min((this.width - 40) / officePixelW, (this.height - 40) / officePixelH);
    this.scale = Math.max(1.2, Math.min(2.4, this.scale));
    this.panX = Math.round((this.width - officePixelW * this.scale) / 2);
    this.panY = Math.round((this.height - officePixelH * this.scale) / 2);
    this.targetPanX = this.panX;
    this.targetPanY = this.panY;
    this.targetScale = this.scale;
  }

  resetCamera() {
    this.centerCamera();
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.scale;
    const y = (clientY - rect.top - this.panY) / this.scale;
    return { x, y };
  }

  checkHover(e) {
    const { x, y } = this.screenToWorld(e.clientX, e.clientY);
    let foundEmp = null;

    for (const emp of this.employeeData) {
      if (x >= emp.x - 12 && x <= emp.x + 12 && y >= emp.y - 28 && y <= emp.y + 8) {
        foundEmp = emp;
        break;
      }
    }

    this.hoveredEmployee = foundEmp;
    this.container.style.cursor = foundEmp ? 'pointer' : 'grab';
  }

  handleClick(e) {
    const { x, y } = this.screenToWorld(e.clientX, e.clientY);

    for (const emp of this.employeeData) {
      if (x >= emp.x - 12 && x <= emp.x + 12 && y >= emp.y - 28 && y <= emp.y + 8) {
        this.selectEmployee(emp);
        return;
      }
    }
  }

  selectEmployee(emp) {
    this.selectedEmployee = emp;
    this.focusOnEmployee(emp);
    this.updateInspectorUI(emp);
    window.dispatchEvent(new CustomEvent('employee_selected', { detail: emp }));
  }

  updateInspectorUI(emp) {
    const moodBadge = document.getElementById('insp-mood-badge');
    const energyBar = document.getElementById('insp-energy-bar');
    const energyVal = document.getElementById('insp-energy-val');
    const coffeeEl = document.getElementById('insp-coffee-count');
    const thoughtEl = document.getElementById('insp-thought');

    const moodMap = {
      semangat: '🔥 Semangat Membara',
      normal: '😊 Fokus Produktif',
      ngantuk: '😴 Ngantuk Berat (Zzz)',
      lelah: '😫 Lelah / Butuh Rehat',
      badmood: '😤 Bad Mood / Pusing',
      makan: '🍱 Sedang Makan Siang',
      ngopi: '☕ Sedang Menikmati Kopi',
      tidur: '💤 Tidur Nyenyak di Asrama'
    };

    if (moodBadge) moodBadge.textContent = moodMap[emp.mood] || '😊 Aktif';

    const statusEl = document.getElementById('insp-status');
    if (statusEl) {
      if (emp.isSleeping) {
        statusEl.textContent = '💤 Tidur Asrama';
        statusEl.className = 'stat-val blue';
      } else if (emp.isLembur) {
        statusEl.textContent = '🌙 Lembur Kantor';
        statusEl.className = 'stat-val amber';
      } else if (emp.subAction === 'in_dorm') {
        statusEl.textContent = '🏠 Santai Asrama';
        statusEl.className = 'stat-val green';
      } else {
        statusEl.textContent = emp.status === 'active' || emp.status === 'typing' ? 'Aktif Produktif' : 'Standby';
        statusEl.className = 'stat-val green';
      }
    }

    if (energyBar) {
      energyBar.style.width = `${emp.energy}%`;
      energyBar.style.background = emp.energy > 60 ? 'linear-gradient(90deg, #10b981, #059669)' :
                                   emp.energy > 30 ? 'linear-gradient(90deg, #f59e0b, #d97706)' :
                                   'linear-gradient(90deg, #ef4444, #b91c1c)';
    }
    if (energyVal) energyVal.textContent = `${Math.round(emp.energy)}%`;
    if (coffeeEl) coffeeEl.textContent = `☕ Kopi: ${emp.coffeeCount} gelas`;
    if (thoughtEl) thoughtEl.textContent = `"${emp.thought}"`;
  }

  focusOnEmployee(emp) {
    const targetX = this.width / 2 - emp.x * this.scale;
    const targetY = this.height / 2 - emp.y * this.scale;
    this.targetPanX = Math.round(targetX);
    this.targetPanY = Math.round(targetY);
  }

  updateAgentTask(agentId, taskText, status = 'active') {
    const emp = this.employeeData.find(e => e.id === agentId);
    if (!emp) return;

    emp.task = taskText;
    emp.status = status;
    emp.typingBurst = 12.0;
    emp.mood = 'semangat';
    emp.energy = Math.max(50, emp.energy);

    this.triggerEmployeeSpeech(agentId, emp.name, taskText);

    const pill = document.getElementById(`party-pill-${agentId}`);
    if (pill) {
      pill.textContent = status.toUpperCase();
      pill.className = `party-status-pill ${status === 'typing' || status === 'active' ? 'active' : 'idle'}`;
    }

    if (this.selectedEmployee && this.selectedEmployee.id === agentId) {
      this.updateInspectorUI(emp);
    }
  }

  wakeEmployeeToWork(empId, taskText) {
    const emp = this.employeeData.find(e => e.id === empId);
    if (!emp) return;

    emp.isSleeping = false;
    emp.isLembur = true;
    emp.energy = 95;
    emp.mood = 'semangat';
    emp.status = 'active';
    if (taskText) emp.task = taskText;
    emp.thought = `🏃 Langsung bangun dari kasur asrama dan segera berangkat ke kantor untuk tugas: ${taskText || 'prioritas malam'}!`;

    // Jika pegawai sedang di asrama, buat waypoints jalan ke kantor!
    const isAtDorm = emp.subAction === 'in_dorm' || emp.subAction === 'to_dorm' || (emp.dormSpot && Math.abs(emp.col - emp.dormSpot.col) < 4);
    if (isAtDorm || emp.col !== emp.homeCol || emp.row !== emp.homeRow) {
      const dormDoorRow = emp.gender === 'female' ? 7 : 18;
      emp.subAction = 'back_desk';
      emp.waypoints = [
        { col: emp.col || (emp.dormSpot ? emp.dormSpot.col : 52), row: emp.row || (emp.dormSpot ? emp.dormSpot.row : dormDoorRow) },
        { col: 48, row: dormDoorRow },
        { col: 45, row: dormDoorRow },
        { col: 45, row: 12 },
        { col: 43, row: 12 },
        { col: 24, row: 12 },
        { col: emp.homeCol, row: 12 },
        { col: emp.homeCol, row: emp.homeRow }
      ];
      this.triggerEmployeeSpeech(emp.id, emp.name, '🏃 Siap bangun dari kasur asrama! OTW jalan ke meja kantor sekarang!');
    } else {
      emp.state = 'sitting';
      emp.dir = emp.homeDir;
      emp.typingBurst = 25.0;
    }

    this.focusOnEmployee(emp);
    this.updateScheduleDisplay();
    if (this.selectedEmployee && this.selectedEmployee.id === empId) {
      this.updateInspectorUI(emp);
    }
  }

  triggerEmployeeSpeech(empId, name, speech) {
    if (!speech) return;
    const emp = this.employeeData.find(e => e.id === empId);
    if (!emp) return;

    this.speechBubbles.set(empId, {
      text: speech,
      sender: name,
      createdAt: performance.now(),
      duration: 7000
    });
  }

  triggerCelebration(message) {
    console.log(`🎉 [Celebration] ${message}`);
    for (let i = 0; i < 40; i++) {
      this.confettiParticles.push({
        x: (Math.random() * COLS) * TILE_SIZE,
        y: -10 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 1.0 + Math.random() * 2.5,
        color: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'][Math.floor(Math.random() * 6)],
        size: 3 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.1
      });
    }

    this.triggerEmployeeSpeech('lead-finance', 'Mikhael', '🎉 Alhamdulillah! Transaksi sukses diposting ke GL Seventhsoft!');
  }

  setDivisionFilter(filter) {
    this.activeFilter = filter || 'all';
  }

  toggleLabels() {
    this.labelsVisible = !this.labelsVisible;
    return this.labelsVisible;
  }

  // ==========================================================================
  // 8. UPDATE LOOP & KECERDASAN PEGAWAI (LIVELY AI)
  // ==========================================================================
  loop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    this.animTime += dt;

    this.panX += (this.targetPanX - this.panX) * 0.12;
    this.panY += (this.targetPanY - this.panY) * 0.12;

    this.updateClockSimulation(dt);
    this.updateEmployeeIntelligence(dt);
    this.updateCoffeeQueue(dt);
    this.updateWalkers(dt);
    this.updatePets(dt);
    this.updateConfetti(dt);

    this.render();

    requestAnimationFrame(this.loop);
  }

  updateClockSimulation(dt) {
    if (this.isLiveClock) {
      this.timeAccumulator += dt;
      if (this.timeAccumulator >= 1.0) {
        this.timeAccumulator = 0;
        this.updateClockFromLive();
      }
    } else {
      this.timeAccumulator += dt;
      if (this.timeAccumulator >= 1.0) {
        this.timeAccumulator = 0;
        this.simMinute++;
        if (this.simMinute >= 60) {
          this.simMinute = 0;
          this.simHour++;
          if (this.simHour >= 24) this.simHour = 0;
        }
        this.checkScheduleRules();
        this.updateScheduleDisplay();
      }
    }
  }

  updateEmployeeIntelligence(dt) {
    this.employeeData.forEach(emp => {
      // 1. Degradasi Stamina Alami
      if (this.scheduleMode === 'WORK') {
        emp.energy = Math.max(10, emp.energy - dt * 0.12);
      } else if (this.scheduleMode === 'LUNCH') {
        emp.energy = Math.min(100, emp.energy + dt * 0.8);
      }

      // 2. Tentukan Mood Berdasarkan Stamina & Waktu
      if (this.scheduleMode === 'LUNCH') {
        emp.mood = 'makan';
      } else if (emp.energy < 25) {
        emp.mood = 'lelah';
      } else if (emp.energy < 45 || (this.simHour >= 14 && this.simHour <= 15 && emp.coffeeCount === 0)) {
        emp.mood = 'ngantuk';
      } else if (emp.status === 'active' || emp.status === 'typing') {
        emp.mood = 'semangat';
      } else {
        emp.mood = 'normal';
      }

      // 3. Animasi Mengetik Burst Acak
      if (emp.typingBurst > 0) {
        emp.typingBurst -= dt;
      } else {
        emp.actionTimer -= dt;
        if (emp.actionTimer <= 0) {
          emp.actionTimer = 3 + Math.random() * 6;
          if (!emp.isWalker && emp.state === 'sitting' && emp.subAction === null) {
            emp.typingBurst = 2 + Math.random() * 4;
            emp.fidgetFrame = Math.random() > 0.5 ? 1 : 0;
          }
        }
      }

      // 4. Head Turning / Fidgeting
      emp.headTurnTimer -= dt;
      if (emp.headTurnTimer <= 0) {
        emp.headTurnTimer = 3 + Math.random() * 5;
        if (emp.state === 'sitting' && emp.subAction === null) {
          const turns = [emp.homeDir, emp.homeDir, 'left', 'right'];
          emp.dir = turns[Math.floor(Math.random() * turns.length)];
        }
      }

      // 5. Autonomous Coffee Run (Maksimal 1 orang bergantian agar tidak rusuh)
      if (emp.mood === 'ngantuk' && emp.subAction === null && !emp.isWalker && this.activeCoffeeShopper === null && Math.random() < 0.003) {
        this.activeCoffeeShopper = emp.id;
        emp.subAction = 'to_coffee';
        emp.thought = 'Aduh ngantuk berat... OTW pesan espresso single shot ke Mas Koko!';
        this.triggerEmployeeSpeech(emp.id, emp.name, '😴 Ngantuk banget, izin ngopi dulu ya...');
      }

      // 6. Khusus Gilang (Staff Lounge): Aktivitas Rehat Dinamis (Tidak Diam Mematung!)
      if (emp.id === 'lounge-gilang' && emp.subAction === null && !this.isCoffeeQueueActive) {
        emp.loungeTimer = (emp.loungeTimer || 0) - dt;
        if (emp.loungeTimer <= 0) {
          emp.loungeTimer = 5 + Math.random() * 7;
          const activities = [
            { spot: { col: 34, row: 16, dir: 'right' }, thought: 'Main game santai di sofa samping...', emote: '🎮' },
            { spot: { col: 36, row: 18, dir: 'up' }, thought: 'Nongkrong di sofa depan bareng Gitcat...', emote: '🐱' },
            { spot: { col: 38, row: 16, dir: 'left' }, thought: 'Pindah ke sofa kanan menikmati kopi dingin...', emote: '☕' },
            { spot: { col: 36, row: 15, dir: 'down' }, thought: 'Cek snack & majalah di atas meja kopi...', emote: '🥪' },
            { spot: { col: 33, row: 14, dir: 'right' }, thought: 'Melihat lukisan pemandangan di dinding lounge...', emote: '🎨' }
          ];
          const nextAct = activities[Math.floor(Math.random() * activities.length)];
          emp.loungeSpot = nextAct.spot;
          emp.thought = nextAct.thought;
          emp.subAction = 'lounge_move';
        }
      }

      this.handleAutonomousWalking(emp, dt);
    });
  }

  handleAutonomousWalking(emp, dt) {
    if (emp.isWalker) return;
    if (emp.subAction === 'in_coffee_queue') return;

    if (emp.subAction === 'lounge_move' && emp.loungeSpot) {
      const targetX = emp.loungeSpot.col * TILE_SIZE + 8;
      const targetY = emp.loungeSpot.row * TILE_SIZE + 8;
      this.moveTowards(emp, targetX, targetY, dt, () => {
        emp.subAction = null;
        emp.state = 'sitting';
        emp.dir = emp.loungeSpot.dir;
      });
      return;
    }

    if (emp.subAction === 'to_coffee') {
      const coffeeTargetX = 38 * TILE_SIZE + 8;
      const coffeeTargetY = 6 * TILE_SIZE + 8;
      this.moveTowards(emp, coffeeTargetX, coffeeTargetY, dt, () => {
        emp.subAction = 'at_coffee';
        emp.coffeeWaitTimer = 3.5;
        emp.dir = 'up'; // Menghadap ke Mas Koko & mesin kopi!
        emp.mood = 'ngopi';
        this.triggerEmployeeSpeech(emp.id, emp.name, '☕ Mas Koko, espresso satu ya!');
      });
    } else if (emp.subAction === 'at_coffee') {
      emp.coffeeWaitTimer -= dt;
      if (emp.coffeeWaitTimer <= 0) {
        emp.coffeeCount++;
        emp.energy = 100;
        emp.mood = 'semangat';
        emp.thought = 'Wah nikmat banget kopinya! Segar bugar kembali siap tuntaskan tugas akuntansi!';
        this.triggerEmployeeSpeech(emp.id, emp.name, '✨ Mantap, makasih Mas Koko! Kembali ke meja kerja 🔥');
        emp.subAction = 'back_desk';
        this.activeCoffeeShopper = null; // Buka slot untuk orang berikutnya
      }
    } else if (emp.subAction === 'to_lunch') {
      const targetX = emp.lunchSpot ? emp.lunchSpot.col * TILE_SIZE + 8 : 36 * TILE_SIZE + 8;
      const targetY = emp.lunchSpot ? emp.lunchSpot.row * TILE_SIZE + 8 : 16 * TILE_SIZE + 8;
      this.moveTowards(emp, targetX, targetY, dt, () => {
        emp.subAction = 'at_lunch';
        emp.state = 'sitting';
        emp.dir = emp.lunchSpot ? emp.lunchSpot.dir : 'down';
      });
    } else if (emp.subAction === 'to_dorm') {
      this.followWaypoints(emp, dt, () => {
        emp.subAction = 'in_dorm';
        if (emp.dormSpot) {
          emp.x = emp.dormSpot.col * TILE_SIZE + 8;
          emp.y = emp.dormSpot.row * TILE_SIZE + 8;
          emp.col = emp.dormSpot.col;
          emp.row = emp.dormSpot.row;
          emp.dir = emp.dormSpot.dir || 'down';
        }
        if (this.scheduleMode === 'NIGHT') {
          emp.state = 'sleeping';
          emp.isSleeping = true;
          emp.mood = 'tidur';
          emp.thought = 'Zzz... Tidur nyenyak di kasur asrama Seventhsoft.';
        } else {
          emp.state = 'sitting';
          emp.isSleeping = false;
          emp.mood = 'normal';
          emp.thought = `Santai malam di ${emp.dormRoom || 'asrama'} Seventhsoft.`;
        }
      });
    } else if (emp.subAction === 'back_desk') {
      if (emp.waypoints && emp.waypoints.length > 0) {
        this.followWaypoints(emp, dt, () => {
          emp.subAction = null;
          emp.x = emp.homeCol * TILE_SIZE + 8;
          emp.y = emp.homeRow * TILE_SIZE + 8;
          emp.col = emp.homeCol;
          emp.row = emp.homeRow;
          emp.state = 'sitting';
          emp.dir = emp.homeDir;
          emp.status = 'active';
          emp.isSleeping = false;
          emp.typingBurst = 20.0;
        });
      } else {
        const homeX = emp.homeCol * TILE_SIZE + 8;
        const homeY = emp.homeRow * TILE_SIZE + 8;
        this.moveTowards(emp, homeX, homeY, dt, () => {
          emp.subAction = null;
          emp.x = homeX;
          emp.y = homeY;
          emp.col = emp.homeCol;
          emp.row = emp.homeRow;
          emp.state = 'sitting';
          emp.dir = emp.homeDir;
          emp.status = 'active';
          emp.isSleeping = false;
        });
      }
    }
  }

  // ==========================================================================
  // SISTEM ANTREAN KOPI PANTRY MAS KOKO (REALISTIC QUEUE DYNAMICS)
  // ==========================================================================
  startCoffeeQueue(initiator = 'Pak Mikhael') {
    console.log(`☕ [Antrean Kopi] Dimulai oleh ${initiator}!`);
    this.isCoffeeQueueActive = true;
    this.coffeeInitiator = initiator;

    this.triggerCelebration(`☕ Traktiran Kopi dari ${initiator}! Staf kantor mulai berbaris antre di Barista Koko!`);
    this.triggerEmployeeSpeech('cafe-koko', 'Koko', `☕ Halo teman-teman! Traktiran kopi dari ${initiator} siap diseduh! Silakan antre dengan tertib ya!`);

    // Ambil staf yang layak ikut antre kopi (kecuali Koko sendiri, Bu Ani, Bella front desk, dan kurir yang sibuk jalan)
    const eligibleStaff = this.employeeData.filter(emp => 
      !['cafe-koko', 'cafe-buan', 'lobby-bella'].includes(emp.id) && !emp.isWalker
    );

    // Acak urutan agar seru & bervariasi
    const shuffled = [...eligibleStaff].sort(() => Math.random() - 0.5);

    this.coffeeQueuePool = shuffled;
    this.activeCoffeeQueue = [];
    this.coffeeServeTimer = 0;

    // Ambil 6 orang pertama untuk langsung berdiri dan menuju barisan antrean
    const initialBatch = Math.min(6, this.coffeeQueuePool.length);
    for (let i = 0; i < initialBatch; i++) {
      const emp = this.coffeeQueuePool.shift();
      emp.subAction = 'in_coffee_queue';
      emp.queueSlot = i;
      emp.mood = 'ngantuk';
      emp.thought = `Asyik ditraktir kopi sama ${initiator}, lagi jalan antre ke Mas Koko!`;
      this.activeCoffeeQueue.push(emp);
    }

    // Geser kamera otomatis ke area Pantry Barista Koko agar user langsung melihat barisan antrean
    const pantryX = 36 * TILE_SIZE;
    const pantryY = 7 * TILE_SIZE;
    this.targetPanX = Math.round(this.width / 2 - pantryX * this.scale);
    this.targetPanY = Math.round(this.height / 2 - pantryY * this.scale);
  }

  updateCoffeeQueue(dt) {
    if (!this.isCoffeeQueueActive) return;

    // 1. Update posisi setiap orang di activeCoffeeQueue menuju slot antrean masing-masing
    this.activeCoffeeQueue.forEach((emp, index) => {
      emp.queueSlot = index;
      const spot = this.queueSpots[Math.min(index, this.queueSpots.length - 1)];
      const targetX = spot.col * TILE_SIZE + 8;
      const targetY = spot.row * TILE_SIZE + 8;

      const dx = targetX - emp.x;
      const dy = targetY - emp.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 2.0) {
        emp.x = targetX;
        emp.y = targetY;
        emp.state = 'sitting';
        emp.dir = spot.dir;
        emp.atQueueSpot = true;
      } else {
        emp.state = 'walking';
        emp.atQueueSpot = false;
        const speed = 42 * dt;
        emp.x += (dx / dist) * speed;
        emp.y += (dy / dist) * speed;

        if (Math.abs(dx) > Math.abs(dy)) {
          emp.dir = dx > 0 ? 'right' : 'left';
        } else {
          emp.dir = dy > 0 ? 'down' : 'up';
        }
        emp.walkProgress = (emp.walkProgress || 0) + dt * 6;
        emp.animFrame = Math.floor(emp.walkProgress) % 4;
      }
    });

    // 2. Layani orang paling depan (Index 0 di depan Mas Koko)
    const frontEmp = this.activeCoffeeQueue[0];
    if (frontEmp && frontEmp.atQueueSpot) {
      this.coffeeServeTimer += dt;

      if (this.coffeeServeTimer >= 2.8) {
        this.coffeeServeTimer = 0;
        frontEmp.coffeeCount++;
        frontEmp.energy = 100;
        frontEmp.mood = 'semangat';
        frontEmp.subAction = 'back_desk';
        frontEmp.thought = `Kopi racikan Mas Koko mantap banget! Makasih traktiran ${this.coffeeInitiator}!`;

        const drinks = ['Caffe Latte', 'Espresso Double Shot', 'Americano Dingin', 'Caramel Macchiato', 'Cappuccino'];
        const chosenDrink = drinks[Math.floor(Math.random() * drinks.length)];
        this.triggerEmployeeSpeech(frontEmp.id, frontEmp.name, `☕ Dapat ${chosenDrink}! Makasih ${this.coffeeInitiator} & Mas Koko! 🔥`);

        // Hapus dari antrean depan (dia mulai jalan kembali ke mejanya)
        this.activeCoffeeQueue.shift();

        // Panggil orang berikutnya dari pool ke antrean jika masih ada yang menunggu
        if (this.coffeeQueuePool.length > 0) {
          const nextEmp = this.coffeeQueuePool.shift();
          nextEmp.subAction = 'in_coffee_queue';
          nextEmp.queueSlot = this.activeCoffeeQueue.length;
          nextEmp.mood = 'ngantuk';
          nextEmp.thought = `Giliran saya antre kopi nih, OTW pantry Mas Koko!`;
          this.activeCoffeeQueue.push(nextEmp);
        }

        // Jika semua sudah selesai dilayani
        if (this.activeCoffeeQueue.length === 0 && this.coffeeQueuePool.length === 0) {
          this.isCoffeeQueueActive = false;
          this.triggerEmployeeSpeech('cafe-koko', 'Koko', `✨ Semua pesanan kopi selesai disajikan! Seluruh tim Seventhsoft berenergi 100% siap gaspol! 🔥`);
        }
      }
    }
  }

  moveTowards(emp, targetX, targetY, dt, onArrive) {
    const dx = targetX - emp.x;
    const dy = targetY - emp.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 2.0) {
      emp.x = targetX;
      emp.y = targetY;
      if (onArrive) onArrive();
    } else {
      emp.state = 'walking';
      const speed = 42 * dt;
      emp.x += (dx / dist) * speed;
      emp.y += (dy / dist) * speed;

      if (Math.abs(dx) > Math.abs(dy)) {
        emp.dir = dx > 0 ? 'right' : 'left';
      } else {
        emp.dir = dy > 0 ? 'down' : 'up';
      }
      emp.walkProgress = (emp.walkProgress || 0) + dt * 6;
      emp.animFrame = Math.floor(emp.walkProgress) % 4;
    }
  }

  followWaypoints(emp, dt, onComplete) {
    if (!emp.waypoints || emp.waypoints.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    const target = emp.waypoints[0];
    const targetX = target.col * TILE_SIZE + 8;
    const targetY = target.row * TILE_SIZE + 8;
    this.moveTowards(emp, targetX, targetY, dt, () => {
      emp.col = target.col;
      emp.row = target.row;
      emp.waypoints.shift();
      if (emp.waypoints.length === 0) {
        if (onComplete) onComplete();
      }
    });
  }

  updateWalkers(dt) {
    this.employeeData.forEach(emp => {
      if (!emp.isWalker) return;

      const route = this.walkerRoutes[emp.routeType];
      if (!route || route.length === 0) return;

      const target = route[emp.targetIndex];
      const targetPxX = target.col * TILE_SIZE + 8;
      const targetPxY = target.row * TILE_SIZE + 8;

      const dx = targetPxX - emp.x;
      const dy = targetPxY - emp.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 1.5) {
        emp.targetIndex = (emp.targetIndex + 1) % route.length;
      } else {
        const vx = (dx / dist) * emp.speed * 45 * dt;
        const vy = (dy / dist) * emp.speed * 45 * dt;
        emp.x += vx;
        emp.y += vy;

        if (Math.abs(dx) > Math.abs(dy)) {
          emp.dir = dx > 0 ? 'right' : 'left';
        } else {
          emp.dir = dy > 0 ? 'down' : 'up';
        }

        emp.walkProgress = (emp.walkProgress || 0) + dt * 6;
        emp.animFrame = Math.floor(emp.walkProgress) % 4;
      }
    });
  }

  updatePets(dt) {
    this.pets.forEach(pet => {
      pet.timer = (pet.timer || 0) + dt;
      if (pet.x === undefined) {
        pet.x = pet.col * TILE_SIZE + 8;
        pet.y = pet.row * TILE_SIZE + 8;
        pet.targetX = pet.x;
        pet.targetY = pet.y;
      }

      if (pet.timer > 4 + Math.random() * 5) {
        pet.timer = 0;
        if (pet.type === 'cat') {
          // Kucing Gitcat jalan santai keliling karpet lounge (Cols 34-38, Rows 16-19)
          const spots = [
            { col: 35, row: 17 }, { col: 37, row: 17 }, { col: 36, row: 19 },
            { col: 37, row: 18 }, { col: 35, row: 19 }, { col: 36, row: 16 }
          ];
          const next = spots[Math.floor(Math.random() * spots.length)];
          pet.targetX = next.col * TILE_SIZE + 8;
          pet.targetY = next.row * TILE_SIZE + 8;
        } else {
          // Anjing Claudio jalan santai di lobi depan (Cols 28-32, Rows 22-24)
          const spots = [
            { col: 30, row: 23 }, { col: 32, row: 23 }, { col: 29, row: 24 }, { col: 31, row: 22 }
          ];
          const next = spots[Math.floor(Math.random() * spots.length)];
          pet.targetX = next.col * TILE_SIZE + 8;
          pet.targetY = next.row * TILE_SIZE + 8;
        }
      }

      const dx = pet.targetX - pet.x;
      const dy = pet.targetY - pet.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 1.5) {
        const speed = 16 * dt;
        pet.x += (dx / dist) * speed;
        pet.y += (dy / dist) * speed;
        pet.col = Math.round(pet.x / TILE_SIZE);
        pet.row = Math.round(pet.y / TILE_SIZE);
        if (Math.abs(dx) > Math.abs(dy)) {
          pet.dir = dx > 0 ? 'right' : 'left';
        } else {
          pet.dir = dy > 0 ? 'down' : 'up';
        }
        pet.walkProgress = (pet.walkProgress || 0) + dt * 4;
        pet.frame = Math.floor(pet.walkProgress) % 3; // Frames 0-2 = walk
      } else {
        pet.x = pet.targetX;
        pet.y = pet.targetY;
        pet.frame = 3 + Math.floor(this.animTime * 1.5) % 3; // Frames 3-5 = idle sitting
      }
    });
  }

  updateConfetti(dt) {
    for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
      const p = this.confettiParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      if (p.y > ROWS * TILE_SIZE + 30) {
        this.confettiParticles.splice(i, 1);
      }
    }
  }

  // ==========================================================================
  // 9. RENDER PIPELINE
  // ==========================================================================
  render() {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(Math.round(this.panX), Math.round(this.panY));
    ctx.scale(this.scale, this.scale);

    this.renderFloors(ctx);
    this.renderWalls(ctx);
    this.renderEntitiesAndFurniture(ctx);
    this.renderHighlights(ctx);
    this.renderOverlays(ctx);
    this.renderConfetti(ctx);

    ctx.restore();
  }

  renderFloors(ctx) {
    const floorW = COLS * TILE_SIZE;
    const floorH = ROWS * TILE_SIZE;

    if (this.woodPatternCanvas) {
      const pat = ctx.createPattern(this.woodPatternCanvas, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(0, TILE_SIZE * 2, floorW, floorH - TILE_SIZE * 2);
    } else {
      ctx.fillStyle = '#d5a36b';
      ctx.fillRect(0, TILE_SIZE * 2, floorW, floorH - TILE_SIZE * 2);
    }

    // Designer Rugs Khusus Per Zona:
    this.drawDesignerRug(ctx, 2, 14, 9, 10, '#1e1b4b', '#f59e0b'); // Meeting Room
    this.drawDesignerRug(ctx, 3, 2, 5, 5, '#2e1065', '#a855f7');   // Founder Mikhael
    this.drawDesignerRug(ctx, 33, 13, 8, 8, '#881337', '#f43f5e'); // Lounge
    this.drawDesignerRug(ctx, 12, 4, 10, 7, '#0f172a', '#06b6d4'); // Tech Lab
    this.drawDesignerRug(ctx, 26, 21, 5, 5, '#991b1b', '#fbbf24'); // Reception
  }

  drawDesignerRug(ctx, col, row, wCols, hRows, fill, stroke) {
    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    const w = wCols * TILE_SIZE;
    const h = hRows * TILE_SIZE;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    ctx.restore();
  }

  renderWalls(ctx) {
    const wallImg = this.assets.wall;
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE_SIZE;
      if (wallImg) {
        ctx.drawImage(wallImg, 0, 0, 16, 32, x, 0, TILE_SIZE, TILE_SIZE * 2);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x, 0, TILE_SIZE, TILE_SIZE * 2);
      }
    }

    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, TILE_SIZE * 2 - 3, COLS * TILE_SIZE, 3);
  }

  renderEntitiesAndFurniture(ctx) {
    const renderQueue = [];

    this.furnitureList.forEach(item => {
      const img = this.assets[item.assetKey];
      if (!img) return;

      let drawImg = img;
      if (item.isMonitor) {
        const emp = this.employeeData.find(e => e.id === item.empId);
        const isWorking = emp && (emp.status === 'active' || emp.status === 'typing' || emp.typingBurst > 0) && this.scheduleMode !== 'LUNCH';
        if (isWorking) {
          const frameIdx = Math.floor(this.animTime * 4) % 3 + 1;
          drawImg = this.assets[`pc_front_on${frameIdx}`] || img;
        } else {
          drawImg = this.assets.pc_front_off || img;
        }
      }

      renderQueue.push({
        type: 'furniture',
        ySort: item.y + (img.height || 16) + item.zOffset,
        item,
        img: drawImg
      });
    });

    this.employeeData.forEach(emp => {
      renderQueue.push({
        type: 'employee',
        ySort: emp.y + 16,
        emp
      });
    });

    this.pets.forEach(pet => {
      renderQueue.push({
        type: 'pet',
        ySort: pet.row * TILE_SIZE + 16,
        pet
      });
    });

    if (this.dormBeds) {
      this.dormBeds.forEach(bed => {
        renderQueue.push({
          type: 'dorm_bed',
          ySort: bed.row * TILE_SIZE + 24,
          bed
        });
      });
    }

    renderQueue.sort((a, b) => a.ySort - b.ySort);

    renderQueue.forEach(q => {
      if (q.type === 'furniture') {
        this.drawFurnitureItem(ctx, q.item, q.img);
      } else if (q.type === 'dorm_bed') {
        this.drawDormBed(ctx, q.bed);
      } else if (q.type === 'employee') {
        this.drawEmployee(ctx, q.emp);
      } else if (q.type === 'pet') {
        this.drawPet(ctx, q.pet);
      }
    });
  }

  drawFurnitureItem(ctx, item, img) {
    ctx.save();
    if (item.flipX) {
      ctx.translate(item.x + img.width, item.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, item.x, item.y);
    }
    ctx.restore();
  }

  drawDormBed(ctx, bed) {
    const bx = bed.col * TILE_SIZE - 4;
    const by = bed.row * TILE_SIZE - 6;
    const bw = 24;
    const bh = 28;

    ctx.save();

    // 1. Bayangan kasur halus
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(bx + 1, by + 2, bw, bh);

    // 2. Headboard kayu elegan
    ctx.fillStyle = '#451a03';
    ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(bx + 1, by + 1, bw - 2, 4);

    // 3. Matras kasur
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(bx + 1, by + 6, bw - 2, bh - 6);

    // 4. Bantal empuk putih
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx + 4, by + 7, bw - 8, 7);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 4, by + 7, bw - 8, 7);

    // 5. Selimut / Quilt Mewah
    const isFemale = bed.dormType === 'female';
    const quiltColor = isFemale ? '#f43f5e' : '#1e40af';
    const foldColor = isFemale ? '#ffe4e6' : '#dbeafe';

    ctx.fillStyle = quiltColor;
    ctx.fillRect(bx + 2, by + 13, bw - 4, bh - 14);

    // Lipatan selimut atas
    ctx.fillStyle = foldColor;
    ctx.fillRect(bx + 2, by + 13, bw - 4, 3);

    // Pola jahitan selimut
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(bx + 4, by + 18, bw - 8, 1);
    ctx.fillRect(bx + 4, by + 22, bw - 8, 1);

    // 6. Label Nama Kasur / Kamar jika labelsVisible aktif
    if (this.labelsVisible) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx - 2, by + bh + 1, bw + 4, 10);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bed.label, bx + bw / 2, by + bh + 8);
    }

    // 7. Cek apakah ada pegawai yang tidur di kasur ini
    const emp = this.employeeData.find(e => e.id === bed.empId);
    const isSleepingHere = emp && (emp.isSleeping || emp.state === 'sleeping' || (emp.subAction === 'in_dorm' && this.scheduleMode === 'NIGHT'));

    if (isSleepingHere) {
      // Gambar kepala pegawai di atas bantal
      const charImg = this.assets[`char_${emp.charIdx || 0}`] || this.assets.char_0;
      if (charImg) {
        // Potongan kepala frame depan (16x14 px)
        ctx.drawImage(charImg, 0, 0, 16, 14, bx + 4, by + 4, 16, 14);
      }

      // Animasi Z z z mengambang
      const zPhase = (this.animTime * 1.6 + (emp.charIdx || 0)) % 3;
      ctx.font = 'bold 7px monospace';
      ctx.fillStyle = '#a5b4fc';
      ctx.textAlign = 'left';
      const zOff = zPhase * 3.5;
      ctx.fillText('z', bx + 15 + zPhase * 2, by + 7 - zOff);
      if (zPhase > 0.8) {
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#818cf8';
        ctx.fillText('Z', bx + 18 + zPhase * 2, by + 4 - zOff);
      }
    }

    ctx.restore();
  }

  drawEmployee(ctx, emp) {
    // Jika pegawai sedang tidur di kasur asrama, tubuhnya sudah dirender di dalam kasur oleh drawDormBed
    if (emp.isSleeping && (emp.subAction === 'in_dorm' || emp.subAction === null) && emp.dormSpot && Math.abs(emp.x - (emp.dormSpot.col * TILE_SIZE + 8)) < 20) {
      return;
    }

    const charImg = this.assets[`char_${emp.charIdx || 0}`] || this.assets.char_0;
    if (!charImg) return;

    ctx.save();

    const matchesFilter = this.activeFilter === 'all' || this.activeFilter === emp.dept;
    if (!matchesFilter) {
      ctx.globalAlpha = 0.3;
    }

    let rowIdx = 0;
    let flipX = false;
    if (emp.dir === 'up') rowIdx = 1;
    else if (emp.dir === 'right') rowIdx = 2;
    else if (emp.dir === 'left') {
      rowIdx = 2;
      flipX = true;
    }

    let frameCol = 0;
    const isTyping = (emp.typingBurst > 0 || emp.status === 'typing' || emp.status === 'active') && this.scheduleMode !== 'LUNCH';

    if (emp.state === 'walking') {
      frameCol = (emp.animFrame || 0) % 4;
    } else if (isTyping && emp.state === 'sitting') {
      frameCol = 4 + (Math.floor(this.animTime * 5) % 2);
    } else if (emp.mood === 'ngantuk') {
      frameCol = 0;
    } else {
      frameCol = emp.fidgetFrame || 0;
    }

    const frameW = 16;
    const frameH = 32;
    const sx = frameCol * frameW;
    const sy = rowIdx * frameH;

    const drawX = Math.round(emp.x - frameW / 2);
    const sitOffset = (emp.state === 'sitting') ? 2 : 0;
    const drawY = Math.round(emp.y - frameH + 8 + sitOffset);

    if (flipX) {
      ctx.translate(drawX + frameW, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(charImg, sx, sy, frameW, frameH, 0, 0, frameW, frameH);
    } else {
      ctx.drawImage(charImg, sx, sy, frameW, frameH, drawX, drawY, frameW, frameH);
    }

    ctx.restore();
  }

  drawPet(ctx, pet) {
    const petImg = pet.type === 'cat' ? this.assets.pet_cat : this.assets.pet_dog;
    if (!petImg) return;

    ctx.save();
    const frameSize = 32;
    let rowIdx = 0;
    let flipX = false;
    if (pet.dir === 'up') rowIdx = 1;
    else if (pet.dir === 'right') rowIdx = 2;
    else if (pet.dir === 'left') {
      rowIdx = 2;
      flipX = true;
    }

    const frameCol = pet.frame || 0;
    const sx = frameCol * frameSize;
    const sy = rowIdx * frameSize;
    const drawX = Math.round(pet.col * TILE_SIZE - 8);
    const drawY = Math.round(pet.row * TILE_SIZE - 12);

    if (flipX) {
      ctx.translate(drawX + frameSize, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(petImg, sx, sy, frameSize, frameSize, 0, 0, frameSize, frameSize);
    } else {
      ctx.drawImage(petImg, sx, sy, frameSize, frameSize, drawX, drawY, frameSize, frameSize);
    }
    ctx.restore();
  }

  renderHighlights(ctx) {
    if (this.selectedEmployee) {
      const emp = this.selectedEmployee;
      this.drawSelectionBracket(ctx, emp.x, emp.y - 12, '#38bdf8', true);
    }

    if (this.hoveredEmployee && this.hoveredEmployee !== this.selectedEmployee) {
      const emp = this.hoveredEmployee;
      this.drawSelectionBracket(ctx, emp.x, emp.y - 12, 'rgba(255, 255, 255, 0.7)', false);
      // Tooltip mewah saat hover
      this.drawHoverTooltip(ctx, emp);
    }
  }

  drawSelectionBracket(ctx, cx, cy, color, isPulse) {
    ctx.save();
    const half = isPulse ? 13 + Math.sin(this.animTime * 6) * 1.5 : 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const len = 4;

    ctx.beginPath();
    ctx.moveTo(cx - half, cy - half + len); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx - half + len, cy - half);
    ctx.moveTo(cx + half - len, cy - half); ctx.lineTo(cx + half, cy - half); ctx.lineTo(cx + half, cy - half + len);
    ctx.moveTo(cx - half, cy + half - len); ctx.lineTo(cx - half, cy + half); ctx.lineTo(cx - half + len, cy + half);
    ctx.moveTo(cx + half - len, cy + half); ctx.lineTo(cx + half, cy + half); ctx.lineTo(cx + half, cy + half - len);
    ctx.stroke();
    ctx.restore();
  }

  drawHoverTooltip(ctx, emp) {
    ctx.save();
    const text = `${emp.name} • ${emp.role}`;
    ctx.font = '600 7px sans-serif';
    const textW = ctx.measureText(text).width;
    const boxW = textW + 12;
    const boxH = 14;
    const bx = Math.round(emp.x - boxW / 2);
    const by = Math.round(emp.y - 40);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bx + 6, by + 9.5);
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // OVERLAYS: NAME BADGES & LIVE SPEECH BUBBLES
  // --------------------------------------------------------------------------
  renderOverlays(ctx) {
    const now = performance.now();

    this.employeeData.forEach(emp => {
      const matchesFilter = this.activeFilter === 'all' || this.activeFilter === emp.dept;
      if (!matchesFilter) return;

      // 1. Subtle Floating Emote Icon (Zzz, Kopi, Api)
      this.drawMoodEmote(ctx, emp);

      // 2. Compact Name Badge (Hanya jika tombol Label diaktifkan!)
      if (this.labelsVisible) {
        this.drawCompactNameBadge(ctx, emp);
      }
    });

    // 3. Live Speech Bubbles
    this.speechBubbles.forEach((bubble, empId) => {
      const emp = this.employeeData.find(e => e.id === empId);
      if (!emp) return;

      const age = now - bubble.createdAt;
      if (age > bubble.duration) {
        this.speechBubbles.delete(empId);
        return;
      }

      const alpha = age > bubble.duration - 1000 ? (bubble.duration - age) / 1000 : 1.0;
      this.drawSpeechBubble(ctx, emp, bubble.text, bubble.sender, alpha);
    });
  }

  drawMoodEmote(ctx, emp) {
    ctx.save();
    let icon = null;
    if (emp.mood === 'ngantuk') icon = '💤';
    else if (emp.mood === 'makan') icon = '🍱';
    else if (emp.mood === 'ngopi') icon = '☕';
    else if (emp.mood === 'badmood') icon = '😤';
    else if (emp.mood === 'lelah') icon = '😫';
    else if (emp.status === 'active' || emp.status === 'typing') icon = '⚡';

    if (!icon) {
      ctx.restore();
      return;
    }

    const floatY = Math.sin(this.animTime * 3 + emp.col) * 2;
    const ex = Math.round(emp.x - 4);
    const ey = Math.round(emp.y - 28 + floatY);

    ctx.font = '8px sans-serif';
    ctx.fillText(icon, ex, ey);
    ctx.restore();
  }

  drawCompactNameBadge(ctx, emp) {
    ctx.save();
    ctx.font = '600 6.5px sans-serif';
    const text = emp.name;
    const textW = ctx.measureText(text).width;
    const badgeW = textW + 8;
    const badgeH = 9;
    const bx = Math.round(emp.x - badgeW / 2);
    // Posisi di atas kepala agar tidak menutupi wajah/rambut/meja!
    const by = Math.round(emp.y - 34);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, 3);
    ctx.fill();
    ctx.stroke();

    const dotColor = emp.status === 'active' || emp.status === 'typing' ? '#10b981' :
                     emp.status === 'approved' ? '#8b5cf6' :
                     emp.status === 'waiting' ? '#f59e0b' : '#94a3b8';
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(bx + 3.5, by + badgeH / 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bx + 6.5, by + 6.8);
    ctx.restore();
  }

  drawSpeechBubble(ctx, emp, text, sender, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    ctx.font = '600 7px sans-serif';
    const maxChars = 34;
    const displayText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
    const textW = ctx.measureText(displayText).width;

    const padX = 6;
    const bubbleW = Math.max(50, textW + padX * 2);
    const bubbleH = 18;
    const bx = Math.round(emp.x - bubbleW / 2);
    const by = Math.round(emp.y - 48);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(bx, by, bubbleW, bubbleH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(emp.x - 3, by + bubbleH);
    ctx.lineTo(emp.x, by + bubbleH + 4);
    ctx.lineTo(emp.x + 3, by + bubbleH);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    ctx.font = '700 6px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(sender || emp.name, bx + padX, by + 6.5);

    ctx.font = '600 7px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(displayText, bx + padX, by + 14);

    ctx.restore();
  }

  renderConfetti(ctx) {
    if (this.confettiParticles.length === 0) return;

    ctx.save();
    this.confettiParticles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    });
    ctx.restore();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.container.innerHTML = '';
  }
}

export { VirtualOfficePixel as VirtualOffice3D };

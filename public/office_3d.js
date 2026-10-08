/**
 * Hermes AI Agent - Large Corporate Office with Canteen, Lounge, & Living Employees
 * Versi Refined: Warna Pastel Hangat (Tidak Silau Putih), Kamera Isometrik Pas,
 * Posisi Tersebar Rapi Tanpa Tumpukan Bubble, Sesuai Referensi Asli Hermes AI.
 */

export class VirtualOffice3D {
  constructor(containerId, overlayContainerId) {
    this.container = document.getElementById(containerId);
    this.overlayContainer = document.getElementById(overlayContainerId);
    this.agents = {};
    this.wanderingStaff = [];
    this.clock = new THREE.Clock();

    this.initScene();
    this.initLights();
    this.buildLargeFloorPlan();
    this.buildWorkZone();
    this.buildCanteenZone();
    this.buildLoungeZone();
    this.buildCharacters();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    this.scene = new THREE.Scene();
    // Warna background pastel hangat lembut (seperti di foto asli)
    this.scene.background = new THREE.Color(0xf5d9df);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Kamera isometrik proporsional: mundur sedikit agar seluruh kantor terlihat utuh & lega
    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
    this.camera.position.set(38, 34, 40);
    this.camera.lookAt(-1, 2, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping & encoding agar warna pastel kaya dan tidak overexposed/silau
    if (THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.95;
    }
    if (THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    this.container.appendChild(this.renderer.domElement);

    if (window.THREE && window.THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2.14;
      this.controls.minDistance = 18;
      this.controls.maxDistance = 85;
      this.controls.target.set(-1, 2, 0);
    }
  }

  initLights() {
    // Ambient light hangat lembut (tidak bikin putih pudar)
    const ambientLight = new THREE.AmbientLight(0xffe4e8, 0.65);
    this.scene.add(ambientLight);

    // Cahaya matahari directional lembut dengan bayangan pastel
    const sunLight = new THREE.DirectionalLight(0xfffaf0, 0.75);
    sunLight.position.set(26, 38, 24);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 130;
    sunLight.shadow.camera.left = -38;
    sunLight.shadow.camera.right = 38;
    sunLight.shadow.camera.top = 38;
    sunLight.shadow.camera.bottom = -38;
    sunLight.shadow.bias = -0.0004;
    this.scene.add(sunLight);

    // Fill light biru muda halus untuk kontras sudut
    const softFill = new THREE.DirectionalLight(0xd6e4f0, 0.35);
    softFill.position.set(-25, 20, -25);
    this.scene.add(softFill);
  }

  buildLargeFloorPlan() {
    // 1. Lantai Utama Kantor (Pink Pastel Hangat Khas Hermes AI di Foto)
    const floorGeo = new THREE.PlaneGeometry(54, 42);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xf8cbd5 }); // Warm pastel pink
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Dinding Belakang (Warna pink dinding hangat)
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(54, 13, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xf1bac8 })
    );
    backWall.position.set(0, 6.5, -21);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // 3. Dinding Samping Kiri
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 13, 42),
      new THREE.MeshLambertMaterial({ color: 0xf1bac8 })
    );
    sideWall.position.set(-27, 6.5, 0);
    sideWall.receiveShadow = true;
    this.scene.add(sideWall);

    // 4. Jendela-jendela Kaca Lebar Kantor Modern (Biru muda cerah)
    const winMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
    const winFrameMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    [-18, -6, 7, 19].forEach(wx => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5.4, 0.3), winFrameMat);
      frame.position.set(wx, 8, -20.65);
      this.scene.add(frame);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(3.8, 5.0, 0.35), winMat);
      glass.position.set(wx, 8, -20.65);
      this.scene.add(glass);
    });

    // 5. Plang Banner Kantor "Seventhsoft AI" (Gaya AlwithFloren di foto)
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 2.5, 0.25),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    signBoard.position.set(-9, 11, -20.65);
    this.scene.add(signBoard);

    const logoBar = new THREE.Mesh(
      new THREE.BoxGeometry(8.0, 1.2, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xe11d48 })
    );
    logoBar.position.set(-9, 11, -20.6);
    this.scene.add(logoBar);

    // List lantai bawah pink merah terang (seperti di foto)
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(54, 0.3, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xf43f5e })
    );
    trim.position.set(0, 0.15, 21);
    this.scene.add(trim);
  }

  // =========================================================================
  // ZONA 1: WORKSPACE AKUNTANSI & AI AGENTS (Kiri)
  // =========================================================================
  buildWorkZone() {
    // Karpet Area Kerja Akuntansi (Pink lebih kontras, persis foto)
    const carpetGeo = new THREE.PlaneGeometry(26, 24);
    const carpetMat = new THREE.MeshLambertMaterial({ color: 0xf4a4b8 }); // Rich pastel pink carpet
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(-13, 0.02, -2);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // Partisi Pembatas Kerja
    this.createOfficePartition(-13, 10, 24, true);

    // Tanaman Hias Pot di sudut-sudut kantor
    this.createPottedPlant(-25, -19);
    this.createPottedPlant(-25, 9);
    this.createPottedPlant(-1, -19);

    // Lemari Dokumen Akuntansi Putih
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 7.0, 6.0),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    cab.position.set(-25.6, 3.5, -12);
    cab.castShadow = true;
    cab.receiveShadow = true;
    this.scene.add(cab);
  }

  // =========================================================================
  // ZONA 2: KANTIN & PANTRY KORPORAT (Kanan Belakang)
  // =========================================================================
  buildCanteenZone() {
    // Lantai Keramik Kantin (Motif Biru Mint Muda Lembut)
    const canteenFloorGeo = new THREE.PlaneGeometry(24, 18);
    const canteenFloorMat = new THREE.MeshLambertMaterial({ color: 0xbae6fd }); // Soft light blue tiles
    const canteenFloor = new THREE.Mesh(canteenFloorGeo, canteenFloorMat);
    canteenFloor.rotation.x = -Math.PI / 2;
    canteenFloor.position.set(14, 0.025, -11.5);
    canteenFloor.receiveShadow = true;
    this.scene.add(canteenFloor);

    // Banner Tulisan Kantin
    const pantrySign = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 1.4, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x0284c7 })
    );
    pantrySign.position.set(14, 11, -20.65);
    this.scene.add(pantrySign);

    // Counter Meja Bar Saji Putih
    const barCounter = new THREE.Mesh(
      new THREE.BoxGeometry(11, 2.5, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    barCounter.position.set(14, 1.25, -18.5);
    barCounter.castShadow = true;
    barCounter.receiveShadow = true;
    this.scene.add(barCounter);

    // Mesin Kopi Espresso Hitam
    const coffeeMaker = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    coffeeMaker.position.set(11.5, 3.2, -18.5);
    coffeeMaker.castShadow = true;
    this.scene.add(coffeeMaker);

    // Piring Donat/Camilan Kuning
    const donutPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12),
      new THREE.MeshLambertMaterial({ color: 0xf59e0b })
    );
    donutPlate.position.set(15, 2.6, -18.5);
    this.scene.add(donutPlate);

    // Kulkas Kantor Besar (Silver)
    const fridge = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 7.0, 2.5),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    fridge.position.set(24.5, 3.5, -18.5);
    fridge.castShadow = true;
    this.scene.add(fridge);

    // Vending Machine Minuman Kaleng Merah
    const vendingMachine = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 6.8, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xf43f5e })
    );
    vendingMachine.position.set(24.5, 3.4, -14.2);
    vendingMachine.castShadow = true;
    this.scene.add(vendingMachine);

    // Meja Makan Kantin Bundar
    this.createDiningTable(9, -7.5);
    this.createDiningTable(18, -7.5);
  }

  // =========================================================================
  // ZONA 3: TEMPAT ISTIRAHAT / LOUNGE (Kanan Depan)
  // =========================================================================
  buildLoungeZone() {
    // Karpet Lounge Nyaman (Warna Lavender Ungu Lembut)
    const loungeCarpetGeo = new THREE.PlaneGeometry(24, 18);
    const loungeCarpetMat = new THREE.MeshLambertMaterial({ color: 0xede9fe }); // Soft lavender
    const loungeCarpet = new THREE.Mesh(loungeCarpetGeo, loungeCarpetMat);
    loungeCarpet.rotation.x = -Math.PI / 2;
    loungeCarpet.position.set(14, 0.02, 10.5);
    loungeCarpet.receiveShadow = true;
    this.scene.add(loungeCarpet);

    // Sofa L-Shape Besar (Ungu Vivid seperti di foto)
    const sofaMat = new THREE.MeshLambertMaterial({ color: 0xa855f7 }); // Ungu Hermes sofa
    const sofaMain = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 3), sofaMat);
    sofaMain.position.set(12, 1.1, 9.5);
    sofaMain.castShadow = true;
    this.scene.add(sofaMain);

    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 0.8), sofaMat);
    sofaBack.position.set(12, 2.3, 8.2);
    sofaBack.castShadow = true;
    this.scene.add(sofaBack);

    const sofaL = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 5), sofaMat);
    sofaL.position.set(16.5, 1.1, 12);
    sofaL.castShadow = true;
    this.scene.add(sofaL);

    // Meja Kopi Putih
    const coffeeTable = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    coffeeTable.position.set(11.5, 0.5, 13.5);
    coffeeTable.castShadow = true;
    this.scene.add(coffeeTable);

    // Beanbag Oranye
    const beanbagMat = new THREE.MeshLambertMaterial({ color: 0xf97316 });
    const beanbag = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), beanbagMat);
    beanbag.scale.set(1.2, 0.7, 1.2);
    beanbag.position.set(6.5, 0.8, 13);
    beanbag.castShadow = true;
    this.scene.add(beanbag);

    // Dispenser Galon Air Aqua
    this.createWaterDispenser(24.5, 5.0);

    // TV Dinding Hiburan
    const tvFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 3.6, 6.2),
      new THREE.MeshLambertMaterial({ color: 0x0f172a })
    );
    tvFrame.position.set(26.6, 5.8, 11);
    this.scene.add(tvFrame);

    const tvScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 3.2, 5.8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    tvScreen.position.set(26.55, 5.8, 11);
    this.scene.add(tvScreen);
  }

  createDiningTable(x, z) {
    const group = new THREE.Group();

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 0.2, 16),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    top.position.y = 2.4;
    top.castShadow = true;
    group.add(top);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x475569 })
    );
    pole.position.y = 1.2;
    group.add(pole);

    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0xfacc15 })
    );
    plate.position.set(0, 2.54, 0.5);
    group.add(plate);

    [[-1.8, 0, 0xec4899], [1.8, 0, 0xfacc15]].forEach(([cx, cz, color]) => {
      const chair = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.65, 0.2, 12),
        new THREE.MeshLambertMaterial({ color })
      );
      chair.position.set(cx, 1.5, cz);
      chair.castShadow = true;
      group.add(chair);

      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8),
        new THREE.MeshLambertMaterial({ color: 0x334155 })
      );
      leg.position.set(cx, 0.75, cz);
      group.add(leg);
    });

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  createWaterDispenser(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 3.2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    body.position.y = 1.6;
    body.castShadow = true;
    group.add(body);

    const gallon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 1.4, 12),
      new THREE.MeshLambertMaterial({ color: 0x0284c7, transparent: true, opacity: 0.85 })
    );
    gallon.position.y = 3.9;
    group.add(gallon);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  createPottedPlant(x, z) {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.55, 1.4, 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    pot.position.y = 0.7;
    pot.castShadow = true;
    group.add(pot);

    const leaves = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.2, 1),
      new THREE.MeshLambertMaterial({ color: 0x16a34a }) // Vibrant green
    );
    leaves.position.y = 1.9;
    leaves.castShadow = true;
    group.add(leaves);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  createOfficePartition(x, z, length, isHorizontal = true) {
    const group = new THREE.Group();
    const width = isHorizontal ? length : 0.25;
    const depth = isHorizontal ? 0.25 : length;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.8, depth),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    base.position.y = 0.9;
    base.castShadow = true;
    group.add(base);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.8, depth),
      new THREE.MeshLambertMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.6 })
    );
    glass.position.y = 2.2;
    group.add(glass);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  createDeskStation({ x, z, chairColor = 0x38bdf8 }) {
    const deskGroup = new THREE.Group();

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.25, 2.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    top.position.y = 2.4;
    top.castShadow = true;
    top.receiveShadow = true;
    deskGroup.add(top);

    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8);
    const legMat = new THREE.MeshLambertMaterial({ color: 0xd4a373 });

    [[-2.0, -1.05], [2.0, -1.05], [-2.0, 1.05], [2.0, 1.05]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 1.2, lz);
      leg.castShadow = true;
      deskGroup.add(leg);
    });

    const laptopBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, 0.9),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    laptopBase.position.set(0, 2.56, -0.2);
    laptopBase.castShadow = true;
    deskGroup.add(laptopBase);

    const laptopScreen = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.85, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x38bdf8 })
    );
    laptopScreen.position.set(0, 2.95, -0.65);
    laptopScreen.rotation.x = -0.15;
    deskGroup.add(laptopScreen);

    // Kursi Voxel
    const chairMat = new THREE.MeshLambertMaterial({ color: chairColor });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 1.5), chairMat);
    seat.position.set(0, 1.6, 1.2);
    seat.castShadow = true;
    deskGroup.add(seat);

    const backRest = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.2), chairMat);
    backRest.position.set(0, 2.4, 1.9);
    backRest.castShadow = true;
    deskGroup.add(backRest);

    const chairPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    chairPole.position.set(0, 0.75, 1.2);
    deskGroup.add(chairPole);

    deskGroup.position.set(x, 0, z);
    this.scene.add(deskGroup);

    return { laptopScreen };
  }

  createVoxelCharacter({ skinColor = 0xffdab9, shirtColor = 0x10b981, hairColor = 0x4a2c11 }) {
    const charGroup = new THREE.Group();

    // Torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 0.8),
      new THREE.MeshLambertMaterial({ color: shirtColor })
    );
    torso.position.y = 2.4;
    torso.castShadow = true;
    charGroup.add(torso);

    // Kepala
    const headGroup = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: skinColor })
    );
    head.position.y = 3.65;
    head.castShadow = true;
    headGroup.add(head);

    // Rambut
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.5, 1.25),
      new THREE.MeshLambertMaterial({ color: hairColor })
    );
    hair.position.y = 4.15;
    hair.castShadow = true;
    headGroup.add(hair);

    // Mata Voxel
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), eyeMat);
    eyeL.position.set(-0.3, 3.65, -0.62);
    headGroup.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), eyeMat);
    eyeR.position.set(0.3, 3.65, -0.62);
    headGroup.add(eyeR);

    charGroup.add(headGroup);

    // Lengan
    const armMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), armMat);
    armL.position.set(-0.75, 2.3, -0.3);
    armL.rotation.x = -Math.PI / 4;
    armL.castShadow = true;
    charGroup.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), armMat);
    armR.position.set(0.75, 2.3, -0.3);
    armR.rotation.x = -Math.PI / 4;
    armR.castShadow = true;
    charGroup.add(armR);

    // Kaki
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), legMat);
    legL.position.set(-0.35, 0.8, 0);
    legL.castShadow = true;
    charGroup.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), legMat);
    legR.position.set(0.35, 0.8, 0);
    legR.castShadow = true;
    charGroup.add(legR);

    return { root: charGroup, headGroup, armL, armR, legL, legR };
  }

  // =========================================================================
  // PENATAAN POSISI KARAKTER YANG LUAS & BUBBLE YANG RAPI
  // =========================================================================
  buildCharacters() {
    // 1. EMPAT AGEN AKUNTANSI DI MEJA KERJA (Posisi dilebarkan agar tidak saling tabrakan)
    const accountingConfigs = [
      {
        id: 'agen-entry',
        name: 'agen-entry',
        deskPos: { x: -19, z: -1 }, // Meja kiri
        chairColor: 0xec4899,
        shirtColor: 0x14b8a6,
        hairColor: 0x543618,
        defaultTask: 'Ekstraksi invoice & Masking PDP (Modul Beli)',
        status: 'active',
        anchorHeight: 5.3
      },
      {
        id: 'agen-rekonsiliasi',
        name: 'agen-rekonsiliasi',
        deskPos: { x: -12, z: 5 }, // Meja tengah depan
        chairColor: 0xeab308,
        shirtColor: 0xf59e0b,
        hairColor: 0x1e293b,
        defaultTask: '⏰ Cocokkan e-statement BCA vs Kas Seventhsoft',
        status: 'active',
        anchorHeight: 5.5
      },
      {
        id: 'agen-pajak',
        name: 'agen-pajak',
        deskPos: { x: -5, z: -1 }, // Meja kanan kerja
        chairColor: 0xec4899,
        shirtColor: 0x3b82f6,
        hairColor: 0x3e2723,
        defaultTask: 'Rekap proyeksi PPN 11% & Cek lonjakan HPP',
        status: 'active',
        anchorHeight: 5.3
      },
      {
        id: 'lead-finance',
        name: 'Agen Utama / Finance Lead',
        deskPos: { x: -12, z: -10 }, // Meja Manajer di belakang luas
        chairColor: 0x8b5cf6,
        shirtColor: 0x6366f1,
        hairColor: 0x1e1b4b,
        defaultTask: 'terakhir: Otorisasi transfer GL via Telegram • 2 mnt lalu',
        status: 'idle',
        isLeader: true,
        anchorHeight: 5.7
      }
    ];

    accountingConfigs.forEach(cfg => {
      const deskData = this.createDeskStation({
        x: cfg.deskPos.x,
        z: cfg.deskPos.z,
        chairColor: cfg.chairColor
      });

      const charData = this.createVoxelCharacter({
        shirtColor: cfg.shirtColor,
        hairColor: cfg.hairColor
      });
      charData.root.position.set(cfg.deskPos.x, 0, cfg.deskPos.z + 1.2);
      this.scene.add(charData.root);

      const bubbleEl = this.createFloatingBubbleElement(cfg);

      this.agents[cfg.id] = {
        config: cfg,
        mesh: charData.root,
        headGroup: charData.headGroup,
        armL: charData.armL,
        armR: charData.armR,
        laptopScreen: deskData.laptopScreen,
        bubbleEl,
        worldAnchor: new THREE.Vector3(cfg.deskPos.x, cfg.anchorHeight || 5.3, cfg.deskPos.z + 1.2),
        state: 'idle',
        taskText: cfg.defaultTask
      };
    });

    // 2. PEGAWAI KETIDURAN DI SOFA LOUNGE
    const sleeper = this.createVoxelCharacter({
      shirtColor: 0xf43f5e,
      hairColor: 0x334155
    });
    sleeper.root.position.set(12, 2.3, 9.5);
    sleeper.root.rotation.z = Math.PI / 2; // Rebahan di sofa
    sleeper.root.rotation.y = Math.PI / 2;
    this.scene.add(sleeper.root);

    const sleepBubble = this.createFloatingBubbleElement({
      id: 'staff-tidur',
      name: 'Rian (Staff Pajak)',
      defaultTask: '😴 Ketiduran di sofa setelah lembur audit GL',
      status: 'active'
    });
    this.agents['staff-tidur'] = {
      bubbleEl: sleepBubble,
      headGroup: sleeper.headGroup,
      armL: sleeper.armL,
      armR: sleeper.armR,
      worldAnchor: new THREE.Vector3(12, 5.0, 9.5),
      isSleeping: true
    };

    // 3. PEGAWAI NGOPI DI PANTRY
    const coffeeStaff = this.createVoxelCharacter({
      shirtColor: 0x8b5cf6,
      hairColor: 0x7c2d12
    });
    coffeeStaff.root.position.set(11.5, 0, -16);
    coffeeStaff.root.rotation.y = Math.PI;
    this.scene.add(coffeeStaff.root);

    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.35, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    mug.position.set(0.3, 0.4, 0.2);
    coffeeStaff.armR.add(mug);

    const coffeeBubble = this.createFloatingBubbleElement({
      id: 'staff-ngopi',
      name: 'Maya (Verifikator)',
      defaultTask: '☕ Ngopi dulu biar gak pusing rekonsiliasi',
      status: 'active'
    });
    this.agents['staff-ngopi'] = {
      bubbleEl: coffeeBubble,
      headGroup: coffeeStaff.headGroup,
      armL: coffeeStaff.armL,
      armR: coffeeStaff.armR,
      worldAnchor: new THREE.Vector3(11.5, 5.3, -16),
      isCoffee: true
    };

    // 4. PEGAWAI MAKAN DI MEJA KANTIN
    const lunchStaff = this.createVoxelCharacter({
      shirtColor: 0x06b6d4,
      hairColor: 0x1f2937
    });
    lunchStaff.root.position.set(9, 0, -7.5);
    this.scene.add(lunchStaff.root);

    const lunchBubble = this.createFloatingBubbleElement({
      id: 'staff-makan',
      name: 'Dimas (Junior Acct)',
      defaultTask: '🍛 Makan siang nasi padang di kantin',
      status: 'active'
    });
    this.agents['staff-makan'] = {
      bubbleEl: lunchBubble,
      headGroup: lunchStaff.headGroup,
      armL: lunchStaff.armL,
      armR: lunchStaff.armR,
      worldAnchor: new THREE.Vector3(9, 5.3, -7.5),
      isEating: true
    };

    // 5. PEGAWAI MONDAR-MANDIR JALAN (Jalur koridor bebas hambatan)
    // Staff A: Bawa map dokumen
    const walkerA = this.createVoxelCharacter({
      shirtColor: 0x10b981,
      hairColor: 0x18181b
    });
    const folder = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.9, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xf59e0b })
    );
    folder.position.set(0.2, 0.2, 0.3);
    walkerA.armL.add(folder);

    const walkBubbleA = this.createFloatingBubbleElement({
      id: 'staff-kurir',
      name: 'Budi (Kurir Berkas)',
      defaultTask: '🚶 Antar dokumen faktur ke meja Lead',
      status: 'active'
    });

    this.wanderingStaff.push({
      id: 'staff-kurir',
      mesh: walkerA.root,
      headGroup: walkerA.headGroup,
      armL: walkerA.armL,
      armR: walkerA.armR,
      legL: walkerA.legL,
      legR: walkerA.legR,
      bubbleEl: walkBubbleA,
      waypoints: [
        { x: -19, z: -5 },
        { x: -12, z: -5 },
        { x: -12, z: -8 },
        { x: -5, z: -5 },
        { x: -19, z: -5 }
      ],
      currentWpIndex: 0,
      speed: 0.045
    });
    this.scene.add(walkerA.root);

    // Staff B: Jalan ke lounge / dispenser
    const walkerB = this.createVoxelCharacter({
      shirtColor: 0xe11d48,
      hairColor: 0x451a03
    });
    const walkBubbleB = this.createFloatingBubbleElement({
      id: 'staff-jalan-kantin',
      name: 'Siti (Staff Keuangan)',
      defaultTask: '🚶 OTW ambil air minum di dispenser',
      status: 'active'
    });

    this.wanderingStaff.push({
      id: 'staff-jalan-kantin',
      mesh: walkerB.root,
      headGroup: walkerB.headGroup,
      armL: walkerB.armL,
      armR: walkerB.armR,
      legL: walkerB.legL,
      legR: walkerB.legR,
      bubbleEl: walkBubbleB,
      waypoints: [
        { x: -2, z: 2 },
        { x: 5, z: 2 },
        { x: 13, z: 5 },
        { x: 22, z: 5.5 },
        { x: 13, z: 5 },
        { x: 5, z: 2 },
        { x: -2, z: 2 }
      ],
      currentWpIndex: 0,
      speed: 0.04
    });
    this.scene.add(walkerB.root);
  }

  createFloatingBubbleElement(cfg) {
    const bubble = document.createElement('div');
    bubble.className = `hermes-agent-bubble ${cfg.isLeader ? 'leader' : ''}`;
    bubble.id = `bubble-${cfg.id}`;

    bubble.innerHTML = `
      <div class="bubble-header">
        <span class="bubble-indicator ${cfg.status === 'active' ? 'green' : 'purple'}"></span>
        <span class="bubble-name">${cfg.name}</span>
      </div>
      <div class="bubble-text" id="task-text-${cfg.id}">${cfg.defaultTask}</div>
    `;

    this.overlayContainer.appendChild(bubble);
    return bubble;
  }

  updateAgentTask(agentId, taskText, state = 'active') {
    const agent = this.agents[agentId];
    if (!agent) return;

    agent.taskText = taskText;
    agent.state = state;

    const textEl = document.getElementById(`task-text-${agentId}`);
    if (textEl) {
      textEl.textContent = taskText;
    }

    if (agent.laptopScreen) {
      const color = state === 'typing' || state === 'active' 
        ? 0x00f2fe 
        : (state === 'approved' ? 0x10b981 : 0x38bdf8);
      agent.laptopScreen.material.color.setHex(color);
    }
  }

  onResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    const elapsedTime = this.clock.getElapsedTime();

    if (this.controls) {
      this.controls.update();
    }

    const widthHalf = this.container.clientWidth / 2;
    const heightHalf = this.container.clientHeight / 2;

    // 1. UPDATE AGEN DUDUK (Kerja, Makan, Ngopi, Tidur)
    Object.values(this.agents).forEach((agent, idx) => {
      if (agent.isSleeping) {
        agent.headGroup.rotation.y = Math.sin(elapsedTime * 1.5) * 0.05;
      } else if (agent.isCoffee) {
        agent.armR.rotation.x = -Math.PI / 4 + Math.sin(elapsedTime * 2) * 0.4;
      } else if (agent.isEating) {
        agent.headGroup.rotation.x = Math.sin(elapsedTime * 4) * 0.12;
      } else if (agent.mesh) {
        const freq = agent.state === 'typing' ? 12 : 5;
        const armOffset = Math.sin(elapsedTime * freq + idx * 1.5) * 0.18;
        if (agent.armL && agent.armR) {
          agent.armL.rotation.x = -Math.PI / 4 + armOffset;
          agent.armR.rotation.x = -Math.PI / 4 - armOffset;
        }

        if (agent.state === 'approved') {
          agent.headGroup.rotation.x = Math.sin(elapsedTime * 8) * 0.2;
        } else {
          agent.headGroup.rotation.y = Math.sin(elapsedTime * 1.8 + idx) * 0.08;
          agent.headGroup.rotation.x = Math.sin(elapsedTime * 2.5 + idx) * 0.04;
        }
      }

      if (agent.worldAnchor) {
        const screenPos = agent.worldAnchor.clone().project(this.camera);
        const px = (screenPos.x * widthHalf) + widthHalf;
        const py = -(screenPos.y * heightHalf) + heightHalf;

        if (screenPos.z < 1 && px >= -40 && px <= this.container.clientWidth + 40) {
          agent.bubbleEl.style.display = 'block';
          agent.bubbleEl.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`;
        } else {
          agent.bubbleEl.style.display = 'none';
        }
      }
    });

    // 2. UPDATE PEGAWAI JALAN (MONDAR-MANDIR)
    this.wanderingStaff.forEach(walker => {
      const targetWp = walker.waypoints[walker.currentWpIndex];
      const curPos = walker.mesh.position;

      const dx = targetWp.x - curPos.x;
      const dz = targetWp.z - curPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.25) {
        walker.currentWpIndex = (walker.currentWpIndex + 1) % walker.waypoints.length;
      } else {
        const angle = Math.atan2(dx, dz);
        walker.mesh.rotation.y = angle;

        curPos.x += (dx / dist) * walker.speed;
        curPos.z += (dz / dist) * walker.speed;

        const stepCycle = Math.sin(elapsedTime * 9);
        walker.legL.rotation.x = stepCycle * 0.55;
        walker.legR.rotation.x = -stepCycle * 0.55;
        walker.armL.rotation.x = -stepCycle * 0.45;
        walker.armR.rotation.x = stepCycle * 0.45;

        walker.headGroup.position.y = 3.65 + Math.abs(Math.sin(elapsedTime * 9)) * 0.12;
      }

      const walkerAnchor = new THREE.Vector3(curPos.x, 5.4, curPos.z);
      const screenPos = walkerAnchor.project(this.camera);
      const px = (screenPos.x * widthHalf) + widthHalf;
      const py = -(screenPos.y * heightHalf) + heightHalf;

      if (screenPos.z < 1 && px >= -40 && px <= this.container.clientWidth + 40) {
        walker.bubbleEl.style.display = 'block';
        walker.bubbleEl.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`;
      } else {
        walker.bubbleEl.style.display = 'none';
      }
    });

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}

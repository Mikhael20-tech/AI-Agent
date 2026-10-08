/**
 * Seventhsoft AI - Corporate Headquarters 3D
 * 30 Karyawan Aktif: Akuntansi, Programmer & Engineering, Product, dan Pantry/Lounge
 * Fitur: Dual-Monitor Tech Lab, Server Racks, Interactive Click-to-Inspect,
 * Filter Divisi, Compact Name Badges (Bebas Tumpukan), & Real-time Telegram Celebration!
 */

/**
 * Furniture Model Manager (Claw3D Remix)
 * Loads, caches, and automatically centers & scales .glb furniture models from Kenney / Claw3D Kit
 */
class FurnitureManager {
  constructor() {
    this.loader = (window.THREE && window.THREE.GLTFLoader) ? new window.THREE.GLTFLoader() : null;
    this.cache = new Map();
    this.pending = new Map();
    this.basePath = '/models/furniture/';
  }

  load(name, onLoad) {
    if (this.cache.has(name)) {
      const inst = this.createInstance(name);
      if (inst && onLoad) onLoad(inst);
      return;
    }

    if (!this.pending.has(name)) {
      this.pending.set(name, []);
      if (this.loader) {
        this.loader.load(
          `${this.basePath}${name}.glb`,
          (gltf) => {
            const root = gltf.scene;
            root.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                  child.material.roughness = 0.55;
                  child.material.metalness = 0.12;
                }
              }
            });
            this.cache.set(name, root);
            const cbs = this.pending.get(name) || [];
            this.pending.delete(name);
            cbs.forEach(cb => {
              const inst = this.createInstance(name);
              if (inst) cb(inst);
            });
          },
          undefined,
          (err) => {
            console.warn(`[FurnitureManager] Fallback: failed to load ${name}.glb`, err);
          }
        );
      }
    }

    if (onLoad) {
      this.pending.get(name).push(onLoad);
    }
  }

  createInstance(name) {
    const original = this.cache.get(name);
    if (!original) return null;
    const cloned = original.clone(true);

    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = Array.isArray(child.material)
            ? child.material.map(m => m.clone())
            : child.material.clone();
        }
      }
    });

    const pivot = new THREE.Group();
    const box = new THREE.Box3().setFromObject(cloned);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    cloned.position.x = -center.x;
    cloned.position.z = -center.z;
    cloned.position.y = -box.min.y;

    pivot.add(cloned);
    pivot.userData.rawSize = size;
    return pivot;
  }

  fit(group, { targetHeight, targetWidth, targetDepth }) {
    if (!group) return group;
    const raw = group.userData.rawSize;
    if (!raw) return group;
    let scale = 1;
    if (targetHeight && raw.y > 0) {
      scale = targetHeight / raw.y;
    } else if (targetWidth && raw.x > 0) {
      scale = targetWidth / raw.x;
    } else if (targetDepth && raw.z > 0) {
      scale = targetDepth / raw.z;
    }
    group.scale.set(scale, scale, scale);
    return group;
  }
}

export class VirtualOffice3D {
  constructor(containerId, overlayContainerId) {
    this.container = document.getElementById(containerId);
    this.overlayContainer = document.getElementById(overlayContainerId);
    this.agents = {};
    this.wanderingStaff = [];
    this.clock = new THREE.Clock();
    this.labelsVisible = true;
    this.activeFilter = 'all';
    this.selectedAgent = null;

    // Inisialisasi Furniture Asset Manager dari Claw3D
    this.furniture = new FurnitureManager();

    // Raycasting untuk interaksi klik
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.interactiveObjects = [];

    this.initScene();
    this.initLights();
    this.buildFloorPlan();
    this.buildAccountingZone();
    this.buildTechLabZone();
    this.buildCanteenZone();
    this.buildLoungeZone();
    this.buildReceptionZone();
    this.build30Employees();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    this.onClick = this.onClick.bind(this);
    this.container.addEventListener('click', this.onClick);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf1e4e8);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Kamera isometrik luas mencakup seluruh 30 pegawai
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 1000);
    this.defaultCameraPos = new THREE.Vector3(48, 44, 52);
    this.camera.position.copy(this.defaultCameraPos);
    this.cameraTarget = new THREE.Vector3(0, 2.5, 0);
    this.camera.lookAt(this.cameraTarget);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.02;
    }
    if (THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    this.container.appendChild(this.renderer.domElement);

    if (window.THREE && window.THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2.12;
      this.controls.minDistance = 15;
      this.controls.maxDistance = 110;
      this.controls.target.copy(this.cameraTarget);
    }
  }

  initLights() {
    const ambientLight = new THREE.AmbientLight(0xffedf0, 0.72);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8ee, 0.85);
    sunLight.position.set(35, 45, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.bias = -0.0003;
    this.scene.add(sunLight);

    const techGlow = new THREE.PointLight(0x00f2fe, 0.45, 25);
    techGlow.position.set(0, 5, -16);
    this.scene.add(techGlow);

    const softFill = new THREE.DirectionalLight(0xdce7f5, 0.35);
    softFill.position.set(-35, 25, -30);
    this.scene.add(softFill);
  }

  buildFloorPlan() {
    // Lantai utama ekstra luas (74 x 56)
    const floorGeo = new THREE.PlaneGeometry(74, 56);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xfce7ec });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Dinding Belakang
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(74, 15, 0.8),
      new THREE.MeshLambertMaterial({ color: 0xefbcc9 })
    );
    backWall.position.set(0, 7.5, -28);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Dinding Kiri
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 15, 56),
      new THREE.MeshLambertMaterial({ color: 0xefbcc9 })
    );
    sideWall.position.set(-37, 7.5, 0);
    sideWall.receiveShadow = true;
    this.scene.add(sideWall);

    // Jendela Kaca Kantor Modern
    const winMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    const winFrameMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    [-28, -14, 0, 14, 28].forEach(wx => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 6.2, 0.3), winFrameMat);
      frame.position.set(wx, 9, -27.6);
      this.scene.add(frame);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(4.8, 5.8, 0.35), winMat);
      glass.position.set(wx, 9, -27.6);
      this.scene.add(glass);
    });

    // Papan Logo Utama Perusahaan Seventhsoft
    const logoBoard = new THREE.Mesh(
      new THREE.BoxGeometry(16, 3.2, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    logoBoard.position.set(0, 12.8, -27.5);
    this.scene.add(logoBoard);

    const logoBar = new THREE.Mesh(
      new THREE.BoxGeometry(14.8, 1.8, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xe11d48 })
    );
    logoBar.position.set(0, 12.8, -27.4);
    this.scene.add(logoBar);

    // Trim list bawah
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(74, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xf43f5e })
    );
    trim.position.set(0, 0.17, 28);
    this.scene.add(trim);
  }

  // =========================================================================
  // ZONA 1: WING AKUNTANSI & KEUANGAN (Kiri)
  // =========================================================================
  buildAccountingZone() {
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 28),
      new THREE.MeshLambertMaterial({ color: 0xf9a8d4 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(-20, 0.02, -5);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // Signboard Zona Akuntansi
    this.createZoneSign(-20, 11, -27.5, 'DIVISI KEUANGAN & AUDIT', 0xd946ef);

    // Lemari Arsip Berkas Berjejer (Bookcase Closed dari Claw3D)
    [-19, -13].forEach(z => {
      this.furniture.load('bookcaseClosed', (bookcase) => {
        this.furniture.fit(bookcase, { targetHeight: 7.8 });
        bookcase.position.set(-35.5, 0, z);
        bookcase.rotation.y = Math.PI / 2;
        this.scene.add(bookcase);
      });
    });

    // Brankas Kasir Logam
    const safe = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 3.5, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 })
    );
    safe.position.set(-35.2, 1.75, -7);
    safe.castShadow = true;
    this.scene.add(safe);

    this.createPottedPlant(-35, 7);
    this.createPottedPlant(-5, -18);
  }

  // =========================================================================
  // ZONA 2: TECH LAB / SOFTWARE ENGINEERING & IT (Tengah)
  // =========================================================================
  buildTechLabZone() {
    const techCarpet = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 24),
      new THREE.MeshLambertMaterial({ color: 0x93c5fd })
    );
    techCarpet.rotation.x = -Math.PI / 2;
    techCarpet.position.set(0, 0.02, -15);
    techCarpet.receiveShadow = true;
    this.scene.add(techCarpet);

    this.createZoneSign(0, 11, -27.5, 'SEVENTHSOFT TECH & AI LAB', 0x0284c7);

    // Server Racks dengan Lampu Indikator Kedip
    this.serverRacks = [];
    [-4.5, -1.5, 1.5, 4.5].forEach(sx => {
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 8.2, 2.2),
        new THREE.MeshLambertMaterial({ color: 0x0f172a })
      );
      rack.position.set(sx, 4.1, -25.5);
      rack.castShadow = true;
      this.scene.add(rack);

      // LED strip server
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.15, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x22c55e })
      );
      led.position.set(sx, 6.5, -24.3);
      this.scene.add(led);
      this.serverRacks.push(led);
    });

    // Whiteboard Arsitektur Sistem
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(8, 4.2, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    board.position.set(-11, 5.5, -27.5);
    this.scene.add(board);
  }

  // =========================================================================
  // ZONA 3: KANTIN, CAFE & PANTRY (Kanan Belakang)
  // =========================================================================
  buildCanteenZone() {
    const canteenFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 22),
      new THREE.MeshLambertMaterial({ color: 0xa7f3d0 })
    );
    canteenFloor.rotation.x = -Math.PI / 2;
    canteenFloor.position.set(22, 0.025, -16);
    canteenFloor.receiveShadow = true;
    this.scene.add(canteenFloor);

    this.createZoneSign(22, 11, -27.5, 'KANTIN & COFFEE BAR', 0x059669);

    // Counter Bar Espresso
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(14, 2.8, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    bar.position.set(22, 1.4, -24.5);
    bar.castShadow = true;
    this.scene.add(bar);

    // Mesin Kopi Espresso Otentik Claw3D
    this.furniture.load('kitchenCoffeeMachine', (espresso) => {
      this.furniture.fit(espresso, { targetHeight: 1.5 });
      espresso.position.set(19, 2.8, -24.5);
      espresso.rotation.y = 0;
      this.scene.add(espresso);
    });

    // Kulkas Kantin Stainless Steel Claw3D
    this.furniture.load('kitchenFridgeSmall', (fridge) => {
      this.furniture.fit(fridge, { targetHeight: 7.2 });
      fridge.position.set(33.5, 0, -24.5);
      fridge.rotation.y = 0;
      this.scene.add(fridge);
    });

    // Meja Bundar & Kursi Modern Kantin
    this.createDiningTable(17, -12);
    this.createDiningTable(27, -12);
    this.createWaterDispenser(34, -7);
  }

  // =========================================================================
  // ZONA 4: LOUNGE & RELAXATION (Kanan Depan)
  // =========================================================================
  buildLoungeZone() {
    const loungeFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 24),
      new THREE.MeshLambertMaterial({ color: 0xe9d5ff })
    );
    loungeFloor.rotation.x = -Math.PI / 2;
    loungeFloor.position.set(22, 0.02, 14);
    loungeFloor.receiveShadow = true;
    this.scene.add(loungeFloor);

    this.createZoneSign(22, 10, 27.5, 'LOUNGE & GAMING AREA', 0x9333ea, true);

    // Sofa Mewah Claw3D
    this.furniture.load('loungeSofa', (sofa) => {
      this.furniture.fit(sofa, { targetHeight: 2.7 });
      sofa.position.set(20, 0, 13);
      sofa.rotation.y = Math.PI;
      sofa.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.color.lerp(new THREE.Color(0x9333ea), 0.7);
        }
      });
      this.scene.add(sofa);
    });

    // Kursi Santai Lounge Armchair Claw3D
    this.furniture.load('loungeDesignChair', (chair) => {
      this.furniture.fit(chair, { targetHeight: 2.3 });
      chair.position.set(26.5, 0, 16.5);
      chair.rotation.y = -Math.PI / 2;
      chair.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.color.lerp(new THREE.Color(0xa855f7), 0.7);
        }
      });
      this.scene.add(chair);
    });

    // Meja Kopi Elegan Claw3D
    this.furniture.load('tableCoffee', (coffeeTable) => {
      this.furniture.fit(coffeeTable, { targetHeight: 1.1 });
      coffeeTable.position.set(20, 0, 18);
      this.scene.add(coffeeTable);
    });

    // Lampu Lantai Modern Claw3D
    this.furniture.load('lampRoundFloor', (lamp) => {
      this.furniture.fit(lamp, { targetHeight: 6.2 });
      lamp.position.set(33, 0, 22);
      this.scene.add(lamp);
    });

    // Beanbags
    this.createBeanbag(13, 15, 0xf97316);
    this.createBeanbag(13, 20, 0x06b6d4);

    // Smart TV Layar Lebar
    const tv = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 4.5, 8.5),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    tv.position.set(36.2, 6.5, 15);
    this.scene.add(tv);

    this.createPottedPlant(34, 4);
    this.createPottedPlant(10, 24);
  }

  // =========================================================================
  // ZONA 5: LOBBY & RECEPTION (Tengah Depan)
  // =========================================================================
  buildReceptionZone() {
    const lobbyFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 18),
      new THREE.MeshLambertMaterial({ color: 0xfef08a })
    );
    lobbyFloor.rotation.x = -Math.PI / 2;
    lobbyFloor.position.set(-3, 0.02, 17);
    lobbyFloor.receiveShadow = true;
    this.scene.add(lobbyFloor);

    // Meja Resepsionis Lengkung Elegan
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2.6, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    desk.position.set(-3, 1.3, 13);
    desk.castShadow = true;
    this.scene.add(desk);

    const bannerLogo = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1.0, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xe11d48 })
    );
    bannerLogo.position.set(-3, 1.3, 14.25);
    this.scene.add(bannerLogo);

    this.furniture.load('chairModernCushion', (chair) => {
      this.furniture.fit(chair, { targetHeight: 1.9 });
      chair.position.set(-3, 0, 11.5);
      chair.rotation.y = 0;
      this.scene.add(chair);
    });

    this.createPottedPlant(-10, 13);
    this.createPottedPlant(4, 13);
  }

  createZoneSign(x, y, z, text, color, rotate180 = false) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(13, 1.4, 0.25),
      new THREE.MeshLambertMaterial({ color })
    );
    sign.position.set(x, y, z);
    if (rotate180) sign.rotation.y = Math.PI;
    this.scene.add(sign);
  }

  createDiningTable(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Meja Bundar Claw3D
    this.furniture.load('tableRound', (table) => {
      this.furniture.fit(table, { targetHeight: 2.4 });
      group.add(table);
    });

    // Kursi Cafe Modern Cushion Claw3D
    const chairColors = [0xec4899, 0xfacc15, 0x10b981, 0x3b82f6];
    const chairDists = [[-2.2, 0, 0], [2.2, 0, Math.PI], [0, -2.2, -Math.PI / 2], [0, 2.2, Math.PI / 2]];

    chairDists.forEach(([cx, cz, rotY], i) => {
      this.furniture.load('chairModernCushion', (chair) => {
        this.furniture.fit(chair, { targetHeight: 1.8 });
        chair.position.set(cx, 0, cz);
        chair.rotation.y = rotY;
        chair.traverse(c => {
          if (c.isMesh && c.material && c.name.toLowerCase().includes('cushion')) {
            c.material.color.lerp(new THREE.Color(chairColors[i]), 0.8);
          }
        });
        group.add(chair);
      });
    });

    this.scene.add(group);
  }

  createWaterDispenser(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 3.4, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    body.position.y = 1.7;
    body.castShadow = true;
    group.add(body);

    const gallon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12),
      new THREE.MeshLambertMaterial({ color: 0x0284c7, transparent: true, opacity: 0.85 })
    );
    gallon.position.y = 4.1;
    group.add(gallon);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  createBeanbag(x, z, color) {
    const bag = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 12, 10),
      new THREE.MeshLambertMaterial({ color })
    );
    bag.scale.set(1.2, 0.65, 1.2);
    bag.position.set(x, 0.85, z);
    bag.castShadow = true;
    this.scene.add(bag);
  }

  createPottedPlant(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Model Potted Plant Claw3D
    this.furniture.load('pottedPlant', (plant) => {
      this.furniture.fit(plant, { targetHeight: 2.8 });
      group.add(plant);
    });

    this.scene.add(group);
  }

  createDeskStation({ x, z, chairColor = 0x38bdf8, isDev = false, isLead = false }) {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(x, 0, z);

    // Meja Claw3D (deskCorner untuk Executive Lead, desk standar untuk staf)
    const deskModel = isLead ? 'deskCorner' : 'desk';
    this.furniture.load(deskModel, (deskInst) => {
      this.furniture.fit(deskInst, { targetHeight: 2.35 });
      deskInst.position.set(0, 0, -1.15);
      deskInst.rotation.y = isLead ? -Math.PI / 2 : Math.PI;
      deskGroup.add(deskInst);
    });

    // Kursi Kerja Putar Ergonomis Claw3D (chairDesk)
    this.furniture.load('chairDesk', (chairInst) => {
      this.furniture.fit(chairInst, { targetHeight: 1.95 });
      chairInst.position.set(0, 0, 0.2);
      chairInst.rotation.y = 0;
      chairInst.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.color.lerp(new THREE.Color(chairColor), 0.7);
        }
      });
      deskGroup.add(chairInst);
    });

    // Monitor Komputer Claw3D (computerScreen)
    let screens = [];
    if (isDev) {
      // DUAL MONITOR UNTUK PROGRAMMER!
      [-0.95, 0.95].forEach((mx, i) => {
        this.furniture.load('computerScreen', (screenInst) => {
          this.furniture.fit(screenInst, { targetHeight: 1.35 });
          screenInst.position.set(mx, 2.35, -1.05);
          screenInst.rotation.y = mx < 0 ? 0.16 : -0.16;
          deskGroup.add(screenInst);
        });

        // Glowing coding screen surface
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.75),
          new THREE.MeshBasicMaterial({
            color: i === 0 ? 0x10b981 : 0x00f2fe,
            side: THREE.DoubleSide
          })
        );
        glow.position.set(mx, 3.12, -0.98);
        glow.rotation.y = mx < 0 ? 0.16 : -0.16;
        deskGroup.add(glow);
        screens.push(glow);
      });
    } else {
      // Single Screen untuk Akuntansi & Product
      this.furniture.load('computerScreen', (screenInst) => {
        this.furniture.fit(screenInst, { targetHeight: 1.35 });
        screenInst.position.set(0, 2.35, -1.05);
        screenInst.rotation.y = 0;
        deskGroup.add(screenInst);
      });

      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.75),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide
        })
      );
      glow.position.set(0, 3.12, -0.98);
      deskGroup.add(glow);
      screens.push(glow);
    }

    this.scene.add(deskGroup);
    return { screens };
  }

  createVoxelCharacter({ skinColor = 0xffdab9, shirtColor = 0x10b981, hairColor = 0x4a2c11 }) {
    const charGroup = new THREE.Group();

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 0.8),
      new THREE.MeshLambertMaterial({ color: shirtColor })
    );
    torso.position.y = 2.4;
    torso.castShadow = true;
    charGroup.add(torso);

    const headGroup = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: skinColor })
    );
    head.position.y = 3.65;
    head.castShadow = true;
    headGroup.add(head);

    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.5, 1.25),
      new THREE.MeshLambertMaterial({ color: hairColor })
    );
    hair.position.y = 4.15;
    hair.castShadow = true;
    headGroup.add(hair);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), eyeMat);
    eyeL.position.set(-0.3, 3.65, -0.62);
    headGroup.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), eyeMat);
    eyeR.position.set(0.3, 3.65, -0.62);
    headGroup.add(eyeR);

    charGroup.add(headGroup);

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
  // 30 PEGAWAI LENGKAP: AKUNTANSI, PROGRAMMER, PRODUCT & PANTRY
  // =========================================================================
  build30Employees() {
    const employeeData = [
      // --- DIVISI 1: AKUNTANSI & KEUANGAN (Sayap Kiri Luas - 10 Orang) ---
      { id: 'lead-finance', name: 'Mikhael', role: 'Finance Lead (Approver GL)', dept: 'finance', x: -18, z: -21, anchorY: 5.6, chairColor: 0x7c3aed, shirt: 0x6d28d9, hair: 0x18181b, task: '🛡️ Otorisasi final posting GL Seventhsoft via Telegram', isLead: true },
      { id: 'agent-entry', name: 'agen-entry', role: 'AI Data Entry & OCR', dept: 'finance', x: -30, z: -21, anchorY: 5.1, chairColor: 0xec4899, shirt: 0x059669, hair: 0x451a03, task: '📄 Ekstraksi faktur & Masking PDP (Modul Beli)' },
      { id: 'agent-rekon', name: 'agen-rekon', role: 'AI Rekonsiliasi Bank', dept: 'finance', x: -30, z: -13, anchorY: 5.5, chairColor: 0x3b82f6, shirt: 0x0284c7, hair: 0x3b1e08, task: '🏦 Pencocokan e-statement BCA vs Kas Seventhsoft' },
      { id: 'agent-pajak', name: 'agen-pajak', role: 'AI Pajak & Margin', dept: 'finance', x: -18, z: -13, anchorY: 5.1, chairColor: 0xf59e0b, shirt: 0xd97706, hair: 0x172554, task: '📊 Proyeksi PPN 11% & Deteksi anomali HPP' },
      { id: 'staff-maya', name: 'Maya', role: 'Senior Auditor', dept: 'finance', x: -30, z: -5, anchorY: 5.5, chairColor: 0x14b8a6, shirt: 0x0d9488, hair: 0x7c2d12, task: '🔍 Tinjau audit log checksum SHA-256' },
      { id: 'staff-rian', name: 'Rian', role: 'Staf Pajak e-Faktur', dept: 'finance', x: -18, z: -5, anchorY: 5.1, chairColor: 0x6366f1, shirt: 0x4f46e5, hair: 0x18181b, task: '📑 Rekapitulasi SPT Masa & PPh 23' },
      { id: 'staff-dimas', name: 'Dimas', role: 'Junior Accountant', dept: 'finance', x: -30, z: 3, anchorY: 5.4, chairColor: 0x06b6d4, shirt: 0x0891b2, hair: 0x27272a, task: '📋 Verifikasi fisik surat jalan & invoice vendor' },
      { id: 'staff-nadia', name: 'Nadia', role: 'Billing & AR Specialist', dept: 'finance', x: -18, z: 3, anchorY: 5.1, chairColor: 0xf43f5e, shirt: 0xe11d48, hair: 0x451a03, task: '💳 Monitor piutang dagang jatuh tempo' },
      { id: 'staff-doni', name: 'Doni', role: 'Payroll Specialist', dept: 'finance', x: -24, z: 10, anchorY: 5.3, chairColor: 0x8b5cf6, shirt: 0x7c3aed, hair: 0x1c1917, task: '💼 Perhitungan slip gaji & potongan PPh 21' },
      { id: 'staff-budi-kurir', name: 'Budi', role: 'Kurir Berkas Akuntansi', dept: 'finance', anchorY: 5.4, isWalker: true, route: 'finance', shirt: 0xf59e0b, task: '🚶 Antar map invoice dari meja Entry ke meja Lead' },

      // --- DIVISI 2: PROGRAMMER & SOFTWARE ENGINEERING (Tech Lab Tengah - 10 Orang) ---
      { id: 'dev-kevin', name: 'Kevin', role: 'Lead Backend Engineer', dept: 'tech', x: -7, z: -20, anchorY: 5.1, isDev: true, chairColor: 0x10b981, shirt: 0x047857, hair: 0x18181b, task: '💻 Maintain REST API Seventhsoft & Webhook n8n' },
      { id: 'dev-sarah', name: 'Sarah', role: 'Frontend React Engineer', dept: 'tech', x: 1, z: -20, anchorY: 5.5, isDev: true, chairColor: 0x06b6d4, shirt: 0x0284c7, hair: 0x78350f, task: '⚛️ Build UI Virtual Office & Live Dashboard' },
      { id: 'dev-reza', name: 'Reza', role: 'System Architect', dept: 'tech', x: 9, z: -20, anchorY: 5.1, isDev: true, chairColor: 0x8b5cf6, shirt: 0x6d28d9, hair: 0x0f172a, task: '🏗️ Arsitektur High-Availability Microservices' },
      { id: 'dev-aris', name: 'Aris', role: 'AI & LLM Engineer', dept: 'tech', x: -7, z: -12, anchorY: 5.5, isDev: true, chairColor: 0xf43f5e, shirt: 0xbe123c, hair: 0x27272a, task: '🧠 Fine-tuning Model OCR & Sanitasi Data PDP' },
      { id: 'dev-bambang', name: 'Bambang', role: 'Database Administrator', dept: 'tech', x: 1, z: -12, anchorY: 5.1, isDev: true, chairColor: 0x3b82f6, shirt: 0x1d4ed8, hair: 0x1c1917, task: '🗄️ Optimasi query General Ledger & Indexing DB' },
      { id: 'dev-deni', name: 'Deni', role: 'DevOps & Cloud Engineer', dept: 'tech', x: 9, z: -12, anchorY: 5.5, isDev: true, chairColor: 0x14b8a6, shirt: 0x0f766e, hair: 0x18181b, task: '🐳 Monitoring Docker, Caddy HTTPS, & VPS' },
      { id: 'dev-clara', name: 'Clara', role: 'QA & Test Automation', dept: 'tech', x: -7, z: -4, anchorY: 5.1, isDev: true, chairColor: 0xec4899, shirt: 0xdb2777, hair: 0x451a03, task: '🧪 Automasi testing siklus posting transaksi' },
      { id: 'dev-fikri', name: 'Fikri', role: 'Mobile App Developer', dept: 'tech', x: 1, z: -4, anchorY: 5.5, isDev: true, chairColor: 0xeab308, shirt: 0xca8a04, hair: 0x292524, task: '📱 Sinkronisasi Mobile App Seventhsoft' },
      { id: 'dev-adit', name: 'Adit', role: 'Cybersecurity Engineer', dept: 'tech', x: 9, z: -4, anchorY: 5.1, isDev: true, chairColor: 0x64748b, shirt: 0x334155, hair: 0x0f172a, task: '🔒 Penetrasi testing & Verifikasi hash SHA-256' },
      { id: 'dev-yoga', name: 'Yoga', role: 'IT Support & Infra', dept: 'tech', anchorY: 5.4, isWalker: true, route: 'tech', shirt: 0x0ea5e9, task: '🚶 Cek kabel LAN switch & temperatur server' },

      // --- DIVISI 3: PRODUCT & BUSINESS (Sayap Depan - 5 Orang) ---
      { id: 'biz-farhan', name: 'Farhan', role: 'Product Manager', dept: 'product', x: -26, z: 18, anchorY: 5.2, chairColor: 0xa855f7, shirt: 0x7e22ce, hair: 0x18181b, task: '📅 Perencanaan rilis fitur Seventhsoft v3.2' },
      { id: 'biz-lina', name: 'Lina', role: 'UI/UX Designer', dept: 'product', x: -17, z: 18, anchorY: 5.5, chairColor: 0xf43f5e, shirt: 0xf43f5e, hair: 0x7c2d12, task: '🎨 Desain prototipe navigasi modul gudang' },
      { id: 'biz-tania', name: 'Tania', role: 'Customer Success', dept: 'product', x: -8, z: 18, anchorY: 5.2, chairColor: 0x10b981, shirt: 0x059669, hair: 0x292524, task: '🎧 Pandu klien akuntan baru via ticketing' },
      { id: 'biz-bagus', name: 'Bagus', role: 'Enterprise Sales', dept: 'product', x: -21, z: 24, anchorY: 5.5, chairColor: 0x3b82f6, shirt: 0x1d4ed8, hair: 0x1c1917, task: '🤝 Demo otomatisasi AI ke klien korporasi' },
      { id: 'biz-putri', name: 'Putri', role: 'Technical Writer', dept: 'product', x: -12, z: 24, anchorY: 5.2, chairColor: 0xfbbf24, shirt: 0xd97706, hair: 0x451a03, task: '📖 Update dokumentasi SOP Four-Eyes Principle' },

      // --- DIVISI 4: PANTRY, KANTIN, LOUNGE & LOBBY (Sayap Kanan & Depan - 5 Orang) ---
      { id: 'cafe-koko', name: 'Koko', role: 'Barista Kantor', dept: 'lounge', x: 20, z: -22, anchorY: 5.3, isStanding: true, shirt: 0x78350f, hair: 0x18181b, task: '☕ Seduh kopi espresso untuk programmer & akuntan' },
      { id: 'cafe-buan', name: 'Bu Ani', role: 'Chef Kantin', dept: 'lounge', x: 28, z: -22, anchorY: 5.5, isStanding: true, shirt: 0xe11d48, hair: 0x451a03, task: '🥪 Siapkan snack sehat & kue sore kantor' },
      { id: 'lounge-gilang', name: 'Gilang', role: 'Staff Istirahat Lounge', dept: 'lounge', x: 22, z: 13, anchorY: 5.2, isSittingSofa: true, shirt: 0x10b981, hair: 0x27272a, task: '🎮 Main game konsol di smart TV lounge' },
      { id: 'lobby-bella', name: 'Bella', role: 'Front Desk Receptionist', dept: 'lounge', x: 1, z: 12, anchorY: 5.3, isFrontDesk: true, shirt: 0xd946ef, hair: 0x18181b, task: '🛎️ Sambut tamu klien akuntansi di lobby' },
      { id: 'staff-siti-jalan', name: 'Siti', role: 'Staff Keuangan', dept: 'lounge', anchorY: 5.4, isWalker: true, route: 'canteen', shirt: 0xf43f5e, task: '🚶 OTW ambil air galon di dispenser pantry' }
    ];

    employeeData.forEach(emp => {
      if (emp.isWalker) {
        this.createWalker(emp);
      } else {
        this.createSeatedEmployee(emp);
      }
    });

    // Perbarui counter di header UI
    const metricKaryawan = document.getElementById('metric-karyawan');
    if (metricKaryawan) metricKaryawan.textContent = '30/30';
    const metricObrolan = document.getElementById('metric-obrolan');
    if (metricObrolan) metricObrolan.textContent = '12';
  }

  createSeatedEmployee(emp) {
    if (!emp.isStanding && !emp.isSittingSofa && !emp.isFrontDesk) {
      this.createDeskStation({
        x: emp.x,
        z: emp.z,
        chairColor: emp.chairColor || 0x38bdf8,
        isDev: emp.isDev || false,
        isLead: emp.isLead || false
      });
    }

    const char = this.createVoxelCharacter({
      shirtColor: emp.shirt,
      hairColor: emp.hair
    });

    char.root.position.set(emp.x, 0, emp.z);
    char.root.userData = { empId: emp.id, empData: emp };

    // Register mesh untuk raycaster klik
    char.root.traverse(child => {
      if (child.isMesh) {
        child.userData = { empId: emp.id, empData: emp };
        this.interactiveObjects.push(child);
      }
    });

    this.scene.add(char.root);

    // Compact Name Badge dengan anchorHeight dinamis
    const badgeEl = this.createCompactBadge(emp);

    this.agents[emp.id] = {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      dept: emp.dept,
      mesh: char.root,
      headGroup: char.headGroup,
      armL: char.armL,
      armR: char.armR,
      badgeEl,
      task: emp.task,
      worldAnchor: new THREE.Vector3(emp.x, emp.anchorY || 5.2, emp.z),
      isStanding: emp.isStanding,
      isSittingSofa: emp.isSittingSofa
    };
  }

  createWalker(emp) {
    const char = this.createVoxelCharacter({
      shirtColor: emp.shirt,
      hairColor: 0x1f2937
    });

    let waypoints = [];
    if (emp.route === 'finance') {
      waypoints = [
        { x: -26, z: -17 },
        { x: -14, z: -17 },
        { x: -14, z: -3 },
        { x: -26, z: -3 },
        { x: -26, z: -17 }
      ];
    } else if (emp.route === 'tech') {
      waypoints = [
        { x: -5, z: -19 },
        { x: 9, z: -19 },
        { x: 9, z: -5 },
        { x: -5, z: -5 },
        { x: -5, z: -19 }
      ];
    } else {
      // route canteen / water dispenser
      waypoints = [
        { x: -3, z: 12 },
        { x: 12, z: 5 },
        { x: 26, z: -5 },
        { x: 33, z: -7 },
        { x: 22, z: -12 },
        { x: 12, z: 5 },
        { x: -3, z: 12 }
      ];
    }

    char.root.position.set(waypoints[0].x, 0, waypoints[0].z);
    char.root.userData = { empId: emp.id, empData: emp };
    char.root.traverse(child => {
      if (child.isMesh) {
        child.userData = { empId: emp.id, empData: emp };
        this.interactiveObjects.push(child);
      }
    });

    this.scene.add(char.root);

    const badgeEl = this.createCompactBadge(emp);

    this.wanderingStaff.push({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      dept: emp.dept,
      mesh: char.root,
      headGroup: char.headGroup,
      armL: char.armL,
      armR: char.armR,
      legL: char.legL,
      legR: char.legR,
      badgeEl,
      task: emp.task,
      waypoints,
      currentWpIndex: 0,
      speed: 0.042
    });
  }

  createCompactBadge(emp) {
    const badge = document.createElement('div');
    badge.className = `compact-staff-badge dept-${emp.dept} ${emp.isLead ? 'lead' : ''}`;
    badge.id = `badge-${emp.id}`;
    badge.dataset.dept = emp.dept;

    badge.innerHTML = `
      <span class="status-dot"></span>
      <span class="staff-short-name">${emp.name}</span>
      <div class="popover-bubble">
        <strong>${emp.role}</strong>
        <span>${emp.task}</span>
      </div>
    `;

    // Klik pada badge juga memicu inspector
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectEmployee(emp);
    });

    this.overlayContainer.appendChild(badge);
    return badge;
  }

  // =========================================================================
  // INTERAKSI KLIK INSPECTOR PEGAWAI
  // =========================================================================
  onClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData.empData && obj.parent) {
        obj = obj.parent;
      }
      if (obj && obj.userData.empData) {
        this.selectEmployee(obj.userData.empData);
      }
    }
  }

  selectEmployee(emp) {
    this.selectedAgent = emp;
    window.dispatchEvent(new CustomEvent('employee_selected', { detail: emp }));

    // Gerakkan kamera mendekat ke pegawai
    if (this.controls) {
      let targetPos;
      if (emp.x !== undefined && emp.z !== undefined) {
        targetPos = new THREE.Vector3(emp.x, 2.5, emp.z);
      } else {
        const staff = this.wanderingStaff.find(s => s.id === emp.id);
        targetPos = staff ? staff.mesh.position.clone() : new THREE.Vector3(0, 2, 0);
      }
      
      this.controls.target.lerp(targetPos, 0.9);
    }
  }

  setDivisionFilter(dept) {
    this.activeFilter = dept;
    const allBadges = document.querySelectorAll('.compact-staff-badge');
    allBadges.forEach(b => {
      if (dept === 'all' || b.dataset.dept === dept) {
        b.style.opacity = '1';
        b.style.pointerEvents = 'auto';
      } else {
        b.style.opacity = '0.15';
        b.style.pointerEvents = 'none';
      }
    });
  }

  toggleLabels(visible) {
    this.labelsVisible = visible !== undefined ? visible : !this.labelsVisible;
    this.overlayContainer.style.display = this.labelsVisible ? 'block' : 'none';
    return this.labelsVisible;
  }

  triggerCelebration(text) {
    // Tampilkan efek konfeti dan banner visual di atas meja lead
    const banner = document.createElement('div');
    banner.className = 'telegram-approval-banner';
    banner.innerHTML = `
      <div class="banner-icon">🎉</div>
      <div class="banner-body">
        <strong>OTORISASI TELEGRAM BERHASIL DIPOSTING!</strong>
        <span>${text || 'Transaksi resmi dicatat ke General Ledger Seventhsoft.'}</span>
      </div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => {
      banner.classList.add('fade-out');
      setTimeout(() => banner.remove(), 600);
    }, 4500);

    // Animasi gembira pada Finance Lead
    const lead = this.agents['lead-finance'];
    if (lead) {
      lead.isCheering = true;
      setTimeout(() => { lead.isCheering = false; }, 4000);
    }
  }

  triggerEmployeeSpeech(empId, name, speech) {
    const agent = this.agents[empId] || this.wanderingStaff.find(s => s.id === empId);
    if (!agent) return;

    // Gerakkan kamera mendekat ke pegawai yang sedang bicara
    if (this.controls) {
      let targetPos;
      if (agent.mesh) {
        targetPos = agent.mesh.position.clone();
      } else if (agent.worldAnchor) {
        targetPos = agent.worldAnchor.clone();
      }
      if (targetPos) {
        this.controls.target.lerp(new THREE.Vector3(targetPos.x, 2.5, targetPos.z), 0.85);
      }
    }

    // Buat Pop-up Balon Bicara Live di atas kepala
    const bubble = document.createElement('div');
    bubble.className = 'live-speech-popover';
    bubble.innerHTML = `
      <div class="speech-author">💬 ${name}</div>
      <div class="speech-content">"${speech}"</div>
    `;
    this.overlayContainer.appendChild(bubble);

    // Animasi bicara pada kepala
    if (agent.headGroup) {
      agent.isTalking = true;
      setTimeout(() => { agent.isTalking = false; }, 6000);
    }

    const anchor = agent.worldAnchor || new THREE.Vector3(agent.mesh.position.x, 5.5, agent.mesh.position.z);
    const updatePos = () => {
      if (!this.container) return;
      const widthHalf = this.container.clientWidth / 2;
      const heightHalf = this.container.clientHeight / 2;
      const curPos = agent.mesh ? agent.mesh.position.clone().setY(5.5) : anchor;
      const screenPos = curPos.project(this.camera);
      const px = (screenPos.x * widthHalf) + widthHalf;
      const py = -(screenPos.y * heightHalf) + heightHalf;
      bubble.style.transform = `translate(-50%, -100%) translate(${px}px, ${py - 12}px)`;
    };
    updatePos();
    const posInterval = setInterval(updatePos, 30);

    setTimeout(() => {
      clearInterval(posInterval);
      bubble.classList.add('fade-out');
      setTimeout(() => bubble.remove(), 500);
    }, 7000);
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

    // Kedipkan LED Server Rack
    if (this.serverRacks && this.serverRacks.length > 0) {
      this.serverRacks.forEach((led, i) => {
        const blink = Math.sin(elapsedTime * 6 + i * 2) > 0.1;
        led.material.color.setHex(blink ? 0x22c55e : 0x0284c7);
      });
    }

    // UPDATE PEGAWAI DUDUK
    Object.values(this.agents).forEach((agent, idx) => {
      if (agent.isCheering) {
        agent.armL.rotation.x = -Math.PI / 1.1 + Math.sin(elapsedTime * 12) * 0.4;
        agent.armR.rotation.x = -Math.PI / 1.1 - Math.sin(elapsedTime * 12) * 0.4;
        agent.headGroup.rotation.y = Math.sin(elapsedTime * 10) * 0.3;
      } else if (agent.mesh) {
        const freq = 6 + (idx % 4);
        const armOffset = Math.sin(elapsedTime * freq + idx) * 0.22;
        if (agent.armL && agent.armR) {
          agent.armL.rotation.x = -Math.PI / 4 + armOffset;
          agent.armR.rotation.x = -Math.PI / 4 - armOffset;
        }
        agent.headGroup.rotation.y = Math.sin(elapsedTime * 1.5 + idx) * 0.08;
      }

      if (agent.worldAnchor && this.labelsVisible) {
        const screenPos = agent.worldAnchor.clone().project(this.camera);
        const px = (screenPos.x * widthHalf) + widthHalf;
        const py = -(screenPos.y * heightHalf) + heightHalf;

        if (screenPos.z < 1 && px >= -50 && px <= this.container.clientWidth + 50) {
          agent.badgeEl.style.display = 'flex';
          agent.badgeEl.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`;
        } else {
          agent.badgeEl.style.display = 'none';
        }
      }
    });

    // UPDATE PEGAWAI JALAN (MONDAR-MANDIR)
    this.wanderingStaff.forEach(walker => {
      const targetWp = walker.waypoints[walker.currentWpIndex];
      const curPos = walker.mesh.position;

      const dx = targetWp.x - curPos.x;
      const dz = targetWp.z - curPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.3) {
        walker.currentWpIndex = (walker.currentWpIndex + 1) % walker.waypoints.length;
      } else {
        const angle = Math.atan2(dx, dz);
        walker.mesh.rotation.y = angle;

        curPos.x += (dx / dist) * walker.speed;
        curPos.z += (dz / dist) * walker.speed;

        const step = Math.sin(elapsedTime * 9);
        walker.legL.rotation.x = step * 0.55;
        walker.legR.rotation.x = -step * 0.55;
        walker.armL.rotation.x = -step * 0.45;
        walker.armR.rotation.x = step * 0.45;
        walker.headGroup.position.y = 3.65 + Math.abs(Math.sin(elapsedTime * 9)) * 0.12;
      }

      if (this.labelsVisible) {
        const walkerAnchor = new THREE.Vector3(curPos.x, 5.2, curPos.z);
        const screenPos = walkerAnchor.project(this.camera);
        const px = (screenPos.x * widthHalf) + widthHalf;
        const py = -(screenPos.y * heightHalf) + heightHalf;

        if (screenPos.z < 1 && px >= -50 && px <= this.container.clientWidth + 50) {
          walker.badgeEl.style.display = 'flex';
          walker.badgeEl.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`;
        } else {
          walker.badgeEl.style.display = 'none';
        }
      }
    });

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}

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
    this.buildMeetingZone();
    this.buildLoungeZone();
    this.buildDevOpsZone();
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
    this.scene.background = new THREE.Color(0xf1f5f9);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Kamera isometrik luas 2.5D persis seperti Agent Office Dashboard di foto
    this.camera = new THREE.PerspectiveCamera(31, width / height, 0.1, 1000);
    this.defaultCameraPos = new THREE.Vector3(0, 37, 43);
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
      this.controls.maxPolarAngle = Math.PI / 2.15;
      this.controls.minDistance = 20;
      this.controls.maxDistance = 85;
      this.controls.target.copy(this.cameraTarget);
    }
  }

  initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.52);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8ee, 0.95);
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

    const techGlow = new THREE.PointLight(0x00f2fe, 0.55, 30);
    techGlow.position.set(0, 5, -16);
    this.scene.add(techGlow);

    const softFill = new THREE.DirectionalLight(0xdbeafe, 0.35);
    softFill.position.set(-35, 25, -30);
    this.scene.add(softFill);
  }

  buildFloorPlan() {
    // Lantai kayu modern Skandinavia / warm parquet
    const floorGeo = new THREE.PlaneGeometry(74, 54);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe5dcd3 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Dinding Belakang Bersih Minimalis
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(74, 15, 0.8),
      new THREE.MeshLambertMaterial({ color: 0xf8fafc })
    );
    backWall.position.set(0, 7.5, -26);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Dinding Kiri Bersih Minimalis
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 15, 54),
      new THREE.MeshLambertMaterial({ color: 0xf8fafc })
    );
    sideWall.position.set(-37, 7.5, 1);
    sideWall.receiveShadow = true;
    this.scene.add(sideWall);

    // Dinding Kanan Bersih Minimalis
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 15, 54),
      new THREE.MeshLambertMaterial({ color: 0xf8fafc })
    );
    rightWall.position.set(37, 7.5, 1);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    // Jendela Panorama Gedung Pencakar Langit (City Skyline Panorama)
    const skyGeo = new THREE.PlaneGeometry(54, 7.2);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 1024;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d');
    const skyGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    skyGrad.addColorStop(0, '#38bdf8');
    skyGrad.addColorStop(0.7, '#bae6fd');
    skyGrad.addColorStop(1, '#ffffff');
    sCtx.fillStyle = skyGrad;
    sCtx.fillRect(0, 0, 1024, 256);

    // Siluet gedung bertingkat di kejauhan
    sCtx.fillStyle = '#94a3b8';
    const bldgs = [[60, 120, 70], [150, 160, 90], [260, 100, 60], [340, 180, 85], [445, 130, 95], [560, 170, 75], [655, 110, 80], [755, 190, 90], [865, 140, 70], [955, 160, 80]];
    bldgs.forEach(([bx, bh, bw]) => {
      sCtx.fillRect(bx, 256 - bh, bw, bh);
      sCtx.fillStyle = '#f1f5f9';
      for (let gy = 256 - bh + 14; gy < 240; gy += 18) {
        for (let gx = bx + 8; gx < bx + bw - 8; gx += 14) {
          sCtx.fillRect(gx, gy, 6, 8);
        }
      }
      sCtx.fillStyle = '#94a3b8';
    });

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex }));
    skyMesh.position.set(0, 10, -25.5);
    this.scene.add(skyMesh);

    // Kosen / Frame Jendela Putih Bersih
    [-18, 0, 18].forEach(wx => {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(17.2, 7.4, 0.4),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      frame.position.set(wx, 10, -25.3);
      this.scene.add(frame);
    });

    // Planter Box Tanaman Hijau di ambang jendela
    const planter = new THREE.Mesh(
      new THREE.BoxGeometry(54, 0.9, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    planter.position.set(0, 6.0, -24.8);
    planter.castShadow = true;
    this.scene.add(planter);

    // Deretan tanaman hias di ambang jendela
    [-24, -18, -12, -6, 0, 6, 12, 18, 24].forEach(px => {
      this.furniture.load('pottedPlant', (plant) => {
        this.furniture.fit(plant, { targetHeight: 2.1 });
        plant.position.set(px, 6.45, -24.8);
        this.scene.add(plant);
      });
    });

    // Papan Roadmap Seventhsoft di dinding kiri
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 512;
    roadCanvas.height = 256;
    const rCtx = roadCanvas.getContext('2d');
    rCtx.fillStyle = '#ffffff';
    rCtx.fillRect(0, 0, 512, 256);
    rCtx.strokeStyle = '#0284c7';
    rCtx.lineWidth = 8;
    rCtx.strokeRect(4, 4, 504, 248);
    rCtx.fillStyle = '#0f172a';
    rCtx.font = 'bold 34px sans-serif';
    rCtx.fillText('📊 SEVENTHSOFT ROADMAP', 24, 50);
    rCtx.fillStyle = '#0284c7';
    rCtx.font = '24px sans-serif';
    rCtx.fillText('✔ AI OCR Data Entry & Masking', 30, 95);
    rCtx.fillText('✔ Telegram GL Approver', 30, 140);
    rCtx.fillText('✔ Bank BCA Auto-Recon', 30, 185);
    rCtx.fillText('🚀 v3.2 AI Virtual Office Live', 30, 230);
    const roadTex = new THREE.CanvasTexture(roadCanvas);
    const roadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 3.8),
      new THREE.MeshBasicMaterial({ map: roadTex })
    );
    roadMesh.position.set(-20, 11, -25.5);
    this.scene.add(roadMesh);

    // Neon Sign COFFEE BAR di dinding kanan
    const neonCanvas = document.createElement('canvas');
    neonCanvas.width = 512;
    neonCanvas.height = 128;
    const nCtx = neonCanvas.getContext('2d');
    nCtx.font = 'bold 54px sans-serif';
    nCtx.fillStyle = '#00f2fe';
    nCtx.textAlign = 'center';
    nCtx.textBaseline = 'middle';
    nCtx.shadowColor = '#00f2fe';
    nCtx.shadowBlur = 20;
    nCtx.fillText('☕ COFFEE BAR', 256, 64);
    const neonTex = new THREE.CanvasTexture(neonCanvas);
    const neonSign = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 2.1),
      new THREE.MeshBasicMaterial({ map: neonTex, transparent: true })
    );
    neonSign.position.set(22, 11.5, -25.5);
    this.scene.add(neonSign);

    // Keset Welcome Seventhsoft di pintu masuk
    const welcomeCanvas = document.createElement('canvas');
    welcomeCanvas.width = 512;
    welcomeCanvas.height = 160;
    const wCtx = welcomeCanvas.getContext('2d');
    wCtx.fillStyle = '#0284c7';
    wCtx.fillRect(0, 0, 512, 160);
    wCtx.strokeStyle = '#38bdf8';
    wCtx.lineWidth = 10;
    wCtx.strokeRect(5, 5, 502, 150);
    wCtx.font = 'bold 44px sans-serif';
    wCtx.fillStyle = '#ffffff';
    wCtx.textAlign = 'center';
    wCtx.textBaseline = 'middle';
    wCtx.fillText('WELCOME SEVENTHSOFT', 256, 80);
    const welcomeTex = new THREE.CanvasTexture(welcomeCanvas);
    const welcomeMat = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 2.7),
      new THREE.MeshBasicMaterial({ map: welcomeTex })
    );
    welcomeMat.rotation.x = -Math.PI / 2;
    welcomeMat.position.set(0, 0.04, 21.5);
    this.scene.add(welcomeMat);

    // Pilar Masuk Pintu Kaca
    [-5, 5].forEach(dx => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 9, 16),
        new THREE.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
      );
      pillar.position.set(dx, 4.5, 23.5);
      this.scene.add(pillar);
    });
  }

  createFloorBadge(x, z, label, iconText) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Rounded pill
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    
    const r = 50;
    ctx.beginPath();
    ctx.moveTo(r, 10);
    ctx.lineTo(512 - r, 10);
    ctx.quadraticCurveTo(512 - 10, 10, 512 - 10, r);
    ctx.lineTo(512 - 10, 128 - r);
    ctx.quadraticCurveTo(512 - 10, 128 - 10, 512 - r, 128 - 10);
    ctx.lineTo(r, 128 - 10);
    ctx.quadraticCurveTo(10, 128 - 10, 10, 128 - r);
    ctx.lineTo(10, r);
    ctx.quadraticCurveTo(10, 10, r, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text with icon
    ctx.font = 'bold 38px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${iconText} ${label}`, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const geo = new THREE.PlaneGeometry(8.5, 2.1);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, polygonOffset: true, polygonOffsetFactor: -1 });
    const badgeMesh = new THREE.Mesh(geo, mat);
    badgeMesh.rotation.x = -Math.PI / 2;
    badgeMesh.position.set(x, 0.05, z);
    this.scene.add(badgeMesh);
    return badgeMesh;
  }

  // =========================================================================
  // ZONA 1: FOUNDER & LEAD FINANCE (Kiri Atas)
  // =========================================================================
  buildAccountingZone() {
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 16),
      new THREE.MeshLambertMaterial({ color: 0xfce7f3 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(-22, 0.02, -14);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // Lemari Arsip Berkas Berjejer
    [-18, -12].forEach(z => {
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
    safe.position.set(-35.2, 1.75, -6.5);
    safe.castShadow = true;
    this.scene.add(safe);

    this.createPottedPlant(-34, -7);
    this.createFloorBadge(-20, -7.5, 'FOUNDER / APPROVER GL', '👑');
  }

  // =========================================================================
  // ZONA 2: TECH LAB / SOFTWARE ENGINEERING & IT (Tengah Atas)
  // =========================================================================
  buildTechLabZone() {
    const techCarpet = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 16),
      new THREE.MeshLambertMaterial({ color: 0xbae6fd })
    );
    techCarpet.rotation.x = -Math.PI / 2;
    techCarpet.position.set(0, 0.02, -14);
    techCarpet.receiveShadow = true;
    this.scene.add(techCarpet);

    this.createPottedPlant(-12, -7.5);
    this.createPottedPlant(12, -7.5);
    this.createFloorBadge(0, -7.5, 'CODING & GENERAL LEDGER', '</>');
  }

  // =========================================================================
  // ZONA 3: KANTIN, CAFE & PANTRY (Kanan Atas)
  // =========================================================================
  buildCanteenZone() {
    const canteenFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 16),
      new THREE.MeshLambertMaterial({ color: 0xd1fae5 })
    );
    canteenFloor.rotation.x = -Math.PI / 2;
    canteenFloor.position.set(22, 0.025, -14);
    canteenFloor.receiveShadow = true;
    this.scene.add(canteenFloor);

    // Counter Bar Espresso
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(14, 2.8, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    bar.position.set(22, 1.4, -14);
    bar.castShadow = true;
    this.scene.add(bar);

    // Mesin Kopi Espresso Otentik Claw3D
    this.furniture.load('kitchenCoffeeMachine', (espresso) => {
      this.furniture.fit(espresso, { targetHeight: 1.5 });
      espresso.position.set(19, 2.8, -14);
      espresso.rotation.y = 0;
      this.scene.add(espresso);
    });

    // Kulkas Kantin Stainless Steel Claw3D
    this.furniture.load('kitchenFridgeSmall', (fridge) => {
      this.furniture.fit(fridge, { targetHeight: 7.2 });
      fridge.position.set(31.5, 0, -14);
      fridge.rotation.y = 0;
      this.scene.add(fridge);
    });

    this.createWaterDispenser(31.5, -8);
    this.createFloorBadge(22, -7.5, 'COFFEE BAR', '☕');
  }

  // =========================================================================
  // ZONA 4: RUANG MEETING (Kiri Bawah)
  // =========================================================================
  buildMeetingZone() {
    const meetingFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 18),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    meetingFloor.rotation.x = -Math.PI / 2;
    meetingFloor.position.set(-22, 0.02, 7);
    meetingFloor.receiveShadow = true;
    this.scene.add(meetingFloor);

    // Meja Konferensi Besar
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.3, 5.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    tableTop.position.set(-22, 2.3, 7);
    tableTop.castShadow = true;
    this.scene.add(tableTop);

    const legMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    [[-26.5, 4.8], [-17.5, 4.8], [-26.5, 9.2], [-17.5, 9.2]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.3, 8), legMat);
      leg.position.set(lx, 1.15, lz);
      this.scene.add(leg);
    });

    // Kursi Rapat di sekeliling meja
    const chairPos = [
      [-26, 4.2, 0], [-22, 4.2, 0], [-18, 4.2, 0],
      [-26, 9.8, Math.PI], [-22, 9.8, Math.PI], [-18, 9.8, Math.PI]
    ];
    chairPos.forEach(([cx, cz, crot]) => {
      this.furniture.load('chairModernCushion', (chair) => {
        this.furniture.fit(chair, { targetHeight: 1.8 });
        chair.position.set(cx, 0, cz);
        chair.rotation.y = crot;
        this.scene.add(chair);
      });
    });

    // Whiteboard Meeting SOP
    const wb = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 4.5, 7.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    wb.position.set(-33, 4.5, 7);
    this.scene.add(wb);

    this.createPottedPlant(-12, 7);
    this.createFloorBadge(-22, 14.5, 'MEETING ROOM', '💼');
  }

  // =========================================================================
  // ZONA 5: LOUNGE AREA & RELAXATION (Tengah Bawah)
  // =========================================================================
  buildLoungeZone() {
    const loungeFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 16),
      new THREE.MeshLambertMaterial({ color: 0xf3e8ff })
    );
    loungeFloor.rotation.x = -Math.PI / 2;
    loungeFloor.position.set(0, 0.02, 5);
    loungeFloor.receiveShadow = true;
    this.scene.add(loungeFloor);

    // Sofa Mewah Claw3D Ungu
    this.furniture.load('loungeSofa', (sofa) => {
      this.furniture.fit(sofa, { targetHeight: 2.7 });
      sofa.position.set(0, 0, 4);
      sofa.rotation.y = 0;
      sofa.traverse(c => {
        if (c.isMesh && c.material) {
          c.material.color.lerp(new THREE.Color(0x9333ea), 0.7);
        }
      });
      this.scene.add(sofa);
    });

    // Kursi Santai Kuning Aksen
    [-4.5, 4.5].forEach((ax, i) => {
      this.furniture.load('loungeDesignChair', (chair) => {
        this.furniture.fit(chair, { targetHeight: 2.3 });
        chair.position.set(ax, 0, 4);
        chair.rotation.y = i === 0 ? 0.3 : -0.3;
        chair.traverse(c => {
          if (c.isMesh && c.material) {
            c.material.color.lerp(new THREE.Color(0xfacc15), 0.8);
          }
        });
        this.scene.add(chair);
      });
    });

    // Meja Kopi Elegan Claw3D
    this.furniture.load('tableCoffee', (coffeeTable) => {
      this.furniture.fit(coffeeTable, { targetHeight: 1.1 });
      coffeeTable.position.set(0, 0, 6.8);
      this.scene.add(coffeeTable);
    });

    // Smart TV Layar Lebar
    const tv = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 3.8, 6.5),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    tv.position.set(8.5, 4.5, 5);
    tv.rotation.y = -Math.PI / 6;
    this.scene.add(tv);

    this.createFloorBadge(0, 10.5, 'LOUNGE AREA', '🛋️');
  }

  // =========================================================================
  // ZONA 6: DEVOPS & IT SERVER LAB (Kanan Bawah)
  // =========================================================================
  buildDevOpsZone() {
    const devopsFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 18),
      new THREE.MeshLambertMaterial({ color: 0x0f172a })
    );
    devopsFloor.rotation.x = -Math.PI / 2;
    devopsFloor.position.set(22, 0.02, 7);
    devopsFloor.receiveShadow = true;
    this.scene.add(devopsFloor);

    // Server Racks dengan Lampu Indikator Kedip
    this.serverRacks = [];
    [18, 21, 24, 27].forEach(sx => {
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 7.8, 2.0),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      rack.position.set(sx, 3.9, 1);
      rack.castShadow = true;
      this.scene.add(rack);

      const led = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.15, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x22c55e })
      );
      led.position.set(sx, 5.8, 2.05);
      this.scene.add(led);
      this.serverRacks.push(led);
    });

    // Big Monitoring Screen Dashboard
    const monScreen = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 4.2, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x0284c7 })
    );
    monScreen.position.set(23, 5.5, 7.5);
    monScreen.rotation.y = -Math.PI / 6;
    this.scene.add(monScreen);

    this.createFloorBadge(22, 14.5, 'DEVOPS & INFRA', '⚙️');
  }

  // =========================================================================
  // ZONA 7: ENTRANCE & RECEPTION (Depan Tengah)
  // =========================================================================
  buildReceptionZone() {
    const lobbyFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12),
      new THREE.MeshLambertMaterial({ color: 0xfef3c7 })
    );
    lobbyFloor.rotation.x = -Math.PI / 2;
    lobbyFloor.position.set(0, 0.02, 18);
    lobbyFloor.receiveShadow = true;
    this.scene.add(lobbyFloor);

    // Meja Resepsionis Lengkung Elegan
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 2.6, 2.2),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    desk.position.set(0, 1.3, 16);
    desk.castShadow = true;
    this.scene.add(desk);

    const bannerLogo = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 1.0, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xe11d48 })
    );
    bannerLogo.position.set(0, 1.3, 17.15);
    this.scene.add(bannerLogo);

    this.furniture.load('chairModernCushion', (chair) => {
      this.furniture.fit(chair, { targetHeight: 1.9 });
      chair.position.set(0, 0, 14.5);
      chair.rotation.y = 0;
      this.scene.add(chair);
    });

    this.createPottedPlant(-6, 16);
    this.createPottedPlant(6, 16);
    this.createFloorBadge(0, 13.5, 'RECEPTION & LOBBY', '🛎️');
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

    // Meja Claw3D di depan pegawai (z = +1.15)
    const deskModel = isLead ? 'deskCorner' : 'desk';
    this.furniture.load(deskModel, (deskInst) => {
      this.furniture.fit(deskInst, { targetHeight: 2.35 });
      deskInst.position.set(0, 0, 1.15);
      deskInst.rotation.y = 0;
      deskGroup.add(deskInst);
    });

    // Kursi Kerja Putar Ergonomis Claw3D (chairDesk) di belakang pegawai (z = -0.15)
    this.furniture.load('chairDesk', (chairInst) => {
      this.furniture.fit(chairInst, { targetHeight: 1.95 });
      chairInst.position.set(0, 0, -0.15);
      chairInst.rotation.y = Math.PI;
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
          screenInst.position.set(mx, 2.35, 1.1);
          screenInst.rotation.y = Math.PI + (mx < 0 ? -0.16 : 0.16);
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
        glow.position.set(mx, 3.12, 1.18);
        glow.rotation.y = mx < 0 ? 0.16 : -0.16;
        deskGroup.add(glow);
        screens.push(glow);
      });
    } else {
      // Single Screen untuk Akuntansi & Staf
      this.furniture.load('computerScreen', (screenInst) => {
        this.furniture.fit(screenInst, { targetHeight: 1.35 });
        screenInst.position.set(0, 2.35, 1.1);
        screenInst.rotation.y = Math.PI;
        deskGroup.add(screenInst);
      });

      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.75),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide
        })
      );
      glow.position.set(0, 3.12, 1.18);
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
  // 30 PEGAWAI LENGKAP: DISTRIBUSI PRESISI 7 ZONA 2.5D ISOMETRIC
  // =========================================================================
  build30Employees() {
    const employeeData = [
      // --- ZONA 1: FOUNDER / APPROVER GL (Kiri Atas) ---
      { id: 'lead-finance', name: 'Mikhael', role: 'Finance Lead (Approver GL)', dept: 'finance', x: -22, z: -16, anchorY: 6.8, chairColor: 0x7c3aed, shirt: 0x6d28d9, hair: 0x18181b, task: '🛡️ Otorisasi final posting GL Seventhsoft via Telegram', isLead: true },
      { id: 'agent-entry', name: 'agen-entry', role: 'AI Data Entry & OCR', dept: 'finance', x: -28, z: -16, anchorY: 6.8, chairColor: 0xec4899, shirt: 0x059669, hair: 0x451a03, task: '📄 Ekstraksi faktur & Masking PDP (Modul Beli)' },
      { id: 'agent-rekon', name: 'agen-rekon', role: 'AI Rekonsiliasi Bank', dept: 'finance', x: -16, z: -16, anchorY: 6.8, chairColor: 0x3b82f6, shirt: 0x0284c7, hair: 0x3b1e08, task: '🏦 Pencocokan e-statement BCA vs Kas Seventhsoft' },
      { id: 'agent-pajak', name: 'agen-pajak', role: 'AI Pajak & Margin', dept: 'finance', x: -22, z: -10, anchorY: 5.6, chairColor: 0xf59e0b, shirt: 0xd97706, hair: 0x172554, task: '📊 Proyeksi PPN 11% & Deteksi anomali HPP' },
      { id: 'staff-budi-kurir', name: 'Budi', role: 'Kurir Berkas Akuntansi', dept: 'finance', anchorY: 5.6, isWalker: true, route: 'finance', shirt: 0xf59e0b, task: '🚶 Antar map invoice dari meja Entry ke meja Lead' },

      // --- ZONA 2: CODING & GENERAL LEDGER (Tengah Atas) ---
      { id: 'dev-kevin', name: 'Kevin', role: 'Lead Backend Engineer', dept: 'tech', x: -8, z: -16, anchorY: 6.8, isDev: true, chairColor: 0x10b981, shirt: 0x047857, hair: 0x18181b, task: '💻 Maintain REST API Seventhsoft & Webhook n8n' },
      { id: 'dev-sarah', name: 'Sarah', role: 'Frontend React Engineer', dept: 'tech', x: 0, z: -16, anchorY: 6.8, isDev: true, chairColor: 0x06b6d4, shirt: 0x0284c7, hair: 0x78350f, task: '⚛️ Build UI Virtual Office & Live Dashboard' },
      { id: 'dev-reza', name: 'Reza', role: 'System Architect', dept: 'tech', x: 8, z: -16, anchorY: 6.8, isDev: true, chairColor: 0x8b5cf6, shirt: 0x6d28d9, hair: 0x0f172a, task: '🏗️ Arsitektur High-Availability Microservices' },
      { id: 'dev-aris', name: 'Aris', role: 'AI & LLM Engineer', dept: 'tech', x: -8, z: -10, anchorY: 5.6, isDev: true, chairColor: 0xf43f5e, shirt: 0xbe123c, hair: 0x27272a, task: '🧠 Fine-tuning Model OCR & Sanitasi Data PDP' },
      { id: 'dev-bambang', name: 'Bambang', role: 'Database Administrator', dept: 'tech', x: 0, z: -10, anchorY: 5.6, isDev: true, chairColor: 0x3b82f6, shirt: 0x1d4ed8, hair: 0x1c1917, task: '🗄️ Optimasi query General Ledger & Indexing DB' },
      { id: 'dev-fikri', name: 'Fikri', role: 'Mobile App Developer', dept: 'tech', x: 8, z: -10, anchorY: 5.6, isDev: true, chairColor: 0xeab308, shirt: 0xca8a04, hair: 0x292524, task: '📱 Sinkronisasi Mobile App Seventhsoft' },

      // --- ZONA 3: COFFEE BAR & PANTRY (Kanan Atas) ---
      { id: 'cafe-koko', name: 'Koko', role: 'Barista Kantor', dept: 'lounge', x: 18, z: -15, anchorY: 6.5, isStanding: true, shirt: 0x78350f, hair: 0x18181b, task: '☕ Seduh kopi espresso untuk programmer & akuntan' },
      { id: 'cafe-buan', name: 'Bu Ani', role: 'Chef Kantin', dept: 'lounge', x: 26, z: -15, anchorY: 6.5, isStanding: true, shirt: 0xe11d48, hair: 0x451a03, task: '🥪 Siapkan snack sehat & kue sore kantor' },
      { id: 'staff-siti-jalan', name: 'Siti', role: 'Staff Keuangan', dept: 'lounge', anchorY: 5.4, isWalker: true, route: 'canteen', shirt: 0xf43f5e, task: '🚶 OTW ambil air galon di dispenser pantry' },

      // --- ZONA 4: RUANG MEETING (Kiri Bawah) ---
      { id: 'staff-maya', name: 'Maya', role: 'Senior Auditor', dept: 'finance', x: -26, z: 4.2, anchorY: 5.2, isMeeting: true, chairColor: 0x14b8a6, shirt: 0x0d9488, hair: 0x7c2d12, task: '🔍 Tinjau audit log checksum SHA-256' },
      { id: 'staff-rian', name: 'Rian', role: 'Staf Pajak e-Faktur', dept: 'finance', x: -22, z: 4.2, anchorY: 5.2, isMeeting: true, chairColor: 0x6366f1, shirt: 0x4f46e5, hair: 0x18181b, task: '📑 Rekapitulasi SPT Masa & PPh 23' },
      { id: 'staff-dimas', name: 'Dimas', role: 'Junior Accountant', dept: 'finance', x: -18, z: 4.2, anchorY: 5.2, isMeeting: true, chairColor: 0x06b6d4, shirt: 0x0891b2, hair: 0x27272a, task: '📋 Verifikasi fisik surat jalan & invoice vendor' },
      { id: 'staff-nadia', name: 'Nadia', role: 'Billing & AR Specialist', dept: 'finance', x: -26, z: 9.8, anchorY: 4.8, isMeeting: true, chairColor: 0xf43f5e, shirt: 0xe11d48, hair: 0x451a03, task: '💳 Monitor piutang dagang jatuh tempo' },
      { id: 'staff-doni', name: 'Doni', role: 'Payroll Specialist', dept: 'finance', x: -18, z: 9.8, anchorY: 4.8, isMeeting: true, chairColor: 0x8b5cf6, shirt: 0x7c3aed, hair: 0x1c1917, task: '💼 Perhitungan slip gaji & potongan PPh 21' },

      // --- ZONA 5: LOUNGE AREA (Tengah Bawah) ---
      { id: 'lounge-gilang', name: 'Gilang', role: 'Staff Istirahat Lounge', dept: 'lounge', x: 0, z: 4, anchorY: 4.8, isSittingSofa: true, shirt: 0x10b981, hair: 0x27272a, task: '🎮 Main game konsol di smart TV lounge' },
      { id: 'biz-bagus', name: 'Bagus', role: 'Enterprise Sales', dept: 'product', x: -4.5, z: 4, anchorY: 4.8, isSittingSofa: true, shirt: 0x1d4ed8, hair: 0x1c1917, task: '🤝 Demo otomatisasi AI ke klien korporasi' },
      { id: 'biz-putri', name: 'Putri', role: 'Technical Writer', dept: 'product', x: 4.5, z: 4, anchorY: 4.8, isSittingSofa: true, shirt: 0xd97706, hair: 0x451a03, task: '📖 Update dokumentasi SOP Four-Eyes Principle' },
      { id: 'biz-farhan', name: 'Farhan', role: 'Product Manager', dept: 'product', x: -2.5, z: 8.5, anchorY: 4.6, isSittingSofa: true, shirt: 0x7e22ce, hair: 0x18181b, task: '📅 Perencanaan rilis fitur Seventhsoft v3.2' },
      { id: 'biz-lina', name: 'Lina', role: 'UI/UX Designer', dept: 'product', x: 2.5, z: 8.5, anchorY: 4.6, isSittingSofa: true, shirt: 0xf43f5e, hair: 0x7c2d12, task: '🎨 Desain prototipe navigasi modul gudang' },
      { id: 'biz-tania', name: 'Tania', role: 'Customer Success', dept: 'product', x: -4.5, z: 8.5, anchorY: 4.6, isSittingSofa: true, shirt: 0x059669, hair: 0x292524, task: '🎧 Pandu klien akuntan baru via ticketing' },

      // --- ZONA 6: DEVOPS & INFRA (Kanan Bawah) ---
      { id: 'dev-deni', name: 'Deni', role: 'DevOps & Cloud Engineer', dept: 'tech', x: 18, z: 9, anchorY: 5.6, isDev: true, chairColor: 0x14b8a6, shirt: 0x0f766e, hair: 0x18181b, task: '🐳 Monitoring Docker, Caddy HTTPS, & VPS' },
      { id: 'dev-clara', name: 'Clara', role: 'QA & Test Automation', dept: 'tech', x: 25, z: 9, anchorY: 5.6, isDev: true, chairColor: 0xec4899, shirt: 0xdb2777, hair: 0x451a03, task: '🧪 Automasi testing siklus posting transaksi' },
      { id: 'dev-adit', name: 'Adit', role: 'Cybersecurity Engineer', dept: 'tech', x: 21.5, z: 13.5, anchorY: 5.0, isDev: true, chairColor: 0x64748b, shirt: 0x334155, hair: 0x0f172a, task: '🔒 Penetrasi testing & Verifikasi hash SHA-256' },
      { id: 'dev-yoga', name: 'Yoga', role: 'IT Support & Infra', dept: 'tech', anchorY: 5.4, isWalker: true, route: 'tech', shirt: 0x0ea5e9, task: '🚶 Cek kabel LAN switch & temperatur server' },

      // --- ZONA 7: ENTRANCE & RECEPTION (Depan Tengah) ---
      { id: 'lobby-bella', name: 'Bella', role: 'Front Desk Receptionist', dept: 'lounge', x: 0, z: 15.5, anchorY: 4.8, isFrontDesk: true, shirt: 0xd946ef, hair: 0x18181b, task: '🛎️ Sambut tamu klien akuntansi di lobby' }
    ];

    this.employeeData = employeeData;

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
    if (!emp.isStanding && !emp.isSittingSofa && !emp.isFrontDesk && !emp.isMeeting) {
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
    if (emp.isMeeting) {
      char.root.rotation.y = emp.z < 7 ? Math.PI : 0;
    } else {
      char.root.rotation.y = Math.PI; // Selalu hadap ke depan / kamera!
    }
    if (emp.isSittingSofa || emp.isFrontDesk) {
      char.root.rotation.y = Math.PI; // Hadap ke depan ke arah pengunjung/kamera!
    }
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
        { x: -25, z: -7 },
        { x: -14, z: -7 },
        { x: -14, z: -19 },
        { x: -25, z: -19 },
        { x: -25, z: -7 }
      ];
    } else if (emp.route === 'tech') {
      waypoints = [
        { x: 17, z: 4 },
        { x: 27, z: 4 },
        { x: 27, z: 12 },
        { x: 17, z: 12 },
        { x: 17, z: 4 }
      ];
    } else {
      // route canteen / water dispenser
      waypoints = [
        { x: 4, z: 2 },
        { x: 14, z: -4 },
        { x: 22, z: -10 },
        { x: 28, z: -10 },
        { x: 14, z: -4 },
        { x: 4, z: 2 }
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

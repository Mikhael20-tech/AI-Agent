/**
 * Interactive Cyber-Accounting Avatar Engine
 * Mendukung visual state: 'idle', 'typing', 'waiting_approval', 'approved' (mengangguk), 'rejected' (menggeleng)
 */
export class AvatarRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.state = 'idle'; // idle | typing | waiting_approval | approved | rejected
    this.time = 0;
    this.stateTimer = 0;
    
    // Posisi & orientasi avatar
    this.headOffset = { x: 0, y: 0, angle: 0 };
    this.nodAngle = 0;
    this.shakeAngle = 0;
    this.eyeBlink = 0;
    this.scannerBeamY = 0;

    // Partikel ambient
    this.particles = [];
    this.initParticles();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;
  }

  initParticles() {
    for (let i = 0; i < 28; i++) {
      this.particles.push({
        x: Math.random() * 380,
        y: Math.random() * 300,
        radius: Math.random() * 2 + 1,
        speedY: -(Math.random() * 0.4 + 0.2),
        alpha: Math.random() * 0.7 + 0.2
      });
    }
  }

  setState(newState) {
    this.state = newState;
    this.stateTimer = 0;
  }

  animate() {
    this.time += 0.03;
    this.stateTimer += 0.03;

    // Reset canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update state dynamic offsets
    this.updateMotion();

    // Gambar layer
    this.drawBackgroundGlow();
    this.drawFloatingParticles();
    this.drawAvatarBody();
    this.drawAvatarHead();
    this.drawHoloElements();

    requestAnimationFrame(this.animate);
  }

  updateMotion() {
    // Kedipan mata natural
    if (Math.sin(this.time * 0.5) > 0.96) {
      this.eyeBlink = 1;
    } else {
      this.eyeBlink = 0;
    }

    // Gerak berdasarkan state
    if (this.state === 'idle') {
      // Floating lembut & nafas
      this.headOffset.y = Math.sin(this.time * 1.5) * 6;
      this.headOffset.angle = Math.sin(this.time * 0.8) * 0.03;
      this.nodAngle = 0;
      this.shakeAngle = 0;
    } 
    else if (this.state === 'typing') {
      // Gerak cepat seperti mengecek data invoice
      this.headOffset.y = Math.sin(this.time * 6) * 3 + 4;
      this.headOffset.angle = Math.sin(this.time * 4) * 0.05;
      this.scannerBeamY = (Math.sin(this.time * 4) + 1) * 0.5;
    } 
    else if (this.state === 'waiting_approval') {
      // Sikap siaga
      this.headOffset.y = Math.sin(this.time * 2) * 3;
      this.headOffset.angle = 0;
    } 
    else if (this.state === 'approved') {
      // MENGANGGUK (Nodding cycle)
      this.nodAngle = Math.sin(this.stateTimer * 6) * 0.16;
      this.headOffset.y = Math.sin(this.stateTimer * 6) * 8 + 4;
      this.shakeAngle = 0;
      // Otomatis kembali ke idle setelah 6 detik
      if (this.stateTimer > 6) this.state = 'idle';
    } 
    else if (this.state === 'rejected') {
      // MENGGELENG (Head shake cycle)
      this.shakeAngle = Math.sin(this.stateTimer * 7) * 0.2;
      this.headOffset.y = Math.sin(this.time * 2) * 3;
      this.nodAngle = 0;
      if (this.stateTimer > 6) this.state = 'idle';
    }
  }

  drawBackgroundGlow() {
    const cx = this.width / 2;
    const cy = this.height / 2 + 10;
    const grad = this.ctx.createRadialGradient(cx, cy, 10, cx, cy, 140);

    let glowColor = 'rgba(0, 242, 254, 0.15)';
    if (this.state === 'waiting_approval') glowColor = 'rgba(245, 158, 11, 0.18)';
    if (this.state === 'approved') glowColor = 'rgba(16, 185, 129, 0.22)';
    if (this.state === 'rejected') glowColor = 'rgba(244, 63, 94, 0.22)';

    grad.addColorStop(0, glowColor);
    grad.addColorStop(1, 'transparent');

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    this.ctx.fill();

    // Lingkaran hologram orbital
    this.ctx.save();
    this.ctx.translate(cx, cy + 20);
    this.ctx.rotate(this.time * 0.2);
    this.ctx.strokeStyle = glowColor.replace('0.15', '0.3').replace('0.18', '0.3').replace('0.22', '0.3');
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([8, 12]);
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, 105, 55, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawFloatingParticles() {
    this.ctx.fillStyle = this.state === 'approved' ? '#34d399' : (this.state === 'rejected' ? '#fb7185' : '#38bdf8');
    for (const p of this.particles) {
      p.y += p.speedY;
      if (p.y < 0) {
        p.y = this.height;
        p.x = Math.random() * this.width;
      }
      this.ctx.globalAlpha = p.alpha;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  drawAvatarBody() {
    const cx = this.width / 2;
    const cy = this.height / 2 + 55;

    this.ctx.save();
    this.ctx.translate(cx, cy);

    // Bahu robotik / jas akuntan futuristik
    this.ctx.fillStyle = '#1e293b';
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    this.ctx.moveTo(-58, 45);
    this.ctx.lineTo(-35, 10);
    this.ctx.lineTo(35, 10);
    this.ctx.lineTo(58, 45);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Dasi akuntan / core badge
    this.ctx.fillStyle = this.state === 'approved' ? '#10b981' : (this.state === 'rejected' ? '#f43f5e' : '#00f2fe');
    this.ctx.beginPath();
    this.ctx.moveTo(0, 15);
    this.ctx.lineTo(-6, 22);
    this.ctx.lineTo(0, 42);
    this.ctx.lineTo(6, 22);
    this.ctx.closePath();
    this.ctx.fill();

    // Kerah kemeja
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(-18, 10);
    this.ctx.lineTo(0, 22);
    this.ctx.lineTo(18, 10);
    this.ctx.stroke();

    this.ctx.restore();
  }

  drawAvatarHead() {
    const cx = this.width / 2 + this.headOffset.x;
    const cy = this.height / 2 - 10 + this.headOffset.y;
    const totalAngle = this.headOffset.angle + this.nodAngle + this.shakeAngle;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(totalAngle);

    // Helm / Kepala Robot AI
    const headGrad = this.ctx.createLinearGradient(0, -60, 0, 40);
    headGrad.addColorStop(0, '#1e293b');
    headGrad.addColorStop(1, '#0f172a');

    this.ctx.fillStyle = headGrad;
    this.ctx.strokeStyle = '#475569';
    this.ctx.lineWidth = 3;

    // Bentuk kepala cybernetic rounded
    this.ctx.beginPath();
    this.ctx.roundRect(-42, -50, 84, 85, [24, 24, 18, 18]);
    this.ctx.fill();
    this.ctx.stroke();

    // Antena telinga AI
    this.ctx.fillStyle = '#334155';
    this.ctx.fillRect(-49, -20, 8, 24);
    this.ctx.fillRect(41, -20, 8, 24);

    // Visor / Layar Wajah Kaca
    this.ctx.fillStyle = '#050a14';
    this.ctx.strokeStyle = this.state === 'approved' ? '#10b981' : (this.state === 'rejected' ? '#f43f5e' : '#00f2fe');
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(-34, -28, 68, 48, [12, 12, 12, 12]);
    this.ctx.fill();
    this.ctx.stroke();

    // Scanner beam saat typing
    if (this.state === 'typing') {
      const beamY = -24 + this.scannerBeamY * 40;
      this.ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
      this.ctx.fillRect(-32, beamY, 64, 4);
    }

    // MATA CYBERNETIC
    if (!this.eyeBlink) {
      let eyeColor = '#00f2fe';
      if (this.state === 'waiting_approval') eyeColor = '#f59e0b';
      if (this.state === 'approved') eyeColor = '#10b981';
      if (this.state === 'rejected') eyeColor = '#f43f5e';

      this.ctx.fillStyle = eyeColor;
      this.ctx.shadowColor = eyeColor;
      this.ctx.shadowBlur = 10;

      if (this.state === 'approved') {
        // Mata melengkung bahagia (Happy eyes ^ ^)
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = eyeColor;
        this.ctx.beginPath();
        this.ctx.arc(-14, -8, 7, Math.PI, 0, false);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(14, -8, 7, Math.PI, 0, false);
        this.ctx.stroke();
      } else if (this.state === 'rejected') {
        // Mata silang / waspada (> <)
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeStyle = eyeColor;
        // Kiri
        this.ctx.beginPath();
        this.ctx.moveTo(-18, -12); this.ctx.lineTo(-10, -6);
        this.ctx.moveTo(-10, -12); this.ctx.lineTo(-18, -6);
        this.ctx.stroke();
        // Kanan
        this.ctx.beginPath();
        this.ctx.moveTo(10, -12); this.ctx.lineTo(18, -6);
        this.ctx.moveTo(18, -12); this.ctx.lineTo(10, -6);
        this.ctx.stroke();
      } else {
        // Mata oval normal glowing
        this.ctx.beginPath();
        this.ctx.roundRect(-20, -12, 12, 9, 4);
        this.ctx.roundRect(8, -12, 12, 9, 4);
        this.ctx.fill();
      }
      this.ctx.shadowBlur = 0;
    }

    // Senyuman / Mulut Digital
    this.ctx.strokeStyle = this.state === 'approved' ? '#34d399' : (this.state === 'rejected' ? '#fb7185' : '#38bdf8');
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    if (this.state === 'approved') {
      this.ctx.arc(0, 4, 10, 0.2, Math.PI - 0.2, false); // Senyum lebar
    } else if (this.state === 'rejected') {
      this.ctx.arc(0, 12, 8, Math.PI + 0.3, -0.3, false); // Sedih / cemberut
    } else {
      this.ctx.moveTo(-8, 8);
      this.ctx.lineTo(8, 8); // Flat datar
    }
    this.ctx.stroke();

    this.ctx.restore();
  }

  drawHoloElements() {
    // Ikon status kecil di atas kepala avatar
    const cx = this.width / 2;
    const cy = this.height / 2 - 80 + this.headOffset.y;

    this.ctx.save();
    this.ctx.translate(cx, cy);

    if (this.state === 'waiting_approval') {
      // Tanda seru berkedip kuning
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.font = 'bold 18px "JetBrains Mono", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('⚠️ PENDING APPROVAL', 0, 0);
    } else if (this.state === 'approved') {
      // Tanda centang hijau
      this.ctx.fillStyle = '#10b981';
      this.ctx.font = 'bold 18px "JetBrains Mono", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('✅ GL POSTED', 0, 0);
    } else if (this.state === 'rejected') {
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.font = 'bold 18px "JetBrains Mono", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('❌ REVISION REQUIRED', 0, 0);
    } else if (this.state === 'typing') {
      this.ctx.fillStyle = '#00f2fe';
      this.ctx.font = 'bold 14px "JetBrains Mono", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('⚡ EXTRACTING & MASKING...', 0, 0);
    }

    this.ctx.restore();
  }
}

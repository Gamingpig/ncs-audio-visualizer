/**
 * NCSVisualizer - High-Fidelity Mathematical Recreation of the NCS Trap Circle Visualizer
 * Based on the Adobe After Effects / Trapcode Sound Keys & Audio Spectrum layout:
 * - 128 discrete radial bars arranged symmetrically around the circle (bass at bottom/center, highs flanking)
 * - Ultra-fast attack (~0.15) and smooth decay (~0.85) physics for explosive transient spikes
 * - Dynamic subbass scaling (~30-90 Hz) of central masked circle with crisp white border and concentrated intense neon glow
 * - Dynamic radial particle field exploding outward from circle rim on kick transient peaks
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    // Circle dimensions
    this.baseRadius = 140;
    this.currentRadius = 140;

    // Colors
    this.primaryColor = '#00ff44';
    this.glowColor = '#00e5ff';

    // Cover art setup
    this.coverImage = new Image();
    this.coverImage.crossOrigin = "anonymous";
    this.coverLoaded = false;
    this.setDefaultLogo();

    // NCS Particles
    this.particles = [];
    this.maxParticles = 280;

    // Trapcode Spectrum: 128 discrete radial bars
    this.barsCount = 128;
    this.barEnergies = new Float32Array(this.barsCount);

    // Subtle ambient spin
    this.rotation = 0;

    // DPI & canvas sizing
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(color, glow) {
    this.primaryColor = color;
    this.glowColor = glow;
  }

  setDefaultLogo() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <defs>
          <radialGradient id="bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#12121c"/>
            <stop offset="100%" stop-color="#050508"/>
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="200" fill="url(#bg)"/>
        <circle cx="200" cy="200" r="176" fill="none" stroke="#222230" stroke-width="4"/>
        <circle cx="200" cy="200" r="140" fill="none" stroke="#00ff88" stroke-width="7" opacity="0.4"/>
        <text x="200" y="195" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="70" text-anchor="middle" letter-spacing="6">NCS</text>
        <text x="200" y="240" fill="#00ff88" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="16" text-anchor="middle" letter-spacing="8">NOCOPYRIGHTSOUNDS</text>
      </svg>
    `;
    this.coverImage.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    this.coverImage.onload = () => {
      this.coverLoaded = true;
    };
  }

  setCoverArt(url) {
    if (!url) {
      this.setDefaultLogo();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      this.coverImage = img;
      this.coverLoaded = true;
    };
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;

    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.scale(this.dpr, this.dpr);

    const minDim = Math.min(this.width, this.height);
    this.baseRadius = Math.max(90, Math.min(170, minDim * 0.18));
  }

  // Dynamic Bass Particles Explosion
  spawnBassExplosion(energy) {
    const count = Math.floor(25 + energy * 45);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = this.currentRadius;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      // Eject outwards from the ring perimeter
      const angle = Math.random() * Math.PI * 2;
      const speed = 4.0 + Math.random() * 12.0 * (energy + 0.4);
      const size = 1.8 + Math.random() * 4.0;

      this.particles.push({
        x: cx + Math.cos(angle) * (r + 2),
        y: cy + Math.sin(angle) * (r + 2),
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2.0,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 2.0,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        size: size,
        color: Math.random() > 0.35 ? this.primaryColor : this.glowColor
      });
    }
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      // High initial velocity that drags quickly
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Render discrete Trapcode Audio Spectrum radial bars
   * Symmetrical mapping:
   * Left side and right side mirror each other.
   * Bass is concentrated symmetrically, highs trail off towards opposite side.
   */
  drawTrapcodeRadialBars(freqData, subBass) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const count = this.barsCount;
    const halfCount = count / 2;
    const binCount = freqData.length;

    // Symmetrical frequency bar calculation
    for (let i = 0; i < count; i++) {
      // Symmetrical distance from center
      const symIndex = i < halfCount ? i : (count - 1 - i);
      const frac = symIndex / halfCount;

      // Nonlinear perceptual frequency bin mapping (focus on sub/bass/mids)
      const binIdx = Math.floor(Math.pow(frac, 1.45) * (binCount * 0.48));
      const rawVal = (freqData[binIdx] || 0) / 255.0;

      // Transient attack/release physics:
      // Fast Attack: jumps up immediately
      // Decay / Release: smooth damped fall
      if (rawVal > this.barEnergies[i]) {
        this.barEnergies[i] = this.barEnergies[i] * 0.15 + rawVal * 0.85;
      } else {
        this.barEnergies[i] = this.barEnergies[i] * 0.86 + rawVal * 0.14;
      }
    }

    ctx.save();

    // 1. Base glow effect
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 18;
    ctx.lineCap = 'round';

    const maxBarLength = this.baseRadius * 1.15;
    const barWidth = Math.max(2.5, (2 * Math.PI * this.currentRadius / count) * 0.58);
    ctx.lineWidth = barWidth;

    const angleStep = (Math.PI * 2) / count;

    // Draw individual radial spikes
    for (let i = 0; i < count; i++) {
      const energy = this.barEnergies[i];
      // Height calculation with transient boost
      const barHeight = Math.pow(energy, 1.25) * maxBarLength + 3;

      // Symmetrical angle orientation: 0 starts at bottom/center (Math.PI / 2)
      const angle = (i * angleStep) + (Math.PI / 2);

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const startX = cx + cos * (this.currentRadius + 1);
      const startY = cy + sin * (this.currentRadius + 1);
      const endX = cx + cos * (this.currentRadius + barHeight);
      const endY = cy + sin * (this.currentRadius + barHeight);

      // Create glowing gradient for each bar from primary to glow accent
      const barGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      barGrad.addColorStop(0, this.primaryColor);
      barGrad.addColorStop(0.65, this.primaryColor);
      barGrad.addColorStop(1, this.glowColor);

      ctx.strokeStyle = barGrad;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    // 2. Continuous Envelope Cap line connecting bar tips (Classic NCS Trap look)
    ctx.shadowBlur = 24;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = this.primaryColor;
    ctx.beginPath();

    for (let i = 0; i < count; i++) {
      const energy = this.barEnergies[i];
      const barHeight = Math.pow(energy, 1.25) * maxBarLength + 3;
      const angle = (i * angleStep) + (Math.PI / 2);
      const tx = cx + Math.cos(angle) * (this.currentRadius + barHeight);
      const ty = cy + Math.sin(angle) * (this.currentRadius + barHeight);

      if (i === 0) {
        ctx.moveTo(tx, ty);
      } else {
        const prevAngle = ((i - 1) * angleStep) + (Math.PI / 2);
        const prevHeight = Math.pow(this.barEnergies[i - 1], 1.25) * maxBarLength + 3;
        const ptx = cx + Math.cos(prevAngle) * (this.currentRadius + prevHeight);
        const pty = cy + Math.sin(prevAngle) * (this.currentRadius + prevHeight);
        const mx = (ptx + tx) / 2;
        const my = (pty + ty) / 2;
        ctx.quadraticCurveTo(ptx, pty, mx, my);
      }
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  // Draw central circular cover art with pulsing bass scale and ring border
  drawCenterCircle(subBass) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = this.currentRadius;

    ctx.save();

    // 1. Concentrated Ambient Bass Glow behind the circle
    const haloRadius = r * (1.18 + subBass * 0.4);
    const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, haloRadius);
    haloGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    haloGrad.addColorStop(0.5, this.primaryColor + '55');
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. High-intensity neon ring glow
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 24 + subBass * 30;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary inner neon ring accent
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Masked Cover Art inside circle
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (this.coverLoaded && this.coverImage.width > 0) {
      const size = (r - 2.5) * 2;
      ctx.drawImage(this.coverImage, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = '#0a0a10';
      ctx.fill();
    }

    // 4. Subtle inner vignette for 3D depth
    const innerShadow = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r - 2.5);
    innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    innerShadow.addColorStop(0.8, 'rgba(0, 0, 0, 0.2)');
    innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
    ctx.fillStyle = innerShadow;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Main Render Frame
  render(audioMetrics) {
    const { freqData, subBass, kickPeak } = audioMetrics;

    // Subbass dynamic pumping calculation (Circle Trap Signature: 30-90Hz)
    const pumpTarget = this.baseRadius * (1.0 + Math.pow(subBass, 1.85) * 0.45);
    this.currentRadius = this.currentRadius * 0.62 + pumpTarget * 0.38;

    // Eject bass explosion particles on transient peaks or strong subbass
    if (kickPeak || subBass > 0.55) {
      this.spawnBassExplosion(subBass);
    }

    // Ambient floating particle drift
    if (Math.random() < 0.35) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.baseRadius * 1.4 + Math.random() * (Math.min(this.width, this.height) * 0.4);
      this.particles.push({
        x: this.width / 2 + Math.cos(angle) * dist,
        y: this.height / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7 - 0.25,
        alpha: 0.7,
        decay: 0.007,
        size: 1.4 + Math.random() * 2.2,
        color: Math.random() > 0.5 ? this.primaryColor : this.glowColor
      });
    }

    // Clear canvas background
    this.ctx.fillStyle = '#07070a';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 1. Draw Bass Particles
    this.updateParticles();
    this.drawParticles();

    // 2. Draw Trapcode Radial Bars
    this.drawTrapcodeRadialBars(freqData, subBass);

    // 3. Draw Center Circle
    this.drawCenterCircle(subBass);
  }
}

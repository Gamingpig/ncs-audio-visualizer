/**
 * Visualizer Renderer (High Performance Canvas2D & WebGL Bloom / Glow)
 * 1:1 Recreation of the iconic NoCopyrightSounds (NCS) Circle Trap Visualizer:
 * - Dynamic Subbass pumping central circle
 * - Smooth Bezier / B-Spline interpolation for radial spectrum spikes
 * - Kickbass particle explosion with physics decay and drift
 * - Neon glow & bloom effects
 * - Responsive DPI scaling
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    // Base circle settings
    this.baseRadius = 140;
    this.currentRadius = 140;
    this.targetRadius = 140;
    this.circleScale = 1.0;

    // Theme colors
    this.primaryColor = '#00ff44';
    this.glowColor = '#00e5ff';

    // Cover Art Image
    this.coverImage = new Image();
    this.coverImage.crossOrigin = "anonymous";
    this.coverLoaded = false;
    this.setDefaultLogo();

    // Particles system
    this.particles = [];
    this.maxParticles = 180;

    // Interpolation points count for circle spectrum
    this.spectrumBars = 120; // High density radial points
    this.smoothedValues = new Float32Array(this.spectrumBars);

    // Rotation angle for subtle hypnotic spin
    this.rotation = 0;

    // Handle Resize & DPI
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(color, glow) {
    this.primaryColor = color;
    this.glowColor = glow;
  }

  setDefaultLogo() {
    // Generate default NCS-style circular emblem SVG as Data URL
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
        <defs>
          <radialGradient id="bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#14141c"/>
            <stop offset="100%" stop-color="#050508"/>
          </radialGradient>
        </defs>
        <circle cx="150" cy="150" r="150" fill="url(#bg)"/>
        <circle cx="150" cy="150" r="130" fill="none" stroke="#222230" stroke-width="3"/>
        <circle cx="150" cy="150" r="105" fill="none" stroke="#00ff88" stroke-width="6" opacity="0.3"/>
        <text x="150" y="145" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="52" text-anchor="middle" letter-spacing="4">NCS</text>
        <text x="150" y="180" fill="#00ff88" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" text-anchor="middle" letter-spacing="6">TRAP EDITION</text>
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

    // Responsive circle radius base
    const minDim = Math.min(this.width, this.height);
    this.baseRadius = Math.max(90, Math.min(170, minDim * 0.18));
  }

  // Spawn dynamic bass shockwave particles
  spawnBassExplosion(energy) {
    const count = Math.floor(15 + energy * 30);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = this.currentRadius;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 8.0 * (energy + 0.3);
      const size = 1.5 + Math.random() * 3.5;

      this.particles.push({
        x: cx + Math.cos(angle) * (radius * 0.95),
        y: cy + Math.sin(angle) * (radius * 0.95),
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 1.5,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 1.5,
        alpha: 1.0,
        decay: 0.012 + Math.random() * 0.018,
        size: size,
        color: Math.random() > 0.4 ? this.primaryColor : this.glowColor
      });
    }
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
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
      ctx.shadowBlur = 10;
      ctx.fill();
    }
    ctx.restore();
  }

  // Smooth spline interpolation around circle
  calculateSpectrumPoints(freqData, subBass, mid) {
    const points = [];
    const bars = this.spectrumBars;
    const binCount = freqData.length;

    // Use logarithmic or perceptually grouped distribution for bars
    for (let i = 0; i < bars; i++) {
      // Map circle symmetrically: left and right mirrors
      const normalizedIndex = i < bars / 2 ? i : (bars - i);
      const frac = normalizedIndex / (bars / 2);

      // Focus bins on 40Hz - 6000Hz where musical energy lives
      const binIdx = Math.floor(Math.pow(frac, 1.6) * (binCount * 0.55));
      const rawVal = (freqData[binIdx] || 0) / 255.0;

      // Smoothing decay & attack
      if (rawVal > this.smoothedValues[i]) {
        this.smoothedValues[i] = this.smoothedValues[i] * 0.3 + rawVal * 0.7; // Fast attack
      } else {
        this.smoothedValues[i] = this.smoothedValues[i] * 0.86 + rawVal * 0.14; // Smooth release
      }

      // Height magnitude scaled by dynamic subbass punch
      const magnitude = this.smoothedValues[i];
      const spikeHeight = Math.pow(magnitude, 1.3) * (this.baseRadius * 0.95);

      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2 + this.rotation;
      const r = this.currentRadius + spikeHeight;

      points.push({
        x: this.width / 2 + Math.cos(angle) * r,
        y: this.height / 2 + Math.sin(angle) * r,
        baseX: this.width / 2 + Math.cos(angle) * this.currentRadius,
        baseY: this.height / 2 + Math.sin(angle) * this.currentRadius,
        angle: angle,
        height: spikeHeight,
        magnitude: magnitude
      });
    }

    return points;
  }

  // Draw smooth radial spectrum with Bezier curves and glowing gradient
  drawRadialSpectrum(points) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;

    if (points.length === 0) return;

    ctx.save();

    // Outer Glow pass
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 24;

    // Gradient fill/stroke
    const grad = ctx.createRadialGradient(
      cx, cy, this.currentRadius,
      cx, cy, this.currentRadius + this.baseRadius * 1.1
    );
    grad.addColorStop(0, this.primaryColor);
    grad.addColorStop(0.5, this.primaryColor);
    grad.addColorStop(1, this.glowColor);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Draw smooth outer perimeter curve (B-Spline / Catmull-Rom like smooth Bezier)
    ctx.beginPath();
    ctx.moveTo(
      (points[0].x + points[points.length - 1].x) / 2,
      (points[0].y + points[points.length - 1].y) / 2
    );

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }
    ctx.closePath();
    ctx.stroke();

    // 2. Draw radial rays / spikes connecting to inner circle (Iconic NCS look)
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.0;

    for (let i = 0; i < points.length; i += 2) {
      const p = points[i];
      if (p.height > 2) {
        ctx.beginPath();
        ctx.moveTo(p.baseX, p.baseY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Draw central circular cover art with pulsing bass scale and ring border
  drawCenterCircle(subBass) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = this.currentRadius;

    ctx.save();

    // Ambient Bass Glow beneath circle
    const haloRadius = r * (1.2 + subBass * 0.35);
    const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, haloRadius);
    haloGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    haloGrad.addColorStop(0.7, this.primaryColor + '33');
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // Outer Circle Ring
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 18 + subBass * 25;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Masked Cover Art
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (this.coverLoaded && this.coverImage.width > 0) {
      // Draw centered & cropped
      const img = this.coverImage;
      const size = (r - 3) * 2;
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = '#0f0f15';
      ctx.fill();
    }

    // Inner shadow overlay for depth
    const innerShadow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r - 3);
    innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    innerShadow.addColorStop(0.85, 'rgba(0, 0, 0, 0.25)');
    innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = innerShadow;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Main render loop
  render(audioMetrics) {
    const { freqData, subBass, mid, kickPeak } = audioMetrics;

    // Subbass dynamic pumping calculation (Circle Trap Signature)
    // Subbass ~40-120Hz violently pumps radius out
    const pumpTarget = this.baseRadius * (1.0 + Math.pow(subBass, 1.8) * 0.38);
    this.currentRadius = this.currentRadius * 0.65 + pumpTarget * 0.35;

    // Spawn bass explosion on peak
    if (kickPeak || subBass > 0.6) {
      this.spawnBassExplosion(subBass);
    }

    // Ambient floating particles drift
    if (Math.random() < 0.25) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.baseRadius * 1.5 + Math.random() * (Math.min(this.width, this.height) * 0.45);
      this.particles.push({
        x: this.width / 2 + Math.cos(angle) * dist,
        y: this.height / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.3,
        alpha: 0.6,
        decay: 0.006,
        size: 1.2 + Math.random() * 2,
        color: Math.random() > 0.5 ? this.primaryColor : this.glowColor
      });
    }

    // Slow rotation
    this.rotation += 0.0025 + subBass * 0.004;

    // Clear Canvas with subtle trail for motion blur
    this.ctx.fillStyle = '#07070a';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 1. Draw Bass Particles
    this.updateParticles();
    this.drawParticles();

    // 2. Draw Radial Spectrum
    const points = this.calculateSpectrumPoints(freqData, subBass, mid);
    this.drawRadialSpectrum(points);

    // 3. Draw Center Circle
    this.drawCenterCircle(subBass);
  }
}

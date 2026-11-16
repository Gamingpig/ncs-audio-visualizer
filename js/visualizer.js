/**
 * Universal High-Fidelity Audio Spectrum Visualizer
 * Inspired by the iconic After Effects Trapcode Audio Spectrum (e.g. Elektronomia - Sky High):
 * - 128 discrete radial spectrum bars mapped symmetrically with high-contrast glowing gradients.
 * - Dynamic 2nd-order spring-damper physics on the central disc reacting to kick & sub-bass.
 * - Expanding neon shockwave ripple rings on heavy kick transients.
 * - Multi-layer radial ambient glow halo behind the circle that breathes in sync with the beat.
 * - Radial particle burst explosions on kicks + ambient stardust floating drift.
 * - Masked album artwork / neutral high-tech sound core disc with dual neon rims (No forced NCS branding!).
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    // Base geometry
    this.baseRadius = 145;
    this.currentRadius = 145;
    this.radiusVelocity = 0; // For spring physics

    // Default theme: Elektronomia Sky High Electric Gold / Amber
    this.primaryColor = '#ffe600';
    this.glowColor = '#ff7700';

    // Cover art setup
    this.coverImage = new Image();
    this.coverImage.crossOrigin = "anonymous";
    this.coverLoaded = false;
    this.setDefaultLogo();

    // Particle systems
    this.particles = [];
    this.maxParticles = 320;

    // Shockwave ripple rings
    this.shockwaves = [];

    // Trapcode Spectrum: 128 discrete radial bars
    this.barsCount = 128;
    this.barEnergies = new Float32Array(this.barsCount);
    this.barPeaks = new Float32Array(this.barsCount);

    // DPI & canvas sizing
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(color, glow) {
    this.primaryColor = color;
    this.glowColor = glow;
  }

  /**
   * Neutral, modern music disc emblem (completely free of NCS branding)
   * Featuring concentric vinyl grooving and a glowing sound wave core.
   */
  setDefaultLogo() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <defs>
          <radialGradient id="discBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#181828"/>
            <stop offset="50%" stop-color="#0e0e18"/>
            <stop offset="100%" stop-color="#05050a"/>
          </radialGradient>
          <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffe600"/>
            <stop offset="100%" stop-color="#ff7700"/>
          </linearGradient>
        </defs>
        <circle cx="256" cy="256" r="256" fill="url(#discBg)"/>
        <!-- Concentric vinyl grooving -->
        <circle cx="256" cy="256" r="238" fill="none" stroke="#252538" stroke-width="2" opacity="0.6"/>
        <circle cx="256" cy="256" r="210" fill="none" stroke="#1c1c2a" stroke-width="1.5" opacity="0.8"/>
        <circle cx="256" cy="256" r="180" fill="none" stroke="#252538" stroke-width="2" opacity="0.5"/>
        <circle cx="256" cy="256" r="148" fill="none" stroke="#1c1c2a" stroke-width="1.5" opacity="0.7"/>
        <circle cx="256" cy="256" r="116" fill="none" stroke="#ffe600" stroke-width="3" opacity="0.4"/>
        <circle cx="256" cy="256" r="80" fill="#0d0d16" stroke="#252538" stroke-width="2"/>
        <!-- Central glowing waveform graphic -->
        <path d="M 180 256 Q 195 210, 210 256 T 240 256 T 256 195 T 272 317 T 302 256 T 332 256"
              fill="none" stroke="url(#waveGrad)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="256" cy="256" r="10" fill="#ffffff" opacity="0.9"/>
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
    img.onerror = () => {
      this.setDefaultLogo();
    };
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.scale(this.dpr, this.dpr);

    const minDim = Math.min(this.width, this.height);
    this.baseRadius = Math.max(95, Math.min(185, minDim * 0.19));
    this.currentRadius = this.baseRadius;
  }

  // Shockwave ripple ring on heavy kicks
  triggerShockwave(energy) {
    this.shockwaves.push({
      radius: this.currentRadius,
      maxRadius: this.currentRadius + 140 + energy * 160,
      alpha: 0.85,
      speed: 5.5 + energy * 8.5,
      width: 3.5,
      color: this.primaryColor
    });
  }

  updateShockwaves() {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed;
      const progress = (sw.radius - this.currentRadius) / (sw.maxRadius - this.currentRadius);
      sw.alpha = Math.max(0, 0.85 * (1 - progress));
      sw.width = Math.max(0.5, 3.5 * (1 - progress * 0.7));

      if (sw.alpha <= 0.01 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  drawShockwaves() {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;

    ctx.save();
    for (const sw of this.shockwaves) {
      ctx.beginPath();
      ctx.arc(cx, cy, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = sw.alpha;
      ctx.lineWidth = sw.width;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 18;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Radial particle explosion on kick transient
  spawnBassExplosion(energy) {
    const count = Math.floor(20 + energy * 40);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = this.currentRadius;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 4.0 + Math.random() * 10.0 * (energy + 0.5);
      const size = 1.5 + Math.random() * 3.5;

      this.particles.push({
        x: cx + Math.cos(angle) * (r + 4),
        y: cy + Math.sin(angle) * (r + 4),
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 1.5,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 1.5,
        alpha: 1.0,
        decay: 0.016 + Math.random() * 0.02,
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
      p.vx *= 0.95; // Aerodynamic drag
      p.vy *= 0.95;
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

  /**
   * Symmetrical After Effects Audio Spectrum (128 radial bars)
   * Left side and right side mirror each other perfectly.
   */
  drawRadialSpectrum(freqData, subBass) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const count = this.barsCount;
    const halfCount = count / 2;
    const binCount = freqData.length;

    // Symmetrical frequency bar calculation with perceptual distribution
    for (let i = 0; i < count; i++) {
      const symIndex = i < halfCount ? i : (count - 1 - i);
      const frac = symIndex / halfCount; // 0 (bottom/bass) to 1 (top/treble)

      // Perceptual bin index: concentrates low bins for bass punch
      const minBin = 2;
      const maxBin = Math.floor(binCount * 0.72);
      const binIdx = Math.floor(minBin + Math.pow(frac, 2.0) * (maxBin - minBin));

      // 3-bin average for silky-smooth response
      let valSum = 0;
      const sampleSpread = 2;
      for (let s = -sampleSpread; s <= sampleSpread; s++) {
        const idx = Math.max(0, Math.min(binCount - 1, binIdx + s));
        valSum += freqData[idx];
      }
      let rawVal = (valSum / (sampleSpread * 2 + 1)) / 255.0;

      // Equal loudness compensation curve
      const trebleBoost = 1.0 + frac * 0.9;
      rawVal = Math.min(1.0, rawVal * trebleBoost);

      // Fast explosive attack & smooth release
      if (rawVal > this.barEnergies[i]) {
        this.barEnergies[i] = this.barEnergies[i] * 0.18 + rawVal * 0.82;
      } else {
        this.barEnergies[i] = this.barEnergies[i] * 0.84 + rawVal * 0.16;
      }

      // Track floating peak caps
      if (this.barEnergies[i] > this.barPeaks[i]) {
        this.barPeaks[i] = this.barEnergies[i];
      } else {
        this.barPeaks[i] = Math.max(0, this.barPeaks[i] - 0.012);
      }
    }

    ctx.save();
    ctx.lineCap = 'round';

    const maxBarLength = this.baseRadius * 1.25;
    const barWidth = Math.max(2.4, (2 * Math.PI * this.currentRadius / count) * 0.62);
    ctx.lineWidth = barWidth;

    const angleStep = (Math.PI * 2) / count;

    // 1. Draw Individual Radial Spikes
    for (let i = 0; i < count; i++) {
      const energy = this.barEnergies[i];
      const barHeight = Math.pow(energy, 1.2) * maxBarLength + 4;

      // Angle: 0 starts at bottom center (Math.PI / 2)
      const angle = (i * angleStep) + (Math.PI / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const startX = cx + cos * (this.currentRadius + 1);
      const startY = cy + sin * (this.currentRadius + 1);
      const endX = cx + cos * (this.currentRadius + barHeight);
      const endY = cy + sin * (this.currentRadius + barHeight);

      // Glowing multi-color gradient from primary to glow accent
      const barGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      barGrad.addColorStop(0, this.primaryColor);
      barGrad.addColorStop(0.7, this.primaryColor);
      barGrad.addColorStop(1, this.glowColor);

      ctx.strokeStyle = barGrad;
      ctx.shadowColor = this.primaryColor;
      ctx.shadowBlur = 14 + energy * 12;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Peak Cap Dot
      const peakEnergy = this.barPeaks[i];
      if (peakEnergy > 0.08) {
        const peakHeight = Math.pow(peakEnergy, 1.2) * maxBarLength + 6;
        const peakX = cx + cos * (this.currentRadius + peakHeight);
        const peakY = cy + sin * (this.currentRadius + peakHeight);

        ctx.fillStyle = this.glowColor;
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(peakX, peakY, Math.max(1.2, barWidth * 0.42), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Smooth Continuous Envelope Line connecting bar tips
    ctx.shadowBlur = 22;
    ctx.shadowColor = this.primaryColor;
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = this.primaryColor;
    ctx.beginPath();

    for (let i = 0; i < count; i++) {
      const energy = this.barEnergies[i];
      const barHeight = Math.pow(energy, 1.2) * maxBarLength + 4;
      const angle = (i * angleStep) + (Math.PI / 2);
      const tx = cx + Math.cos(angle) * (this.currentRadius + barHeight);
      const ty = cy + Math.sin(angle) * (this.currentRadius + barHeight);

      if (i === 0) {
        ctx.moveTo(tx, ty);
      } else {
        const prevAngle = ((i - 1) * angleStep) + (Math.PI / 2);
        const prevHeight = Math.pow(this.barEnergies[i - 1], 1.2) * maxBarLength + 4;
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

    // 1. Concentrated Ambient Bass Glow behind the circle (breathing with rhythm)
    const haloRadius = r * (1.15 + subBass * 0.45);
    const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, haloRadius);
    haloGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    haloGrad.addColorStop(0.4, this.primaryColor + '40');
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. High-intensity Outer Neon Ring Glow
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 24 + subBass * 32;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary inner neon accent ring
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Masked Album Cover Art / Sound Core
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (this.coverLoaded && this.coverImage.width > 0) {
      const size = (r - 2.5) * 2;
      ctx.drawImage(this.coverImage, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = '#0a0a14';
      ctx.fill();
    }

    // 4. Inner Vignette / Radial Dark Shadow for 3D Depth
    const innerShadow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r - 2.5);
    innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    innerShadow.addColorStop(0.75, 'rgba(0, 0, 0, 0.25)');
    innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = innerShadow;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Main Render Frame
  render(audioMetrics) {
    const { freqData, subBass, kickPeak } = audioMetrics;

    // Spring-damper physics for natural bouncy 4-on-the-floor pulsation:
    const targetRadius = this.baseRadius * (1.0 + Math.pow(subBass, 1.8) * 0.42);
    const displacement = targetRadius - this.currentRadius;
    const springStiffness = 0.28;
    const damping = 0.72;

    this.radiusVelocity += displacement * springStiffness;
    this.radiusVelocity *= damping;
    this.currentRadius += this.radiusVelocity;

    // Eject shockwaves & particles on kick transients
    if (kickPeak) {
      this.triggerShockwave(subBass);
      this.spawnBassExplosion(subBass);
    } else if (subBass > 0.6) {
      this.spawnBassExplosion(subBass * 0.7);
    }

    // Ambient floating stardust drift
    if (Math.random() < 0.35) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.baseRadius * 1.35 + Math.random() * (Math.min(this.width, this.height) * 0.42);
      this.particles.push({
        x: this.width / 2 + Math.cos(angle) * dist,
        y: this.height / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6 - 0.2,
        alpha: 0.65,
        decay: 0.006,
        size: 1.2 + Math.random() * 2.0,
        color: Math.random() > 0.5 ? this.primaryColor : this.glowColor
      });
    }

    // Clear background to rich obsidian dark
    this.ctx.fillStyle = '#050508';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 1. Shockwaves
    this.updateShockwaves();
    this.drawShockwaves();

    // 2. Bass Particles
    this.updateParticles();
    this.drawParticles();

    // 3. Radial Spectrum Bars
    this.drawRadialSpectrum(freqData, subBass);

    // 4. Center Disc
    this.drawCenterCircle(subBass);
  }
}

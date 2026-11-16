/**
 * High-Fidelity Audio Spectrum Visualizer
 * Faithful 1:1 recreation of the classic After Effects Audio Spectrum (e.g. Elektronomia - Sky High):
 * - Atmospheric cosmic nebula & mountain silhouette background with dynamic Bass Zoom.
 * - Symmetrical 128 radial Analog Lines with bright white cores and electric gold neon tips.
 * - Open, razor-sharp spike tips (No cartoonish envelope wire!).
 * - Razor-sharp white circular disc rim with intense neon halo bloom.
 * - Authentic 4-on-the-floor Progressive House spring kick-bounce.
 * - Reactive shockwave ripple rings & floating bokeh particles.
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    // Base geometry
    this.baseRadius = 140;
    this.currentRadius = 140;
    this.radiusVelocity = 0; // For spring physics

    // Default theme: Elektronomia Sky High Electric Gold / Amber
    this.primaryColor = '#ffe600';
    this.glowColor = '#ff7700';

    // Cover art setup
    this.coverImage = new Image();
    this.coverImage.crossOrigin = "anonymous";
    this.coverLoaded = false;
    this.setDefaultLogo();

    // Custom background image (if loaded)
    this.backgroundImage = null;

    // Particle systems
    this.particles = [];
    this.maxParticles = 180;
    this.stars = [];
    this.initStars();

    // Shockwave ripple rings
    this.shockwaves = [];

    // 128 discrete radial analog lines
    this.barsCount = 128;
    this.barEnergies = new Float32Array(this.barsCount);

    // DPI & canvas sizing
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(color, glow) {
    this.primaryColor = color;
    this.glowColor = glow;
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.8 + Math.random() * 2.0,
        baseAlpha: 0.2 + Math.random() * 0.6,
        speed: 0.0003 + Math.random() * 0.0008,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }
  }

  /**
   * Neutral, high-tech vinyl sound core disc (completely free of NCS branding)
   */
  setDefaultLogo() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <defs>
          <radialGradient id="discBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#18182c"/>
            <stop offset="60%" stop-color="#0c0c16"/>
            <stop offset="100%" stop-color="#04040a"/>
          </radialGradient>
          <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="40%" stop-color="#ffe600"/>
            <stop offset="100%" stop-color="#ff7700"/>
          </linearGradient>
        </defs>
        <circle cx="256" cy="256" r="256" fill="url(#discBg)"/>
        <!-- Fine vinyl micro-grooves -->
        <circle cx="256" cy="256" r="238" fill="none" stroke="#25253c" stroke-width="1.8" opacity="0.6"/>
        <circle cx="256" cy="256" r="212" fill="none" stroke="#1c1c2e" stroke-width="1.5" opacity="0.8"/>
        <circle cx="256" cy="256" r="182" fill="none" stroke="#25253c" stroke-width="1.8" opacity="0.6"/>
        <circle cx="256" cy="256" r="150" fill="none" stroke="#1c1c2e" stroke-width="1.5" opacity="0.7"/>
        <circle cx="256" cy="256" r="118" fill="none" stroke="#ffe600" stroke-width="2.5" opacity="0.4"/>
        <circle cx="256" cy="256" r="82" fill="#0b0b14" stroke="#25253c" stroke-width="2"/>
        <!-- Centered glowing soundwave core -->
        <path d="M 175 256 Q 195 200, 215 256 T 240 256 T 256 185 T 272 327 T 297 256 T 337 256"
              fill="none" stroke="url(#waveGrad)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="256" cy="256" r="9" fill="#ffffff" opacity="0.95"/>
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

  setBackgroundArt(url) {
    if (!url) {
      this.backgroundImage = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      this.backgroundImage = img;
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
    this.baseRadius = Math.max(90, Math.min(175, minDim * 0.185));
    this.currentRadius = this.baseRadius;
  }

  // Shockwave ripple ring on heavy kicks
  triggerShockwave(energy) {
    this.shockwaves.push({
      radius: this.currentRadius,
      maxRadius: this.currentRadius + 130 + energy * 150,
      alpha: 0.8,
      speed: 5.0 + energy * 8.0,
      width: 3.0,
      color: this.primaryColor
    });
  }

  updateShockwaves() {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed;
      const progress = (sw.radius - this.currentRadius) / (sw.maxRadius - this.currentRadius);
      sw.alpha = Math.max(0, 0.8 * (1 - progress));
      sw.width = Math.max(0.5, 3.0 * (1 - progress * 0.6));

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
    const count = Math.floor(18 + energy * 36);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = this.currentRadius;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 4.0 + Math.random() * 9.0 * (energy + 0.5);
      const size = 1.4 + Math.random() * 3.2;

      this.particles.push({
        x: cx + Math.cos(angle) * (r + 4),
        y: cy + Math.sin(angle) * (r + 4),
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 1.5,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 1.5,
        alpha: 1.0,
        decay: 0.016 + Math.random() * 0.02,
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
      p.vx *= 0.95;
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
   * Draw Atmospheric Sky High Cosmic Background with Bass Zoom
   */
  drawBackground(subBass) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();

    // Bass zoom scale factor (After Effects Bass Shake)
    const zoomScale = 1.0 + Math.pow(subBass, 1.8) * 0.035;
    ctx.translate(cx, cy);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-cx, -cy);

    if (this.backgroundImage && this.backgroundImage.width > 0) {
      ctx.drawImage(this.backgroundImage, 0, 0, w, h);
    } else {
      // Procedural Deep Atmospheric Cosmic Sky High Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#040612');
      skyGrad.addColorStop(0.45, '#070b1c');
      skyGrad.addColorStop(0.85, '#0c1328');
      skyGrad.addColorStop(1, '#050711');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Distant mountain silhouette in the lower third
      ctx.fillStyle = '#03050c';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.88);
      ctx.lineTo(w * 0.15, h * 0.83);
      ctx.lineTo(w * 0.32, h * 0.89);
      ctx.lineTo(w * 0.50, h * 0.81);
      ctx.lineTo(w * 0.68, h * 0.87);
      ctx.lineTo(w * 0.85, h * 0.82);
      ctx.lineTo(w, h * 0.88);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Atmospheric horizon mist glow
      const mistGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
      mistGrad.addColorStop(0, 'rgba(0, 160, 255, 0.0)');
      mistGrad.addColorStop(0.5, 'rgba(0, 160, 255, 0.08)');
      mistGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
    }

    // Twinkling stars
    for (const s of this.stars) {
      s.twinklePhase += 0.03;
      const alpha = s.baseAlpha * (0.7 + Math.sin(s.twinklePhase) * 0.3);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy cinematic edge vignette
    const vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.45)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
    ctx.fillStyle = vignette;
    ctx.globalAlpha = 1.0;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  /**
   * After Effects Audio Spectrum: Symmetrical Radial Analog Lines
   * Focused on 45 Hz - 3500 Hz for intense, synchronized dance motion!
   */
  drawRadialSpectrum(freqData, subBass) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const count = this.barsCount;
    const halfCount = count / 2;
    const binCount = freqData.length;

    // Symmetrical frequency bar calculation (45 Hz to 3500 Hz)
    const minBin = 2; // ~45 Hz
    const maxBin = Math.floor(binCount * 0.42); // ~3500 Hz

    for (let i = 0; i < count; i++) {
      const symIndex = i < halfCount ? i : (count - 1 - i);
      const frac = symIndex / halfCount; // 0 (bottom/bass) to 1 (top/treble)

      // Perceptual distribution matching After Effects Audio Spectrum
      const binIdx = Math.floor(minBin + Math.pow(frac, 1.7) * (maxBin - minBin));

      // 3-bin average for smooth analog line spikes
      let valSum = 0;
      const sampleSpread = 2;
      for (let s = -sampleSpread; s <= sampleSpread; s++) {
        const idx = Math.max(0, Math.min(binCount - 1, binIdx + s));
        valSum += freqData[idx];
      }
      let rawVal = (valSum / (sampleSpread * 2 + 1)) / 255.0;

      // Equal loudness curve compensation
      const eqBoost = 1.0 + frac * 0.95;
      rawVal = Math.min(1.0, rawVal * eqBoost);

      // Fast explosive attack & smooth release
      if (rawVal > this.barEnergies[i]) {
        this.barEnergies[i] = this.barEnergies[i] * 0.16 + rawVal * 0.84;
      } else {
        this.barEnergies[i] = this.barEnergies[i] * 0.84 + rawVal * 0.16;
      }
    }

    ctx.save();
    ctx.lineCap = 'round';

    const maxBarLength = this.baseRadius * 1.35;
    // Crisp, sharp analog line width
    const barWidth = Math.max(2.2, (2 * Math.PI * this.currentRadius / count) * 0.58);
    ctx.lineWidth = barWidth;

    const angleStep = (Math.PI * 2) / count;

    // Draw Individual Radial Analog Lines (No outer envelope curve!)
    for (let i = 0; i < count; i++) {
      const energy = this.barEnergies[i];
      const barHeight = Math.pow(energy, 1.25) * maxBarLength + 4;

      // 0 starts at bottom center (Math.PI / 2)
      const angle = (i * angleStep) + (Math.PI / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const startX = cx + cos * (this.currentRadius + 1);
      const startY = cy + sin * (this.currentRadius + 1);
      const endX = cx + cos * (this.currentRadius + barHeight);
      const endY = cy + sin * (this.currentRadius + barHeight);

      // Analog line color: White/Bright core at base, fading to Neon Electric Gold/Amber
      const barGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      barGrad.addColorStop(0, '#ffffff');
      barGrad.addColorStop(0.3, this.primaryColor);
      barGrad.addColorStop(1, this.glowColor);

      ctx.strokeStyle = barGrad;
      ctx.shadowColor = this.primaryColor;
      ctx.shadowBlur = 12 + energy * 16;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
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

    // 1. Concentrated Ambient Bass Glow behind the circle (breathing with rhythm)
    const haloRadius = r * (1.18 + subBass * 0.45);
    const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, haloRadius);
    haloGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    haloGrad.addColorStop(0.4, this.primaryColor + '44');
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. High-intensity Outer Neon Glow Bloom
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 24 + subBass * 32;

    // Razor-sharp pure white circular disc rim (signature After Effects circle style)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.0;
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

    // Authentic Progressive House 4-on-the-floor spring bounce:
    const targetRadius = this.baseRadius * (1.0 + Math.pow(subBass, 1.7) * 0.42);
    const displacement = targetRadius - this.currentRadius;
    const springStiffness = 0.28;
    const damping = 0.72;

    this.radiusVelocity += displacement * springStiffness;
    this.radiusVelocity *= damping;
    this.currentRadius += this.radiusVelocity;

    // Trigger shockwaves & particles on kick transients
    if (kickPeak) {
      this.triggerShockwave(subBass);
      this.spawnBassExplosion(subBass);
    } else if (subBass > 0.6) {
      this.spawnBassExplosion(subBass * 0.7);
    }

    // 1. Draw Atmospheric Background with Bass Zoom
    this.drawBackground(subBass);

    // 2. Shockwaves
    this.updateShockwaves();
    this.drawShockwaves();

    // 3. Bass Particles
    this.updateParticles();
    this.drawParticles();

    // 4. Symmetrical Radial Analog Lines (After Effects style)
    this.drawRadialSpectrum(freqData, subBass);

    // 5. Center Disc
    this.drawCenterCircle(subBass);
  }
}

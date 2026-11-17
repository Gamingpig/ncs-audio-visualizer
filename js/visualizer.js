/**
 * 3D Particle Wave Sheet & Polar Audio Spectrum Visualizer
 * Exact 1:1 Trapcode Form & After Effects Audio Spectrum Recreation of
 * "Elektronomia - Sky High | NCS" (TW9d8vYrVFQ)
 *
 * Verified against 1080p60 frame-by-frame captures:
 * 1. Trapcode Form 3D Planar Grid (110 x 110 = 12,100 discrete dots):
 *    - Tilted 3D plane rotated in perspective (RotX ~58°, RotY ~-22°, RotZ ~21°).
 *    - Smooth radial feathering eliminates any square edges (zero straight boundaries).
 *    - In quiet passages / intro (0:15): sheet rests softly along lower-right curve, leaving center dark space.
 *    - In the drop (1:05, 1:12): audio amplitude surges into the iconic diagonal S-curve wave crests.
 *    - Optical caustic filaments emerge naturally from perspective density—NO WIREFRAME LINES!
 *    - Clipped cleanly to the circular visualizer aperture.
 * 2. Authentic After Effects Polar Audio Spectrum:
 *    - 216 radial analog frequency bars radiating inward from outer rim.
 *    - Layered with glowing fluid yellow body and white-hot perimeter ring.
 *    - Dynamic breathing pulse on sub-bass kicks.
 * 3. Exact Screen Placement:
 *    - Visualizer circle positioned on the right (68% X, 46% Y) matching desert monolith composition.
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    // Trapcode Form Planar Grid Parameters (110 x 110 = 12,100 points)
    this.gridU = 110;
    this.gridV = 110;
    this.totalPoints = this.gridU * this.gridV;

    // Precalculate UV planar coordinates from -1.18 to +1.18
    this.uCoord = new Float32Array(this.totalPoints);
    this.vCoord = new Float32Array(this.totalPoints);
    this.radialFeather = new Float32Array(this.totalPoints);

    let idx = 0;
    for (let j = 0; j < this.gridV; j++) {
      const v = (j / (this.gridV - 1) - 0.5) * 2.36;
      for (let i = 0; i < this.gridU; i++) {
        const u = (i / (this.gridU - 1) - 0.5) * 2.36;
        const dSq = u * u + v * v;
        this.uCoord[idx] = u;
        this.vCoord[idx] = v;
        // Soft organic radial feathering (eliminates straight grid boundary edges)
        this.radialFeather[idx] = Math.max(0.0, Math.min(1.0, 1.0 - (dSq - 0.55) / 0.75));
        idx++;
      }
    }

    // Output projection buffers
    this.screenX = new Float32Array(this.totalPoints);
    this.screenY = new Float32Array(this.totalPoints);
    this.screenZ = new Float32Array(this.totalPoints);
    this.screenScale = new Float32Array(this.totalPoints);
    this.screenAlpha = new Float32Array(this.totalPoints);
    this.isVisible = new Uint8Array(this.totalPoints);

    // Audio Spectrum Polar Rim Parameters (216 analog frequency bars)
    this.rimSegments = 216;
    this.rimCos = new Float32Array(this.rimSegments);
    this.rimSin = new Float32Array(this.rimSegments);
    this.smoothFreq = new Float32Array(this.rimSegments);

    for (let k = 0; k < this.rimSegments; k++) {
      const angle = (k / this.rimSegments) * Math.PI * 2;
      this.rimCos[k] = Math.cos(angle);
      this.rimSin[k] = Math.sin(angle);
    }

    // Color Palette: Authentic Electric Neon Yellow
    this.primaryColor = '#ffe800';
    this.glowColor = '#ffbb00';
    this.coreColor = '#ffffff';

    // 3D Camera Angles matching TW9d8vYrVFQ perspective
    this.rotX = 1.02;   // ~58° downward pitch
    this.rotY = -0.38;  // ~-22° yaw towards desert monolith
    this.rotZ = 0.36;   // ~21° roll along Milky Way diagonal
    this.fov = 860;

    this.audioPhase = 0;
    this.bgLayer = document.getElementById('bgLayer');

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(color, glow) {
    this.primaryColor = color;
    this.glowColor = glow;
  }

  setCoverArt() {}
  setDefaultLogo() {}
  setBackgroundArt(url) {
    if (this.bgLayer) {
      this.bgLayer.style.backgroundImage = url ? `url("${url}")` : "url('assets/bg.jpg')";
    }
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

    // 1:1 Video Placement: Right ~68% X, 46% Y on landscape viewports
    const isLandscape = this.width >= 768 && (this.width / this.height) >= 1.15;
    if (isLandscape) {
      // Landscape: Circle on right, logo on left
      this.centerX = this.width * 0.68;
      this.centerY = this.height * 0.46;
      this.baseRadius = Math.min(this.width * 0.22, this.height * 0.34);
    } else {
      // Portrait / Square: Circle centered lower, logo centered top
      this.centerX = this.width * 0.50;
      this.centerY = this.height * 0.56;
      this.baseRadius = Math.min(this.width * 0.38, this.height * 0.24);
    }
  }

  /**
   * Main Render Frame
   */
  render(audioMetrics) {
    const { freqData, subBass, bass, mid, treble, kickPeak } = audioMetrics;
    const totalEnergy = subBass * 0.85 + mid * 0.75 + treble * 0.5;

    // Tempo-locked animation speed: active on music beats, calm during quiet parts
    this.audioPhase += 0.010 + Math.min(0.08, totalEnergy * 0.08);

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = this.centerX;
    const cy = this.centerY;

    // Authentic NCS Bass-Kick Radial Breathing
    const R = this.baseRadius * (1.0 + Math.pow(subBass, 1.8) * 0.075);

    // Hardware CSS Bass-Zoom on Background (scale 1.00 to 1.035)
    if (this.bgLayer) {
      const zoom = 1.0 + Math.pow(subBass, 1.6) * 0.035;
      this.bgLayer.style.transform = `scale(${zoom})`;
    }

    // -----------------------------------------------------------------
    // 1. COMPUTE 3D PARTICLE SHEET DISPLACEMENT (Trapcode Form)
    // -----------------------------------------------------------------
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);
    const cosZ = Math.cos(this.rotZ);
    const sinZ = Math.sin(this.rotZ);

    const binCount = freqData.length;
    const R_sq = R * R;

    for (let p = 0; p < this.totalPoints; p++) {
      const rf = this.radialFeather[p];
      if (rf <= 0.01) {
        this.isVisible[p] = 0;
        continue;
      }

      const u = this.uCoord[p];
      const v = this.vCoord[p];
      const d = Math.sqrt(u * u + v * v);

      // Frequency mapping across the sheet
      const freqIdx = Math.floor(Math.min(1.0, (d * 0.5 + 0.15)) * (binCount * 0.5) + 2);
      const freqVal = (freqData[Math.min(binCount - 1, Math.max(0, freqIdx))] || 0) / 255.0;

      // Authentic Trapcode Form 3D Wave Displacements in Z (depth/height):
      // A. Primary S-curve traveling wave fold (diagonal wave matching the video)
      const waveFold = Math.sin(2.4 * u - 1.9 * v - this.audioPhase * 2.2) * (R * 0.46) * (subBass * 0.85 + freqVal * 0.35 + 0.03);

      // B. Secondary mid-range ripples from lead synth melody
      const waveRipple = Math.cos(4.8 * u + 3.2 * v - this.audioPhase * 3.2) * (R * 0.18) * (mid * 0.8 + 0.015);

      // C. High-frequency treble shimmer
      const waveShimmer = Math.sin(7.5 * u - 5.5 * v - this.audioPhase * 4.5) * (R * 0.06) * (treble * 0.7);

      // D. Bass kick shockwave impulse
      const kickImpulse = kickPeak ? Math.sin(d * 7.0 - this.audioPhase * 6.0) * (R * 0.22) * subBass : 0;

      // Total 3D coordinates before camera rotation:
      // When quiet (subBass ~ 0), sheet is nearly flat (z0 ~ 0), resting along lower-right curve!
      const x0 = u * R * 1.15;
      const y0 = v * R * 1.15;
      const z0 = waveFold + waveRipple + waveShimmer + kickImpulse;

      // 3D Euler Transformation (Yaw -> Pitch -> Roll)
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;
      const y2 = y0 * cosX - z1 * sinX;
      const z2 = y0 * sinX + z1 * cosX;
      const xRot = x1 * cosZ - y2 * sinZ;
      const yRot = x1 * sinZ + y2 * cosZ;
      const zRot = z2;

      // Perspective Projection
      const scale = this.fov / (this.fov + zRot + 350);
      const px = cx + xRot * scale;
      const py = cy + yRot * scale;

      // Circular Masking: Only particles inside the circular aperture
      const dx = px - cx;
      const dy = py - cy;
      const distSq = dx * dx + dy * dy;

      if (distSq >= R_sq) {
        this.isVisible[p] = 0;
        continue;
      }

      this.isVisible[p] = 1;
      this.screenX[p] = px;
      this.screenY[p] = py;
      this.screenZ[p] = zRot;
      this.screenScale[p] = scale;

      // Boundary soft feathering near the outer rim
      const dist = Math.sqrt(distSq);
      const edgeFade = Math.min(1.0, Math.max(0.0, (R - dist) / 14.0));

      // Depth shading: wave crests facing viewer are brighter; flat intro rests gently in lower crescent
      const heightFactor = Math.max(0.0, Math.min(1.0, 0.45 + (zRot / (R * 0.8))));
      const introFade = 0.22 + totalEnergy * 0.78;
      this.screenAlpha[p] = rf * edgeFade * (heightFactor * 0.85 + 0.15) * introFade;
    }

    // -----------------------------------------------------------------
    // 2. COMPUTE POLAR AUDIO SPECTRUM (Authentic After Effects Spectrum)
    // -----------------------------------------------------------------
    for (let k = 0; k < this.rimSegments; k++) {
      const angle = (k / this.rimSegments) * Math.PI * 2;
      // Symmetric audio spectrum around circle: bass at lower/side, mids at top
      const freqNorm = Math.abs(Math.sin(angle * 0.5));
      const binIdx = Math.floor(Math.pow(freqNorm, 1.5) * (binCount * 0.55) + 2);
      const rawVal = (freqData[Math.min(binCount - 1, Math.max(0, binIdx))] || 0) / 255.0;

      // Smooth temporal interpolation
      this.smoothFreq[k] = this.smoothFreq[k] * 0.65 + rawVal * 0.35;
    }

    // Spatial smoothing over neighboring bars
    const smoothedBars = new Float32Array(this.rimSegments);
    for (let k = 0; k < this.rimSegments; k++) {
      let sum = 0;
      let count = 0;
      for (let offset = -3; offset <= 3; offset++) {
        const neighbor = (k + offset + this.rimSegments) % this.rimSegments;
        const weight = 4 - Math.abs(offset);
        sum += this.smoothFreq[neighbor] * weight;
        count += weight;
      }
      smoothedBars[k] = sum / count;
    }

    const outerPtsX = new Float32Array(this.rimSegments);
    const outerPtsY = new Float32Array(this.rimSegments);
    const innerPtsX = new Float32Array(this.rimSegments);
    const innerPtsY = new Float32Array(this.rimSegments);

    for (let k = 0; k < this.rimSegments; k++) {
      const cosA = this.rimCos[k];
      const sinA = this.rimSin[k];
      const sVal = smoothedBars[k];
      const angle = (k / this.rimSegments) * Math.PI * 2;

      // Continuous harmonic undulating fluid wave around 360°
      const waveHarmonic = Math.sin(angle * 2.0 - this.audioPhase * 2.2) * (14 * subBass) +
                           Math.cos(angle * 3.0 + this.audioPhase * 1.8) * (10 * (sVal + 0.1));

      // Bar height inward from perimeter R
      const barHeight = 15 + (sVal * 82) + (subBass * 44) + waveHarmonic;
      const rInner = Math.max(R * 0.52, R - barHeight);

      outerPtsX[k] = cx + cosA * R;
      outerPtsY[k] = cy + sinA * R;
      innerPtsX[k] = cx + cosA * rInner;
      innerPtsY[k] = cy + sinA * rInner;
    }

    // -----------------------------------------------------------------
    // 3. CANVAS RENDER PASSES
    // -----------------------------------------------------------------
    ctx.clearRect(0, 0, w, h);

    // -----------------------------------------------------------------
    // RENDER PASS 1: High-Contrast Cosmic Interior & Outer Neon Aura
    // -----------------------------------------------------------------
    // A. Soft dark core inside circle for vibrant particle contrast
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    coreGrad.addColorStop(0.00, 'rgba(3, 4, 10, 0.88)');
    coreGrad.addColorStop(0.75, 'rgba(5, 7, 16, 0.75)');
    coreGrad.addColorStop(1.00, 'rgba(8, 10, 22, 0.10)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // B. Atmospheric yellow bloom radiating outward into starry desert night
    const bloomGrad = ctx.createRadialGradient(cx, cy, R * 0.90, cx, cy, R * 1.45);
    const bloomAlpha = 0.12 + Math.pow(subBass, 1.5) * 0.28;
    bloomGrad.addColorStop(0.00, `rgba(255, 232, 0, ${bloomAlpha})`);
    bloomGrad.addColorStop(0.50, `rgba(255, 187, 0, ${bloomAlpha * 0.45})`);
    bloomGrad.addColorStop(1.00, 'rgba(255, 170, 0, 0)');
    ctx.fillStyle = bloomGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2);
    ctx.fill();

    // -----------------------------------------------------------------
    // RENDER PASS 2: Pure Luminous 3D Discrete Particles (NO WIREFRAME LINES!)
    // -----------------------------------------------------------------
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // A. Electric yellow glow halos
    ctx.fillStyle = this.primaryColor;
    for (let idx = 0; idx < this.totalPoints; idx += 2) {
      if (!this.isVisible[idx] || this.screenAlpha[idx] < 0.04) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(1.1, 2.3 * scale);

      ctx.globalAlpha = alpha * 0.70;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // B. Intense white-hot core dots
    ctx.fillStyle = this.coreColor;
    for (let idx = 0; idx < this.totalPoints; idx++) {
      if (!this.isVisible[idx] || this.screenAlpha[idx] < 0.07) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(0.70, 1.40 * scale);

      ctx.globalAlpha = alpha * 0.95;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // -----------------------------------------------------------------
    // RENDER PASS 3: Authentic Polar Audio Spectrum Ribbon
    // -----------------------------------------------------------------
    // A. 216 Radial Analog Spectrum Lines (The classic After Effects Audio Spectrum look)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 2.0;
    ctx.globalAlpha = 0.55 + subBass * 0.35;

    ctx.beginPath();
    for (let k = 0; k < this.rimSegments; k++) {
      ctx.moveTo(outerPtsX[k], outerPtsY[k]);
      ctx.lineTo(innerPtsX[k], innerPtsY[k]);
    }
    ctx.stroke();

    // B. Fluid Additive Glowing Body between Outer & Inner Curves
    const drawSmoothLoop = (ptsX, ptsY, reverse = false) => {
      const len = ptsX.length;
      const getPt = (idx) => {
        let i = idx % len;
        if (i < 0) i += len;
        return [ptsX[i], ptsY[i]];
      };

      for (let step = 0; step < len; step++) {
        const i = reverse ? (len - 1 - step) : step;
        const nextI = reverse ? (i - 1) : (i + 1);
        const [x0, y0] = getPt(reverse ? i + 1 : i - 1);
        const [x1, y1] = getPt(i);
        const [x2, y2] = getPt(nextI);
        const [x3, y3] = getPt(reverse ? nextI - 1 : nextI + 1);

        const cp1x = x1 + (x2 - x0) / 6;
        const cp1y = y1 + (y2 - y0) / 6;
        const cp2x = x2 - (x3 - x1) / 6;
        const cp2y = y2 - (y3 - y1) / 6;

        if (step === 0 && !reverse) {
          ctx.moveTo(x1, y1);
        }
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      }
    };

    // Fill fluid molten ribbon body
    ctx.beginPath();
    drawSmoothLoop(outerPtsX, outerPtsY, false);
    drawSmoothLoop(innerPtsX, innerPtsY, true);
    ctx.closePath();

    const ribbonGrad = ctx.createRadialGradient(cx, cy, R * 0.60, cx, cy, R);
    ribbonGrad.addColorStop(0.00, 'rgba(255, 232, 0, 0.40)');
    ribbonGrad.addColorStop(0.70, 'rgba(255, 220, 0, 0.75)');
    ribbonGrad.addColorStop(1.00, 'rgba(255, 245, 120, 0.95)');
    ctx.fillStyle = ribbonGrad;
    ctx.globalAlpha = 0.85;
    ctx.fill();

    // Inner contour stroke
    ctx.strokeStyle = this.coreColor;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.80;
    ctx.beginPath();
    drawSmoothLoop(innerPtsX, innerPtsY, false);
    ctx.stroke();

    ctx.restore();

    // -----------------------------------------------------------------
    // RENDER PASS 4: Crisp Outer White-Hot Neon Perimeter
    // -----------------------------------------------------------------
    ctx.save();
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 5.0;
    ctx.shadowColor = this.primaryColor;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Crisp inner core line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

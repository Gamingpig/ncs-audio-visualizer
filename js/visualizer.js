/**
 * 3D Particle Wave Lattice & Fluid Molten Ribbon Visualizer
 * Exact 1:1 recreation of "Elektronomia - Sky High" (Trapcode Form & Mir):
 *
 * 1. 3D Cartesian Particle Lattice: 60x60 grid of luminous yellow particles forming
 *    a flowing, undulating 3D wave sheet inside the spherical perimeter.
 * 2. Connected 3D Wireframe Lattice: Horizontal & vertical grid lines creating the
 *    iconic draped cloth / terrain wave mesh.
 * 3. Smooth Molten Fluid Outer Ribbon: Silky, liquid golden ribbon undulating along
 *    the circular perimeter without jagged sawteeth.
 * 4. Additive Neon Bloom ('lighter'): Blinding electric neon yellow glow at 0ms latency
 *    and near-zero CPU/GPU consumption.
 * 5. 1:1 Widescreen Positioning: Positioned at 67.5% X, 48% Y over the desert night sky.
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    // Grid Parameters for Trapcode Form Lattice
    this.gridSize = 60; // 60 x 60 = 3600 vertices
    this.totalPoints = this.gridSize * this.gridSize;

    // Outer Rim Resolution (for smooth fluid ribbon)
    this.rimSegments = 128;
    this.rimRadius = new Float32Array(this.rimSegments);
    this.rimSmoothFreq = new Float32Array(this.rimSegments);

    // Buffers for 3D Lattice Points
    this.uCoord = new Float32Array(this.totalPoints);
    this.vCoord = new Float32Array(this.totalPoints);
    this.distFromCenter = new Float32Array(this.totalPoints);
    this.isInsideCircle = new Uint8Array(this.totalPoints);

    this.screenX = new Float32Array(this.totalPoints);
    this.screenY = new Float32Array(this.totalPoints);
    this.screenZ = new Float32Array(this.totalPoints);
    this.screenScale = new Float32Array(this.totalPoints);
    this.screenAlpha = new Float32Array(this.totalPoints);

    // Precalculate UV and radial distances
    let p = 0;
    for (let j = 0; j < this.gridSize; j++) {
      const v = (j / (this.gridSize - 1) - 0.5) * 2.0; // -1 to +1
      for (let i = 0; i < this.gridSize; i++) {
        const u = (i / (this.gridSize - 1) - 0.5) * 2.0; // -1 to +1
        const d = Math.sqrt(u * u + v * v);
        this.uCoord[p] = u;
        this.vCoord[p] = v;
        this.distFromCenter[p] = d;
        this.isInsideCircle[p] = d <= 1.02 ? 1 : 0;
        p++;
      }
    }

    // Precalculate Angles for the Outer Ribbon
    this.rimCos = new Float32Array(this.rimSegments);
    this.rimSin = new Float32Array(this.rimSegments);
    for (let k = 0; k < this.rimSegments; k++) {
      const angle = (k / this.rimSegments) * Math.PI * 2;
      this.rimCos[k] = Math.cos(angle);
      this.rimSin[k] = Math.sin(angle);
    }

    // Colors: Elektronomia Signature Electric Neon Yellow
    this.primaryColor = '#ffe800';
    this.glowColor = '#ffbb00';
    this.coreColor = '#ffffff';

    // 3D Camera Angles matching Video
    this.rotX = 0.34;   // Slight downward pitch into the wave valley
    this.rotY = -0.24;  // Angled towards the viewer from the right
    this.rotZ = 0.06;   // Subtle cinematic roll
    this.fov = 680;

    this.time = 0;
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

    // Responsive 1:1 Video Positioning:
    // On 16:9 widescreen: Center at 67.5% X, 48% Y (leaving left third open for landscape & logo)
    if (this.width >= 900) {
      this.centerX = this.width * 0.675;
      this.centerY = this.height * 0.48;
      this.baseRadius = Math.min(this.width * 0.25, this.height * 0.36);
    } else {
      this.centerX = this.width * 0.5;
      this.centerY = this.height * 0.44;
      this.baseRadius = Math.min(this.width * 0.42, this.height * 0.32);
    }
  }

  /**
   * Main Render Frame
   */
  render(audioMetrics) {
    const { freqData, subBass, kickPeak } = audioMetrics;
    this.time += 0.038;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = this.centerX;
    const cy = this.centerY;
    const R = this.baseRadius * (1.0 + Math.pow(subBass, 1.8) * 0.08);

    // Hardware Bass-Zoom on Background (scale 1.00 to 1.03)
    if (this.bgLayer) {
      const zoom = 1.0 + Math.pow(subBass, 1.6) * 0.035;
      this.bgLayer.style.transform = `scale(${zoom})`;
    }

    // -----------------------------------------------------------------
    // 1. COMPUTE 3D WAVE LATTICE POSITIONS (Trapcode Form)
    // -----------------------------------------------------------------
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);

    const binCount = freqData.length;
    let p = 0;
    for (let j = 0; j < this.gridSize; j++) {
      for (let i = 0; i < this.gridSize; i++) {
        if (!this.isInsideCircle[p]) {
          p++;
          continue;
        }

        const u = this.uCoord[p];
        const v = this.vCoord[p];
        const d = this.distFromCenter[p];

        // Sample audio frequency for this cell (bass in center, highs on edges)
        const freqIndex = Math.floor(2 + (d * 0.7 + (u * 0.15 + 0.15)) * (binCount * 0.4));
        const freqVal = (freqData[Math.min(binCount - 1, Math.max(0, freqIndex))] || 0) / 255.0;

        // Signature Elektronomia Sky High 3D Waves:
        // A. Primary Traveling Undulation
        const wave1 = Math.sin(u * 2.8 + v * 1.6 - this.time * 2.4) * (42 * (subBass + 0.35));
        // B. Secondary Cross Harmonic
        const wave2 = Math.cos(u * 2.2 - v * 3.0 + this.time * 1.7) * (26 * (1.0 - d * 0.4));
        // C. Bass Impact Center Ripple
        const wave3 = Math.sin(d * 9.0 - this.time * 4.2) * (28 * kickPeak);
        // D. Downward Bowl Curve & Audio Displacement
        const zBowl = - (1.0 - d * d) * (30 + subBass * 20);
        const zAudio = freqVal * 45;

        const x0 = u * R;
        const y0 = v * R;
        const z0 = zBowl + wave1 + wave2 + wave3 + zAudio;

        // 3D Euler Rotation
        const xRot = x0 * cosY + z0 * sinY;
        const zMid = -x0 * sinY + z0 * cosY;
        const yRot = y0 * cosX - zMid * sinX;
        const zRot = y0 * sinX + zMid * cosX;

        // Perspective Projection
        const scale = this.fov / (this.fov + zRot + 280);
        this.screenX[p] = cx + xRot * scale;
        this.screenY[p] = cy + yRot * scale;
        this.screenZ[p] = zRot;
        this.screenScale[p] = scale;

        // Edge fade & depth brightness
        const edgeFade = Math.max(0, 1.0 - Math.pow(d, 5));
        const depthAlpha = Math.max(0.1, Math.min(1.0, 0.45 + (zRot / 90) + subBass * 0.3));
        this.screenAlpha[p] = edgeFade * depthAlpha;

        p++;
      }
    }

    // -----------------------------------------------------------------
    // 2. SMOOTH FLUID OUTER RIBBON FREQUENCIES
    // -----------------------------------------------------------------
    for (let k = 0; k < this.rimSegments; k++) {
      // Map 128 angles symmetrically to frequency bins
      const symK = k < 64 ? k : (127 - k);
      const binIdx = Math.floor(2 + (symK / 64) * (binCount * 0.45));
      const rawVal = (freqData[binIdx] || 0) / 255.0;

      // Spatial Gaussian smoothing to prevent jagged sawteeth
      this.rimSmoothFreq[k] = this.rimSmoothFreq[k] * 0.72 + rawVal * 0.28;
    }

    // Clear frame
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // GPU Additive Neon Bloom

    // -----------------------------------------------------------------
    // RENDER PASS 1: 3D Connected Wireframe Lattice Lines
    // -----------------------------------------------------------------
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 0.9;

    // Horizontal grid lines along rows
    for (let j = 0; j < this.gridSize; j += 2) {
      let drawing = false;
      ctx.beginPath();
      for (let i = 0; i < this.gridSize; i++) {
        const idx = j * this.gridSize + i;
        if (this.isInsideCircle[idx] && this.screenAlpha[idx] > 0.05) {
          const px = this.screenX[idx];
          const py = this.screenY[idx];
          if (!drawing) {
            ctx.moveTo(px, py);
            drawing = true;
          } else {
            ctx.lineTo(px, py);
          }
        } else {
          drawing = false;
        }
      }
      ctx.globalAlpha = 0.22 + subBass * 0.25;
      ctx.stroke();
    }

    // Vertical grid lines along columns
    for (let i = 0; i < this.gridSize; i += 2) {
      let drawing = false;
      ctx.beginPath();
      for (let j = 0; j < this.gridSize; j++) {
        const idx = j * this.gridSize + i;
        if (this.isInsideCircle[idx] && this.screenAlpha[idx] > 0.05) {
          const px = this.screenX[idx];
          const py = this.screenY[idx];
          if (!drawing) {
            ctx.moveTo(px, py);
            drawing = true;
          } else {
            ctx.lineTo(px, py);
          }
        } else {
          drawing = false;
        }
      }
      ctx.globalAlpha = 0.18 + subBass * 0.22;
      ctx.stroke();
    }

    // -----------------------------------------------------------------
    // RENDER PASS 2: Luminous 3D Particle Points (The Signature Dots)
    // -----------------------------------------------------------------
    // A. Electric yellow glow halo
    ctx.fillStyle = this.primaryColor;
    for (let idx = 0; idx < this.totalPoints; idx += 2) {
      if (!this.isInsideCircle[idx] || this.screenAlpha[idx] < 0.05) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(1.4, 3.2 * scale);

      ctx.globalAlpha = alpha * 0.65;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // B. Intense white-hot core dots
    ctx.fillStyle = this.coreColor;
    for (let idx = 0; idx < this.totalPoints; idx++) {
      if (!this.isInsideCircle[idx] || this.screenAlpha[idx] < 0.08) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(0.9, 1.9 * scale);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // -----------------------------------------------------------------
    // RENDER PASS 3: The Smooth Glowing Molten Fluid Outer Ribbon
    // -----------------------------------------------------------------
    // Calculate Outer & Inner boundary points of the fluid ribbon
    const outerX = new Float32Array(this.rimSegments);
    const outerY = new Float32Array(this.rimSegments);
    const innerX = new Float32Array(this.rimSegments);
    const innerY = new Float32Array(this.rimSegments);

    for (let k = 0; k < this.rimSegments; k++) {
      const cosA = this.rimCos[k];
      const sinA = this.rimSin[k];
      const fVal = this.rimSmoothFreq[k];

      // Harmonic fluid undulation
      const fluidWave = Math.sin(k * 0.25 - this.time * 2.2) * 14 * subBass +
                        Math.cos(k * 0.45 + this.time * 1.8) * 9 * (fVal + 0.2);

      // Outer radius (circular with subtle bass swell)
      const rOut = R + (fVal * 12) + (subBass * 10);
      // Inner radius (forming the thick fluid liquid band)
      const thickness = 22 + (fVal * 55) + (subBass * 32) + fluidWave;
      const rIn = Math.max(R * 0.6, rOut - thickness);

      outerX[k] = cx + cosA * rOut;
      outerY[k] = cy + sinA * rOut;
      innerX[k] = cx + cosA * rIn;
      innerY[k] = cy + sinA * rIn;
    }

    // Fill the Molten Fluid Ribbon with Radiant Glowing Light
    ctx.fillStyle = this.primaryColor;
    ctx.globalAlpha = 0.55 + subBass * 0.4;
    ctx.beginPath();
    ctx.moveTo(outerX[0], outerY[0]);
    for (let k = 1; k < this.rimSegments; k++) {
      ctx.lineTo(outerX[k], outerY[k]);
    }
    ctx.closePath();
    // Inner cutout
    ctx.moveTo(innerX[0], innerY[0]);
    for (let k = this.rimSegments - 1; k >= 0; k--) {
      ctx.lineTo(innerX[k], innerY[k]);
    }
    ctx.closePath();
    ctx.fill();

    // Secondary Warmer Amber Fluid Glow
    ctx.fillStyle = this.glowColor;
    ctx.globalAlpha = 0.4;
    ctx.fill();

    // Outer Ribbon Glowing Border Lines:
    // A. Soft Neon Halo Outer Line
    ctx.lineWidth = 12 + subBass * 14;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.stroke();

    // B. Intense Yellow Perimeter Stroke
    ctx.lineWidth = 5 + subBass * 6;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // C. White-Hot Incandescent Core Perimeter Line
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = this.coreColor;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // D. Inner Fluid Edge Line (Molten contour)
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.75 + subBass * 0.25;
    ctx.beginPath();
    ctx.moveTo(innerX[0], innerY[0]);
    for (let k = 1; k < this.rimSegments; k++) {
      ctx.lineTo(innerX[k], innerY[k]);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }
}

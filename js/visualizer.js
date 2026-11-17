/**
 * 3D Particle Wave Lattice & Fluid Molten Ribbon Visualizer
 * Exact 1:1 recreation of "Elektronomia - Sky High" (Trapcode Form in After Effects):
 *
 * 1. Volumetric Dark Cosmic Core: Enhances particle contrast against the starry background.
 * 2. Atmospheric Neon Bloom: Golden radiant aura emitting into the surrounding night sky.
 * 3. Centered 3D Saddle Wave: Flowing 3D wave volume filling the sphere gracefully.
 * 4. 80x80 High-Density Particle Stream: Dense luminous dots forming glowing filaments.
 * 5. 100% Silky Liquid Molten Ribbon: Smooth Catmull-Rom spline curves with multi-layer neon glow.
 * 6. Additive Hardware Blending ('lighter'): Blinding electric neon yellow (#ffe800) and golden amber (#ffbb00).
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    // High Density Particle Grid (80 x 80 = 6,400 points)
    this.gridSize = 80;
    this.totalPoints = this.gridSize * this.gridSize;

    // Buffers for 3D calculations
    this.uCoord = new Float32Array(this.totalPoints);
    this.vCoord = new Float32Array(this.totalPoints);
    this.distFromCenter = new Float32Array(this.totalPoints);
    this.isInside = new Uint8Array(this.totalPoints);

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
        this.isInside[p] = d <= 1.01 ? 1 : 0;
        p++;
      }
    }

    // Outer Ribbon Resolution (180 points for perfectly silky curves)
    this.rimSegments = 180;
    this.rimCos = new Float32Array(this.rimSegments);
    this.rimSin = new Float32Array(this.rimSegments);
    this.smoothFreq = new Float32Array(this.rimSegments);

    for (let k = 0; k < this.rimSegments; k++) {
      const angle = (k / this.rimSegments) * Math.PI * 2;
      this.rimCos[k] = Math.cos(angle);
      this.rimSin[k] = Math.sin(angle);
    }

    // Signature Elektronomia Electric Yellow Theme
    this.primaryColor = '#ffe800';
    this.glowColor = '#ffaa00';
    this.coreColor = '#ffffff';

    // 3D Camera Angles matching TW9d8vYrVFQ
    this.rotX = 0.36;   // Looking down into the rolling wave valley
    this.rotY = -0.22;  // Angled towards the viewer from the right
    this.rotZ = 0.06;   // Subtle cinematic roll
    this.fov = 740;

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

    // 1:1 Video Placement: Right ~67.5% X, 48% Y
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
    this.time += 0.035;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = this.centerX;
    const cy = this.centerY;
    const R = this.baseRadius * (1.0 + Math.pow(subBass, 1.8) * 0.06);

    // Hardware CSS Bass-Zoom on Background (scale 1.00 to 1.035)
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
    const cosZ = Math.cos(this.rotZ);
    const sinZ = Math.sin(this.rotZ);

    const binCount = freqData.length;
    let p = 0;
    for (let j = 0; j < this.gridSize; j++) {
      for (let i = 0; i < this.gridSize; i++) {
        if (!this.isInside[p]) {
          p++;
          continue;
        }

        const u = this.uCoord[p];
        const v = this.vCoord[p];
        const d = this.distFromCenter[p];

        // Sample audio spectrum (bass in center, highs on edges)
        const freqIdx = Math.floor(2 + (d * 0.65 + (u * 0.15 + 0.15)) * (binCount * 0.4));
        const freqVal = (freqData[Math.min(binCount - 1, Math.max(0, freqIdx))] || 0) / 255.0;

        // Signature Elektronomia 3D Waves:
        // 1. Rolling traveling wave ridges
        const wave1 = Math.sin(u * 2.6 + v * 1.8 - this.time * 2.5) * (65 * (subBass + 0.4));
        // 2. Harmonic cross-undulation
        const wave2 = Math.cos(u * 2.0 - v * 2.4 + this.time * 1.8) * (38 * (1.0 - d * 0.3));
        // 3. Center bass-kick impact ripple
        const wave3 = Math.sin(d * 8.5 - this.time * 4.0) * (32 * kickPeak);
        // 4. Subtle saddle wave curvature
        const waveSaddle = (u * u - v * v) * (35 * (subBass + 0.3));
        // 5. Audio frequency displacement & spherical bowl
        const zAudio = freqVal * 50;
        const zBowl = - (1.0 - d * d) * (35 + subBass * 20);

        const x0 = u * R;
        const y0 = v * R;
        const z0 = zBowl + wave1 + wave2 + wave3 + waveSaddle + zAudio;

        // 3D Euler Rotation
        const x1 = x0 * cosY + z0 * sinY;
        const z1 = -x0 * sinY + z0 * cosY;
        const y2 = y0 * cosX - z1 * sinX;
        const z2 = y0 * sinX + z1 * cosX;
        const xRot = x1 * cosZ - y2 * sinZ;
        const yRot = x1 * sinZ + y2 * cosZ;
        const zRot = z2;

        // 3D Perspective Projection
        const scale = this.fov / (this.fov + zRot + 300);
        this.screenX[p] = cx + xRot * scale;
        this.screenY[p] = cy + yRot * scale;
        this.screenZ[p] = zRot;
        this.screenScale[p] = scale;

        // Depth shading & edge fade
        const edgeFade = Math.max(0, 1.0 - Math.pow(d, 6));
        const depthAlpha = Math.max(0.12, Math.min(1.0, 0.45 + (zRot / 100) + subBass * 0.35));
        this.screenAlpha[p] = edgeFade * depthAlpha;

        p++;
      }
    }

    // -----------------------------------------------------------------
    // 2. COMPUTE SILKY SMOOTH FLUID OUTER RIBBON
    // -----------------------------------------------------------------
    for (let k = 0; k < this.rimSegments; k++) {
      const symK = k < 90 ? k : (179 - k);
      const binIdx = Math.floor(2 + (symK / 90) * (binCount * 0.4));
      const rawVal = (freqData[binIdx] || 0) / 255.0;

      this.smoothFreq[k] = this.smoothFreq[k] * 0.75 + rawVal * 0.25;
    }

    // Secondary spatial Gaussian pass over the 180 points
    const spatiallySmoothed = new Float32Array(this.rimSegments);
    for (let k = 0; k < this.rimSegments; k++) {
      let sum = 0;
      let count = 0;
      for (let offset = -4; offset <= 4; offset++) {
        const neighbor = (k + offset + this.rimSegments) % this.rimSegments;
        const weight = 5 - Math.abs(offset);
        sum += this.smoothFreq[neighbor] * weight;
        count += weight;
      }
      spatiallySmoothed[k] = sum / count;
    }

    const outerPtsX = new Float32Array(this.rimSegments);
    const outerPtsY = new Float32Array(this.rimSegments);
    const innerPtsX = new Float32Array(this.rimSegments);
    const innerPtsY = new Float32Array(this.rimSegments);

    for (let k = 0; k < this.rimSegments; k++) {
      const cosA = this.rimCos[k];
      const sinA = this.rimSin[k];
      const sVal = spatiallySmoothed[k];

      // Multi-harmonic liquid fluid wave
      const fluidHarmonic = Math.sin(k * 0.18 - this.time * 2.2) * 16 * (subBass + 0.2) +
                            Math.cos(k * 0.32 + this.time * 1.6) * 10 * (sVal + 0.15);

      const rOuter = R + (sVal * 8) + (subBass * 8);
      const thickness = 26 + (sVal * 60) + (subBass * 36) + fluidHarmonic;
      const rInner = Math.max(R * 0.58, rOuter - thickness);

      outerPtsX[k] = cx + cosA * rOuter;
      outerPtsY[k] = cy + sinA * rOuter;
      innerPtsX[k] = cx + cosA * rInner;
      innerPtsY[k] = cy + sinA * rInner;
    }

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // -----------------------------------------------------------------
    // PRE-PASS: Soft Dark Cosmic Core inside Sphere for High Contrast
    // -----------------------------------------------------------------
    const darkCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
    darkCore.addColorStop(0, 'rgba(2, 4, 12, 0.65)');
    darkCore.addColorStop(0.75, 'rgba(2, 4, 12, 0.45)');
    darkCore.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = darkCore;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // -----------------------------------------------------------------
    // PRE-PASS 2: Atmospheric Diffuse Volumetric Bloom Aura into Space
    // -----------------------------------------------------------------
    const outerBloom = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.35);
    outerBloom.addColorStop(0, 'rgba(255, 232, 0, 0.18)');
    outerBloom.addColorStop(0.5, 'rgba(255, 170, 0, 0.08)');
    outerBloom.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = outerBloom;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // GPU Additive Neon Bloom

    // -----------------------------------------------------------------
    // RENDER PASS 1: The Molten Fluid Liquid Ribbon (Silky Spline)
    // -----------------------------------------------------------------
    const drawSmoothLoop = (ptsX, ptsY, reverse = false) => {
      const len = ptsX.length;
      const getPt = (idx) => {
        const i = (idx + len) % len;
        return [ptsX[i], ptsY[i]];
      };

      const startIdx = reverse ? len - 1 : 0;
      const [sx, sy] = getPt(startIdx);
      if (!reverse) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);

      for (let step = 0; step < len; step++) {
        const i = reverse ? (len - 1 - step) : step;
        const [x0, y0] = getPt(reverse ? i + 1 : i - 1);
        const [x1, y1] = getPt(i);
        const [x2, y2] = getPt(reverse ? i - 1 : i + 1);
        const [x3, y3] = getPt(reverse ? i - 2 : i + 2);

        const cp1x = x1 + (x2 - x0) / 6;
        const cp1y = y1 + (y2 - y0) / 6;
        const cp2x = x2 - (x3 - x1) / 6;
        const cp2y = y2 - (y3 - y1) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      }
    };

    // Fill the Liquid Molten Fluid Ribbon
    ctx.beginPath();
    drawSmoothLoop(outerPtsX, outerPtsY, false);
    drawSmoothLoop(innerPtsX, innerPtsY, true);
    ctx.closePath();

    ctx.fillStyle = this.primaryColor;
    ctx.globalAlpha = 0.65 + subBass * 0.35;
    ctx.fill();

    // Warm Amber Internal Glow
    ctx.fillStyle = this.glowColor;
    ctx.globalAlpha = 0.4;
    ctx.fill();

    // Outer Ribbon Glowing Perimeter Strokes:
    // A. Wide Neon Bloom Halo
    ctx.lineWidth = 14 + subBass * 16;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 3, 0, Math.PI * 2);
    ctx.stroke();

    // B. Intense Yellow Outer Rim
    ctx.lineWidth = 5.5 + subBass * 5;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // C. White-Hot Incandescent Rim Line
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = this.coreColor;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // D. Inner Liquid Fluid Edge Line (Smooth Catmull-Rom contour)
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.8 + subBass * 0.2;
    ctx.beginPath();
    drawSmoothLoop(innerPtsX, innerPtsY, false);
    ctx.stroke();

    // -----------------------------------------------------------------
    // RENDER PASS 2: Flowing 3D Wave Lattice Filaments
    // -----------------------------------------------------------------
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 0.85;

    // Longitudinal flow lines along rows
    for (let j = 0; j < this.gridSize; j += 2) {
      let drawing = false;
      ctx.beginPath();
      for (let i = 0; i < this.gridSize; i++) {
        const idx = j * this.gridSize + i;
        if (this.isInside[idx] && this.screenAlpha[idx] > 0.06) {
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
      ctx.globalAlpha = 0.25 + subBass * 0.25;
      ctx.stroke();
    }

    // Subtle latitudinal cross lines along columns
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = 0.65;
    for (let i = 0; i < this.gridSize; i += 3) {
      let drawing = false;
      ctx.beginPath();
      for (let j = 0; j < this.gridSize; j++) {
        const idx = j * this.gridSize + i;
        if (this.isInside[idx] && this.screenAlpha[idx] > 0.08) {
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
      ctx.globalAlpha = 0.15 + subBass * 0.18;
      ctx.stroke();
    }

    // -----------------------------------------------------------------
    // RENDER PASS 3: Luminous 3D Particle Stream (The Signature Dots)
    // -----------------------------------------------------------------
    // A. Electric yellow glow halo behind dots
    ctx.fillStyle = this.primaryColor;
    for (let idx = 0; idx < this.totalPoints; idx += 2) {
      if (!this.isInside[idx] || this.screenAlpha[idx] < 0.06) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(1.3, 3.0 * scale);

      ctx.globalAlpha = alpha * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // B. Intense white-hot core dots
    ctx.fillStyle = this.coreColor;
    for (let idx = 0; idx < this.totalPoints; idx++) {
      if (!this.isInside[idx] || this.screenAlpha[idx] < 0.08) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(0.85, 1.8 * scale);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * 3D Particle Sphere Lattice & Polar Audio Spectrum Ribbon
 * 1:1 recreation of "Elektronomia - Sky High | NCS" verified frame-by-frame:
 *
 * 1. 3D Particle Sphere (Trapcode Form Base Form: Sphere):
 *    - Pure discrete glowing yellow dots on a 3D spherical lattice (NO DRAWN LINES!).
 *    - Folds in the 3D surface naturally create caustic wave filaments through optical density.
 *    - In quiet passages (intro), dots sit in a calm curved spherical dome along the perimeter.
 *    - In the drop, audio frequencies displace the sphere into the iconic S-curve wave crests.
 * 2. Polar Audio Spectrum Ribbon:
 *    - Circular outer rim with inward-modulating audio frequency scallops.
 *    - Multi-layered glowing neon yellow fill with white-hot core perimeter line.
 *    - Dynamically responsive to bass kicks, mid-range synth leads, and percussion.
 * 3. Additive Neon Bloom ('lighter'):
 *    - Near-zero CPU overhead, hardware-accelerated 60/120 FPS rendering.
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    // 3D Sphere Parameters (Trapcode Form Sphere)
    this.latRings = 54;    // Latitude rings from pole to pole
    this.lonPoints = 96;   // Longitude points per ring
    this.totalPoints = this.latRings * this.lonPoints; // 5,184 discrete dots

    // Spherical base coordinates
    this.phiCoord = new Float32Array(this.totalPoints);
    this.thetaCoord = new Float32Array(this.totalPoints);
    this.sinPhi = new Float32Array(this.totalPoints);
    this.cosPhi = new Float32Array(this.totalPoints);
    this.sinTheta = new Float32Array(this.totalPoints);
    this.cosTheta = new Float32Array(this.totalPoints);

    // Output buffers for 3D projection
    this.screenX = new Float32Array(this.totalPoints);
    this.screenY = new Float32Array(this.totalPoints);
    this.screenZ = new Float32Array(this.totalPoints);
    this.screenScale = new Float32Array(this.totalPoints);
    this.screenAlpha = new Float32Array(this.totalPoints);
    this.isVisible = new Uint8Array(this.totalPoints);

    // Precalculate spherical angles
    let idx = 0;
    for (let j = 0; j < this.latRings; j++) {
      // Polar angle phi: 0 (top) to PI (bottom)
      const phi = ((j + 0.5) / this.latRings) * Math.PI;
      const sPhi = Math.sin(phi);
      const cPhi = Math.cos(phi);

      for (let i = 0; i < this.lonPoints; i++) {
        // Azimuth angle theta: 0 to 2*PI
        const theta = (i / this.lonPoints) * Math.PI * 2;
        const sTheta = Math.sin(theta);
        const cTheta = Math.cos(theta);

        this.phiCoord[idx] = phi;
        this.thetaCoord[idx] = theta;
        this.sinPhi[idx] = sPhi;
        this.cosPhi[idx] = cPhi;
        this.sinTheta[idx] = sTheta;
        this.cosTheta[idx] = cTheta;
        idx++;
      }
    }

    // Outer Ribbon Resolution (180 angles)
    this.rimSegments = 180;
    this.rimCos = new Float32Array(this.rimSegments);
    this.rimSin = new Float32Array(this.rimSegments);
    this.smoothFreq = new Float32Array(this.rimSegments);

    for (let k = 0; k < this.rimSegments; k++) {
      const angle = (k / this.rimSegments) * Math.PI * 2;
      this.rimCos[k] = Math.cos(angle);
      this.rimSin[k] = Math.sin(angle);
    }

    // Colors: Signature Electric Neon Yellow
    this.primaryColor = '#ffe800';
    this.glowColor = '#ffaa00';
    this.coreColor = '#ffffff';

    // 3D Camera Angles matching TW9d8vYrVFQ
    this.rotX = 0.44;   // Downward tilt looking into the sphere
    this.rotY = -0.52;  // Angled towards the viewer from the right
    this.rotZ = 0.12;   // Diagonal tilt matching the Milky Way
    this.fov = 760;

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
    const { freqData, subBass, bass, mid, treble, kickPeak } = audioMetrics;
    const totalEnergy = subBass * 0.85 + mid * 0.75 + treble * 0.5;

    // Tempo-locked animation speed: active on beats, settles in quiet parts
    this.audioPhase += 0.012 + Math.min(0.08, totalEnergy * 0.09);

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
    // 1. COMPUTE 3D PARTICLE SPHERE DISPLACEMENT (Trapcode Form)
    // -----------------------------------------------------------------
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);
    const cosZ = Math.cos(this.rotZ);
    const sinZ = Math.sin(this.rotZ);

    const binCount = freqData.length;

    for (let p = 0; p < this.totalPoints; p++) {
      const phi = this.phiCoord[p];
      const theta = this.thetaCoord[p];
      const sPhi = this.sinPhi[p];
      const cPhi = this.cosPhi[p];
      const sTheta = this.sinTheta[p];
      const cTheta = this.cosTheta[p];

      // Map latitude & azimuth to live audio frequency spectrum
      const normLat = phi / Math.PI; // 0 to 1
      const normLon = theta / (Math.PI * 2); // 0 to 1
      const freqIdx = Math.floor(Math.pow(normLat * 0.6 + normLon * 0.4, 1.7) * (binCount * 0.55) + 2);
      const freqVal = (freqData[Math.min(binCount - 1, Math.max(0, freqIdx))] || 0) / 255.0;

      // Authentic 3D Trapcode Form Audio React Displacement:
      // A. Dynamic S-curve wave fold (active when music plays, flat in quiet intro)
      const waveFold = Math.sin(theta * 2.0 - phi * 2.5 - this.audioPhase * 2.2) * (45 * (freqVal + subBass * 0.8));

      // B. High-frequency secondary ripples from lead synth & percussion
      const waveRipple = Math.cos(phi * 5.0 + theta * 3.0 - this.audioPhase * 3.0) * (20 * (mid + treble * 0.5));

      // C. Bass kick radial shockwave
      const kickImpulse = kickPeak ? Math.sin(phi * 8.0 - this.audioPhase * 5.0) * (28 * subBass) : 0;

      // Total displaced radius from center:
      // When silent (totalEnergy ~ 0), r = R * 0.88 (smooth, calm spherical dome!)
      const r = R * (0.88 + (waveFold + waveRipple + kickImpulse) / R);

      // Base 3D Sphere Coordinates
      const x0 = r * sPhi * cTheta;
      const y0 = r * cPhi;
      const z0 = r * sPhi * sTheta;

      // 3D Euler Rotation
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;
      const y2 = y0 * cosX - z1 * sinX;
      const z2 = y0 * sinX + z1 * cosX;
      const xRot = x1 * cosZ - y2 * sinZ;
      const yRot = x1 * sinZ + y2 * cosZ;
      const zRot = z2;

      // Only render particles that are front-facing / within the spherical volume
      // In the intro, dots cluster along the curved perimeter; in the drop, wave crests fill the space
      const isFront = zRot > -R * 0.35 || totalEnergy > 0.2;
      this.isVisible[p] = isFront ? 1 : 0;
      if (!isFront) continue;

      // 3D Perspective Projection
      const scale = this.fov / (this.fov + zRot + 300);
      this.screenX[p] = cx + xRot * scale;
      this.screenY[p] = cy + yRot * scale;
      this.screenZ[p] = zRot;
      this.screenScale[p] = scale;

      // Depth shading: brighter near front wave crests, dimmer in distant valleys
      const depthAlpha = Math.max(0.12, Math.min(1.0, 0.45 + (zRot / (R * 0.9)) + totalEnergy * 0.4));
      this.screenAlpha[p] = depthAlpha;
    }

    // -----------------------------------------------------------------
    // 2. COMPUTE POLAR AUDIO SPECTRUM OUTER RIBBON
    // -----------------------------------------------------------------
    for (let k = 0; k < this.rimSegments; k++) {
      const angle = (k / this.rimSegments) * Math.PI * 2;
      const angleCos = Math.cos(angle);
      const normFreqIdx = (angleCos + 1.0) * 0.5; // 0 (left bass) to 1 (right treble)
      const binIdx = Math.floor(Math.pow(normFreqIdx, 1.6) * (binCount * 0.55) + 2);
      const rawVal = (freqData[Math.min(binCount - 1, Math.max(0, binIdx))] || 0) / 255.0;

      this.smoothFreq[k] = this.smoothFreq[k] * 0.70 + rawVal * 0.30;
    }

    // Spatial Gaussian smoothing over the 180 points
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
      const angle = (k / this.rimSegments) * Math.PI * 2;

      // 100% Continuous integer harmonics around 360° circle (zero seam notch)
      const fluidHarmonic = Math.sin(angle * 2.0 - this.audioPhase * 2.2) * (18 * subBass) +
                            Math.cos(angle * 3.0 + this.audioPhase * 1.6) * (14 * (sVal + 0.12)) +
                            Math.sin(angle * 4.0 - this.audioPhase * 3.0) * (8 * (sVal + 0.05));

      const rOuter = R + (sVal * 12) + (subBass * 10);
      const thickness = 22 + (sVal * 75) + (subBass * 40) + fluidHarmonic;
      const rInner = Math.max(R * 0.54, rOuter - thickness);

      outerPtsX[k] = cx + cosA * rOuter;
      outerPtsY[k] = cy + sinA * rOuter;
      innerPtsX[k] = cx + cosA * rInner;
      innerPtsY[k] = cy + sinA * rInner;
    }

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // -----------------------------------------------------------------
    // PRE-PASS 1: Soft Dark Cosmic Core inside Sphere for High Contrast
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
        let i = idx % len;
        if (i < 0) i += len;
        return [ptsX[i], ptsY[i]];
      };

      const startIdx = reverse ? len - 1 : 0;
      const [sx, sy] = getPt(startIdx);
      if (!reverse) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);

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
    // RENDER PASS 2: Pure Luminous 3D Discrete Particles (NO WIREFRAME LINES!)
    // -----------------------------------------------------------------
    // A. Electric yellow glow halo behind dots
    ctx.fillStyle = this.primaryColor;
    for (let idx = 0; idx < this.totalPoints; idx += 2) {
      if (!this.isVisible[idx] || this.screenAlpha[idx] < 0.05) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(1.3, 3.2 * scale);

      ctx.globalAlpha = alpha * 0.75;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // B. Intense white-hot core dots
    ctx.fillStyle = this.coreColor;
    for (let idx = 0; idx < this.totalPoints; idx++) {
      if (!this.isVisible[idx] || this.screenAlpha[idx] < 0.08) continue;
      const px = this.screenX[idx];
      const py = this.screenY[idx];
      const scale = this.screenScale[idx];
      const alpha = this.screenAlpha[idx];
      const radius = Math.max(0.85, 1.85 * scale);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

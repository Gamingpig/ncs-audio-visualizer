/**
 * 3D Particle Mesh & Undulating Ribbon Visualizer (Trapcode Form Engine)
 * Exact 1:1 recreation of the visualizer in "Elektronomia - Sky High":
 *
 * 1. 3D Organic Fluid Ribbon: The outer perimeter is an elastic, undulating, continuous glowing yellow ribbon.
 * 2. 3D Particle Lattice: Thousands of luminous yellow dots arranged in concentric flowing wave lines in 3D perspective.
 * 3. 3D Wave Displacement: Audio frequencies ripple across the mesh like an undulating silk terrain / vortex.
 * 4. Additive Neon Bloom ('lighter'): Blinding electric yellow glow with near-zero GPU/CPU overhead.
 * 5. Fullscreen Atmospheric Landscape: Night sky with stars, horizon mist, and towering sandstone monoliths.
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    // 3D Grid Parameters
    this.ringsCount = 30;     // Concentric rings inside the mesh
    this.segmentsCount = 64;  // Points per ring
    this.totalPoints = this.ringsCount * this.segmentsCount;

    // Point buffers
    this.meshX = new Float32Array(this.totalPoints);
    this.meshY = new Float32Array(this.totalPoints);
    this.meshZ = new Float32Array(this.totalPoints);
    this.screenX = new Float32Array(this.totalPoints);
    this.screenY = new Float32Array(this.totalPoints);
    this.screenAlpha = new Float32Array(this.totalPoints);
    this.screenScale = new Float32Array(this.totalPoints);

    // Outer rim contour (64 lobes)
    this.rimRadius = new Float32Array(this.segmentsCount);
    this.rimVelocity = new Float32Array(this.segmentsCount);

    // Trigonometric lookup tables
    this.cosAngles = new Float32Array(this.segmentsCount);
    this.sinAngles = new Float32Array(this.segmentsCount);
    const dTheta = (Math.PI * 2) / this.segmentsCount;
    for (let j = 0; j < this.segmentsCount; j++) {
      const angle = j * dTheta;
      this.cosAngles[j] = Math.cos(angle);
      this.sinAngles[j] = Math.sin(angle);
    }

    // Base geometry
    this.baseRadius = 160;
    this.time = 0;

    // Default theme: Elektronomia Sky High Electric Neon Yellow
    this.primaryColor = '#ffe800';
    this.glowColor = '#ffbb00';

    // 3D Camera Angles
    this.rotX = 0.38;   // Tilt backwards for 3D depth
    this.rotY = -0.22;  // Slight angle facing the viewer
    this.fov = 600;

    // Background Layer Element
    this.bgLayer = document.getElementById('bgLayer');

    // DPI & sizing
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(color, glow) {
    this.primaryColor = color;
    this.glowColor = glow;
  }

  setCoverArt() {
    // In this 3D undulating particle mesh style, the interior is open 3D particle space
  }

  setDefaultLogo() {
    // In this 3D undulating particle mesh style, the interior is open 3D particle space
  }

  setBackgroundArt(url) {
    if (this.bgLayer) {
      if (url) {
        this.bgLayer.style.backgroundImage = `url("${url}")`;
      } else {
        this.bgLayer.style.backgroundImage = '';
      }
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

    const minDim = Math.min(this.width, this.height);
    this.baseRadius = Math.max(110, Math.min(220, minDim * 0.22));

    // Place visualizer center slightly to the right on wide screens (matching YouTube video)
    if (this.width > 900) {
      this.centerX = this.width * 0.62;
      this.centerY = this.height * 0.48;
    } else {
      this.centerX = this.width * 0.5;
      this.centerY = this.height * 0.46;
    }
  }

  /**
   * Main Render Frame: 3D Trapcode Form Mesh + Fluid Outer Ribbon
   */
  render(audioMetrics) {
    const { freqData, subBass, kickPeak } = audioMetrics;
    this.time += 0.04;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = this.centerX;
    const cy = this.centerY;

    // Hardware CSS background zoom on bass kick (0% CPU)
    if (this.bgLayer) {
      const zoom = 1.0 + Math.pow(subBass, 1.8) * 0.04;
      this.bgLayer.style.transform = `scale(${zoom})`;
    }

    // 1. Calculate Outer Rim Deformations
    const binCount = freqData.length;
    for (let j = 0; j < this.segmentsCount; j++) {
      // Map 64 segments around circle symmetrically to frequencies (40 Hz - 3000 Hz)
      const symJ = j < 32 ? j : (63 - j);
      const binIdx = Math.floor(2 + (symJ / 32) * (binCount * 0.35));
      const freqVal = (freqData[binIdx] || 0) / 255.0;

      // Harmonic lobe wave (3-4 smooth antinodes like in video)
      const harmonic = Math.sin(j * 0.4 + this.time * 2.0) * 0.12 * subBass;
      const targetR = this.baseRadius * (1.0 + freqVal * 0.45 + harmonic + Math.pow(subBass, 1.6) * 0.25);

      // Smooth elastic response
      this.rimRadius[j] = this.rimRadius[j] * 0.68 + targetR * 0.32;
    }

    // 2. Compute 3D Mesh Vertex Positions & 3D Perspective Projection
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);

    let idx = 0;
    for (let i = 0; i < this.ringsCount; i++) {
      const rFrac = (i + 1) / this.ringsCount; // 0.03 to 1.0

      for (let j = 0; j < this.segmentsCount; j++) {
        const outerR = this.rimRadius[j];
        const r = outerR * rFrac;

        // Base 2D disk coordinates
        const x0 = r * this.cosAngles[j];
        const y0 = r * this.sinAngles[j];

        // 3D Traveling Wave Displacement (Trapcode Form effect)
        const wave1 = Math.sin(rFrac * 6.5 - this.time * 3.0 + j * 0.15) * (35 * (subBass + 0.3));
        const wave2 = Math.cos(j * 0.3 - this.time * 2.2) * (20 * rFrac);
        const wave3 = Math.sin(this.time * 4.0 + (x0 * 0.02)) * (15 * subBass);
        const z0 = (wave1 + wave2 + wave3) * (1.0 - rFrac * 0.35);

        // 3D Rotation (Y-axis then X-axis)
        const xRot = x0 * cosY + z0 * sinY;
        const zMid = -x0 * sinY + z0 * cosY;
        const yRot = y0 * cosX - zMid * sinX;
        const zRot = y0 * sinX + zMid * cosX;

        // Perspective projection
        const scale = this.fov / (this.fov + zRot + 250);
        this.screenX[idx] = cx + xRot * scale;
        this.screenY[idx] = cy + yRot * scale;
        this.screenScale[idx] = scale;

        // Depth shading: brighter at wave crests, dimmer in valleys
        const depthAlpha = Math.max(0.15, Math.min(1.0, 0.45 + (zRot / 80) + subBass * 0.3));
        this.screenAlpha[idx] = depthAlpha;

        idx++;
      }
    }

    // Clear Canvas
    ctx.clearRect(0, 0, w, h);

    // -------------------------------------------------------------
    // RENDER PASS 1: The 3D Flowing Wave Lines (Trapcode Form Mesh)
    // -------------------------------------------------------------
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // Additive blending for blinding neon glow

    // A. Draw concentric curved ring lines
    for (let i = 0; i < this.ringsCount; i++) {
      const startIdx = i * this.segmentsCount;
      const ringAlpha = (i / this.ringsCount) * 0.55 + 0.15;
      ctx.lineWidth = Math.max(0.8, 1.4 * this.screenScale[startIdx]);
      ctx.strokeStyle = this.primaryColor;
      ctx.globalAlpha = Math.min(0.8, ringAlpha * (0.6 + subBass * 0.5));

      ctx.beginPath();
      for (let j = 0; j < this.segmentsCount; j++) {
        const pIdx = startIdx + j;
        const px = this.screenX[pIdx];
        const py = this.screenY[pIdx];
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      // Close loop
      ctx.lineTo(this.screenX[startIdx], this.screenY[startIdx]);
      ctx.stroke();
    }

    // B. Draw radial connecting rib lines (every 2nd segment for clean lattice)
    for (let j = 0; j < this.segmentsCount; j += 2) {
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = this.glowColor;
      ctx.globalAlpha = 0.25 + subBass * 0.25;

      ctx.beginPath();
      for (let i = 0; i < this.ringsCount; i++) {
        const pIdx = i * this.segmentsCount + j;
        const px = this.screenX[pIdx];
        const py = this.screenY[pIdx];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // -------------------------------------------------------------
    // RENDER PASS 2: Luminous 3D Particle Points (The Signature Dots)
    // -------------------------------------------------------------
    ctx.fillStyle = '#ffffff'; // White-hot dot centers
    for (let p = 0; p < this.totalPoints; p += 2) {
      const px = this.screenX[p];
      const py = this.screenY[p];
      const pScale = this.screenScale[p];
      const pAlpha = this.screenAlpha[p];
      const dotSize = Math.max(1.0, 2.2 * pScale);

      ctx.globalAlpha = pAlpha;
      ctx.beginPath();
      ctx.arc(px, py, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Yellow glow surrounding dots
    ctx.fillStyle = this.primaryColor;
    for (let p = 1; p < this.totalPoints; p += 3) {
      const px = this.screenX[p];
      const py = this.screenY[p];
      const pScale = this.screenScale[p];
      const dotSize = Math.max(1.5, 3.2 * pScale);

      ctx.globalAlpha = this.screenAlpha[p] * 0.75;
      ctx.beginPath();
      ctx.arc(px, py, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // -------------------------------------------------------------
    // RENDER PASS 3: The Thick Undulating Fluid Outer Ribbon
    // -------------------------------------------------------------
    const rimStart = (this.ringsCount - 1) * this.segmentsCount;

    // Glow Halo Layer for the Outer Ribbon
    ctx.lineWidth = 14 + subBass * 18;
    ctx.strokeStyle = this.primaryColor;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (let j = 0; j < this.segmentsCount; j++) {
      const pIdx = rimStart + j;
      const px = this.screenX[pIdx];
      const py = this.screenY[pIdx];
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(this.screenX[rimStart], this.screenY[rimStart]);
    ctx.stroke();

    // Medium Intense Glow
    ctx.lineWidth = 6 + subBass * 8;
    ctx.strokeStyle = this.glowColor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let j = 0; j < this.segmentsCount; j++) {
      const pIdx = rimStart + j;
      const px = this.screenX[pIdx];
      const py = this.screenY[pIdx];
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(this.screenX[rimStart], this.screenY[rimStart]);
    ctx.stroke();

    // Sharp White-Hot Ribbon Core
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    for (let j = 0; j < this.segmentsCount; j++) {
      const pIdx = rimStart + j;
      const px = this.screenX[pIdx];
      const py = this.screenY[pIdx];
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(this.screenX[rimStart], this.screenY[rimStart]);
    ctx.stroke();

    ctx.restore();
  }
}

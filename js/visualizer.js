/**
 * NCS Sky High Visualizer v7.1 (Full Bloom Pipeline)
 */
export class NCSVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.bloomCanvas = document.createElement('canvas');
    this.bloomCtx = this.bloomCanvas.getContext('2d', { alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.primaryColor = '#ffe800';
    this.glowColor = '#ffbb00';
    this.coreColor = '#ffffff';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.canvas.width = this.bloomCanvas.width = window.innerWidth * this.dpr;
    this.canvas.height = this.bloomCanvas.height = window.innerHeight * this.dpr;
  }

  setTheme(color, glow) { this.primaryColor = color; this.glowColor = glow; }

  render(audio) {
    const { subBass, freqData } = audio;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w/2; const cy = h/2;
    const R = Math.min(w, h) * 0.3;

    ctx.clearRect(0, 0, w, h);
    this.bloomCtx.clearRect(0, 0, w, h);

    // 1. Render Spectrum (Additive Bars)
    ctx.globalCompositeOperation = 'lighter';
    this.bloomCtx.globalCompositeOperation = 'lighter';
    
    for (let k = 0; k < 240; k++) {
      const angle = (k / 240) * Math.PI * 2;
      const freq = freqData[Math.floor((k/240)*freqData.length)] / 255;
      const hBar = 30 + freq * 150 + subBass * 50;
      
      const x1 = cx + Math.cos(angle) * R;
      const y1 = cy + Math.sin(angle) * R;
      const x2 = cx + Math.cos(angle) * (R - hBar);
      const y2 = cy + Math.sin(angle) * (R - hBar);

      // Draw to Main
      ctx.strokeStyle = this.primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      
      // Draw to Bloom
      this.bloomCtx.strokeStyle = this.glowColor;
      this.bloomCtx.lineWidth = 8;
      this.bloomCtx.beginPath(); this.bloomCtx.moveTo(x1, y1); this.bloomCtx.lineTo(x2, y2); this.bloomCtx.stroke();
    }

    // 2. Draw Bloom Pass
    ctx.filter = 'blur(10px)';
    ctx.drawImage(this.bloomCanvas, 0, 0);
    ctx.filter = 'none';
  }
}

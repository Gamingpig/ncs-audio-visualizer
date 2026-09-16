/**
 * Audio Engine managing Web Audio API, AnalyserNode, FFT analysis,
 * Local file playback, Microphone stream, and Trap Demo synthesizer.
 */
export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.micStream = null;
    this.isPlaying = false;
    this.currentMode = null; // 'file', 'mic', 'demo'

    this.fftSize = 2048;
    this.frequencyBinCount = this.fftSize / 2;
    this.freqData = new Uint8Array(this.frequencyBinCount);
    this.timeData = new Uint8Array(this.frequencyBinCount);

    // Energy metrics
    this.subBass = 0;
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.kickPeak = false;
    this.prevBass = 0;

    // Callbacks
    this.onTrackChange = null;
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  disconnectCurrent() {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        console.warn(e);
      }
      this.sourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
    }
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
  }

  // Input 1: Microphone / Live Stereo Mix
  async startMicrophone() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.sourceNode.connect(this.analyser);
      // Do NOT connect to destination to avoid feedback loop!

      this.isPlaying = true;
      this.currentMode = 'mic';

      if (this.onTrackChange) {
        this.onTrackChange({
          title: "Live Mikrofon / Stereo Mix",
          artist: "System Audio Input",
          cover: null
        });
      }
      return true;
    } catch (err) {
      console.error("Mikrofon-Zugriff verweigert oder fehlgeschlagen:", err);
      alert("Konnte nicht auf das Mikrofon zugreifen: " + err.message);
      return false;
    }
  }

  // Input 2: Local Audio File
  playLocalFile(file) {
    this.ensureAudioContext();
    this.disconnectCurrent();

    const url = URL.createObjectURL(file);
    this.audioElement.src = url;
    this.audioElement.load();

    if (!this.fileSourceCreated) {
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      this.fileSourceCreated = true;
    }
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    this.audioElement.play();
    this.isPlaying = true;
    this.currentMode = 'file';

    const fileName = file.name.replace(/\.[^/.]+$/, "");
    if (this.onTrackChange) {
      this.onTrackChange({
        title: fileName,
        artist: "Lokale Datei",
        cover: null
      });
    }
  }

  // Demo Synthesizer: Trap Beat Loop (Subbass 808 + Snare + Hi-Hats)
  startDemoBeat() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    this.isPlaying = true;
    this.currentMode = 'demo';

    // Master bus for demo
    const masterGain = this.audioCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    if (this.onTrackChange) {
      this.onTrackChange({
        title: "NCS Trap Anthem (Synthesized Demo)",
        artist: "Subbass 808 Trap Generator (140 BPM)",
        cover: null
      });
    }

    let step = 0;
    const bpm = 140;
    const stepTime = (60 / bpm) / 4; // 16th note

    const playSubKick = (time) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      // Pitch drop from 150Hz to 45Hz
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      osc.frequency.exponentialRampToValueAtTime(35, time + 0.4);

      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.45);
    };

    const playHiHat = (time, isRolled = false) => {
      const bufferSize = this.audioCtx.sampleRate * (isRolled ? 0.02 : 0.04);
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.audioCtx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7000, time);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(isRolled ? 0.15 : 0.25, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + (isRolled ? 0.02 : 0.04));

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      whiteNoise.start(time);
    };

    const playSnare = (time) => {
      // Body
      const osc = this.audioCtx.createOscillator();
      const oscGain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.1);
      oscGain.gain.setValueAtTime(0.6, time);
      oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.12);

      // Noise
      const bufferSize = this.audioCtx.sampleRate * 0.2;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1000, time);
      const noiseGain = this.audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.5, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.18);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noise.start(time);
    };

    const playMelody = (time, freq) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, time);

      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.2);
    };

    const melodyNotes = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25]; // C Minor Pentatonic

    let nextNoteTime = this.audioCtx.currentTime + 0.05;
    this.demoInterval = setInterval(() => {
      while (nextNoteTime < this.audioCtx.currentTime + 0.1) {
        const beatStep = step % 16;

        // Trap Kick pattern (Beats 0, 4, 7, 10, 14)
        if (beatStep === 0 || beatStep === 6 || beatStep === 10) {
          playSubKick(nextNoteTime);
        }

        // Trap Snare / Clap on 4 and 12
        if (beatStep === 4 || beatStep === 12) {
          playSnare(nextNoteTime);
        }

        // Hi-Hats on every step, fast trap rolls on steps 14, 15
        if (beatStep >= 14) {
          playHiHat(nextNoteTime, true);
        } else {
          playHiHat(nextNoteTime, false);
        }

        // Lead synth melody
        if (beatStep % 2 === 0) {
          const note = melodyNotes[(step >> 1) % melodyNotes.length];
          playMelody(nextNoteTime, note);
        }

        nextNoteTime += stepTime;
        step++;
      }
    }, 25);
  }

  // Update FFT data every frame
  update() {
    if (!this.analyser) {
      return {
        freqData: this.freqData,
        subBass: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        kickPeak: false
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Subbass range: ~30Hz - 120Hz
    // Bass range: ~120Hz - 250Hz
    // Mid range: ~250Hz - 2500Hz
    // Treble range: ~2500Hz - 10000Hz
    const sampleRate = this.audioCtx ? this.audioCtx.sampleRate : 44100;
    const binWidth = sampleRate / this.fftSize;

    const getAverageRange = (minHz, maxHz) => {
      const startBin = Math.max(0, Math.floor(minHz / binWidth));
      const endBin = Math.min(this.frequencyBinCount - 1, Math.ceil(maxHz / binWidth));
      let sum = 0;
      let count = 0;
      for (let i = startBin; i <= endBin; i++) {
        sum += this.freqData[i];
        count++;
      }
      return count > 0 ? sum / count / 255 : 0;
    };

    this.subBass = getAverageRange(30, 110);
    this.bass = getAverageRange(110, 260);
    this.mid = getAverageRange(260, 2500);
    this.treble = getAverageRange(2500, 10000);

    // Kick / Peak detection with dynamic threshold
    const bassEnergy = (this.subBass * 0.7 + this.bass * 0.3);
    const threshold = 0.55;
    this.kickPeak = bassEnergy > threshold && (bassEnergy - this.prevBass) > 0.08;
    this.prevBass = bassEnergy;

    return {
      freqData: this.freqData,
      subBass: this.subBass,
      bass: this.bass,
      mid: this.mid,
      treble: this.treble,
      kickPeak: this.kickPeak
    };
  }
}

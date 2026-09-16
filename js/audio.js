/**
 * Audio Engine managing Web Audio API, AnalyserNode, FFT analysis,
 * Local file playback, Microphone stream, Screen / System Audio Capture (getDisplayMedia),
 * and Trap Demo synthesizer.
 */
export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.gainNode = null;
    this.sourceNode = null;
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.activeStream = null;
    this.isPlaying = false;
    this.currentMode = null; // 'file', 'mic', 'system', 'demo'

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

      // Analyser with responsive smoothing
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.78;

      // Sensitivity Boost Gain Node (especially critical for Mic & external devices)
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.analyser);
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
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
    }
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    this.isPlaying = false;
    this.currentMode = null;
  }

  // Input 1: System Audio Capture via getDisplayMedia
  async startSystemAudio() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    try {
      // Prompt user to share a tab or system screen with audio checked
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        alert("Keine Audio-Spur geteilt! Bitte stelle im Browser-Dialog sicher, dass 'System-Audio teilen' bzw. 'Audio der Registerkarte teilen' aktiviert ist.");
        return false;
      }

      // Stop unused video track immediately to save CPU/GPU resources
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(vt => vt.stop());

      this.activeStream = stream;
      this.gainNode.gain.value = 1.6; // High punch for system audio
      this.sourceNode = this.audioCtx.createMediaStreamSource(new MediaStream(audioTracks));
      this.sourceNode.connect(this.gainNode);
      // DO NOT connect to destination to prevent feedback loop!

      this.isPlaying = true;
      this.currentMode = 'system';

      audioTracks[0].onended = () => {
        this.disconnectCurrent();
        if (this.onTrackChange) {
          this.onTrackChange({
            title: "Gestoppt",
            artist: "System-Audio beendet",
            cover: null
          });
        }
      };

      if (this.onTrackChange) {
        this.onTrackChange({
          title: "Live System Audio (Spotify / Browser / Desktop)",
          artist: "Direkte Audio-Schleife",
          cover: null
        });
      }
      return true;
    } catch (err) {
      console.error("System-Audio Capture fehlgeschlagen:", err);
      return false;
    }
  }

  // Input 2: Microphone with Sensitivity Boost
  async startMicrophone() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    try {
      this.activeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      // Boost mic gain substantially so bars react with full amplitude
      this.gainNode.gain.value = 2.8;
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.activeStream);
      this.sourceNode.connect(this.gainNode);
      // DO NOT connect to destination!

      this.isPlaying = true;
      this.currentMode = 'mic';

      if (this.onTrackChange) {
        this.onTrackChange({
          title: "Live Mikrofon Input",
          artist: "Verstärkter Raum- & Stereo-Mix",
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

  // Input 3: Local Audio File (MP3, WAV, FLAC)
  playLocalFile(file) {
    this.ensureAudioContext();
    this.disconnectCurrent();

    const url = URL.createObjectURL(file);
    this.audioElement.src = url;
    this.audioElement.load();

    if (!this.fileSourceCreated) {
      this.fileSourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      this.fileSourceCreated = true;
    }
    this.sourceNode = this.fileSourceNode;
    this.gainNode.gain.value = 1.0;
    this.sourceNode.connect(this.gainNode);
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

  // Input 4: Trap Demo Beat Generator (140 BPM Sub-808, Snare, Hi-Hat Rolls)
  startDemoBeat() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    this.isPlaying = true;
    this.currentMode = 'demo';

    const masterGain = this.audioCtx.createGain();
    masterGain.gain.value = 0.95;
    masterGain.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    if (this.onTrackChange) {
      this.onTrackChange({
        title: "NCS Trap Anthem (Synthesized Demo)",
        artist: "140 BPM Sub-808 Trap Generator",
        cover: null
      });
    }

    let step = 0;
    const bpm = 140;
    const stepTime = (60 / bpm) / 4;

    const playSubKick = (time) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
      osc.frequency.exponentialRampToValueAtTime(36, time + 0.42);

      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.45);
    };

    const playHiHat = (time, isRolled = false) => {
      const bufferSize = this.audioCtx.sampleRate * (isRolled ? 0.025 : 0.045);
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.audioCtx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6500, time);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(isRolled ? 0.2 : 0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + (isRolled ? 0.025 : 0.045));

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      whiteNoise.start(time);
    };

    const playSnare = (time) => {
      const osc = this.audioCtx.createOscillator();
      const oscGain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, time);
      osc.frequency.exponentialRampToValueAtTime(85, time + 0.1);
      oscGain.gain.setValueAtTime(0.7, time);
      oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.13);
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.13);

      const bufferSize = this.audioCtx.sampleRate * 0.22;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1100, time);
      const noiseGain = this.audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.6, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
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
      filter.frequency.setValueAtTime(1600, time);

      gain.gain.setValueAtTime(0.16, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.22);
    };

    const melodyNotes = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25, 622.25];

    let nextNoteTime = this.audioCtx.currentTime + 0.05;
    this.demoInterval = setInterval(() => {
      while (nextNoteTime < this.audioCtx.currentTime + 0.1) {
        const beatStep = step % 16;

        // Punchy Trap Kick pattern
        if (beatStep === 0 || beatStep === 6 || beatStep === 10) {
          playSubKick(nextNoteTime);
        }

        // Snare / Clap
        if (beatStep === 4 || beatStep === 12) {
          playSnare(nextNoteTime);
        }

        // Hi-Hat rolls
        if (beatStep >= 14) {
          playHiHat(nextNoteTime, true);
        } else {
          playHiHat(nextNoteTime, false);
        }

        // Synth leads
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

    // Subbass (Trap circle punch: ~30-90Hz)
    this.subBass = getAverageRange(30, 95);
    this.bass = getAverageRange(95, 250);
    this.mid = getAverageRange(250, 2600);
    this.treble = getAverageRange(2600, 11000);

    // Fast Kick Peak Detection
    const bassEnergy = (this.subBass * 0.75 + this.bass * 0.25);
    const threshold = 0.48;
    this.kickPeak = bassEnergy > threshold && (bassEnergy - this.prevBass) > 0.06;
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

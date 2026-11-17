/**
 * Ultra Low-Latency Audio Engine
 *
 * Latency Optimizations:
 * - fftSize reduced to 1024 (~23ms buffer at 44.1kHz).
 * - smoothingTimeConstant reduced to 0.15 for ultra-responsive, instantaneous transient attack.
 * - Zero-delay frequency bin analysis with instant transient pass-through.
 *
 * Safety:
 * - AnalyserNode is STRICTLY an analysis sink and NEVER connects to audioCtx.destination!
 * - Zero feedback loops on System-Audio or Microphone.
 */
export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.analyserGainNode = null;
    this.playbackGainNode = null;
    this.sourceNode = null;
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.activeStream = null;
    this.isPlaying = false;
    this.currentMode = null; // 'file', 'mic', 'system', 'demo'

    // Low latency FFT settings
    this.fftSize = 1024;
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

    // Adjustable sensitivity and playback volume
    this.sensitivity = 1.0;
    this.playbackVolume = 1.0;

    // Callbacks
    this.onTrackChange = null;
    this.onTimeUpdate = null;
    this.onEnded = null;

    // Audio Element event listeners
    this.audioElement.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate && this.currentMode === 'file') {
        this.onTimeUpdate(this.audioElement.currentTime, this.audioElement.duration || 0);
      }
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.onEnded) this.onEnded();
    });
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      // High-performance audio context with low latency
      this.audioCtx = new AudioContextClass({ latencyHint: 'interactive' });

      // Analyser with minimal smoothing for INSTANT zero-delay responsiveness
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.15; // Instant attack!

      // Sensitivity Gain Node feeding ONLY into the Analyser
      this.analyserGainNode = this.audioCtx.createGain();
      this.analyserGainNode.gain.value = this.sensitivity;
      this.analyserGainNode.connect(this.analyser);

      // Playback Gain Node strictly for audible sources (Local File & Synth Demo)
      this.playbackGainNode = this.audioCtx.createGain();
      this.playbackGainNode.gain.value = this.playbackVolume;
      this.playbackGainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setSensitivity(val) {
    this.sensitivity = Math.max(0.1, Math.min(3.0, val));
    if (this.analyserGainNode && this.audioCtx) {
      this.analyserGainNode.gain.setValueAtTime(this.sensitivity, this.audioCtx.currentTime);
    }
  }

  setPlaybackVolume(val) {
    this.playbackVolume = Math.max(0.0, Math.min(1.0, val));
    if (this.playbackGainNode && this.audioCtx) {
      this.playbackGainNode.gain.setValueAtTime(this.playbackVolume, this.audioCtx.currentTime);
    }
  }

  disconnectCurrent() {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        console.warn("Disconnect error:", e);
      }
      this.sourceNode = null;
    }

    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn(e);
        }
      });
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

  /**
   * Input 1: System Audio / Screen Audio Capture
   */
  async startSystemAudio() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    try {
      const constraints = {
        video: {
          displaySurface: "browser",
          selfBrowserSurface: "exclude"
        },
        audio: {
          systemAudio: "include",
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      } catch (e) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
      }

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error("NO_AUDIO_TRACK");
      }

      stream.getVideoTracks().forEach(vt => vt.stop());
      this.activeStream = stream;

      this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 1.0, this.audioCtx.currentTime);

      const audioStream = new MediaStream([audioTracks[0]]);
      this.sourceNode = this.audioCtx.createMediaStreamSource(audioStream);

      // Route ONLY to AnalyserNode
      this.sourceNode.connect(this.analyserGainNode);

      this.isPlaying = true;
      this.currentMode = 'system';

      audioTracks[0].onended = () => {
        this.disconnectCurrent();
        if (this.onTrackChange) {
          this.onTrackChange({
            title: "Gestoppt",
            artist: "System-Audio Übertragung beendet",
            cover: null
          });
        }
      };

      if (this.onTrackChange) {
        this.onTrackChange({
          title: "Live System-Audio",
          artist: "Visualisiert Desktop, Spotify, YouTube & Browser",
          cover: null
        });
      }
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.info("Benutzer hat die Audio-Freigabe abgebrochen.");
        return false;
      }
      if (err.message === "NO_AUDIO_TRACK") {
        alert("Keine Audio-Spur ausgewählt! Bitte aktiviere im Browser-Fenster das Häkchen bei 'Audio der Registerkarte teilen' bzw. 'System-Audio teilen'.");
        return false;
      }
      console.error("System-Audio Fehler:", err);
      alert("System-Audio konnte nicht gestartet werden: " + err.message);
      return false;
    }
  }

  /**
   * Input 2: Microphone
   */
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

      this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 2.0, this.audioCtx.currentTime);
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.activeStream);
      this.sourceNode.connect(this.analyserGainNode);

      this.isPlaying = true;
      this.currentMode = 'mic';

      if (this.onTrackChange) {
        this.onTrackChange({
          title: "Live Mikrofon",
          artist: "Raum-Audio / Externer Eingang",
          cover: null
        });
      }
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.info("Mikrofon-Zugriff abgelehnt.");
        return false;
      }
      console.error("Mikrofon-Fehler:", err);
      alert("Konnte nicht auf das Mikrofon zugreifen: " + err.message);
      return false;
    }
  }

  /**
   * Input 3: Local Audio File
   */
  playLocalFile(file, meta = {}) {
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
    this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 1.0, this.audioCtx.currentTime);

    this.sourceNode.connect(this.analyserGainNode);
    this.sourceNode.connect(this.playbackGainNode);

    this.audioElement.play().catch(e => console.warn("Autoplay block:", e));
    this.isPlaying = true;
    this.currentMode = 'file';

    const title = meta.title || file.name.replace(/\.[^/.]+$/, "");
    const artist = meta.artist || "Lokale Datei";

    if (this.onTrackChange) {
      this.onTrackChange({
        title,
        artist,
        cover: meta.cover || null
      });
    }
  }

  togglePlayPause() {
    if (this.currentMode === 'file') {
      if (this.audioElement.paused) {
        this.audioElement.play();
        this.isPlaying = true;
      } else {
        this.audioElement.pause();
        this.isPlaying = false;
      }
      return this.isPlaying;
    }
    return false;
  }

  seek(seconds) {
    if (this.currentMode === 'file' && Number.isFinite(seconds)) {
      this.audioElement.currentTime = seconds;
    }
  }

  /**
   * Input 4: Progressive House Demo Beat Synthesizer (128 BPM Sky High Style)
   */
  startDemoBeat() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    this.isPlaying = true;
    this.currentMode = 'demo';

    const synthMasterGain = this.audioCtx.createGain();
    synthMasterGain.gain.value = 0.82;

    synthMasterGain.connect(this.analyserGainNode);
    synthMasterGain.connect(this.playbackGainNode);

    if (this.onTrackChange) {
      this.onTrackChange({
        title: "Elektronomia",
        artist: "Sky High",
        cover: null
      });
    }

    let step = 0;
    const bpm = 128;
    const stepTime = (60 / bpm) / 4;

    const playHouseKick = (time) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, time);
      osc.frequency.exponentialRampToValueAtTime(52, time + 0.08);
      osc.frequency.exponentialRampToValueAtTime(32, time + 0.35);

      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

      osc.connect(gain);
      gain.connect(synthMasterGain);
      osc.start(time);
      osc.stop(time + 0.38);
    };

    const playOpenHat = (time) => {
      const bufferSize = this.audioCtx.sampleRate * 0.08;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7500, time);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.075);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);
      noise.start(time);
    };

    const playClap = (time) => {
      const bufferSize = this.audioCtx.sampleRate * 0.16;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, time);
      filter.Q.setValueAtTime(1.5, time);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.55, time);
      gain.gain.exponentialRampToValueAtTime(0.005, time + 0.15);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);
      noise.start(time);
    };

    const playBassNote = (time, freq) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, time);
      filter.frequency.exponentialRampToValueAtTime(250, time + 0.12);

      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);
      osc.start(time);
      osc.stop(time + 0.14);
    };

    const playEuphoricLead = (time, freq) => {
      // Layered Supersaw Synthesizer (3 detuned saw oscillators)
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const osc3 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 1.008, time); // Detuned sharp

      osc3.type = 'sawtooth';
      osc3.frequency.setValueAtTime(freq * 0.992, time); // Detuned flat

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4200, time);
      filter.frequency.exponentialRampToValueAtTime(1800, time + 0.24);

      gain.gain.setValueAtTime(0.24, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);

      osc1.start(time);
      osc2.start(time);
      osc3.start(time);
      osc1.stop(time + 0.25);
      osc2.stop(time + 0.25);
      osc3.stop(time + 0.25);
    };

    // Authentic Elektronomia - Sky High Melodic Hook (32 Steps in F# Minor)
    const melodyPattern = [
      // Bar 1 (F#m -> D)
      554.37, 554.37, 554.37, 493.88,
      440.00, 440.00, 369.99, 440.00,
      554.37, 554.37, 659.25, 659.25,
      659.25, 659.25, 587.33, 554.37,
      // Bar 2 (A -> E)
      587.33, 587.33, 554.37, 493.88,
      415.30, 415.30, 440.00, 493.88,
      554.37, 554.37, 440.00, 440.00,
      369.99, 369.99, 369.99, 369.99
    ];

    // F#m -> D -> A -> E Bassline
    const bassProgression = [
      92.50, 92.50, 92.50, 92.50, 92.50, 92.50, 92.50, 92.50,  // F#
      73.42, 73.42, 73.42, 73.42, 73.42, 73.42, 73.42, 73.42,  // D
      110.00, 110.00, 110.00, 110.00, 110.00, 110.00, 110.00, 110.00, // A
      82.41, 82.41, 82.41, 82.41, 82.41, 82.41, 82.41, 82.41   // E
    ];

    let nextNoteTime = this.audioCtx.currentTime + 0.05;
    this.demoInterval = setInterval(() => {
      while (nextNoteTime < this.audioCtx.currentTime + 0.1) {
        const beatStep = step % 16;
        const songStep = step % 32;

        // 4-on-the-Floor Kick & Offbeat Hats
        if (beatStep % 4 === 0) playHouseKick(nextNoteTime);
        if (beatStep % 4 === 2) playOpenHat(nextNoteTime);
        if (beatStep === 4 || beatStep === 12) playClap(nextNoteTime);

        // Sidechain-pumping bassline
        const bassFreq = bassProgression[songStep];
        playBassNote(nextNoteTime, bassFreq);

        // Lead Melody
        const leadFreq = melodyPattern[songStep];
        playEuphoricLead(nextNoteTime, leadFreq);

        nextNoteTime += stepTime;
        step++;
      }
    }, 25);
  }

  // Ultra-fast FFT update
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

    const sampleRate = this.audioCtx ? this.audioCtx.sampleRate : 44100;
    const binWidth = sampleRate / this.fftSize;

    // Fast inline range averaging
    const getAvg = (minHz, maxHz) => {
      const start = (minHz / binWidth) | 0;
      const end = Math.min(this.frequencyBinCount - 1, ((maxHz / binWidth) + 1) | 0);
      let sum = 0;
      let count = 0;
      for (let i = start; i <= end; i++) {
        sum += this.freqData[i];
        count++;
      }
      return count > 0 ? (sum / (count * 255)) : 0;
    };

    this.subBass = getAvg(35, 95);
    this.bass = getAvg(95, 260);
    this.mid = getAvg(260, 3000);
    this.treble = getAvg(3000, 11000);

    const bassEnergy = (this.subBass * 0.75 + this.bass * 0.25);
    this.kickPeak = bassEnergy > 0.38 && (bassEnergy - this.prevBass) > 0.05;
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

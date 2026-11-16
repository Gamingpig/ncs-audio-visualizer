/**
 * Audio Engine managing Web Audio API, AnalyserNode, FFT analysis,
 * Local file playback, Microphone stream, Screen / System Audio Capture (getDisplayMedia),
 * and Trap Demo synthesizer.
 *
 * CRITICAL SAFETY ARCHITECTURE:
 * To eliminate feedback loops, screeching, and deafening echoes when capturing
 * System Audio or Microphone, the AnalyserNode is STRICTLY an analysis sink and
 * is NEVER connected to audioCtx.destination!
 *
 * Audio Routing:
 * - Local File & Demo Beat:
 *     Source -> PlaybackGain -> audioCtx.destination (Audible)
 *     Source -> AnalyserGain -> AnalyserNode (Visualized)
 *
 * - System Audio & Microphone:
 *     Stream -> AnalyserGain -> AnalyserNode (Visualized ONLY)
 *     (NEVER routed to audioCtx.destination to prevent feedback loops!)
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

    // Adjustable sensitivity (visualizer scale) and playback volume
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
      this.audioCtx = new AudioContextClass();

      // Analyser with responsive smoothing
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;

      // Sensitivity Gain Node feeding ONLY into the Analyser
      this.analyserGainNode = this.audioCtx.createGain();
      this.analyserGainNode.gain.value = this.sensitivity;
      this.analyserGainNode.connect(this.analyser);
      // NOTE: this.analyser is NEVER connected to audioCtx.destination!

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
      this.analyserGainNode.gain.setTargetAtTime(this.sensitivity, this.audioCtx.currentTime, 0.05);
    }
  }

  setPlaybackVolume(val) {
    this.playbackVolume = Math.max(0.0, Math.min(1.0, val));
    if (this.playbackGainNode && this.audioCtx) {
      this.playbackGainNode.gain.setTargetAtTime(this.playbackVolume, this.audioCtx.currentTime, 0.05);
    }
  }

  disconnectCurrent() {
    // 1. Disconnect any active media stream or file source
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        console.warn("Fehler beim Trennen von sourceNode:", e);
      }
      this.sourceNode = null;
    }

    // 2. Stop all live media stream tracks (Screen / Tab / Mic)
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

    // 3. Stop audio element
    if (this.audioElement) {
      this.audioElement.pause();
    }

    // 4. Clear demo synthesizer interval
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }

    this.isPlaying = false;
    this.currentMode = null;
  }

  /**
   * Input 1: System Audio / Screen Audio Capture (getDisplayMedia)
   * SAFE & FEEDBACK-FREE:
   * The stream is routed ONLY into analyserGainNode -> analyser.
   * It is NEVER sent to audioCtx.destination, preventing any loopback into speakers!
   */
  async startSystemAudio() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    try {
      // Configuration preventing tab echo and requesting pure system/tab audio
      const constraints = {
        video: {
          displaySurface: "browser",
          selfBrowserSurface: "exclude" // Prevents picking current visualizer tab to avoid echo
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
        // Fallback for older browsers that may reject advanced constraints
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

      // Stop unused video track immediately to save GPU and CPU
      stream.getVideoTracks().forEach(vt => vt.stop());

      this.activeStream = stream;

      // Clean line-level gain (1.0) multiplied by user sensitivity.
      // NEVER set high gains like 1.6+ which cause digital clipping on 0dBFS tracks!
      this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 1.0, this.audioCtx.currentTime);

      // Create stream source for audio analysis only
      const audioStream = new MediaStream([audioTracks[0]]);
      this.sourceNode = this.audioCtx.createMediaStreamSource(audioStream);

      // Connect ONLY to analyserGainNode -> AnalyserNode.
      // DO NOT connect to playbackGainNode or destination!
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
          artist: "Visualisiert Desktop, Spotify, YouTube & Games",
          cover: null
        });
      }
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.info("Benutzer hat die System-Audio-Freigabe abgebrochen.");
        return false;
      }
      if (err.message === "NO_AUDIO_TRACK") {
        alert("Keine Audio-Spur ausgewählt! Bitte aktiviere im Browser-Fenster das Häkchen bei 'Audio der Registerkarte teilen' bzw. 'System-Audio teilen'.");
        return false;
      }
      console.error("System-Audio Capture fehlgeschlagen:", err);
      alert("System-Audio konnte nicht gestartet werden: " + err.message);
      return false;
    }
  }

  /**
   * Input 2: Microphone with Sensitivity
   * Routed ONLY to AnalyserNode, never to destination!
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

      // Microphone signals are generally lower amplitude, boost slightly
      this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 2.2, this.audioCtx.currentTime);

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.activeStream);
      // CONNECT ONLY TO ANALYSER! NEVER TO DESTINATION!
      this.sourceNode.connect(this.analyserGainNode);

      this.isPlaying = true;
      this.currentMode = 'mic';

      if (this.onTrackChange) {
        this.onTrackChange({
          title: "Live Mikrofon Input",
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
   * Input 3: Local Audio File (MP3, WAV, FLAC, OGG)
   * Routed to BOTH playbackGainNode -> destination (Hear)
   * AND analyserGainNode -> analyser (Visualize)
   */
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

    // Reset visualizer sensitivity
    this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 1.0, this.audioCtx.currentTime);

    // Safe dual routing:
    this.sourceNode.connect(this.analyserGainNode); // To visualizer
    this.sourceNode.connect(this.playbackGainNode); // To speakers

    this.audioElement.play().catch(e => console.warn("Autoplay block:", e));
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
   * Input 4: Trap Demo Beat Synthesizer (140 BPM Sub-808, Snare, Hi-Hat Rolls)
   * Dual routed to playback and analyser cleanly.
   */
  startDemoBeat() {
    this.ensureAudioContext();
    this.disconnectCurrent();

    this.isPlaying = true;
    this.currentMode = 'demo';

    const synthMasterGain = this.audioCtx.createGain();
    synthMasterGain.gain.value = 0.85;

    // Dual route synth:
    synthMasterGain.connect(this.analyserGainNode); // Visualizer
    synthMasterGain.connect(this.playbackGainNode); // Speakers

    if (this.onTrackChange) {
      this.onTrackChange({
        title: "NCS Trap Anthem (Synthesizer Demo)",
        artist: "140 BPM Sub-808 Trap Beat",
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
      gain.connect(synthMasterGain);
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
      gain.gain.setValueAtTime(isRolled ? 0.18 : 0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + (isRolled ? 0.025 : 0.045));

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);
      whiteNoise.start(time);
    };

    const playSnare = (time) => {
      const osc = this.audioCtx.createOscillator();
      const oscGain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, time);
      osc.frequency.exponentialRampToValueAtTime(85, time + 0.1);
      oscGain.gain.setValueAtTime(0.65, time);
      oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.13);
      osc.connect(oscGain);
      oscGain.connect(synthMasterGain);
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
      noiseGain.gain.setValueAtTime(0.5, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(synthMasterGain);
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

      gain.gain.setValueAtTime(0.14, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);
      osc.start(time);
      osc.stop(time + 0.22);
    };

    const melodyNotes = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25, 622.25];

    let nextNoteTime = this.audioCtx.currentTime + 0.05;
    this.demoInterval = setInterval(() => {
      while (nextNoteTime < this.audioCtx.currentTime + 0.1) {
        const beatStep = step % 16;

        // Kick pattern
        if (beatStep === 0 || beatStep === 6 || beatStep === 10) {
          playSubKick(nextNoteTime);
        }

        // Snare
        if (beatStep === 4 || beatStep === 12) {
          playSnare(nextNoteTime);
        }

        // Hi-Hats
        if (beatStep >= 14) {
          playHiHat(nextNoteTime, true);
        } else {
          playHiHat(nextNoteTime, false);
        }

        // Leads
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
      return count > 0 ? (sum / count / 255) : 0;
    };

    // Subbass (Trap circle punch: ~30-95Hz)
    this.subBass = getAverageRange(30, 95);
    this.bass = getAverageRange(95, 260);
    this.mid = getAverageRange(260, 2800);
    this.treble = getAverageRange(2800, 11000);

    // Kick Peak Detection with hysteresis
    const bassEnergy = (this.subBass * 0.7 + this.bass * 0.3);
    const threshold = 0.42;
    this.kickPeak = bassEnergy > threshold && (bassEnergy - this.prevBass) > 0.05;
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

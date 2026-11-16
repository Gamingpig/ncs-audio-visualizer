/**
 * Audio Engine managing Web Audio API, AnalyserNode, FFT analysis,
 * Local file playback, Microphone stream, Screen / System Audio Capture (getDisplayMedia),
 * and Progressive House / EDM Demo synthesizer.
 *
 * CRITICAL SAFETY ARCHITECTURE:
 * AnalyserNode is STRICTLY an analysis sink and is NEVER connected to audioCtx.destination!
 * System Audio and Microphone are NEVER routed to speakers, preventing all feedback loops.
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
      this.audioCtx = new AudioContextClass();

      // Analyser with responsive smoothing
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.82;

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
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        console.warn("Fehler beim Trennen von sourceNode:", e);
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
   * Input 1: System Audio / Screen Audio Capture (getDisplayMedia)
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
   * Input 2: Microphone with Sensitivity
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

      this.analyserGainNode.gain.setValueAtTime(this.sensitivity * 2.2, this.audioCtx.currentTime);
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
   * Input 4: Progressive House / Melodic EDM Synthesizer (128 BPM Sky High Style)
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
        title: "Sky High Anthem (128 BPM Progressive House)",
        artist: "Elektronomia Style Melodic Synthesizer",
        cover: null
      });
    }

    let step = 0;
    const bpm = 128; // Progressive House standard
    const stepTime = (60 / bpm) / 4; // 16th notes

    // 1. Punchy Progressive House Kick
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

    // 2. Offbeat Hi-Hat (Progressive House groove)
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

    // 3. Crisp Snare / Clap on 2 & 4
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

    // 4. Rolling Electro Bassline
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

    // 5. Sky High Euphoric Lead Melody
    const playEuphoricLead = (time, freq) => {
      const osc = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      // Slight detune for super-saw width
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 1.006, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, time);
      filter.frequency.exponentialRampToValueAtTime(1400, time + 0.25);

      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.26);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(synthMasterGain);

      osc.start(time);
      osc2.start(time);
      osc.stop(time + 0.26);
      osc2.stop(time + 0.26);
    };

    // Progressive House Sky High Melody in D# minor / F# Major
    // D#4=311.13, F#4=369.99, G#4=415.30, A#4=466.16, C#5=554.37, D#5=622.25
    const melodyPattern = [
      466.16, 554.37, 622.25, 466.16,
      554.37, 622.25, 466.16, 415.30,
      369.99, 415.30, 466.16, 369.99,
      415.30, 466.16, 554.37, 622.25
    ];

    const bassNotes = [155.56, 155.56, 185.00, 185.00, 138.59, 138.59, 207.65, 207.65];

    let nextNoteTime = this.audioCtx.currentTime + 0.05;
    this.demoInterval = setInterval(() => {
      while (nextNoteTime < this.audioCtx.currentTime + 0.1) {
        const beatStep = step % 16;

        // 4-on-the-floor House Kick: on steps 0, 4, 8, 12
        if (beatStep % 4 === 0) {
          playHouseKick(nextNoteTime);
        }

        // Offbeat Hi-hat: on steps 2, 6, 10, 14
        if (beatStep % 4 === 2) {
          playOpenHat(nextNoteTime);
        }

        // Snare / Clap: on steps 4, 12
        if (beatStep === 4 || beatStep === 12) {
          playClap(nextNoteTime);
        }

        // Rolling Bass
        const bassFreq = bassNotes[(step >> 2) % bassNotes.length];
        playBassNote(nextNoteTime, bassFreq);

        // Euphoric Progressive Lead Melody
        const leadFreq = melodyPattern[step % melodyPattern.length];
        playEuphoricLead(nextNoteTime, leadFreq);

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

    // Subbass (House 4-on-the-floor punch: 35-95Hz)
    this.subBass = getAverageRange(35, 95);
    this.bass = getAverageRange(95, 260);
    this.mid = getAverageRange(260, 3000);
    this.treble = getAverageRange(3000, 12000);

    // House Kick detection
    const bassEnergy = (this.subBass * 0.75 + this.bass * 0.25);
    const threshold = 0.40;
    this.kickPeak = bassEnergy > threshold && (bassEnergy - this.prevBass) > 0.055;
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

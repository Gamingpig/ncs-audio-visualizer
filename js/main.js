import { AudioEngine } from './audio.js';
import { NCSVisualizer } from './visualizer.js';
import { SpotifyAuth } from './spotify.js';
import { extractMetadata } from './id3.js';

// DOM Elements
const canvas = document.getElementById('visualizerCanvas');
const systemAudioBtn = document.getElementById('systemAudioBtn');
const systemAudioLabel = document.getElementById('systemAudioLabel');
const audioFileInput = document.getElementById('audioFileInput');
const coverFileInput = document.getElementById('coverFileInput');
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const demoBtn = document.getElementById('demoBtn');
const spotifyBtn = document.getElementById('spotifyBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const dropOverlay = document.getElementById('dropOverlay');

// Sliders
const sensitivitySlider = document.getElementById('sensitivitySlider');
const volumeSlider = document.getElementById('volumeSlider');

// File Player Mini Bar
const filePlayerBar = document.getElementById('filePlayerBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const currentTimeLabel = document.getElementById('currentTime');
const totalDurationLabel = document.getElementById('totalDuration');
const seekSlider = document.getElementById('seekSlider');

// Toast Notification
const toastMessage = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');
let toastTimeout = null;

function showToast(text, duration = 4000) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastText.textContent = text;
  toastMessage.classList.remove('hidden');
  toastTimeout = setTimeout(() => {
    toastMessage.classList.add('hidden');
  }, duration);
}

// Spotify Modal
const spotifyModal = document.getElementById('spotifyModal');
const spotifyClientIdInput = document.getElementById('spotifyClientIdInput');
const spotifyRedirectUriDisplay = document.getElementById('spotifyRedirectUriDisplay');
const spotifyConnectSubmit = document.getElementById('spotifyConnectSubmit');
const spotifyModalClose = document.getElementById('spotifyModalClose');

// Initialize Engines
const audioEngine = new AudioEngine();
const visualizer = new NCSVisualizer(canvas);

// Spotify PKCE Handler
const spotify = new SpotifyAuth((meta) => {
  trackTitle.textContent = meta.title;
  trackArtist.textContent = meta.artist;
  if (meta.cover) {
    visualizer.setCoverArt(meta.cover);
  }
});

// Audio Engine track update callback
audioEngine.onTrackChange = (meta) => {
  trackTitle.textContent = meta.title;
  trackArtist.textContent = meta.artist;
  if (meta.cover) {
    visualizer.setCoverArt(meta.cover);
  } else {
    visualizer.setDefaultLogo();
  }
};

// Format seconds into m:ss
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// File playback time updates
audioEngine.onTimeUpdate = (curr, total) => {
  currentTimeLabel.textContent = formatTime(curr);
  totalDurationLabel.textContent = formatTime(total);
  if (total > 0 && !seekSlider.matches(':active')) {
    seekSlider.value = (curr / total) * 100;
  }
};

audioEngine.onEnded = () => {
  playIcon.classList.remove('hidden');
  pauseIcon.classList.add('hidden');
};

// Play/Pause button
playPauseBtn.addEventListener('click', () => {
  const isPlaying = audioEngine.togglePlayPause();
  if (isPlaying) {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  }
});

// Seeking
seekSlider.addEventListener('input', () => {
  const duration = audioEngine.audioElement.duration;
  if (duration) {
    const targetTime = (seekSlider.value / 100) * duration;
    audioEngine.seek(targetTime);
    currentTimeLabel.textContent = formatTime(targetTime);
  }
});

// Sensitivity slider
sensitivitySlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  audioEngine.setSensitivity(val);
});

// Playback volume slider
volumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  audioEngine.setPlaybackVolume(val);
});

// Animation Loop (60 / 120 FPS requestAnimationFrame)
function animate() {
  requestAnimationFrame(animate);
  const metrics = audioEngine.update();
  visualizer.render(metrics);
}
requestAnimationFrame(animate);

// Reset UI toggle buttons
function resetActiveButtons() {
  systemAudioBtn.classList.remove('active');
  systemAudioLabel.textContent = "System-Audio";
  micBtn.classList.remove('active');
  micLabel.textContent = "Mikrofon";
  demoBtn.classList.remove('active');
  filePlayerBar.classList.add('hidden');
}

// 1. System Audio Capture (getDisplayMedia)
systemAudioBtn.addEventListener('click', async () => {
  if (audioEngine.currentMode === 'system') {
    audioEngine.disconnectCurrent();
    resetActiveButtons();
    trackTitle.textContent = "Gestoppt";
    trackArtist.textContent = "Kein Audio aktiv";
    showToast("System-Audio getrennt.");
  } else {
    resetActiveButtons();
    const success = await audioEngine.startSystemAudio();
    if (success) {
      systemAudioBtn.classList.add('active');
      systemAudioLabel.textContent = "Streamt Live";
      showToast("System-Audio aktiv: Rückkopplungsfrei visualisiert!");
    }
  }
});

// Helper: Process local audio file with ID3 metadata extraction
async function loadAudioFile(file) {
  showToast("Lade Audio-Datei...");
  const meta = await extractMetadata(file);
  audioEngine.playLocalFile(file, meta);
  resetActiveButtons();
  filePlayerBar.classList.remove('hidden');
  playIcon.classList.add('hidden');
  pauseIcon.classList.remove('hidden');
  if (meta.cover) {
    visualizer.setCoverArt(meta.cover);
  }
  showToast(`Titel: ${meta.title}`);
}

// 2. Local File Input Handler
audioFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    loadAudioFile(file);
  }
});

// Custom Cover Image Input
coverFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    visualizer.setCoverArt(url);
    showToast("Cover-Bild erfolgreich gesetzt!");
  }
});

// 3. Microphone / Live Room Audio Input
micBtn.addEventListener('click', async () => {
  if (audioEngine.currentMode === 'mic') {
    audioEngine.disconnectCurrent();
    resetActiveButtons();
    trackTitle.textContent = "Gestoppt";
    trackArtist.textContent = "Kein Audio aktiv";
    showToast("Mikrofon getrennt.");
  } else {
    resetActiveButtons();
    const success = await audioEngine.startMicrophone();
    if (success) {
      micBtn.classList.add('active');
      micLabel.textContent = "Aktiv";
      showToast("Mikrofon aktiv: Visualisiert Raumklang.");
    }
  }
});

// 4. Progressive House Demo Beat Loop (Elektronomia Sky High 128 BPM Style)
demoBtn.addEventListener('click', () => {
  if (audioEngine.currentMode === 'demo') {
    audioEngine.disconnectCurrent();
    resetActiveButtons();
    trackTitle.textContent = "Gestoppt";
    trackArtist.textContent = "Kein Audio aktiv";
    showToast("House Demo gestoppt.");
  } else {
    resetActiveButtons();
    demoBtn.classList.add('active');
    audioEngine.startDemoBeat();
    showToast("Sky High Progressive House Demo gestartet (128 BPM)!");
  }
});

// 5. Spotify Modal & PKCE Connect
spotifyRedirectUriDisplay.textContent = spotify.redirectUri;
if (spotify.clientId) {
  spotifyClientIdInput.value = spotify.clientId;
}

spotifyBtn.addEventListener('click', () => {
  if (spotify.accessToken) {
    showToast("Spotify ist bereits autorisiert!");
    spotify.fetchCurrentlyPlaying();
  } else {
    spotifyModal.classList.remove('hidden');
  }
});

spotifyModalClose.addEventListener('click', () => {
  spotifyModal.classList.add('hidden');
});

spotifyConnectSubmit.addEventListener('click', () => {
  const id = spotifyClientIdInput.value.trim();
  if (id) {
    spotify.authorize(id);
  }
});

// 6. Drag and Drop Audio & Image Files
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('active');
});

window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) {
    dropOverlay.classList.remove('active');
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('active');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('audio/')) {
      loadAudioFile(file);
    } else if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      visualizer.setCoverArt(url);
      showToast("Cover-Bild übernommen!");
    }
  }
});

// 7. Fullscreen toggle
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn("Fullscreen request failed:", err);
    });
  } else {
    document.exitFullscreen();
  }
});

// 8. Theme / Color Dots
document.querySelectorAll('.color-dot').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const color = btn.dataset.color;
    const glow = btn.dataset.glow;
    visualizer.setTheme(color, glow);
    document.documentElement.style.setProperty('--primary-color', color);
    document.documentElement.style.setProperty('--glow-color', glow);
  });
});

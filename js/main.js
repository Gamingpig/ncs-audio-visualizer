import { AudioEngine } from './audio.js';
import { NCSVisualizer } from './visualizer.js';
import { SpotifyAuth } from './spotify.js';

// DOM Elements
const canvas = document.getElementById('visualizerCanvas');
const systemAudioBtn = document.getElementById('systemAudioBtn');
const systemAudioLabel = document.getElementById('systemAudioLabel');
const audioFileInput = document.getElementById('audioFileInput');
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const demoBtn = document.getElementById('demoBtn');
const spotifyBtn = document.getElementById('spotifyBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const dropOverlay = document.getElementById('dropOverlay');

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
}

// 1. System Audio Capture (getDisplayMedia)
systemAudioBtn.addEventListener('click', async () => {
  if (audioEngine.currentMode === 'system') {
    audioEngine.disconnectCurrent();
    resetActiveButtons();
    trackTitle.textContent = "Gestoppt";
    trackArtist.textContent = "Kein Audio aktiv";
  } else {
    const success = await audioEngine.startSystemAudio();
    if (success) {
      resetActiveButtons();
      systemAudioBtn.classList.add('active');
      systemAudioLabel.textContent = "Streamt Live";
    }
  }
});

// 2. Local File Input Handler
audioFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    audioEngine.playLocalFile(file);
    resetActiveButtons();
  }
});

// 3. Microphone / Live Room Audio Input
micBtn.addEventListener('click', async () => {
  if (audioEngine.currentMode === 'mic') {
    audioEngine.disconnectCurrent();
    resetActiveButtons();
    trackTitle.textContent = "Gestoppt";
    trackArtist.textContent = "Kein Audio aktiv";
  } else {
    const success = await audioEngine.startMicrophone();
    if (success) {
      resetActiveButtons();
      micBtn.classList.add('active');
      micLabel.textContent = "Aktiv";
    }
  }
});

// 4. Trap Beat Demo Loop
demoBtn.addEventListener('click', () => {
  if (audioEngine.currentMode === 'demo') {
    audioEngine.disconnectCurrent();
    resetActiveButtons();
    trackTitle.textContent = "Gestoppt";
    trackArtist.textContent = "Kein Audio aktiv";
  } else {
    resetActiveButtons();
    demoBtn.classList.add('active');
    audioEngine.startDemoBeat();
  }
});

// 5. Spotify Modal & PKCE Connect
spotifyRedirectUriDisplay.textContent = spotify.redirectUri;
if (spotify.clientId) {
  spotifyClientIdInput.value = spotify.clientId;
}

spotifyBtn.addEventListener('click', () => {
  if (spotify.accessToken) {
    alert("Spotify ist bereits autorisiert! Spielt aktuell Tracks im Hintergrund.");
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

// 6. Drag and Drop Audio Files
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
  if (files.length > 0 && files[0].type.startsWith('audio/')) {
    audioEngine.playLocalFile(files[0]);
    resetActiveButtons();
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

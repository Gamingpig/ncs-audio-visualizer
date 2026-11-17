import { AudioEngine } from './audio.js?v=3.0';
import { NCSVisualizer } from './visualizer.js?v=3.0';
import { SpotifyAuth } from './spotify.js?v=3.0';
import { extractMetadata } from './id3.js?v=3.0';

// DOM Elements
const canvas = document.getElementById('visualizerCanvas');
const systemAudioBtn = document.getElementById('systemAudioBtn');
const systemAudioLabel = document.getElementById('systemAudioLabel');
const audioFileInput = document.getElementById('audioFileInput');
const coverFileInput = document.getElementById('coverFileInput');
const bgFileInput = document.getElementById('bgFileInput');
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
  if (meta) {
    trackTitle.textContent = meta.title;
    trackArtist.textContent = meta.artist;
    if (meta.cover) {
      visualizer.setCoverArt(meta.cover);
    }
  }
});

// Audio Engine track update callback
audioEngine.onTrackChange = (meta) => {
  // If Spotify is currently playing and active in system audio mode, prefer Spotify's rich metadata!
  if (spotify.currentTrack && audioEngine.currentMode === 'system') {
    trackTitle.textContent = spotify.currentTrack.title;
    trackArtist.textContent = spotify.currentTrack.artist;
    if (spotify.currentTrack.cover) {
      visualizer.setCoverArt(spotify.currentTrack.cover);
    }
    return;
  }

  trackTitle.textContent = meta.title;
  trackArtist.textContent = meta.artist;
  if (meta.cover) {
    if (typeof visualizer.setCoverArt === 'function') visualizer.setCoverArt(meta.cover);
  } else {
    if (typeof visualizer.setDefaultLogo === 'function') visualizer.setDefaultLogo();
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

      // If Spotify is authorized, check immediately for the track
      if (spotify.accessToken) {
        spotify.fetchCurrentlyPlaying(true).then(track => {
          if (track) {
            trackTitle.textContent = track.title;
            trackArtist.textContent = track.artist;
            if (track.cover) visualizer.setCoverArt(track.cover);
          }
        });
      }
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
if (coverFileInput) {
  coverFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      visualizer.setCoverArt(url);
      showToast("Cover-Bild erfolgreich gesetzt!");
    }
  });
}

// Custom Background Image Input
if (bgFileInput) {
  bgFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      visualizer.setBackgroundArt(url);
      showToast("Hintergrund-Bild gesetzt!");
    }
  });
}

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

// 5. Spotify Sync & Modal
spotifyRedirectUriDisplay.textContent = spotify.redirectUri;
if (spotify.clientId) {
  spotifyClientIdInput.value = spotify.clientId;
}

spotifyBtn.addEventListener('click', async () => {
  if (spotify.accessToken) {
    showToast("Prüfe aktuellen Spotify-Track...");
    const track = await spotify.fetchCurrentlyPlaying(true);
    if (track) {
      trackTitle.textContent = track.title;
      trackArtist.textContent = track.artist;
      if (track.cover) {
        visualizer.setCoverArt(track.cover);
      }
      showToast(`Spotify: "${track.title}" von ${track.artist}`);
    } else {
      showToast("Spotify ist verbunden, aber kein Song aktiv. Bitte drücke Play in deiner Spotify-App!");
    }
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
      // If user drops an image: if wide landscape, set background; if square/near-square, set cover!
      const testImg = new Image();
      testImg.src = url;
      testImg.onload = () => {
        const aspect = testImg.width / testImg.height;
        if (aspect > 1.3) {
          visualizer.setBackgroundArt(url);
          showToast("Hintergrund-Bild übernommen!");
        } else {
          visualizer.setCoverArt(url);
          showToast("Cover-Bild übernommen!");
        }
      };
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

// 9. NCS Logo Visibility Toggle
const logoToggleBtn = document.getElementById('logoToggleBtn');
const heroLogoBox = document.getElementById('heroLogoBox');
if (logoToggleBtn && heroLogoBox) {
  logoToggleBtn.addEventListener('click', () => {
    heroLogoBox.classList.toggle('hidden');
    const isHidden = heroLogoBox.classList.contains('hidden');
    logoToggleBtn.classList.toggle('active', !isHidden);
    showToast(isHidden ? "NCS Logo ausgeblendet (Player Modus)" : "NCS Video Logo eingeblendet (1:1 Video Modus)");
  });
}

// 10. Cinema Auto-Hide Mode (Hides UI after 3.5s of inactivity like a YouTube video)
const topBar = document.getElementById('topBar');
const controlsBar = document.getElementById('controlsBar');
let uiHideTimer = null;

function wakeUI() {
  if (topBar) topBar.classList.remove('ui-faded');
  if (controlsBar) controlsBar.classList.remove('ui-faded');
  if (filePlayerBar) filePlayerBar.classList.remove('ui-faded');

  clearTimeout(uiHideTimer);
  uiHideTimer = setTimeout(() => {
    const modalOpen = !document.getElementById('spotifyModal')?.classList.contains('hidden');
    if (!modalOpen) {
      if (topBar) topBar.classList.add('ui-faded');
      if (controlsBar) controlsBar.classList.add('ui-faded');
      if (filePlayerBar) filePlayerBar.classList.add('ui-faded');
    }
  }, 4000);
}

window.addEventListener('mousemove', wakeUI);
window.addEventListener('mousedown', wakeUI);
window.addEventListener('keydown', wakeUI);
window.addEventListener('touchstart', wakeUI);
wakeUI();

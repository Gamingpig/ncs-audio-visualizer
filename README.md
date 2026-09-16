# NCS WebGL Audio Visualizer 🎵⚡

Ein hochperformanter, reaktiver WebGL/Canvas2D Audio-Visualizer im ikonischen Style des originalen **NoCopyrightSounds (NCS)** Trap-Kreises.

Live Demo: [GitHub Pages Deployment](https://gamingpig.github.io/ncs-audio-visualizer/)

---

## ✨ Features

- **Zentraler pulsierender Kreis:** 
  - Dynamisches Pumpen synchron zur Subbass-Energie (~30–120 Hz).
  - Maskiertes kreisrundes Albumcover mit innerem Schatten und leuchtendem Border.
- **Radial Frequency Spectrum:**
  - Glatte B-Spline / Bézier-Kurveninterpolation der Frequenzstacheln.
  - NCS-Neongrün (`#00ff44` / `#00e5ff`) mit Mehrfach-Glow.
  - Farbwähler für alternative Farbthemen (Crimson, Cyber Purple, Electric Gold).
- **Bass-Partikel-Explosion:**
  - Schwebende Lichtpartikel im Hintergrund.
  - Dynamischer Ausstoß bei harten Kickbass-Peaks inklusive Trägheitsdämpfung und Verblassen.
- **Audio-Quellen:**
  1. **Lokale Audio-Dateien:** File-Picker und Drag & Drop für MP3, WAV, OGG, FLAC.
  2. **Live Mikrofon / Stereo Mix:** Direkte System- oder Raum-Audioanalyse via `navigator.mediaDevices.getUserMedia`.
  3. **Integrierter Trap Demo Beat:** 140 BPM Trap-Synthesizer mit Sub 808 Bass, Snare & Trap Hi-Hat Rolls zum direkten Testen ohne Datei.
  4. **Spotify Web API (PKCE OAuth 2.0):** Vollständig client-seitiger Login ohne Backend. Synchronisiert aktuell gespielten Track, Artist und hochauflösendes Album-Coverart.
- **Performance:**
  - 60 / 120 FPS Rendering über `requestAnimationFrame` mit dynamischer DevicePixelRatio-Anpassung.
  - Fullscreen-Modus für Präsentationen und Musik-Streams.
  - Vollständig statisch ohne schwere Frameworks.

---

## 🚀 Lokale Nutzung

Da es sich um reines statisches HTML/CSS/ES6 handelt, kann das Repository einfach über einen lokalen Webserver gestartet werden:

```bash
# Mit Python:
python3 -m http.server 8080

# Oder mit Node:
npx serve .
```

Öffne anschließend `http://localhost:8080` im Browser.

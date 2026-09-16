/**
 * Spotify Web API integration using PKCE OAuth 2.0 Authorization Code Flow.
 * No server backend required. Syncs current track, artist, album art, and audio analysis.
 */
export class SpotifyAuth {
  constructor(onTrackUpdate) {
    this.clientId = localStorage.getItem("spotify_client_id") || "";
    this.redirectUri = window.location.origin + window.location.pathname;
    this.accessToken = localStorage.getItem("spotify_access_token") || null;
    this.refreshToken = localStorage.getItem("spotify_refresh_token") || null;
    this.tokenExpiry = parseInt(localStorage.getItem("spotify_token_expiry") || "0", 10);
    this.onTrackUpdate = onTrackUpdate;
    this.pollingInterval = null;
    this.lastTrackId = null;

    // Handle OAuth callback on redirect
    this.handleCallback();
  }

  // Generate cryptographic code verifier
  generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
  }

  // SHA-256 base64url hashing
  async generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  async authorize(clientId) {
    if (!clientId) {
      alert("Bitte gib eine gültige Spotify Client-ID an.");
      return;
    }
    this.clientId = clientId;
    localStorage.setItem("spotify_client_id", clientId);

    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    window.localStorage.setItem('spotify_code_verifier', codeVerifier);

    const scope = 'user-read-currently-playing user-read-playback-state';
    const authUrl = new URL("https://accounts.spotify.com/authorize");

    const params = {
      response_type: 'code',
      client_id: this.clientId,
      scope: scope,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: this.redirectUri,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
  }

  async handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      // Remove code from address bar cleanly
      window.history.replaceState({}, document.title, window.location.pathname);

      const codeVerifier = localStorage.getItem('spotify_code_verifier');
      if (!codeVerifier) {
        console.warn("No code verifier found in storage");
        return;
      }

      const body = new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      });

      try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body
        });

        if (!response.ok) {
          throw new Error('Token request failed: ' + response.statusText);
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);

        localStorage.setItem('spotify_access_token', this.accessToken);
        if (this.refreshToken) {
          localStorage.setItem('spotify_refresh_token', this.refreshToken);
        }
        localStorage.setItem('spotify_token_expiry', this.tokenExpiry.toString());

        this.startPolling();
      } catch (err) {
        console.error("Spotify Auth Error:", err);
      }
    } else if (this.accessToken && Date.now() < this.tokenExpiry) {
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.fetchCurrentlyPlaying();
    this.pollingInterval = setInterval(() => {
      this.fetchCurrentlyPlaying();
    }, 2500);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchCurrentlyPlaying() {
    if (!this.accessToken) return;

    try {
      const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (res.status === 204 || res.status > 400) {
        return; // Nothing playing or expired
      }

      const data = await res.json();
      if (data && data.item) {
        const item = data.item;
        const trackId = item.id;

        if (trackId !== this.lastTrackId) {
          this.lastTrackId = trackId;
          const title = item.name;
          const artist = item.artists.map(a => a.name).join(', ');
          const cover = item.album.images && item.album.images[0] ? item.album.images[0].url : null;

          if (this.onTrackUpdate) {
            this.onTrackUpdate({
              title,
              artist,
              cover,
              isPlaying: data.is_playing
            });
          }
        }
      }
    } catch (e) {
      console.warn("Spotify fetch error:", e);
    }
  }
}

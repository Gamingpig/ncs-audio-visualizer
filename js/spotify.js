/**
 * Spotify Web API integration using PKCE OAuth 2.0 Authorization Code Flow.
 * Handles automatic token refresh, continuous track polling,
 * and immediate track synchronization.
 */
export class SpotifyAuth {
  constructor(onTrackUpdate) {
    this.clientId = localStorage.getItem("spotify_client_id") || "";
    // Redirect URI must match the current URL exactly without query parameters
    this.redirectUri = window.location.origin + window.location.pathname;
    this.accessToken = localStorage.getItem("spotify_access_token") || null;
    this.refreshToken = localStorage.getItem("spotify_refresh_token") || null;
    this.tokenExpiry = parseInt(localStorage.getItem("spotify_token_expiry") || "0", 10);
    this.onTrackUpdate = onTrackUpdate;
    this.pollingInterval = null;
    this.lastTrackId = null;
    this.currentTrack = null;

    // Handle OAuth callback on redirect
    this.handleCallback().then(() => {
      this.initAuth();
    });
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
      // Clean up URL bar
      window.history.replaceState({}, document.title, window.location.pathname);

      const codeVerifier = localStorage.getItem('spotify_code_verifier');
      if (!codeVerifier) {
        console.warn("Kein code_verifier im Storage gefunden.");
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
      } catch (err) {
        console.error("Spotify Auth Error:", err);
      }
    }
  }

  async initAuth() {
    if (!this.accessToken) return;

    // Check if token is expired or close to expiry (within 60s)
    if (Date.now() >= this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }

    if (this.accessToken) {
      this.startPolling();
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !this.clientId) {
      console.warn("Kann Spotify Token nicht erneuern: Keine Refresh-Token oder Client-ID vorhanden.");
      return false;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.clientId
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
        throw new Error('Refresh failed: ' + response.statusText);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
        localStorage.setItem('spotify_refresh_token', this.refreshToken);
      }
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);

      localStorage.setItem('spotify_access_token', this.accessToken);
      localStorage.setItem('spotify_token_expiry', this.tokenExpiry.toString());
      return true;
    } catch (err) {
      console.error("Spotify Token Refresh Error:", err);
      return false;
    }
  }

  startPolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.fetchCurrentlyPlaying(true);
    this.pollingInterval = setInterval(() => {
      this.fetchCurrentlyPlaying(false);
    }, 2000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchCurrentlyPlaying(forceUpdate = false) {
    if (!this.accessToken) return null;

    // Check if token expired
    if (Date.now() >= this.tokenExpiry - 30000) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) return null;
    }

    try {
      const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      // 401 Unauthorized -> Token expired, refresh immediately
      if (res.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.fetchCurrentlyPlaying(forceUpdate);
        }
        return null;
      }

      // 204 No Content -> Nothing currently playing on Spotify
      if (res.status === 204) {
        return null;
      }

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (data && data.item) {
        const item = data.item;
        const trackId = item.id;
        const title = item.name;
        const artist = item.artists.map(a => a.name).join(', ');
        const cover = item.album.images && item.album.images[0] ? item.album.images[0].url : null;

        this.currentTrack = {
          title,
          artist,
          cover,
          isPlaying: data.is_playing
        };

        if (forceUpdate || trackId !== this.lastTrackId) {
          this.lastTrackId = trackId;
          if (this.onTrackUpdate) {
            this.onTrackUpdate(this.currentTrack);
          }
        }
        return this.currentTrack;
      }
    } catch (e) {
      console.warn("Spotify fetchCurrentlyPlaying error:", e);
    }
    return null;
  }
}

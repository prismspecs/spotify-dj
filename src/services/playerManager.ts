import { Track, DeckState, CrossfadeCurve } from '../types';
import { calculateGains } from '../utils/audioMath';
import { createLatestThrottle } from '../utils/throttle';
import { triggerPlayback } from './spotifyApi';
import { getValidToken, refreshSpotifyToken, getGrantedScopes } from './spotifyAuth';
import { loadYouTubeApi, describeYouTubeError } from './youtube';

// YouTube IFrame player states
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_CUED = 5;

// Extend window for Spotify Web Playback SDK
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    __spotifySdkReadyCallbacks?: (() => void)[];
    __spotifySdkLoaded?: boolean;
    Spotify?: any;
  }
}

type DeckId = 'A' | 'B';

export type PlayerStateCallback = (deck: DeckId, state: Partial<DeckState>) => void;

// How often volume changes are sent to each Spotify player while a fader moves.
const VOLUME_UPDATE_MS = 50;
// How long to wait for a deck's browser player to register with Spotify.
const DEVICE_WAIT_MS = 10_000;

const deckLabel = (deckId: DeckId) => (deckId === 'A' ? '01' : '02');

/**
 * True if the browser can't reach Spotify's server lookup, which the player
 * needs before it can connect. That endpoint allows any origin, so a network
 * error here means something in the browser (an extension) blocked it.
 */
async function isSpotifyPlayerBlocked(): Promise<boolean> {
  try {
    await fetch('https://apresolve.spotify.com/?type=dealer&type=spclient');
    return false;
  } catch {
    return true;
  }
}

function initialDeckState(deckId: DeckId): DeckState {
  return {
    deckId,
    isReady: false,
    isPlaying: false,
    currentTrack: null,
    position_ms: 0,
    duration_ms: 0,
    deckVolume: 1.0,
    effectiveVolume: 0.707,
    user: null,
    deviceId: null,
    token: null,
    status: 'IDLE',
    errorMessage: null
  };
}

class PlayerManager {
  private players: Record<DeckId, any | null> = { A: null, B: null };
  // Spotify user id each player was created for, so a relinked deck gets a fresh player.
  private playerOwners: Record<DeckId, string | null> = { A: null, B: null };
  private connectPromises: Partial<Record<DeckId, Promise<boolean>>> = {};
  private deviceIds: Record<DeckId, string | null> = { A: null, B: null };
  // URIs of the track the Spotify player currently holds (incl. relinked versions).
  private loadedUris: Record<DeckId, string[]> = { A: [], B: [] };

  // YouTube: one embedded player per deck, created on first use. Each lives in a
  // persistent container that the Deck component shows while the deck plays YouTube.
  private ytPlayers: Record<DeckId, any | null> = { A: null, B: null };
  private ytReady: Partial<Record<DeckId, Promise<any>>> = {};
  private ytContainers: Partial<Record<DeckId, HTMLDivElement>> = {};
  private ytStates: Record<DeckId, number> = { A: -1, B: -1 };

  private deckStates: Record<DeckId, DeckState> = { A: initialDeckState('A'), B: initialDeckState('B') };

  private crossfadePosition = 0.5; // Center default
  private crossfadeCurve: CrossfadeCurve = 'constant-power';
  private crossfadeTimer: number | null = null;
  private crossfadeDone: (() => void) | null = null;

  private stateListeners: Set<PlayerStateCallback> = new Set();
  private positionIntervals: Partial<Record<DeckId, number>> = {};
  private sdkLoadPromise: Promise<void> | null = null;

  private sendVolume: Record<DeckId, (v: number) => void> = {
    A: createLatestThrottle((v: number) => this.setPlayerVolume('A', v), VOLUME_UPDATE_MS),
    B: createLatestThrottle((v: number) => this.setPlayerVolume('B', v), VOLUME_UPDATE_MS)
  };

  constructor() {
    this.recomputeEffectiveVolumes();
  }

  public subscribe(callback: PlayerStateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  public updateDeckState(deckId: DeckId, partial: Partial<DeckState>) {
    this.deckStates[deckId] = {
      ...this.deckStates[deckId],
      ...partial
    };
    this.stateListeners.forEach(cb => cb(deckId, partial));
  }

  public getDeckState(deckId: DeckId): DeckState {
    return this.deckStates[deckId];
  }

  private ensureSdkReady(): Promise<void> {
    if (window.Spotify && window.Spotify.Player) {
      return Promise.resolve();
    }
    if (this.sdkLoadPromise) {
      return this.sdkLoadPromise;
    }

    this.sdkLoadPromise = new Promise((resolve) => {
      if (window.__spotifySdkReadyCallbacks) {
        window.__spotifySdkReadyCallbacks.push(() => {
          if (window.Spotify && window.Spotify.Player) resolve();
        });
      }

      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (prev) {
          try { prev(); } catch (e) { console.warn(e); }
        }
        resolve();
      };

      // Poll as fallback up to 6 seconds
      let elapsed = 0;
      const interval = window.setInterval(() => {
        elapsed += 100;
        if ((window.Spotify && window.Spotify.Player) || elapsed >= 6000) {
          window.clearInterval(interval);
          resolve();
        }
      }, 100);
    });

    return this.sdkLoadPromise;
  }

  /**
   * Creates the Spotify player for a deck, or reuses the one it already has.
   * Pass the Spotify user id when known: a different id means the deck was
   * relinked to another account and gets a fresh player.
   */
  public async initSpotifyPlayer(deckId: DeckId, ownerId: string | null = null): Promise<void> {
    await this.ensureSdkReady();

    if (!window.Spotify || !window.Spotify.Player) {
      this.updateDeckState(deckId, {
        errorMessage: 'SPOTIFY SDK BLOCKED OR NOT LOADED (Check shields/adblocker)',
        status: 'ERROR'
      });
      return;
    }

    // Everything from here to player.connect() runs without awaiting, so two
    // overlapping calls (e.g. React StrictMode's double effect) can't both
    // create a player. Before this fix, each deck could end up with 2-3 live
    // players, and audio could come out of one the faders weren't controlling.
    const existing = this.players[deckId];
    const owner = this.playerOwners[deckId];
    if (existing && (!ownerId || !owner || owner === ownerId)) {
      if (ownerId) this.playerOwners[deckId] = ownerId;
      await this.connectPromises[deckId];
      return;
    }
    if (existing) this.disconnectDeck(deckId);

    this.updateDeckState(deckId, { status: 'CONNECTING', errorMessage: null });
    if (import.meta.env.DEV) void this.probePlayerAuth(deckId);

    const player = new window.Spotify.Player({
      name: `Spotify DJ - Deck ${deckLabel(deckId)}`,
      getOAuthToken: (cb: (t: string) => void) => {
        getValidToken(deckId).then(t => {
          console.log(`[Deck ${deckId}] SDK requested token: ${t ? 'present' : 'MISSING'}; granted scopes: ${getGrantedScopes(deckId) ?? 'unknown (linked before scope logging)'}`);
          cb(t || '');
        });
      },
      volume: this.deckStates[deckId].effectiveVolume
    });
    this.players[deckId] = player;
    this.playerOwners[deckId] = ownerId;

    // Events from a player that has since been replaced are ignored.
    const isCurrent = () => this.players[deckId] === player;
    let retriedAuth = false;

    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      if (!isCurrent()) return;
      console.log(`[Deck ${deckId}] SDK ready with device_id:`, device_id);
      retriedAuth = false;
      this.deviceIds[deckId] = device_id;
      this.updateDeckState(deckId, {
        isReady: true,
        deviceId: device_id,
        status: this.deckStates[deckId].isPlaying ? 'PLAYING' : 'READY',
        errorMessage: null
      });
      // Volume may have changed while connecting.
      this.sendVolume[deckId](this.deckStates[deckId].effectiveVolume);
    });

    player.addListener('not_ready', () => {
      if (!isCurrent()) return;
      console.warn(`[Deck ${deckId}] Player not ready`);
      this.deviceIds[deckId] = null;
      this.updateDeckState(deckId, this.isYouTubeDeck(deckId)
        ? { deviceId: null }
        : { isReady: false, deviceId: null, status: 'CONNECTING' });
    });

    player.addListener('account_error', ({ message }: { message: string }) => {
      if (!isCurrent()) return;
      console.error(`[Deck ${deckId}] Spotify Account Error:`, message);
      this.updateDeckState(deckId, {
        isReady: false,
        status: 'ERROR',
        errorMessage: 'SPOTIFY PREMIUM REQUIRED ON THIS ACCOUNT'
      });
    });

    player.addListener('initialization_error', ({ message }: { message: string }) => {
      if (!isCurrent()) return;
      console.error(`[Deck ${deckId}] Initialization error:`, message);
      this.updateDeckState(deckId, {
        isReady: false,
        status: 'ERROR',
        errorMessage: `SDK INIT ERROR: ${message} (use Google Chrome; it needs Widevine DRM)`
      });
    });

    player.addListener('authentication_error', async ({ message }: { message: string }) => {
      if (!isCurrent()) return;
      console.error(`[Deck ${deckId}] Authentication error:`, message);
      // An expired token kills the player's session. Refresh once and reconnect;
      // the SDK fetches the new token through getOAuthToken.
      const refreshed = retriedAuth ? null : await refreshSpotifyToken(deckId);
      retriedAuth = true;
      if (refreshed && isCurrent()) {
        this.updateDeckState(deckId, { token: refreshed, status: 'CONNECTING', errorMessage: null });
        player.disconnect();
        this.connectPromises[deckId] = player.connect();
      } else {
        // Show Spotify's actual reason. A fresh token being rejected is usually
        // a missing 'streaming' permission or an account not on the app's allowlist.
        // The player reports "Authentication failed" when it can't reach
        // Spotify's servers at all, which is usually an ad/tracker blocker.
        if (await isSpotifyPlayerBlocked()) {
          this.updateDeckState(deckId, {
            isReady: false,
            status: 'ERROR',
            errorMessage: 'A BROWSER EXTENSION IS BLOCKING SPOTIFY (UBLOCK ORIGIN / PRIVACY BADGER?). DISABLE IT FOR 127.0.0.1 AND RELOAD.'
          });
          return;
        }
        const scopes = getGrantedScopes(deckId);
        const scopeHint = scopes && !scopes.includes('streaming') ? ' (TOKEN IS MISSING THE STREAMING PERMISSION: RELINK)' : '';
        this.updateDeckState(deckId, {
          isReady: false,
          status: 'ERROR',
          errorMessage: `SPOTIFY PLAYER REJECTED THE LOGIN: ${message}${scopeHint}`
        });
      }
    });

    player.addListener('playback_error', ({ message }: { message: string }) => {
      if (!isCurrent()) return;
      console.error(`[Deck ${deckId}] Playback error:`, message);
      this.updateDeckState(deckId, { errorMessage: `PLAYBACK ERROR: ${message}` });
    });

    player.addListener('player_state_changed', (sdkState: any) => {
      if (!isCurrent()) return;
      if (this.isYouTubeDeck(deckId)) return; // deck is playing YouTube right now
      if (!sdkState) {
        this.loadedUris[deckId] = [];
        this.updateDeckState(deckId, { isPlaying: false });
        this.trackPositionLoop(deckId, false);
        return;
      }

      const sdkTrack = sdkState.track_window?.current_track;
      this.loadedUris[deckId] = [sdkTrack?.uri, sdkTrack?.linked_from?.uri].filter(Boolean);
      const isPlaying = !sdkState.paused;
      const cued = this.deckStates[deckId].currentTrack;

      // A new track is cued on this deck but not started: keep showing it,
      // not the paused track the Spotify player still holds.
      if (!isPlaying && cued && !this.isLoadedInPlayer(deckId, cued)) {
        this.updateDeckState(deckId, { isPlaying: false });
        this.trackPositionLoop(deckId, false);
        return;
      }

      const trackInfo: Track | null = sdkTrack
        ? {
            id: sdkTrack.id,
            name: sdkTrack.name,
            artists: sdkTrack.artists?.map((a: any) => a.name) || [],
            albumName: sdkTrack.album?.name || '',
            albumArt: sdkTrack.album?.images?.[0]?.url || '',
            duration_ms: sdkTrack.duration_ms,
            uri: sdkTrack.uri
          }
        : null;

      this.updateDeckState(deckId, {
        isPlaying,
        position_ms: sdkState.position,
        duration_ms: sdkState.duration || (trackInfo?.duration_ms ?? 0),
        currentTrack: trackInfo || cued,
        status: isPlaying ? 'PLAYING' : 'PAUSED',
        errorMessage: null
      });

      this.trackPositionLoop(deckId, isPlaying);
    });

    const connecting: Promise<boolean> = player.connect();
    this.connectPromises[deckId] = connecting;
    const success = await connecting;
    if (!success && isCurrent()) {
      console.warn(`[Deck ${deckId}] player.connect() returned false`);
      this.updateDeckState(deckId, {
        errorMessage: 'FAILED TO CONNECT SPOTIFY SDK. CHECK EXTENSIONS / PERMISSIONS.',
        status: 'ERROR'
      });
    }
  }

  /**
   * Dev diagnostic: calls the endpoints the Spotify player checks at login and
   * logs Spotify's responses (never the token).
   */
  private async probePlayerAuth(deckId: DeckId): Promise<void> {
    const token = await getValidToken(deckId);
    if (!token) return;
    const probes = [
      'https://api.spotify.com/v1/melody/v1/check_scope?scope=web-playback',
      'https://api.spotify.com/v1/me/player/devices',
      'https://apresolve.spotify.com/?type=dealer&type=spclient'
    ];
    for (const url of probes) {
      try {
        const res = await fetch(url, url.includes('apresolve') ? {} : { headers: { Authorization: `Bearer ${token}` } });
        const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
        console.log(`[Deck ${deckId}] probe ${new URL(url).pathname}: HTTP ${res.status} ${body}`);
      } catch (e: any) {
        console.log(`[Deck ${deckId}] probe ${new URL(url).pathname}: FETCH FAILED ${e?.message}`);
      }
    }
  }

  /** Disconnects and forgets the deck's Spotify player. */
  public disconnectDeck(deckId: DeckId): void {
    this.trackPositionLoop(deckId, false);
    const player = this.players[deckId];
    this.players[deckId] = null;
    this.playerOwners[deckId] = null;
    this.deviceIds[deckId] = null;
    this.loadedUris[deckId] = [];
    delete this.connectPromises[deckId];
    if (player) {
      try {
        player.disconnect();
      } catch (e) {
        console.warn(`[Deck ${deckId}] Disconnect error:`, e);
      }
    }
    // A YouTube deck keeps playing; only the Spotify side goes away.
    this.updateDeckState(deckId, this.isYouTubeDeck(deckId)
      ? { deviceId: null }
      : { isReady: false, isPlaying: false, deviceId: null });
  }

  // ---------------------------------------------------------------- YouTube

  private isYouTubeDeck(deckId: DeckId): boolean {
    return this.deckStates[deckId].currentTrack?.source === 'youtube';
  }

  /** Persistent element holding this deck's YouTube player; the Deck component mounts it. */
  public getYouTubeContainer(deckId: DeckId): HTMLDivElement {
    if (!this.ytContainers[deckId]) {
      const el = document.createElement('div');
      el.style.width = '100%';
      el.style.height = '100%';
      this.ytContainers[deckId] = el;
    }
    return this.ytContainers[deckId]!;
  }

  private ensureYouTubePlayer(deckId: DeckId): Promise<any> {
    if (!this.ytReady[deckId]) {
      const ready = loadYouTubeApi().then((YT) => new Promise<any>((resolve, reject) => {
        const target = document.createElement('div');
        this.getYouTubeContainer(deckId).appendChild(target);
        const timeout = window.setTimeout(() => reject(new Error('YOUTUBE PLAYER DID NOT START (ad-blocker?)')), 15_000);
        const player = new YT.Player(target, {
          width: '100%',
          height: '100%',
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, origin: window.location.origin },
          events: {
            onReady: () => {
              window.clearTimeout(timeout);
              this.ytPlayers[deckId] = player;
              player.setVolume(Math.round(this.deckStates[deckId].effectiveVolume * 100));
              resolve(player);
            },
            onStateChange: (e: { data: number }) => this.onYouTubeState(deckId, e.data),
            onError: (e: { data: number }) => this.onYouTubeError(deckId, e.data)
          }
        });
      }));
      ready.catch(() => delete this.ytReady[deckId]);
      this.ytReady[deckId] = ready;
    }
    return this.ytReady[deckId]!;
  }

  private onYouTubeState(deckId: DeckId, state: number) {
    this.ytStates[deckId] = state;
    if (!this.isYouTubeDeck(deckId)) return;
    const player = this.ytPlayers[deckId];
    const duration_ms = Math.round((player?.getDuration?.() || 0) * 1000);
    const withDuration = duration_ms > 0 ? { duration_ms } : {};

    if (state === YT_PLAYING) {
      this.updateDeckState(deckId, { isPlaying: true, status: 'PLAYING', errorMessage: null, ...withDuration });
      this.trackPositionLoop(deckId, true);
    } else if (state === YT_PAUSED || state === YT_ENDED) {
      this.updateDeckState(deckId, { isPlaying: false, status: 'PAUSED', ...withDuration });
      this.trackPositionLoop(deckId, false);
    } else if (state === YT_CUED) {
      this.updateDeckState(deckId, { isPlaying: false, status: 'READY', isReady: true, ...withDuration });
    }
  }

  private onYouTubeError(deckId: DeckId, code: number) {
    console.error(`[Deck ${deckId}] YouTube error ${code}`);
    if (!this.isYouTubeDeck(deckId)) return;
    this.trackPositionLoop(deckId, false);
    this.updateDeckState(deckId, { isPlaying: false, status: 'ERROR', errorMessage: describeYouTubeError(code) });
  }

  private async loadYouTubeTrack(deckId: DeckId, track: Track, autoPlay: boolean): Promise<void> {
    this.trackPositionLoop(deckId, false);
    this.updateDeckState(deckId, {
      currentTrack: track,
      isPlaying: false,
      errorMessage: null,
      position_ms: 0,
      duration_ms: track.duration_ms,
      status: 'CONNECTING'
    });

    try {
      const player = await this.ensureYouTubePlayer(deckId);
      if (this.deckStates[deckId].currentTrack !== track) return; // replaced meanwhile
      player.cueVideoById(track.youtubeId);
      player.setVolume(Math.round(this.deckStates[deckId].effectiveVolume * 100));
      this.updateDeckState(deckId, { status: 'READY', isReady: true });
      if (autoPlay) player.playVideo();
    } catch (err: any) {
      const message = err?.message || 'YOUTUBE PLAYER FAILED';
      this.updateDeckState(deckId, { status: 'ERROR', errorMessage: message });
      throw new Error(message);
    }
  }

  private isLoadedInPlayer(deckId: DeckId, track: Track): boolean {
    return this.loadedUris[deckId].includes(track.uri);
  }

  /** Waits for this deck's own browser player to register with Spotify. */
  private async waitForDevice(deckId: DeckId): Promise<string | null> {
    const start = Date.now();
    while (!this.deviceIds[deckId] && this.players[deckId] && Date.now() - start < DEVICE_WAIT_MS) {
      await new Promise(r => setTimeout(r, 100));
    }
    return this.deviceIds[deckId];
  }

  private trackPositionLoop(deckId: DeckId, isPlaying: boolean) {
    if (this.positionIntervals[deckId]) {
      window.clearInterval(this.positionIntervals[deckId]);
      delete this.positionIntervals[deckId];
    }

    if (isPlaying && this.isYouTubeDeck(deckId)) {
      this.positionIntervals[deckId] = window.setInterval(() => {
        const player = this.ytPlayers[deckId];
        if (!player) return;
        this.updateDeckState(deckId, {
          position_ms: Math.round(player.getCurrentTime() * 1000),
          duration_ms: Math.round(player.getDuration() * 1000)
        });
      }, 250);
    } else if (isPlaying) {
      this.positionIntervals[deckId] = window.setInterval(async () => {
        const state = await this.players[deckId]?.getCurrentState();
        if (state) {
          this.updateDeckState(deckId, {
            position_ms: state.position,
            duration_ms: state.duration
          });
        }
      }, 500);
    }
  }

  /**
   * Starts a track on this deck's own Spotify player. Never falls back to
   * another device (phone, desktop app): the faders can't control those.
   */
  private async playSpotifyTrack(deckId: DeckId, trackUri: string, positionMs = 0): Promise<void> {
    try {
      const deviceId = await this.waitForDevice(deckId);
      if (!deviceId) {
        throw new Error(`DECK_${deckLabel(deckId)} PLAYER NOT CONNECTED TO SPOTIFY. RELOAD THE PAGE OR RELINK THE ACCOUNT.`);
      }
      const token = await getValidToken(deckId);
      if (!token) {
        throw new Error(`DECK_${deckLabel(deckId)} IS NOT LINKED TO SPOTIFY.`);
      }

      await triggerPlayback(token, deviceId, trackUri, positionMs);
      this.updateDeckState(deckId, { isPlaying: true, status: 'PLAYING', errorMessage: null });
    } catch (err: any) {
      console.error(`[Deck ${deckId}] Playback execution error:`, err);
      const message = err?.message || 'PLAYBACK FAILED. PLEASE CLICK PLAY TO RETRY.';
      this.updateDeckState(deckId, { isPlaying: false, status: 'ERROR', errorMessage: message });
      throw new Error(message);
    }
  }

  /**
   * Cues a track on a deck. With autoPlay off (the default), it waits for PLAY.
   */
  public async loadTrack(deckId: DeckId, track: Track, autoPlay = false): Promise<void> {
    const state = this.deckStates[deckId];

    // Don't cut off a playing deck by loading over it by accident.
    if (state.isPlaying) {
      throw new Error(`DECK_${deckLabel(deckId)} IS PLAYING. PAUSE IT BEFORE LOADING A NEW TRACK.`);
    }

    if (track.source === 'youtube') {
      return this.loadYouTubeTrack(deckId, track, autoPlay);
    }

    if (!state.token) {
      throw new Error(`DECK_${deckLabel(deckId)} HAS NO SPOTIFY ACCOUNT. LINK ONE, OR PUT A YOUTUBE TRACK ON THIS DECK.`);
    }

    this.updateDeckState(deckId, {
      currentTrack: track,
      isPlaying: false,
      errorMessage: null,
      duration_ms: track.duration_ms,
      position_ms: 0,
      status: this.deviceIds[deckId] ? 'READY' : 'CONNECTING'
    });

    if (!this.players[deckId]) {
      await this.initSpotifyPlayer(deckId, state.user?.id ?? null);
    }
    // The deck may have been on YouTube: sync the Spotify player to the faders.
    this.applyVolumeToDevice(deckId, this.deckStates[deckId].effectiveVolume);

    if (autoPlay) {
      await this.playSpotifyTrack(deckId, track.uri, 0);
    }
  }

  /**
   * Toggle play/pause on deck
   */
  public async togglePlay(deckId: DeckId): Promise<void> {
    const state = this.deckStates[deckId];

    if (this.isYouTubeDeck(deckId)) {
      // Called straight from the click so the browser allows sound.
      const yt = this.ytPlayers[deckId];
      if (!yt) return;
      if (state.isPlaying) yt.pauseVideo();
      else yt.playVideo(); // state updates arrive via onYouTubeState
      return;
    }

    // Unlock browser audio. Must be called inside the click, before any await.
    const activation = this.players[deckId]?.activateElement?.();
    try {
      await activation;
    } catch (e) {
      console.warn('activateElement warning:', e);
    }

    if (state.isPlaying) {
      try {
        await this.players[deckId]?.pause();
      } catch (e) {
        console.warn('Pause error:', e);
      }
      this.updateDeckState(deckId, { isPlaying: false, status: 'PAUSED' });
      return;
    }

    if (!state.token || !state.currentTrack) return;

    try {
      if (!this.players[deckId]) {
        await this.initSpotifyPlayer(deckId, state.user?.id ?? null);
      }

      // Same track still loaded in the player: resume in place (no rebuffer).
      // Otherwise start the cued track at the deck's position.
      if (this.isLoadedInPlayer(deckId, state.currentTrack)) {
        await this.players[deckId].resume();
        this.updateDeckState(deckId, { isPlaying: true, status: 'PLAYING', errorMessage: null });
      } else {
        await this.playSpotifyTrack(deckId, state.currentTrack.uri, state.position_ms);
      }
    } catch (err: any) {
      console.error(`Playback error on Deck ${deckId}:`, err);
    }
  }

  /**
   * Seek to millisecond position
   */
  public async seek(deckId: DeckId, positionMs: number): Promise<void> {
    const state = this.deckStates[deckId];

    if (this.isYouTubeDeck(deckId)) {
      const yt = this.ytPlayers[deckId];
      if (!yt) return;
      const seconds = positionMs / 1000;
      const notStarted = this.ytStates[deckId] === YT_CUED || this.ytStates[deckId] === -1;
      // seekTo on a cued video would start it playing; re-cue at the new spot instead.
      if (notStarted) yt.cueVideoById({ videoId: state.currentTrack!.youtubeId, startSeconds: seconds });
      else yt.seekTo(seconds, true);
      this.updateDeckState(deckId, { position_ms: positionMs });
      return;
    }

    // A cued track that hasn't started yet: just move the start point.
    if (state.currentTrack && !this.isLoadedInPlayer(deckId, state.currentTrack)) {
      this.updateDeckState(deckId, { position_ms: positionMs });
      return;
    }

    if (this.players[deckId]) {
      try {
        await this.players[deckId].seek(positionMs);
        this.updateDeckState(deckId, { position_ms: positionMs });
      } catch (e) {
        console.warn(`Seek error on Deck ${deckId}:`, e);
      }
    }
  }

  /**
   * Set Deck-specific master gain [0..1]
   */
  public setDeckVolume(deckId: DeckId, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.updateDeckState(deckId, { deckVolume: clamped });
    this.recomputeEffectiveVolumes();
  }

  /**
   * Set crossfader position [0..1] from the user. Cancels any running auto-fade.
   */
  public setCrossfadePosition(position: number): void {
    this.stopCrossfadeAnimation();
    this.applyCrossfade(position);
  }

  private applyCrossfade(position: number): void {
    this.crossfadePosition = Math.max(0, Math.min(1, position));
    this.recomputeEffectiveVolumes();
  }

  public getCrossfadePosition(): number {
    return this.crossfadePosition;
  }

  public setCrossfadeCurve(curve: CrossfadeCurve): void {
    this.crossfadeCurve = curve;
    this.recomputeEffectiveVolumes();
  }

  public getCrossfadeCurve(): CrossfadeCurve {
    return this.crossfadeCurve;
  }

  /**
   * Computes effective volumes for Deck A and Deck B and sends to hardware/SDK
   */
  private recomputeEffectiveVolumes(): void {
    const { gainA, gainB } = calculateGains(this.crossfadePosition, this.crossfadeCurve);

    const effA = this.deckStates.A.deckVolume * gainA;
    const effB = this.deckStates.B.deckVolume * gainB;

    this.updateDeckState('A', { effectiveVolume: effA });
    this.updateDeckState('B', { effectiveVolume: effB });

    this.applyVolumeToDevice('A', effA);
    this.applyVolumeToDevice('B', effB);
  }

  private applyVolumeToDevice(deckId: DeckId, volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.isYouTubeDeck(deckId)) {
      this.ytPlayers[deckId]?.setVolume(Math.round(clamped * 100));
      return;
    }
    // Throttled, not debounced: keeps sending while the fader moves.
    this.sendVolume[deckId](clamped);
  }

  private setPlayerVolume(deckId: DeckId, volume: number) {
    this.players[deckId]?.setVolume(volume).catch((e: unknown) => {
      console.warn(`Error setting volume on Deck ${deckId}:`, e);
    });
  }

  /**
   * Smooth automatic crossfade to target position (0 = full Deck A, 1 = full Deck B).
   * onStep reports each intermediate position so the on-screen fader can follow.
   */
  public animateCrossfade(
    targetPosition: number,
    durationMs = 2000,
    onStep?: (position: number) => void
  ): Promise<void> {
    this.stopCrossfadeAnimation();

    return new Promise((resolve) => {
      const startPos = this.crossfadePosition;
      const startTime = performance.now();
      this.crossfadeDone = resolve;

      // setInterval rather than requestAnimationFrame: rAF stops in background
      // tabs, which would freeze a fade halfway if you switch tabs mid-mix.
      this.crossfadeTimer = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - startTime) / durationMs);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : -1 + (4 - 2 * progress) * progress;
        const current = progress >= 1 ? targetPosition : startPos + (targetPosition - startPos) * eased;

        this.applyCrossfade(current);
        onStep?.(current);

        if (progress >= 1) this.stopCrossfadeAnimation();
      }, 30);
    });
  }

  /** Stops a running auto-fade where it is. */
  public stopCrossfadeAnimation(): void {
    if (this.crossfadeTimer !== null) {
      window.clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    const done = this.crossfadeDone;
    this.crossfadeDone = null;
    done?.();
  }
}

export const playerManager = new PlayerManager();

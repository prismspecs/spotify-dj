import { SpotifyUser } from '../types';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read'
].join(' ');

// Storage keys
export const STORAGE_KEYS = {
  CLIENT_ID: 'spotify_dj_client_id',
  TOKEN_A: 'spotify_dj_token_a',
  TOKEN_B: 'spotify_dj_token_b',
  REFRESH_A: 'spotify_dj_refresh_a',
  REFRESH_B: 'spotify_dj_refresh_b',
  EXPIRY_A: 'spotify_dj_expiry_a',
  EXPIRY_B: 'spotify_dj_expiry_b',
  CODE_VERIFIER_PREFIX: 'spotify_dj_verifier_',
};

export function getStoredClientId(): string {
  return localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || '';
}

export function setStoredClientId(clientId: string): void {
  localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId.trim());
}

export function getStoredToken(deckId: 'A' | 'B'): string | null {
  const key = deckId === 'A' ? STORAGE_KEYS.TOKEN_A : STORAGE_KEYS.TOKEN_B;
  return localStorage.getItem(key);
}

export function setStoredToken(deckId: 'A' | 'B', token: string, expiresIn?: number): void {
  const tokenKey = deckId === 'A' ? STORAGE_KEYS.TOKEN_A : STORAGE_KEYS.TOKEN_B;
  const expiryKey = deckId === 'A' ? STORAGE_KEYS.EXPIRY_A : STORAGE_KEYS.EXPIRY_B;
  localStorage.setItem(tokenKey, token.trim());
  if (expiresIn) {
    const expiresAt = Date.now() + expiresIn * 1000;
    localStorage.setItem(expiryKey, expiresAt.toString());
  } else {
    // Manually pasted token: unknown expiry. Drop the old one so we don't
    // "refresh" over the pasted token with the previous login's refresh token.
    localStorage.removeItem(expiryKey);
  }
}

// Permissions Spotify actually granted, from the token response. Kept for
// diagnosing player login failures.
function saveGrantedScopes(deckId: 'A' | 'B', scope?: string): void {
  if (scope) localStorage.setItem(`spotify_dj_scope_${deckId.toLowerCase()}`, scope);
}

export function getGrantedScopes(deckId: 'A' | 'B'): string | null {
  return localStorage.getItem(`spotify_dj_scope_${deckId.toLowerCase()}`);
}

function getStoredExpiry(deckId: 'A' | 'B'): number | null {
  const expiryKey = deckId === 'A' ? STORAGE_KEYS.EXPIRY_A : STORAGE_KEYS.EXPIRY_B;
  const raw = localStorage.getItem(expiryKey);
  return raw ? Number(raw) : null;
}

/**
 * Returns a usable access token for the deck, refreshing it first if it is
 * expired or about to expire. Spotify access tokens only last an hour.
 */
export async function getValidToken(deckId: 'A' | 'B'): Promise<string | null> {
  const token = getStoredToken(deckId);
  if (!token) return null;

  const expiresAt = getStoredExpiry(deckId);
  if (expiresAt && Date.now() > expiresAt - 60_000) {
    return (await refreshSpotifyToken(deckId)) ?? token;
  }
  return token;
}

// One refresh per deck at a time. Spotify rotates refresh tokens, so two
// parallel refreshes can invalidate each other.
const refreshesInFlight: { A?: Promise<string | null>; B?: Promise<string | null> } = {};

export function refreshSpotifyToken(deckId: 'A' | 'B'): Promise<string | null> {
  if (!refreshesInFlight[deckId]) {
    refreshesInFlight[deckId] = doRefresh(deckId).finally(() => {
      delete refreshesInFlight[deckId];
    });
  }
  return refreshesInFlight[deckId]!;
}

async function doRefresh(deckId: 'A' | 'B'): Promise<string | null> {
  const refreshKey = deckId === 'A' ? STORAGE_KEYS.REFRESH_A : STORAGE_KEYS.REFRESH_B;
  const refreshToken = localStorage.getItem(refreshKey);
  const clientId = getStoredClientId();

  if (!refreshToken || !clientId) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      console.warn(`Token refresh failed for Deck ${deckId}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const newToken = data.access_token;
    setStoredToken(deckId, newToken, data.expires_in);
    saveGrantedScopes(deckId, data.scope);
    if (data.refresh_token) {
      localStorage.setItem(refreshKey, data.refresh_token);
    }
    return newToken;
  } catch (e) {
    console.error(`Token refresh network error for Deck ${deckId}:`, e);
    return null;
  }
}

export function clearStoredToken(deckId: 'A' | 'B'): void {
  const tokenKey = deckId === 'A' ? STORAGE_KEYS.TOKEN_A : STORAGE_KEYS.TOKEN_B;
  const expiryKey = deckId === 'A' ? STORAGE_KEYS.EXPIRY_A : STORAGE_KEYS.EXPIRY_B;
  const refreshKey = deckId === 'A' ? STORAGE_KEYS.REFRESH_A : STORAGE_KEYS.REFRESH_B;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(expiryKey);
  localStorage.removeItem(refreshKey);
  localStorage.removeItem(`spotify_dj_scope_${deckId.toLowerCase()}`);
}

// PKCE Helper utilities
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values).reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer): string {
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(a))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function getAppRedirectUri(): string {
  let origin = window.location.origin;
  // Spotify strictly disallows 'localhost' and requires explicit IPv4 '127.0.0.1' or '[::1]'
  if (origin.includes('localhost')) {
    origin = origin.replace('localhost', '127.0.0.1');
  }
  return origin + window.location.pathname;
}

/**
 * Sends the browser to Spotify's login for one deck.
 * switchAccount: sign the browser out of Spotify first, so the login page asks
 * for an account instead of reusing the one already signed in (which belongs
 * to the other deck). The other deck's saved login is not affected.
 */
export async function initiateSpotifyLogin(deckId: 'A' | 'B', switchAccount = false, customClientId?: string): Promise<void> {
  const clientId = (customClientId || getStoredClientId()).trim();
  if (!clientId) {
    throw new Error('Please configure your Spotify Client ID in Settings first.');
  }

  const verifier = generateRandomString(64);
  const challengeBuffer = await sha256(verifier);
  const challenge = base64urlencode(challengeBuffer);

  const state = `deck_${deckId}_${generateRandomString(12)}`;
  sessionStorage.setItem(`${STORAGE_KEYS.CODE_VERIFIER_PREFIX}${state}`, verifier);
  sessionStorage.setItem('spotify_dj_pending_deck', deckId);
  localStorage.setItem(`${STORAGE_KEYS.CODE_VERIFIER_PREFIX}${state}`, verifier);
  localStorage.setItem('spotify_dj_pending_deck', deckId);

  const redirectUri = getAppRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state: state,
    scope: SCOPES,
    // Always show dialog so user can switch/login with Account 2 for Deck B!
    show_dialog: 'true'
  });

  const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  // Spotify's logout forwards to `continue` (accounts.spotify.com pages only).
  window.location.href = switchAccount
    ? `https://accounts.spotify.com/logout?continue=${encodeURIComponent(authorizeUrl)}`
    : authorizeUrl;
}

export async function handleAuthCallback(): Promise<{ deckId: 'A' | 'B'; token: string } | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    console.error('Spotify Auth error:', error);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    throw new Error(`Spotify Authorization failed: ${error}`);
  }

  if (!code || !state) {
    return null;
  }

  const verifier = localStorage.getItem(`${STORAGE_KEYS.CODE_VERIFIER_PREFIX}${state}`)
    || sessionStorage.getItem(`${STORAGE_KEYS.CODE_VERIFIER_PREFIX}${state}`);
  const deckId = state.startsWith('deck_B') ? 'B' : 'A';
  const clientId = getStoredClientId();

  // Clean URL parameters immediately
  window.history.replaceState({}, document.title, window.location.pathname);

  if (!verifier || !clientId) {
    console.warn('Missing verifier or Client ID for code exchange');
    return null;
  }

  const redirectUri = getAppRedirectUri();

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error_description || 'Failed to exchange authorization code for token');
  }

  const data = await response.json();
  const token = data.access_token;
  const expiresIn = data.expires_in;

  setStoredToken(deckId, token, expiresIn);
  saveGrantedScopes(deckId, data.scope);
  console.log(`[Deck ${deckId}] Spotify granted scopes:`, data.scope);
  if (data.refresh_token) {
    const refreshKey = deckId === 'A' ? STORAGE_KEYS.REFRESH_A : STORAGE_KEYS.REFRESH_B;
    localStorage.setItem(refreshKey, data.refresh_token);
  }

  sessionStorage.removeItem(`${STORAGE_KEYS.CODE_VERIFIER_PREFIX}${state}`);
  sessionStorage.removeItem('spotify_dj_pending_deck');

  return { deckId, token };
}

/** A failed Spotify Web API request, with Spotify's HTTP status and reason. */
export class SpotifyRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SpotifyRequestError';
  }
}

/** GET /me. Throws SpotifyRequestError when Spotify refuses. */
export async function fetchUserProfile(token: string, deckId: 'A' | 'B'): Promise<SpotifyUser> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    // e.g. 403 when the account isn't on the app's User Management list
    const body = await res.text().catch(() => '');
    let reason = body;
    try {
      reason = JSON.parse(body)?.error?.message || body;
    } catch {
      // not JSON; keep the raw text
    }
    reason = reason.trim().slice(0, 200) || `HTTP ${res.status}`;
    console.warn(`[Deck ${deckId}] GET /me failed: HTTP ${res.status} ${reason}`);
    throw new SpotifyRequestError(res.status, reason);
  }
  const user = await res.json();
  console.log(`[Deck ${deckId}] GET /me ok: ${user.display_name} (${user.id})`);
  return user;
}

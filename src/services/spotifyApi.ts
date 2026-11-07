import { Track, PlaylistInfo } from '../types';
import { refreshSpotifyToken } from './spotifyAuth';

async function spotifyGet(url: string, token: string, retries = 2): Promise<any> {
  let activeToken = token;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (res.status === 401 && attempt === 0) {
        // Attempt automatic token refresh
        const refreshedA = await refreshSpotifyToken('A');
        const refreshedB = await refreshSpotifyToken('B');
        const refreshed = refreshedA || refreshedB;
        if (refreshed) {
          activeToken = refreshed;
          continue;
        }
      }

      // Handle transient 503 Service Unavailable or 429 Rate Limit with exponential backoff
      if ((res.status === 503 || res.status === 502 || res.status === 504 || res.status === 429) && attempt < retries) {
        const waitMs = res.status === 429
          ? (parseInt(res.headers.get('Retry-After') || '1', 10) * 1000)
          : 600 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const spotifyMsg = err?.error?.message;
        if (res.status === 503) {
          throw new Error('Spotify search service is momentarily busy (503). Retrying, or paste a Spotify track/playlist link directly.');
        }
        if (res.status === 401) {
          throw new Error(spotifyMsg || 'Spotify authorization expired (401). Please click LINK_SPOTIFY on Deck 01 to log in.');
        }
        if (res.status === 403) {
          throw new Error(spotifyMsg || 'Access forbidden (403). Ensure your Spotify email is added to "User Management" in Spotify Developer Dashboard.');
        }
        throw new Error(spotifyMsg || `Spotify API error (${res.status} ${res.statusText})`);
      }

      return await res.json();
    } catch (err: any) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export function extractPlaylistId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  // Handles https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=... or spotify:playlist:37i9...
  const match = trimmed.match(/playlist[\/:]([a-zA-Z0-9]+)/);
  if (match) return match[1];
  // If user passed a bare 22-character alphanumeric Spotify ID
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;
  return null;
}

export function extractAlbumId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  // Handles https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=... or spotify:album:...
  const match = trimmed.match(/album[\/:]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function extractArtistId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  // Handles https://open.spotify.com/artist/3fMbdgg4jU18AjLCKBvRSm?si=... or spotify:artist:...
  const match = trimmed.match(/artist[\/:]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function extractTrackId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  // Handles https://open.spotify.com/track/0Egl3Qb0J7OD03BiA8c53j?si=... or spotify:track:...
  const match = trimmed.match(/track[\/:]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export async function fetchTrackById(token: string, trackId: string): Promise<Track> {
  const t = await spotifyGet(`https://api.spotify.com/v1/tracks/${trackId}`, token);
  return {
    id: t.id,
    name: t.name,
    artists: t.artists.map((a: any) => a.name),
    albumName: t.album?.name || '',
    albumArt: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || '',
    duration_ms: t.duration_ms,
    uri: t.uri,
    preview_url: t.preview_url
  };
}

export async function fetchPlaylist(token: string, playlistInput: string): Promise<PlaylistInfo> {
  const trimmed = playlistInput.trim();

  // 1. Single Track URL
  const trackId = extractTrackId(trimmed);
  if (trackId) {
    const track = await fetchTrackById(token, trackId);
    return {
      id: track.id,
      name: `TRACK: ${track.name}`,
      description: `Single track by ${track.artists.join(', ')}`,
      image: track.albumArt,
      totalTracks: 1,
      tracks: [track]
    };
  }

  // 2. Album URL
  const albumId = extractAlbumId(trimmed);
  if (albumId) {
    const data = await spotifyGet(`https://api.spotify.com/v1/albums/${albumId}`, token);
    const albumArt = data.images?.[0]?.url || data.images?.[1]?.url || '';
    const tracks: Track[] = (data.tracks?.items || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a: any) => a.name),
      albumName: data.name,
      albumArt: albumArt,
      duration_ms: t.duration_ms,
      uri: t.uri,
      preview_url: t.preview_url
    }));

    return {
      id: data.id,
      name: `ALBUM: ${data.name}`,
      description: `By ${data.artists?.map((a: any) => a.name).join(', ')}`,
      image: albumArt,
      totalTracks: tracks.length,
      tracks
    };
  }

  // 3. Artist URL (top tracks)
  const artistId = extractArtistId(trimmed);
  if (artistId) {
    const data = await spotifyGet(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=from_token`, token)
      .catch(() => {
        throw new Error('Spotify removed artist top tracks from its API in Feb 2026. Paste a playlist, album, or track link instead.');
      });
    const tracks: Track[] = (data.tracks || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a: any) => a.name),
      albumName: t.album?.name || '',
      albumArt: t.album?.images?.[0]?.url || '',
      duration_ms: t.duration_ms,
      uri: t.uri,
      preview_url: t.preview_url
    }));

    return {
      id: artistId,
      name: `ARTIST TOP TRACKS`,
      totalTracks: tracks.length,
      tracks
    };
  }

  // 4. Playlist URL or ID
  const playlistId = extractPlaylistId(trimmed);
  if (!playlistId) {
    throw new Error('Please enter a valid Spotify Playlist, Album, or Track link.');
  }

  try {
    const data = await spotifyGet(`https://api.spotify.com/v1/playlists/${playlistId}`, token);

    let rawItems: any[] = [];
    if (Array.isArray(data.items?.items)) {
      rawItems = data.items.items;
    } else if (Array.isArray(data.tracks?.items)) {
      rawItems = data.tracks.items;
    } else if (Array.isArray(data.items)) {
      rawItems = data.items;
    }

    // If playlist items array was empty or omitted from main object, query items / tracks sub-endpoint
    if (rawItems.length === 0) {
      try {
        const itemsData = await spotifyGet(`https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50`, token);
        rawItems = itemsData.items || [];
      } catch {
        try {
          const tracksData = await spotifyGet(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, token);
          rawItems = tracksData.items || [];
        } catch {
          // fallback failed, use empty list
        }
      }
    }

    const tracks: Track[] = rawItems
      .map((raw: any) => raw.item || raw.track || raw)
      .filter((t: any) => t && (t.id || t.uri || t.name))
      .map((t: any) => ({
        id: t.id || t.uri,
        name: t.name || 'Unknown Track',
        artists: (t.artists || []).map((a: any) => a.name || 'Unknown Artist'),
        albumName: t.album?.name || '',
        albumArt: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || data.images?.[0]?.url || '',
        duration_ms: t.duration_ms || 0,
        uri: t.uri || `spotify:track:${t.id}`,
        preview_url: t.preview_url
      }));

    // Since Feb 2026, Spotify leaves out the track list for playlists the
    // account doesn't own or collaborate on.
    const trackListHidden = data.items === undefined && data.tracks === undefined;
    if (tracks.length === 0 && trackListHidden) {
      throw new Error(
        `Spotify won't share the tracks of "${data.name}" with this app: it only lists playlists the linked account (Deck 1's) owns or collaborates on. ` +
        'Fix: in Spotify, add that account as a collaborator, or copy the songs into a playlist it owns.'
      );
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      image: data.images?.[0]?.url,
      totalTracks: data.tracks?.total || data.items?.total || tracks.length,
      tracks
    };
  } catch (err: any) {
    if (err?.message?.includes('404') || err?.message?.toLowerCase().includes('not found')) {
      throw new Error('Spotify returned "Resource not found (404)". Note: Spotify blocks algorithmic playlists (like Daily Mix, Discover Weekly, Radio) and private playlists from other users. Make sure the playlist is set to Public in Spotify.');
    }
    throw err;
  }
}

export async function fetchUserPlaylists(token: string): Promise<{ id: string; name: string; image?: string; totalTracks: number }[]> {
  try {
    const data = await spotifyGet('https://api.spotify.com/v1/me/playlists?limit=10', token);
    return (data.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url,
      totalTracks: p.tracks?.total || 0
    }));
  } catch (e) {
    console.error('Failed to load user playlists', e);
    return [];
  }
}

export async function searchTracks(token: string, query: string): Promise<Track[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // Spotify recently reduced the max search limit to 10. Anything > 10 returns "Invalid limit"
  const data = await spotifyGet(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=10`,
    token
  );

  return (data.tracks?.items || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    artists: t.artists.map((a: any) => a.name),
    albumName: t.album?.name || '',
    albumArt: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || '',
    duration_ms: t.duration_ms,
    uri: t.uri,
    preview_url: t.preview_url
  }));
}

export async function fetchUserDevices(token: string): Promise<{ id: string; name: string; is_active: boolean; type: string }[]> {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.devices || [];
  } catch (e) {
    console.warn('Error fetching Spotify devices:', e);
    return [];
  }
}

export async function transferPlayback(token: string, deviceId: string, play = false): Promise<void> {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play
    })
  });

  if (!res.ok && res.status !== 204 && res.status !== 202) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Transfer playback failed with status ${res.status}`);
  }
}

export async function triggerPlayback(token: string, deviceId: string, trackUri: string, positionMs = 0): Promise<void> {
  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : 'https://api.spotify.com/v1/me/player/play';

  let res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uris: [trackUri],
      position_ms: positionMs
    })
  });

  // If device is not active or 404, try transferPlayback once and retry
  if ((res.status === 404 || res.status === 400) && deviceId) {
    try {
      await transferPlayback(token, deviceId, false);
      await new Promise(r => setTimeout(r, 300));
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [trackUri],
          position_ms: positionMs
        })
      });
    } catch {
      // Ignore transfer error and let response handling deal with it
    }
  }

  if (!res.ok && res.status !== 204 && res.status !== 202) {
    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || `Playback failed with status ${res.status}`;
    if (res.status === 403) {
      throw new Error(`SPOTIFY PREMIUM REQUIRED: ${message}`);
    }
    throw new Error(message);
  }
}

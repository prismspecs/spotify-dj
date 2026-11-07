import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Track } from '../types';

// playerManager touches browser globals; give it minimal ones.
const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
  vi.stubGlobal('window', globalThis);
});

const track = (id: string, durationS = 200): Track => ({
  id,
  name: `Song ${id}`,
  artists: ['Artist'],
  albumName: '',
  albumArt: '',
  duration_ms: durationS * 1000,
  uri: `spotify:track:${id}`
});

async function freshManager() {
  vi.resetModules();
  const { playerManager } = await import('./playerManager');
  return playerManager as any;
}

// What Spotify's player reports.
const sdkState = (uri: string, paused: boolean, position: number, extra: any = {}) => ({
  paused,
  position,
  duration: 200_000,
  track_window: { current_track: { uri }, previous_tracks: extra.previous ?? [] },
  restrictions: extra.restrictions ?? {}
});

describe('deck queue', () => {
  beforeEach(() => store.clear());

  it('adds, reorders, removes, and remembers songs', async () => {
    const pm = await freshManager();
    pm.enqueue('A', track('1'));
    pm.enqueue('A', track('2'));
    pm.enqueue('A', track('3'));
    pm.moveUpInQueue('A', 2);
    expect(pm.getDeckState('A').queue.map((t: Track) => t.id)).toEqual(['1', '3', '2']);
    pm.removeFromQueue('A', 0);
    expect(pm.getDeckState('A').queue.map((t: Track) => t.id)).toEqual(['3', '2']);
    expect(pm.getDeckState('B').queue).toEqual([]);

    const reloaded = await freshManager();
    expect(reloaded.getDeckState('A').queue.map((t: Track) => t.id)).toEqual(['3', '2']);
  });

  it('starts the next queued song when the current one ends', async () => {
    const pm = await freshManager();
    pm.enqueue('A', track('next'));
    const load = vi.spyOn(pm, 'loadTrack').mockResolvedValue(undefined);
    pm.onTrackEnded('A');
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledWith('A', expect.objectContaining({ id: 'next' }), true);
    expect(pm.getDeckState('A').queue).toEqual([]);
  });
});

describe('auto play switch', () => {
  beforeEach(() => store.clear());

  it('when off, a finished song does not start the next one', async () => {
    const pm = await freshManager();
    expect(pm.getDeckState('A').autoPlay).toBe(true);
    pm.enqueue('A', track('next'));
    pm.setAutoPlay('A', false);
    const load = vi.spyOn(pm, 'loadTrack').mockResolvedValue(undefined);
    pm.onTrackEnded('A');
    await new Promise((r) => setTimeout(r, 0));
    expect(load).not.toHaveBeenCalled();
    expect(pm.getDeckState('A').queue.map((t: Track) => t.id)).toEqual(['next']);

    const reloaded = await freshManager();
    expect(reloaded.getDeckState('A').autoPlay).toBe(false);
    expect(reloaded.getDeckState('B').autoPlay).toBe(true);
  });
});

describe('loading a song onto a deck', () => {
  beforeEach(() => store.clear());

  it('replaces a playing song and keeps the deck playing', async () => {
    const pm = await freshManager();
    pm.players.A = { setVolume: async () => undefined }; // a connected Spotify player
    pm.updateDeckState('A', { token: 't', isPlaying: true, currentTrack: track('old') });
    const stop = vi.spyOn(pm, 'stopDeck').mockImplementation(async () => pm.updateDeckState('A', { isPlaying: false }));
    const play = vi.spyOn(pm, 'playSpotifyTrack').mockResolvedValue(undefined);

    await pm.loadTrack('A', track('new'), true);

    expect(stop).toHaveBeenCalled();
    expect(play).toHaveBeenCalledWith('A', 'spotify:track:new', 0);
    expect(pm.getDeckState('A').currentTrack.id).toBe('new');
  });

  it('refuses a Spotify song on a deck with no account, without stopping it', async () => {
    const pm = await freshManager();
    pm.updateDeckState('A', { token: null, isPlaying: true });
    const stop = vi.spyOn(pm, 'stopDeck');
    await expect(pm.loadTrack('A', track('new'), true)).rejects.toThrow('NO SPOTIFY ACCOUNT');
    expect(stop).not.toHaveBeenCalled();
  });
});

describe('Spotify end-of-song detection', () => {
  async function playing(positionMs: number) {
    const pm = await freshManager();
    pm.startedUris.A = ['spotify:track:x'];
    pm.endHandled.A = false;
    pm.updateDeckState('A', { isPlaying: true, position_ms: positionMs, duration_ms: 200_000 });
    return pm;
  }

  it('sees a song that played to the end and stopped at 0:00', async () => {
    const pm = await playing(198_500);
    expect(pm.spotifyTrackEnded('A', sdkState('spotify:track:x', true, 0))).toBe(true);
  });

  it('sees Spotify moving on to its own pick', async () => {
    const pm = await playing(198_500);
    const state = sdkState('spotify:track:other', false, 1000, { previous: [{ uri: 'spotify:track:x' }] });
    expect(pm.spotifyTrackEnded('A', state)).toBe(true);
  });

  it('ignores a normal pause mid-song', async () => {
    const pm = await playing(60_000);
    expect(pm.spotifyTrackEnded('A', sdkState('spotify:track:x', true, 60_000))).toBe(false);
  });

  it('ignores a deck that is not playing', async () => {
    const pm = await playing(198_500);
    pm.updateDeckState('A', { isPlaying: false });
    expect(pm.spotifyTrackEnded('A', sdkState('spotify:track:x', true, 0))).toBe(false);
  });
});

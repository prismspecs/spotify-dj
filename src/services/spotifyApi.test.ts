import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDuration,
  extractPlaylistId,
  extractTrackId,
  extractAlbumId,
  extractArtistId,
  transferPlayback,
  triggerPlayback
} from '../services/spotifyApi';

describe('spotifyApi utilities', () => {
  describe('formatDuration', () => {
    it('formats milliseconds to MM:SS', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(5000)).toBe('0:05');
      expect(formatDuration(65000)).toBe('1:05');
      expect(formatDuration(215000)).toBe('3:35');
    });
  });

  describe('extractPlaylistId', () => {
    it('extracts ID from standard Spotify URL', () => {
      const url = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=12345';
      expect(extractPlaylistId(url)).toBe('37i9dQZF1DXcBWIGoYBM5M');
    });

    it('extracts ID from spotify:playlist: URI', () => {
      const uri = 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';
      expect(extractPlaylistId(uri)).toBe('37i9dQZF1DXcBWIGoYBM5M');
    });

    it('returns raw ID if given a 22-char ID', () => {
      expect(extractPlaylistId('37i9dQZF1DXcBWIGoYBM5M')).toBe('37i9dQZF1DXcBWIGoYBM5M');
    });
  });

  describe('extractAlbumId', () => {
    it('extracts album ID from URL', () => {
      const url = 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc';
      expect(extractAlbumId(url)).toBe('4aawyAB9vmqN3uQ7FjRGTy');
    });
  });

  describe('extractArtistId', () => {
    it('extracts artist ID from URL', () => {
      const url = 'https://open.spotify.com/artist/3fMbdgg4jU18AjLCKBvRSm?si=abc';
      expect(extractArtistId(url)).toBe('3fMbdgg4jU18AjLCKBvRSm');
    });
  });

  describe('extractTrackId', () => {
    it('extracts track ID from standard Spotify track URL', () => {
      const url = 'https://open.spotify.com/track/0Egl3Qb0J7OD03BiA8c53j?si=5fac069642c54668';
      expect(extractTrackId(url)).toBe('0Egl3Qb0J7OD03BiA8c53j');
    });

    it('extracts track ID from spotify:track: URI', () => {
      const uri = 'spotify:track:0Egl3Qb0J7OD03BiA8c53j';
      expect(extractTrackId(uri)).toBe('0Egl3Qb0J7OD03BiA8c53j');
    });

    it('returns null if given a playlist URL', () => {
      const url = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
      expect(extractTrackId(url)).toBeNull();
    });
  });

  describe('transferPlayback and triggerPlayback', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('transferPlayback sends PUT request with device_ids', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204
      });
      globalThis.fetch = mockFetch;

      await transferPlayback('test_token', 'device_123', false);

      expect(mockFetch).toHaveBeenCalledWith('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test_token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_ids: ['device_123'],
          play: false
        })
      });
    });

    it('triggerPlayback sends play command with track uri', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204
      });
      globalThis.fetch = mockFetch;

      await triggerPlayback('test_token', 'device_456', 'spotify:track:abc', 0);

      expect(mockFetch).toHaveBeenCalledWith('https://api.spotify.com/v1/me/player/play?device_id=device_456', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test_token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: ['spotify:track:abc'],
          position_ms: 0
        })
      });
    });

    it('triggerPlayback throws descriptive error when Premium is required', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Player command failed: Premium required' } })
      });
      globalThis.fetch = mockFetch;

      await expect(
        triggerPlayback('test_token', 'device_456', 'spotify:track:abc', 0)
      ).rejects.toThrow(/SPOTIFY PREMIUM REQUIRED/i);
    });
  });
});

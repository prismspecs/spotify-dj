import { describe, it, expect } from 'vitest';
import { extractYouTubeIds, isYouTubePlaylistUrl } from './youtube';

describe('extractYouTubeIds', () => {
  it('reads every common YouTube link shape', () => {
    expect(extractYouTubeIds('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(['dQw4w9WgXcQ']);
    expect(extractYouTubeIds('https://youtu.be/dQw4w9WgXcQ?si=abc')).toEqual(['dQw4w9WgXcQ']);
    expect(extractYouTubeIds('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM')).toEqual(['dQw4w9WgXcQ']);
    expect(extractYouTubeIds('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toEqual(['dQw4w9WgXcQ']);
    expect(extractYouTubeIds('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual(['dQw4w9WgXcQ']);
  });

  it('takes several links at once, skipping duplicates and non-YouTube text', () => {
    const input = 'https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=9bZkp7q19f0, https://youtu.be/dQw4w9WgXcQ spotify:track:abc';
    expect(extractYouTubeIds(input)).toEqual(['dQw4w9WgXcQ', '9bZkp7q19f0']);
  });

  it('ignores Spotify links and plain playlists', () => {
    expect(extractYouTubeIds('https://open.spotify.com/track/0Egl3Qb0J7OD03BiA8c53j')).toEqual([]);
    expect(extractYouTubeIds('https://www.youtube.com/playlist?list=PL123')).toEqual([]);
    expect(isYouTubePlaylistUrl('https://www.youtube.com/playlist?list=PL123')).toBe(true);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchYouTube } from './youtubeSearch.js';

describe('searchYouTube with YOUTUBE_API_KEY (official API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.YOUTUBE_API_KEY;
  });

  it('asks only for embeddable videos and returns decoded titles with durations', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      const body = String(url).includes('/search?')
        ? { items: [{ id: { videoId: 'abc123def45' }, snippet: { title: 'Rock &amp; Roll &#39;Live&#39;', channelTitle: 'Band &quot;X&quot;' } }] }
        : { items: [{ id: 'abc123def45', contentDetails: { duration: 'PT1H2M3S' } }] };
      return { ok: true, json: async () => body };
    }));

    const results = await searchYouTube('rock');

    expect(calls[0]).toContain('videoEmbeddable=true');
    expect(calls[0]).toContain('type=video');
    expect(results).toEqual([
      { videoId: 'abc123def45', title: "Rock & Roll 'Live'", channel: 'Band "X"', durationMs: 3723000 }
    ]);
  });

  it('passes the API error message through', async () => {
    process.env.YOUTUBE_API_KEY = 'bad-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid' } }) })));
    await expect(searchYouTube('x')).rejects.toThrow('YouTube API: API key not valid');
  });
});

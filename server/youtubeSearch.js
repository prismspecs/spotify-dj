// Unofficial YouTube search: fetches YouTube's normal results page and reads the
// JSON embedded in it. No API key needed, but it can break if YouTube changes
// its page. Runs server-side because browsers can't read youtube.com directly.

const VIDEOS_ONLY = 'EgIQAQ%3D%3D'; // YouTube's "Type: Video" search filter

/** "4:02" or "1:02:03" -> milliseconds */
function parseDuration(text) {
  if (!text) return 0;
  return text.split(':').map(Number).reduce((total, part) => total * 60 + part, 0) * 1000;
}

export async function searchYouTube(query, limit = 20) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${VIDEOS_ONLY}`;
  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      // Skips the EU cookie-consent page, which has no results on it.
      Cookie: 'SOCS=CAI; CONSENT=YES+1'
    }
  });
  if (!res.ok) throw new Error(`YouTube returned HTTP ${res.status}`);

  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error('Could not read YouTube results (page format changed?)');

  const data = JSON.parse(match[1]);
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
  const results = [];
  for (const section of sections) {
    for (const item of section?.itemSectionRenderer?.contents ?? []) {
      const video = item.videoRenderer;
      if (!video?.videoId) continue;
      results.push({
        videoId: video.videoId,
        title: video.title?.runs?.map((r) => r.text).join('') || video.videoId,
        channel: video.ownerText?.runs?.[0]?.text || 'YouTube',
        durationMs: parseDuration(video.lengthText?.simpleText)
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

/** GET ?q=... -> { results: [...] }. Works as Express or Vite (connect) middleware. */
export async function youtubeSearchHandler(req, res) {
  const query = new URL(req.url, 'http://local').searchParams.get('q')?.trim();
  res.setHeader('Content-Type', 'application/json');
  if (!query) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Missing search query' }));
    return;
  }
  try {
    res.end(JSON.stringify({ results: await searchYouTube(query) }));
  } catch (err) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: err.message }));
  }
}

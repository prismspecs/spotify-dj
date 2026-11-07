// YouTube search for the YOUTUBE box. Runs server-side because browsers can't
// read youtube.com directly.
//
// With YOUTUBE_API_KEY set (a free YouTube Data API v3 key), it uses the
// official API: reliable from cloud hosts, and it skips videos whose owners
// block embedding. Without a key it reads YouTube's normal results page:
// no setup, but unofficial, and YouTube may block it from cloud servers.

const VIDEOS_ONLY = 'EgIQAQ%3D%3D'; // YouTube's "Type: Video" search filter

/** "4:02" or "1:02:03" -> milliseconds */
function parseClockDuration(text) {
  if (!text) return 0;
  return text.split(':').map(Number).reduce((total, part) => total * 60 + part, 0) * 1000;
}

/** ISO 8601 "PT1H2M3S" -> milliseconds */
function parseIsoDuration(text) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(text || '');
  if (!m) return 0;
  return ((Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 + Number(m[3] || 0)) * 1000;
}

/** The API returns HTML-escaped titles ("Rock &amp; Roll"). */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function searchWithApi(query, limit, key) {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: String(limit),
    q: query,
    key
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouTube API: ${data?.error?.message || `HTTP ${res.status}`}`);

  const items = (data.items || []).filter((item) => item.id?.videoId);
  if (items.length === 0) return [];

  // Search results have no durations; one extra call gets them (1 quota unit).
  const ids = items.map((item) => item.id.videoId);
  const durations = {};
  const videoRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key })}`
  );
  if (videoRes.ok) {
    for (const v of (await videoRes.json()).items || []) {
      durations[v.id] = parseIsoDuration(v.contentDetails?.duration);
    }
  }

  return items.map((item) => ({
    videoId: item.id.videoId,
    title: decodeEntities(item.snippet?.title || item.id.videoId),
    channel: decodeEntities(item.snippet?.channelTitle || 'YouTube'),
    durationMs: durations[item.id.videoId] || 0
  }));
}

async function searchWithPage(query, limit) {
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
  if (!match) {
    throw new Error('Could not read YouTube results. YouTube may be blocking this server; set YOUTUBE_API_KEY.');
  }

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
        durationMs: parseClockDuration(video.lengthText?.simpleText)
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

export async function searchYouTube(query, limit = 10) {
  const key = process.env.YOUTUBE_API_KEY;
  return key ? searchWithApi(query, limit, key) : searchWithPage(query, limit);
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
    res.end(JSON.stringify({ results: await searchYouTube(query.slice(0, 200)) }));
  } catch (err) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: err.message }));
  }
}

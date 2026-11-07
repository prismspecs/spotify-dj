import { Track } from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

/** Loads YouTube's IFrame Player API once. */
export function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YOUTUBE PLAYER FAILED TO LOAD (ad-blocker?)'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const VIDEO_URL = /(?:youtube\.com\/(?:watch\?(?:[^ ]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Video ids from one or more YouTube links (separated by spaces, commas or newlines). */
export function extractYouTubeIds(input: string): string[] {
  const ids: string[] = [];
  for (const part of input.split(/[\s,]+/)) {
    const id = part.match(VIDEO_URL)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function isYouTubePlaylistUrl(input: string): boolean {
  return /youtube\.com\/playlist\?/.test(input);
}

function youtubeTrack(videoId: string, title: string, channel: string, durationMs = 0): Track {
  return {
    id: `yt:${videoId}`,
    name: title,
    artists: [channel],
    albumName: 'YOUTUBE',
    albumArt: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration_ms: durationMs, // 0 = unknown until the player loads it
    uri: `youtube:${videoId}`,
    source: 'youtube',
    youtubeId: videoId
  };
}

/** Builds a crate track for a YouTube video. Title/channel come from oEmbed when available. */
export async function fetchYouTubeTrack(videoId: string): Promise<Track> {
  let title = `YouTube video ${videoId}`;
  let channel = 'YouTube';
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`);
    if (res.ok) {
      const data = await res.json();
      title = data.title || title;
      channel = data.author_name || channel;
    }
  } catch {
    // Metadata is optional; the video can still play.
  }
  return youtubeTrack(videoId, title, channel);
}

/** Searches YouTube through the local server (see server/youtubeSearch.js). */
export async function searchYouTube(query: string): Promise<Track[]> {
  const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`YOUTUBE SEARCH FAILED: ${data.error ?? `HTTP ${res.status}`}`);
  }
  return (data.results ?? []).map((r: { videoId: string; title: string; channel: string; durationMs: number }) =>
    youtubeTrack(r.videoId, r.title, r.channel, r.durationMs)
  );
}

/** Human-readable YouTube player error codes. */
export function describeYouTubeError(code: number): string {
  switch (code) {
    case 2: return 'YOUTUBE: INVALID VIDEO ID';
    case 5: return 'YOUTUBE: BROWSER CANNOT PLAY THIS VIDEO';
    case 100: return 'YOUTUBE: VIDEO NOT FOUND OR PRIVATE';
    case 101:
    case 150: return 'YOUTUBE: THE OWNER BLOCKS PLAYBACK OUTSIDE YOUTUBE. TRY ANOTHER UPLOAD OF THIS SONG.';
    case 153: return 'YOUTUBE: PLAYER CONFIG ERROR (MISSING REFERRER)';
    default: return `YOUTUBE PLAYER ERROR ${code}`;
  }
}

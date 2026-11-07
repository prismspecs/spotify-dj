import React, { useEffect, useState } from 'react';
import { Search, Music, ArrowRight, Loader2, X } from 'lucide-react';
import { Track, PlaylistInfo } from '../types';
import { fetchPlaylist, fetchTrackById, extractTrackId, searchTracks, formatDuration } from '../services/spotifyApi';
import { getValidToken } from '../services/spotifyAuth';
import { extractYouTubeIds, fetchYouTubeTrack, isYouTubePlaylistUrl, searchYouTube } from '../services/youtube';

// Right column: newest on top, capped. Each search adds at most PER_SEARCH.
const RESULTS_CAP = 20;
const PER_SEARCH = 10;

const SAVED_PLAYLIST_KEY = 'spotify_dj_crate_playlist';
const SAVED_RESULTS_KEY = 'spotify_dj_crate_results';

const NO_PLAYLIST: PlaylistInfo = { id: 'none', name: '', totalTracks: 0, tracks: [] };

/** Saved playlist, ignoring the demo tracks older versions saved. */
function loadSavedPlaylist(): PlaylistInfo {
  const saved = loadSaved<PlaylistInfo>(SAVED_PLAYLIST_KEY, NO_PLAYLIST);
  return saved.id === 'demo-playlist' ? NO_PLAYLIST : saved;
}

// Saved per browser so the columns survive reloads (e.g. the Spotify login redirect).
function loadSaved<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: columns just won't persist
  }
}

const isSpotifyLink = (input: string) => /open\.spotify\.com\/|^spotify:/.test(input);

interface PlaylistManagerProps {
  tokenA: string | null;
  tokenB: string | null;
  onLoadTrackToDeck: (deckId: 'A' | 'B', track: Track) => void;
  onQueueTrack: (deckId: 'A' | 'B', track: Track) => void;
  onConnectDeck?: (deckId: 'A' | 'B') => void;
  currentTrackA: Track | null;
  currentTrackB: Track | null;
}

/** Input + button. */
const CrateInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  buttonLabel: string;
  busy: boolean;
  disabled: boolean;
  label?: { text: string; color: string };
}> = ({ value, onChange, onSubmit, placeholder, buttonLabel, busy, disabled, label }) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }}
    className="flex gap-1 items-center"
  >
    {label && <span className={`w-16 flex-shrink-0 text-[10px] font-bold ${label.color}`}>{label.text}</span>}
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 min-w-0 px-2.5 py-1.5 bg-black border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
    />
    <button
      type="submit"
      disabled={disabled || !value.trim()}
      className="w-20 px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 disabled:opacity-30 flex items-center justify-center gap-1"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : buttonLabel === 'LOAD' ? <ArrowRight className="w-3 h-3" /> : <Search className="w-3 h-3" />}
      <span>{buttonLabel}</span>
    </button>
  </form>
);

const ErrorBox: React.FC<{ text: string; onLink?: () => void }> = ({ text, onLink }) => (
  <div className="p-2 bg-red-950/40 border border-red-900 text-xs text-red-300 flex items-center justify-between gap-2">
    <span>{text}</span>
    {onLink && (
      <button onClick={onLink} className="px-2 py-0.5 bg-red-900 hover:bg-red-800 text-white font-bold text-[10px] flex-shrink-0">
        Link Spotify
      </button>
    )}
  </div>
);

/** Track list with Deck 1 / Deck 2 load buttons. */
const TrackTable: React.FC<{
  tracks: Track[];
  emptyText: string;
  currentTrackA: Track | null;
  currentTrackB: Track | null;
  onLoad: (deckId: 'A' | 'B', track: Track) => void;
  onQueue: (deckId: 'A' | 'B', track: Track) => void;
}> = ({ tracks, emptyText, currentTrackA, currentTrackB, onLoad, onQueue }) => {
  if (tracks.length === 0) {
    return <p className="p-6 text-center text-xs text-zinc-600">{emptyText}</p>;
  }
  return (
    <div className="overflow-y-auto max-h-[380px]">
      <table className="w-full text-left tech-table">
        <tbody>
          {tracks.map((track, idx) => {
            const onA = currentTrackA?.id === track.id;
            const onB = currentTrackB?.id === track.id;
            return (
              <tr key={`${track.id}-${idx}`}>
                <td className="w-8 text-[10px] text-zinc-600">
                  {onA ? <span className="text-cyan-400 font-bold">1▶</span> : onB ? <span className="text-amber-400 font-bold">2▶</span> : idx + 1}
                </td>
                <td className="w-full max-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 bg-black flex-shrink-0 border border-zinc-800 overflow-hidden">
                      {track.albumArt ? (
                        <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <Music className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-zinc-200 text-xs truncate">{track.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {track.source === 'youtube' && <span className="text-red-400 font-bold">YT </span>}
                        {track.artists.join(', ')}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="w-12 text-zinc-500 text-right text-[11px] whitespace-nowrap">
                  {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                </td>
                <td className="whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onLoad('A', track)}
                      className={`px-2 py-1 text-[9px] font-bold border whitespace-nowrap ${onA ? 'bg-cyan-950 text-cyan-300 border-cyan-500' : 'bg-black text-cyan-400 border-zinc-800 hover:border-cyan-700'}`}
                    >
                      DECK 1
                    </button>
                    <button
                      onClick={() => onQueue('A', track)}
                      title="Add to Deck 1's queue"
                      className="px-1.5 py-1 text-[10px] font-bold border bg-black text-cyan-400 border-zinc-800 hover:border-cyan-700"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onLoad('B', track)}
                      className={`px-2 py-1 text-[9px] font-bold border whitespace-nowrap ${onB ? 'bg-amber-950 text-amber-300 border-amber-500' : 'bg-black text-amber-400 border-zinc-800 hover:border-amber-700'}`}
                    >
                      DECK 2
                    </button>
                    <button
                      onClick={() => onQueue('B', track)}
                      title="Add to Deck 2's queue"
                      className="px-1.5 py-1 text-[10px] font-bold border bg-black text-amber-400 border-zinc-800 hover:border-amber-700"
                    >
                      +
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

type Busy = 'playlist' | 'spotify' | 'youtube' | null;
type CrateError = { column: 'left' | 'right'; text: string; offerLink?: boolean } | null;

export const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  tokenA,
  tokenB,
  onLoadTrackToDeck,
  onQueueTrack,
  onConnectDeck,
  currentTrackA,
  currentTrackB
}) => {
  const [playlist, setPlaylist] = useState<PlaylistInfo>(loadSavedPlaylist);
  const [results, setResults] = useState<Track[]>(() => loadSaved(SAVED_RESULTS_KEY, []));
  const [playlistInput, setPlaylistInput] = useState('');
  const [spotifyInput, setSpotifyInput] = useState('');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<CrateError>(null);

  useEffect(() => save(SAVED_PLAYLIST_KEY, playlist), [playlist]);
  useEffect(() => save(SAVED_RESULTS_KEY, results), [results]);

  const activeToken = tokenA || tokenB;

  /** Newest on top; a track already in the list moves up instead of repeating. */
  const addResults = (tracks: Track[]) => {
    setResults(prev => {
      const incoming = new Set(tracks.map(t => t.id));
      return [...tracks, ...prev.filter(t => !incoming.has(t.id))].slice(0, RESULTS_CAP);
    });
  };

  /** Runs one action: spinner on its button, failures shown under that column. */
  const run = async (key: Exclude<Busy, null>, column: 'left' | 'right', work: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await work();
    } catch (err: any) {
      setError({ column, text: err?.message || 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  // Read the saved login at request time; deck state can lag behind.
  const spotifyToken = async (column: 'left' | 'right'): Promise<string | null> => {
    const token = (await getValidToken('A')) || (await getValidToken('B'));
    if (!token) setError({ column, text: 'Link a Spotify account on Deck 1 first.', offerLink: true });
    return token;
  };

  /** Spotify links: playlists/albums go left, single tracks go right. */
  const loadSpotifyLink = async (token: string, input: string) => {
    const trackId = extractTrackId(input);
    if (trackId) {
      addResults([await fetchTrackById(token, trackId)]);
    } else {
      setPlaylist(await fetchPlaylist(token, input));
    }
  };

  // ---- Left: playlist link

  const handlePlaylist = async () => {
    const input = playlistInput.trim();
    if (extractYouTubeIds(input).length > 0) {
      setError({ column: 'left', text: 'That\'s a YouTube link. Paste it in the YouTube box on the right.' });
      return;
    }
    const token = await spotifyToken('left');
    if (!token) return;
    await run('playlist', 'left', async () => {
      await loadSpotifyLink(token, input);
      setPlaylistInput('');
    });
  };

  // ---- Right: Spotify search or link

  const handleSpotify = async () => {
    const input = spotifyInput.trim();
    if (extractYouTubeIds(input).length > 0) {
      setError({ column: 'right', text: 'That\'s a YouTube link. Paste it in the YouTube box.' });
      return;
    }
    const token = await spotifyToken('right');
    if (!token) return;
    await run('spotify', 'right', async () => {
      if (isSpotifyLink(input)) {
        await loadSpotifyLink(token, input);
      } else {
        const tracks = await searchTracks(token, input);
        if (tracks.length === 0) throw new Error(`No Spotify tracks found for "${input}".`);
        addResults(tracks.slice(0, PER_SEARCH));
      }
      setSpotifyInput('');
    });
  };

  // ---- Right: YouTube search or link(s) (no account needed)

  const handleYouTube = async () => {
    const input = youtubeInput.trim();
    if (isYouTubePlaylistUrl(input)) {
      setError({ column: 'right', text: 'YouTube playlists aren\'t supported. Paste video links (several at once is fine).' });
      return;
    }
    await run('youtube', 'right', async () => {
      const ids = extractYouTubeIds(input);
      if (ids.length > 0) {
        addResults(await Promise.all(ids.map(fetchYouTubeTrack)));
      } else {
        const tracks = await searchYouTube(input);
        if (tracks.length === 0) throw new Error(`No YouTube videos found for "${input}".`);
        addResults(tracks.slice(0, PER_SEARCH));
      }
      setYoutubeInput('');
    });
  };

  const errorFor = (column: 'left' | 'right') =>
    error?.column === column ? (
      <ErrorBox
        text={error.text}
        onLink={error.offerLink && !activeToken && onConnectDeck ? () => onConnectDeck('A') : undefined}
      />
    ) : null;

  const isBusy = busy !== null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 font-mono">
      {/* Left: the main playlist */}
      <div className="rack-panel flex flex-col">
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-bold text-zinc-200">PLAYLIST</span>
              {playlist.tracks.length > 0 && (
                <span className="text-xs text-zinc-500 truncate">{playlist.name} · {playlist.tracks.length}</span>
              )}
            </div>
          </div>
          <CrateInput
            value={playlistInput}
            onChange={setPlaylistInput}
            onSubmit={handlePlaylist}
            placeholder="Paste a Spotify playlist or album link..."
            buttonLabel="LOAD"
            busy={busy === 'playlist'}
            disabled={isBusy}
          />
          {errorFor('left')}
        </div>
        <TrackTable
          tracks={playlist.tracks}
          emptyText="Paste your Spotify playlist link above."
          currentTrackA={currentTrackA}
          currentTrackB={currentTrackB}
          onLoad={onLoadTrackToDeck}
          onQueue={onQueueTrack}
        />
      </div>

      {/* Right: search results and added tracks, newest on top */}
      <div className="rack-panel flex flex-col">
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-zinc-200">SEARCH &amp; ADD</span>
              <span className="text-xs text-zinc-500">{results.length}/{RESULTS_CAP}, newest on top</span>
            </div>
            {results.length > 0 && (
              <button
                onClick={() => setResults([])}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
          <CrateInput
            value={spotifyInput}
            onChange={setSpotifyInput}
            onSubmit={handleSpotify}
            placeholder="Search, or paste a track link..."
            buttonLabel="GO"
            busy={busy === 'spotify'}
            disabled={isBusy}
            label={{ text: 'SPOTIFY', color: 'text-emerald-400' }}
          />
          <CrateInput
            value={youtubeInput}
            onChange={setYoutubeInput}
            onSubmit={handleYouTube}
            placeholder="Search, or paste video link(s)..."
            buttonLabel="GO"
            busy={busy === 'youtube'}
            disabled={isBusy}
            label={{ text: 'YOUTUBE', color: 'text-red-400' }}
          />
          {errorFor('right')}
        </div>
        <TrackTable
          tracks={results}
          emptyText="Search results and added links show up here."
          currentTrackA={currentTrackA}
          currentTrackB={currentTrackB}
          onLoad={onLoadTrackToDeck}
          onQueue={onQueueTrack}
        />
      </div>
    </div>
  );
};

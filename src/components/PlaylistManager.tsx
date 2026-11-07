import React, { useState } from 'react';
import { Search, Music, ArrowRight, Plus, Loader2, Sparkles, Folder } from 'lucide-react';
import { Track, PlaylistInfo } from '../types';
import { fetchPlaylist, searchTracks, formatDuration } from '../services/spotifyApi';
import { getValidToken } from '../services/spotifyAuth';
import { extractYouTubeIds, fetchYouTubeTrack, isYouTubePlaylistUrl, searchYouTube } from '../services/youtube';
import { DEMO_TRACKS } from '../data/demoTracks';

const YOUTUBE_LINKS_CRATE_ID = 'youtube-links';

type Action = 'spotify-link' | 'spotify-search' | 'youtube-link' | 'youtube-search';

interface PlaylistManagerProps {
  tokenA: string | null;
  tokenB: string | null;
  onLoadTrackToDeck: (deckId: 'A' | 'B', track: Track) => void;
  onConnectDeck?: (deckId: 'A' | 'B') => void;
  currentTrackA: Track | null;
  currentTrackB: Track | null;
}

/** One input + button form in a source row. */
const CrateInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  icon: React.ReactNode;
  buttonIcon: React.ReactNode;
  buttonLabel: string;
  busy: boolean;
  disabled: boolean;
}> = ({ value, onChange, onSubmit, placeholder, icon, buttonIcon, buttonLabel, busy, disabled }) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }}
    className="flex gap-1"
  >
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-2.5 py-1.5 bg-black border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-500 font-mono"
      />
      <span className="absolute left-2 top-2.5 text-zinc-600">{icon}</span>
    </div>
    <button
      type="submit"
      disabled={disabled || !value.trim()}
      className="w-24 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 disabled:opacity-30 flex items-center justify-center gap-1"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : buttonIcon}
      <span>{buttonLabel}</span>
    </button>
  </form>
);

/** A labelled row: [SOURCE] [link input] [search input] */
const SourceRow: React.FC<{ label: string; color: string; children: React.ReactNode }> = ({ label, color, children }) => (
  <div className="grid grid-cols-1 md:grid-cols-[64px_1fr_1fr] gap-2 items-center">
    <span className={`text-[10px] font-bold tracking-wider ${color}`}>{label}</span>
    {children}
  </div>
);

export const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  tokenA,
  tokenB,
  onLoadTrackToDeck,
  onConnectDeck,
  currentTrackA,
  currentTrackB
}) => {
  const [spotifyLink, setSpotifyLink] = useState('');
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [youtubeLinks, setYoutubeLinks] = useState('');
  const [youtubeQuery, setYoutubeQuery] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<{ text: string; offerSpotifyLink?: boolean } | null>(null);

  const [currentPlaylist, setCurrentPlaylist] = useState<PlaylistInfo>({
    id: 'demo-playlist',
    name: 'INTERNAL_CRATE // DEFAULT_PACK',
    description: 'Instant ready-to-mix audio loops.',
    totalTracks: DEMO_TRACKS.length,
    tracks: DEMO_TRACKS
  });

  const activeToken = tokenA || tokenB;

  // Read the saved login at request time. The deck state can lag behind
  // (it waits on Spotify's profile request) and its token can be an hour stale.
  const getCrateToken = async () => (await getValidToken('A')) || (await getValidToken('B'));

  /** Runs one crate action: spinner on its button, failures in the error box. */
  const run = async (action: Action, work: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (err: any) {
      setError({ text: err?.message || 'SOMETHING WENT WRONG.' });
    } finally {
      setBusy(null);
    }
  };

  const requireSpotifyToken = async (): Promise<string | null> => {
    const token = await getCrateToken();
    if (!token) {
      setError({ text: 'NO SPOTIFY ACCOUNT LINKED. LINK ONE ON DECK 01 FIRST.', offerSpotifyLink: true });
    }
    return token;
  };

  // ---- Spotify row

  const handleSpotifyLink = async () => {
    const input = spotifyLink.trim();
    if (extractYouTubeIds(input).length > 0) {
      setError({ text: "THAT'S A YOUTUBE LINK. PASTE IT IN THE YOUTUBE ROW." });
      return;
    }
    const token = await requireSpotifyToken();
    if (!token) return;
    await run('spotify-link', async () => {
      setCurrentPlaylist(await fetchPlaylist(token, input));
      setSpotifyLink('');
    });
  };

  const handleSpotifySearch = async () => {
    const query = spotifyQuery.trim();
    const token = await requireSpotifyToken();
    if (!token) return;
    await run('spotify-search', async () => {
      const tracks = await searchTracks(token, query);
      if (tracks.length === 0) throw new Error(`NO SPOTIFY TRACKS FOUND FOR "${query}".`);
      setCurrentPlaylist({ id: `spotify-search-${Date.now()}`, name: `SPOTIFY SEARCH: "${query}"`, totalTracks: tracks.length, tracks });
    });
  };

  // ---- YouTube row (no account needed)

  const handleYouTubeLinks = async () => {
    const input = youtubeLinks.trim();
    const ids = extractYouTubeIds(input);
    if (ids.length === 0) {
      setError({
        text: isYouTubePlaylistUrl(input)
          ? "YOUTUBE PLAYLISTS AREN'T SUPPORTED. PASTE VIDEO LINKS (SEVERAL AT ONCE IS FINE)."
          : 'NO YOUTUBE VIDEO LINK FOUND.'
      });
      return;
    }
    await run('youtube-link', async () => {
      const tracks = await Promise.all(ids.map(fetchYouTubeTrack));
      // Pasted links pile up into one list, so you can build a set link by link.
      setCurrentPlaylist(prev => {
        const existing = prev.id === YOUTUBE_LINKS_CRATE_ID ? prev.tracks : [];
        const merged = [...existing, ...tracks.filter(t => !existing.some(e => e.id === t.id))];
        return { id: YOUTUBE_LINKS_CRATE_ID, name: 'YOUTUBE // PASTED LINKS', totalTracks: merged.length, tracks: merged };
      });
      setYoutubeLinks('');
    });
  };

  const handleYouTubeSearch = async () => {
    const query = youtubeQuery.trim();
    await run('youtube-search', async () => {
      const tracks = await searchYouTube(query);
      if (tracks.length === 0) throw new Error(`NO YOUTUBE VIDEOS FOUND FOR "${query}".`);
      setCurrentPlaylist({ id: `youtube-search-${Date.now()}`, name: `YOUTUBE SEARCH: "${query}"`, totalTracks: tracks.length, tracks });
    });
  };

  const handleLoadDemoStarter = () => {
    setCurrentPlaylist({
      id: 'demo-playlist',
      name: 'INTERNAL_CRATE // DEFAULT_PACK',
      description: 'Instant ready-to-mix audio loops.',
      totalTracks: DEMO_TRACKS.length,
      tracks: DEMO_TRACKS
    });
    setError(null);
  };

  const isBusy = busy !== null;

  return (
    <div className="rack-panel border border-zinc-800">
      {/* Crate Topbar */}
      <div className="p-3 border-b border-zinc-800 bg-black flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono">
        <div className="flex items-center gap-2.5">
          <Folder className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            AUDIO_CRATE
          </span>
          <span className="text-[10px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 border border-zinc-800">
            {currentPlaylist.tracks.length}_ITEMS
          </span>
          <span className="text-zinc-600 hidden sm:inline">//</span>
          <span className="text-xs text-zinc-400 truncate max-w-sm hidden sm:inline">
            {currentPlaylist.name}
          </span>
        </div>

        <button
          onClick={handleLoadDemoStarter}
          className="flex items-center gap-1.5 px-2 py-1 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 w-fit"
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>RELOAD_DEFAULT_PACK</span>
        </button>
      </div>

      {/* Source rows: Spotify, then YouTube */}
      <div className="p-3 bg-zinc-950/80 border-b border-zinc-800 font-mono space-y-2">
        <SourceRow label="SPOTIFY" color="text-emerald-400">
          <CrateInput
            value={spotifyLink}
            onChange={setSpotifyLink}
            onSubmit={handleSpotifyLink}
            placeholder="Spotify playlist / album / track link..."
            icon={<Music className="w-3 h-3" />}
            buttonIcon={<ArrowRight className="w-3 h-3" />}
            buttonLabel="LOAD"
            busy={busy === 'spotify-link'}
            disabled={isBusy}
          />
          <CrateInput
            value={spotifyQuery}
            onChange={setSpotifyQuery}
            onSubmit={handleSpotifySearch}
            placeholder="Search Spotify..."
            icon={<Search className="w-3 h-3" />}
            buttonIcon={<Search className="w-3 h-3" />}
            buttonLabel="SEARCH"
            busy={busy === 'spotify-search'}
            disabled={isBusy}
          />
        </SourceRow>

        <SourceRow label="YOUTUBE" color="text-red-400">
          <CrateInput
            value={youtubeLinks}
            onChange={setYoutubeLinks}
            onSubmit={handleYouTubeLinks}
            placeholder="YouTube video link(s)..."
            icon={<Music className="w-3 h-3" />}
            buttonIcon={<Plus className="w-3 h-3" />}
            buttonLabel="ADD"
            busy={busy === 'youtube-link'}
            disabled={isBusy}
          />
          <CrateInput
            value={youtubeQuery}
            onChange={setYoutubeQuery}
            onSubmit={handleYouTubeSearch}
            placeholder="Search YouTube..."
            icon={<Search className="w-3 h-3" />}
            buttonIcon={<Search className="w-3 h-3" />}
            buttonLabel="SEARCH"
            busy={busy === 'youtube-search'}
            disabled={isBusy}
          />
        </SourceRow>

        {/* Action Error Box */}
        {error && (
          <div className="p-2 bg-red-950/40 border border-red-900 text-xs text-red-300 flex items-center justify-between gap-2">
            <span>[ERROR]: {error.text}</span>
            {error.offerSpotifyLink && !activeToken && onConnectDeck && (
              <button
                onClick={() => onConnectDeck('A')}
                className="px-2 py-0.5 bg-red-900 hover:bg-red-800 text-white font-bold text-[10px]"
              >
                AUTH_DECK_01
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sharp Technical Table */}
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-left tech-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>TITLE / ARTIST</th>
              <th className="hidden md:table-cell">ALBUM</th>
              <th className="w-16 text-right">TIME</th>
              <th className="w-32 text-center">ASSIGN_DECK</th>
            </tr>
          </thead>
          <tbody>
            {currentPlaylist.tracks.map((track, idx) => {
              const isPlayingA = currentTrackA?.id === track.id;
              const isPlayingB = currentTrackB?.id === track.id;

              return (
                <tr key={`${track.id}-${idx}`}>
                  <td className="text-zinc-600 text-[10px]">
                    {isPlayingA ? (
                      <span className="text-cyan-400 font-bold">[1]▶</span>
                    ) : isPlayingB ? (
                      <span className="text-amber-400 font-bold">[2]▶</span>
                    ) : (
                      String(idx + 1).padStart(2, '0')
                    )}
                  </td>

                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-black flex-shrink-0 border border-zinc-800 overflow-hidden">
                        {track.albumArt ? (
                          <img src={track.albumArt} alt={track.name} className="w-full h-full object-cover grayscale contrast-125" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700">
                            <Music className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-200 text-xs truncate max-w-xs">
                          {track.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate max-w-xs">
                          {track.artists.join(', ')}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="text-zinc-500 text-[11px] hidden md:table-cell truncate max-w-xs uppercase">
                    {track.albumName}
                  </td>

                  <td className="text-zinc-400 text-right text-[11px]">
                    {track.duration_ms ? formatDuration(track.duration_ms) : '--:--'}
                  </td>

                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onLoadTrackToDeck('A', track)}
                        className={`px-2 py-1 text-[9px] font-bold border transition-colors ${
                          isPlayingA
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                            : 'bg-black text-cyan-400 border-zinc-800 hover:border-cyan-700'
                        }`}
                      >
                        DECK_1
                      </button>

                      <button
                        onClick={() => onLoadTrackToDeck('B', track)}
                        className={`px-2 py-1 text-[9px] font-bold border transition-colors ${
                          isPlayingB
                            ? 'bg-amber-950 text-amber-300 border-amber-500'
                            : 'bg-black text-amber-400 border-zinc-800 hover:border-amber-700'
                        }`}
                      >
                        DECK_2
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

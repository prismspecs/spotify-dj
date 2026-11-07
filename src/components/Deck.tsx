import React, { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, LogIn, Music, ChevronUp, X, SkipForward } from 'lucide-react';
import { DeckState } from '../types';
import { formatDuration } from '../services/spotifyApi';
import { playerManager } from '../services/playerManager';

// Holds the deck's YouTube player. Always mounted (only hidden), because moving
// or remounting the player's iframe would reload the video.
const YouTubeSlot: React.FC<{ deckId: 'A' | 'B'; visible: boolean }> = ({ deckId, visible }) => {
  const slotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = playerManager.getYouTubeContainer(deckId);
    if (slotRef.current && container.parentElement !== slotRef.current) {
      slotRef.current.appendChild(container);
    }
  }, [deckId]);
  return (
    <div className={visible ? 'w-full aspect-video bg-black border border-zinc-800' : 'hidden'}>
      <div ref={slotRef} className="w-full h-full" />
    </div>
  );
};

interface DeckProps {
  deckId: 'A' | 'B';
  state: DeckState;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
}

function statusText(state: DeckState): { text: string; color: string } {
  if (state.errorMessage) return { text: 'Error', color: 'text-red-400' };
  if (state.isPlaying) return { text: 'Playing', color: 'text-emerald-400' };
  if (state.status === 'CONNECTING') return { text: 'Connecting…', color: 'text-amber-400' };
  if (state.currentTrack) return { text: 'Ready', color: 'text-zinc-400' };
  return { text: 'Empty', color: 'text-zinc-600' };
}

function sourceLabel(state: DeckState): string {
  if (state.currentTrack?.source === 'youtube') return 'YouTube';
  return 'Spotify';
}

export const Deck: React.FC<DeckProps> = ({
  deckId,
  state,
  onTogglePlay,
  onSeek,
  onConnect,
  onDisconnect,
  onRetry
}) => {
  const isA = deckId === 'A';
  const progressRef = useRef<HTMLDivElement>(null);

  const accentText = isA ? 'text-cyan-400' : 'text-amber-400';
  const accentFill = isA ? 'bg-cyan-400' : 'bg-amber-400';
  const accentBorder = isA ? 'border-cyan-500' : 'border-amber-500';

  const progress = state.duration_ms > 0
    ? Math.min(100, Math.max(0, (state.position_ms / state.duration_ms) * 100))
    : 0;
  const remainingMs = Math.max(0, state.duration_ms - state.position_ms);
  const isYouTube = state.currentTrack?.source === 'youtube';
  const status = statusText(state);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !state.duration_ms) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.floor(ratio * state.duration_ms));
  };

  return (
    <div className="rack-panel p-4 flex flex-col gap-3 h-full font-mono">
      {/* Header: deck name + Spotify account */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${accentText}`}>DECK {isA ? '1' : '2'}</span>
        {state.user || state.token ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-1.5 h-1.5 bg-emerald-500" />
            <span className="text-zinc-300 max-w-[110px] truncate">{state.user?.display_name ?? 'Spotify linked'}</span>
            <button onClick={onDisconnect} className="text-zinc-600 hover:text-red-400" title="Disconnect this Spotify account">
              unlink
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-100"
          >
            <LogIn className="w-3 h-3 text-emerald-400" />
            <span>Link Spotify</span>
          </button>
        )}
      </div>

      {/* Track */}
      <div className="flex gap-3 items-center">
        <div className={`w-16 h-16 bg-black border ${state.isPlaying ? accentBorder : 'border-zinc-800'} flex-shrink-0 flex items-center justify-center overflow-hidden`}>
          {state.currentTrack?.albumArt ? (
            <img src={state.currentTrack.albumArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music className="w-6 h-6 text-zinc-700" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {state.currentTrack ? (
            <>
              <p className="text-sm font-bold text-zinc-100 truncate">{state.currentTrack.name}</p>
              <p className="text-xs text-zinc-400 truncate">{state.currentTrack.artists.join(', ')}</p>
            </>
          ) : (
            <p className="text-xs text-zinc-600">No track loaded</p>
          )}
          <p className="text-[11px] mt-0.5">
            <span className={status.color}>{status.text}</span>
            {state.currentTrack && <span className="text-zinc-600"> · {sourceLabel(state)}</span>}
          </p>
        </div>
      </div>

      {state.errorMessage && (
        <div className="bg-red-950/60 border border-red-800 text-red-300 text-[11px] p-2 flex items-center justify-between gap-2">
          <span>{state.errorMessage}</span>
          <button onClick={onRetry} className="px-2 py-0.5 bg-red-900 hover:bg-red-800 text-white text-[10px] flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      <YouTubeSlot deckId={deckId} visible={isYouTube} />

      {/* Progress: click to jump */}
      <div className="mt-auto space-y-1">
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="h-2 w-full bg-zinc-900 cursor-pointer"
          title="Click to jump"
        >
          <div className={`h-full ${accentFill}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>{formatDuration(state.position_ms)}</span>
          <span>-{formatDuration(remainingMs)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSeek(0)}
          className="h-11 px-3 flex items-center gap-1.5 text-zinc-300 border border-zinc-700 hover:border-zinc-500 text-[11px]"
          title="Back to the start"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Start</span>
        </button>
        <button
          onClick={onTogglePlay}
          disabled={!state.currentTrack}
          className={`h-11 flex-1 flex items-center justify-center gap-2 font-bold text-xs disabled:opacity-20 disabled:cursor-not-allowed ${
            state.isPlaying
              ? 'bg-emerald-950 text-emerald-300 border-2 border-emerald-500 hover:bg-emerald-900'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black border-2 border-emerald-400'
          }`}
        >
          {state.isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{state.isPlaying ? 'PAUSE' : 'PLAY'}</span>
        </button>
      </div>

      {/* Queue: plays in order when the current song ends */}
      <div className="border-t border-zinc-800 pt-2 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-300 font-bold">
            Up next{state.queue.length > 0 && <span className="text-zinc-500 font-normal"> ({state.queue.length})</span>}
          </span>
          {state.queue.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => playerManager.playNext(deckId)}
                className="flex items-center gap-1 text-zinc-300 hover:text-white"
                title="Stop this song and start the next one now"
              >
                <SkipForward className="w-3 h-3" />
                <span>Next</span>
              </button>
              <button onClick={() => playerManager.clearQueue(deckId)} className="text-zinc-600 hover:text-red-400">
                clear
              </button>
            </div>
          )}
        </div>
        {state.queue.length === 0 ? (
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Nothing queued. Press <b className="text-zinc-400">+</b> next to a song's DECK {isA ? '1' : '2'} button; queued songs play one after another.
          </p>
        ) : (
          <ol className="max-h-36 overflow-y-auto space-y-0.5">
            {state.queue.map((t, i) => (
              <li key={`${t.id}-${i}`} className="flex items-center gap-2 text-[11px]">
                <span className="w-4 text-right text-zinc-600">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-zinc-300">
                  {t.source === 'youtube' && <span className="text-red-400 font-bold">YT </span>}
                  {t.name} <span className="text-zinc-600">· {t.artists.join(', ')}</span>
                </span>
                <button
                  onClick={() => playerManager.moveUpInQueue(deckId, i)}
                  disabled={i === 0}
                  className="text-zinc-500 hover:text-white disabled:opacity-20"
                  title="Move up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => playerManager.removeFromQueue(deckId, i)} className="text-zinc-500 hover:text-red-400" title="Remove">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

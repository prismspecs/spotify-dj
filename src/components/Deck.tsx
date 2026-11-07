import React, { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, LogIn, Music } from 'lucide-react';
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
    <div className={visible ? 'mt-2 w-full aspect-video bg-black border border-zinc-800' : 'hidden'}>
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
}

export const Deck: React.FC<DeckProps> = ({
  deckId,
  state,
  onTogglePlay,
  onSeek,
  onConnect,
  onDisconnect
}) => {
  const isA = deckId === 'A';
  const waveformRef = useRef<HTMLDivElement>(null);

  const channelNum = isA ? '01' : '02';
  const accentColor = isA ? 'text-cyan-400' : 'text-amber-400';
  const accentBorder = isA ? 'border-cyan-500' : 'border-amber-500';
  const playheadColor = isA ? 'bg-cyan-400' : 'bg-amber-400';

  const progressPercent = state.duration_ms > 0
    ? Math.min(100, Math.max(0, (state.position_ms / state.duration_ms) * 100))
    : 0;

  const remainingMs = Math.max(0, state.duration_ms - state.position_ms);
  const isYouTube = state.currentTrack?.source === 'youtube';

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !state.duration_ms) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Math.floor(ratio * state.duration_ms));
  };

  return (
    <div className="rack-panel p-4 flex flex-col justify-between h-full border border-zinc-800">
      {/* Deck Header: Channel ID + Status */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-black px-2.5 py-1 border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-500 font-bold">UNIT</span>
            <span className={`text-xs font-mono font-bold ${accentColor}`}>DECK_{channelNum}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
            <span className="text-zinc-600">BPM:</span>
            <span className="text-zinc-200 font-bold">124.00</span>
          </div>
        </div>

        {/* Account Status / Auth Action */}
        <div>
          {state.user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black border border-zinc-800 px-2 py-0.5 text-xs font-mono">
                <span className="w-1.5 h-1.5 bg-emerald-500" />
                <span className="text-zinc-300 text-[11px] max-w-[90px] truncate uppercase">
                  {state.user.display_name}
                </span>
                {state.user.product === 'premium' ? (
                  <span className="text-[8px] font-mono font-bold text-emerald-400 bg-emerald-950 px-1 border border-emerald-800">
                    PREMIUM
                  </span>
                ) : state.user.product ? (
                  <span
                    className="text-[8px] font-mono font-bold text-amber-400 bg-amber-950 px-1 border border-amber-800"
                    title="Spotify Web Playback SDK requires a Premium account to stream"
                  >
                    FREE
                  </span>
                ) : null}
              </div>
              <button
                onClick={onDisconnect}
                className="text-[10px] font-mono text-zinc-500 hover:text-red-400 uppercase tracking-wider"
                title="Disconnect Account"
              >
                [DISCONNECT]
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {state.isDemo && (
                <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 uppercase">
                  DEMO_SRC
                </span>
              )}
              <button
                onClick={onConnect}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-100 uppercase active:translate-y-[1px]"
              >
                <LogIn className="w-3 h-3 text-emerald-400" />
                <span>LINK_SPOTIFY</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Waveform Beatgrid Display */}
      <div className="my-3 space-y-1">
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
          <span>WAVEFORM // BEATGRID</span>
          <span className="text-zinc-400 font-bold">{Math.round(progressPercent)}%</span>
        </div>

        <div
          ref={waveformRef}
          onClick={handleWaveformClick}
          className="relative h-12 w-full bg-black border border-zinc-800 cursor-pointer overflow-hidden flex items-center justify-between"
          title="Click to seek"
        >
          {/* Grid lines */}
          <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="w-[1px] h-full bg-zinc-600" />
            ))}
          </div>

          {/* Precision Bars */}
          <div className="absolute inset-0 flex items-center justify-between px-0.5 opacity-60 pointer-events-none">
            {Array.from({ length: 64 }).map((_, i) => {
              const heightPercent = 15 + Math.abs(Math.sin(i * 0.35)) * 65 + ((i % 4 === 0) ? 20 : 0);
              const isPast = (i / 64) * 100 <= progressPercent;
              return (
                <div
                  key={i}
                  className={`w-[2px] ${isPast ? playheadColor : 'bg-zinc-700'}`}
                  style={{ height: `${Math.min(96, heightPercent)}%` }}
                />
              );
            })}
          </div>

          {/* Sharp Playhead */}
          <div
            className={`absolute top-0 bottom-0 w-[2px] ${playheadColor} z-10 pointer-events-none`}
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Live Monospace Timecodes */}
        <div className="flex justify-between items-center text-[11px] font-mono bg-black px-2 py-1 border border-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-[10px]">ELAPSED:</span>
            <span className="text-zinc-100 font-bold">{formatDuration(state.position_ms)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-[10px]">REMAIN:</span>
            <span className="text-zinc-400">-{formatDuration(remainingMs)}</span>
          </div>
        </div>
      </div>

      {/* Main Track Display Section: Sharp Modular Block */}
      <div className="my-2 p-3 bg-black border border-zinc-800 flex gap-3.5 items-center">
        {/* Sharp Square Album Artwork with Click-To-Play */}
        <div
          onClick={state.currentTrack ? onTogglePlay : undefined}
          className={`w-20 h-20 bg-zinc-950 border ${state.isPlaying ? accentBorder : 'border-zinc-800'} flex-shrink-0 flex items-center justify-center overflow-hidden relative group ${state.currentTrack ? 'cursor-pointer' : ''}`}
          title={state.currentTrack ? (state.isPlaying ? 'Click to pause' : 'Click to play') : undefined}
        >
          {state.currentTrack?.albumArt ? (
            <img
              src={state.currentTrack.albumArt}
              alt={state.currentTrack.name}
              className="w-full h-full object-cover grayscale contrast-125 brightness-95 group-hover:opacity-75 transition-opacity"
            />
          ) : (
            <Music className="w-8 h-8 text-zinc-700" />
          )}

          {/* Artwork Hover Play/Pause Overlay */}
          {state.currentTrack && (
            <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${state.isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-80 group-hover:opacity-100'}`}>
              {state.isPlaying ? (
                <Pause className="w-8 h-8 text-emerald-400 fill-current" />
              ) : (
                <Play className="w-8 h-8 text-emerald-400 fill-current translate-x-0.5" />
              )}
            </div>
          )}
        </div>

        {/* Track Metadata */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-widest flex items-center justify-between">
            {state.errorMessage ? (
              <span className="flex items-center gap-1.5 font-bold text-red-400">
                <span className="w-2 h-2 bg-red-500 animate-pulse" />
                <span>PLAYBACK_ERROR</span>
              </span>
            ) : state.isPlaying ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <span className="w-2 h-2 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>NOW PLAYING</span>
              </span>
            ) : state.status === 'CONNECTING' ? (
              <span className="flex items-center gap-1.5 font-bold text-amber-400">
                <span className="w-2 h-2 bg-amber-400 animate-pulse" />
                <span>CONNECTING_DEVICE...</span>
              </span>
            ) : state.currentTrack ? (
              <span className="flex items-center gap-1.5 font-bold text-zinc-300">
                <span className="w-2 h-2 bg-zinc-600" />
                <span>READY TO PLAY</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-bold text-zinc-600">
                <span className="w-2 h-2 bg-zinc-800" />
                <span>STANDBY</span>
              </span>
            )}
          </div>

          {state.currentTrack ? (
            <>
              <h3 className="font-mono font-bold text-zinc-100 text-sm truncate uppercase tracking-tight">
                {state.currentTrack.name}
              </h3>
              <p className="font-mono text-xs text-zinc-400 truncate">
                {state.currentTrack.artists.join(', ')}
              </p>
              <p className="font-mono text-[10px] text-zinc-600 truncate uppercase">
                {isYouTube ? (
                  <span className="text-red-400 font-bold">SRC: YOUTUBE</span>
                ) : (
                  state.currentTrack.albumName
                )}
              </p>
            </>
          ) : (
            <p className="font-mono text-xs text-zinc-600 uppercase">
              NO_TRACK_LOADED
            </p>
          )}

          {/* Inline Hardware Error Alert with Retry button */}
          {state.errorMessage && (
            <div className="bg-red-950/80 border border-red-700 text-red-300 text-[10px] font-mono p-1.5 flex items-center justify-between gap-2 mt-1">
              <span className="truncate font-semibold">{state.errorMessage}</span>
              <button
                onClick={onTogglePlay}
                className="px-1.5 py-0.5 bg-red-900 hover:bg-red-800 text-white font-bold text-[9px] border border-red-500 uppercase flex-shrink-0"
              >
                RETRY
              </button>
            </div>
          )}
        </div>
      </div>

      <YouTubeSlot deckId={deckId} visible={isYouTube} />

      {/* Hardware Transport Strip: High-Visibility Transport Keys */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800 mt-2">
        <div className="flex items-center gap-2">
          {/* CUE Key */}
          <button
            onClick={() => onSeek(0)}
            className="btn-mech h-12 px-4 flex items-center gap-1.5 text-zinc-200 border border-zinc-700 hover:border-zinc-500"
            title="Cue Reset (0:00)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">CUE</span>
          </button>

          {/* High-Visibility PLAY/PAUSE Key */}
          <button
            onClick={onTogglePlay}
            disabled={!state.currentTrack}
            className={`h-12 px-6 flex items-center gap-2 transition-all font-mono font-bold text-xs uppercase active:translate-y-[1px] disabled:opacity-20 disabled:cursor-not-allowed ${
              state.isPlaying
                ? 'bg-emerald-950 text-emerald-300 border-2 border-emerald-500 hover:bg-emerald-900 shadow-[0_0_14px_rgba(16,185,129,0.4)]'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black border-2 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.5)]'
            }`}
            title={state.isPlaying ? 'Click to Pause' : 'Click to Play'}
          >
            {state.isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current translate-x-0.5" />
                <span>PLAY</span>
              </>
            )}
          </button>
        </div>

        {/* Output Channel Bus */}
        <div className="text-right font-mono text-[10px]">
          <span className="text-zinc-600 block">ASSIGN</span>
          <span className={`font-bold ${accentColor}`}>BUS_{channelNum}</span>
        </div>
      </div>
    </div>
  );
};

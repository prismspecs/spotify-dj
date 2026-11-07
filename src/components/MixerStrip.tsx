import React, { useState } from 'react';
import { CrossfadeCurve, DeckState } from '../types';

interface MixerStripProps {
  position: number;
  curve: CrossfadeCurve;
  deckAState: DeckState;
  deckBState: DeckState;
  onPositionChange: (pos: number) => void;
  onCurveChange: (curve: CrossfadeCurve) => void;
  onAutoFade: (target: number, durationMs: number) => void;
  onDeckAVolumeChange: (vol: number) => void;
  onDeckBVolumeChange: (vol: number) => void;
}

// Sharp rectangular LED ladder
const SharpLedMeter: React.FC<{ level: number; isPlaying: boolean; label: string }> = ({ level, isPlaying, label }) => {
  const activeLevel = isPlaying ? Math.min(1, Math.max(0, level)) : 0;
  
  const segments = [
    { threshold: 0.1, color: 'bg-emerald-500' },
    { threshold: 0.25, color: 'bg-emerald-500' },
    { threshold: 0.45, color: 'bg-emerald-500' },
    { threshold: 0.65, color: 'bg-emerald-400' },
    { threshold: 0.8, color: 'bg-amber-400' },
    { threshold: 0.92, color: 'bg-amber-500' },
    { threshold: 0.98, color: 'bg-rose-500' },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] font-mono text-zinc-500 font-bold uppercase">{label}</span>
      <div className="flex flex-col-reverse gap-[2px] bg-black p-1 border border-zinc-800">
        {segments.map((seg, idx) => {
          const isLit = activeLevel >= seg.threshold;
          return (
            <div
              key={idx}
              className={`w-3 h-[6px] transition-colors duration-75 ${
                isLit ? seg.color : 'bg-zinc-900'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

export const MixerStrip: React.FC<MixerStripProps> = ({
  position,
  curve,
  deckAState,
  deckBState,
  onPositionChange,
  onCurveChange,
  onAutoFade,
  onDeckAVolumeChange,
  onDeckBVolumeChange
}) => {
  const [fadeDuration, setFadeDuration] = useState<number>(4000);
  const [isFading, setIsFading] = useState<boolean>(false);

  const percentA = Math.round(deckAState.effectiveVolume * 100);
  const percentB = Math.round(deckBState.effectiveVolume * 100);

  const handleAutoFadeClick = async (target: number) => {
    setIsFading(true);
    await onAutoFade(target, fadeDuration);
    setIsFading(false);
  };

  return (
    <div className="rack-panel p-4 flex flex-col justify-between h-full border border-zinc-800">
      {/* Mixer Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-500" />
          <span className="text-xs font-mono font-bold tracking-wider text-zinc-200 uppercase">
            MIXER_CORE // 2-CH
          </span>
        </div>
        <div className="text-[11px] font-mono text-zinc-400">
          <span className="text-zinc-600">OUT: </span>
          <span className="text-zinc-200 font-bold">0.0 dB</span>
        </div>
      </div>

      {/* Channel Faders & Meters */}
      <div className="grid grid-cols-2 gap-3 py-3 border-b border-zinc-800">
        {/* Channel 1 */}
        <div className="bg-black p-2.5 border border-zinc-900 flex flex-col items-center justify-between">
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-[10px] font-mono font-bold text-cyan-400">CH_01</span>
            <span className="text-[10px] font-mono text-zinc-400">{Math.round(deckAState.deckVolume * 100)}%</span>
          </div>

          <div className="flex items-center justify-center gap-2.5 my-2 w-full">
            <SharpLedMeter
              level={deckAState.effectiveVolume}
              isPlaying={deckAState.isPlaying}
              label="VU"
            />

            <div className="relative flex items-center justify-center h-36 w-8">
              <div className="absolute -left-3 inset-y-1 flex flex-col justify-between text-[8px] font-mono text-zinc-600 select-none pointer-events-none">
                <span>+6</span>
                <span>0</span>
                <span>-5</span>
                <span>-10</span>
                <span>-20</span>
                <span>-∞</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={deckAState.deckVolume}
                onChange={(e) => onDeckAVolumeChange(parseFloat(e.target.value))}
                className="channel-fader"
                title={`CH 1 Volume: ${Math.round(deckAState.deckVolume * 100)}%`}
              />
            </div>
          </div>
        </div>

        {/* Channel 2 */}
        <div className="bg-black p-2.5 border border-zinc-900 flex flex-col items-center justify-between">
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-[10px] font-mono font-bold text-amber-400">CH_02</span>
            <span className="text-[10px] font-mono text-zinc-400">{Math.round(deckBState.deckVolume * 100)}%</span>
          </div>

          <div className="flex items-center justify-center gap-2.5 my-2 w-full">
            <div className="relative flex items-center justify-center h-36 w-8">
              <div className="absolute -left-3 inset-y-1 flex flex-col justify-between text-[8px] font-mono text-zinc-600 select-none pointer-events-none">
                <span>+6</span>
                <span>0</span>
                <span>-5</span>
                <span>-10</span>
                <span>-20</span>
                <span>-∞</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={deckBState.deckVolume}
                onChange={(e) => onDeckBVolumeChange(parseFloat(e.target.value))}
                className="channel-fader"
                title={`CH 2 Volume: ${Math.round(deckBState.deckVolume * 100)}%`}
              />
            </div>

            <SharpLedMeter
              level={deckBState.effectiveVolume}
              isPlaying={deckBState.isPlaying}
              label="VU"
            />
          </div>
        </div>
      </div>

      {/* Crossfader Section */}
      <div className="pt-3 space-y-2.5">
        {/* Level Readout */}
        <div className="flex items-center justify-between text-[11px] font-mono px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">CH1:</span>
            <span className="font-bold text-cyan-400">{percentA}%</span>
          </div>
          <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">X-FADER</span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-amber-400">{percentB}%</span>
            <span className="text-zinc-500">:CH2</span>
          </div>
        </div>

        {/* Crossfader Track */}
        <div className="relative px-1 pt-1">
          {/* Mechanical Center Ticks */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-6 bg-zinc-400 pointer-events-none z-10" />
          <div className="absolute top-1/2 left-[25%] -translate-y-1/2 w-[1px] h-3 bg-zinc-700 pointer-events-none" />
          <div className="absolute top-1/2 left-[75%] -translate-y-1/2 w-[1px] h-3 bg-zinc-700 pointer-events-none" />

          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={position}
            onChange={(e) => onPositionChange(parseFloat(e.target.value))}
            className="crossfader-input relative z-20"
          />

          <div className="flex justify-between items-center text-[9px] font-mono text-zinc-600 px-0.5 mt-1">
            <span>[DECK_01]</span>
            <span>CENTER</span>
            <span>[DECK_02]</span>
          </div>
        </div>

        {/* Mechanical Controls: Curve & Auto-Fade */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-900">
          {/* Curve Toggles */}
          <div className="flex gap-1 text-[10px] font-mono">
            {(['constant-power', 'linear', 'cut'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onCurveChange(mode)}
                className={`px-2 py-0.5 border ${
                  curve === mode
                    ? 'bg-zinc-200 text-black border-white font-bold'
                    : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                }`}
              >
                {mode === 'constant-power' ? 'PWR' : mode === 'linear' ? 'LIN' : 'CUT'}
              </button>
            ))}
          </div>

          {/* Auto-Fade Transitions */}
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <select
              value={fadeDuration}
              onChange={(e) => setFadeDuration(Number(e.target.value))}
              className="bg-black border border-zinc-800 text-zinc-400 px-1 py-0.5 focus:outline-none"
            >
              <option value={2000}>2s</option>
              <option value={4000}>4s</option>
              <option value={8000}>8s</option>
            </select>

            <button
              onClick={() => handleAutoFadeClick(0)}
              disabled={isFading}
              className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 active:translate-y-[1px] disabled:opacity-40"
            >
              ◀ A
            </button>
            <button
              onClick={() => onPositionChange(0.5)}
              className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 active:translate-y-[1px]"
            >
              MID
            </button>
            <button
              onClick={() => handleAutoFadeClick(1)}
              disabled={isFading}
              className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 active:translate-y-[1px] disabled:opacity-40"
            >
              B ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Sliders, Zap, ArrowLeft, ArrowRight, Gauge } from 'lucide-react';
import { CrossfadeCurve, DeckState } from '../types';

interface CrossfaderSectionProps {
  position: number;
  curve: CrossfadeCurve;
  deckAState: DeckState;
  deckBState: DeckState;
  onPositionChange: (pos: number) => void;
  onCurveChange: (curve: CrossfadeCurve) => void;
  onAutoFade: (target: number, durationMs: number) => void;
}

export const CrossfaderSection: React.FC<CrossfaderSectionProps> = ({
  position,
  curve,
  deckAState,
  deckBState,
  onPositionChange,
  onCurveChange,
  onAutoFade
}) => {
  const [fadeDuration, setFadeDuration] = useState<number>(4000); // 4s default
  const [isFading, setIsFading] = useState<boolean>(false);

  const percentA = Math.round(deckAState.effectiveVolume * 100);
  const percentB = Math.round(deckBState.effectiveVolume * 100);

  const handleAutoFadeClick = async (target: number) => {
    setIsFading(true);
    await onAutoFade(target, fadeDuration);
    setIsFading(false);
  };

  return (
    <div className="bg-[#121620] border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col justify-between">
      {/* Top Bar: Crossfader Title & Curve Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white tracking-wide uppercase">
            Master Crossfader
          </h2>
        </div>

        {/* Curve Mode Pills */}
        <div className="flex items-center gap-1 bg-[#0b0e14] p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => onCurveChange('constant-power')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              curve === 'constant-power'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Equal Power: -3dB smooth crossfade without volume drop"
          >
            Equal Power
          </button>
          <button
            onClick={() => onCurveChange('linear')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              curve === 'linear'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Linear: Standard crossfade"
          >
            Linear
          </button>
          <button
            onClick={() => onCurveChange('cut')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              curve === 'cut'
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Scratch / Cut: Fast sharp drop"
          >
            Cut / Scratch
          </button>
        </div>
      </div>

      {/* Center Mixer Body */}
      <div className="py-6 space-y-6">
        {/* Level Meters */}
        <div className="flex items-center justify-between px-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-cyan-400">DECK A</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/30 text-cyan-300 font-bold">
              {percentA}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <Gauge className="w-3.5 h-3.5" />
            <span>BLEND</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-pink-500/30 text-pink-300 font-bold">
              {percentB}%
            </span>
            <span className="font-bold text-pink-500">DECK B</span>
          </div>
        </div>

        {/* The Crossfader Slider */}
        <div className="relative px-2">
          {/* Track Guides & Center Detent Marker */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-7 bg-slate-500/60 rounded pointer-events-none z-10" />
          <div className="absolute top-1/2 left-[25%] -translate-y-1/2 w-0.5 h-4 bg-slate-700 pointer-events-none" />
          <div className="absolute top-1/2 left-[75%] -translate-y-1/2 w-0.5 h-4 bg-slate-700 pointer-events-none" />

          {/* Slider input */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={position}
            onChange={(e) => onPositionChange(parseFloat(e.target.value))}
            className="fader-slider w-full relative z-20"
          />

          {/* Labels below */}
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 px-1 mt-2">
            <span className="text-cyan-400 font-mono">100% Deck A</span>
            <span className="text-slate-400 font-mono">Center (0.50)</span>
            <span className="text-pink-500 font-mono">100% Deck B</span>
          </div>
        </div>

        {/* Auto-Fade Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Auto-Transition:</span>
            <select
              value={fadeDuration}
              onChange={(e) => setFadeDuration(Number(e.target.value))}
              className="bg-[#0b0e14] border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value={2000}>2s (Fast)</option>
              <option value={4000}>4s (Standard)</option>
              <option value={8000}>8s (Long Mix)</option>
              <option value={16000}>16s (Extended)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAutoFadeClick(0)}
              disabled={isFading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition-all disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Fade to A</span>
            </button>

            <button
              onClick={() => onPositionChange(0.5)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition-all"
            >
              Center
            </button>

            <button
              onClick={() => handleAutoFadeClick(1)}
              disabled={isFading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-pink-500/30 text-pink-300 text-xs font-bold transition-all disabled:opacity-50"
            >
              <span>Fade to B</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

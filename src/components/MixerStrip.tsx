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

// How the crossfader splits volume between the decks.
const CURVES: { id: CrossfadeCurve; label: string; hint: string }[] = [
  { id: 'constant-power', label: 'SMOOTH', hint: 'One song fades out as the other fades in. Overall volume stays even. Best for blending.' },
  { id: 'linear', label: 'PUNCHY', hint: 'Both stay at full volume until the fader passes the middle, so the overlap is louder.' },
  { id: 'cut', label: 'CUT', hint: 'Both play at full; a deck only drops out at the very end of the fader. For quick cuts.' }
];

const ChannelFader: React.FC<{ label: string; color: string; value: number; onChange: (v: number) => void }> = ({ label, color, value, onChange }) => (
  <div className="flex flex-col items-center gap-1">
    <span className={`text-[11px] font-bold ${color}`}>{label}</span>
    <div className="h-36 w-8 flex items-center justify-center">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="channel-fader"
        title={`${label} volume`}
      />
    </div>
    <span className="text-[11px] text-zinc-400">{Math.round(value * 100)}%</span>
  </div>
);

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

  const handleAutoFade = async (target: number) => {
    setIsFading(true);
    await onAutoFade(target, fadeDuration);
    setIsFading(false);
  };

  const selectedCurve = CURVES.find(c => c.id === curve) ?? CURVES[0];
  const button = 'px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40';

  return (
    <div className="rack-panel p-4 flex flex-col gap-4 h-full font-mono">
      <span className="text-sm font-bold text-zinc-200">MIXER</span>

      {/* Channel volumes */}
      <div className="flex justify-center gap-12">
        <ChannelFader label="DECK 1" color="text-cyan-400" value={deckAState.deckVolume} onChange={onDeckAVolumeChange} />
        <ChannelFader label="DECK 2" color="text-amber-400" value={deckBState.deckVolume} onChange={onDeckBVolumeChange} />
      </div>

      {/* Crossfader */}
      <div className="mt-auto space-y-3 border-t border-zinc-800 pt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-cyan-400">1 · {Math.round(deckAState.effectiveVolume * 100)}%</span>
          <span className="text-zinc-500">CROSSFADER</span>
          <span className="text-amber-400">{Math.round(deckBState.effectiveVolume * 100)}% · 2</span>
        </div>

        <input
          type="range"
          min="0"
          max="1"
          step="0.005"
          value={position}
          onChange={(e) => onPositionChange(parseFloat(e.target.value))}
          className="crossfader-input w-full"
        />

        {/* Auto-fade */}
        <div className="flex items-center justify-center gap-1 text-[11px]">
          <button onClick={() => handleAutoFade(0)} disabled={isFading} className={button}>◀ Fade to 1</button>
          <button onClick={() => onPositionChange(0.5)} className={button}>Middle</button>
          <button onClick={() => handleAutoFade(1)} disabled={isFading} className={button}>Fade to 2 ▶</button>
          <select
            value={fadeDuration}
            onChange={(e) => setFadeDuration(Number(e.target.value))}
            className="bg-black border border-zinc-800 text-zinc-400 px-1 py-1 focus:outline-none"
            title="Fade length"
          >
            <option value={2000}>2s</option>
            <option value={4000}>4s</option>
            <option value={8000}>8s</option>
            <option value={16000}>16s</option>
          </select>
        </div>

        {/* Fade curve */}
        <div className="space-y-1.5">
          <div className="flex justify-center gap-1 text-[11px]">
            {CURVES.map(c => (
              <button
                key={c.id}
                onClick={() => onCurveChange(c.id)}
                className={`px-2.5 py-1 border ${
                  curve === c.id ? 'bg-zinc-200 text-black border-white font-bold' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 text-center leading-snug">{selectedCurve.hint}</p>
        </div>
      </div>
    </div>
  );
};

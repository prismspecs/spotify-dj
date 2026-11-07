import React from 'react';
import { Settings, Sparkles } from 'lucide-react';
import { DeckState } from '../types';

interface NavbarProps {
  deckAState: DeckState;
  deckBState: DeckState;
  onOpenSettings: () => void;
  onLoadDemoTracks: () => void;
  isDemoActive: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  deckAState,
  deckBState,
  onOpenSettings,
  onLoadDemoTracks,
  isDemoActive
}) => {
  return (
    <header className="border-b border-zinc-800 bg-black px-4 py-2 sticky top-0 z-40 font-mono">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Console System ID */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-950 px-2.5 py-1 border border-zinc-800">
            <span className="w-1.5 h-1.5 bg-emerald-500" />
            <span className="text-xs font-bold tracking-wider text-zinc-100">
              DUAL_DECK_DJ
            </span>
            <span className="text-[10px] text-zinc-600 border-l border-zinc-800 pl-2">
              REV_2.0
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 hidden sm:inline">
            // SPOTIFY_INDEPENDENT_SINK
          </span>
        </div>

        {/* Bus Status */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 border border-zinc-900">
            <span className={`w-1.5 h-1.5 ${deckAState.user ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
            <span className="text-zinc-500 text-[10px]">CH1:</span>
            <span className="text-zinc-200 text-[11px] font-semibold truncate max-w-[100px] uppercase">
              {deckAState.user?.display_name || (deckAState.isDemo ? 'DEMO' : 'OFFLINE')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 border border-zinc-900">
            <span className={`w-1.5 h-1.5 ${deckBState.user ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
            <span className="text-zinc-500 text-[10px]">CH2:</span>
            <span className="text-zinc-200 text-[11px] font-semibold truncate max-w-[100px] uppercase">
              {deckBState.user?.display_name || (deckBState.isDemo ? 'DEMO' : 'OFFLINE')}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onLoadDemoTracks}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors ${
              isDemoActive
                ? 'bg-amber-950 border-amber-600 text-amber-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
            }`}
            title="Load internal demo grooves"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">DEMO_GROOVES</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 transition-colors"
            title="Settings & Client ID"
          >
            <Settings className="w-3 h-3 text-zinc-400" />
            <span>CONFIG</span>
          </button>
        </div>
      </div>
    </header>
  );
};

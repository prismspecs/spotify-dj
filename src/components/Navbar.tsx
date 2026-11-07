import React from 'react';
import { Settings } from 'lucide-react';

interface NavbarProps {
  onOpenSetup: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSetup }) => (
  <header className="border-b border-zinc-800 bg-black px-4 py-2 sticky top-0 z-40 font-mono">
    <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
      <span className="text-sm font-bold text-zinc-100">DUAL DECK DJ</span>
      <button
        onClick={onOpenSetup}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200"
        title="Spotify app and account linking"
      >
        <Settings className="w-3 h-3 text-zinc-400" />
        <span>Setup</span>
      </button>
    </div>
  </header>
);

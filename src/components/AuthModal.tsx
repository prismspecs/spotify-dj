import React, { useState } from 'react';
import { X, LogIn, KeyRound, AlertTriangle, ChevronDown } from 'lucide-react';
import { initiateSpotifyLogin, getStoredClientId, setStoredToken } from '../services/spotifyAuth';

interface AuthModalProps {
  isOpen: boolean;
  deckId: 'A' | 'B' | null;
  onClose: () => void;
  onSuccess: () => void;
  onOpenSettings: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  deckId,
  onClose,
  onSuccess,
  onOpenSettings
}) => {
  const [directToken, setDirectToken] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isOpen || !deckId) return null;

  const isA = deckId === 'A';
  const deckNum = isA ? '01' : '02';
  const accentText = isA ? 'text-cyan-400' : 'text-amber-400';
  const clientId = getStoredClientId();

  const handleOAuthLogin = async () => {
    setAuthError(null);
    if (!clientId) {
      setAuthError('ENTER SPOTIFY CLIENT ID IN CONFIG FIRST.');
      return;
    }

    try {
      await initiateSpotifyLogin(deckId);
    } catch (e: any) {
      setAuthError(e?.message || 'LOGIN INITIATION FAILED');
    }
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directToken.trim()) return;

    setStoredToken(deckId, directToken.trim());
    setDirectToken('');
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm font-mono">
      <div className="bg-zinc-950 border border-zinc-700 w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-black">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            AUTHENTICATE // DECK_<span className={accentText}>{deckNum}</span>
          </span>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 text-xs">
          <p className="text-zinc-400 leading-relaxed text-[11px]">
            LINK DECK_{deckNum} TO AN INDEPENDENT SPOTIFY ACCOUNT. DECK_01 AND DECK_02 REQUIRE SEPARATE ACCOUNTS FOR CONCURRENT DUAL-STREAMING.
          </p>
          {!isA && (
            <p className="text-amber-400 leading-relaxed text-[11px]">
              SPOTIFY WILL SHOW THE ACCOUNT ALREADY LOGGED IN (DECK_01'S). CLICK "NOT YOU?" ON SPOTIFY'S PAGE AND LOG IN WITH THE SECOND ACCOUNT.
            </p>
          )}

          {authError && (
            <div className="p-2 bg-red-950/40 border border-red-900 text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Primary Action */}
          <div className="pt-1">
            {clientId ? (
              <button
                onClick={handleOAuthLogin}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 uppercase active:translate-y-[1px]"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>LINK_SPOTIFY_ACCOUNT_FOR_DECK_{deckNum}</span>
              </button>
            ) : (
              <div className="p-2.5 bg-black border border-zinc-800 flex items-center justify-between gap-2">
                <span className="text-zinc-500 text-[11px]">CLIENT ID NOT SET</span>
                <button
                  onClick={onOpenSettings}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold"
                >
                  OPEN_CONFIG
                </button>
              </div>
            )}
          </div>

          {/* Manual Token */}
          <details className="border-t border-zinc-800 pt-2.5 group">
            <summary className="flex items-center justify-between text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer list-none py-1 uppercase">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3 h-3 text-zinc-500" />
                <span>MANUAL TOKEN OVERRIDE</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            </summary>

            <div className="mt-2 space-y-2">
              <form onSubmit={handleManualTokenSubmit} className="flex gap-1">
                <input
                  type="password"
                  value={directToken}
                  onChange={(e) => setDirectToken(e.target.value)}
                  placeholder="Paste user Bearer token..."
                  className="flex-1 px-2.5 py-1 bg-black border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!directToken.trim()}
                  className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 disabled:opacity-30"
                >
                  SET
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

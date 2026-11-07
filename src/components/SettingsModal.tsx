import React, { useState } from 'react';
import { X, Key, Shield, Check, Copy, AlertTriangle, ChevronDown } from 'lucide-react';
import { getStoredClientId, setStoredClientId, getStoredToken, setStoredToken, getAppRedirectUri } from '../services/spotifyAuth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokensUpdated: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onTokensUpdated }) => {
  const [clientId, setClientId] = useState(getStoredClientId());
  const [tokenA, setTokenA] = useState(getStoredToken('A') || '');
  const [tokenB, setTokenB] = useState(getStoredToken('B') || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  if (!isOpen) return null;

  const currentRedirectUri = getAppRedirectUri();

  const handleSave = () => {
    setStoredClientId(clientId);
    if (tokenA.trim()) setStoredToken('A', tokenA.trim());
    if (tokenB.trim()) setStoredToken('B', tokenB.trim());

    setSavedSuccess(true);
    onTokensUpdated();
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(currentRedirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm font-mono">
      <div className="bg-zinc-950 border border-zinc-700 w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-black">
          <div className="flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-zinc-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              CONSOLE_CONFIG // API_KEYS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto text-xs">
          {/* Note */}
          <div className="p-2.5 bg-black border border-zinc-800 text-zinc-400 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-zinc-300 text-[10px]">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>DUAL_STREAM_ENFORCEMENT</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Spotify restricts individual accounts to 1 concurrent playback thread. Two distinct accounts are assigned to Deck 1 & Deck 2 for seamless crossfading.
            </p>
          </div>

          {/* Spotify Client ID */}
          <div className="space-y-1">
            <label className="block text-[11px] text-zinc-300 uppercase font-bold">
              SPOTIFY_CLIENT_ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="32-character Client ID from your Spotify app dashboard"
              className="w-full px-2.5 py-1.5 bg-black border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
            />
          </div>

          {/* Redirect URI Box */}
          <div className="space-y-1 bg-black p-2.5 border border-zinc-800">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span className="uppercase font-bold">REDIRECT_URI (127.0.0.1 REQUIRED):</span>
              <button
                onClick={copyRedirectUri}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold"
              >
                {copiedRedirect ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedRedirect ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
            <code className="block text-[11px] text-zinc-200 bg-zinc-900 px-2 py-1 border border-zinc-800 select-all">
              {currentRedirectUri}
            </code>
            <p className="text-[10px] text-amber-500 flex items-center gap-1 pt-0.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>Do not enter localhost. Spotify enforces 127.0.0.1 loopback literal.</span>
            </p>
          </div>

          {/* Manual Token Overrides */}
          <details className="border-t border-zinc-800 pt-2.5 group">
            <summary className="flex items-center justify-between text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer list-none py-1 uppercase font-bold">
              <span>MANUAL ACCESS TOKEN OVERRIDES (DEV ONLY)</span>
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            </summary>

            <div className="mt-2 space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase">DECK_01_TOKEN</label>
                <input
                  type="password"
                  value={tokenA}
                  onChange={(e) => setTokenA(e.target.value)}
                  placeholder="Bearer BQC..."
                  className="w-full px-2 py-1 bg-black border border-zinc-800 text-xs text-zinc-300 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase">DECK_02_TOKEN</label>
                <input
                  type="password"
                  value={tokenB}
                  onChange={(e) => setTokenB(e.target.value)}
                  placeholder="Bearer BQC..."
                  className="w-full px-2 py-1 bg-black border border-zinc-800 text-xs text-zinc-300 focus:outline-none"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-zinc-800 bg-black">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs text-zinc-400 hover:text-white border border-transparent hover:border-zinc-700"
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs active:translate-y-[1px]"
          >
            {savedSuccess && <Check className="w-3 h-3" />}
            <span>{savedSuccess ? 'SAVED' : 'SAVE_CONFIG'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

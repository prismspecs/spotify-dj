import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, AlertTriangle, ChevronDown } from 'lucide-react';
import {
  getStoredClientId,
  setStoredClientId,
  setStoredToken,
  getAppRedirectUri,
  initiateSpotifyLogin
} from '../services/spotifyAuth';
import { DeckState } from '../types';

const DASHBOARD_URL = 'https://developer.spotify.com/dashboard';
const ACCOUNT_URL = 'https://www.spotify.com/account/overview/';

type StepState = 'done' | 'todo' | 'problem';

interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckA: DeckState;
  deckB: DeckState;
  /** Re-check both decks (after a new Client ID or a pasted token). */
  onConfigChanged: () => void;
  onUnlink: (deckId: 'A' | 'B') => void;
}

const Badge: React.FC<{ state: StepState; text?: string }> = ({ state, text }) => {
  const styles = {
    done: 'border-emerald-700 text-emerald-400',
    todo: 'border-zinc-700 text-zinc-400',
    problem: 'border-red-800 text-red-400'
  }[state];
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 border text-[10px] whitespace-nowrap ${styles}`}>
      {state === 'done' && <Check className="w-3 h-3" />}
      {state === 'problem' && <AlertTriangle className="w-3 h-3" />}
      {text ?? { done: 'Done', todo: 'To do', problem: 'Problem' }[state]}
    </span>
  );
};

const Step: React.FC<{ n: number; title: string; state: StepState; badgeText?: string; children: React.ReactNode }> = ({
  n, title, state, badgeText, children
}) => (
  <section className="border border-zinc-800 bg-black p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-bold text-zinc-100">
        <span className="text-zinc-500">{n}.</span> {title}
      </h3>
      <Badge state={state} text={badgeText} />
    </div>
    <div className="text-[11px] text-zinc-400 leading-relaxed space-y-2">{children}</div>
  </section>
);

const Link: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 underline">
    {children}
    <ExternalLink className="w-2.5 h-2.5" />
  </a>
);

function deckStepState(deck: DeckState): { state: StepState; badge: string } {
  if (deck.authProblem) return { state: 'problem', badge: deck.authProblem === 'not-allowed' ? 'Not allowed yet' : 'Login expired' };
  if (deck.token) return { state: 'done', badge: deck.user ? `Linked: ${deck.user.display_name}` : 'Linked' };
  return { state: 'todo', badge: 'Not linked' };
}

export const SetupModal: React.FC<SetupModalProps> = ({ isOpen, onClose, deckA, deckB, onConfigChanged, onUnlink }) => {
  const [clientId, setClientId] = useState(getStoredClientId());
  const [savedId, setSavedId] = useState(getStoredClientId());
  const [copied, setCopied] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');

  if (!isOpen) return null;

  const redirectUri = getAppRedirectUri();
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const hasClientId = !!savedId;

  const saveClientId = () => {
    setStoredClientId(clientId);
    setSavedId(clientId.trim());
    onConfigChanged();
  };

  const copyRedirect = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const link = async (deckId: 'A' | 'B') => {
    setLoginError(null);
    const other = deckId === 'A' ? deckB : deckA;
    try {
      // With the other deck linked, the browser is signed in to Spotify as that
      // account; sign out first so Spotify asks which account to use.
      await initiateSpotifyLogin(deckId, !!other.token);
    } catch (e: any) {
      setLoginError(e?.message || 'Could not start the Spotify login.');
    }
  };

  const savePastedTokens = () => {
    if (tokenA.trim()) setStoredToken('A', tokenA.trim());
    if (tokenB.trim()) setStoredToken('B', tokenB.trim());
    setTokenA('');
    setTokenB('');
    onConfigChanged();
  };

  const a = deckStepState(deckA);
  const b = deckStepState(deckB);
  const step2: StepState = deckB.authProblem === 'not-allowed' ? 'problem' : deckB.token && !deckB.authProblem ? 'done' : 'todo';

  const deckLinkBody = (deckId: 'A' | 'B', deck: DeckState) => {
    const other = deckId === 'A' ? deckB : deckA;
    return (
      <>
        {deckId === 'A' ? (
          <p>Log in with the Spotify account that owns the app from step 1.</p>
        ) : (
          <p>
            Log in with your <b className="text-zinc-200">second</b> Spotify account (the one from step 2).
            {other.token && ' This first signs this browser out of Spotify, so the login page lets you pick another account. Deck 1 stays linked.'}
          </p>
        )}
        {deck.authProblem === 'not-allowed' && (
          <p className="text-red-300">Spotify refused this account: it isn't on your app's User Management list yet. Do step 2, then press Retry on the deck.</p>
        )}
        {deck.authProblem === 'login-invalid' && (
          <p className="text-red-300">This login no longer works. Unlink, then log in again.</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => link(deckId)}
            disabled={!hasClientId}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-bold"
          >
            {deck.token ? 'Log in again' : deckId === 'A' ? 'Log in to Spotify' : 'Log in with second account'}
          </button>
          {deck.token && (
            <button onClick={() => onUnlink(deckId)} className="px-3 py-1.5 border border-zinc-700 text-zinc-300 hover:text-red-300 text-[11px]">
              Unlink
            </button>
          )}
        </div>
        {!hasClientId && <p className="text-zinc-500">Finish step 1 first.</p>}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm font-mono">
      <div className="bg-zinc-950 border border-zinc-700 w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-black">
          <h2 className="text-xs font-bold text-zinc-100">Setup</h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto text-xs">
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Spotify plays one song at a time per account, so each deck uses its own Spotify account. Both accounts need <b className="text-zinc-200">Premium</b>. You do steps 1 and 2 once.
          </p>

          {loginError && (
            <div className="p-2 bg-red-950/40 border border-red-900 text-red-300 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <Step n={1} title="Create a Spotify app" state={hasClientId ? 'done' : 'todo'}>
            <p>
              A "Spotify app" is just a permission slip that lets this site talk to Spotify. Make it with your <b className="text-zinc-200">first</b> account (the one for Deck 1):
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open the <Link href={DASHBOARD_URL}>Spotify developer dashboard</Link> and log in.</li>
              <li>Click <b className="text-zinc-200">Create app</b>. Any name and description. Tick <b className="text-zinc-200">Web API</b> and <b className="text-zinc-200">Web Playback SDK</b>.</li>
              <li>
                Under <b className="text-zinc-200">Redirect URIs</b>, add exactly:
                <span className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-[11px] text-zinc-200 bg-zinc-900 px-2 py-1 border border-zinc-800 select-all break-all">{redirectUri}</code>
                  <button onClick={copyRedirect} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[10px] font-bold">
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </span>
                {isLocal && <span className="block text-amber-500 mt-1">Running locally: use this 127.0.0.1 address. Spotify rejects "localhost".</span>}
              </li>
              <li>Save, then copy the app's <b className="text-zinc-200">Client ID</b> and paste it here:</li>
            </ol>
            <div className="flex gap-2">
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="32-character Client ID"
                className="flex-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={saveClientId}
                disabled={!clientId.trim() || clientId.trim() === savedId}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-bold"
              >
                Save
              </button>
            </div>
          </Step>

          <Step n={2} title="Allow your second account" state={step2} badgeText={step2 === 'problem' ? 'Not allowed yet' : undefined}>
            <p>
              Your app only works for accounts you list. Your second account never touches the developer site; you add it by email:
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Find the second account's email: log in as it at <Link href={ACCOUNT_URL}>spotify.com/account</Link> (a private window is easiest).
              </li>
              <li>
                In the <Link href={DASHBOARD_URL}>developer dashboard</Link> (as your first account), open your app, then <b className="text-zinc-200">Settings → User Management</b>.
              </li>
              <li>Add any name and that exact email, then save.</li>
            </ol>
          </Step>

          <Step n={3} title="Link Deck 1" state={a.state} badgeText={a.badge}>
            {deckLinkBody('A', deckA)}
          </Step>

          <Step n={4} title="Link Deck 2" state={b.state} badgeText={b.badge}>
            {deckLinkBody('B', deckB)}
          </Step>

          <details className="group border-t border-zinc-800 pt-2">
            <summary className="flex items-center justify-between text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer list-none py-1">
              <span>Advanced: paste access tokens instead of logging in</span>
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 space-y-2">
              <input
                type="password"
                value={tokenA}
                onChange={(e) => setTokenA(e.target.value)}
                placeholder="Deck 1 access token"
                className="w-full px-2 py-1 bg-black border border-zinc-800 text-xs text-zinc-300 focus:outline-none"
              />
              <input
                type="password"
                value={tokenB}
                onChange={(e) => setTokenB(e.target.value)}
                placeholder="Deck 2 access token"
                className="w-full px-2 py-1 bg-black border border-zinc-800 text-xs text-zinc-300 focus:outline-none"
              />
              <button
                onClick={savePastedTokens}
                disabled={!tokenA.trim() && !tokenB.trim()}
                className="px-3 py-1 border border-zinc-700 text-zinc-200 text-[11px] disabled:opacity-30"
              >
                Use these tokens
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

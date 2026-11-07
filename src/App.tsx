import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Deck } from './components/Deck';
import { MixerStrip } from './components/MixerStrip';
import { PlaylistManager } from './components/PlaylistManager';
import { SetupModal } from './components/SetupModal';
import { playerManager } from './services/playerManager';
import {
  handleAuthCallback,
  getValidToken,
  getStoredClientId,
  clearStoredToken,
  fetchUserProfile,
  SpotifyRequestError,
} from './services/spotifyAuth';
import { Track, DeckState, CrossfadeCurve, SpotifyUser } from './types';

export const App: React.FC = () => {
  const [deckAState, setDeckAState] = useState<DeckState>(playerManager.getDeckState('A'));
  const [deckBState, setDeckBState] = useState<DeckState>(playerManager.getDeckState('B'));
  const [crossfadePos, setCrossfadePos] = useState<number>(0.5);
  const [crossfadeCurve, setCrossfadeCurve] = useState<CrossfadeCurve>('constant-power');

  // Opens by itself on a first visit, when there's no Spotify app set up yet.
  const [isSetupOpen, setIsSetupOpen] = useState(() => !getStoredClientId());
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Subscribe to PlayerManager updates
  useEffect(() => {
    const unsubscribe = playerManager.subscribe((deckId, partial) => {
      if (deckId === 'A') {
        setDeckAState(prev => ({ ...prev, ...partial }));
      } else {
        setDeckBState(prev => ({ ...prev, ...partial }));
      }
    });

    return unsubscribe;
  }, []);

  // Spotify user id linked to each deck (only ids confirmed by /me).
  const accountIds = useRef<{ A?: string; B?: string }>({});

  // Initialize and check tokens on startup
  const initDeckAuth = useCallback(async (deckId: 'A' | 'B') => {
    const token = await getValidToken(deckId);
    console.log(`[Deck ${deckId}] startup: ${token ? 'has a saved Spotify login' : 'no Spotify login saved'}`);
    if (!token) return;
    // Mark the deck linked right away; the profile request can take seconds.
    playerManager.updateDeckState(deckId, { token });

    try {
      let user: SpotifyUser | null = null;
      try {
        user = await fetchUserProfile(token, deckId);
      } catch (e) {
        // Spotify refusing the account outright: the player would fail too, so say why.
        if (e instanceof SpotifyRequestError && (e.status === 401 || e.status === 403)) {
          playerManager.disconnectDeck(deckId);
          playerManager.updateDeckState(deckId, {
            status: 'ERROR',
            authProblem: e.status === 403 ? 'not-allowed' : 'login-invalid',
            errorMessage: e.status === 403
              ? 'SPOTIFY HASN\'T ALLOWED THIS ACCOUNT ON YOUR APP YET. OPEN SETUP AND DO STEP 2 ("ALLOW YOUR SECOND ACCOUNT"), THEN PRESS RETRY.'
              : 'THIS SPOTIFY LOGIN STOPPED WORKING. OPEN SETUP, UNLINK THIS DECK, AND LOG IN AGAIN.'
          });
          return;
        }
        // Network trouble or rate limiting: carry on without the name.
      }
      playerManager.updateDeckState(deckId, user ? { user, authProblem: null } : { authProblem: null });

      // Both decks on one account can't work: Spotify allows one stream per
      // account, so starting one deck would stop the other.
      if (user) {
        accountIds.current[deckId] = user.id;
        if (accountIds.current.A && accountIds.current.A === accountIds.current.B) {
          playerManager.disconnectDeck('B');
          playerManager.updateDeckState('B', {
            status: 'ERROR',
            errorMessage: 'SAME SPOTIFY ACCOUNT AS DECK_01. DISCONNECT AND LINK A SECOND ACCOUNT.'
          });
          showToast('BOTH DECKS ARE THE SAME SPOTIFY ACCOUNT. RELINK DECK_02 WITH A SECOND ACCOUNT.', 'error');
          if (deckId === 'B') return;
        }
      }

      await playerManager.initSpotifyPlayer(deckId, user?.id ?? null);
    } catch (e) {
      console.warn(`Could not initialize Deck ${deckId} session:`, e);
    }
  }, []);

  // Startup: finish a Spotify login redirect if there is one, then connect
  // both decks. Runs once; React StrictMode would otherwise run it twice and,
  // during a relink, connect a deck with the old account's token.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const result = await handleAuthCallback();
        if (result) {
          showToast(`DECK_${result.deckId === 'A' ? '01' : '02'} AUTHENTICATED.`, 'success');
        }
      } catch (err: any) {
        showToast(err?.message || 'AUTH_FAILURE', 'error');
      }
      await Promise.all([initDeckAuth('A'), initDeckAuth('B')]);
    })();
  }, [initDeckAuth]);

  const handleDisconnect = (deckId: 'A' | 'B') => {
    clearStoredToken(deckId);
    delete accountIds.current[deckId];
    playerManager.disconnectDeck(deckId);
    playerManager.updateDeckState(deckId, {
      token: null,
      user: null,
      isReady: false,
      status: 'IDLE',
      isPlaying: false,
      errorMessage: null,
      authProblem: null
    });
    showToast(`DECK_${deckId === 'A' ? '01' : '02'} DISCONNECTED`, 'info');
  };

  // The deck's Retry button: reconnect a stuck Spotify player (re-checking the
  // account first), otherwise try playing again.
  const handleRetry = (deckId: 'A' | 'B') => {
    if (playerManager.needsSpotifyReconnect(deckId)) {
      console.log(`[Deck ${deckId}] Retry: reconnecting Spotify`);
      playerManager.disconnectDeck(deckId);
      playerManager.updateDeckState(deckId, { errorMessage: null });
      initDeckAuth(deckId);
    } else {
      playerManager.togglePlay(deckId);
    }
  };

  const handleCrossfadeChange = (pos: number) => {
    setCrossfadePos(pos);
    playerManager.setCrossfadePosition(pos);
  };

  const handleCurveChange = (curve: CrossfadeCurve) => {
    setCrossfadeCurve(curve);
    playerManager.setCrossfadeCurve(curve);
  };

  const handleAutoFade = async (target: number, durationMs: number) => {
    // The on-screen fader follows the fade as it runs.
    await playerManager.animateCrossfade(target, durationMs, setCrossfadePos);
  };

  // "+" next to a song: queue it on the deck, or cue it if the deck is empty.
  const handleQueueTrack = (deckId: 'A' | 'B', track: Track) => {
    if (!playerManager.getDeckState(deckId).currentTrack) {
      handleLoadTrackToDeck(deckId, track);
      return;
    }
    const position = playerManager.enqueue(deckId, track);
    showToast(`QUEUED "${track.name}" ON DECK ${deckId === 'A' ? '1' : '2'} (#${position}).`, 'success');
  };

  // DECK 1 / DECK 2 on a song: put it on the deck right away. A deck that was
  // playing keeps playing (the new song); an idle deck cues it and waits for PLAY.
  const handleLoadTrackToDeck = async (deckId: 'A' | 'B', track: Track) => {
    const deckName = `DECK ${deckId === 'A' ? '1' : '2'}`;
    const wasPlaying = playerManager.getDeckState(deckId).isPlaying;
    try {
      await playerManager.loadTrack(deckId, track, wasPlaying);
      showToast(wasPlaying ? `NOW PLAYING "${track.name}" ON ${deckName}.` : `CUED "${track.name}" ON ${deckName}. PRESS PLAY WHEN READY.`, 'success');
    } catch (err: any) {
      showToast(err?.message || `LOAD ERROR ON ${deckName}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-200 flex flex-col justify-between font-mono antialiased">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-3 right-3 z-50 px-3 py-1.5 border text-xs font-mono font-bold shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'bg-black border-emerald-500 text-emerald-400'
              : toast.type === 'error'
              ? 'bg-black border-rose-500 text-rose-400'
              : 'bg-black border-zinc-500 text-zinc-200'
          }`}
        >
          [{toast.type.toUpperCase()}]: {toast.text}
        </div>
      )}

      {/* Top Navigation */}
      <Navbar onOpenSetup={() => setIsSetupOpen(true)} />

      {/* Main Console Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-2.5 sm:p-4 space-y-3">
        {/* Top Tier: Dual CDJ Decks & Central Audio Mixer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
          {/* Deck 01 (Left) */}
          <div className="lg:col-span-4 flex flex-col">
            <Deck
              deckId="A"
              state={deckAState}
              onTogglePlay={() => playerManager.togglePlay('A')}
              onSeek={(pos) => playerManager.seek('A', pos)}
              onConnect={() => setIsSetupOpen(true)}
              onDisconnect={() => handleDisconnect('A')}
              onRetry={() => handleRetry('A')}
            />
          </div>

          {/* Central 2-Channel DJ Mixer Strip (Middle) */}
          <div className="lg:col-span-4 flex flex-col">
            <MixerStrip
              position={crossfadePos}
              curve={crossfadeCurve}
              deckAState={deckAState}
              deckBState={deckBState}
              onPositionChange={handleCrossfadeChange}
              onCurveChange={handleCurveChange}
              onAutoFade={handleAutoFade}
              onDeckAVolumeChange={(vol) => playerManager.setDeckVolume('A', vol)}
              onDeckBVolumeChange={(vol) => playerManager.setDeckVolume('B', vol)}
            />
          </div>

          {/* Deck 02 (Right) */}
          <div className="lg:col-span-4 flex flex-col">
            <Deck
              deckId="B"
              state={deckBState}
              onTogglePlay={() => playerManager.togglePlay('B')}
              onSeek={(pos) => playerManager.seek('B', pos)}
              onConnect={() => setIsSetupOpen(true)}
              onDisconnect={() => handleDisconnect('B')}
              onRetry={() => handleRetry('B')}
            />
          </div>
        </div>

        {/* Bottom Tier: Track Crate & Shared Library */}
        <PlaylistManager
          tokenA={deckAState.token}
          tokenB={deckBState.token}
          onLoadTrackToDeck={handleLoadTrackToDeck}
          onQueueTrack={handleQueueTrack}
          onConnectDeck={() => setIsSetupOpen(true)}
          currentTrackA={deckAState.currentTrack}
          currentTrackB={deckBState.currentTrack}
        />
      </main>

      {/* Modals */}
      <SetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        deckA={deckAState}
        deckB={deckBState}
        onConfigChanged={() => {
          initDeckAuth('A');
          initDeckAuth('B');
        }}
        onUnlink={handleDisconnect}
      />
    </div>
  );
};

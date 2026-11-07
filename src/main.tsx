import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { installDevLog } from './devLog';
import { getStoredClientId, setStoredClientId } from './services/spotifyAuth';

if (import.meta.env.DEV) {
  installDevLog();
  // Handy for poking at decks from the browser console.
  import('./services/playerManager').then(m => ((window as any).__playerManager = m.playerManager));
}

// The app runs on localhost. Spotify only accepts a loopback IP (127.0.0.1) as
// its login redirect, but YouTube refuses to play embeds on an IP-address page.
// So Spotify's redirect to 127.0.0.1 is forwarded here with its query intact
// (the login code); the PKCE verifier is already in localhost's storage.
if (window.location.hostname === '127.0.0.1') {
  const url = new URL(window.location.href);
  url.hostname = 'localhost';
  // Carry the (public) Client ID over from older 127.0.0.1 setups.
  const clientId = getStoredClientId();
  if (clientId && !url.searchParams.has('code')) url.hash = `client_id=${encodeURIComponent(clientId)}`;
  window.location.replace(url.toString());
} else {
  const carried = new URLSearchParams(window.location.hash.slice(1)).get('client_id');
  if (carried) {
    if (!getStoredClientId()) setStoredClientId(carried);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

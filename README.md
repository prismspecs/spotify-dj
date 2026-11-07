# Spotify Dual DJ Console 🎛️

A brutalist, zero-radius dual-deck DJ web application engineered to bypass Spotify's single-stream restriction by running **two independent Spotify accounts side-by-side on one screen** with a real-time DJ crossfader, channel faders, VU meters, and a shared playlist crate. Either deck can also play **YouTube**, so you can mix Spotify against YouTube with a single Spotify account.

---

## 🎯 The Problem: Why Two Spotify Accounts?

Spotify strictly enforces a **1-stream-at-a-time limit** per user account:
- If you start playing Song B while Song A is playing on the same account, Spotify immediately cuts audio to Song A or steals playback to the new device.
- Major DJ software (djay Pro, Rekordbox, Serato) dropped Spotify support years ago due to DRM policies and licensing restrictions.

### The Solution:
This application runs **two isolated Spotify Web Playback SDK instances** simultaneously in the browser:
- **DECK 01** (Cyan Bus) connects to **Spotify Account 1**.
- **DECK 02** (Amber Bus) connects to **Spotify Account 2**.
- Both decks query the **same track catalog, search bar, or shared playlist URL**.
- A **Master Crossfader** modulates the streaming volume in real time using true acoustic DJ mixer curves (Equal Power -3dB, Linear, or Scratch Cut).
- You can cue, blend, and crossfade between tracks continuously without audio dropping or Spotify halting the stream.

---

## 🎚️ Hardware Aesthetic & Design Philosophy

Inspired by industrial audio consoles, modular synthesizers, and hardware mixers (Teenage Engineering, Eurorack, Allen & Heath):
- **Zero Rounded Corners**: Strictly sharp hardware edges (`border-radius: 0`).
- **Tactile Transport Keys**: High-contrast mechanical `[PLAY]`, `[PAUSE]`, and `[CUE]` keys with live status backlighting.
- **Data-Dense Monospace Typography**: Built entirely with `JetBrains Mono` for precise timecodes, BPM indicators, and system logs.
- **Analog Hardware Feedback**: 7-segment LED VU meters with green-yellow-red thresholds, dual vertical channel gain faders, and tactile waveform seekbars.

---

## ✨ Features

### 1. Dual Independent Decks (Deck 01 & Deck 02)
- **Real-Time Waveform Beatgrid**: Live position tracking, interactive click-to-seek, and elapsed/remaining monospace timecodes (`0:00` / `-3:45`).
- **Square Monochrome Album Art**: Hover play/pause overlay, click-to-toggle playback.
- **Hardware Status Monitoring**: Real-time status reporting (`STANDBY`, `READY TO PLAY`, `CONNECTING_DEVICE...`, `NOW PLAYING`, `PLAYBACK_ERROR`).
- **Account Tier Detection**: Inspects whether the authenticated account is `PREMIUM` or `FREE (NO STREAMING)`.

### 2. 2-Channel DJ Mixer Strip
- **Master Crossfader**: Smooth horizontal fader with percentage readouts (`100% 01 | 0% 02` -> `71% | 71%` -> `0% 01 | 100% 02`).
- **Selectable Transition Curves**:
  - **Equal Power (Constant-Power -3dB)**: Acoustic energy is conserved at center (0.707 gain on both channels) so volume never dips during transitions.
  - **Linear**: Both decks stay at full volume until the fader passes the middle, then the far deck drops. Punchier, but the overlap is louder.
  - **Scratch / Cut**: Both decks at full across almost the whole fader; a deck cuts out only in the last 5% at each end. For fast cuts.
- **Automated Smooth Crossfade**: Automated transitions over configurable durations (2s, 4s, 8s, 16s).
- **Dual Channel Faders & VU Meters**: Independent vertical channel sliders with responsive 7-segment LED level meters.

### 3. Unified Audio Crate & Search Browser
- **Direct Catalog Search**: Search any artist, song, or album across Spotify's 100M+ track library.
- **Universal URL / URI Loader**: Paste any Spotify URL or URI:
  - Playlists: `https://open.spotify.com/playlist/...`
  - Albums: `https://open.spotify.com/album/...`
  - Individual Tracks: `https://open.spotify.com/track/...`
  - Artist Top Tracks: `https://open.spotify.com/artist/...`
- **Instant Deck Assignment**: Single-click `[DECK_1]` and `[DECK_2]` buttons to load tracks onto either bus.
- **YouTube Row**: Paste one or more YouTube video links (they pile up into one list) or search YouTube. No account or API key needed; search goes through the local dev server (`server/youtubeSearch.js`) and reads YouTube's results page, so it is unofficial and can break if YouTube changes it.

### 4. PKCE OAuth Security & Token Management
- **Zero Client Secret Exposure**: Uses the OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange).
- **Multi-Account Switching**: Uses `show_dialog=true` so logging into Deck 02 prompts for the second account rather than automatically reusing Account 1's cookies.
- **Automatic Token Refresh**: Seamlessly refreshes expired access tokens in the background via refresh tokens.

---

## 🚀 Quick Start

### 1. Install & Launch

```bash
# Clone the repository
git clone https://github.com/prismspecs/spotify-dj.git
cd spotify-dj

# Install dependencies
npm install

# Start development server
npm run dev
```

Open **[http://localhost:5173/](http://localhost:5173/)** in your browser.

> ⚠️ **IMPORTANT**: The app runs on `localhost` because YouTube refuses to play embeds on an IP-address page. Spotify only accepts the loopback IP `http://127.0.0.1:5173/` as its login redirect, so that stays the Redirect URI in your Spotify dashboard; the app forwards Spotify's redirect back to `localhost` automatically.
>
> Ad/tracker blockers (uBlock Origin, Privacy Badger) block Spotify's player. Disable them for `localhost`.

---

## ⚙️ Spotify Developer Setup (For Live Streaming)

To stream full audio tracks from Spotify:

### Step 1: Requirements
- Both Spotify accounts must have **Spotify Premium** (Spotify's Web Playback SDK does not permit audio streaming on Free accounts).

### Step 2: Create App in Spotify Developer Dashboard
1. Go to the **[Spotify Developer Dashboard](https://developer.spotify.com/dashboard)** and log in.
2. Click **Create App**:
   - **App Name:** `Spotify Dual DJ`
   - **App Description:** `Dual-deck crossfader web application`
   - **Redirect URIs:** Add `http://127.0.0.1:5173/`
   - **APIs used:** Check **Web API** and **Web Playback SDK**
3. Save the app and copy your **Client ID**.

### Step 3: Whitelist the Second Account (User Management)
While your app is in "Development Mode", Spotify requires you to explicitly allow any account that connects:
1. In your app dashboard, go to **Settings** ➔ **User Management**.
2. Click **Add User**.
3. Enter your friend's (or second account's) **Name** and their **Spotify Account Email**.
4. Click **Save**.

### Step 4: Connect Decks in the Console
1. Open the DJ app at `http://localhost:5173/`.
2. Click the **[CONFIG]** button (top right) and paste your **Client ID**.
3. On **Deck 01**, click **[LINK_SPOTIFY]** and log in with Account 1.
4. On **Deck 02**, click **[LINK_SPOTIFY]** and log in with Account 2.
5. Search for a track or paste a playlist into the **Audio Crate**, load songs onto Deck 01 and Deck 02, and start mixing!

---

## ☁️ Deploy to Render

The repo includes a Render Blueprint (`render.yaml`): one Node web service that builds the site and runs `server.js`, which serves the app and the YouTube search endpoint.

1. On [render.com](https://render.com), choose **New → Blueprint** and pick this repo.
2. When asked for `YOUTUBE_API_KEY`, paste a free [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) key, or leave it blank. Without a key, search reads YouTube's results page, which YouTube may block from cloud servers.
3. Add `https://<your-service>.onrender.com/` to your Spotify app's **Redirect URIs**.

The free plan sleeps after 15 minutes without requests, so the first load or search after a quiet spell takes about a minute. Music keeps playing meanwhile; it runs in the browser.

## 🛠️ Architecture & Under the Hood

```
┌────────────────────────────────────────────────────────┐
│                   Spotify DJ Console                   │
│                                                        │
│  ┌──────────────────┐            ┌──────────────────┐  │
│  │     DECK 01      │            │     DECK 02      │  │
│  │  Account 1 (PKCE)│            │  Account 2 (PKCE)│  │
│  │ Spotify.Player A │            │ Spotify.Player B │  │
│  └────────┬─────────┘            └────────┬─────────┘  │
│           │                               │            │
│           │ gainA                   gainB │            │
│           ▼                               ▼            │
│   ┌───────────────┐               ┌───────────────┐    │
│   │ Channel 01 VU │               │ Channel 02 VU │    │
│   └───────┬───────┘               └───────┬───────┘    │
│           │                               │            │
│           └────────► [ CROSSFADER ] ◄─────┘            │
│                 (Equal Power -3dB Curve)               │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │             SHARED CRATE / PLAYLIST              │  │
│  │   Spotify Search API + Playlist/Album Parser     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Key Modules:
- [`src/services/playerManager.ts`](src/services/playerManager.ts): Singleton coordinating dual `Spotify.Player` instances, browser autoplay activation (`activateElement()`), volume throttling, and position sync loops.
- [`src/services/spotifyAuth.ts`](src/services/spotifyAuth.ts): Client-side PKCE OAuth implementation, code verifier exchange, token storage, and background refresh.
- [`src/services/spotifyApi.ts`](src/services/spotifyApi.ts): Robust Spotify API wrapper with automatic token refresh, rate-limit backoff (503/429), playlist & album pagination, and Spotify Connect device transfer.
- [`src/utils/audioMath.ts`](src/utils/audioMath.ts): Audio math calculations for Constant Power (`cos`/`sin`), Linear, and Scratch Cut gain curves.
- [`src/services/youtube.ts`](src/services/youtube.ts): YouTube decks: IFrame player loading, link parsing, oEmbed titles, and search via [`server/youtubeSearch.js`](server/youtubeSearch.js).

---

## 🧪 Testing & Verification

Run the test suite:

```bash
npm test
```

Build for production:

```bash
npm run build
```

---

## 📄 License

MIT License. Designed for DJs, music enthusiasts, and pair-programming sessions.

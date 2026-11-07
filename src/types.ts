export interface Track {
  id: string;
  name: string;
  artists: string[];
  albumName: string;
  albumArt: string;
  duration_ms: number;
  uri: string;
  preview_url?: string | null;
  source?: 'spotify' | 'youtube'; // undefined = Spotify
  youtubeId?: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  images?: { url: string }[];
  product?: string; // 'premium' | 'free'
}

export interface DeckState {
  deckId: 'A' | 'B';
  isReady: boolean;
  isPlaying: boolean;
  currentTrack: Track | null;
  position_ms: number;
  duration_ms: number;
  deckVolume: number; // 0 to 1 fader on deck
  effectiveVolume: number; // combined deckVolume * crossfadeGain
  user: SpotifyUser | null;
  deviceId: string | null;
  token: string | null;
  bpm?: number;
  status?: 'IDLE' | 'CONNECTING' | 'READY' | 'PLAYING' | 'PAUSED' | 'ERROR';
  errorMessage?: string | null;
}

export type CrossfadeCurve = 'constant-power' | 'linear' | 'cut';

export interface PlaylistInfo {
  id: string;
  name: string;
  description?: string;
  image?: string;
  totalTracks: number;
  tracks: Track[];
}

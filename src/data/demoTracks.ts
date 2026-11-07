import { Track } from '../types';

export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo-1',
    name: 'Midnight Groove (124 BPM)',
    artists: ['Neon Pulse', 'SoundWave'],
    albumName: 'Ibiza Sessions 2026',
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    duration_ms: 184000,
    uri: 'spotify:track:demo1',
    preview_url: '/audio/deck-a-groove.wav'
  },
  {
    id: 'demo-2',
    name: 'Deep Horizon House (124 BPM)',
    artists: ['Solaris & The Echoes'],
    albumName: 'Solar Beats Vol. 3',
    albumArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    duration_ms: 215000,
    uri: 'spotify:track:demo2',
    preview_url: '/audio/deck-b-groove.wav'
  },
  {
    id: 'demo-3',
    name: 'Cyberpunk Odyssey (Synth Club)',
    artists: ['Kavinsky Tribute', 'Synthwave Collective'],
    albumName: 'Neon City Nights',
    albumArt: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    duration_ms: 198000,
    uri: 'spotify:track:demo3',
    preview_url: '/audio/deck-a-groove.wav'
  },
  {
    id: 'demo-4',
    name: 'Techno Pulse (Mainstage)',
    artists: ['DJ Resonance'],
    albumName: 'Underground Frequency',
    albumArt: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80',
    duration_ms: 220000,
    uri: 'spotify:track:demo4',
    preview_url: '/audio/deck-b-groove.wav'
  }
];

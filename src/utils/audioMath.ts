import { CrossfadeCurve } from '../types';

/**
 * Calculates deck gains based on crossfader position [0..1] and selected curve.
 * 0 = Full Deck A, 0.5 = Center, 1 = Full Deck B
 */
export function calculateGains(position: number, curve: CrossfadeCurve): { gainA: number; gainB: number } {
  // Clamp between 0 and 1
  const pos = Math.max(0, Math.min(1, position));

  switch (curve) {
    case 'constant-power': {
      // Equal power curve (-3dB at center)
      const angle = pos * 0.5 * Math.PI;
      return {
        gainA: Math.cos(angle),
        gainB: Math.sin(angle),
      };
    }

    case 'linear': {
      // Standard DJ linear curve (full volume at center, attenuating towards edges)
      let gainA: number;
      let gainB: number;

      if (pos <= 0.5) {
        gainA = 1;
        gainB = pos * 2;
      } else {
        gainA = (1 - pos) * 2;
        gainB = 1;
      }

      return { gainA, gainB };
    }

    case 'cut': {
      // Sharp scratch/cut curve with fast 5% transition near ends
      if (pos < 0.05) {
        return { gainA: 1, gainB: 0 };
      }
      if (pos > 0.95) {
        return { gainA: 0, gainB: 1 };
      }
      return { gainA: 1, gainB: 1 };
    }

    default:
      return { gainA: 1 - pos, gainB: pos };
  }
}

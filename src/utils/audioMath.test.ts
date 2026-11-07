import { describe, it, expect } from 'vitest';
import { calculateGains } from './audioMath';

describe('calculateGains', () => {
  describe('constant-power curve', () => {
    it('gives full gain to Deck A and 0 to Deck B at position 0', () => {
      const { gainA, gainB } = calculateGains(0, 'constant-power');
      expect(gainA).toBeCloseTo(1, 4);
      expect(gainB).toBeCloseTo(0, 4);
    });

    it('gives equal ~0.707 gain to both at center position 0.5', () => {
      const { gainA, gainB } = calculateGains(0.5, 'constant-power');
      expect(gainA).toBeCloseTo(Math.SQRT1_2, 3);
      expect(gainB).toBeCloseTo(Math.SQRT1_2, 3);
    });

    it('gives 0 to Deck A and full gain to Deck B at position 1', () => {
      const { gainA, gainB } = calculateGains(1, 'constant-power');
      expect(gainA).toBeCloseTo(0, 4);
      expect(gainB).toBeCloseTo(1, 4);
    });
  });

  describe('linear curve', () => {
    it('maintains full gain for Deck A and 0 for Deck B at position 0', () => {
      const { gainA, gainB } = calculateGains(0, 'linear');
      expect(gainA).toBe(1);
      expect(gainB).toBe(0);
    });

    it('keeps both at 1.0 full gain at center 0.5', () => {
      const { gainA, gainB } = calculateGains(0.5, 'linear');
      expect(gainA).toBe(1);
      expect(gainB).toBe(1);
    });

    it('gives 0 gain to Deck A and 1 to Deck B at position 1', () => {
      const { gainA, gainB } = calculateGains(1, 'linear');
      expect(gainA).toBe(0);
      expect(gainB).toBe(1);
    });
  });

  describe('cut curve', () => {
    it('mutes Deck B when completely on Deck A (<0.05)', () => {
      const { gainA, gainB } = calculateGains(0.02, 'cut');
      expect(gainA).toBe(1);
      expect(gainB).toBe(0);
    });

    it('plays both at full volume in between (0.1 to 0.9)', () => {
      const { gainA, gainB } = calculateGains(0.5, 'cut');
      expect(gainA).toBe(1);
      expect(gainB).toBe(1);
    });

    it('mutes Deck A when completely on Deck B (>0.95)', () => {
      const { gainA, gainB } = calculateGains(0.98, 'cut');
      expect(gainA).toBe(0);
      expect(gainB).toBe(1);
    });
  });
});

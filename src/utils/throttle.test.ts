import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLatestThrottle } from './throttle';

describe('createLatestThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps sending updates while values arrive faster than the interval (a moving fader)', () => {
    const sent: number[] = [];
    const send = createLatestThrottle((v: number) => sent.push(v), 50);

    // 4s fade with an update every 16ms, like the auto-fade does
    for (let t = 0; t <= 4000; t += 16) {
      send(t / 4000);
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(100);

    expect(sent.length).toBeGreaterThan(60); // ~20 per second
    expect(sent[sent.length - 1]).toBe(1); // final value always lands
  });

  it('sends a single isolated change right away', () => {
    const sent: number[] = [];
    const send = createLatestThrottle((v: number) => sent.push(v), 50);
    send(0.3);
    vi.advanceTimersByTime(0);
    expect(sent).toEqual([0.3]);
  });
});

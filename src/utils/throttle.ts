/**
 * Calls `fn` at most once per `intervalMs`, always with the most recent value.
 * The first call goes out immediately; calls during the wait are merged into one
 * trailing call, so the final value always gets sent.
 */
export function createLatestThrottle<T>(fn: (value: T) => void, intervalMs: number): (value: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSentAt = -Infinity;
  let latest: T;

  return (value: T) => {
    latest = value;
    if (timer !== null) return;

    const wait = Math.max(0, intervalMs - (Date.now() - lastSentAt));
    timer = setTimeout(() => {
      timer = null;
      lastSentAt = Date.now();
      fn(latest);
    }, wait);
  };
}

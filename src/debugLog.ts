// Sends this page's console output and uncaught errors to the app's server, so
// problems in any browser can be read later:
// - `npm run dev`: appended to .devlog/console.log
// - deployed (server.js): kept in memory, readable at /api/log?key=DEBUG_LOG_KEY.
//   Without DEBUG_LOG_KEY set, the server refuses the logs and this stops sending.
// Long token-like strings are blanked out before anything is sent.

const ENDPOINT = '/api/log';
const FLUSH_MS = 1000;
const MAX_LINE = 2000;

// Tells page loads (and browsers) apart in a shared log.
const session = Math.random().toString(36).slice(2, 6);
let queue: string[] = [];
let enabled = true;

function describe(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// Spotify access/refresh tokens and login codes are long runs of these characters.
const redact = (text: string) => text.replace(/[A-Za-z0-9_\-.]{60,}/g, '[redacted]');

function record(level: string, args: unknown[]) {
  if (!enabled) return;
  queue.push(JSON.stringify({
    t: new Date().toISOString().slice(11, 23),
    s: session,
    level,
    msg: redact(args.map(describe).join(' ')).slice(0, MAX_LINE)
  }));
}

function flush(leavingPage = false) {
  if (!enabled || queue.length === 0) return;
  const body = queue.join('\n');
  queue = [];
  try {
    if (leavingPage) {
      navigator.sendBeacon(ENDPOINT, body);
      return;
    }
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
      .then((res) => {
        // 404: this server has logging turned off.
        if (res.status === 404) enabled = false;
      })
      .catch(() => {
        // logging must never break the app
      });
  } catch {
    // logging must never break the app
  }
}

export function installDebugLog() {
  (['log', 'info', 'warn', 'error'] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      record(level, args);
    };
  });
  window.addEventListener('error', (e) => record('uncaught', [e.message, `${e.filename}:${e.lineno}`]));
  window.addEventListener('unhandledrejection', (e) => record('unhandled-rejection', [e.reason]));
  // Spotify logins leave the page; send what's queued before it goes.
  window.addEventListener('pagehide', () => flush(true));
  window.setInterval(() => flush(), FLUSH_MS);

  // Origin and path only: the query can hold a one-time Spotify login code.
  record('info', [`--- page load ${window.location.origin}${window.location.pathname} | ${navigator.userAgent}`]);
}

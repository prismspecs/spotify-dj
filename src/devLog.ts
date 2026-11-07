// Dev only: mirrors console output and uncaught errors to the dev server,
// which appends them to .devlog/console.log. Never log tokens.
function describe(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function send(level: string, args: unknown[]) {
  const line = JSON.stringify({
    t: new Date().toISOString().slice(11, 23),
    level,
    msg: args.map(describe).join(' ')
  });
  try {
    navigator.sendBeacon('/__devlog', line);
  } catch {
    // logging must never break the app
  }
}

export function installDevLog() {
  (['log', 'info', 'warn', 'error'] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      send(level, args);
    };
  });
  window.addEventListener('error', (e) => send('uncaught', [e.message, `${e.filename}:${e.lineno}`]));
  window.addEventListener('unhandledrejection', (e) => send('unhandled-rejection', [e.reason]));
  send('info', [`--- page load: ${navigator.userAgent}`]);
}

import crypto from 'node:crypto';

// Keeps the browser debug log (sent by src/debugLog.ts) in memory, but only
// when DEBUG_LOG_KEY is set. Read it with GET /api/log?key=<DEBUG_LOG_KEY>
// (add &tail=200 for just the last 200 lines). Lines are also printed to the
// server's own output, so they show up in Render's Logs tab.
const MAX_LINES = 5000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_LINE_CHARS = 2100;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sameKey(given, expected) {
  const a = crypto.createHash('sha256').update(String(given ?? '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createDebugLog(key = process.env.DEBUG_LOG_KEY, { print = true } = {}) {
  const lines = [];

  async function receive(req, res) {
    if (!key) return res.status(404).end();
    try {
      const body = await readBody(req, MAX_BODY_BYTES);
      const received = new Date().toISOString();
      for (const raw of body.split('\n')) {
        const line = raw.trim().slice(0, MAX_LINE_CHARS);
        if (!line) continue;
        const entry = `${received} ${line}`;
        lines.push(entry);
        if (print) console.log(`[browser] ${line}`);
      }
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
      res.status(204).end();
    } catch {
      res.status(413).end();
    }
  }

  function read(req, res) {
    if (!key || !sameKey(req.query.key, key)) return res.status(404).end();
    const tail = Number(req.query.tail);
    const shown = tail > 0 ? lines.slice(-tail) : lines;
    res.type('text/plain').set('Cache-Control', 'no-store').send(shown.join('\n') + '\n');
  }

  return { receive, read };
}

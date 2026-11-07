import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import { createDebugLog } from './debugLog.js';

let server;

async function start(key) {
  const app = express();
  const log = createDebugLog(key, { print: false });
  app.post('/api/log', log.receive);
  app.get('/api/log', log.read);
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  return `http://127.0.0.1:${server.address().port}/api/log`;
}

afterEach(() => server?.close());

describe('debug log endpoint', () => {
  it('is off without a key', async () => {
    const url = await start(undefined);
    expect((await fetch(url, { method: 'POST', body: 'x' })).status).toBe(404);
    expect((await fetch(`${url}?key=`)).status).toBe(404);
  });

  it('stores lines and only shows them with the right key', async () => {
    const url = await start('secret-key');
    const post = await fetch(url, { method: 'POST', body: '{"msg":"one"}\n{"msg":"two"}\n' });
    expect(post.status).toBe(204);

    expect((await fetch(url)).status).toBe(404);
    expect((await fetch(`${url}?key=wrong`)).status).toBe(404);

    const all = await (await fetch(`${url}?key=secret-key`)).text();
    expect(all).toContain('{"msg":"one"}');
    expect(all).toContain('{"msg":"two"}');

    const last = await (await fetch(`${url}?key=secret-key&tail=1`)).text();
    expect(last).not.toContain('one');
    expect(last).toContain('two');
  });
});

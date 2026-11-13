/**
 * Codes to a phone through Telegram Gateway, for when there is no SMS
 * contract. A stand-in for gatewayapi.telegram.org takes the request; the
 * code it was given must be the one that then signs the driver in.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let gateway;
let dataDir;
const sent = [];

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

before(async () => {
  gateway = createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      sent.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: { request_id: 'r1', phone_number: '998901112233', request_cost: 0.01 } }));
    });
  });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  dataDir = mkdtempSync(join(tmpdir(), 'oc-tg-gateway-'));
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DEMO_SIMULATION: 'false',
      DATABASE_URL: '',
      ESKIZ_EMAIL: '',
      ESKIZ_PASSWORD: '',
      TELEGRAM_GATEWAY_TOKEN: 'test-token',
      TELEGRAM_GATEWAY_URL: `http://127.0.0.1:${gateway.address().port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const until = Date.now() + 15000;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error('server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
});

after(() => {
  server?.kill();
  gateway?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

test('a phone code goes to Telegram, is not shown on screen, and signs the driver in', async () => {
  const req = await call('/auth/code/request', { to: '+998 90 111 22 33' });
  assert.equal(req.status, 200, JSON.stringify(req.data));
  assert.equal(req.data.via, 'telegram');
  assert.equal(req.data.demoCode, undefined, 'a real delivery never shows the code');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].path, '/sendVerificationMessage');
  assert.equal(sent[0].auth, 'Bearer test-token');
  assert.equal(sent[0].body.phone_number, '+998901112233');
  assert.match(sent[0].body.code, /^\d{6}$/);
  assert.equal(sent[0].body.ttl, 300);

  const wrong = await call('/auth/code/verify', { to: '+998901112233', code: sent[0].body.code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 401);
  const ok = await call('/auth/code/verify', { to: '+998901112233', code: sent[0].body.code });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

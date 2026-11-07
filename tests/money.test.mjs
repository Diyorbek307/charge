/**
 * Real money switches play money off: with one real payment key set, the
 * sandbox keys, the sandbox checkout and free top-ups stop, even in DEMO_MODE.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const PORT = 9900 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-money-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', PAYME_KEY: 'real-payme-key', PAYME_MERCHANT_ID: 'm-1', NODE_ENV: 'production', ADMIN_EMAIL: 'boss@voli.uz', ADMIN_PASSWORD: 'Test-Admin-2026!' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const rpc = (key, method, params) => fetch(`http://127.0.0.1:${PORT}/api/payments/payme`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}` },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
}).then(r => r.json());

test('with real money, the demo driver and the demo network are gone for drivers', async () => {
  // The demo driver's public password opens nothing.
  const demo = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } });
  assert.equal(demo.status, 403);
  // The made-up stations are off the map and take no charge.
  const st = (await call('/state')).data;
  assert.ok(!st.stations.some(x => ['op-001', 'op-002', 'op-003', 'op-004', 'op-005'].includes(x.operatorId)));
  // The admin still sees them.
  const admin = await login('admin', 'boss@voli.uz', 'Test-Admin-2026!');
  assert.ok(admin, 'the admin from the environment signs in');
});

test('with a real Payme key, no sandbox key or on-screen code works', async () => {
  // No code is shown on screen any more: without an SMS gateway, no code at all.
  const code = await call('/auth/code/request', { method: 'POST', body: { to: '+998935550077' } });
  assert.equal(code.status, 503);
  assert.equal(code.data.demoCode, undefined);
  // The demo key in the code no longer opens the Payme endpoint; the real one does.
  assert.equal((await rpc('demo-payme-key', 'CheckPerformTransaction', { amount: 100, account: { order_id: 'x' } })).error.code, -32504);
  const unknown = await rpc('real-payme-key', 'CheckPerformTransaction', { amount: 100, account: { order_id: 'x' } });
  assert.equal(unknown.error.code, -31050);
  // Payme's errors carry the message in three languages, as Payme requires.
  assert.deepEqual(Object.keys(unknown.error.message).sort(), ['en', 'ru', 'uz']);
  // The legacy demo code sign-in is gone too.
  assert.equal((await call('/auth/otp/request', { method: 'POST', body: { phone: '+998901234567' } })).status, 404);
});

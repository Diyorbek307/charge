/**
 * The store app's notifications: a signed-in phone registers its Firebase
 * token, a bad token is refused, and without FIREBASE_SERVICE_ACCOUNT the
 * server says delivery is off rather than failing.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9600 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-native-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', BACKUPS: 'off' };
  delete env.FIREBASE_SERVICE_ACCOUNT;
  server = spawn(process.execPath, ['server.js'], { env, stdio: 'ignore' });
  for (let i = 0; i < 300; i++) {
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
  rmSync(dataDir, { recursive: true, force: true });
});

describe('store app push', () => {
  test('a phone registers its token; a bad one and a stranger are refused', async () => {
    const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'driver', login: '+998901234567', password: 'Driver2026' }) })).json()).token;
    const send = (body, auth = true) => fetch(`${BASE}/push/native`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const ok = await send({ token: 'fcm-token-abcdefghijklmnopqrstuvwxyz:123', platform: 'android' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { registered: true, delivery: false });
    assert.equal((await send({ token: 'short' })).status, 400);
    assert.equal((await send({ token: 'fcm-token-abcdefghijklmnopqrstuvwxyz:456' }, false)).status, 401);
    const status = await (await fetch(`${BASE}/push/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(status.devices, 1);
  });
});

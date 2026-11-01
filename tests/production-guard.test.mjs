/**
 * A real server (NODE_ENV=production): the page anyone can open hands out no
 * staff passwords, the seeded staff open nothing, the admin from
 * ADMIN_EMAIL / ADMIN_PASSWORD gets into the panel only with a second factor,
 * and no sign-in token is stored in plain text.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { totp } from '../server/totp.js';

const PORT = 9300 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { login: 'owner@voli.uz', password: 'Str0ng-Owner-Pass' };
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-sec-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', NODE_ENV: 'production', ADMIN_EMAIL: ADMIN.login, ADMIN_PASSWORD: ADMIN.password, ADMIN_REQUIRE_2FA: '', SMTP_HOST: '', RESEND_API_KEY: '' },
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

test('only the driver demo login is published', async () => {
  const list = (await call('/auth/demo-credentials')).data;
  assert.ok(list.length > 0);
  assert.deepEqual([...new Set(list.map(c => c.portal))], ['driver']);
});

test('the seeded admin password opens nothing on a real server', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' } });
  assert.equal(r.status, 403);
});

test('the demo network, fleet and partner logins are closed too', async () => {
  for (const [portal, login, password] of [['operator', 'operator@greencharge.uz', 'Operator2026'], ['business', 'fleet@uzauto.uz', 'Business2026'], ['api', 'partner@voli.uz', 'Partner2026']]) {
    assert.equal((await call('/auth/login', { method: 'POST', body: { portal, login, password } })).status, 403, portal);
  }
});

test('the real admin works only after switching on the second factor', async () => {
  const { token, user } = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', ...ADMIN } })).data;
  assert.ok(token);
  assert.equal(user.twoFactorRequired, true);
  const blockedHealth = await call('/admin/health', { token });
  assert.equal(blockedHealth.status, 403);
  assert.equal(blockedHealth.data.needs2fa, true);

  const { secret } = (await call('/auth/2fa/setup', { method: 'POST', token })).data;
  assert.equal((await call('/auth/2fa/enable', { method: 'POST', token, body: { code: totp(secret) } })).status, 200);
  assert.equal((await call('/admin/health', { token })).status, 200);

  // From now on the password alone is not enough.
  const again = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', ...ADMIN } })).data;
  assert.equal(again.requires2fa, true);
  assert.ok(!again.token);
});

test('sign-in tokens are stored only as hashes', async () => {
  const { token } = (await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data;
  assert.equal((await call('/auth/me', { token })).status, 200);
  await new Promise(r => setTimeout(r, 1500)); // let the store flush
  const stored = readFileSync(join(dataDir, 'db.json'), 'utf8');
  assert.ok(!stored.includes(token), 'a raw token was written to the database');
});

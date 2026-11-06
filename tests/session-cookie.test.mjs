/**
 * Browser sign-ins in an HttpOnly cookie: set on sign-in, used only with the
 * portal header, moved over from an old Bearer token, cleared on sign-out.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9500 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

const post = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });
const cookieOf = res => (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('voli_driver=')) ?? null;
const valueOf = cookie => cookie.split(';')[0];

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-cookie-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '' },
    stdio: 'ignore',
  });
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

describe('sign-in cookie', () => {
  const signIn = () => post('/auth/login', { portal: 'driver', login: '+998901234567', password: 'Driver2026' });

  test('signing in sets an HttpOnly cookie for the portal', async () => {
    const res = await signIn();
    assert.equal(res.status, 200);
    const cookie = cookieOf(res);
    assert.ok(cookie, 'no cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/api/);
  });

  test('the cookie works only together with the portal header', async () => {
    const cookie = valueOf(cookieOf(await signIn()));
    const withHeader = await fetch(`${BASE}/auth/me`, { headers: { Cookie: cookie, 'X-Voli-Portal': 'driver' } });
    assert.equal(withHeader.status, 200);
    assert.equal((await withHeader.json()).user.portal, 'driver');
    // What another site's form or link could send: the cookie, no header.
    assert.equal((await fetch(`${BASE}/auth/me`, { headers: { Cookie: cookie } })).status, 401);
    // The driver's cookie does not open another portal.
    assert.equal((await fetch(`${BASE}/auth/me`, { headers: { Cookie: cookie, 'X-Voli-Portal': 'admin' } })).status, 401);
  });

  test('an old Bearer sign-in gets its cookie', async () => {
    const { token } = await (await signIn()).json();
    const res = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}`, 'X-Voli-Portal': 'driver' } });
    assert.equal(res.status, 200);
    assert.ok(cookieOf(res), 'no cookie handed over');
  });

  test('signing out ends the session and clears the cookie', async () => {
    const cookie = valueOf(cookieOf(await signIn()));
    const headers = { Cookie: cookie, 'X-Voli-Portal': 'driver' };
    const out = await post('/auth/logout', {}, headers);
    assert.equal(out.status, 200);
    assert.match(cookieOf(out) ?? '', /Max-Age=0/);
    assert.equal((await fetch(`${BASE}/auth/me`, { headers })).status, 401);
  });
});

/**
 * Driver sign-up and password recovery by SMS code. With no SMS gateway
 * configured the demo returns the code in the response, which is what lets
 * these tests read it; the checks around it are the real ones.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5100 + Math.floor(Math.random() * 400);
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

const requestCode = (phone, purpose) => call('/auth/sms/request', { method: 'POST', body: { phone, purpose } });

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-accounts-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ESKIZ_EMAIL: '', ESKIZ_PASSWORD: '' },
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
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('driver sign-up', () => {
  test('reports the demo SMS mode', async () => {
    const { data } = await call('/auth/sms/status');
    assert.deepEqual(data, { configured: false, demo: true });
  });

  test('a new driver registers with an SMS code and can sign in by any phone format', async () => {
    const sent = await requestCode('+998 93 111-22-33', 'register');
    assert.equal(sent.status, 200);
    assert.equal(sent.data.phone, '+998931112233');
    assert.match(sent.data.demoCode, /^\d{6}$/);

    // A second code within a minute is refused.
    const again = await requestCode('931112233', 'register');
    assert.equal(again.status, 429);

    const base = { phone: '931112233', name: 'Madina Karimova', password: 'Zaryad2026' };
    assert.equal((await call('/auth/register', { method: 'POST', body: { ...base, password: 'short1' } })).status, 400);
    assert.equal((await call('/auth/register', { method: 'POST', body: { ...base, password: 'onlyletters' } })).status, 400);
    const wrong = sent.data.demoCode === '000000' ? '111111' : '000000';
    assert.equal((await call('/auth/register', { method: 'POST', body: { ...base, code: wrong } })).status, 401);

    const created = await call('/auth/register', { method: 'POST', body: { ...base, code: sent.data.demoCode } });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.name, 'Madina Karimova');
    assert.equal(created.data.user.avatar, 'MK');
    for (const field of ['hash', 'salt', 'otp']) assert.equal(created.data.user[field], undefined, field);

    // The code was single-use, and the number is now taken.
    assert.equal((await call('/auth/register', { method: 'POST', body: { ...base, code: sent.data.demoCode } })).status, 409);
    assert.equal((await requestCode('+998931112233', 'register')).status, 409);

    const login = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998 (93) 111 22 33', password: 'Zaryad2026' } });
    assert.equal(login.status, 200);

    // A fresh account starts with an empty wallet and cannot charge on credit.
    const state = await call('/state', { token: login.data.token });
    assert.equal(state.data.wallets[created.data.user.id].balance, 0);
    assert.equal(state.data.sessions.length, 0);
    const start = await call('/sessions/start', { method: 'POST', token: login.data.token, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(start.status, 402);
  });

  test('a code cannot be used for a different purpose or phone', async () => {
    const sent = await requestCode('+998944445566', 'register');
    const other = await call('/auth/register', {
      method: 'POST',
      body: { phone: '+998944445567', name: 'Test', password: 'Zaryad2026', code: sent.data.demoCode },
    });
    assert.equal(other.status, 401);
  });
});

describe('password recovery', () => {
  test('refuses unknown numbers and malformed input', async () => {
    assert.equal((await requestCode('+998900000001', 'reset')).status, 404);
    assert.equal((await requestCode('12345', 'reset')).status, 400);
    assert.equal((await requestCode('+998901234567', 'steal')).status, 400);
  });

  test('a reset signs out every old session and replaces the password', async () => {
    const reg = await requestCode('+998955556677', 'register');
    const created = await call('/auth/register', {
      method: 'POST',
      body: { phone: '+998955556677', name: 'Old Session', password: 'OldPass2026', code: reg.data.demoCode },
    });
    const oldToken = created.data.token;
    assert.equal((await call('/auth/me', { token: oldToken })).status, 200);

    const sent = await requestCode('+998955556677', 'reset');
    assert.equal(sent.status, 200);
    const done = await call('/auth/password/reset', {
      method: 'POST',
      body: { phone: '+998955556677', code: sent.data.demoCode, password: 'NewPass2026' },
    });
    assert.equal(done.status, 200);
    assert.ok(done.data.token);

    assert.equal((await call('/auth/me', { token: oldToken })).status, 401);
    const oldLogin = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998955556677', password: 'OldPass2026' } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998955556677', password: 'NewPass2026' } });
    assert.equal(newLogin.status, 200);
  });

  test('guessing burns the code after five tries', async () => {
    const reg = await requestCode('+998977778899', 'register');
    await call('/auth/register', {
      method: 'POST',
      body: { phone: '+998977778899', name: 'Guess Target', password: 'Target2026', code: reg.data.demoCode },
    });
    const sent = await requestCode('+998977778899', 'reset');
    assert.equal(sent.status, 200);
    assert.match(sent.data.demoCode, /^\d{6}$/);
    const wrong = sent.data.demoCode === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) {
      const r = await call('/auth/password/reset', { method: 'POST', body: { phone: '+998977778899', code: wrong, password: 'Hacked2026' } });
      assert.equal(r.status, 401);
    }
    const late = await call('/auth/password/reset', {
      method: 'POST',
      body: { phone: '+998977778899', code: sent.data.demoCode, password: 'Hacked2026' },
    });
    assert.equal(late.status, 401, 'the right code still worked after five wrong guesses');
    const login = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998977778899', password: 'Target2026' } });
    assert.equal(login.status, 200);
  });

  test('one client cannot request codes without limit', async () => {
    const statuses = [];
    for (let i = 0; i < 25; i++) {
      statuses.push((await requestCode(`+99899${String(1000000 + i)}`, 'register')).status);
    }
    assert.ok(statuses.includes(429), `no limit hit: ${statuses.join(',')}`);
  });
});

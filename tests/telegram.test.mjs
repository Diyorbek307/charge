/**
 * Telegram Mini App sign-in: initData must carry Telegram's signature made
 * with our bot token; a driver links their account once, then signs in with
 * one tap. Without a token the whole feature stays off.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyInitData } from '../server/telegram.js';

const TOKEN = '123456:TEST-bot-token';
const PORT = 6500 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

/** Builds initData the way Telegram signs it. */
function initData(user, { token = TOKEN, authDate = Math.floor(Date.now() / 1000) } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAE', user: JSON.stringify(user) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-tg-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', TELEGRAM_BOT_TOKEN: TOKEN },
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

describe('telegram initData', () => {
  test('a genuine signature passes; a forged, foreign or stale one does not', () => {
    const user = { id: 777, first_name: 'Ali', username: 'ali' };
    assert.equal(verifyInitData(initData(user), TOKEN).user.id, '777');
    const forged = initData(user).replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64));
    assert.ok(verifyInitData(forged, TOKEN).error);
    assert.ok(verifyInitData(initData(user, { token: '999:other' }), TOKEN).error);
    assert.ok(verifyInitData(initData(user, { authDate: Math.floor(Date.now() / 1000) - 2 * 86400 }), TOKEN).error);
    assert.ok(verifyInitData(initData(user), '').error, 'works without a configured token');
  });

  test('a driver links Telegram once, then signs in with one tap', async () => {
    const tg = initData({ id: 4242, first_name: 'Alisher' });
    assert.equal((await call('/auth/telegram/status')).data.configured, true);
    const before = await call('/auth/telegram', { method: 'POST', body: { initData: tg } });
    assert.equal(before.status, 404, 'signed in before linking');

    const driver = (await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data.token;
    const linked = await call('/auth/telegram/link', { method: 'POST', token: driver, body: { initData: tg } });
    assert.equal(linked.status, 200);
    assert.equal(linked.data.user.telegram.id, '4242');

    const tap = await call('/auth/telegram', { method: 'POST', body: { initData: tg } });
    assert.equal(tap.status, 200);
    assert.equal(tap.data.user.id, 'acc-driver');
    assert.equal((await call('/auth/me', { token: tap.data.token })).status, 200);

    const bad = await call('/auth/telegram', { method: 'POST', body: { initData: tg.replace('Alisher', 'Mallory') } });
    assert.equal(bad.status, 401, 'tampered initData was accepted');
    assert.equal((await call('/auth/telegram/link', { method: 'POST', token: (await call('/auth/login', { method: 'POST', body: { portal: 'operator', login: 'operator@greencharge.uz', password: 'Operator2026' } })).data.token, body: { initData: tg } })).status, 403);
  });
});

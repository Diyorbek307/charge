/**
 * The security audit of November 2026, on a real server (NODE_ENV=production):
 * a stored token hash is not a token, a 2FA code works once and an account
 * gets few wrong codes, Telegram does not skip 2FA, the passport form is not
 * an oracle, the demo reset and the demo OCPP key are closed, export history
 * is private, the staff audit trail is kept, and Sentry sees no secrets.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { totp } from '../server/totp.js';
import { scrubUrl, scrubText } from '../server/monitoring.js';

const PORT = 9500 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { login: 'owner@voli.uz', password: 'Str0ng-Owner-Pass' };
const BOT = '123456:TEST-bot-token';
let server;
let dataDir;
/** The admin's sign-in after a real 2FA check (set by the 2FA test). */
let adminToken;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const driverLogin = async () => (await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data.token;

/** A new driver signed in by code (the demo code comes back in the answer while no SMS service is set). */
async function newDriver(phone) {
  const sent = (await call('/auth/code/request', { method: 'POST', body: { to: phone } })).data;
  const v = (await call('/auth/code/verify', { method: 'POST', body: { to: phone, code: sent.demoCode } })).data;
  const done = await call('/auth/code/finish', { method: 'POST', body: { ticket: v.ticket, name: 'Тест Водитель', consent: { version: 99 } } });
  assert.equal(done.status, 201, JSON.stringify(done.data));
  return done.data;
}

/** Telegram's initData for a user, signed with the bot token the way Telegram signs it. */
function initData(userId) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'T' }) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-harden-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', NODE_ENV: 'production', ADMIN_EMAIL: ADMIN.login, ADMIN_PASSWORD: ADMIN.password, ADMIN_REQUIRE_2FA: '', SMTP_HOST: '', RESEND_API_KEY: '', OCPP_PASSWORD: '', TELEGRAM_BOT_TOKEN: BOT, ESKIZ_EMAIL: '' },
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

test('the stored hash of a token does not sign anyone in', async () => {
  const token = await driverLogin();
  assert.equal((await call('/auth/me', { token })).status, 200);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  assert.equal((await call('/auth/me', { token: hash })).status, 401);
  // And the real token still works afterwards.
  assert.equal((await call('/auth/me', { token })).status, 200);
});

test('a 2FA code works once, and an account gets few wrong codes', async () => {
  const first = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', ...ADMIN } })).data;
  const { secret } = (await call('/auth/2fa/setup', { method: 'POST', token: first.token })).data;
  assert.equal((await call('/auth/2fa/enable', { method: 'POST', token: first.token, body: { code: totp(secret) } })).status, 200);

  const code = totp(secret);
  const a = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', ...ADMIN } })).data;
  const ok = await call('/auth/2fa/verify', { method: 'POST', body: { challenge: a.challenge, code } });
  assert.equal(ok.status, 200);
  adminToken = ok.data.token;
  // The same code a second time, as someone who watched it typed would try.
  const b = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', ...ADMIN } })).data;
  assert.equal((await call('/auth/2fa/verify', { method: 'POST', body: { challenge: b.challenge, code } })).status, 401);

  // Fresh challenges do not buy fresh guesses: the account stops at ten wrong codes.
  let last = 0;
  for (let i = 0; i < 4; i++) {
    const c = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', ...ADMIN } })).data;
    for (let k = 0; k < 4 && last !== 429; k++) last = (await call('/auth/2fa/verify', { method: 'POST', body: { challenge: c.challenge, code: '000000' } })).status;
  }
  assert.equal(last, 429);
});

test('the staff audit trail keeps admin actions with the address', async () => {
  const list = (await call('/admin/audit', { token: adminToken })).data;
  assert.ok(list.some(e => e.portal === 'admin' && e.type === 'auth.2fa' && e.ip), 'the 2FA switch-on is in the audit trail');
  assert.ok(!list.some(e => e.portal === 'driver'), 'drivers are not in the staff trail');
  assert.equal((await call('/admin/audit', { token: await driverLogin() })).status, 403);
});

test('the demo reset is closed on the live server', async () => {
  assert.equal((await call('/admin/reset', { method: 'POST', token: adminToken })).status, 404);
  assert.equal((await call('/auth/me', { token: adminToken })).status, 200, 'nothing was wiped');
});

test('Telegram sign-in still asks for the second factor', async () => {
  const { token } = await newDriver('+998935550101');
  assert.equal((await call('/auth/telegram/link', { method: 'POST', token, body: { initData: initData(777001) } })).status, 200);
  const { secret } = (await call('/auth/2fa/setup', { method: 'POST', token })).data;
  assert.equal((await call('/auth/2fa/enable', { method: 'POST', token, body: { code: totp(secret) } })).status, 200);
  const r = await call('/auth/telegram', { method: 'POST', body: { initData: initData(777001) } });
  assert.equal(r.status, 200);
  assert.equal(r.data.requires2fa, true);
  assert.ok(!r.data.token);
});

test('the passport form cannot be used to test numbers', async () => {
  const { token } = await newDriver('+998935550102');
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await call('/me/passport', { method: 'PUT', token, body: { series: 'AA', number: '1234567', pinfl: '1234', birth: '1990-01-01' } })).status);
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
});

test('export history is private to whoever exported', async () => {
  const mine = await driverLogin();
  const other = (await newDriver('+998935550103')).token;
  assert.equal((await call('/reports', { method: 'POST', token: mine, body: { name: 'trips', title: 'Мои поездки', format: 'csv', rows: 3 } })).status, 200);
  assert.equal((await call('/reports?name=trips', { token: mine })).data.length, 1);
  assert.equal((await call('/reports?name=trips', { token: other })).data.length, 0);
});

test('the demo OCPP key opens nothing on the live server', async () => {
  const status = await new Promise(resolve => {
    const auth = Buffer.from('st-003:ocpp-demo-key').toString('base64');
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ocpp/st-003`, ['ocpp1.6'], { headers: { Authorization: `Basic ${auth}` } });
    ws.once('open', () => (ws.close(), resolve('open')));
    ws.once('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.once('error', () => resolve('error'));
  });
  assert.equal(status, 401);
});

test('Sentry reports carry no bot token, sign-in token, code or phone', () => {
  assert.equal(scrubUrl(`https://api.telegram.org/bot${BOT}/sendMessage?chat_id=1`), 'https://api.telegram.org/bot***/sendMessage');
  assert.equal(scrubUrl('https://app.voli.uz/api/stream?ticket=abc'), 'https://app.voli.uz/api/stream');
  const t = scrubText(`fetch failed for bot${BOT} with Bearer abc.def and +998901234567`);
  assert.ok(!t.includes('TEST-bot-token') && !t.includes('abc.def') && !t.includes('901234567'), t);
});

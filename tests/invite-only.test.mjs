/**
 * Invite-only mode before the launch: the store app is public, but only the
 * demo driver (the store reviewers) and the logins in INVITE_LOGINS get in,
 * nobody new signs up, and no code is sent to anyone else.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-invite-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', INVITE_ONLY: 'true', INVITE_LOGINS: '+998 90 111 22 33, friend@voli.uz', REVIEW_EMAIL: 'review@voli.uz', REVIEW_PASSWORD: 'review-pass-1' },
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

test('the review account from REVIEW_EMAIL signs in by password and has money to charge with; the public demo driver does not', async () => {
  let r;
  for (let i = 0; i < 30; i++) {
    r = await call('/auth/login', { portal: 'driver', login: 'Review@voli.uz', password: 'review-pass-1' });
    if (r.status === 200) break;
    await new Promise(ok => setTimeout(ok, 100));
  }
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const me = await fetch(`${BASE}/state`, { headers: { Authorization: `Bearer ${r.data.token}` } }).then(x => x.json());
  assert.ok(Object.values(me.wallets ?? {}).some(w => w.balance >= 50_000), 'a balance to charge with');
  const demo = await call('/auth/login', { portal: 'driver', login: '+998901234567', password: 'Driver2026' });
  assert.equal(demo.status, 403);
  assert.equal(demo.data.inviteOnly, true);
});

test('a stranger gets the launch message: no code, no sign-up, no password sign-in', async () => {
  const code = await call('/auth/code/request', { to: '+998 93 555 66 77' });
  assert.equal(code.status, 403);
  assert.equal(code.data.inviteOnly, true);
  assert.match(code.data.error, /по приглашению/);
  assert.equal((await call('/auth/code/request', { to: 'someone@mail.ru' })).status, 403);
  assert.equal((await call('/auth/sms/request', { phone: '+998935556677', purpose: 'register' })).status, 403);
  assert.equal((await call('/auth/register', { phone: '+998935556677', name: 'Stranger', password: 'Strong2026pass', code: '000000', consent: { version: 1 } })).status, 403);
  assert.equal((await call('/auth/login', { portal: 'driver', login: '+998935556677', password: 'whatever123' })).status, 403);
});

test('an invited phone and an invited email may sign up by code', async () => {
  const phone = await call('/auth/code/request', { to: '+998901112233' });
  assert.equal(phone.status, 200, JSON.stringify(phone.data));
  const verify = await call('/auth/code/verify', { to: '+998901112233', code: phone.data.demoCode });
  assert.equal(verify.status, 200, JSON.stringify(verify.data));
  assert.equal(verify.data.newAccount, true);
  const done = await call('/auth/code/finish', { ticket: verify.data.ticket, name: 'Invited Driver', consent: { version: 1 } });
  assert.equal(done.status, 201, JSON.stringify(done.data));

  assert.equal((await call('/auth/code/request', { to: 'Friend@voli.uz' })).status, 200);
});

test('staff portals are not affected', async () => {
  const r = await call('/auth/login', { portal: 'operator', login: 'operator@greencharge.uz', password: 'Operator2026' });
  assert.notEqual(r.data?.inviteOnly, true);
  assert.notEqual(r.status, 403);
});

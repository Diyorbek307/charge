/**
 * Signing in without a password: a code to the phone or the email makes the
 * account on the spot for someone new and signs in someone known; Google and
 * Apple stay closed until their keys are set; and such an account can still
 * be deleted, by typing the word instead of a password.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8900 + Math.floor(Math.random() * 300);
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-signin-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', SMTP_HOST: '', RESEND_API_KEY: '', GOOGLE_CLIENT_ID: '', APPLE_CLIENT_ID: '' },
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

const codeFor = async to => (await call('/auth/code/request', { method: 'POST', body: { to } })).data;

test('a new email gets a code, a name makes the account, the next code signs in', async () => {
  const sent = await codeFor('  Nilufar@Mail.UZ ');
  assert.equal(sent.to, 'nilufar@mail.uz');
  assert.equal(sent.channel, 'email');
  assert.match(sent.demoCode, /^\d{6}$/);

  assert.equal((await call('/auth/code/verify', { method: 'POST', body: { to: sent.to, code: '000000' === sent.demoCode ? '111111' : '000000' } })).status, 401);
  // A wrong guess does not spend the code.
  const verified = await call('/auth/code/verify', { method: 'POST', body: { to: sent.to, code: sent.demoCode } });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.newAccount, true);

  assert.equal((await call('/auth/code/finish', { method: 'POST', body: { ticket: verified.data.ticket, name: 'Nilufar Karimova' } })).status, 400, 'no agreement, no account');
  const made = await call('/auth/code/finish', { method: 'POST', body: { ticket: verified.data.ticket, name: 'Nilufar Karimova', consent: { version: 1 } } });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.equal(made.data.user.email, 'nilufar@mail.uz');
  assert.equal(made.data.user.noPassword, true);
  assert.ok(!('oauth' in made.data.user) && !('hash' in made.data.user));
  assert.equal((await call('/auth/code/finish', { method: 'POST', body: { ticket: verified.data.ticket, name: 'Again', consent: { version: 1 } } })).status, 401, 'a ticket works once');

  // Another code for the same address has to wait.
  const again = await call('/auth/code/request', { method: 'POST', body: { to: 'nilufar@mail.uz' } });
  assert.equal(again.status, 429, 'a minute between codes');
});

test('a known phone signs in by code', async () => {
  const sent = await codeFor('90 123 45 67');
  assert.equal(sent.to, '+998901234567');
  assert.equal(sent.channel, 'sms');
  const r = await call('/auth/code/verify', { method: 'POST', body: { to: sent.to, code: sent.demoCode } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  assert.equal(r.data.user.login, '+998901234567');
});

test('nonsense is neither a phone nor an email', async () => {
  assert.equal((await call('/auth/code/request', { method: 'POST', body: { to: 'hello' } })).status, 400);
});

test('Google and Apple stay closed without their keys', async () => {
  const p = (await call('/auth/providers')).data;
  assert.equal(p.google, null);
  assert.equal(p.apple, null);
  assert.equal(p.email, true);
  const r = await call('/auth/oauth', { method: 'POST', body: { provider: 'google', idToken: 'a.b.c' } });
  assert.equal(r.status, 401);
  assert.equal((await call('/auth/oauth', { method: 'POST', body: { provider: 'facebook', idToken: 'x' } })).status, 400);
});

test('an account with no password is deleted by typing the word', async () => {
  const sent = await codeFor('timur@example.com');
  const { ticket } = (await call('/auth/code/verify', { method: 'POST', body: { to: sent.to, code: sent.demoCode } })).data;
  const { token } = (await call('/auth/code/finish', { method: 'POST', body: { ticket, name: 'Timur', consent: { version: 1 } } })).data;
  assert.equal((await call('/me/delete', { method: 'POST', token, body: { confirm: 'нет' } })).status, 400);
  assert.equal((await call('/me/delete', { method: 'POST', token, body: { confirm: 'удалить' } })).status, 200);
  assert.equal((await call('/auth/me', { token })).status, 401);
});

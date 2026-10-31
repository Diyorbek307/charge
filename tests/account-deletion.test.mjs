/**
 * Deleting an account from the app, as Google Play and the App Store
 * require: the password is asked, open money blocks it, and afterwards the
 * person is gone — no sign-in, no name — while the charges stay unnamed.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8600 + Math.floor(Math.random() * 300);
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-del-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '' },
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

async function signUp(phone, name, password) {
  const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
  const reg = await call('/auth/register', { method: 'POST', body: { phone, code, name, password, consent: { version: 1 } } });
  assert.equal(reg.status, 201);
  return reg.data.token;
}

test('money on the wallet holds the deletion until support refunds it', async () => {
  const token = await signUp('+998935554001', 'Rustam Ergashev', 'Delete2026x');
  assert.equal((await call('/me/delete', { method: 'POST', token, body: { password: 'wrong' } })).status, 401);
  const order = (await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 50000 } })).data.order;
  await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token });
  const held = await call('/me/delete', { method: 'POST', token, body: { password: 'Delete2026x' } });
  assert.equal(held.status, 409);
  assert.match(held.data.error, /поддержку/);
});

test('a driver deletes the account: the person is gone, the phone can sign up again', async () => {
  const phone = '+998935554002';
  const password = 'Delete2026x';
  const token = await signUp(phone, 'Gulnora Tosheva', password);
  await call('/support/messages', { method: 'POST', token, body: { text: 'Привет' } });
  assert.equal((await call('/me/delete', { method: 'POST', token, body: { password } })).data.ok, true);

  assert.equal((await call('/me/referral', { token })).status, 401, 'the old sign-in no longer works');
  const login = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: phone, password } });
  assert.notEqual(login.status, 200, 'the phone and password no longer sign in');

  const admin = (await call('/auth/login', { method: 'POST', body: { portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' } })).data.token;
  const threads = (await call('/admin/support', { token: admin })).data;
  assert.ok(!threads.some(t => t.user === 'Gulnora Tosheva'), 'the support chat is gone');
  const users = (await call('/admin/users', { token: admin })).data;
  const leftover = JSON.stringify(users).match(/.{40}Gulnora Tosheva.{40}/)?.[0];
  assert.ok(!leftover, leftover);

  // The same phone is free to sign up again as a new person (the SMS may just ask to wait a minute).
  assert.notEqual((await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).status, 409);
});

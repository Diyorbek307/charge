/**
 * Top-ups through Paynet: the driver pays in Paynet by their Voli account
 * number; Paynet calls our provider API with its login and password.
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-paynet-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', PAYNET_LOGIN: 'paynet', PAYNET_PASSWORD: 'secret-pass' },
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
const PAYNET = `http://127.0.0.1:${PORT}/api/payments/paynet`;
async function rpc(method, params, auth = 'paynet:secret-pass') {
  const res = await fetch(PAYNET, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(auth).toString('base64')}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

test('a driver tops up through Paynet by account number; repeats and cancels are handled', async () => {
  const driver = await login('driver', '+998901234567', 'Driver2026');
  const acc = (await call('/payments/paynet/account', { token: driver })).data;
  assert.match(acc.number, /^\d{8}$/);
  assert.equal(acc.on, true);

  // Wrong password: refused.
  assert.equal((await rpc('GetInformation', { fields: { client_id: acc.number } }, 'paynet:nope')).error.code, 412);
  assert.equal((await rpc('GetInformation', { fields: { client_id: '00000000' } })).error.code, 302);
  const info = (await rpc('GetInformation', { fields: { client_id: acc.number } })).result;
  assert.equal(info.status, '0');
  const startBalance = info.fields.balance;
  // The phone works as the account number too.
  assert.equal((await rpc('GetInformation', { fields: { client_id: '901234567' } })).result.status, '0');

  const pay = await rpc('PerformTransaction', { serviceId: 1, transactionId: 'T-1', transactionTime: '2026-11-07 12:00:00', amount: 5_000_000, fields: { client_id: acc.number } });
  assert.ok(pay.result.providerTrnId);
  assert.equal((await rpc('GetInformation', { fields: { client_id: acc.number } })).result.fields.balance, startBalance + 5_000_000);
  // The same transaction twice is refused, not credited twice.
  assert.equal((await rpc('PerformTransaction', { serviceId: 1, transactionId: 'T-1', amount: 5_000_000, fields: { client_id: acc.number } })).error.code, 201);
  // Too small a sum is refused.
  assert.equal((await rpc('PerformTransaction', { serviceId: 1, transactionId: 'T-2', amount: 100, fields: { client_id: acc.number } })).error.code, 413);

  assert.equal((await rpc('CheckTransaction', { serviceId: 1, transactionId: 'T-1' })).result.transactionState, 1);
  assert.equal((await rpc('CheckTransaction', { serviceId: 1, transactionId: 'nope' })).result.transactionState, 3);
  const st = (await rpc('GetStatement', { serviceId: 1, dateFrom: '2026-01-01 00:00:00', dateTo: '2030-01-01 00:00:00' })).result.statements;
  assert.ok(st.some(s => s.transactionId === 'T-1' && s.amount === 5_000_000));

  assert.equal((await rpc('CancelTransaction', { serviceId: 1, transactionId: 'T-1' })).result.transactionState, 2);
  assert.equal((await rpc('CancelTransaction', { serviceId: 1, transactionId: 'T-1' })).error.code, 202);
  assert.equal((await rpc('GetInformation', { fields: { client_id: acc.number } })).result.fields.balance, startBalance);
});

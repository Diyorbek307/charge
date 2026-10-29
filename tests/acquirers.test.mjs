/**
 * Top-ups through Uzum Bank and Humo: the signed payment notification.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 10500 + Math.floor(Math.random() * 90);
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, type: res.headers.get('content-type') };
}
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const driver = () => login('driver', '+998901234567', 'Driver2026');
const fleet = () => login('business', 'fleet@uzauto.uz', 'Business2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-acq-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', OSM_PLACES: 'false' },
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

const sign = (secret, f) => crypto.createHmac('sha256', secret).update(`${f.order_id}|${f.amount}|${f.status}|${f.transaction_id}`).digest('hex');

describe('Uzum and Humo top-ups', () => {
  test('both are offered, and the sandbox credits the wallet through the signed callback', async () => {
    const providers = (await call('/payments/providers')).data.map(p => p.id);
    assert.ok(providers.includes('uzum') && providers.includes('humo'));
    const token = await driver();
    for (const provider of ['uzum', 'humo']) {
      const before = (await call('/state', { token })).data.wallets['acc-driver'].balance;
      const made = await call('/payments/topup', { method: 'POST', token, body: { provider, amount: 25000 } });
      assert.equal(made.status, 200, JSON.stringify(made.data));
      assert.equal(made.data.sandbox, true);
      assert.match(made.data.checkoutUrl, /order_id=PAY-/);
      const ok = await call(`/payments/order/${made.data.order.id}/sandbox-confirm`, { method: 'POST', token });
      assert.equal(ok.status, 200, JSON.stringify(ok.data));
      assert.equal((await call('/state', { token })).data.wallets['acc-driver'].balance, before + 25000);
    }
  });

  test('a forged or repeated notification credits nothing', async () => {
    const token = await driver();
    const made = (await call('/payments/topup', { method: 'POST', token, body: { provider: 'humo', amount: 10000 } })).data;
    const f = { order_id: made.order.id, amount: '10000', status: 'paid', transaction_id: 'T1' };
    assert.equal((await call('/payments/humo/notify', { method: 'POST', body: { ...f, sign: 'nope' } })).status, 401);
    assert.equal((await call('/payments/humo/notify', { method: 'POST', body: { ...f, amount: '99999', sign: sign('demo-humo-secret', { ...f, amount: '99999' }) } })).status, 400);
    const before = (await call('/state', { token })).data.wallets['acc-driver'].balance;
    assert.equal((await call('/payments/humo/notify', { method: 'POST', body: { ...f, sign: sign('demo-humo-secret', f) } })).status, 200);
    const again = await call('/payments/humo/notify', { method: 'POST', body: { ...f, sign: sign('demo-humo-secret', f) } });
    assert.equal(again.data.already, true);
    assert.equal((await call('/state', { token })).data.wallets['acc-driver'].balance, before + 10000);
    // A network's own balance takes Payme or Click only.
    assert.equal((await call('/payments/topup', { method: 'POST', token, body: { provider: 'uzum', amount: 10000, operatorId: 'op-002' } })).status, 400);
  });
});

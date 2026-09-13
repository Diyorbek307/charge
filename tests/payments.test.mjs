/**
 * Payme and Click merchant callbacks, driven over HTTP exactly as the
 * providers call them: Payme with JSON-RPC and Basic auth, Click with
 * MD5-signed form posts.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 5900 + Math.floor(Math.random() * 300);
const ROOT = `http://127.0.0.1:${PORT}`;
const PAYME_KEY = 'test-payme-key';
const CLICK_SECRET = 'test-click-secret';
const CLICK_SERVICE = '777';
let server;
let dataDir;

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${ROOT}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const login = async (portal, loginName, password) =>
  (await call('/auth/login', { method: 'POST', body: { portal, login: loginName, password } })).data.token;
const driver = () => login('driver', '+998901234567', 'Driver2026');
const balance = async token => (await call('/state', { token })).data.wallets['acc-driver'].balance;

function payme(method, params, key = PAYME_KEY) {
  return call('/payments/payme', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}` },
    body: { jsonrpc: '2.0', id: 1, method, params },
  }).then(r => r.data);
}

const md5 = s => crypto.createHash('md5').update(s).digest('hex');

async function click(path, fields, secret = CLICK_SECRET) {
  const f = { service_id: CLICK_SERVICE, sign_time: '2026-09-13 10:00:00', error: '0', error_note: 'Success', ...fields };
  const withPrepare = f.action === '1';
  f.sign_string ??= md5(
    `${f.click_trans_id}${f.service_id}${secret}${f.merchant_trans_id}${withPrepare ? f.merchant_prepare_id : ''}${f.amount}${f.action}${f.sign_time}`,
  );
  const res = await fetch(`${ROOT}/api/payments/click/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(f).toString(),
  });
  return res.json();
}

const topup = async (token, provider, amount) =>
  (await call('/payments/topup', { method: 'POST', token, body: { provider, amount } })).data;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-pay-'));
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      PAYME_KEY,
      PAYME_MERCHANT_ID: 'merchant-1',
      CLICK_SECRET_KEY: CLICK_SECRET,
      CLICK_SERVICE_ID: CLICK_SERVICE,
      CLICK_MERCHANT_ID: '888',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${ROOT}/api/state`)).ok) return;
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

describe('top-up orders', () => {
  test('creating an order does not credit the wallet and yields a checkout link', async () => {
    const token = await driver();
    const before = await balance(token);
    const { order, checkoutUrl, sandbox } = await topup(token, 'payme', 50000);
    assert.equal(order.status, 'pending');
    assert.equal(sandbox, false, 'real keys were configured, so this is not a sandbox');
    const decoded = Buffer.from(checkoutUrl.split('/').pop(), 'base64').toString();
    assert.match(decoded, new RegExp(`ac\\.order_id=${order.id}`));
    assert.match(decoded, /a=5000000/);
    assert.equal(await balance(token), before);
  });

  test('rejects bad amounts, unknown providers and anonymous callers', async () => {
    const token = await driver();
    for (const amount of [0, 500, 12.5, 20_000_000]) {
      assert.equal((await call('/payments/topup', { method: 'POST', token, body: { provider: 'click', amount } })).status, 400, String(amount));
    }
    assert.equal((await call('/payments/topup', { method: 'POST', token, body: { provider: 'paypal', amount: 5000 } })).status, 400);
    assert.equal((await call('/payments/topup', { method: 'POST', body: { provider: 'click', amount: 5000 } })).status, 401);
  });

  test("a driver cannot read someone else's order", async () => {
    const token = await driver();
    const { order } = await topup(token, 'click', 5000);
    const biz = await login('business', 'fleet@uzauto.uz', 'Business2026');
    assert.equal((await call(`/payments/order/${order.id}`, { token: biz })).status, 404);
    assert.equal((await call(`/payments/order/${order.id}`, { token })).status, 200);
  });
});

describe('Payme Merchant API', () => {
  test('wrong credentials are refused with -32504', async () => {
    const r = await payme('CheckTransaction', { id: 'x' }, 'wrong-key');
    assert.equal(r.error.code, -32504);
  });

  test('full cycle credits once, is idempotent, and refunds on cancel', async () => {
    const token = await driver();
    const start = await balance(token);
    const { order } = await topup(token, 'payme', 30000);
    const account = { order_id: order.id };

    assert.equal((await payme('CheckPerformTransaction', { amount: 100, account })).error.code, -31001);
    assert.equal((await payme('CheckPerformTransaction', { amount: 3000000, account: { order_id: 'PAY-NOPE' } })).error.code, -31050);
    assert.equal((await payme('CheckPerformTransaction', { amount: 3000000, account })).result.allow, true);

    const txId = crypto.randomBytes(12).toString('hex');
    const created = await payme('CreateTransaction', { id: txId, time: Date.now(), amount: 3000000, account });
    assert.equal(created.result.state, 1);
    assert.equal((await payme('CreateTransaction', { id: txId, time: Date.now(), amount: 3000000, account })).result.state, 1);

    const other = await payme('CreateTransaction', { id: 'another-tx', time: Date.now(), amount: 3000000, account });
    assert.equal(other.error.code, -31050, 'second transaction for one order was accepted');

    assert.equal(await balance(token), start, 'credited before PerformTransaction');
    assert.equal((await payme('PerformTransaction', { id: txId })).result.state, 2);
    assert.equal(await balance(token), start + 30000);

    await payme('PerformTransaction', { id: txId });
    assert.equal(await balance(token), start + 30000, 'double credit on repeated PerformTransaction');
    assert.equal((await payme('CheckTransaction', { id: txId })).result.state, 2);
    assert.equal((await call(`/payments/order/${order.id}`, { token })).data.status, 'paid');

    const cancelled = await payme('CancelTransaction', { id: txId, reason: 5 });
    assert.equal(cancelled.result.state, -2);
    assert.equal(await balance(token), start);
  });

  test('unknown transactions and methods get protocol errors', async () => {
    assert.equal((await payme('PerformTransaction', { id: 'missing' })).error.code, -31003);
    assert.equal((await payme('DoSomething', {})).error.code, -32601);
  });
});

describe('Click SHOP API', () => {
  test('prepare → complete credits once', async () => {
    const token = await driver();
    const start = await balance(token);
    const { order } = await topup(token, 'click', 25000);
    const base = { click_trans_id: '9001', click_paydoc_id: '5001', merchant_trans_id: order.id, amount: '25000' };

    const prepared = await click('prepare', { ...base, action: '0' });
    assert.equal(prepared.error, 0, prepared.error_note);
    assert.ok(prepared.merchant_prepare_id);
    assert.equal(await balance(token), start, 'credited at prepare');

    const completed = await click('complete', { ...base, action: '1', merchant_prepare_id: String(prepared.merchant_prepare_id) });
    assert.equal(completed.error, 0, completed.error_note);
    assert.equal(await balance(token), start + 25000);

    const again = await click('complete', { ...base, action: '1', merchant_prepare_id: String(prepared.merchant_prepare_id) });
    assert.equal(again.error, -4);
    assert.equal(await balance(token), start + 25000, 'double credit on repeated complete');
  });

  test('bad signatures, wrong amounts and unknown orders are refused', async () => {
    const token = await driver();
    const { order } = await topup(token, 'click', 15000);
    const base = { click_trans_id: '9002', click_paydoc_id: '5002', merchant_trans_id: order.id, action: '0' };
    assert.equal((await click('prepare', { ...base, amount: '15000' }, 'forged-secret')).error, -1);
    assert.equal((await click('prepare', { ...base, amount: '99' })).error, -2);
    assert.equal((await click('prepare', { ...base, amount: '15000', merchant_trans_id: 'PAY-NOPE' })).error, -5);
  });

  test('a failure reported by Click voids the order', async () => {
    const token = await driver();
    const start = await balance(token);
    const { order } = await topup(token, 'click', 12000);
    const base = { click_trans_id: '9003', click_paydoc_id: '5003', merchant_trans_id: order.id, amount: '12000' };
    const prepared = await click('prepare', { ...base, action: '0' });
    const failed = await click('complete', { ...base, action: '1', merchant_prepare_id: String(prepared.merchant_prepare_id), error: '-5017', error_note: 'Insufficient funds' });
    assert.equal(failed.error, -9);
    assert.equal(await balance(token), start);
    assert.equal((await call(`/payments/order/${order.id}`, { token })).data.status, 'cancelled');
  });
});

describe('sandbox', () => {
  test('is unavailable once real keys are configured', async () => {
    const token = await driver();
    const { order } = await topup(token, 'payme', 5000);
    assert.equal((await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token })).status, 404);
  });
});

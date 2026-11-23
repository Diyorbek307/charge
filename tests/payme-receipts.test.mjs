/**
 * Payme Subscribe API: a top-up becomes a Payme receipt, the driver pays it at
 * checkout.paycom.uz/<id>, and the wallet grows once Payme says state 4.
 * A small fake Payme stands in for checkout.paycom.uz/api.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10600 + Math.floor(Math.random() * 90);
const PAYME_PORT = PORT + 100;
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let payme;
let dataDir;

const receipts = new Map();
const seen = [];
let fail = false;
let cancelFails = false;
const TTL = 4000;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const driver = async () => (await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data.token;

before(async () => {
  payme = createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push({ auth: req.headers['x-auth'], ...body });
      const reply = r => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...r }));
      if (fail) return reply({ error: { code: -32400, message: 'down' } });
      if (body.method === 'receipts.create') {
        const id = `r${receipts.size + 1}`.padEnd(24, '0');
        receipts.set(id, { _id: id, state: 0, amount: body.params.amount });
        return reply({ result: { receipt: receipts.get(id) } });
      }
      const r = receipts.get(body.params?.id);
      if (!r) return reply({ error: { code: -31602, message: 'Чек не найден' } });
      if (body.method === 'receipts.check') return reply({ result: { state: r.state } });
      if (body.method === 'receipts.cancel') {
        if (cancelFails) return reply({ error: { code: -32400, message: 'busy' } });
        if (r.state !== 4) r.state = 50;
        return reply({ result: { receipt: r } });
      }
      reply({ error: { code: -32601, message: 'no method' } });
    });
  }).listen(PAYME_PORT);

  dataDir = mkdtempSync(join(tmpdir(), 'oc-rcpt-'));
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', OSM_PLACES: 'false',
      PAYME_CASHBOX_ID: 'cashbox-1', PAYME_CASHBOX_KEY: 'secret-1', PAYME_API_URL: `http://127.0.0.1:${PAYME_PORT}/api`, ORDER_TTL_MS: String(TTL),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  payme?.close();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* Windows */ }
});

test('a Payme top-up creates a receipt and is credited once Payme says it is paid', async () => {
  const token = await driver();
  const balance = async () => (await call('/state', { token })).data.wallets['acc-driver'].balance;
  const start = await balance();

  const r = await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 50000 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.sandbox, false);
  const create = seen.find(s => s.method === 'receipts.create');
  assert.equal(create.auth, 'cashbox-1:secret-1');
  assert.equal(create.params.amount, 5_000_000, 'amount goes in tiyin');
  assert.equal(create.params.account.order_id, r.data.order.id);
  const receiptId = [...receipts.keys()][0];
  assert.match(r.data.checkoutUrl, new RegExp(`paycom\\.uz/${receiptId}$`));

  // Not paid yet: still pending, nothing credited.
  assert.equal((await call(`/payments/order/${r.data.order.id}`, { token })).data.status, 'pending');
  assert.equal(await balance(), start);

  // The driver pays at Payme.
  receipts.get(receiptId).state = 4;
  const paid = await call(`/payments/order/${r.data.order.id}`, { token });
  assert.equal(paid.data.status, 'paid');
  // A second look does not credit twice.
  await call('/payments', { token });
  const list = (await call('/payments', { token })).data;
  assert.equal(list.filter(o => o.id === r.data.order.id && o.status === 'paid').length, 1);
  assert.equal(await balance(), start + 50000);
});

test('a receipt cancelled at Payme cancels the order', async () => {
  const token = await driver();
  const r = await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 50000 } });
  const receiptId = [...receipts.keys()].at(-1);
  receipts.get(receiptId).state = 50;
  assert.equal((await call(`/payments/order/${r.data.order.id}`, { token })).data.status, 'cancelled');
});

test('when Payme is down the driver gets a clear error and no order is left', async () => {
  const token = await driver();
  const count = (await call('/payments', { token })).data.length;
  fail = true;
  const r = await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 50000 } });
  fail = false;
  assert.equal(r.status, 502);
  assert.match(r.data.error, /Payme/);
  assert.equal((await call('/payments', { token })).data.length, count);
});

test('an unpaid receipt is closed only once Payme takes the cancel; paid meanwhile, it is credited', async () => {
  const token = await driver();
  const balance = async () => (await call('/state', { token })).data.wallets['acc-driver'].balance;
  const start = await balance();
  const r = await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 30000 } });
  const receiptId = [...receipts.keys()].at(-1);
  await new Promise(res => setTimeout(res, TTL + 500));
  // Past its time, but Payme refuses the cancel: the order stays open, not "expired".
  cancelFails = true;
  assert.equal((await call(`/payments/order/${r.data.order.id}`, { token })).data.status, 'pending');
  cancelFails = false;
  // The driver pays it after all: the money reaches the wallet.
  receipts.get(receiptId).state = 4;
  assert.equal((await call(`/payments/order/${r.data.order.id}`, { token })).data.status, 'paid');
  assert.equal(await balance(), start + 30000);
});

test('a receipt Payme reports paid after we closed it is still credited, once', async () => {
  const token = await driver();
  const balance = async () => (await call('/state', { token })).data.wallets['acc-driver'].balance;
  const start = await balance();
  const r = await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 40000 } });
  const receiptId = [...receipts.keys()].at(-1);
  await new Promise(res => setTimeout(res, TTL + 500));
  assert.equal((await call(`/payments/order/${r.data.order.id}`, { token })).data.status, 'expired');
  // Paid at Payme in the same moment (Payme says 4): it must not be lost.
  receipts.get(receiptId).state = 4;
  assert.equal((await call(`/payments/order/${r.data.order.id}`, { token })).data.status, 'paid');
  await call('/payments', { token });
  assert.equal(await balance(), start + 40000);
});

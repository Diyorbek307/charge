/**
 * Direct settlement: a partner network paid straight into its own Payme
 * cashbox / Click service. The driver's balance at that network pays for its
 * stations; we see every payment and charge, and the commission it owes us.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 8100 + Math.floor(Math.random() * 300);
const ROOT = `http://127.0.0.1:${PORT}`;
const BASE = `${ROOT}/api`;
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
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const admin = () => login('admin', 'admin@voli.uz', 'Admin2026');
const driver = () => login('driver', '+998901234567', 'Driver2026');

const PAYME_KEY = 'ecovolt-payme-key-123';
const CLICK_SECRET = 'ecovolt-click-secret';
const payme = (path, key, method, params) =>
  fetch(`${BASE}/payments${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json());
const clickSign = (f, withPrepare, secret) =>
  crypto.createHash('md5').update([f.click_trans_id, f.service_id, secret, f.merchant_trans_id, ...(withPrepare ? [f.merchant_prepare_id] : []), f.amount, f.action, f.sign_time].map(String).join('')).digest('hex');
const click = (path, f) => fetch(`${BASE}/payments${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).then(r => r.json());

const ecoStation = async token => {
  const st = (await call('/state', { token })).data.stations.find(s => s.operatorId === 'op-002' && s.connectors.some(c => c.status === 'available'));
  return { st, c: st.connectors.find(c => c.status === 'available') };
};
const netOf = async (token, op = 'op-002') => (await call('/state', { token })).data.networkWallets?.find(w => w.operatorId === op);

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-direct-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', PUBLIC_URL: '' },
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

describe('paying a network directly', () => {
  test('the admin switches a network to direct payment with its own cashbox keys', async () => {
    const adm = await admin();
    assert.equal((await call('/admin/operators/op-002/payout', { method: 'PUT', token: adm, body: { mode: 'direct' } })).status, 400, 'direct without a cashbox');
    assert.equal((await call('/admin/operators/op-002/payout', { method: 'PUT', token: adm, body: { mode: 'direct', click: { serviceId: 'abc', merchantId: '1', secret: 'x' } } })).status, 400);
    const r = await call('/admin/operators/op-002/payout', {
      method: 'PUT',
      token: adm,
      body: { mode: 'direct', payme: { merchantId: 'eco-merchant', key: PAYME_KEY }, click: { serviceId: '55501', merchantId: '66601', secret: CLICK_SECRET } },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.mode, 'direct');
    assert.ok(!JSON.stringify(r.data).includes(PAYME_KEY) && !JSON.stringify(r.data).includes(CLICK_SECRET), 'a cashbox key leaked');
    assert.equal(r.data.callbacks.payme, `${ROOT}/api/payments/payme/op-002`);
    assert.equal(r.data.callbacks.clickPrepare, `${ROOT}/api/payments/click/op-002/prepare`);
    assert.equal((await call('/admin/operators/op-002/payout', { token: await driver() })).status, 403);
  });

  test('without a balance at the network the charge is refused, and the company cannot pay there', async () => {
    const token = await driver();
    assert.deepEqual(await netOf(token), { operatorId: 'op-002', name: 'EcoVolt', logo: '⚡', balance: 0, direct: true, payme: true, click: true });
    const { st, c } = await ecoStation(token);
    const r = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(r.status, 402);
    assert.match(r.data.error, /баланс/i);
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, payer: 'company' } })).status, 409);
  });

  test('a Payme top-up goes to the network’s cashbox and is confirmed to us with its key', async () => {
    const token = await driver();
    const mainBefore = Object.values((await call('/state', { token })).data.wallets)[0].balance;
    const created = await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 100000, operatorId: 'op-002' } });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.sandbox, false, 'a network with real keys is not a sandbox');
    assert.ok(Buffer.from(created.data.checkoutUrl.split('/').pop(), 'base64').toString().startsWith('m=eco-merchant;'), 'checkout not in the network’s cashbox');
    const order = created.data.order;
    const params = { amount: 100000 * 100, account: { order_id: order.id } };

    // Our own cashbox does not know a network's order, and our key does not open the network's endpoint.
    assert.equal((await payme('/payme', 'demo-payme-key', 'CheckPerformTransaction', params)).error.code, -31050);
    assert.equal((await payme('/payme/op-002', 'demo-payme-key', 'CheckPerformTransaction', params)).error.code, -32504);

    assert.deepEqual((await payme('/payme/op-002', PAYME_KEY, 'CheckPerformTransaction', params)).result, { allow: true });
    assert.equal((await payme('/payme/op-002', PAYME_KEY, 'CreateTransaction', { ...params, id: 'pm-tx-1', time: Date.now() })).result.state, 1);
    assert.equal((await payme('/payme/op-002', PAYME_KEY, 'PerformTransaction', { id: 'pm-tx-1' })).result.state, 2);

    assert.equal((await netOf(token)).balance, 100000);
    assert.equal(Object.values((await call('/state', { token })).data.wallets)[0].balance, mainBefore, 'the Voli wallet changed');
  });

  test('a Click payment to the network is signed with the network’s secret', async () => {
    const token = await driver();
    const order = (await call('/payments/topup', { method: 'POST', token, body: { provider: 'click', amount: 20000, operatorId: 'op-002' } })).data.order;
    const f = { click_trans_id: '9001', service_id: '55501', click_paydoc_id: '1', merchant_trans_id: order.id, amount: '20000', action: '0', error: '0', error_note: 'Success', sign_time: '2026-10-28 12:00:00' };
    // Signed with our secret: refused.
    assert.equal((await click('/click/op-002/prepare', { ...f, sign_string: clickSign(f, false, 'demo-click-secret') })).error, -1);
    const prepared = await click('/click/op-002/prepare', { ...f, sign_string: clickSign(f, false, CLICK_SECRET) });
    assert.equal(prepared.error, 0, JSON.stringify(prepared));
    const done = { ...f, action: '1', merchant_prepare_id: String(prepared.merchant_prepare_id) };
    assert.equal((await click('/click/op-002/complete', { ...done, sign_string: clickSign(done, true, CLICK_SECRET) })).error, 0);
    assert.equal((await netOf(token)).balance, 120000);
  });

  test('a charge at the network is paid from that balance; we see it and our commission', async () => {
    const token = await driver();
    const mainBefore = Object.values((await call('/state', { token })).data.wallets)[0].balance;
    const { st, c } = await ecoStation(token);
    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.session.direct, 'op-002');
    const done = (await call(`/sessions/${started.data.session.id}/stop`, { method: 'POST', token })).data;
    assert.equal(done.transaction.method, 'Баланс сети EcoVolt');
    assert.equal((await netOf(token)).balance, 120000 - done.session.cost);
    assert.equal(Object.values((await call('/state', { token })).data.wallets)[0].balance, mainBefore);

    const adm = await admin();
    const report = (await call('/admin/direct-settlement?days=30', { token: adm })).data;
    const eco = report.rows.find(r => r.operatorId === 'op-002');
    assert.equal(eco.received, 120000);
    assert.equal(eco.payments, 2);
    assert.equal(eco.charged, done.session.cost);
    assert.equal(eco.commission, Math.round((done.session.cost * done.session.commissionRate) / 100));
    assert.equal(eco.held, 120000 - done.session.cost);
    assert.ok(report.lines.some(l => l.kind === 'charge' && l.ref === done.session.id));

    // A refund goes back to the balance at the network, and the commission with it.
    assert.equal((await call(`/transactions/${done.transaction.id}/refund`, { method: 'POST', token: adm })).status, 200);
    assert.equal((await netOf(token)).balance, 120000);
    const after = (await call('/admin/direct-settlement', { token: adm })).data.rows.find(r => r.operatorId === 'op-002');
    assert.equal(after.charged, 0);
    assert.equal(after.commission, 0);
  });

  test('a network sees only its own money trail', async () => {
    const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
    const r = await call('/operator/direct-settlement', { token: op });
    assert.equal(r.status, 200);
    assert.ok(r.data.rows.every(x => x.operatorId === 'op-001'));
    assert.ok(r.data.lines.every(x => x.operatorId === 'op-001'));
    assert.equal(r.data.payout.mode, 'platform');
  });

  test('back to settlement through the platform: the main wallet pays again', async () => {
    const adm = await admin();
    assert.equal((await call('/admin/operators/op-002/payout', { method: 'PUT', token: adm, body: { mode: 'platform' } })).status, 200);
    const token = await driver();
    // The money the driver holds at the network stays visible.
    const left = await netOf(token);
    assert.equal(left.direct, false);
    assert.equal(left.balance, 120000);
    const { st, c } = await ecoStation(token);
    const s = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(s.status, 200);
    assert.equal(s.data.session.direct, undefined);
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token });
  });
});

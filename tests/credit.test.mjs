/**
 * Charging on credit: enrolment with a face and the terms, a fresh face check
 * per charge, the debt, repayment, refunds and the admin's view.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 7100 + Math.floor(Math.random() * 300);
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
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const admin = () => login('admin', 'admin@voli.uz', 'Admin2026');
/** A camera frame stand-in: a JPEG data URL with fresh bytes each time. */
const photo = () => `data:image/jpeg;base64,${crypto.randomBytes(6000).toString('base64')}`;

async function newDriver(phone, name) {
  const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
  const r = await call('/auth/register', { method: 'POST', body: { phone, code, name, password: 'Credit2026', consent: { version: 1 } } });
  return { token: r.data.token, id: r.data.user.id };
}
async function freeConnector(token) {
  const st = (await call('/state', { token })).data.stations.find(s => s.connectors.some(c => c.status === 'available') && !s.private);
  return { st, c: st.connectors.find(c => c.status === 'available') };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-credit-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', FACE_PROVIDER: '' },
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

describe('charging on credit', () => {
  test('enrolment needs the current terms and a real camera frame', async () => {
    const { token } = await newDriver('+998935551001', 'Jasur Karimov');
    const terms = (await call('/credit/terms')).data;
    assert.ok(terms.version && terms.limit > 0 && terms.days > 0);
    assert.equal((await call('/credit', { token })).data.enrolled, false);
    assert.equal((await call('/credit/enroll', { method: 'POST', token, body: { image: photo() } })).status, 400, 'terms not accepted');
    assert.equal((await call('/credit/enroll', { method: 'POST', token, body: { image: photo(), accept: '1999-01' } })).status, 400, 'old terms');
    assert.equal((await call('/credit/enroll', { method: 'POST', token, body: { image: 'data:image/jpeg;base64,AAAA', accept: terms.version } })).status, 400, 'tiny image');
    const r = await call('/credit/enroll', { method: 'POST', token, body: { image: photo(), accept: terms.version } });
    assert.equal(r.status, 201);
    assert.equal(r.data.enrolled, true);
    assert.equal(r.data.available, terms.limit);
    assert.equal(r.data.provider, 'sandbox');
    assert.equal((await call('/credit/enroll', { method: 'POST', token, body: { image: photo(), accept: terms.version } })).status, 409);
    // The photo never comes back to the client.
    assert.ok(!JSON.stringify((await call('/state', { token })).data.credit).includes('base64'));
  });

  test('a credit charge needs a fresh face check, becomes a debt and is repaid from the wallet', async () => {
    const { token, id } = await newDriver('+998935551002', 'Malika Rahimova');
    const terms = (await call('/credit/terms')).data;
    const { st, c } = await freeConnector(token);
    // Not enrolled: refused even with a face token from nowhere.
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, payer: 'credit', faceToken: 'x' } })).status, 403);
    const face = photo();
    await call('/credit/enroll', { method: 'POST', token, body: { image: face, accept: terms.version } });
    // No face check: refused.
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, payer: 'credit' } })).status, 403);
    // The enrolment photo replayed is not a fresh check.
    assert.equal((await call('/credit/verify', { method: 'POST', token, body: { image: face } })).status, 409);
    const v = await call('/credit/verify', { method: 'POST', token, body: { image: photo() } });
    assert.equal(v.status, 200);
    const walletBefore = (await call('/state', { token })).data.wallets[id].balance;
    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, payer: 'credit', faceToken: v.data.faceToken } });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.session.credit, true);
    const done = (await call(`/sessions/${started.data.session.id}/stop`, { method: 'POST', token })).data;
    const state = (await call('/state', { token })).data;
    assert.equal(state.wallets[id].balance, walletBefore, 'the wallet paid for a credit charge');
    assert.equal(state.credit.debt, done.session.cost);
    assert.equal(state.credit.available, terms.limit - done.session.cost);
    assert.equal(state.credit.debts[0].sessionId, done.session.id);
    assert.ok(Date.parse(state.credit.nextDue) > Date.now() + (terms.days - 1) * 86400_000);
    // The token was spent.
    const { st: st2, c: c2 } = await freeConnector(token);
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st2.id, connectorId: c2.id, payer: 'credit', faceToken: v.data.faceToken } })).status, 403);
    // Someone else's token does not open my credit.
    const other = await newDriver('+998935551003', 'Otabek Saidov');
    await call('/credit/enroll', { method: 'POST', token: other.token, body: { image: photo(), accept: terms.version } });
    const foreign = (await call('/credit/verify', { method: 'POST', token: other.token, body: { image: photo() } })).data.faceToken;
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st2.id, connectorId: c2.id, payer: 'credit', faceToken: foreign } })).status, 403);
    // Deleting the face while owing is refused; repaying clears it, then deletion works.
    assert.equal((await call('/credit/delete', { method: 'POST', token })).status, 409);
    // An empty wallet cannot repay; after a top-up it can.
    assert.equal((await call('/credit/repay', { method: 'POST', token, body: {} })).status, 402);
    const topped = (await call('/wallet/topup', { method: 'POST', token, body: { amount: 500000 } })).status;
    assert.equal(topped, 200);
    const funded = (await call('/state', { token })).data.wallets[id].balance;
    const paid = await call('/credit/repay', { method: 'POST', token, body: {} });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.paid, done.session.cost);
    assert.equal(paid.data.credit.debt, 0);
    assert.equal(paid.data.wallet.balance, funded - done.session.cost);
    assert.equal((await call('/credit/repay', { method: 'POST', token, body: {} })).status, 409);
    const del = await call('/credit/delete', { method: 'POST', token });
    assert.equal(del.status, 200);
    assert.equal(del.data.enrolled, false);
  });

  test('the admin sees debts without the photo, can pause credit, and a refund writes the debt off', async () => {
    const { token } = await newDriver('+998935551004', 'Dilnoza Ergasheva');
    const terms = (await call('/credit/terms')).data;
    await call('/credit/enroll', { method: 'POST', token, body: { image: photo(), accept: terms.version } });
    const { st, c } = await freeConnector(token);
    const ft = (await call('/credit/verify', { method: 'POST', token, body: { image: photo() } })).data.faceToken;
    const s = (await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, payer: 'credit', faceToken: ft } })).data.session;
    const done = (await call(`/sessions/${s.id}/stop`, { method: 'POST', token })).data;

    const adm = await admin();
    const overview = (await call('/admin/credit', { token: adm })).data;
    const row = overview.rows.find(r => r.user === 'Dilnoza Ergasheva');
    assert.equal(row.debt, done.session.cost);
    assert.ok(!JSON.stringify(overview).includes('base64'), 'the admin got the face photo');
    assert.equal((await call('/admin/credit', { token })).status, 403);

    await call(`/admin/credit/${row.userId}`, { method: 'POST', token: adm, body: { status: 'paused' } });
    const { st: st2, c: c2 } = await freeConnector(token);
    const ft2 = (await call('/credit/verify', { method: 'POST', token, body: { image: photo() } })).data.faceToken;
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st2.id, connectorId: c2.id, payer: 'credit', faceToken: ft2 } })).status, 403);

    const r = await call(`/transactions/${done.transaction.id}/refund`, { method: 'POST', token: adm });
    assert.equal(r.status, 200);
    assert.equal((await call('/credit', { token })).data.debt, 0);
  });
});

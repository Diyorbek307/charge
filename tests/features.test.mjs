/**
 * Driver features beyond the charge itself: when a busy connector frees up,
 * community reports, loyalty points, SOS, family wallets and private hosts.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 6800 + Math.floor(Math.random() * 300);
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
const driver = () => login('driver', '+998901234567', 'Driver2026');
const admin = () => login('admin', 'admin@powergo.uz', 'Admin2026');

/** A second driver, registered the way a real one would be. */
async function newDriver(phone, name) {
  const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
  const r = await call('/auth/register', { method: 'POST', body: { phone, code, name, password: 'Second2026', consent: { version: 1 } } });
  return { token: r.data.token, id: r.data.user.id };
}

async function freeConnector(token) {
  const st = (await call('/state', { token })).data.stations.find(s => s.connectors.some(c => c.status === 'available') && !s.id.startsWith('st-00'));
  return { st, c: st.connectors.find(c => c.status === 'available') };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-feat-'));
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

describe('driver features', () => {
  test('a busy connector says when it should free up', async () => {
    const token = await driver();
    const { st, c } = await freeConnector(token);
    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(started.status, 200);
    const f = (await call(`/stations/${st.id}/forecast`)).data;
    const mine = f.connectors.find(x => x.id === c.id);
    assert.ok(mine.freeInMin > 0, 'no estimate for the busy connector');
    assert.ok(f.typical.dc > 0 && f.typical.ac > 0);
    await call(`/sessions/${started.data.session.id}/stop`, { method: 'POST', token });
  });

  test('community reports, confirmations and points', async () => {
    const a = await driver();
    const b = await newDriver('+998935550101', 'Bekzod Sobirov');
    const { st } = await freeConnector(a);
    const made = await call(`/stations/${st.id}/community`, { method: 'POST', token: a, body: { kind: 'power', value: 92 } });
    assert.equal(made.status, 201);
    assert.equal(made.data.community.power, 92);
    assert.equal((await call(`/stations/${st.id}/community`, { method: 'POST', token: a, body: { kind: 'power', value: 80 } })).status, 409, 'reported the same twice');
    assert.equal((await call(`/stations/${st.id}/community`, { method: 'POST', token: a, body: { kind: 'nonsense' } })).status, 400);
    assert.equal((await call(`/community/${made.data.report.id}/confirm`, { method: 'POST', token: a })).status, 409, 'confirmed own report');
    const before = (await call('/loyalty', { token: a })).data.balance;
    const confirmed = await call(`/community/${made.data.report.id}/confirm`, { method: 'POST', token: b.token });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.report.confirms, 1);
    assert.equal((await call('/loyalty', { token: a })).data.balance, before + 5);
    assert.equal((await call(`/stations/${st.id}/community`, { method: 'POST', token: await admin(), body: { kind: 'works' } })).status, 403);
  });

  test('charging earns points that turn into wallet money', async () => {
    const token = await driver();
    const before = (await call('/loyalty', { token })).data;
    const { st, c } = await freeConnector(token);
    const s = (await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } })).data.session;
    const done = (await call(`/sessions/${s.id}/stop`, { method: 'POST', token })).data.session;
    const after = (await call('/loyalty', { token })).data;
    assert.equal(after.balance, before.balance + Math.round(done.energy));
    assert.equal((await call('/loyalty/redeem', { method: 'POST', token, body: { points: 150 } })).status, 400, 'not a multiple of 100');
    if (after.balance >= 100) {
      const wallet = (await call('/state', { token })).data.wallets['acc-driver'].balance;
      const r = await call('/loyalty/redeem', { method: 'POST', token, body: { points: 100 } });
      assert.equal(r.status, 200);
      assert.equal(r.data.wallet.balance, wallet + 1000);
      assert.equal(r.data.loyalty.balance, after.balance - 100);
    }
  });

  test('SOS reaches the dispatcher once, and the driver sees it taken', async () => {
    const token = await driver();
    const sent = await call('/sos', { method: 'POST', token, body: { kind: 'tow', lat: 41.3, lng: 69.28, note: 'Сел аккумулятор на трассе' } });
    assert.equal(sent.status, 201);
    assert.equal((await call('/sos', { method: 'POST', token, body: { kind: 'tow' } })).status, 409, 'a second open SOS');
    const adm = await admin();
    const list = (await call('/admin/sos', { token: adm })).data;
    assert.ok(list.some(x => x.id === sent.data.sos.id && x.lat === 41.3));
    assert.equal((await call(`/admin/sos/${sent.data.sos.id}/status`, { method: 'POST', token: adm, body: { status: 'taken' } })).status, 200);
    assert.equal((await call('/sos/mine', { token })).data[0].status, 'taken');
    await call(`/admin/sos/${sent.data.sos.id}/status`, { method: 'POST', token: adm, body: { status: 'closed' } });
    assert.equal((await call('/admin/sos', { token })).status, 403);
  });

  test('a relative charges from the family wallet within the limit', async () => {
    const owner = await driver();
    const kid = await newDriver('+998935550202', 'Aziza Tursunova');
    assert.equal((await call('/family/invite', { method: 'POST', token: owner, body: { phone: '+998935559999', limit: 100000 } })).status, 404);
    assert.equal((await call('/family/invite', { method: 'POST', token: owner, body: { phone: '+998935550202', limit: 100000 } })).status, 201);
    const { st, c } = await freeConnector(kid.token);
    // Not accepted yet: the wallet is not available.
    assert.equal((await call('/sessions/start', { method: 'POST', token: kid.token, body: { stationId: st.id, connectorId: c.id, payer: 'family:acc-driver' } })).status, 403);
    await call('/family/answer', { method: 'POST', token: kid.token, body: { ownerId: 'acc-driver', accept: true } });
    const ownerWallet = (await call('/state', { token: owner })).data.wallets['acc-driver'].balance;
    const s = await call('/sessions/start', { method: 'POST', token: kid.token, body: { stationId: st.id, connectorId: c.id, payer: 'family:acc-driver' } });
    assert.equal(s.status, 200);
    const done = (await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: kid.token })).data.session;
    assert.equal((await call('/state', { token: owner })).data.wallets['acc-driver'].balance, ownerWallet - done.cost);
    const fam = (await call('/family', { token: owner })).data;
    assert.equal(fam.members[0].spent, done.cost);
    // Limit used up: refused. The lowest limit is 10 000 сум, so pick a connector
    // whose minimum prepaid charge (5 kWh) is above what is left, whatever the hour.
    await call(`/family/${kid.id}`, { method: 'POST', token: owner, body: { limit: 10000 } });
    const pricey = (await call('/state', { token: kid.token })).data.stations
      .flatMap(s => s.connectors.filter(c => c.status === 'available').map(c => ({ st: s, c })))
      .sort((a, b) => b.c.price - a.c.price)[0];
    assert.ok(pricey.c.price * 5 > 10000 - done.cost, 'no connector expensive enough for this check');
    const { st: st2, c: c2 } = pricey;
    assert.equal((await call('/sessions/start', { method: 'POST', token: kid.token, body: { stationId: st2.id, connectorId: c2.id, payer: 'family:acc-driver' } })).status, 402);
  });

  test('a private host applies, is approved, and earns from charges', async () => {
    const host = await driver();
    const app = {
      kind: 'hotel', name: 'Hotel Registan Garage', city: 'Samarqand', address: 'Registon ko‘chasi, 12',
      geoLat: 39.655, geoLng: 66.975, hours: '24/7', connectors: [{ type: 'Type2', power: 22, price: 1500 }],
    };
    assert.equal((await call('/hosts/apply', { method: 'POST', token: host, body: { ...app, kind: 'castle' } })).status, 400);
    const applied = await call('/hosts/apply', { method: 'POST', token: host, body: app });
    assert.equal(applied.status, 201);
    assert.equal((await call('/hosts/apply', { method: 'POST', token: host, body: app })).status, 409, 'two pending applications');
    const adm = await admin();
    const decided = await call(`/admin/hosts/${applied.data.application.id}/decision`, { method: 'POST', token: adm, body: { approve: true } });
    assert.equal(decided.status, 200);
    const station = decided.data.station;
    assert.ok(station.private && station.operatorId === 'host-acc-driver');
    const mine = (await call('/hosts/mine', { token: host })).data;
    assert.equal(mine.applications[0].status, 'approved');
    assert.equal(mine.stations.length, 1);
    assert.equal((await call(`/admin/hosts/${applied.data.application.id}/decision`, { method: 'POST', token: adm, body: { approve: false } })).status, 409);
  });
});

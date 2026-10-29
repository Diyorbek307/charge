/**
 * OCPI 2.2.1, PowerGo as the eMSP: a partner network (the mock CPO from
 * scripts/) is connected by the admin, its stations appear on the map, and a
 * driver's charge runs through the partner's own system to a settled bill.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { mockCpo } from '../scripts/ocpi-cpo-mock.mjs';

const PORT = 7500 + Math.floor(Math.random() * 300);
const CPO_PORT = PORT + 400;
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let cpoServer;
let cpo;
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
const admin = () => login('admin', 'admin@powergo.uz', 'Admin2026');
const driver = () => login('driver', '+998901234567', 'Driver2026');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    const v = await fn();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}
const partnerStations = async token => (await call('/state', { token })).data.stations.filter(s => s.operator.startsWith('OCPI Demo'));

before(async () => {
  cpo = mockCpo({ base: `http://127.0.0.1:${CPO_PORT}`, meterEveryMs: 100, speed: 3600 });
  const app = express();
  app.use(cpo.router);
  await new Promise(r => (cpoServer = app.listen(CPO_PORT, r)));

  dataDir = mkdtempSync(join(tmpdir(), 'oc-ocpi-'));
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
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  cpoServer?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('OCPI partner networks', () => {
  test('our OCPI endpoints refuse callers without a token we issued', async () => {
    assert.equal((await fetch(`http://127.0.0.1:${PORT}/ocpi/versions`)).status, 401);
    const wrong = await fetch(`http://127.0.0.1:${PORT}/ocpi/versions`, { headers: { Authorization: `Token ${Buffer.from('nope-nope').toString('base64')}` } });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).status_code, 2000);
  });

  test('the admin connects a partner and its stations, prices and statuses appear', async () => {
    const adm = await admin();
    assert.equal((await call('/admin/ocpi', { method: 'POST', token: adm, body: { versionsUrl: 'not a url', token: 'x' } })).status, 400);
    const tokenA = cpo.tokenA;
    const r = await call('/admin/ocpi', { method: 'POST', token: adm, body: { versionsUrl: cpo.versionsUrl, token: tokenA } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.synced, 2, 'both pages of locations were pulled');
    assert.equal(r.data.partner.status, 'connected');
    assert.equal(r.data.partner.party_id, 'DMO');
    assert.ok(!JSON.stringify(r.data).includes(tokenA), 'a token leaked to the admin');
    assert.ok(!('tokenB' in r.data.partner) && !('tokenC' in r.data.partner));
    // The same network cannot be connected twice.
    assert.equal((await call('/admin/ocpi', { method: 'POST', token: adm, body: { versionsUrl: cpo.versionsUrl, token: tokenA } })).status, 409);

    const list = (await call('/admin/ocpi', { token: adm })).data;
    assert.equal(list.partners.length, 1);
    assert.equal(list.partners[0].stations, 2);
    assert.match(list.ourVersionsUrl, /\/ocpi\/versions$/);
    assert.equal((await call('/admin/ocpi', { token: await driver() })).status, 403);

    const stations = await partnerStations(adm);
    assert.equal(stations.length, 2);
    const chilonzor = stations.find(s => s.name.endsWith('Chilonzor'));
    assert.deepEqual(chilonzor.connectors.map(c => [c.type, c.power, c.price, c.status]), [['CCS2', 120, 2200, 'available'], ['Type2', 22, 1400, 'available']]);
    const op = (await call('/state', { token: adm })).data.operators.find(o => o.name.startsWith('OCPI Demo'));
    assert.equal(op.integration, 'OCPI 2.2.1');
  });

  test('a status the partner pushes shows on the map', async () => {
    await cpo.setStatus('LOC-2', '2001', 'OUTOFORDER');
    const token = await driver();
    await until(async () => (await partnerStations(token)).find(s => s.name.endsWith('Yunusobod')).connectors[0].status === 'unavailable', 'the pushed status');
    await cpo.setStatus('LOC-2', '2001', 'AVAILABLE');
    await until(async () => (await partnerStations(token)).find(s => s.name.endsWith('Yunusobod')).connectors[0].status === 'available', 'the status back to available');
  });

  test('a driver charges on a partner network: start, meter, stop, the partner’s bill', async () => {
    const token = await driver();
    const st = (await partnerStations(token)).find(s => s.name.endsWith('Chilonzor'));
    const c = st.connectors[0];
    const me = (await call('/state', { token })).data;
    const walletBefore = Object.values(me.wallets)[0].balance;

    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(started.status, 202, JSON.stringify(started.data));
    const session = await until(async () => (await call('/state', { token })).data.sessions.find(s => s.status === 'active' && s.stationId === st.id), 'the partner to report the session');
    assert.equal(session.source, 'ocpi');
    assert.equal(session.price, 2200, 'our green-hours multiplier was applied to a partner price');
    await until(async () => ((await call('/state', { token })).data.sessions.find(s => s.id === session.id).energy ?? 0) > 0, 'metered energy');

    const stop = await call(`/sessions/${session.id}/stop`, { method: 'POST', token });
    assert.equal(stop.status, 202);
    const done = await until(async () => {
      const s = (await call('/state', { token })).data.sessions.find(x => x.id === session.id);
      return s.status === 'completed' ? s : null;
    }, 'the CDR to settle the session');
    assert.ok(done.energy > 0);
    assert.equal(done.cost, Math.round(done.energy * 2200), 'the bill is not the partner’s');
    const after = (await call('/state', { token })).data;
    // PowerGo's bonus pays first; the wallet covers the rest.
    assert.equal(Object.values(after.wallets)[0].balance, walletBefore - (done.cost - (done.bonusUsed ?? 0)));
    assert.equal(after.stations.find(s => s.id === st.id).connectors[0].status, 'available');
  });

  test('a connector the partner reports busy is refused before the partner is asked', async () => {
    const token = await driver();
    await cpo.setStatus('LOC-2', '2001', 'CHARGING');
    const st = await until(async () => {
      const s = (await partnerStations(token)).find(x => x.name.endsWith('Yunusobod'));
      return s.connectors[0].status === 'occupied' ? s : null;
    }, 'the busy status');
    // Busy on our side too: refused before the partner is asked.
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: st.connectors[0].id } })).status, 409);
    await cpo.setStatus('LOC-2', '2001', 'AVAILABLE');
  });
});

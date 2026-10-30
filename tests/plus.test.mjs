/**
 * Voli Plus: the monthly subscription and what it changes.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10300 + Math.floor(Math.random() * 90);
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
const admin = () => login('admin', 'admin@voli.uz', 'Admin2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-plus-'));
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

describe('Voli Plus', () => {
  test('subscribing takes the month from the wallet, once', async () => {
    const token = await driver();
    const w0 = (await call('/state', { token })).data.wallets['acc-driver'].balance;
    const r = await call('/plus', { method: 'POST', token });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.active, true);
    assert.ok(Date.parse(r.data.renewsAt) > Date.now() + 29 * 86400_000);
    const s = (await call('/state', { token })).data;
    assert.equal(s.wallets['acc-driver'].balance, w0 - r.data.price);
    assert.equal(s.plus.active, true);
    assert.equal((await call('/plus', { method: 'POST', token })).status, 409);
  });

  test('a charge costs 5% less and the network still earns its full price', async () => {
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(x => !x.ocpi && x.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const start = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const ses = start.data.session;
    assert.equal(ses.plus, true);
    assert.equal(ses.price, Math.round(ses.networkPrice * 0.95));
    await new Promise(r => setTimeout(r, 1200));
    const done = (await call(`/sessions/${ses.id}/stop`, { method: 'POST', token })).data.session;
    if (done.energy > 0) assert.equal(done.plusCovered, Math.round(done.energy * ses.networkPrice) - done.cost);
  });

  test('booking is free, and cancelling keeps the paid month', async () => {
    const token = await driver();
    const s = (await call('/state', { token })).data;
    const st = s.stations.find(x => !x.ocpi && x.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const w0 = s.wallets['acc-driver'].balance;
    const b = await call(`/stations/${st.id}/bookings`, { method: 'POST', token, body: { connectorId: c.id, startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(), minutes: 30 } });
    assert.equal(b.status, 200, JSON.stringify(b.data));
    assert.equal(b.data.booking.fee, 0);
    assert.equal((await call('/state', { token })).data.wallets['acc-driver'].balance, w0);
    const off = await call('/plus', { method: 'DELETE', token });
    assert.equal(off.data.autoRenew, false);
    assert.equal(off.data.active, true);
  });
});

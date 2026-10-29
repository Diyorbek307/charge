/**
 * The tariff for taxi parks and couriers: volume discount, priority, a report per driver.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10400 + Math.floor(Math.random() * 90);
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-fleet-'));
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

describe('taxi and courier tariff', () => {
  test('only the park switches it on, and its discount follows the volume', async () => {
    assert.equal((await call('/fleet/plan', { method: 'PUT', token: await driver(), body: { plan: 'taxi' } })).status, 403);
    const token = await fleet();
    assert.equal((await call('/fleet/plan', { method: 'PUT', token, body: { plan: 'vip' } })).status, 400);
    const on = await call('/fleet/plan', { method: 'PUT', token, body: { plan: 'taxi' } });
    assert.equal(on.status, 200);
    assert.equal(on.data.plan, 'taxi');
    const tier = [...on.data.tiers].reverse().find(t => on.data.kwh30 >= t.kwh);
    assert.equal(on.data.discount, tier.pct);
    assert.equal((await call('/state', { token })).data.fleetPlan.plan, 'taxi');
  });

  test('a company charge takes the discount, the network keeps its price, the report counts it', async () => {
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(x => !x.ocpi && x.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const start = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, payer: 'company' } });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const ses = start.data.session;
    assert.equal(ses.corporate, true);
    assert.ok(ses.fleetDiscount >= 3);
    assert.equal(ses.price, Math.round(ses.networkPrice * (1 - ses.fleetDiscount / 100)));
    await new Promise(r => setTimeout(r, 1200));
    await call(`/sessions/${ses.id}/stop`, { method: 'POST', token });
    const report = (await call('/fleet/report', { token: await fleet() })).data;
    const me = report.drivers.find(d => d.name === 'Alisher Tursunov');
    assert.ok(me && me.charges >= 1);
    assert.equal((await call('/fleet/report?month=2026-13x', { token: await fleet() })).status, 400);
  });
});

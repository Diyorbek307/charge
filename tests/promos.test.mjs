/**
 * Promos a network runs at its own stations: who may create them, that the
 * map sees them, and that a charge started under one is priced lower.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9100 + Math.floor(Math.random() * 200);
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
const operator = () => login('operator', 'operator@greencharge.uz', 'Operator2026');
const admin = () => login('admin', 'admin@voli.uz', 'Admin2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-promos-'));
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

describe('network promos', () => {
  test('a network creates a promo only within its own stations', async () => {
    const op = await operator();
    const all = (await call('/state', { token: op })).data.stations;
    const other = all.find(s => s.operatorId !== 'op-001');
    assert.equal((await call('/operator/promos', { method: 'POST', token: op, body: { percent: 3 } })).status, 400);
    assert.equal((await call('/operator/promos', { method: 'POST', token: op, body: { percent: 20, stationIds: [other.id] } })).status, 400);
    assert.equal((await call('/operator/promos', { method: 'POST', token: op, body: { percent: 20, fromHour: 23 } })).status, 400);
    assert.equal((await call('/operator/promos', { method: 'POST', token: await driver(), body: { percent: 20 } })).status, 403);
  });

  test('a charge started under a promo costs less, and the map sees the promo', async () => {
    const op = await operator();
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(s => s.operatorId === 'op-001' && !s.ocpi && s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const made = await call('/operator/promos', { method: 'POST', token: op, body: { percent: 60, stationIds: [st.id] } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal(made.data.title, '−60% на зарядку');

    const seen = (await call('/state', { token })).data.promos;
    assert.ok(seen.some(p => p.id === made.data.id && p.stationIds.includes(st.id)), 'the promo is not on the map');

    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    const s = started.data.session;
    assert.equal(s.promo.id, made.data.id);
    assert.equal(s.price, Math.round(c.price * s.multiplier * 0.4));
    await call(`/sessions/${s.id}/stop`, { method: 'POST', token });

    assert.equal((await call(`/operator/promos/${made.data.id}`, { method: 'DELETE', token: op })).status, 200);
    assert.ok(!(await call('/promos')).data.some(p => p.id === made.data.id), 'a stopped promo is still shown');
    const mine = (await call('/operator/promos', { token: op })).data.find(p => p.id === made.data.id);
    assert.equal(mine.active, false);
  });
});

/**
 * Charge goals (up to %, for a sum, for km) stop by themselves and tell the
 * driver; scheduled starts run at their minute.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

const PORT = 8900 + Math.floor(Math.random() * 300);
const HOOK_PORT = PORT + 400;
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let hookServer;
let dataDir;
let key;
const commands = [];

async function call(path, { method = 'GET', token, body, bearer } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token || bearer ? { Authorization: `Bearer ${token ?? bearer}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const driver = () => login('driver', '+998901234567', 'Driver2026');
const net = (path, method = 'GET', body) => call(`/network/v1${path}`, { method, body, bearer: key });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 6000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(80)) {
    const v = await fn();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.post('/hook', (req, res) => {
    commands.push(req.body);
    res.json({ accepted: true });
    setTimeout(async () => {
      if (req.body.type === 'start') await net('/sessions/G-1', 'POST', { event: 'started', driverId: req.body.driver.id, station: req.body.station, connector: req.body.connector });
      if (req.body.type === 'stop') await net('/sessions/G-1', 'POST', { event: 'stopped', kwh: 3.7, cost: 6660 });
    }, 20);
  });
  await new Promise(r => (hookServer = app.listen(HOOK_PORT, r)));

  dataDir = mkdtempSync(join(tmpdir(), 'oc-goal-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', SESSION_WATCH_MS: '150', SCHEDULE_MIN_LEAD_MS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  const adm = await login('admin', 'admin@powergo.uz', 'Admin2026');
  key = (await call('/admin/operators/op-004/integration', { method: 'PUT', token: adm, body: { type: 'Network API', webhookUrl: `http://127.0.0.1:${HOOK_PORT}/hook` } })).data.key;
  await net('/stations/G1', 'PUT', { name: 'Goal Test Station', city: 'Nukus', address: 'Test ko‘chasi, 1', lat: 42.46, lng: 59.6, connectors: [{ ref: 'A', type: 'CCS2', power: 60, price: 1800, status: 'available' }] });
});

after(() => {
  server?.kill();
  hookServer?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('charge goals and scheduled starts', () => {
  test('goals are checked before the start', async () => {
    const token = await driver();
    const st = (await net('/stations')).data[0];
    const c = st.connectors[0].id;
    for (const goal of [{ kind: 'km', value: 5 }, { kind: 'sum', value: 100 }, { kind: 'percent', value: 101 }, { kind: 'litres', value: 3 }]) {
      assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c, goal } })).status, 400, JSON.stringify(goal));
    }
  });

  test('a charge "for 20 km" warns when nearly there and stops itself at the goal', async () => {
    const token = await driver();
    const st = (await net('/stations')).data[0];
    const r = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: st.connectors[0].id, goal: { kind: 'km', value: 20 } } });
    assert.equal(r.status, 202, JSON.stringify(r.data));
    const session = await until(async () => (await call('/state', { token })).data.sessions.find(s => s.status === 'active' && s.stationId === st.id), 'the start');
    assert.deepEqual(session.goal, { kind: 'km', value: 20, stopKwh: 3.6 });

    await net('/sessions/G-1', 'POST', { event: 'meter', kwh: 3.2 });
    await until(async () => (await call('/notifications', { token })).data.find(e => e.type === 'session.progress' && e.entity === session.id), 'the "nearly done" notice');
    assert.equal(commands.filter(c => c.type === 'stop').length, 0, 'stopped too early');

    await net('/sessions/G-1', 'POST', { event: 'meter', kwh: 3.7 });
    await until(() => commands.some(c => c.type === 'stop'), 'the automatic stop');
    const done = await until(async () => {
      const s = (await call('/state', { token })).data.sessions.find(x => x.id === session.id);
      return s.status === 'completed' ? s : null;
    }, 'the settled charge');
    assert.equal(done.energy, 3.7);
    const notice = (await call('/notifications', { token })).data.find(e => e.type === 'session.goal' && e.entity === session.id);
    assert.match(notice.message, /на 20 км.*Освободите место/);
  });

  test('a scheduled start runs at its time; it can be cancelled before', async () => {
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(s => !s.id.startsWith('st-00') && s.operatorId !== 'op-004' && s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const soon = new Date(Date.now() + 2 * 3600_000).toISOString();
    assert.equal((await call('/sessions/schedule', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, at: new Date(Date.now() - 1000).toISOString() } })).status, 400);
    assert.equal((await call('/sessions/schedule', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, at: soon, payer: 'credit' } })).status, 400);

    const later = (await call('/sessions/schedule', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, at: soon } })).data;
    assert.equal((await call('/state', { token })).data.scheduled.length, 1);
    assert.equal((await call(`/sessions/schedule/${later.id}`, { method: 'DELETE', token })).status, 200);
    assert.equal((await call('/state', { token })).data.scheduled.length, 0);

    const at = new Date(Date.now() + 400).toISOString();
    const r = await call('/sessions/schedule', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, at, goal: { kind: 'sum', value: 20000 } } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const session = await until(async () => (await call('/state', { token })).data.sessions.find(s => s.status === 'active' && s.stationId === st.id), 'the scheduled start');
    assert.equal(session.goal.stopCost, 20000);
    assert.ok((await call('/notifications', { token })).data.some(e => e.type === 'schedule.started'));
    await call(`/sessions/${session.id}/stop`, { method: 'POST', token });
  });
});

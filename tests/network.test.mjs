/**
 * Networks without OCPI: the Network API (they push stations, statuses and
 * charges; we post signed start/stop commands to their webhook), and networks
 * that are on the map only.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import express from 'express';

const PORT = 8500 + Math.floor(Math.random() * 300);
const HOOK_PORT = PORT + 400;
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let hookServer;
let dataDir;
let key;
let secret;
const commands = [];

async function call(path, { method = 'GET', token, body, bearer } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const admin = () => login('admin', 'admin@powergo.uz', 'Admin2026');
const driver = () => login('driver', '+998901234567', 'Driver2026');
const net = (path, method = 'GET', body) => call(`/network/v1${path}`, { method, body, bearer: key });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) {
    const v = await fn();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}

before(async () => {
  // The network's own back office: takes our commands, reports its charges back.
  const app = express();
  app.use(express.text({ type: '*/*' }));
  app.post('/hook', (req, res) => {
    const [t, v1] = String(req.get('x-powergo-signature')).match(/^t=(\d+),v1=([a-f0-9]+)$/).slice(1);
    const ok = crypto.createHmac('sha256', secret).update(`${t}.${req.body}`).digest('hex') === v1;
    const cmd = JSON.parse(req.body);
    commands.push({ ...cmd, signed: ok });
    res.json({ accepted: ok });
    setTimeout(async () => {
      if (cmd.type === 'start') await net('/sessions/N-1', 'POST', { event: 'started', driverId: cmd.driver.id, station: cmd.station, connector: cmd.connector });
      if (cmd.type === 'stop') await net(`/sessions/${cmd.session}`, 'POST', { event: 'stopped', kwh: 7.5, cost: 13500 });
    }, 20);
  });
  await new Promise(r => (hookServer = app.listen(HOOK_PORT, r)));

  dataDir = mkdtempSync(join(tmpdir(), 'oc-net-'));
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
    await sleep(100);
  }
  throw new Error('server did not start');
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

describe('Network API and map-only networks', () => {
  test('the admin connects a network through the Network API; the key is shown once', async () => {
    const adm = await admin();
    assert.equal((await call('/admin/operators/op-004/integration', { method: 'PUT', token: adm, body: { type: 'FTP' } })).status, 400);
    assert.equal((await call('/admin/operators/op-004/integration', { method: 'PUT', token: adm, body: { type: 'Network API', webhookUrl: 'nope' } })).status, 400);
    assert.equal((await call('/admin/operators/op-004/integration', { method: 'PUT', token: adm, body: { type: 'OCPI 2.2.1' } })).status, 400);
    const r = await call('/admin/operators/op-004/integration', { method: 'PUT', token: adm, body: { type: 'Network API', webhookUrl: `http://127.0.0.1:${HOOK_PORT}/hook` } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.key, /^znk_[a-f0-9]{48}$/);
    key = r.data.key;
    secret = r.data.secret;
    const again = (await call('/admin/operators/op-004/integration', { token: adm })).data;
    assert.equal(again.type, 'Network API');
    assert.ok(!JSON.stringify(again).includes(key) && !JSON.stringify(again).includes(secret), 'the key is shown again');
    assert.equal(again.networkApi.keyPrefix, key.slice(0, 8));
  });

  test('the network pushes stations and statuses', async () => {
    assert.equal((await call('/network/v1/stations', { bearer: 'znk_' + '0'.repeat(48) })).status, 401);
    assert.equal((await net('/stations/S1', 'PUT', { name: 'Nukus Center', lat: 10, lng: 10, connectors: [] })).status, 400);
    const body = { name: 'Nukus Center', address: 'Karakalpakstan ko‘chasi, 5', city: 'Nukus', lat: 42.46, lng: 59.6, connectors: [{ ref: 'A', type: 'CCS2', power: 60, price: 1800, status: 'available' }, { ref: 'B', type: 'Type2', power: 22, price: 1300, status: 'occupied' }] };
    const created = await net('/stations/S1', 'PUT', body);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.connectors.length, 2);
    assert.equal((await net('/stations/S1', 'PUT', { ...body, name: 'Nukus Center Mall' })).status, 200, 'an update made a second station');
    assert.equal((await net('/stations/S1/connectors/B', 'PATCH', { status: 'broken' })).status, 400);
    assert.equal((await net('/stations/S1/connectors/B', 'PATCH', { status: 'available' })).data.status, 'available');
    const list = (await net('/stations')).data;
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Nukus Center Mall');
    const st = (await call('/state', { token: await driver() })).data.stations.find(s => s.id === list[0].id);
    assert.deepEqual(st.connectors.map(c => c.status), ['available', 'available']);
  });

  test('a driver charges through the network’s own system with signed commands', async () => {
    const token = await driver();
    const st = (await net('/stations')).data[0];
    const walletBefore = Object.values((await call('/state', { token })).data.wallets)[0].balance;
    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: st.connectors[0].id } });
    assert.equal(started.status, 202, JSON.stringify(started.data));
    assert.equal(commands[0].type, 'start');
    assert.equal(commands[0].signed, true, 'the command signature did not verify');
    assert.equal(commands[0].station, 'S1');
    assert.equal(commands[0].connector, 'A');
    const session = await until(async () => (await call('/state', { token })).data.sessions.find(s => s.status === 'active' && s.stationId === st.id), 'the network to report the charge');
    assert.equal(session.source, 'network');
    assert.equal((await net('/sessions/N-1', 'POST', { event: 'meter', kwh: 3.2 })).data.energy, 3.2);

    assert.equal((await call(`/sessions/${session.id}/stop`, { method: 'POST', token })).status, 202);
    const done = await until(async () => {
      const s = (await call('/state', { token })).data.sessions.find(x => x.id === session.id);
      return s.status === 'completed' ? s : null;
    }, 'the charge to settle');
    assert.equal(commands[1].type, 'stop');
    assert.equal(commands[1].session, 'N-1');
    assert.equal(done.energy, 7.5);
    assert.equal(done.cost, 13500, 'not the network’s price');
    // PowerGo's bonus pays first; the wallet covers the rest.
    assert.equal(Object.values((await call('/state', { token })).data.wallets)[0].balance, walletBefore - (13500 - (done.bonusUsed ?? 0)));
  });

  test('a new key retires the old one at once', async () => {
    const old = key;
    const r = await call('/admin/operators/op-004/integration/rotate', { method: 'POST', token: await admin() });
    assert.equal(r.status, 200);
    key = r.data.key;
    secret = r.data.secret;
    assert.equal((await call('/network/v1/stations', { bearer: old })).status, 401);
    assert.equal((await net('/stations')).status, 200);
  });

  test('a network on the map only: its stations are shown, charging is in its own app', async () => {
    const adm = await admin();
    assert.equal((await call('/admin/operators/op-003/integration', { method: 'PUT', token: adm, body: { type: 'Только карта' } })).status, 200);
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(s => s.operatorId === 'op-003' && s.connectors.some(c => c.status === 'available'));
    const r = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: st.connectors.find(c => c.status === 'available').id } });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /в её приложении/);
    assert.equal((await call('/state', { token })).data.operators.find(o => o.id === 'op-003').integration, 'Только карта');
  });
});

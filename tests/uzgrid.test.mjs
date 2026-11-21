/**
 * UZGRID Vendor API v1: a mock of the hub stands in for api-sandbox.uzgrid.uz.
 * Its stations appear on the map with UZGRID's prices, a driver's charge
 * starts and stops by command, and the CDR's total (in tiyin) settles the bill.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

const PORT = 8300 + Math.floor(Math.random() * 300);
const HUB_PORT = PORT + 400;
const BASE = `http://127.0.0.1:${PORT}/api`;
const KEY = 'uzk_live_testtesttest_secret';
let server;
let hubServer;
let dataDir;

// ---------------------------------------------------------------------------
// The mock hub
// ---------------------------------------------------------------------------

const hub = {
  seq: 100,
  events: [],
  tokens: new Map(),
  sessions: new Map(),
  keys: new Set(),
  calls: [],
  connectors: { 'E1:C1': 'AVAILABLE', 'E2:C1': 'AVAILABLE' },
  push(type, data, at = {}) {
    hub.events.push({ seq: ++hub.seq, id: `evt_${hub.seq}`, type, occurred_at: new Date().toISOString(), received_at: new Date().toISOString(), ...at, data });
  },
};
const STATION = 'b1d0c1e3-0000-4000-8000-000000000001';
const at = (evse = 'E1') => ({ station_id: STATION, evse_uid: evse, connector_id: 'C1' });

function hubApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    hub.calls.push(`${req.method} ${req.path}`);
    if (req.headers.authorization !== `Bearer ${KEY}`) return res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in again to continue' } });
    if (req.method === 'POST') {
      const k = req.headers['idempotency-key'];
      if (!k) return res.status(400).json({ error: { code: 'idempotency_key_required', message: 'Idempotency-Key required' } });
      hub.keys.add(k);
    }
    next();
  });
  const r = express.Router();
  // Every answer carries X-Request-Id, as UZGRID's do.
  let requests = 0;
  r.use((_req, res, next) => { res.set('X-Request-Id', `req-${++requests}`); next(); });
  r.get('/stations', (_req, res) =>
    res.json({
      stations: [
        {
          station_id: STATION,
          name: 'Pulse Sandbox',
          own: false,
          location: { lat: '41.311081', lon: '69.240562', address: 'Ташкент, Амира Темура, 1' },
          connectors: [
            { evse_uid: 'E1', evse_id: 'UZ*GRD*E1', connector_id: 'C1', standard: 'IEC_62196_T2', max_power_w: 11000, status: hub.connectors['E1:C1'], tariff_id: '214' },
            { evse_uid: 'E2', evse_id: 'UZ*GRD*E2', connector_id: 'C1', standard: 'IEC_62196_T2_COMBO', max_power_w: 60000, status: hub.connectors['E2:C1'], tariff_id: null },
          ],
        },
      ],
      next_cursor: null,
    }),
  );
  r.get('/tariffs/:id', (req, res) => res.json({ tariff_id: req.params.id, kind: 'yours', currency: 'UZS', price_per_kwh: '2200', price_version: 3 }));
  r.get('/events', (req, res) => {
    const after = Number(req.query.after ?? 0);
    const limit = Number(req.query.limit ?? 100);
    const page = hub.events.filter(e => e.seq > after).slice(0, limit);
    res.json({ events: page, next_after: page.at(-1)?.seq ?? Math.max(after, hub.seq), has_more: false, head_seq: hub.seq });
  });
  r.put('/tokens/:uid', (req, res) => {
    hub.tokens.set(req.params.uid, req.body);
    res.json({ token_uid: req.params.uid, ...req.body });
  });
  r.post('/commands/start-session', (req, res) => {
    const { station_id, evse_uid, connector_id, token_uid } = req.body;
    if (station_id !== STATION) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
    if (evse_uid === 'E2' || hub.noPrice) return res.status(409).json({ error: { code: 'no_price', message: 'No price of yours is in force on this station', request_id: 'req-no-price' } });
    const command_id = `cmd-${hub.seq}`;
    const session_id = `ses-${hub.seq}`;
    res.status(202).json({ command_id, type: 'start_session', status: 'pending', detail: null, session_id: null });
    setTimeout(() => {
      hub.push('command.result', { command_id, status: 'accepted', detail: null, session_id: null });
      hub.connectors[`${evse_uid}:${connector_id}`] = 'CHARGING';
      hub.push('connector.status', { status: 'CHARGING', previous_status: 'AVAILABLE' }, at(evse_uid));
      hub.push('transaction.started', { session_id, started_at: new Date().toISOString(), token_uid, source: 'vendor-api', command_id, tariff_id: '214', price_version: 3 }, at(evse_uid));
      hub.sessions.set(session_id, { evse_uid });
      hub.push('transaction.metered', { session_id, energy_wh: 2500, power_w: 11000 }, at(evse_uid));
    }, 50);
  });
  r.post('/commands/stop-session', (req, res) => {
    const s = hub.sessions.get(req.body.session_id);
    if (!s) return res.status(404).json({ error: { code: 'not_found', message: 'Session not found' } });
    const command_id = `cmd-stop-${hub.seq}`;
    res.status(202).json({ command_id, type: 'stop_session', status: 'pending' });
    setTimeout(() => {
      hub.push('command.result', { command_id, status: 'accepted' });
      hub.push('transaction.stopped', { session_id: req.body.session_id, stopped_at: new Date().toISOString(), energy_kwh: '12.5', duration_s: 2700, stop_reason: 'REMOTE' }, at(s.evse_uid));
      hub.connectors[`${s.evse_uid}:C1`] = 'AVAILABLE';
      hub.push('connector.status', { status: 'AVAILABLE', previous_status: 'CHARGING' }, at(s.evse_uid));
      hub.push('cdr.created', { cdr_id: `cdr-${req.body.session_id}`, session_id: req.body.session_id, pricing: 'priced' });
    }, 50);
  });
  r.get('/cdrs/:id', (req, res) =>
    res.json({ pricing: 'priced', cdr_id: req.params.id, session_id: req.params.id.slice(4), currency: 'UZS', total_cost: 2915000, energy_cost: 2750000, idle_cost: 165000, energy_kwh: '12.5', idle_minutes: 6, duration_s: 2700, tariff_id: '214', price_version: 3 }),
  );
  app.use('/api/v1', r);
  return app;
}

// ---------------------------------------------------------------------------

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
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    const v = await fn();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}
const hubStation = async token => (await call('/state', { token })).data.stations.find(s => s.operator === 'UZGRID');

before(async () => {
  await new Promise(r => (hubServer = hubApp().listen(HUB_PORT, r)));
  dataDir = mkdtempSync(join(tmpdir(), 'oc-uzgrid-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', PUBLIC_URL: '', UZGRID_API_KEY: KEY, UZGRID_API_URL: `http://127.0.0.1:${HUB_PORT}/api/v1`, UZGRID_POLL_MS: '150' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 300; i++) {
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
  hubServer?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('UZGRID hub (Vendor API)', () => {
  test('its stations appear with UZGRID prices; a connector without our price is never offered', async () => {
    const token = await driver();
    const st = await until(() => hubStation(token), 'the UZGRID stations');
    assert.equal(st.name, 'Pulse Sandbox');
    assert.deepEqual(st.connectors.map(c => [c.type, c.power, c.price, c.status]), [['Type2', 11, 2200, 'available'], ['CCS2', 60, 2000, 'unavailable']]);
    const status = (await call('/admin/uzgrid', { token: await admin() })).data;
    assert.equal(status.enabled, true);
    assert.equal(status.stations, 1);
    assert.equal(status.error, null);
    assert.ok(!JSON.stringify(status).includes(KEY), 'the key leaked to the admin');
    assert.equal((await call('/admin/uzgrid', { token })).status, 403);
  });

  test('a driver charges through UZGRID: start, meter, stop, the CDR settles the bill', async () => {
    const token = await driver();
    const st = await hubStation(token);
    const c = st.connectors[0];
    const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(started.status, 202, JSON.stringify(started.data));
    assert.ok([...hub.tokens.keys()].some(k => k.startsWith('VOLI-')), 'the driver token was registered');
    const session = await until(async () => (await call('/state', { token })).data.sessions.find(s => s.status === 'active' && s.stationId === st.id), 'transaction.started');
    assert.equal(session.source, 'uzgrid');
    assert.equal(session.price, 2200);
    await until(async () => ((await call('/state', { token })).data.sessions.find(s => s.id === session.id).energy ?? 0) > 0, 'metered energy');

    const stop = await call(`/sessions/${session.id}/stop`, { method: 'POST', token });
    assert.equal(stop.status, 202, JSON.stringify(stop.data));
    const done = await until(async () => {
      const s = (await call('/state', { token })).data.sessions.find(x => x.id === session.id);
      return s.status === 'completed' ? s : null;
    }, 'the CDR to settle the session');
    assert.equal(done.energy, 12.5);
    assert.equal(done.cost, 29150, 'the CDR total in tiyin, as sum');
    assert.equal((await hubStation(token)).connectors[0].status, 'available');
    assert.ok(hub.keys.size >= 2, 'every command carried an Idempotency-Key');
    // The admin card shows how the last start went, with the ids UZGRID support asks for.
    const last = (await call('/admin/uzgrid', { token: await admin() })).data.lastStart;
    assert.equal(last.result, 'started');
    assert.match(last.commandId, /^cmd-/);
    assert.match(last.requestId, /^req-\d+$/);
  });

  test('a status UZGRID reports shows on the map', async () => {
    hub.push('connector.status', { status: 'OUTOFORDER', previous_status: 'AVAILABLE' }, at('E1'));
    const token = await driver();
    await until(async () => (await hubStation(token)).connectors[0].status === 'unavailable', 'the reported status');
    hub.push('connector.status', { status: 'AVAILABLE', previous_status: 'OUTOFORDER' }, at('E1'));
    await until(async () => (await hubStation(token)).connectors[0].status === 'available', 'the status back');
  });

  test('a connector without our price is refused before UZGRID is asked', async () => {
    const token = await driver();
    const st = await hubStation(token);
    const before = hub.calls.filter(x => x.includes('start-session')).length;
    assert.equal((await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: st.connectors[1].id } })).status, 409);
    assert.equal(hub.calls.filter(x => x.includes('start-session')).length, before);
  });

  test('a "no price" refusal tells the driver why and hides the connector until the next station list', async () => {
    const token = await driver();
    const st = await hubStation(token);
    hub.noPrice = true;
    const r = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: st.connectors[0].id } });
    hub.noPrice = false;
    assert.equal(r.status, 409);
    assert.match(r.data.error, /нет цены/);
    const last = (await call('/admin/uzgrid', { token: await admin() })).data.lastStart;
    assert.deepEqual([last.result, last.code, last.requestId], ['refused', 'no_price', 'req-no-price']);
    assert.equal((await hubStation(token)).connectors[0].status, 'unavailable');
    assert.equal((await call('/admin/uzgrid/sync', { method: 'POST', token: await admin() })).status, 200);
    assert.equal((await hubStation(token)).connectors[0].status, 'available');
  });
});

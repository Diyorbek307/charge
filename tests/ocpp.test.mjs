/**
 * OCPP 1.6-J central system tests.
 *
 * Boots the real server and drives it with a scripted charge point over a real
 * WebSocket, so the protocol framing, auth and session rules are all exercised
 * end to end.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
const WS_BASE = `ws://127.0.0.1:${PORT}`;
const OCPP_PASSWORD = 'test-ocpp-key';
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

const CREDS = {
  driver: { login: '+998901234567', password: 'Driver2026' },
  admin: { login: 'admin@voli.uz', password: 'Admin2026' },
  operator: { login: 'operator@greencharge.uz', password: 'Operator2026' },
};
const login = async portal => (await call('/auth/login', { method: 'POST', body: { portal, ...CREDS[portal] } })).data.token;
const reset = async () => assert.equal((await call('/admin/reset', { method: 'POST', token: await login('admin') })).status, 200);

async function waitFor(fn, what, ms = 4000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** A scripted OCPP 1.6-J charge point. */
class ChargePoint {
  constructor(ws) {
    this.ws = ws;
    this.pending = new Map();
    this.received = [];
    this.handlers = {};
    ws.on('message', raw => {
      const frame = JSON.parse(raw.toString());
      const [type, uid] = frame;
      if (type === 2) {
        const [, , action, payload] = frame;
        this.received.push({ action, payload });
        const reply = this.handlers[action]?.(payload) ?? {};
        ws.send(JSON.stringify([3, uid, reply]));
      } else {
        const p = this.pending.get(uid);
        if (!p) return;
        this.pending.delete(uid);
        type === 3 ? p.resolve(frame[2]) : p.reject(Object.assign(new Error(frame[3]), { code: frame[2] }));
      }
    });
  }

  static connect(stationId, { password = OCPP_PASSWORD, protocols = ['ocpp1.6'] } = {}) {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${stationId}:${password}`).toString('base64');
      const ws = new WebSocket(`${WS_BASE}/ocpp/${stationId}`, protocols, { headers: { Authorization: `Basic ${auth}` } });
      ws.once('open', () => resolve(new ChargePoint(ws)));
      ws.once('unexpected-response', (_req, res) => reject(Object.assign(new Error('refused'), { status: res.statusCode })));
      ws.once('error', reject);
    });
  }

  call(action, payload) {
    const uid = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(uid, { resolve, reject });
      this.ws.send(JSON.stringify([2, uid, action, payload]));
    });
  }

  meter(transactionId, wh, connectorId = 1) {
    return this.call('MeterValues', {
      connectorId,
      transactionId,
      meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: String(wh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }] }],
    });
  }

  close() {
    return new Promise(resolve => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-ocpp-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, DEMO_SIMULATION: 'false', PORT: String(PORT), DATA_DIR: dataDir, OCPP_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitFor(async () => {
    try {
      return (await fetch(`${BASE}/state`)).ok;
    } catch {
      return false;
    }
  }, 'server', 15000);
});

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold files briefly */
  }
});

describe('OCPP connection', () => {
  test('wrong password and unknown stations are refused', async () => {
    await assert.rejects(ChargePoint.connect('st-003', { password: 'wrong' }), e => e.status === 401);
    await assert.rejects(ChargePoint.connect('st-999'), e => e.status === 404);
  });

  test('a connection without the ocpp1.6 subprotocol is closed', async () => {
    const closed = await new Promise(resolve => {
      const auth = Buffer.from(`st-003:${OCPP_PASSWORD}`).toString('base64');
      const ws = new WebSocket(`${WS_BASE}/ocpp/st-003`, { headers: { Authorization: `Basic ${auth}` } });
      ws.once('close', code => resolve(code));
      ws.once('error', () => resolve('error'));
    });
    assert.ok(closed === 1002 || closed === 'error', `expected refusal, got ${closed}`);
  });

  test('boot marks the station online; disconnect marks it offline', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-003');
    const boot = await cp.call('BootNotification', { chargePointVendor: 'Test', chargePointModel: 'T1' });
    assert.equal(boot.status, 'Accepted');
    assert.ok(boot.interval > 0);

    let station = (await call('/state')).data.stations.find(s => s.id === 'st-003');
    assert.equal(station.ocpp.online, true);
    assert.equal(station.ocpp.vendor, 'Test');

    const admin = await login('admin');
    const cps = (await call('/ocpp/chargepoints', { token: admin })).data;
    assert.ok(cps.some(c => c.stationId === 'st-003'));
    // An operator of another network does not see this charge point.
    assert.ok(!(await call('/ocpp/chargepoints', { token: await login('operator') })).data.some(c => c.stationId === 'st-003'));

    await cp.close();
    station = await waitFor(async () => {
      const s = (await call('/state')).data.stations.find(x => x.id === 'st-003');
      return s.ocpp.online === false && s;
    }, 'offline');
    assert.equal(station.ocpp.online, false);
  });

  test('unknown actions get a NotImplemented error', async () => {
    const cp = await ChargePoint.connect('st-003');
    await assert.rejects(cp.call('DataTransfer', { vendorId: 'x' }), e => e.code === 'NotImplemented');
    await cp.close();
  });
});

describe('OCPP transactions', () => {
  test('local start → meter → stop bills the metered energy', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-003');
    await cp.call('BootNotification', { chargePointVendor: 'Test', chargePointModel: 'T1' });

    assert.equal((await cp.call('Authorize', { idTag: 'acc-driver' })).idTagInfo.status, 'Accepted');
    assert.equal((await cp.call('Authorize', { idTag: 'nobody' })).idTagInfo.status, 'Invalid');

    const start = await cp.call('StartTransaction', { connectorId: 1, idTag: 'acc-driver', meterStart: 1000, timestamp: new Date().toISOString() });
    assert.equal(start.idTagInfo.status, 'Accepted');
    assert.ok(Number.isInteger(start.transactionId));
    await cp.call('StatusNotification', { connectorId: 1, errorCode: 'NoError', status: 'Charging' });

    const driver = await login('driver');
    await cp.meter(start.transactionId, 12000);
    const running = await waitFor(async () => {
      const s = (await call('/state', { token: driver })).data.sessions.find(x => x.status === 'active');
      return s?.energy === 11 && s;
    }, 'metered energy');
    assert.equal(running.source, 'ocpp');
    assert.equal(running.connectorId, 'c8');

    await cp.call('StopTransaction', { transactionId: start.transactionId, meterStop: 21000, timestamp: new Date().toISOString() });
    const d = (await call('/state', { token: driver })).data;
    const done = d.sessions.find(s => s.id === running.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.energy, 20);
    const tx = d.transactions.find(t => t.sessionId === running.id);
    assert.equal(tx.amount, Math.round(20 * running.price));
    assert.equal(d.stations.find(s => s.id === 'st-003').connectors[0].status, 'available');
    await cp.close();
  });

  test('the app starts and stops a charge through the charge point', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-003');
    await cp.call('BootNotification', { chargePointVendor: 'Test', chargePointModel: 'T1' });
    let tx;
    cp.handlers.RemoteStartTransaction = p => {
      setImmediate(async () => {
        const r = await cp.call('StartTransaction', { connectorId: p.connectorId, idTag: p.idTag, meterStart: 0, timestamp: new Date().toISOString() });
        tx = r.transactionId;
      });
      return { status: 'Accepted' };
    };
    cp.handlers.RemoteStopTransaction = p => {
      setImmediate(() => cp.call('StopTransaction', { transactionId: p.transactionId, meterStop: 5000, timestamp: new Date().toISOString() }));
      return { status: 'Accepted' };
    };

    const driver = await login('driver');
    const start = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-003', connectorId: 'c9' } });
    assert.equal(start.status, 202, 'app should hand the start to the charge point');
    const remote = cp.received.find(r => r.action === 'RemoteStartTransaction');
    assert.deepEqual(remote.payload, { connectorId: 2, idTag: 'acc-driver' });

    const session = await waitFor(async () => (await call('/state', { token: driver })).data.sessions.find(s => s.status === 'active'), 'session from StartTransaction');
    assert.equal(session.ocppTransactionId, tx);

    const stop = await call(`/sessions/${session.id}/stop`, { method: 'POST', token: driver });
    assert.equal(stop.status, 202);
    const done = await waitFor(async () => {
      const s = (await call('/state', { token: driver })).data.sessions.find(x => x.id === session.id);
      return s.status === 'completed' && s;
    }, 'completion from StopTransaction');
    assert.equal(done.energy, 5);
    await cp.close();
  });

  test('a refused remote start is reported to the app', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-003');
    cp.handlers.RemoteStartTransaction = () => ({ status: 'Rejected' });
    const r = await call('/sessions/start', { method: 'POST', token: await login('driver'), body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(r.status, 502);
    await cp.close();
  });

  test('business rules still apply to a start from the charge point', async () => {
    await reset();
    const admin = await login('admin');
    assert.equal((await call('/wallets/acc-driver/balance', { method: 'POST', token: admin, body: { balance: 0 } })).status, 200);
    const cp = await ChargePoint.connect('st-003');
    const blocked = await cp.call('StartTransaction', { connectorId: 1, idTag: 'acc-driver', meterStart: 0, timestamp: new Date().toISOString() });
    assert.equal(blocked.idTagInfo.status, 'Blocked', 'empty wallet charged over OCPP');
    const invalid = await cp.call('StartTransaction', { connectorId: 1, idTag: 'stranger', meterStart: 0, timestamp: new Date().toISOString() });
    assert.equal(invalid.idTagInfo.status, 'Invalid');
    assert.equal((await call('/state', { token: admin })).data.sessions.filter(s => s.status === 'active' && s.stationId === 'st-003').length, 0);
    await cp.close();
  });

  test('a fault raises a critical alert for the owning network only', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-003'); // SilkRoad EV, op-003
    await cp.call('StatusNotification', { connectorId: 1, errorCode: 'GroundFailure', status: 'Faulted', info: 'RCD tripped' });

    const admin = await login('admin');
    const d = (await call('/state', { token: admin })).data;
    const alert = d.alerts.find(a => a.code === 'OCPP_GroundFailure');
    assert.ok(alert);
    assert.equal(alert.severity, 'critical');
    assert.equal(alert.operatorId, 'op-003');
    assert.equal(d.stations.find(s => s.id === 'st-003').connectors[0].status, 'unavailable');

    // A repeat of the same fault does not flood the operator.
    await cp.call('StatusNotification', { connectorId: 1, errorCode: 'GroundFailure', status: 'Faulted' });
    assert.equal((await call('/state', { token: admin })).data.alerts.filter(a => a.code === 'OCPP_GroundFailure').length, 1);

    // GreenCharge (op-001) must not see SilkRoad's fault.
    assert.ok(!(await call('/state', { token: await login('operator') })).data.alerts.some(a => a.code === 'OCPP_GroundFailure'));
    await cp.close();
  });

  test('every meter tick reaches live subscribers with a distinct id', async () => {
    await reset();
    const driver = await login('driver');
    const cp = await ChargePoint.connect('st-003');
    const start = await cp.call('StartTransaction', { connectorId: 1, idTag: 'acc-driver', meterStart: 0, timestamp: new Date().toISOString() });

    const ticket = (await call('/stream/ticket', { method: 'POST', token: driver })).data.ticket;
    const ctrl = new AbortController();
    const res = await fetch(`${BASE}/stream?ticket=${ticket}`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    const ticks = [];
    (async () => {
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          for (const line of buf.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const e = JSON.parse(line.slice(6));
              if (e.type === 'session.tick' && !ticks.some(t => t.id === e.id && t.energy === e.payload.energy)) {
                ticks.push({ id: e.id, energy: e.payload.energy });
              }
            } catch {
              /* partial frame */
            }
          }
          buf = buf.slice(buf.lastIndexOf('\n') + 1);
        }
      } catch {
        /* aborted */
      }
    })();
    await new Promise(r => setTimeout(r, 200));

    await cp.meter(start.transactionId, 3000);
    await new Promise(r => setTimeout(r, 30));
    await cp.meter(start.transactionId, 6000);
    await waitFor(() => ticks.length >= 2, 'two ticks');
    assert.notEqual(ticks[0].id, ticks[1].id, 'repeated tick ids get de-duplicated away by the client');
    ctrl.abort();

    await cp.call('StopTransaction', { transactionId: start.transactionId, meterStop: 6000, timestamp: new Date().toISOString() });
    await cp.close();
  });
});

describe('OCPP maintenance', () => {
  test('an operator resets and triggers its own charge point; replies are logged', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-001'); // GreenCharge UZ, op-001
    cp.handlers.Reset = p => ({ status: p.type === 'Soft' ? 'Accepted' : 'Rejected' });
    cp.handlers.TriggerMessage = () => ({ status: 'Accepted' });
    const operator = await login('operator');

    const soft = await call('/ocpp/chargepoints/st-001/command', { method: 'POST', token: operator, body: { action: 'Reset', type: 'Soft' } });
    assert.equal(soft.status, 200);
    assert.equal(soft.data.status, 'Accepted');
    const trig = await call('/ocpp/chargepoints/st-001/command', { method: 'POST', token: operator, body: { action: 'TriggerMessage', requestedMessage: 'StatusNotification' } });
    assert.equal(trig.data.status, 'Accepted');

    const log = (await call('/ocpp/log', { token: operator })).data;
    assert.ok(log.some(e => e.action === 'Reset' && e.dir === 'out'));
    assert.ok(log.some(e => e.action === 'Reset' && e.dir === 'in' && e.detail === 'Accepted'));
    assert.ok(log.every(e => e.stationId === 'st-001'), 'log leaks other networks');
    await cp.close();
  });

  test('commands are refused for another network, an offline station or an unknown action', async () => {
    await reset();
    const cp = await ChargePoint.connect('st-003'); // SilkRoad EV
    const operator = await login('operator');
    assert.equal((await call('/ocpp/chargepoints/st-003/command', { method: 'POST', token: operator, body: { action: 'Reset' } })).status, 403);
    assert.equal((await call('/ocpp/chargepoints/st-005/command', { method: 'POST', token: operator, body: { action: 'Reset' } })).status, 409);
    const admin = await login('admin');
    assert.equal((await call('/ocpp/chargepoints/st-003/command', { method: 'POST', token: admin, body: { action: 'FirmwareFlash' } })).status, 400);
    await cp.close();
  });
});

describe('Autocharge', () => {
  test('a car is linked once at a charger, then plugging in starts a charge by itself', async () => {
    await reset();
    const token = await login('driver');
    // Only a charger on OCPP can see the car: one that has never connected is refused.
    assert.equal((await call('/autocharge/link', { method: 'POST', token, body: { stationId: 'st-005' } })).status, 409);
    assert.equal((await call('/autocharge/link', { method: 'POST', token, body: { stationId: 'st-999' } })).status, 404);
    const st = { id: 'st-003' };
    const cp = await ChargePoint.connect(st.id);
    await cp.call('BootNotification', { chargePointVendor: 'Test', chargePointModel: 'DC' });
    const opened = await call('/autocharge/link', { method: 'POST', token, body: { stationId: st.id } });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.equal(opened.data.linking.stationId, st.id);
    // An unknown car elsewhere is refused; the car plugged in during the window is taken.
    const car = 'VID:0A1B2C3D4E5F';
    assert.equal((await cp.call('Authorize', { idTag: car })).idTagInfo.status, 'Accepted');
    const linked = (await call('/state', { token })).data.autocharge;
    assert.equal(linked.cars.length, 1);
    assert.equal(linked.linking, null);
    assert.equal((await cp.call('Authorize', { idTag: 'VID:FFFFFFFFFFFF' })).idTagInfo.status, 'Invalid');

    // Next time: the same car, a different spelling of its ID, starts the charge itself.
    const r = await cp.call('StartTransaction', { connectorId: 1, idTag: '0a:1b:2c:3d:4e:5f', meterStart: 1000, timestamp: new Date().toISOString() });
    assert.equal(r.idTagInfo.status, 'Accepted');
    const ses = await waitFor(async () => (await call('/state', { token })).data.sessions.find(s => s.status === 'active' && s.autocharge), 'the autocharge session');
    assert.equal(ses.stationId, st.id);
    await cp.call('StopTransaction', { transactionId: r.transactionId, meterStop: 9000, timestamp: new Date().toISOString() });

    // Switched off, the car is a stranger again.
    await call('/autocharge', { method: 'DELETE', token });
    assert.equal((await cp.call('Authorize', { idTag: car })).idTagInfo.status, 'Invalid');
    await cp.close();
  });
});

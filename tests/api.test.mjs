/**
 * End-to-end API tests.
 *
 * Each run boots the real server as a child process against a throwaway data
 * directory, so tests exercise the same code path Render runs and never touch
 * the developer's local database. Uses only node:test and global fetch — no
 * test dependencies to install or break the deploy with.
 *
 * Run: npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { totp } from '../server/totp.js';

const PORT = 4100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

const CREDS = {
  driver: { login: '+998901234567', password: 'Driver2026' },
  operator: { login: 'operator@greencharge.uz', password: 'Operator2026' },
  admin: { login: 'admin@onecharge.uz', password: 'Admin2026' },
  business: { login: 'fleet@uzauto.uz', password: 'Business2026' },
  api: { login: 'partner@onecharge.uz', password: 'Partner2026' },
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function login(portal) {
  const { status, data } = await call('/auth/login', { method: 'POST', body: { portal, ...CREDS[portal] } });
  assert.equal(status, 200, `login ${portal} failed: ${JSON.stringify(data)}`);
  return data.token;
}

const reset = async () => {
  const token = await login('admin');
  const { status } = await call('/admin/reset', { method: 'POST', token });
  assert.equal(status, 200);
};

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-test-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for the server to accept requests.
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/state`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment */
  }
});

// ---------------------------------------------------------------------------

describe('authentication', () => {
  test('every portal signs in with its own password', async () => {
    for (const portal of Object.keys(CREDS)) {
      const token = await login(portal);
      assert.match(token, /^[a-f0-9]{48}$/);
    }
  });

  test('wrong password is rejected', async () => {
    const { status } = await call('/auth/login', {
      method: 'POST',
      body: { portal: 'admin', login: CREDS.admin.login, password: 'nope' },
    });
    assert.equal(status, 401);
  });

  test("one portal's credentials do not open another portal", async () => {
    const { status } = await call('/auth/login', {
      method: 'POST',
      body: { portal: 'operator', ...CREDS.admin },
    });
    assert.equal(status, 401);
  });

  test('secrets never leave the server', async () => {
    const { data } = await call('/auth/login', { method: 'POST', body: { portal: 'driver', ...CREDS.driver } });
    for (const field of ['hash', 'salt', 'otp']) assert.equal(data.user[field], undefined, field);
  });

  test('logout revokes the token', async () => {
    const token = await login('business');
    assert.equal((await call('/auth/me', { token })).status, 200);
    await call('/auth/logout', { method: 'POST', token });
    assert.equal((await call('/auth/me', { token })).status, 401);
  });

  test('a driver token cannot use admin endpoints', async () => {
    const token = await login('driver');
    const { status } = await call('/operators/op-002/status', {
      method: 'POST',
      token,
      body: { status: 'suspended' },
    });
    assert.equal(status, 403);
  });
});

describe('two-factor authentication', () => {
  test('full enrol → challenged login → disable cycle', async () => {
    const token = await login('api');
    const setup = await call('/auth/2fa/setup', { method: 'POST', token });
    assert.equal(setup.status, 200);
    const { secret } = setup.data;

    // A wrong code must not enable it.
    assert.equal((await call('/auth/2fa/enable', { method: 'POST', token, body: { code: '000000' } })).status, 401);
    assert.equal(
      (await call('/auth/2fa/enable', { method: 'POST', token, body: { code: totp(secret) } })).status,
      200,
    );

    // Password alone now yields only a challenge, not a token.
    const first = await call('/auth/login', { method: 'POST', body: { portal: 'api', ...CREDS.api } });
    assert.equal(first.data.requires2fa, true);
    assert.equal(first.data.token, undefined);

    const bad = await call('/auth/2fa/verify', {
      method: 'POST',
      body: { challenge: first.data.challenge, code: '123456' },
    });
    assert.equal(bad.status, 401);

    const good = await call('/auth/2fa/verify', {
      method: 'POST',
      body: { challenge: first.data.challenge, code: totp(secret) },
    });
    assert.equal(good.status, 200);
    assert.ok(good.data.token);

    // A challenge is single use.
    const replay = await call('/auth/2fa/verify', {
      method: 'POST',
      body: { challenge: first.data.challenge, code: totp(secret) },
    });
    assert.equal(replay.status, 401);

    assert.equal(
      (await call('/auth/2fa/disable', { method: 'POST', token: good.data.token, body: { code: totp(secret) } }))
        .status,
      200,
    );
  });
});

describe('charging sessions', () => {
  before(reset);

  test('start → stop writes a transaction and frees the connector', async () => {
    const token = await login('driver');
    const start = await call('/sessions/start', {
      method: 'POST',
      token,
      body: { stationId: 'st-003', connectorId: 'c8' },
    });
    assert.equal(start.status, 200);

    let state = (await call('/state')).data;
    const busy = state.stations.find(s => s.id === 'st-003').connectors.find(c => c.id === 'c8');
    assert.equal(busy.status, 'occupied');

    const stop = await call(`/sessions/${start.data.session.id}/stop`, { method: 'POST', token });
    assert.equal(stop.status, 200);
    assert.equal(stop.data.session.status, 'completed');
    assert.ok(stop.data.transaction.id.startsWith('TXN-'));

    state = (await call('/state')).data;
    const free = state.stations.find(s => s.id === 'st-003').connectors.find(c => c.id === 'c8');
    assert.equal(free.status, 'available');
  });

  test('an occupied connector cannot be started twice', async () => {
    const driver = await login('driver');
    const biz = await login('business');
    const a = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-006', connectorId: 'c13' } });
    assert.equal(a.status, 200);
    const b = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-006', connectorId: 'c13' } });
    assert.equal(b.status, 409);
    await call(`/sessions/${a.data.session.id}/stop`, { method: 'POST', token: driver });
  });

  test('a driver cannot stop someone else’s session', async () => {
    const biz = await login('business');
    const driver = await login('driver');
    const s = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-001', connectorId: 'c3' } });
    assert.equal(s.status, 200);

    const hijack = await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: driver });
    assert.equal(hijack.status, 403, 'driver stopped a session that is not theirs');

    assert.equal((await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: biz })).status, 200);
  });

  test('one driver cannot hold more than one active session', async () => {
    const token = await login('driver');
    const first = await call('/sessions/start', { method: 'POST', token, body: { stationId: 'st-001', connectorId: 'c4' } });
    assert.equal(first.status, 200);
    const second = await call('/sessions/start', { method: 'POST', token, body: { stationId: 'st-006', connectorId: 'c14' } });
    assert.equal(second.status, 409, 'driver started a second concurrent session');
    await call(`/sessions/${first.data.session.id}/stop`, { method: 'POST', token });
  });

  test('a driver with an empty wallet cannot start charging', async () => {
    await reset();
    const admin = await login('admin');
    const driver = await login('driver');
    // Drain the wallet through a dedicated admin path so the test does not
    // depend on how long a real session would take to cost that much.
    const drained = await call('/wallets/acc-driver/balance', {
      method: 'POST',
      token: admin,
      body: { balance: 0 },
    });
    assert.equal(drained.status, 200);

    const start = await call('/sessions/start', {
      method: 'POST',
      token: driver,
      body: { stationId: 'st-003', connectorId: 'c9' },
    });
    assert.equal(start.status, 402, 'charging started with no money in the wallet');
  });

  test('meter ticks require authentication', async () => {
    await reset();
    const token = await login('driver');
    const s = await call('/sessions/start', { method: 'POST', token, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal((await call(`/sessions/${s.data.session.id}/tick`, { method: 'POST' })).status, 401);
    assert.equal((await call(`/sessions/${s.data.session.id}/tick`, { method: 'POST', token })).status, 200);
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token });
  });
});

describe('operator boundaries', () => {
  before(reset);

  test('an operator can manage its own connectors', async () => {
    const token = await login('operator'); // GreenCharge UZ, op-001
    const r = await call('/stations/st-001/connectors/c4', { method: 'POST', token, body: { status: 'unavailable' } });
    assert.equal(r.status, 200);
    await call('/stations/st-001/connectors/c4', { method: 'POST', token, body: { status: 'available' } });
  });

  test("an operator cannot touch a competitor's station", async () => {
    const token = await login('operator'); // op-001
    const r = await call('/stations/st-002/connectors/c7', { method: 'POST', token, body: { status: 'unavailable' } });
    assert.equal(r.status, 403, 'operator changed a station owned by another operator');
  });

  test("an operator cannot stop a session at a competitor's station", async () => {
    const driver = await login('driver');
    const op = await login('operator'); // op-001
    const s = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-006', connectorId: 'c13' } }); // op-002
    assert.equal(s.status, 200);
    const r = await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: op });
    assert.equal(r.status, 403, 'operator stopped a session on a competitor network');
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: driver });
  });

  test('connectors cannot be forced into "occupied" without a session', async () => {
    const token = await login('admin');
    const r = await call('/stations/st-003/connectors/c9', { method: 'POST', token, body: { status: 'occupied' } });
    assert.equal(r.status, 400);
  });
});

describe('wallet', () => {
  before(reset);

  test('top-up moves the server balance', async () => {
    const token = await login('driver');
    const before = (await call('/state', { token })).data.wallets['acc-driver'].balance;
    const r = await call('/wallet/topup', { method: 'POST', token, body: { amount: 50000 } });
    assert.equal(r.status, 200);
    assert.equal(r.data.wallet.balance, before + 50000);
  });

  test('rejects zero, negative and non-numeric top-ups', async () => {
    const token = await login('driver');
    for (const amount of [0, -1000, 'abc']) {
      assert.equal((await call('/wallet/topup', { method: 'POST', token, body: { amount } })).status, 400, String(amount));
    }
  });
});

describe('webhooks', () => {
  before(reset);

  test('rejects non-HTTPS endpoints', async () => {
    const token = await login('api');
    const r = await call('/webhooks', { method: 'POST', token, body: { url: 'http://x.uz/h', events: ['session.stop'] } });
    assert.equal(r.status, 400);
  });

  test('deliveries carry a signature that verifies with the secret', async () => {
    const api = await login('api');
    const created = await call('/webhooks', {
      method: 'POST',
      token: api,
      body: { url: 'https://verify.example.uz/hook', events: ['session.start'] },
    });
    assert.equal(created.status, 200);
    const { id, secret } = created.data.webhook;

    // The secret is shown once, then masked.
    const listed = (await call('/webhooks', { token: api })).data.find(w => w.id === id);
    assert.notEqual(listed.secret, secret);

    const driver = await login('driver');
    const s = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-003', connectorId: 'c8' } });

    const d = (await call('/webhooks/deliveries?limit=20', { token: api })).data.find(x => x.webhookId === id);
    assert.ok(d, 'no delivery recorded');
    const [, ts, v1] = d.headers['X-OneCharge-Signature'].match(/t=(\d+),v1=([a-f0-9]+)/);
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${d.body}`).digest('hex');
    assert.equal(v1, expected);

    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: driver });
  });
});

describe('reports', () => {
  test('exports are recorded with the actor', async () => {
    const token = await login('operator');
    const r = await call('/reports', {
      method: 'POST',
      token,
      body: { name: 'test-report', title: 'Test', format: 'csv', rows: 3 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.report.actor, 'Sardor Yusupov');
    const list = (await call('/reports?name=test-report', { token })).data;
    assert.ok(list.some(x => x.id === r.data.report.id));
  });

  test('unknown formats are rejected', async () => {
    const token = await login('operator');
    assert.equal((await call('/reports', { method: 'POST', token, body: { name: 'x', format: 'exe' } })).status, 400);
  });
});

describe('station queue', () => {
  before(reset);

  const occupyStation3 = async () => {
    const biz = await login('business');
    const admin = await login('admin');
    const a = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-003', connectorId: 'c8' } });
    const b = await call('/sessions/start', { method: 'POST', token: admin, body: { stationId: 'st-003', connectorId: 'c9' } });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    return { biz, admin, bizSession: a.data.session.id, adminSession: b.data.session.id };
  };

  test('cannot queue while a connector is free', async () => {
    const driver = await login('driver');
    const r = await call('/stations/st-003/queue', { method: 'POST', token: driver });
    assert.equal(r.status, 409);
  });

  test('a freed connector is held for the head of the queue', async () => {
    const { biz, admin, bizSession, adminSession } = await occupyStation3();
    const driver = await login('driver');

    const joined = await call('/stations/st-003/queue', { method: 'POST', token: driver });
    assert.equal(joined.status, 200);
    assert.equal(joined.data.position, 1);

    // Joining twice is refused.
    assert.equal((await call('/stations/st-003/queue', { method: 'POST', token: driver })).status, 409);

    // The business session ends → the driver is promoted.
    assert.equal((await call(`/sessions/${bizSession}/stop`, { method: 'POST', token: biz })).status, 200);
    let entry = (await call('/state', { token: driver })).data.queues.find(q => q.userId === 'acc-driver');
    assert.equal(entry.notified, true);
    assert.equal(entry.connectorId, 'c8');

    const ready = (await call('/events?limit=10', { token: driver })).data.find(e => e.type === 'queue.ready');
    assert.equal(ready?.payload.userId, 'acc-driver');

    // Someone else cannot grab the held connector…
    const jump = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(jump.status, 409, 'queue jumper took the held connector');

    // …but the driver whose turn it is can, and that clears the queue entry.
    const mine = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(mine.status, 200);
    entry = (await call('/state', { token: driver })).data.queues.find(q => q.userId === 'acc-driver');
    assert.equal(entry, undefined);

    await call(`/sessions/${mine.data.session.id}/stop`, { method: 'POST', token: driver });
    await call(`/sessions/${adminSession}/stop`, { method: 'POST', token: admin });
  });

  test('leaving the queue removes the entry', async () => {
    await reset();
    const { biz, admin, bizSession, adminSession } = await occupyStation3();
    const driver = await login('driver');
    assert.equal((await call('/stations/st-003/queue', { method: 'POST', token: driver })).status, 200);
    assert.equal((await call('/stations/st-003/queue', { method: 'DELETE', token: driver })).status, 200);
    assert.equal((await call('/stations/st-003/queue', { method: 'DELETE', token: driver })).status, 404);
    await call(`/sessions/${bizSession}/stop`, { method: 'POST', token: biz });
    await call(`/sessions/${adminSession}/stop`, { method: 'POST', token: admin });
  });
});

describe('green hours tariff', () => {
  before(reset);

  test('forecast covers 24 hours with nights cheaper than the evening peak', async () => {
    const { status, data } = await call('/tariffs/forecast');
    assert.equal(status, 200);
    assert.equal(data.hours.length, 24);
    const at = h => data.hours.find(x => x.hour === h).multiplier;
    assert.ok(at(3) < at(19), 'night should be cheaper than 19:00');
    assert.equal(data.bestWindow.multiplier, Math.min(...data.hours.map(h => h.multiplier)));
  });

  test('a session locks the price of the band in effect at start', async () => {
    const { data: forecast } = await call('/tariffs/forecast');
    const token = await login('driver');
    const s = await call('/sessions/start', { method: 'POST', token, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(s.status, 200);
    assert.equal(s.data.session.basePrice, 1900);
    assert.equal(s.data.session.multiplier, forecast.current.multiplier);
    assert.equal(s.data.session.price, Math.round(1900 * forecast.current.multiplier));
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token });
  });
});

describe('driver issue reports', () => {
  before(reset);

  test('a report becomes an alert on the owning operator network', async () => {
    const driver = await login('driver');
    const r = await call('/stations/st-001/issues', {
      method: 'POST',
      token: driver,
      body: { category: 'Коннектор не работает', details: 'CCS2 не блокируется' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.alert.operatorId, 'op-001');
    assert.equal(r.data.alert.code, 'DRIVER_REPORT');
    assert.equal(r.data.alert.severity, 'warning');

    const alerts = (await call('/state', { token: await login('operator') })).data.alerts;
    assert.ok(alerts.some(a => a.id === r.data.alert.id));
  });

  test('safety reports are raised as critical', async () => {
    const biz = await login('business');
    const r = await call('/stations/st-002/issues', {
      method: 'POST',
      token: biz,
      body: { category: 'Угроза безопасности', details: 'искрит разъём' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.alert.severity, 'critical');
  });

  test('repeat reports from the same driver are throttled', async () => {
    const driver = await login('driver');
    const again = await call('/stations/st-001/issues', { method: 'POST', token: driver, body: { category: 'Другое' } });
    assert.equal(again.status, 429);
  });

  test('empty category and non-driver portals are refused', async () => {
    const driver = await login('driver');
    const op = await login('operator');
    assert.equal((await call('/stations/st-003/issues', { method: 'POST', token: driver, body: { category: '  ' } })).status, 400);
    assert.equal((await call('/stations/st-003/issues', { method: 'POST', token: op, body: { category: 'x' } })).status, 403);
  });
});

describe('eco profile', () => {
  before(reset);

  test('completed sessions add up to energy, CO₂ and badges', async () => {
    const token = await login('driver');
    const before = (await call('/eco/me', { token })).data;

    const s = await call('/sessions/start', { method: 'POST', token, body: { stationId: 'st-003', connectorId: 'c9' } });
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token });

    const after = (await call('/eco/me', { token })).data;
    assert.equal(after.sessions, before.sessions + 1);
    assert.ok(after.kwh > before.kwh);
    assert.equal(after.co2Kg, Math.round(after.kwh * 0.6 * 10) / 10);
    assert.equal(after.badges.find(b => b.id === 'first').earned, true);
  });

  test('leaderboard hides surnames and marks the caller', async () => {
    const token = await login('driver');
    const rows = (await call('/eco/leaderboard', { token })).data;
    assert.ok(rows.length > 0);
    const mine = rows.find(r => r.me);
    assert.ok(mine, 'caller not marked');
    assert.equal(mine.name, 'Alisher T.');
    assert.deepEqual(rows.map(r => r.rank), rows.map((_, i) => i + 1));
  });
});


// ---------------------------------------------------------------------------

async function openStream(ticket) {
  const ctrl = new AbortController();
  const events = [];
  const res = await fetch(`${BASE}/stream${ticket ? `?ticket=${ticket}` : ''}`, { signal: ctrl.signal });
  if (res.status !== 200) {
    ctrl.abort();
    return { status: res.status, events, close() {} };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              events.push(JSON.parse(line.slice(6)));
            } catch {
              /* keep-alive or partial frame */
            }
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();
  for (let i = 0; i < 40 && !events.some(e => e.type === 'connected'); i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  return { status: 200, events, close: () => ctrl.abort() };
}

const ticketFor = async token => (await call('/stream/ticket', { method: 'POST', token })).data.ticket;

describe('data isolation', () => {
  before(reset);

  test('anonymous state carries no personal or financial data', async () => {
    const d = (await call('/state')).data;
    assert.ok(d.stations.length > 0);
    assert.deepEqual(d.wallets, {});
    for (const key of ['sessions', 'transactions', 'alerts', 'vehicles', 'employees']) {
      assert.equal(d[key].length, 0, key);
    }
    assert.equal(d.operators[0].revenue, undefined);
    assert.equal(d.stats.revenueToday, null);
  });

  test('a driver sees only their own records', async () => {
    const d = (await call('/state', { token: await login('driver') })).data;
    assert.ok(d.sessions.length > 0);
    assert.ok(d.sessions.every(s => s.userId === 'acc-driver'));
    assert.deepEqual(Object.keys(d.wallets), ['acc-driver']);
    assert.equal(d.employees.length, 0);
    assert.ok(d.vehicles.every(v => v.driverId === 'acc-driver'));
    assert.equal(d.stats.revenueToday, null);
  });

  test('an operator sees only its own network', async () => {
    const d = (await call('/state', { token: await login('operator') })).data;
    assert.ok(d.sessions.every(s => s.operatorId === 'op-001'));
    assert.ok(d.alerts.every(a => !a.operatorId || a.operatorId === 'op-001'));
    assert.deepEqual(d.wallets, {});
    assert.equal(d.employees.length, 0);
  });

  test('a fleet manager sees the fleet but not private drivers', async () => {
    const d = (await call('/state', { token: await login('business') })).data;
    assert.deepEqual(Object.keys(d.wallets), ['biz-001']);
    assert.ok(d.employees.length > 0);
    assert.ok(d.sessions.every(s => s.corporate || s.userId === 'acc-business'));
  });

  test('admin sees everything', async () => {
    const d = (await call('/state', { token: await login('admin') })).data;
    assert.ok('acc-driver' in d.wallets && 'biz-001' in d.wallets);
    assert.ok(typeof d.stats.revenueToday === 'number');
  });

  test('mutation responses do not leak network revenue', async () => {
    const token = await login('driver');
    const s = await call('/sessions/start', { method: 'POST', token, body: { stationId: 'st-006', connectorId: 'c14' } });
    assert.equal(s.data.stats.revenueToday, null);
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token });
  });

  test("other drivers' queue places are anonymous", async () => {
    const biz = await login('business');
    const admin = await login('admin');
    const driver = await login('driver');
    const a = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-003', connectorId: 'c8' } });
    const b = await call('/sessions/start', { method: 'POST', token: admin, body: { stationId: 'st-003', connectorId: 'c9' } });
    assert.equal((await call('/stations/st-003/queue', { method: 'POST', token: driver })).status, 200);

    const seenByFleet = (await call('/state', { token: biz })).data.queues.find(q => q.stationId === 'st-003');
    assert.equal(seenByFleet.userId, undefined);
    assert.equal(seenByFleet.user, undefined);
    const seenBySelf = (await call('/state', { token: driver })).data.queues.find(q => q.stationId === 'st-003');
    assert.equal(seenBySelf.userId, 'acc-driver');

    await call('/stations/st-003/queue', { method: 'DELETE', token: driver });
    await call(`/sessions/${a.data.session.id}/stop`, { method: 'POST', token: biz });
    await call(`/sessions/${b.data.session.id}/stop`, { method: 'POST', token: admin });
  });

  test('the event log hides private events and anonymises public ones', async () => {
    const driver = await login('driver');
    await call('/wallet/topup', { method: 'POST', token: driver, body: { amount: 1000 } });
    const s = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-006', connectorId: 'c13' } });

    const anon = (await call('/events?limit=50')).data;
    assert.ok(!anon.some(e => e.type === 'wallet.topup'), 'anonymous reader saw a top-up');
    assert.ok(!anon.some(e => e.type === 'auth.login'), 'anonymous reader saw a login');
    const pubStart = anon.find(e => e.type === 'session.start');
    assert.equal(pubStart.actor, 'ONE CHARGE');
    assert.ok(!JSON.stringify(anon).includes('Alisher'), 'a name leaked to anonymous readers');

    const own = (await call('/events?limit=50', { token: driver })).data;
    assert.ok(own.some(e => e.type === 'wallet.topup'));

    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: driver });
  });

  test('live stream delivers only what each subscriber may see', async () => {
    const driver = await login('driver');
    const operator = await login('operator'); // op-001
    const biz = await login('business');

    const anon = await openStream();
    const mine = await openStream(await ticketFor(driver));
    const op = await openStream(await ticketFor(operator));
    assert.equal(mine.status, 200);

    await call('/wallet/topup', { method: 'POST', token: driver, body: { amount: 2000 } });
    const s = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-006', connectorId: 'c14' } }); // op-002
    await new Promise(r => setTimeout(r, 800));

    assert.ok(mine.events.some(e => e.type === 'wallet.topup'), 'driver missed their own top-up');
    assert.ok(!anon.events.some(e => e.type === 'wallet.topup'), 'anonymous stream saw a top-up');
    assert.ok(!op.events.some(e => e.type === 'wallet.topup'), 'operator saw a driver top-up');

    const competitorStart = op.events.find(e => e.type === 'session.start');
    assert.ok(competitorStart, 'public session event missing');
    assert.equal(competitorStart.actor, 'ONE CHARGE', "operator saw a name on a competitor's session");

    anon.close();
    mine.close();
    op.close();
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: biz });
  });

  test('stream tickets are single-use and forged ones are refused', async () => {
    const ticket = await ticketFor(await login('driver'));
    const first = await openStream(ticket);
    assert.equal(first.status, 200);
    first.close();
    assert.equal((await openStream(ticket)).status, 401);
    assert.equal((await openStream('forged')).status, 401);
  });

  test('partner webhooks receive anonymised payloads', async () => {
    const api = await login('api');
    const created = await call('/webhooks', {
      method: 'POST',
      token: api,
      body: { url: 'https://privacy.example.uz/hook', events: ['session.start'] },
    });
    const driver = await login('driver');
    const s = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-003', connectorId: 'c9' } });
    const d = (await call('/webhooks/deliveries?limit=20', { token: api })).data.find(x => x.webhookId === created.data.webhook.id);
    assert.ok(d);
    assert.ok(!d.body.includes('Alisher'), 'driver name sent to a partner');
    await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: driver });
  });
});


describe('bookings', () => {
  const inMinutes = m => new Date(Date.now() + m * 60_000).toISOString();
  const book = (token, stationId, connectorId, startsAt, minutes) =>
    call(`/stations/${stationId}/bookings`, { method: 'POST', token, body: { connectorId, startsAt, minutes } });

  test('charges the fee and holds the connector for its owner', async () => {
    await reset();
    const driver = await login('driver');
    const biz = await login('business');
    const before = (await call('/state', { token: driver })).data.wallets['acc-driver'].balance;

    const r = await book(driver, 'st-003', 'c8', inMinutes(0), 60);
    assert.equal(r.status, 200);
    assert.match(r.data.booking.code, /^BK-[0-9A-F]{6}$/);
    assert.equal(r.data.wallet.balance, before - 2000);

    const jump = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(jump.status, 409, 'someone else took a booked connector');

    const mine = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(mine.status, 200);
    const b = (await call('/state', { token: driver })).data.bookings.find(x => x.id === r.data.booking.id);
    assert.equal(b.status, 'used');
    await call(`/sessions/${mine.data.session.id}/stop`, { method: 'POST', token: driver });
  });

  test('refuses overlapping slots and a second active booking', async () => {
    await reset();
    const driver = await login('driver');
    const biz = await login('business');
    assert.equal((await book(driver, 'st-003', 'c9', inMinutes(60), 60)).status, 200);
    assert.equal((await book(biz, 'st-003', 'c9', inMinutes(90), 30)).status, 409, 'overlap accepted');
    assert.equal((await book(driver, 'st-006', 'c13', inMinutes(300), 30)).status, 409, 'second booking accepted');
  });

  test('cancelling before the window refunds the fee', async () => {
    await reset();
    const driver = await login('driver');
    const before = (await call('/state', { token: driver })).data.wallets['acc-driver'].balance;
    const r = await book(driver, 'st-006', 'c14', inMinutes(120), 30);
    const c = await call(`/bookings/${r.data.booking.id}`, { method: 'DELETE', token: driver });
    assert.equal(c.status, 200);
    assert.equal(c.data.refunded, true);
    assert.equal((await call('/state', { token: driver })).data.wallets['acc-driver'].balance, before);
    assert.equal((await call(`/bookings/${r.data.booking.id}`, { method: 'DELETE', token: driver })).status, 409);
  });

  test("someone else cannot cancel your booking, and sees the slot but not you", async () => {
    await reset();
    const driver = await login('driver');
    const biz = await login('business');
    const r = await book(driver, 'st-006', 'c13', inMinutes(45), 30);
    assert.equal((await call(`/bookings/${r.data.booking.id}`, { method: 'DELETE', token: biz })).status, 403);
    const seen = (await call('/state', { token: biz })).data.bookings.find(b => b.id === r.data.booking.id);
    assert.ok(seen, 'booked slot not visible');
    assert.equal(seen.userId, undefined);
    assert.equal(seen.user, undefined);
  });

  test('validates duration and start time', async () => {
    await reset();
    const driver = await login('driver');
    assert.equal((await book(driver, 'st-003', 'c8', inMinutes(30), 5)).status, 400);
    assert.equal((await book(driver, 'st-003', 'c8', inMinutes(-30), 60)).status, 400);
    assert.equal((await book(driver, 'st-003', 'c8', inMinutes(60 * 30), 60)).status, 400);
  });
});

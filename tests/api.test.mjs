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
    const before = (await call('/state')).data.wallets['acc-driver'].balance;
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
    let entry = (await call('/state')).data.queues.find(q => q.userId === 'acc-driver');
    assert.equal(entry.notified, true);
    assert.equal(entry.connectorId, 'c8');

    const ready = (await call('/events?limit=10')).data.find(e => e.type === 'queue.ready');
    assert.equal(ready?.payload.userId, 'acc-driver');

    // Someone else cannot grab the held connector…
    const jump = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(jump.status, 409, 'queue jumper took the held connector');

    // …but the driver whose turn it is can, and that clears the queue entry.
    const mine = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: 'st-003', connectorId: 'c8' } });
    assert.equal(mine.status, 200);
    entry = (await call('/state')).data.queues.find(q => q.userId === 'acc-driver');
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

/**
 * Dashboard analytics: figures add up, each role sees only its own slice,
 * and the admin's user directory can block a driver for real.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5100 + Math.floor(Math.random() * 400);
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
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const CREDS = {
  admin: ['admin@powergo.uz', 'Admin2026'],
  operator: ['operator@greencharge.uz', 'Operator2026'],
  business: ['fleet@uzauto.uz', 'Business2026'],
  driver: ['+998901234567', 'Driver2026'],
};
const login = async portal =>
  (await call('/auth/login', { method: 'POST', body: { portal, login: CREDS[portal][0], password: CREDS[portal][1] } })).data.token;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-analytics-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, DEMO_SIMULATION: 'false', PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const until = Date.now() + 15000;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error('server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
});

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('analytics', () => {
  test('needs a signed-in portal', async () => {
    assert.equal((await call('/analytics')).status, 401);
  });

  test('network totals add up and match the daily breakdown', async () => {
    const a = (await call('/analytics?days=30', { token: await login('admin') })).data;
    assert.equal(a.range.days, 30);
    assert.ok(a.totals.completed > 200, 'the demo network has a real history');
    const byDay = a.daily.reduce((n, d) => n + d.revenue, 0);
    assert.equal(byDay, a.totals.revenue);
    const byStation = a.stations.reduce((n, s) => n + s.revenue, 0);
    assert.equal(byStation, a.totals.revenue);
    const byOperator = a.operators.reduce((n, o) => n + o.revenue, 0);
    assert.equal(byOperator, a.totals.revenue);
    assert.equal(a.totals.payout + a.totals.commission, a.totals.revenue);
    assert.equal(a.hourly.length, 24);
    assert.equal(a.network.stations, (await call('/state')).data.stations.length);
    // Average price stays within the tariffs actually on the network.
    assert.ok(a.totals.avgPrice > 600 && a.totals.avgPrice < 3000, `avg price ${a.totals.avgPrice}`);
  });

  test('an operator sees only its own network, with masked customer phones', async () => {
    const a = (await call('/analytics', { token: await login('operator') })).data;
    assert.ok(a.stations.length > 0);
    assert.ok(a.stations.every(s => s.operatorId === 'op-001'));
    assert.deepEqual(a.operators.map(o => o.id), ['op-001']);
    assert.ok(a.customers.length > 0);
    assert.ok(a.customers.every(c => c.phone.includes('•')), 'operator got a full phone number');
  });

  test('a fleet sees corporate charging and its employees; a driver only their own', async () => {
    const fleet = (await call('/analytics', { token: await login('business') })).data;
    assert.ok(fleet.totals.completed > 0);
    assert.equal(fleet.operators.length, 0);
    assert.equal(fleet.customers, undefined);
    assert.equal(fleet.employees.length, 5);

    const mine = (await call('/analytics', { token: await login('driver') })).data;
    assert.ok(mine.totals.completed > 0);
    assert.equal(mine.customers, undefined);
    assert.equal(mine.employees, undefined);
    assert.ok(mine.totals.uniqueUsers <= 1);
  });

  test('the live state carries recent sessions, not the whole history', async () => {
    const admin = await login('admin');
    const state = (await call('/state', { token: admin })).data;
    const a = (await call('/analytics?days=30', { token: admin })).data;
    assert.ok(state.sessions.filter(s => s.status !== 'active').length <= 150);
    assert.ok(a.totals.sessions > state.sessions.length);
  });
});

describe('commission', () => {
  test('a new rate applies to new sessions only, and stays in range', async () => {
    const admin = await login('admin');
    const before = (await call('/analytics', { token: admin })).data.operators.find(o => o.id === 'op-001');
    assert.equal((await call('/operators/op-001/commission', { method: 'POST', token: admin, body: { rate: 5 } })).status, 200);
    const after = (await call('/analytics', { token: admin })).data.operators.find(o => o.id === 'op-001');
    assert.equal(after.commissionRate, 5);
    assert.equal(after.commission, before.commission, 'history was recharged at the new rate');
    assert.equal((await call('/operators/op-001/commission', { method: 'POST', token: admin, body: { rate: 25 } })).status, 400);
    assert.equal((await call('/operators/op-001/commission', { method: 'POST', token: await login('operator'), body: { rate: 1 } })).status, 403);
  });

  test('refunds go back to the wallet once', async () => {
    const admin = await login('admin');
    const state = (await call('/state', { token: admin })).data;
    const txn = state.transactions.find(t => t.status === 'completed' && t.amount > 0 && t.method === 'Кошелёк');
    const first = await call(`/transactions/${txn.id}/refund`, { method: 'POST', token: admin });
    assert.equal(first.status, 200);
    assert.equal(first.data.transaction.status, 'refunded');
    assert.equal((await call(`/transactions/${txn.id}/refund`, { method: 'POST', token: admin })).status, 409);
  });
});

describe('company-paid charging', () => {
  test('a fleet employee charges to the company, within the monthly limit', async () => {
    const driver = await login('driver');
    const fleet = await login('business');
    const state = (await call('/state', { token: driver })).data;
    assert.equal(state.employer?.employeeId, 'emp-01', 'the fleet driver has no employer');
    const running = state.sessions.find(s => s.status === 'active' && s.userId === 'acc-driver');
    if (running) await call(`/sessions/${running.id}/stop`, { method: 'POST', token: driver });
    const st = state.stations.find(s => s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const start = () => call('/sessions/start', { method: 'POST', token: driver, body: { stationId: st.id, connectorId: c.id, payer: 'company' } });

    // Limit used up: refused, and the driver is told why.
    await call('/employees/emp-01/limit', { method: 'POST', token: fleet, body: { limit: state.employer.spent } });
    const refused = await start();
    assert.equal(refused.status, 402);
    assert.match(refused.data.error, /Лимит/);

    await call('/employees/emp-01/limit', { method: 'POST', token: fleet, body: { limit: state.employer.spent + 5_000_000 } });
    const balance = (await call('/state', { token: fleet })).data.wallets['biz-001'].balance;
    const started = await start();
    assert.equal(started.status, 200);
    assert.equal(started.data.session.corporate, true);
    const stopped = (await call(`/sessions/${started.data.session.id}/stop`, { method: 'POST', token: driver })).data.session;
    assert.ok(stopped.cost > 0);
    assert.equal((await call('/state', { token: fleet })).data.wallets['biz-001'].balance, balance - stopped.cost);
    const fa = (await call('/analytics', { token: fleet })).data;
    assert.ok(fa.trips.some(t => t.id === stopped.id && t.employeeId === 'emp-01'));
    assert.equal(fa.employees.find(e => e.id === 'emp-01').spentMonth, state.employer.spent + stopped.cost);
  });

  test('only fleet employees may charge to a company', async () => {
    const admin = await login('admin');
    const state = (await call('/state', { token: admin })).data;
    const st = state.stations.find(s => s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const res = await call('/sessions/start', { method: 'POST', token: admin, body: { stationId: st.id, connectorId: c.id, payer: 'company' } });
    assert.equal(res.status, 403);
  });
});

describe('station ratings', () => {
  test('a driver rates a finished charge once, and the station average moves', async () => {
    const driver = await login('driver');
    const state = (await call('/state', { token: driver })).data;
    const running = state.sessions.find(s => s.status === 'active' && s.userId === 'acc-driver');
    if (running) await call(`/sessions/${running.id}/stop`, { method: 'POST', token: driver });
    const st = state.stations.find(s => s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const started = (await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: st.id, connectorId: c.id } })).data.session;
    assert.equal((await call(`/sessions/${started.id}/rating`, { method: 'POST', token: driver, body: { stars: 5 } })).status, 409, 'a running charge was rated');
    await call(`/sessions/${started.id}/stop`, { method: 'POST', token: driver });

    assert.equal((await call(`/sessions/${started.id}/rating`, { method: 'POST', token: driver, body: { stars: 9 } })).status, 400);
    assert.equal((await call(`/sessions/${started.id}/rating`, { method: 'POST', token: await login('business'), body: { stars: 1 } })).status, 404, 'someone else rated the charge');
    const rated = await call(`/sessions/${started.id}/rating`, { method: 'POST', token: driver, body: { stars: 1 } });
    assert.equal(rated.status, 200);
    assert.equal(rated.data.station.reviews, st.reviews + 1);
    assert.ok(rated.data.station.rating < st.rating);
    assert.equal((await call(`/sessions/${started.id}/rating`, { method: 'POST', token: driver, body: { stars: 5 } })).status, 409, 'rated twice');
  });
});

describe('account self-service', () => {
  test('devices are listed without their tokens, and the others can be signed out', async () => {
    const a = await login('operator');
    const b = await login('operator');
    const list = (await call('/auth/sessions', { token: a })).data;
    assert.ok(list.length >= 2);
    assert.equal(list.filter(d => d.current).length, 1);
    assert.ok(list.every(d => d.id.length === 12 && !JSON.stringify(d).includes(a)));
    assert.equal((await call('/auth/sessions/revoke-others', { method: 'POST', token: a })).status, 200);
    assert.equal((await call('/auth/me', { token: b })).status, 401, 'the other device is still signed in');
    assert.equal((await call('/auth/me', { token: a })).status, 200);
  });

  test('a password change needs the current one and signs other devices out', async () => {
    const a = await login('operator');
    const b = await login('operator');
    assert.equal((await call('/auth/password', { method: 'POST', token: a, body: { current: 'wrong', next: 'NewPass2026' } })).status, 401);
    assert.equal((await call('/auth/password', { method: 'POST', token: a, body: { current: CREDS.operator[1], next: '123' } })).status, 400);
    assert.equal((await call('/auth/password', { method: 'POST', token: a, body: { current: CREDS.operator[1], next: 'NewPass2026' } })).status, 200);
    assert.equal((await call('/auth/me', { token: b })).status, 401);
    const relogin = await call('/auth/login', { method: 'POST', body: { portal: 'operator', login: CREDS.operator[0], password: 'NewPass2026' } });
    assert.equal(relogin.status, 200);
    // Put it back for the other tests.
    await call('/auth/password', { method: 'POST', token: relogin.data.token, body: { current: 'NewPass2026', next: CREDS.operator[1] } });
  });

  test('notifications are the events addressed to me, and a driver can save a car', async () => {
    const driver = await login('driver');
    const notes = (await call('/notifications', { token: driver })).data;
    assert.ok(Array.isArray(notes));
    assert.ok(notes.every(n => !('scope' in n)));
    assert.equal((await call('/me/car', { method: 'PUT', token: driver, body: { brand: 'BYD', model: 'Seal', year: 2025, battery: 999, port: 'CCS2', maxKw: 150 } })).status, 400);
    assert.equal((await call('/me/car', { method: 'PUT', token: driver, body: { brand: 'BYD', model: 'Seal', year: 2025, battery: 82, port: 'CCS2', maxKw: 150, chargeLimit: 30 } })).status, 400);
    const saved = await call('/me/car', { method: 'PUT', token: driver, body: { brand: 'BYD', model: 'Seal', year: 2025, battery: 82, port: 'CCS2', maxKw: 150, chargeLimit: 90 } });
    assert.equal(saved.status, 200);
    assert.equal((await call('/auth/me', { token: driver })).data.user.car.model, 'Seal');
    assert.equal(saved.data.user.car.chargeLimit, 90);
    assert.equal((await call('/me/car', { method: 'PUT', token: await login('operator'), body: {} })).status, 403);
  });
});

describe('admin tools', () => {
  test('risk signals point at their records and can be reviewed', async () => {
    const admin = await login('admin');
    const report = (await call('/admin/risk', { token: admin })).data;
    const rules = new Set(report.findings.map(f => f.rule));
    for (const r of ['failed_starts', 'impossible_energy', 'parallel_sessions', 'abandoned_payments']) assert.ok(rules.has(r), `no ${r} signal`);
    assert.ok(report.findings.every(f => f.refs.length > 0 && f.detail));
    const f = report.findings.find(x => !x.review);
    assert.equal((await call(`/admin/risk/${encodeURIComponent(f.id)}/review`, { method: 'POST', token: admin, body: { decision: 'maybe' } })).status, 400);
    assert.equal((await call(`/admin/risk/${encodeURIComponent(f.id)}/review`, { method: 'POST', token: admin, body: { decision: 'dismissed' } })).status, 200);
    const after = (await call('/admin/risk', { token: admin })).data;
    assert.equal(after.open, report.open - 1);
    assert.equal((await call('/admin/risk', { token: await login('operator') })).status, 403);
  });

  test('charge records are checked, and the impossible reading is caught', async () => {
    const cdr = (await call('/admin/cdr?days=30', { token: await login('admin') })).data;
    assert.ok(cdr.checked > 100);
    assert.ok(cdr.issues.some(i => i.check === 'energy'));
    assert.equal(cdr.passed, cdr.checked - new Set(cdr.issues.map(i => i.sessionId)).size);
  });

  test('tariff windows are validated and drive the forecast', async () => {
    const admin = await login('admin');
    const { bands } = (await call('/admin/tariff-bands', { token: admin })).data;
    assert.equal(bands.length, 3);
    const overlap = bands.map(b => (b.band === 'day' ? { ...b, from: 9, to: 20 } : b));
    assert.equal((await call('/admin/tariff-bands', { method: 'PUT', token: admin, body: { bands: overlap } })).status, 400);
    const cheaper = bands.map(b => (b.band === 'green' ? { ...b, multiplier: 0.6 } : b));
    assert.equal((await call('/admin/tariff-bands', { method: 'PUT', token: admin, body: { bands: cheaper } })).status, 200);
    const forecast = (await call('/tariffs/forecast')).data;
    assert.equal(forecast.hours.find(h => h.hour === 2).multiplier, 0.6);
    await call('/admin/tariff-bands', { method: 'PUT', token: admin, body: { bands } });
  });

  test('health and staff accounts are admin-only', async () => {
    const admin = await login('admin');
    const health = (await call('/admin/health', { token: admin })).data;
    assert.ok(health.uptimeSec >= 0 && health.records.stations > 0 && typeof health.webhooks.pending === 'number');
    const accounts = (await call('/admin/accounts', { token: admin })).data;
    assert.ok(accounts.some(a => a.portal === 'operator') && accounts.every(a => a.portal !== 'driver' && !('hash' in a)));
    assert.equal((await call('/admin/health', { token: await login('business') })).status, 403);
  });
});

describe('admin users', () => {
  test('lists drivers with activity; only the admin may', async () => {
    const admin = await login('admin');
    const { data } = await call('/admin/users', { token: admin });
    assert.ok(data.total >= 300);
    assert.equal(data.users.length, data.total);
    assert.ok(data.users.some(u => u.id === 'acc-driver' && u.sessions > 0));
    assert.equal((await call('/admin/users', { token: await login('operator') })).status, 403);
  });

  test('blocking a driver signs them out and stops sign-in; unblocking restores it', async () => {
    const admin = await login('admin');
    const driver = await login('driver');
    assert.equal((await call('/admin/users/acc-driver/status', { method: 'POST', token: admin, body: { status: 'blocked' } })).status, 200);
    assert.equal((await call('/auth/me', { token: driver })).status, 401, 'old token still works');
    const again = await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: CREDS.driver[0], password: CREDS.driver[1] } });
    assert.equal(again.status, 403);

    assert.equal((await call('/admin/users/acc-driver/status', { method: 'POST', token: admin, body: { status: 'active' } })).status, 200);
    assert.ok(await login('driver'));
    assert.equal((await call('/admin/users/acc-driver/status', { method: 'POST', token: admin, body: { status: 'gone' } })).status, 400);
  });
});

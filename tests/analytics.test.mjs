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
  admin: ['admin@onecharge.uz', 'Admin2026'],
  operator: ['operator@greencharge.uz', 'Operator2026'],
  business: ['fleet@uzauto.uz', 'Business2026'],
  driver: ['+998901234567', 'Driver2026'],
};
const login = async portal =>
  (await call('/auth/login', { method: 'POST', body: { portal, login: CREDS[portal][0], password: CREDS[portal][1] } })).data.token;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-analytics-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
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
    const a = (await call('/analytics?days=45', { token: admin })).data;
    assert.ok(state.sessions.length <= 160);
    assert.ok(a.totals.sessions > state.sessions.length);
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

/**
 * Growth of the driver base for the admin: the way from sign-up to a second
 * charge, drivers active by day, week and month, and weekly cohorts.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9600 + Math.floor(Math.random() * 300);
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

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-growth-'));
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

const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;

test('the admin sees the funnel, active drivers and weekly cohorts', async () => {
  const token = await login('admin', 'admin@voli.uz', 'Admin2026');
  const r = await call('/admin/growth', { token });
  assert.equal(r.status, 200);
  const { funnel, active, cohorts } = r.data;
  assert.equal(funnel.length, 4);
  for (let i = 1; i < funnel.length; i++) assert.ok(funnel[i].count <= funnel[i - 1].count, `step ${i} grew`);
  assert.equal(funnel[0].ofFirst, 100);
  assert.ok(active.dau <= active.wau && active.wau <= active.mau);
  assert.equal(cohorts.length, 8);
  // The oldest cohort has seven later weeks to look at, this week's none.
  assert.equal(cohorts[0].retention.length, 7);
  assert.equal(cohorts.at(-1).retention.length, 0);
  for (const c of cohorts) for (const p of c.retention) assert.ok(p >= 0 && p <= 100);
});

test('a network cannot read the growth of the whole platform', async () => {
  const token = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  assert.equal((await call('/admin/growth', { token })).status, 403);
});

test('the investor page shows months in order, closed ones growing from the rollups and the history', async () => {
  const token = await login('admin', 'admin@voli.uz', 'Admin2026');
  const r = await call('/admin/investor', { token });
  assert.equal(r.status, 200);
  const { months, last, yearRunRate } = r.data;
  assert.deepEqual(months.map(m => m.month), [...months.map(m => m.month)].sort());
  assert.equal(months.filter(m => m.partial).length, 1, 'only the current month is still running');
  assert.ok(months.every(m => m.revenue >= 0 && m.commission <= m.revenue));
  assert.equal(yearRunRate, last.commission * 12);
  const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  assert.equal((await call('/admin/investor', { token: op })).status, 403);
});

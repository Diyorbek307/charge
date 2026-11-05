/**
 * Demand the network does not meet: searches that find no station and
 * stations opened with nothing free, kept without naming the driver.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const PORT = 9900 + Math.floor(Math.random() * 300);
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-demand-'));
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

test('a lost search and a full station reach the admin, with no driver named', async () => {
  const driver = await login('driver', '+998901234567', 'Driver2026');
  for (let i = 0; i < 3; i++) await call('/demand', { method: 'POST', token: driver, body: { kind: 'search', q: '  Chirchiq ', lat: 41.4691, lng: 69.5822 } });
  await call('/demand', { method: 'POST', body: { kind: 'busy', stationId: 'st-001' } });
  assert.equal((await call('/demand', { method: 'POST', body: { kind: 'spam', q: 'x' } })).status, 204);
  assert.equal((await call('/demand', { method: 'POST', body: { kind: 'busy', stationId: 'nope' } })).status, 204);

  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const r = await call('/admin/demand', { token: admin });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.searches[0], { q: 'chirchiq', count: 3 });
  // Rounded to a twentieth of a degree: a district, not a house.
  assert.deepEqual(r.data.areas[0], { lat: 41.45, lng: 69.6, count: 3 });
  assert.equal(r.data.totals.busyViews, 1);
  assert.ok(r.data.stations.some(s => s.id === 'st-001' && s.busyViews === 1));
  for (const s of r.data.stations) assert.ok(s.fullHours >= 0);

  await new Promise(res => setTimeout(res, 1200)); // the store flushes
  const stored = JSON.parse(readFileSync(join(dataDir, 'db.json'), 'utf8')).demand;
  assert.ok(stored.length >= 4);
  assert.ok(stored.every(e => !('userId' in e) && !('user' in e)), 'a demand record names a driver');
});

test('only the admin reads demand', async () => {
  const driver = await login('driver', '+998901234567', 'Driver2026');
  assert.equal((await call('/admin/demand', { token: driver })).status, 403);
});

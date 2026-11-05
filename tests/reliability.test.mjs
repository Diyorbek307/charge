/**
 * Station reliability: every station that has charged carries a score, the
 * lower of its start success rate and its uptime, and the admin sees the
 * networks ranked by it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10300 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

async function call(path, { token } = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const login = async (portal, login, password) =>
  (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal, login, password }) })).json()).token;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-rel-'));
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

test('stations that charged carry a reliability score drivers can see', async () => {
  const stations = (await call('/state')).data.stations;
  const scored = stations.filter(s => s.reliability);
  assert.ok(scored.length > 0);
  for (const s of scored) {
    const { score, starts, uptime } = s.reliability;
    assert.ok(score > 0 && score <= 100);
    // The score never flatters: it is the weaker of the two.
    for (const part of [starts, uptime]) if (part !== null) assert.ok(score <= part);
  }
});

test('the admin sees networks ranked, stations weakest first; others may not', async () => {
  const r = await call('/admin/reliability', { token: await login('admin', 'admin@voli.uz', 'Admin2026') });
  assert.equal(r.status, 200);
  const scores = r.data.networks.map(n => n.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  const weakest = r.data.stations.map(s => s.score);
  assert.deepEqual(weakest, [...weakest].sort((a, b) => a - b));
  const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  assert.equal((await call('/admin/reliability', { token: op })).status, 403);
});

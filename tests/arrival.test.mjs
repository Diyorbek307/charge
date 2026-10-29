/**
 * Will a point be free when the driver gets there, and where else is likelier.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10100 + Math.floor(Math.random() * 90);
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, type: res.headers.get('content-type') };
}
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;
const driver = () => login('driver', '+998901234567', 'Driver2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-arrival-'));
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

describe('free on arrival', () => {
  test('a free point now is a near-certain one in a minute, and less certain an hour away', async () => {
    const st = (await call('/state')).data.stations.find(s => s.connectors.some(c => c.status === 'available'));
    const now = (await call(`/stations/${st.id}/arrival?eta=0`)).data;
    assert.equal(now.chance, 100);
    assert.equal(now.verdict, 'likely');
    const later = (await call(`/stations/${st.id}/arrival?eta=240`)).data;
    assert.ok(later.chance <= now.chance);
    assert.ok(Array.isArray(later.alternatives));
  });

  test('a busier station points to nearby ones with a better chance', async () => {
    const token = await driver();
    const all = (await call('/state', { token })).data.stations;
    // Take every free point of a station that has a neighbour within 8 km.
    const st = all.find(s => !s.ocpi && s.connectors.length <= 3 && s.connectors.every(c => c.status === 'available'));
    for (const c of st.connectors) {
      const r = await call('/sessions/start', { method: 'POST', token: await driver(), body: { stationId: st.id, connectorId: c.id } });
      if (r.status !== 200) break;
    }
    const a = (await call(`/stations/${st.id}/arrival?eta=5`)).data;
    assert.ok(a.chance < 100);
    assert.ok(a.alternatives.every(x => x.chance > a.chance && x.km <= 8));
    assert.equal((await call(`/stations/${st.id}/arrival?eta=-3`)).status, 400);
  });
});

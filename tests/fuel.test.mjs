/**
 * The map's «Газ» and «Бензин» modes: stations from the OpenStreetMap snapshot,
 * and drivers marking whether there is gas right now.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 11000 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-fuel-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', SMTP_HOST: '', RESEND_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 450; i++) {
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

test('gas and petrol stations, and a driver marking whether there is gas', async () => {
  const gas = (await call('/fuel?kind=gas')).data.stations;
  const petrol = (await call('/fuel?kind=petrol')).data.stations;
  assert.ok(gas.length > 100 && petrol.length > 100, 'the snapshot covers Uzbekistan');
  assert.ok(gas.every(s => s.metan || s.propan), 'the gas mode has only stations with gas');
  assert.ok(petrol.every(s => s.petrol));
  const st = gas[0];
  assert.equal(st.now, null, 'nobody has said anything yet');

  // Only a signed-in driver marks, with a known mark.
  assert.equal((await call(`/fuel/${st.id}/report`, { method: 'POST', body: { fuel: 'gas', status: 'yes' } })).status, 401);
  const token = (await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data.token;
  assert.equal((await call(`/fuel/${st.id}/report`, { method: 'POST', token, body: { fuel: 'gas', status: 'maybe' } })).status, 400);
  assert.equal((await call('/fuel/osm-nope/report', { method: 'POST', token, body: { fuel: 'gas', status: 'yes' } })).status, 404);

  const marked = await call(`/fuel/${st.id}/report`, { method: 'POST', token, body: { fuel: 'gas', status: 'no' } });
  assert.equal(marked.status, 201);
  assert.equal(marked.data.now.status, 'no');
  assert.equal((await call('/fuel?kind=gas')).data.stations.find(s => s.id === st.id).now.status, 'no', 'everyone sees it');
  assert.equal((await call(`/fuel/${st.id}/report`, { method: 'POST', token, body: { fuel: 'gas', status: 'yes' } })).status, 409, 'one mark per 20 minutes');
});

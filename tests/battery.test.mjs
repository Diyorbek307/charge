/**
 * Battery health: capacity from energy and the percentage chargers report.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9990 + Math.floor(Math.random() * 9);
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-battery-'));
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

describe('battery health', () => {
  test('capacity is measured from charges the charger reported the percentage for', async () => {
    const token = await driver();
    // Without the car's rated capacity there is nothing to compare with.
    const before = (await call('/battery', { token })).data;
    assert.ok(before.measured.length > 0, 'the demo fast charges carry the battery percentage');
    await call('/me/car', { method: 'PUT', token, body: { brand: 'BYD', model: 'Han EV', year: 2024, battery: 85, port: 'CCS2', maxKw: 120, chargeLimit: 80 } });
    const h = (await call('/battery', { token })).data;
    assert.ok(h.soh >= 85 && h.soh <= 95, `state of health ${h.soh}%`);
    assert.ok(h.capacity > 70 && h.capacity < 85, `capacity ${h.capacity} kWh`);
    assert.equal(h.grade, 'excellent');
    assert.ok(h.acceptance.length >= 1);
    assert.ok(h.measured.every(m => m.to - m.from >= 15));
    assert.match(h.reportId, /^BH-/);
  });

  test('the report is only for the signed-in driver', async () => {
    const reg = await call('/battery', { token: 'nope' });
    assert.equal(reg.status, 401);
  });
});

/**
 * Speed cameras for the in-app navigator: drivers mark them, others confirm
 * or deny; the area query returns them (OpenStreetMap is off in tests).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9300 + Math.floor(Math.random() * 300);
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
const driver = async () => (await call('/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data.token;
async function newDriver(phone) {
  const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
  return (await call('/auth/register', { method: 'POST', body: { phone, code, name: 'Test Driver', password: 'Camera2026' } })).data.token;
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-cam-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', OSM_CAMERAS: 'false' },
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

describe('speed cameras', () => {
  test('a driver marks a camera, a second mark nearby confirms it, and the area query returns it', async () => {
    const a = await driver();
    assert.equal((await call('/cameras', { method: 'POST', token: a, body: { lat: 10, lng: 10 } })).status, 400);
    const made = await call('/cameras', { method: 'POST', token: a, body: { lat: 41.3, lng: 69.27, maxspeed: 60 } });
    assert.equal(made.status, 201);
    const b = await newDriver('+998935557001');
    const again = await call('/cameras', { method: 'POST', token: b, body: { lat: 41.30015, lng: 69.27012 } });
    assert.equal(again.data.merged, true);
    assert.equal(again.data.camera.confirmed, 2);
    const area = (await call('/cameras?bbox=41.2,69.2,41.4,69.4')).data.cameras;
    assert.equal(area.length, 1);
    assert.deepEqual({ maxspeed: area[0].maxspeed, source: area[0].source }, { maxspeed: 60, source: 'drivers' });
    assert.equal((await call('/cameras?bbox=41.5,69.2,41.6,69.4')).data.cameras.length, 0);
    assert.equal((await call('/cameras?bbox=1,2')).status, 400);
  });

  test('three drivers saying "no camera here" hide a single report', async () => {
    const a = await newDriver('+998935557002');
    const cam = (await call('/cameras', { method: 'POST', token: a, body: { lat: 41.25, lng: 69.2 } })).data.camera;
    for (const phone of ['+998935557003', '+998935557004', '+998935557005']) {
      await call(`/cameras/${cam.id}/deny`, { method: 'POST', token: await newDriver(phone) });
    }
    const area = (await call('/cameras?bbox=41.2,69.15,41.3,69.25')).data.cameras;
    assert.equal(area.length, 0);
  });
});

/**
 * Support for everyone: a network, a fleet and a driver write from their
 * cabinets; the admin sees who wrote, with their money and recent trouble.
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-support-'));
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

test('a network and a driver write to support; the admin sees each one in full', async () => {
  const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  const wrote = await call('/support/messages', { method: 'POST', token: op, body: { text: 'Станция st-001 не подключается' } });
  assert.equal(wrote.status, 201);
  assert.equal(wrote.data.portal, 'operator');
  assert.equal(wrote.data.aiActive, false);

  const driver = await login('driver', '+998901234567', 'Driver2026');
  assert.equal((await call('/support/messages', { method: 'POST', token: driver, body: { text: 'Не списались деньги?' } })).status, 201);

  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const threads = (await call('/admin/support', { token: admin })).data;
  const opThread = threads.find(t => t.portal === 'operator');
  assert.equal(opThread.org, 'GreenCharge UZ');
  assert.equal(opThread.needsHuman, true);

  const opProfile = (await call(`/admin/support/${opThread.id}/profile`, { token: admin })).data;
  assert.equal(opProfile.kind, 'operator');
  assert.ok(opProfile.stations > 0);

  const drThread = threads.find(t => t.portal === 'driver');
  const dr = (await call(`/admin/support/${drThread.id}/profile`, { token: admin })).data;
  assert.equal(dr.kind, 'driver');
  assert.equal(typeof dr.balance, 'number');
  assert.ok(Array.isArray(dr.sessions));

  // Only the admin reads profiles.
  assert.equal((await call(`/admin/support/${drThread.id}/profile`, { token: op })).status, 403);
});

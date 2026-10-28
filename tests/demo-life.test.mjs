/**
 * The demo network keeps itself alive: simulated charges start and finish,
 * stay out of the audit log, never touch the six stations the other suites
 * drive, and a server that slept catches up on the history it missed.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
const admin = async () => (await call('/auth/login', { method: 'POST', body: { portal: 'admin', login: 'admin@zaryad24.uz', password: 'Admin2026' } })).data.token;

async function start() {
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_TICK_MS: '400', DATABASE_URL: '', OCPI_DEMO: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const until = Date.now() + 15000;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error('server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
}
const stop = () => new Promise(resolve => { server.once('exit', resolve); server.kill(); });

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-life-'));
  await start();
});

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('demo life', () => {
  test('simulated charges run on the extra stations only and stay out of the audit log', async () => {
    const token = await admin();
    const before = (await call('/events?limit=300', { token })).data.length;
    await new Promise(r => setTimeout(r, 2500));
    const state = (await call('/state', { token })).data;
    const demo = state.sessions.filter(s => s.source === 'demo');
    assert.ok(demo.length > 0, 'no simulated sessions');
    const protectedIds = new Set(['st-001', 'st-002', 'st-003', 'st-004', 'st-005', 'st-006']);
    // st-001/002 keep their seeded busy connectors, but nothing new starts there.
    assert.ok(state.sessions.filter(s => s.status === 'active' && s.source === 'demo' && protectedIds.has(s.stationId)).every(s => ['c2', 'c5', 'c6'].includes(s.connectorId)));
    const after = (await call('/events?limit=300', { token })).data;
    assert.equal(after.length, before + 0, 'simulated activity wrote to the audit log');
    assert.ok(!after.some(e => e.payload?.simulated));
  });

  test('a server that slept fills in the history it missed', async () => {
    await stop();
    const file = join(dataDir, 'db.json');
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const count = doc.sessions.length;
    doc.historyUntil = new Date(Date.now() - 6 * 3600_000).toISOString();
    writeFileSync(file, JSON.stringify(doc));
    await start();
    const state = (await call('/analytics?days=1', { token: await admin() })).data;
    // Saves are debounced; give the catch-up a moment to reach the disk.
    await new Promise(r => setTimeout(r, 800));
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(after.sessions.length > count, 'no sessions generated for the gap');
    assert.ok(state.totals.sessions > 0);
  });

  test('a database without a history mark starts at once instead of rebuilding years', async () => {
    await stop();
    const file = join(dataDir, 'db.json');
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const count = doc.sessions.length;
    delete doc.historyUntil;
    writeFileSync(file, JSON.stringify(doc));
    const t = Date.now();
    await start();
    assert.ok(Date.now() - t < 10000, 'startup took too long');
    await new Promise(r => setTimeout(r, 800));
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(after.historyUntil, 'the mark was not set');
    assert.ok(after.sessions.length < count + 200, 'history was regenerated');
  });
});

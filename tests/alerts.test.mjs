/**
 * Alerts to the team: the same problem told once per half hour, at most 20
 * an hour, and errors from drivers' phones accepted without personal data.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Sending an alert loads the mail module and with it the database: keep that in a scratch folder.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'oc-alerts-local-'));
process.env.DATABASE_URL = '';
const { alertTeam, alertsStatus } = await import('../server/alerts.js');

describe('alertTeam', () => {
  test('the same problem is sent once, then only logged', async () => {
    const key = `t-${Date.now()}`;
    assert.equal(await alertTeam(key, 'Проверка', [['Что', 'тест']]), true);
    assert.equal(await alertTeam(key, 'Проверка', [['Что', 'тест']]), false);
    const recent = alertsStatus().recent;
    assert.equal(recent[0].sent, false);
    assert.equal(recent[1].sent, true);
  });

  test('no more than 20 an hour in all', async () => {
    let sent = 0;
    for (let i = 0; i < 30; i++) if (await alertTeam(`flood-${i}-${Date.now()}`, 'Поток')) sent++;
    assert.ok(sent <= 19, `sent ${sent}`);
  });
});

const PORT = 9700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;
before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-alerts-'));
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 300; i++) {
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
  rmSync(dataDir, { recursive: true, force: true });
});

describe('errors from the app', () => {
  const send = body => fetch(`${BASE}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('an error is taken, an empty one is not, and an address is held back after a few', async () => {
    assert.equal((await send({ message: 'TypeError: x is undefined', source: '/assets/index.js:12', page: '/' })).status, 204);
    assert.equal((await send({})).status, 400);
    let last = 204;
    for (let i = 0; i < 6; i++) last = (await send({ message: `e${i}` })).status;
    assert.equal(last, 429);
  });

  test('the admin sees where alerts go', async () => {
    const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' }) })).json()).token;
    const health = await (await fetch(`${BASE}/admin/health`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(typeof health.alerts.telegram, 'boolean');
    assert.ok(health.alerts.recent.some(a => a.title === 'Ошибка в приложении у пользователя'));
  });
});

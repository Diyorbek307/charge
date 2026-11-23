/**
 * Before the launch: only the ways to top up whose keys are set are offered to
 * drivers, and a real Payme cashbox (PAYME_TEST=false) counts as real money,
 * which ends the demo's free top-ups.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9300 + Math.floor(Math.random() * 90);
const dataDir = mkdtempSync(join(tmpdir(), 'oc-prov-'));
let server;

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

test('with no demo money, only Payme (its cashbox keys set) is offered; Click, Uzum and Humo without keys are not', async () => {
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DATABASE_URL: '', DEMO_SIMULATION: 'false', OSM_PLACES: 'false',
      DEMO_MODE: 'false', PAYME_CASHBOX_ID: 'cashbox-1', PAYME_CASHBOX_KEY: 'secret-1', PAYME_API_URL: 'http://127.0.0.1:9/api',
      PAYME_KEY: '', CLICK_SECRET_KEY: '', UZUM_SECRET: '', HUMO_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let state = null;
  for (let i = 0; i < 450 && !state; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/state`);
      if (r.ok) state = await r.json();
    } catch {
      /* not up yet */
    }
    if (!state) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(state, 'server did not start');
  assert.deepEqual(state.platform.topup.providers, ['payme']);
  assert.equal(state.platform.preview, false, 'no play money');
});

test('a Payme cashbox key is real money only with PAYME_TEST=false', () => {
  const keys = env => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', "import('./server/money.js').then(m => console.log(JSON.stringify(m.realPaymentKeys())))"], {
    env: { ...process.env, PAYME_KEY: '', CLICK_SECRET_KEY: '', UZUM_SECRET: '', HUMO_SECRET: '', PAYNET_PASSWORD: '', ...env },
  }).toString());
  assert.deepEqual(keys({ PAYME_CASHBOX_KEY: 'k', PAYME_TEST: '' }), []);
  assert.deepEqual(keys({ PAYME_CASHBOX_KEY: 'k', PAYME_TEST: 'false' }), ['PAYME_CASHBOX_KEY']);
});

test('with real money on, the demo networks are never shown as owed money (no "overdue payout" alarms)', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' }) });
  const token = (await r.json()).token;
  assert.ok(token, 'admin signs in on a test server');
  const a = await (await fetch(`http://127.0.0.1:${PORT}/api/analytics?days=120`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.ok(Array.isArray(a.invoices) && a.invoices.length > 0, 'the demo networks have statements');
  assert.deepEqual(a.invoices.filter(i => i.status === 'overdue').map(i => `${i.operator} ${i.month}`), []);
});

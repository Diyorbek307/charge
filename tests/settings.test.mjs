/**
 * Platform control: the admin changes numbers and switches at run time.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10600 + Math.floor(Math.random() * 90);
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
const admin = () => login('admin', 'admin@powergo.uz', 'Admin2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-settings-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', OSM_PLACES: 'false' },
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

const put = async (changes, token) => call('/admin/settings', { method: 'PUT', token: token ?? (await admin()), body: { changes } });

describe('platform control', () => {
  test('only the admin sees and changes the settings, within their limits', async () => {
    assert.equal((await call('/admin/settings', { token: await driver() })).status, 403);
    const view = (await call('/admin/settings', { token: await admin() })).data;
    assert.ok(view.items.length > 40);
    assert.ok(view.items.some(i => i.key === 'feature.plus' && i.value === true));
    assert.equal((await put({ 'booking.fee': -5 })).status, 400);
    assert.equal((await put({ 'no.such': 1 })).status, 400);
    assert.equal((await put({ 'topup.min': 50_000, 'topup.max': 20_000 })).status, 400);
    assert.equal((await put({ 'fleet.tiers': [{ kwh: 100, pct: 5 }] })).status, 400, 'the first tier starts at 0');
  });

  test('a changed fee applies to the next booking and is logged', async () => {
    const r = await put({ 'booking.fee': 3500 });
    assert.equal(r.status, 200);
    assert.ok(r.data.log.some(l => l.key === 'booking.fee' && l.to === 3500 && l.from === 2000));
    const token = await driver();
    const s = (await call('/state', { token })).data;
    assert.equal(s.platform.booking.fee, 3500);
    const st = s.stations.find(x => !x.ocpi && x.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const b = await call(`/stations/${st.id}/bookings`, { method: 'POST', token, body: { connectorId: c.id, startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(), minutes: 30 } });
    assert.equal(b.status, 200, JSON.stringify(b.data));
    assert.equal(b.data.booking.fee, 3500);
    // Back to the default.
    await put({ 'booking.fee': null });
    assert.equal((await call('/state', { token })).data.platform.booking.fee, 2000);
  });

  test('a feature switched off disappears for drivers and its route refuses', async () => {
    await put({ 'feature.plus': false, 'feature.battery': false });
    const token = await driver();
    const s = (await call('/state', { token })).data;
    assert.equal(s.platform.features.plus, false);
    assert.equal((await call('/plus', { method: 'POST', token })).status, 403);
    assert.equal((await call('/battery', { token })).status, 403);
    await put({ 'feature.plus': true, 'feature.battery': true });
    assert.equal((await call('/battery', { token })).status, 200);
  });

  test('the car bonus follows its setting, and a payment provider can be switched off', async () => {
    await put({ 'rewards.carBonus': 70_000, 'payments.humo': false });
    const token = await driver();
    const saved = await call('/me/car', { method: 'PUT', token, body: { brand: 'Kia', model: 'EV6', year: 2025, battery: 77, port: 'CCS2', maxKw: 200, chargeLimit: 80 } });
    assert.ok(saved.data.granted.some(g => g.kind === 'car' && g.amount === 70_000));
    assert.equal((await call('/payments/topup', { method: 'POST', token, body: { provider: 'humo', amount: 10000 } })).status, 503);
    assert.ok(!(await call('/state', { token })).data.platform.topup.providers.includes('humo'));
    // The admin can also give a bonus by hand, with a reason the driver sees.
    const gift = await call('/admin/bonus', { method: 'POST', token: await admin(), body: { phone: '+998901234567', amount: 15000, reason: 'Извините за сбой станции' } });
    assert.equal(gift.status, 200, JSON.stringify(gift.data));
    const programs = (await call('/admin/programs', { token: await admin() })).data;
    assert.ok(programs.rewards.recent.some(g => g.manual && g.amount === 15000));
  });
});

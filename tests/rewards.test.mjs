/**
 * Voli's own rewards: the car bonus, milestones, and paying a charge with the bonus.
 */
import { readFileSync } from 'node:fs';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9900 + Math.floor(Math.random() * 90);
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-rewards-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', CAR_BONUS_UZS: '50000', PASSPORT_BONUS_UZS: '50000' },
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

describe('Voli rewards', () => {
  test('telling us about the car grants 50 000 sum once, as a bonus that burns', async () => {
    const token = await driver();
    const before = (await call('/rewards', { token })).data;
    const carBefore = before.achievements.find(a => a.id === 'car');
    assert.equal(carBefore.amount, 50_000);
    assert.equal(carBefore.grantedAt, null);
    const car = { brand: 'BYD', model: 'Song Plus', year: 2025, battery: 72, port: 'CCS2', maxKw: 110, chargeLimit: 80 };
    const saved = await call('/me/car', { method: 'PUT', token, body: car });
    assert.equal(saved.status, 200);
    assert.ok(saved.data.granted.some(g => g.kind === 'car' && g.amount === 50_000));
    const after = (await call('/rewards', { token })).data;
    assert.ok(after.achievements.find(a => a.id === 'car').grantedAt);
    assert.equal(after.bonus.balance - before.bonus.balance, 50_000);
    assert.ok(Date.parse(after.bonus.nextExpiry) > Date.now() + 50 * 86400_000);
    // Saving the car again grants nothing more.
    const again = await call('/me/car', { method: 'PUT', token, body: { ...car, model: 'Seal' } });
    assert.equal(again.data.granted.length, 0);
    assert.equal((await call('/rewards', { token })).data.bonus.balance, after.bonus.balance);
    // The driver's own state carries the rewards.
    assert.equal((await call('/state', { token })).data.rewards.bonus.balance, after.bonus.balance);
  });

  test('a charge is paid from the bonus first, the wallet the rest', async () => {
    const token = await driver();
    const state = (await call('/state', { token })).data;
    const wallet = state.wallets['acc-driver'].balance;
    const bonus = state.rewards.bonus.balance;
    assert.ok(bonus > 0);
    const st = state.stations.find(s => !s.ocpi && s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const start = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const stop = await call(`/sessions/${start.data.session.id}/stop`, { method: 'POST', token });
    assert.equal(stop.status, 200, JSON.stringify(stop.data));
    const cost = stop.data.session.cost;
    const used = Math.min(cost, bonus);
    const next = (await call('/state', { token })).data;
    // The charge itself may reach a milestone (a night charge, the tenth): its bonus is new money on top.
    const fresh = next.rewards.achievements.filter(x => x.grantedAt && !state.rewards.achievements.find(y => y.id === x.id)?.grantedAt).reduce((n, x) => n + x.amount, 0);
    // The demo driver has a paid top-up, so this charge also earns the bonus per kWh.
    const perKwh = Math.round(stop.data.session.energy * state.rewards.topup.perKwh);
    assert.equal(next.rewards.bonus.balance, bonus - used + fresh + perKwh);
    assert.equal(next.wallets['acc-driver'].balance, wallet - (cost - used));
    assert.equal(next.transactions.find(t => t.sessionId === start.data.session.id).bonus ?? 0, used);
  });

  test('the bonus per kWh comes only after a paid top-up, on the first charges', async () => {
    const phone = '+998935554077';
    const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
    const reg = await call('/auth/register', { method: 'POST', body: { phone, code, name: 'Aziz Karimov', password: 'Topup2026x', consent: { version: 1 } } });
    assert.equal(reg.status, 201);
    const token = reg.data.token;
    const charge = async () => {
      const state = (await call('/state', { token })).data;
      const st = state.stations.find(s => !s.ocpi && s.connectors.some(c => c.status === 'available' && c.power >= 50));
      const c = st.connectors.find(x => x.status === 'available' && x.power >= 50);
      const start = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
      assert.equal(start.status, 200, JSON.stringify(start.data));
      const stop = await call(`/sessions/${start.data.session.id}/stop`, { method: 'POST', token });
      assert.equal(stop.status, 200, JSON.stringify(stop.data));
      return stop.data.session;
    };

    const before = (await call('/rewards', { token })).data.topup;
    assert.equal(before.perKwh, 50);
    assert.equal(before.charges, 5);
    assert.equal(before.toppedUp, false);
    assert.equal(before.left, 5);

    const order = (await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 50000 } })).data.order;
    await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token });
    assert.equal((await call('/rewards', { token })).data.topup.toppedUp, true);

    const session = await charge();
    assert.ok(session.energy > 0);
    const after = (await call('/rewards', { token })).data.topup;
    assert.equal(after.left, 4, 'one of the five is used');
  });

  test('no gift for the car or the passport while their amount is 0, and taxis stop at -5%', async () => {
    const source = readFileSync('server/settings.js', 'utf8');
    assert.match(source, /n\('CAR_BONUS_UZS', 0\)/);
    assert.match(source, /n\('PASSPORT_BONUS_UZS', 0\)/);
    assert.match(source, /key: 'fleet\.tiers'.*def: \[\{ kwh: 0, pct: 3 \}, \{ kwh: 500, pct: 5 \}\]/);
  });
});

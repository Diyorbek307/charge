/**
 * Bring a friend: a code per driver, sign-up by it, the welcome bonus on the
 * friend's first paid charge, the inviter's share of every paid charge, the
 * monthly cap, and what cannot be gamed.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 7500 + Math.floor(Math.random() * 300);
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
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;

async function newDriver(phone, name, ref) {
  const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
  const r = await call('/auth/register', { method: 'POST', body: { phone, code, name, password: 'Friend2026', consent: { version: 1 }, ...(ref ? { ref } : {}) } });
  assert.equal(r.status, 201);
  return { token: r.data.token, id: r.data.user.id };
}
/** Tops up, charges at a free connector of our own network and stops; returns the finished charge. */
async function charge(token) {
  const order = (await call('/payments/topup', { method: 'POST', token, body: { provider: 'payme', amount: 500000 } })).data.order;
  await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token });
  const st = (await call('/state', { token })).data.stations.find(s => !s.ocpi && !s.private && !s.direct && s.connectors.some(c => c.status === 'available'));
  const c = st.connectors.find(x => x.status === 'available');
  const started = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
  assert.ok(started.status < 300, JSON.stringify(started.data));
  const stopped = await call(`/sessions/${started.data.session.id}/stop`, { method: 'POST', token });
  return stopped.data.session;
}
const bonus = async token => (await call('/state', { token })).data.rewards.bonus.balance;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-ref-'));
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

describe('bring a friend', () => {
  test('a friend who signs up by the code brings a welcome bonus and the inviter a share of each paid charge', async () => {
    const inviter = await newDriver('+998935552001', 'Aziz Rahimov');
    const me = (await call('/me/referral', { token: inviter.token })).data;
    assert.match(me.code, /^[A-Z2-9]{6}$/);
    assert.equal((await call('/me/referral', { token: inviter.token })).data.code, me.code, 'the code stays the same');
    assert.equal(me.friends.length, 0);

    const friend = await newDriver('+998935552002', 'Dilnoza Yusupova', me.code.toLowerCase());
    assert.equal((await call('/me/referral', { token: friend.token })).data.invitedBy, true);
    const before = await bonus(inviter.token);

    const first = await charge(friend.token);
    assert.ok(first.cost > 0);
    const share = Math.round((first.cost * me.percent) / 100);
    assert.equal(await bonus(inviter.token), before + share, 'the inviter earns their share');
    const friendBonus = await bonus(friend.token);
    assert.ok(friendBonus >= me.friendBonus, 'the friend gets the welcome bonus');

    const second = await charge(friend.token);
    assert.equal(await bonus(inviter.token), before + share + Math.round((second.cost * me.percent) / 100), 'every paid charge counts');
    assert.ok((await bonus(friend.token)) <= friendBonus, 'the welcome bonus comes once');

    const after = (await call('/me/referral', { token: inviter.token })).data;
    assert.equal(after.friends.length, 1);
    assert.equal(after.friends[0].name, 'Dilnoza Y.', 'the inviter sees a first name and an initial');
    assert.equal(after.friends[0].charges, 2);
    assert.equal(after.earnedTotal, after.friends[0].earned);
  });

  test('no inviting oneself, no unknown codes, no second inviter, and the month has a cap', async () => {
    const a = await newDriver('+998935552011', 'Bekzod Aliev');
    const code = (await call('/me/referral', { token: a.token })).data.code;
    const stranger = await newDriver('+998935552012', 'Kamola Saidova', 'NOSUCH');
    assert.equal((await call('/me/referral', { token: stranger.token })).data.invitedBy, false, 'an unknown code is ignored, not refused');

    // The admin caps the inviter's month low: the share stops there.
    const adminToken = await login('admin', 'admin@voli.uz', 'Admin2026');
    assert.equal((await call('/admin/settings', { method: 'PUT', token: adminToken, body: { changes: { 'referral.monthCap': 1000 } } })).status, 200);
    const friend = await newDriver('+998935552013', 'Sardor Tursunov', code);
    await charge(friend.token);
    await charge(friend.token);
    assert.ok((await call('/me/referral', { token: a.token })).data.earnedMonth <= 1000);

    // Switched off: a new sign-up with the code is not tied to anyone.
    await call('/admin/settings', { method: 'PUT', token: adminToken, body: { changes: { 'feature.referral': false } } });
    const late = await newDriver('+998935552014', 'Nodira Karimova', code);
    assert.equal((await call('/me/referral', { token: late.token })).data.invitedBy, false);
    await call('/admin/settings', { method: 'PUT', token: adminToken, body: { changes: { 'feature.referral': true, 'referral.monthCap': 300000 } } });
  });
});

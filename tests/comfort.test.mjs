/**
 * Everyday comfort: how to find a station and its photo, sharing a running
 * charge by link, and the support chat.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 9700 + Math.floor(Math.random() * 200);
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
const operator = () => login('operator', 'operator@greencharge.uz', 'Operator2026');
const admin = () => login('admin', 'admin@voli.uz', 'Admin2026');
const jpeg = () => `data:image/jpeg;base64,${crypto.randomBytes(3000).toString('base64')}`;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-comfort-'));
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

describe('everyday comfort', () => {
  test('a network describes how to find its station, with a photo', async () => {
    const op = await operator();
    const state = (await call('/state', { token: op })).data;
    const mine = state.stations.find(s => s.operatorId === 'op-001');
    const other = (await call('/state', { token: await admin() })).data.stations.find(s => s.operatorId === 'op-002');
    assert.equal((await call(`/stations/${other.id}/info`, { method: 'PATCH', token: op, body: { findHint: 'x' } })).status, 403);
    assert.equal((await call(`/stations/${mine.id}/info`, { method: 'PATCH', token: op, body: { hours: '25 часов' } })).status, 400);
    assert.equal((await call(`/stations/${mine.id}/info`, { method: 'PATCH', token: op, body: { amenities: ['Бассейн'] } })).status, 400);
    const r = await call(`/stations/${mine.id}/info`, { method: 'PATCH', token: op, body: { findHint: 'Паркинг −1, у лифта B', hours: '08:00–22:00', amenities: ['Кафе', 'Крытая парковка'], photo: jpeg() } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const st = (await call('/state', { token: await driver() })).data.stations.find(s => s.id === mine.id);
    assert.equal(st.findHint, 'Паркинг −1, у лифта B');
    assert.deepEqual(st.amenities, ['Кафе', 'Крытая парковка']);
    assert.ok(st.photoAt && !('photo' in st), 'the photo itself travels with the station data');
    const photo = await fetch(`${BASE}/stations/${mine.id}/photo`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  });

  test('a shared charge shows progress, never who or how much', async () => {
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(s => !s.id.startsWith('st-00') && s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const s = (await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id, goal: { kind: 'km', value: 100 } } })).data.session;
    const share = await call(`/sessions/${s.id}/share`, { method: 'POST', token });
    assert.equal(share.status, 200);
    assert.equal((await call(`/sessions/${s.id}/share`, { method: 'POST', token: await login('driver', '+998935558001', 'x').catch(() => null) })).status, 401);
    const view = (await call(`/share/${share.data.token}`)).data;
    assert.equal(view.status, 'active');
    assert.equal(view.station, st.name);
    assert.ok(view.readyAt, 'no ready-by time for a charge with a goal');
    const text = JSON.stringify(view);
    for (const secret of ['Alisher', 'cost', 'price', 'userId', '+998']) assert.ok(!text.includes(secret), `the shared view shows ${secret}`);
    assert.equal((await call('/share/nope')).status, 404);
    await call(`/sessions/${s.id}/stop`, { method: 'POST', token });
  });

  test('support chat: the driver writes with a photo, support answers, both see it', async () => {
    const token = await driver();
    assert.equal((await call('/support/messages', { method: 'POST', token, body: {} })).status, 400);
    const sent = await call('/support/messages', { method: 'POST', token, body: { text: 'Станция не запускается, на экране ошибка', image: jpeg() } });
    assert.equal(sent.status, 201);
    const adm = await admin();
    const list = (await call('/admin/support', { token: adm })).data;
    const thread = list.find(t => t.userId === 'acc-driver');
    assert.equal(thread.unreadAdmin, 1);
    assert.ok(thread.messages[0].image);
    assert.equal((await call('/admin/support', { token })).status, 403);
    const answered = await call(`/admin/support/${thread.id}`, { method: 'POST', token: adm, body: { text: 'Перезапустили станцию — попробуйте ещё раз' } });
    assert.equal(answered.status, 200);
    const mine = (await call('/support/messages', { token })).data;
    assert.equal(mine.messages.length, 2);
    assert.equal(mine.messages[1].from, 'support');
    assert.equal((await call('/support/messages', { token })).data.unreadUser, 0);
    assert.ok((await call('/notifications', { token })).data.some(e => e.type === 'support.message'));
  });
});

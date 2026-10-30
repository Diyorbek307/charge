/**
 * Security: headers, password guessing, and one account reaching into another.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10700 + Math.floor(Math.random() * 90);
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
const admin = () => login('admin', 'admin@voli.uz', 'Admin2026');
const operator = () => login('operator', 'operator@greencharge.uz', 'Operator2026');
const partner = () => login('api', 'partner@voli.uz', 'Partner2026');
const fleet = () => login('business', 'fleet@uzauto.uz', 'Business2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-security-'));
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

describe('security', () => {
  test('every page carries the security headers', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.match(res.headers.get('content-security-policy') ?? '', /object-src 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(res.headers.get('permissions-policy')?.includes('camera=(self)'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('the health check says where data is kept and that it is being saved, and nothing else', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.storage, 'file');
    assert.deepEqual(Object.keys(body).sort(), ['status', 'storage', 'time']);
  });

  test("nobody moves another driver's meter", async () => {
    const token = await driver();
    const st = (await call('/state', { token })).data.stations.find(s => !s.ocpi && s.operatorId !== 'op-001' && s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const start = await call('/sessions/start', { method: 'POST', token, body: { stationId: st.id, connectorId: c.id } });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const id = start.data.session.id;
    assert.equal((await call(`/sessions/${id}/tick`, { method: 'POST', token: await fleet() })).status, 404, 'a fleet ticking a private charge');
    assert.equal((await call(`/sessions/${id}/tick`, { method: 'POST', token: await partner() })).status, 404, 'a partner ticking it');
    assert.equal((await call(`/sessions/${id}/tick`, { method: 'POST', token })).status, 200, 'the driver may');
    await call(`/sessions/${id}/stop`, { method: 'POST', token });
  });

  test("an operator cannot close another network's alert", async () => {
    const alerts = (await call('/state', { token: await admin() })).data.alerts;
    const foreign = alerts.find(a => a.operatorId && a.operatorId !== 'op-001' && !a.ack);
    assert.ok(foreign, 'no alert of another network in the demo');
    assert.equal((await call(`/alerts/${foreign.id}/ack`, { method: 'POST', token: await operator() })).status, 404);
  });

  test("a partner sees and changes only its own webhooks", async () => {
    const made = await call('/webhooks', { method: 'POST', token: await admin(), body: { url: 'https://example.com/voli-hook', events: ['session.start'] } });
    assert.ok([200, 201].includes(made.status), JSON.stringify(made.data));
    const id = made.data.webhook.id;
    const key = await partner();
    assert.ok(!(await call('/webhooks', { token: key })).data.some(w => w.id === id));
    assert.equal((await call(`/webhooks/${id}/toggle`, { method: 'POST', token: key })).status, 404);
    assert.equal((await call(`/webhooks/${id}`, { method: 'DELETE', token: key })).status, 404);
    assert.equal((await call(`/webhooks/${id}/test`, { method: 'POST', token: key })).status, 404);
  });
  // Last: it locks the operator's login for the rest of the run.
  test('guessing a password is stopped after eight wrong tries, even with the right one', async () => {
    const body = p => ({ method: 'POST', body: { portal: 'operator', login: 'operator@greencharge.uz', password: p } });
    for (let i = 0; i < 8; i++) assert.equal((await call('/auth/login', body(`wrong-${i}`))).status, 401);
    const locked = await call('/auth/login', body('Operator2026'));
    assert.equal(locked.status, 429);
    // An unknown login answers like a wrong password, not "no such user".
    const unknown = await call('/auth/login', { method: 'POST', body: { portal: 'admin', login: 'nobody@voli.uz', password: 'whatever' } });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.data.error, 'Неверный логин или пароль');
  });

});

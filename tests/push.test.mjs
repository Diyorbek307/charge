/**
 * Web Push delivery, against a local stand-in for a browser push service.
 * The server encrypts and signs for real; the stand-in records what arrives.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 6200 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;
let pushService;
let pushPort;
const received = [];

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const CREDS = {
  driver: ['+998901234567', 'Driver2026'],
  business: ['fleet@uzauto.uz', 'Business2026'],
  admin: ['admin@onecharge.uz', 'Admin2026'],
  operator: ['operator@greencharge.uz', 'Operator2026'],
};
const login = async portal =>
  (await call('/auth/login', { method: 'POST', body: { portal, login: CREDS[portal][0], password: CREDS[portal][1] } })).data.token;

/** A browser-shaped subscription with real P-256 keys pointing at the stand-in. */
function subscription(path) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `http://127.0.0.1:${pushPort}/push/${path}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
}

async function waitFor(fn, what, ms = 4000) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

before(async () => {
  pushService = createServer((req, res) => {
    let size = 0;
    req.on('data', c => (size += c.length));
    req.on('end', () => {
      received.push({ path: req.url, headers: req.headers, size });
      res.writeHead(req.url.endsWith('/gone') ? 410 : 201).end();
    });
  });
  await new Promise(r => pushService.listen(0, '127.0.0.1', r));
  pushPort = pushService.address().port;

  dataDir = mkdtempSync(join(tmpdir(), 'oc-push-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, PUSH_ALLOW_HOSTS: `127.0.0.1:${pushPort}`, PUSH_ALLOW_HTTP: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitFor(async () => {
    try {
      return (await fetch(`${BASE}/state`)).ok;
    } catch {
      return false;
    }
  }, 'server', 15000);
});

after(() => {
  server?.kill();
  pushService?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('push subscriptions', () => {
  test('exposes a VAPID public key', async () => {
    const { data } = await call('/push/vapid-key');
    assert.match(data.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  });

  test('refuses endpoints that are not browser push services', async () => {
    const token = await login('driver');
    const good = subscription('x');
    for (const endpoint of ['https://evil.example.com/steal', 'http://127.0.0.2:8080/x', 'https://fcm.googleapis.com.evil.com/x', 'file:///etc/passwd']) {
      const r = await call('/push/subscribe', { method: 'POST', token, body: { ...good, endpoint } });
      assert.equal(r.status, 400, endpoint);
    }
    assert.equal((await call('/push/subscribe', { method: 'POST', body: good })).status, 401);
  });

  test('a test push arrives encrypted and VAPID-signed', async () => {
    const token = await login('driver');
    assert.equal((await call('/push/subscribe', { method: 'POST', token, body: subscription('driver-test') })).status, 200);
    const r = await call('/push/test', { method: 'POST', token });
    assert.equal(r.data.sent, 1);
    const hit = received.find(x => x.path === '/push/driver-test');
    assert.ok(hit, 'nothing reached the push service');
    assert.equal(hit.headers['content-encoding'], 'aes128gcm');
    assert.match(hit.headers.authorization, /^vapid t=.+, k=.+/);
    assert.ok(hit.size > 0);
  });

  test('a subscription the push service reports gone is removed', async () => {
    const token = await login('business');
    await call('/push/subscribe', { method: 'POST', token, body: subscription('gone') });
    assert.equal((await call('/push/status', { token })).data.subscriptions, 1);
    await call('/push/test', { method: 'POST', token });
    assert.equal((await call('/push/status', { token })).data.subscriptions, 0);
  });
});

describe('event notifications', () => {
  test('the driver at the head of a queue is notified', async () => {
    const admin = await login('admin');
    await call('/admin/reset', { method: 'POST', token: admin });
    const driver = await login('driver');
    const biz = await login('business');
    const admin2 = await login('admin');
    await call('/push/subscribe', { method: 'POST', token: driver, body: subscription('driver-queue') });

    const a = await call('/sessions/start', { method: 'POST', token: biz, body: { stationId: 'st-003', connectorId: 'c8' } });
    const b = await call('/sessions/start', { method: 'POST', token: admin2, body: { stationId: 'st-003', connectorId: 'c9' } });
    assert.equal((await call('/stations/st-003/queue', { method: 'POST', token: driver })).status, 200);

    await call(`/sessions/${a.data.session.id}/stop`, { method: 'POST', token: biz });
    await waitFor(() => received.some(x => x.path === '/push/driver-queue'), 'queue push');

    await call(`/sessions/${b.data.session.id}/stop`, { method: 'POST', token: admin2 });
  });

  test("an operator is notified of a driver's report on its own network, not another's", async () => {
    const admin = await login('admin');
    await call('/admin/reset', { method: 'POST', token: admin });
    const operator = await login('operator'); // op-001
    await call('/push/subscribe', { method: 'POST', token: operator, body: subscription('operator-alerts') });
    const driver = await login('driver');

    await call('/stations/st-002/issues', { method: 'POST', token: driver, body: { category: 'Коннектор не работает' } }); // op-002
    await new Promise(r => setTimeout(r, 400));
    assert.ok(!received.some(x => x.path === '/push/operator-alerts'), "operator notified about a competitor's station");

    await call('/stations/st-001/issues', { method: 'POST', token: driver, body: { category: 'Коннектор не работает' } }); // op-001
    await waitFor(() => received.some(x => x.path === '/push/operator-alerts'), 'operator push');
  });
});

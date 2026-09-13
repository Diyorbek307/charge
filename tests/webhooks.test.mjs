/**
 * Outbound webhook delivery against a local receiver: signatures, retries,
 * permanent failures, and the address checks that keep it from reaching
 * inward.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const PORT = 5600 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;
let receiver;
let receiverPort;
const hits = [];
const flakyCount = new Map();

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const partner = async () =>
  (await call('/auth/login', { method: 'POST', body: { portal: 'api', login: 'partner@onecharge.uz', password: 'Partner2026' } })).data.token;

async function waitFor(fn, what, ms = 8000) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 60));
  }
}

async function register(token, path) {
  const r = await call('/webhooks', {
    method: 'POST',
    token,
    body: { url: `http://127.0.0.1:${receiverPort}${path}`, events: ['session.start'] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.webhook;
}

const deliveryFor = async (token, hookId) =>
  (await call('/webhooks/deliveries?limit=100', { token })).data.find(d => d.webhookId === hookId);

before(async () => {
  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      hits.push({ path: req.url, headers: req.headers, body });
      if (req.url.startsWith('/flaky')) {
        const n = (flakyCount.get(req.url) ?? 0) + 1;
        flakyCount.set(req.url, n);
        return res.writeHead(n < 3 ? 503 : 200).end('ok');
      }
      if (req.url.startsWith('/down')) return res.writeHead(503).end();
      if (req.url.startsWith('/reject')) return res.writeHead(400).end('bad');
      if (req.url.startsWith('/redirect')) return res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }).end();
      res.writeHead(204).end();
    });
  });
  await new Promise(r => receiver.listen(0, '127.0.0.1', r));
  receiverPort = receiver.address().port;

  dataDir = mkdtempSync(join(tmpdir(), 'oc-webhooks-'));
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      WEBHOOK_ALLOW_HOSTS: `127.0.0.1:${receiverPort}`,
      WEBHOOK_ALLOW_HTTP: 'true',
      // 30 s backoff becomes 30 ms.
      WEBHOOK_BACKOFF_SCALE: '0.001',
    },
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
  receiver?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('webhook delivery', () => {
  test('a signed event reaches the partner and verifies with the secret', async () => {
    const token = await partner();
    const hook = await register(token, '/ok');
    assert.equal((await call(`/webhooks/${hook.id}/test`, { method: 'POST', token })).status, 200);

    const hit = await waitFor(() => hits.find(h => h.path === '/ok'), 'delivery');
    const [, ts, v1] = hit.headers['x-onecharge-signature'].match(/t=(\d+),v1=([a-f0-9]+)/);
    assert.equal(v1, crypto.createHmac('sha256', hook.secret).update(`${ts}.${hit.body}`).digest('hex'));
    assert.ok(Math.abs(Date.now() / 1000 - Number(ts)) < 30);
    assert.equal(JSON.parse(hit.body).type, 'session.start');

    const d = await waitFor(async () => {
      const x = await deliveryFor(token, hook.id);
      return x?.status === 'delivered' && x;
    }, 'delivered status');
    assert.equal(d.responseStatus, 204);
    assert.equal(d.attempts, 1);

    // The test button cannot be hammered.
    assert.equal((await call(`/webhooks/${hook.id}/test`, { method: 'POST', token })).status, 429);
  });

  test('server errors are retried with backoff until they succeed', async () => {
    const token = await partner();
    const hook = await register(token, '/flaky-1');
    await call(`/webhooks/${hook.id}/test`, { method: 'POST', token });
    const d = await waitFor(async () => {
      const x = await deliveryFor(token, hook.id);
      return x?.status === 'delivered' && x;
    }, 'eventual delivery');
    assert.equal(d.attempts, 3);
    assert.equal(flakyCount.get('/flaky-1'), 3);
  });

  test('a 4xx is a permanent rejection, and a failed delivery can be retried by hand', async () => {
    const token = await partner();
    const hook = await register(token, '/reject');
    await call(`/webhooks/${hook.id}/test`, { method: 'POST', token });
    const d = await waitFor(async () => {
      const x = await deliveryFor(token, hook.id);
      return x?.status === 'failed' && x;
    }, 'failed status');
    assert.equal(d.attempts, 1);
    assert.equal(d.lastError, 'HTTP 400');

    const before = hits.filter(h => h.path === '/reject').length;
    assert.equal((await call(`/webhooks/deliveries/${d.id}/retry`, { method: 'POST', token })).status, 200);
    await waitFor(() => hits.filter(h => h.path === '/reject').length > before, 'manual retry');
  });

  test('redirects are not followed', async () => {
    const token = await partner();
    const hook = await register(token, '/redirect');
    await call(`/webhooks/${hook.id}/test`, { method: 'POST', token });
    const d = await waitFor(async () => {
      const x = await deliveryFor(token, hook.id);
      return x?.responseStatus && x;
    }, 'attempt result');
    assert.equal(d.responseStatus, 302);
    assert.notEqual(d.status, 'delivered');
  });

  test('deleting a webhook cancels what is still queued for it', async () => {
    const token = await partner();
    const hook = await register(token, '/down');
    await call(`/webhooks/${hook.id}/test`, { method: 'POST', token });
    await waitFor(() => hits.some(h => h.path === '/down'), 'first attempt');
    await call(`/webhooks/${hook.id}`, { method: 'DELETE', token });
    const d = await waitFor(async () => {
      const x = await deliveryFor(token, hook.id);
      return ['cancelled', 'delivered'].includes(x?.status) && x;
    }, 'settled');
    assert.equal(d.status, 'cancelled');
  });
});

describe('endpoint registration', () => {
  test('refuses destinations that point inward', async () => {
    const token = await partner();
    for (const url of [
      'http://partner.example.uz/h',
      'https://localhost/h',
      'https://127.0.0.1/h',
      'https://10.1.2.3/h',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/h',
      'https://[::ffff:127.0.0.1]/h',
      'https://192.168.1.10/h',
      'https://metadata.internal/h',
      'https://intranet/h',
      'https://partner.example.uz:8443/h',
      'https://user:pass@partner.example.uz/h',
    ]) {
      const r = await call('/webhooks', { method: 'POST', token, body: { url, events: ['session.start'] } });
      assert.equal(r.status, 400, url);
    }
    const ok = await call('/webhooks', { method: 'POST', token, body: { url: 'https://partner.example.uz/h', events: ['session.start'] } });
    assert.equal(ok.status, 200);
  });
});

describe('address classification', () => {
  test('only public unicast addresses pass', async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'oc-webhooks-unit-'));
    const { isPublicAddress } = await import('../server/webhooks.js');
    for (const ip of ['8.8.8.8', '1.1.1.1', '2a00:1450:4001:80b::200e', '213.230.64.1']) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
    for (const ip of [
      '127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1',
      '64:ff9b::a00:1', '2001:db8::1', 'not-an-ip',
    ]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });
});

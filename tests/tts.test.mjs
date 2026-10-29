/**
 * The navigator's neural voice: phrases are synthesised once and cached,
 * only for signed-in drivers, within limits.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9300 + Math.floor(Math.random() * 200);
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
const admin = () => login('admin', 'admin@powergo.uz', 'Admin2026');

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-tts-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', TTS_PROVIDER: 'mock' },
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

describe('navigator voice', () => {
  test('the status names the provider and its voices', async () => {
    const r = await call('/tts/status');
    assert.equal(r.data.provider, 'mock');
    assert.ok(r.data.voices.ru);
  });

  test('a driver gets audio, the same phrase the second time from the cache', async () => {
    const token = await driver();
    const q = `/tts?lang=ru&text=${encodeURIComponent('Через 300 метров поверните направо')}`;
    const res1 = await fetch(`${BASE}${q}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('content-type'), 'audio/mpeg');
    assert.equal(res1.headers.get('x-tts-cache'), 'miss');
    const res2 = await fetch(`${BASE}${q}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res2.headers.get('x-tts-cache'), 'hit');
  });

  test('no audio without sign-in, for an unknown language or a long text', async () => {
    const token = await driver();
    assert.equal((await call('/tts?lang=ru&text=x')).status, 401);
    assert.equal((await call('/tts?lang=de&text=x', { token })).status, 400);
    assert.equal((await call(`/tts?lang=ru&text=${'а'.repeat(301)}`, { token })).status, 400);
  });
});

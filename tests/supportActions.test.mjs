/**
 * What support does for a person: reset a password, rename, a bonus,
 * block, delete — each only by the admin.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const PORT = 9900 + Math.floor(Math.random() * 300);
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

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-supact-'));
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

const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data;

test('support resets passwords, renames, gives a bonus, blocks and deletes', async () => {
  const admin = (await login('admin', 'admin@voli.uz', 'Admin2026')).token;
  const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  const opId = op.user?.id ?? op.account?.id;

  // Staff: a temporary password, shown once; the old one stops working.
  const reset = (await call(`/admin/accounts/${opId}/reset-password`, { method: 'POST', token: admin, body: {} })).data;
  assert.ok(reset.temporary?.length >= 10);
  assert.equal((await call('/auth/login', { method: 'POST', body: { portal: 'operator', login: 'operator@greencharge.uz', password: 'Operator2026' } })).status, 401);
  assert.ok((await login('operator', 'operator@greencharge.uz', reset.temporary)).token);
  // Its old session was signed out.
  assert.equal((await call('/analytics?days=30', { token: op.token })).status, 401);

  const driver = await login('driver', '+998901234567', 'Driver2026');
  const dId = driver.user?.id ?? driver.account?.id;
  assert.equal((await call(`/admin/accounts/${dId}/name`, { method: 'POST', token: admin, body: { name: 'Alisher T.' } })).status, 200);
  assert.equal((await call('/admin/bonus', { method: 'POST', token: admin, body: { userId: dId, amount: 20000, reason: 'Извините за неудобство' } })).status, 200);
  // Money left on the wallet: deleting waits until it is refunded.
  assert.equal((await call(`/admin/accounts/${dId}/delete`, { method: 'POST', token: admin, body: { confirm: 'УДАЛИТЬ' } })).status, 409);
  assert.equal((await call(`/admin/users/${dId}/status`, { method: 'POST', token: admin, body: { status: 'blocked' } })).status, 200);

  // A driver's reset: the next sign-in is by code.
  assert.equal((await call(`/admin/accounts/${dId}/reset-password`, { method: 'POST', token: admin, body: {} })).data.signIn, 'code');

  // Nobody but the admin.
  const biz = (await login('business', 'fleet@uzauto.uz', 'Business2026')).token;
  assert.equal((await call(`/admin/accounts/${dId}/name`, { method: 'POST', token: biz, body: { name: 'X' } })).status, 403);
});

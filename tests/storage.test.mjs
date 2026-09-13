/**
 * Storage durability: data written through the API must survive a restart.
 *
 * Runs the real server against PGlite — a genuine Postgres compiled to WASM —
 * stored in a temp directory, so the Postgres code path is exercised without a
 * database server or Docker.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'oc-pg-'));
const DATABASE_URL = `pglite://${dataDir.replace(/\\/g, '/')}`;

async function boot(port) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DATABASE_URL, DATA_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let log = '';
  child.stdout.on('data', d => (log += d));
  child.stderr.on('data', d => (log += d));
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${base}/state`)).ok) return { child, base, log: () => log };
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`server did not start:\n${log}`);
}

async function stop(child) {
  const exited = new Promise(r => child.once('exit', r));
  child.send('shutdown');
  await Promise.race([exited, new Promise(r => setTimeout(r, 8000))]);
}

async function json(base, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* PGlite may still hold files briefly on Windows */
  }
});

test('data and sessions survive a server restart on Postgres', async () => {
  const port = 5100 + Math.floor(Math.random() * 400);

  const first = await boot(port);
  assert.match(first.log(), /pglite/, 'server did not use the postgres store');
  const login = await json(first.base, '/auth/login', {
    method: 'POST',
    body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' },
  });
  const token = login.data.token;
  const before = (await json(first.base, '/state', { token })).data.wallets['acc-driver'].balance;
  assert.equal((await json(first.base, '/wallet/topup', { method: 'POST', token, body: { amount: 12345 } })).status, 200);
  await stop(first.child);

  const second = await boot(port + 1);
  const me = await json(second.base, '/auth/me', { token });
  assert.equal(me.status, 200, 'token did not survive the restart');
  const after = (await json(second.base, '/state', { token })).data.wallets['acc-driver'].balance;
  assert.equal(after, before + 12345, 'top-up was lost across the restart');
  await stop(second.child);
});

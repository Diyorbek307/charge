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
    env: { ...process.env, DEMO_SIMULATION: 'false', PORT: String(port), DATABASE_URL, DATA_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let log = '';
  child.stdout.on('data', d => (log += d));
  child.stderr.on('data', d => (log += d));
  const base = `http://127.0.0.1:${port}/api`;
  // PGlite starts slowly when the whole suite is running: up to 45 s, like the other suites.
  for (let i = 0; i < 450; i++) {
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

test('a database still in the old jsonb format is read, then saved gzipped', async () => {
  const port = 5600 + Math.floor(Math.random() * 300);
  const { PGlite } = await import('@electric-sql/pglite');
  const zlib = await import('node:zlib');

  // Turn the store back into the old format: only the jsonb row, no gzipped one.
  let pg = new PGlite(dataDir);
  const { rows } = await pg.query('SELECT gz FROM onecharge_doc WHERE id = 1');
  const doc = JSON.parse(zlib.gunzipSync(Buffer.from(rows[0].gz)).toString('utf8'));
  doc.wallets['acc-driver'].balance = 777_777;
  await pg.query('INSERT INTO onecharge_state (id, doc) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc', [JSON.stringify(doc)]);
  await pg.query('DELETE FROM onecharge_doc');
  await pg.close();

  const server = await boot(port);
  const token = (await json(server.base, '/auth/login', { method: 'POST', body: { portal: 'driver', login: '+998901234567', password: 'Driver2026' } })).data.token;
  assert.equal((await json(server.base, '/state', { token })).data.wallets['acc-driver'].balance, 777_777, 'the old jsonb copy was not read');
  assert.equal((await json(server.base, '/wallet/topup', { method: 'POST', token, body: { amount: 1000 } })).status, 200);
  await stop(server.child);

  pg = new PGlite(dataDir);
  const moved = await pg.query('SELECT gz, size FROM onecharge_doc WHERE id = 1');
  await pg.close();
  assert.equal(moved.rows.length, 1, 'the state was not saved in the gzipped table');
  const saved = JSON.parse(zlib.gunzipSync(Buffer.from(moved.rows[0].gz)).toString('utf8'));
  assert.equal(saved.wallets['acc-driver'].balance, 778_777);
  assert.ok(moved.rows[0].gz.length < moved.rows[0].size / 3, 'not compressed');
});

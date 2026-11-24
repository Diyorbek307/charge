/**
 * Moving the database (to a server in Uzbekistan): with MIGRATE_FROM_DATABASE_URL
 * the server copies everything from the old database into the new, empty one on
 * start; it leaves a new database that already has data alone; and it refuses to
 * start empty when the old one has nothing.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'oc-move-'));
const pg = name => `pglite://${join(root, name).replace(/\\/g, '/')}`;
const PORT = 10900 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;

after(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

/** Starts the server; resolves with it once it answers, or with its exit code if it stops first. */
function start(env) {
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: join(root, 'files'), DEMO_SIMULATION: 'false', OSM_PLACES: 'false', MIGRATE_FROM_DATABASE_URL: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', d => (log += d));
  server.stderr.on('data', d => (log += d));
  return new Promise(resolve => {
    let done = false;
    server.on('exit', code => !done && ((done = true), resolve({ exited: code, log: () => log })));
    (async () => {
      for (let i = 0; i < 600 && !done; i++) {
        try {
          if ((await fetch(`${BASE}/state`)).ok) return ((done = true), resolve({ server, log: () => log }));
        } catch {
          /* not up yet */
        }
        await new Promise(r => setTimeout(r, 100));
      }
    })();
  });
}
async function stop(server) {
  const gone = new Promise(r => server.on('exit', r));
  server.kill('SIGTERM');
  await gone;
}
const lead = async (name, phone) => {
  const status = (await fetch(`${BASE}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, city: 'Tashkent', consent: true, kind: 'driver' }) })).status;
  await new Promise(r => setTimeout(r, 1500)); // saved before the process is stopped
  return status;
};
const leadsSeen = async () => {
  const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' }) })).json()).token;
  return JSON.stringify(await (await fetch(`${BASE}/leads`, { headers: { Authorization: `Bearer ${token}` } })).json());
};

test('the old database is copied into the new one on start, once; an empty old one stops the start', { timeout: 240_000 }, async () => {
  // The old database, with a record that is not in the demo seed.
  const old = await start({ DATABASE_URL: pg('old') });
  assert.ok(old.server, old.log?.());
  assert.ok([200, 201].includes(await lead('Moved Person', '+998901112233')), 'a lead is saved');
  await stop(old.server);

  // The new, empty database, told where the old one is: the record is there.
  const moved = await start({ DATABASE_URL: pg('new'), MIGRATE_FROM_DATABASE_URL: pg('old') });
  assert.ok(moved.server, moved.log());
  assert.match(await leadsSeen(), /Moved Person/);
  assert.match(moved.log(), /\[db\] moved/);
  assert.ok([200, 201].includes(await lead('Made After The Move', '+998901112244')));
  await stop(moved.server);

  // A restart with the variable still set does not copy the old data over the new.
  const again = await start({ DATABASE_URL: pg('new'), MIGRATE_FROM_DATABASE_URL: pg('old') });
  assert.ok(again.server, again.log());
  assert.match(await leadsSeen(), /Made After The Move/);
  assert.match(again.log(), /already has the data/);
  await stop(again.server);

  // An old database with nothing in it: the server stops instead of starting empty.
  const empty = await start({ DATABASE_URL: pg('another'), MIGRATE_FROM_DATABASE_URL: pg('nothing') });
  assert.notEqual(empty.exited, undefined, 'the server did not start');
  assert.notEqual(empty.exited, 0);
});

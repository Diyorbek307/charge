/**
 * Backups: a copy is checked against the live data as it is made, kept,
 * downloadable by the admin, encrypted for the trip off the server, and
 * readable by the restore script.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { seal, unseal, verify, countsOf } from '../server/backupFormat.js';

describe('backup format', () => {
  const data = { __v: 7, accounts: [{ id: 1 }, { id: 2 }], sessions: [{ id: 's' }] };
  const gz = zlib.gzipSync(JSON.stringify(data));

  test('a sealed copy opens with its key and not with another', () => {
    const sealed = seal(gz, 'right key');
    assert.notDeepEqual(sealed.subarray(51, 60), gz.subarray(0, 9));
    assert.deepEqual(unseal(sealed, 'right key'), gz);
    assert.throws(() => unseal(sealed, 'wrong key'));
  });

  test('verify sees a copy that lost records', () => {
    assert.equal(verify(gz, { ...countsOf(data), __v: 7 }).ok, true);
    const short = verify(gz, { ...countsOf(data), accounts: 3, __v: 7 });
    assert.equal(short.ok, false);
    assert.match(short.missing.join(), /accounts: 2 из 3/);
  });
});

const PORT = 9900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;
before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-backup-'));
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 300; i++) {
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
  rmSync(dataDir, { recursive: true, force: true });
});

describe('backups on the server', () => {
  const admin = async () => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' }) })).json()).token;

  test('the admin takes a copy, sees it checked, downloads it, and the restore script reads it', async () => {
    const auth = { Authorization: `Bearer ${await admin()}` };
    const made = await fetch(`${BASE}/admin/backups`, { method: 'POST', headers: auth });
    assert.equal(made.status, 201);
    const { backup } = await made.json();
    assert.equal(backup.verified, true);
    assert.ok(backup.counts.accounts > 0 && backup.counts.stations > 0);

    const list = await (await fetch(`${BASE}/admin/backups`, { headers: auth })).json();
    assert.equal(list.backups[0].name, backup.name);

    const file = Buffer.from(await (await fetch(`${BASE}/admin/backups/${backup.name}`, { headers: auth })).arrayBuffer());
    const restored = JSON.parse(zlib.gunzipSync(file).toString('utf8'));
    assert.equal(restored.accounts.length, backup.counts.accounts);

    const path = join(dataDir, 'copy.json.gz');
    writeFileSync(path, file);
    const out = execFileSync(process.execPath, ['scripts/restore-backup.mjs', path], { encoding: 'utf8' });
    assert.match(out, new RegExp(`accounts\\s+${backup.counts.accounts}`));
    assert.match(out, /Nothing written/);
  });

  test('only the admin may see or take copies', async () => {
    assert.equal((await fetch(`${BASE}/admin/backups`)).status, 401);
    assert.equal((await fetch(`${BASE}/admin/backups`, { method: 'POST' })).status, 401);
  });
});

/**
 * Station photos from drivers: sent by a signed-in driver, kept until the
 * admin looks, published into the gallery or deleted, a few a day at most.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9400 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;
// The smallest real JPEG header is not needed: the server checks the data URL's form and size.
const PHOTO = `data:image/jpeg;base64,${Buffer.from('a station photo').toString('base64')}`;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-photos-'));
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', BACKUPS: 'off' }, stdio: 'ignore' });
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

const login = async (portal, l, p) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal, login: l, password: p }) })).json()).token;
const call = (path, token, body) => fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });

describe('driver photos', () => {
  test('a photo waits, the admin publishes it into the gallery, and the next one can be rejected', async () => {
    const driver = await login('driver', '+998901234567', 'Driver2026');
    const admin = await login('admin', 'admin@voli.uz', 'Admin2026');

    const sent = await call('/stations/st-001/driver-photos', driver, { photo: PHOTO });
    assert.equal(sent.status, 201);
    const { photo } = await sent.json();
    assert.equal(photo.status, 'pending');

    const waiting = await (await call('/admin/driver-photos', admin)).json();
    assert.equal(waiting.pending, 1);
    assert.equal((await call(`/admin/driver-photos/${photo.id}`, admin)).status, 200);

    const ok = await (await call(`/admin/driver-photos/${photo.id}`, admin, { decision: 'approve' })).json();
    assert.equal(ok.photo.status, 'approved');
    const station = (await (await fetch(`${BASE}/state`)).json()).stations.find(s => s.id === 'st-001');
    assert.ok(station.gallery.some(g => g.by === 'driver'));
    assert.equal((await call(`/admin/driver-photos/${photo.id}`, admin, { decision: 'approve' })).status, 409);

    const second = (await (await call('/stations/st-001/driver-photos', driver, { photo: PHOTO })).json()).photo;
    const no = await (await call(`/admin/driver-photos/${second.id}`, admin, { decision: 'reject' })).json();
    assert.equal(no.photo.status, 'rejected');
    assert.equal((await call(`/admin/driver-photos/${second.id}`, admin)).status, 404);
  });

  test('three a day, only real images, only signed-in drivers', async () => {
    const driver = await login('driver', '+998901234567', 'Driver2026');
    assert.equal((await call('/stations/st-002/driver-photos', driver, { photo: 'data:text/html;base64,PGI+' })).status, 400);
    assert.equal((await call('/stations/st-002/driver-photos', driver, { photo: PHOTO })).status, 201);
    assert.equal((await call('/stations/st-002/driver-photos', driver, { photo: PHOTO })).status, 429);
    assert.equal((await fetch(`${BASE}/stations/st-002/driver-photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: PHOTO }) })).status, 401);
  });
});

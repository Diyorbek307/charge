/**
 * While you charge: partners with offers near a station, and what they are billed for.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10200 + Math.floor(Math.random() * 90);
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

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-places-'));
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

describe('while you charge', () => {
  test('a partner near the station is shown with its offer, and each show and tap is counted', async () => {
    const r = (await call('/stations/st-001/places')).data;
    const p = r.partners.find(x => x.id === 'PP-001');
    // A partner signed for a far station is not shown as near.
    assert.ok(r.partners.every(x => x.km <= 1.2));
    assert.ok(p && p.offer && p.walkMin >= 1);
    assert.equal(r.counts.food >= 1, true);
    await call('/stations/st-001/places');
    assert.equal((await call(`/places/${p.id}/tap`, { method: 'POST' })).status, 200);
    const list = (await call('/admin/partners', { token: await admin() })).data;
    const mine = list.find(x => x.id === 'PP-001');
    assert.ok(mine.shows >= 2);
    assert.equal(mine.taps, 1);
    assert.equal(mine.bill, mine.shows * mine.pricePerShow);
  });

  test('only the platform signs partners up, with a real place and an offer', async () => {
    assert.equal((await call('/admin/partners', { method: 'POST', token: await driver(), body: {} })).status, 403);
    const token = await admin();
    assert.equal((await call('/admin/partners', { method: 'POST', token, body: { name: 'X', kind: 'food', lat: 10, lng: 10, offer: 'y' } })).status, 400);
    const st = (await call('/state')).data.stations.find(x => x.id === 'st-002');
    // A few hundred metres from the station.
    const made = await call('/admin/partners', { method: 'POST', token, body: { name: 'Bon!', kind: 'food', lat: st.geoLat + 0.002, lng: st.geoLng, offer: 'Десерт в подарок', stationIds: ['st-002'] } });
    assert.equal(made.status, 201);
    assert.ok((await call('/stations/st-002/places')).data.partners.some(x => x.name === 'Bon!'));
    await call(`/admin/partners/${made.data.id}`, { method: 'DELETE', token });
    assert.ok(!(await call('/stations/st-002/places')).data.partners.some(x => x.name === 'Bon!'));
  });
});

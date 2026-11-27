/**
 * Networks on the map only (server/partnerMap.js): Spectre's public station
 * list, chargers standing together as one point, and a link into their app
 * with Voli's UTM mark.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 11300 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-partner-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', SMTP_HOST: '', RESEND_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 450; i++) {
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

test('Spectre stations: one point per place, a link into their app', async () => {
  const { networks, sites } = await (await fetch(`${BASE}/partner-map`)).json();
  assert.equal(networks[0].id, 'spectre');
  assert.ok(sites.length > 300, 'the snapshot covers Uzbekistan');
  assert.ok(networks[0].chargers > sites.length, 'chargers standing together are one point');
  for (const s of sites) {
    assert.match(s.link, /^https:\/\/app\.spectre-energy\.uz\/s\/[0-9a-f-]{36}\?utm_source=voli&utm_medium=app&utm_campaign=map$/);
    assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lng));
    assert.ok(!/\bkW\b|\sK\d+$/.test(s.name), `a place name, not a charger's: ${s.name}`);
  }
  const vatan = sites.find(s => s.name === 'Vatan kinoteatri');
  assert.ok(vatan && vatan.chargers.length >= 5 && vatan.maxPower === 120 && vatan.chargers.some(c => c.hybrid));
});

test('bad entries from their API are skipped', async () => {
  const { spectreSites } = await import('../server/partnerMap.js');
  const sites = spectreSites({ stations: [
    { name: 'A 120 kW K1', address: 'x', location: { lat: 41.3, lng: 69.2 }, power_kw: 120, public_id: 'dd0389c4-cfd6-4be0-a02b-67907b98a159' },
    { name: 'A 20 kW Hybrid K2', address: 'x', location: { lat: 41.3001, lng: 69.2001 }, power_kw: 20, public_id: 'bf258d2a-30b0-4865-967f-b05dac35a7ae' },
    { name: 'evil', location: { lat: 41, lng: 69 }, public_id: '../../x?y=<script>' },
    { name: 'nowhere', location: { lat: 'x', lng: null }, public_id: 'bf258d2a-30b0-4865-967f-b05dac35a7af' },
  ] });
  assert.equal(sites.length, 1);
  assert.equal(sites[0].name, 'A');
  assert.equal(sites[0].chargers.length, 2);
  assert.equal(sites[0].link, 'https://app.spectre-energy.uz/s/dd0389c4-cfd6-4be0-a02b-67907b98a159?utm_source=voli&utm_medium=app&utm_campaign=map');
});

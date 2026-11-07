/**
 * A big database must not stall the server: saving waits longer when writing is
 * costly, and the dashboards group sessions in one pass with cached dates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'voli-bigdb-'));
process.env.DATABASE_URL = '';
const { saveDelay, db } = await import('../server/db.js');
const { metaOf, monthSpend, monthSpendAll } = await import('../server/analytics.js');
await db.ready;

test('a small database saves within a quarter second, a big one at most a tenth of the time', () => {
  assert.equal(saveDelay(), 250);
  assert.equal(saveDelay(20), 250);
  assert.equal(saveDelay(550), 5500);
  assert.equal(saveDelay(10_000), 15_000);
});

test('cached session dates follow a changed start', () => {
  const s = { start: '2026-11-07T10:00:00.000Z' };
  assert.equal(metaOf(s).day, '2026-11-07');
  assert.equal(metaOf(s).hour, 15); // Tashkent is UTC+5
  s.start = '2026-11-07T20:00:00.000Z';
  assert.equal(metaOf(s).day, '2026-11-08');
});

test('company spend for everyone matches the one-by-one sum', () => {
  const all = monthSpendAll();
  for (const e of db.data.employees) assert.equal(all.get(e.driverId) ?? 0, monthSpend(e.driverId));
});

/**
 * The fee for staying plugged in after the charge: off by default, counted
 * from the charge's end to the station's "cable out", free minutes first,
 * capped, and taken from the wallet only as far as it goes.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'oc-idle-'));
process.env.DATABASE_URL = '';
process.env.BACKUPS = 'off';
const { db } = await import('../server/db.js');
const { updateSettings } = await import('../server/settings.js');
const { idleFeeFor, settleIdle } = await import('../server/idle.js');

const rules = { freeMin: 15, perMin: 500, maxMin: 120 };

describe('idle fee', () => {
  before(async () => {
    await db.ready;
  });

  test('free minutes first, then by the minute, never past the cap', () => {
    assert.deepEqual(idleFeeFor(10, rules), { billed: 0, fee: 0 });
    assert.deepEqual(idleFeeFor(40.9, rules), { billed: 25, fee: 12_500 });
    assert.deepEqual(idleFeeFor(600, rules), { billed: 120, fee: 60_000 });
  });

  const plant = (minutesAgo, extra = {}) => {
    const st = db.data.stations[0];
    const c = st.connectors[0];
    const s = { id: `S-IDLE-${Math.random().toString(36).slice(2, 7)}`, userId: 'u-001', stationId: st.id, stationName: st.name, operatorId: st.operatorId, connectorId: c.id, status: 'completed', start: new Date(Date.now() - (minutesAgo + 30) * 60000).toISOString(), end: new Date(Date.now() - minutesAgo * 60000).toISOString(), energy: 20, cost: 36_000, ...extra };
    db.data.sessions.unshift(s);
    return s;
  };

  test('the cable out after 40 minutes takes 25 minutes of fee from the wallet', () => {
    const r = updateSettings({ 'idle.enabled': true, 'idle.freeMin': 15, 'idle.perMin': 500 }, { name: 'test' });
    assert.ok(!r.error, r.error);
    db.data.wallets['u-001'] = { ...(db.data.wallets['u-001'] ?? {}), balance: 100_000 };
    const s = plant(40);
    settleIdle(s.stationId, s.connectorId);
    assert.equal(s.idle.billed, 25);
    assert.equal(s.idle.fee, 12_500);
    assert.equal(db.data.wallets['u-001'].balance, 87_500);
    assert.equal(db.data.idleFees[0].sessionId, s.id);
  });

  test('never more than the wallet holds, and a company charge is not billed to the driver', () => {
    db.data.wallets['u-001'].balance = 3_000;
    const s = plant(60);
    settleIdle(s.stationId, s.connectorId);
    assert.equal(s.idle.fee, 3_000);
    assert.equal(db.data.wallets['u-001'].balance, 0);

    db.data.wallets['u-001'].balance = 50_000;
    const corp = plant(60, { corporate: true });
    settleIdle(corp.stationId, corp.connectorId);
    assert.equal(corp.idle.fee, 0);
    assert.equal(db.data.wallets['u-001'].balance, 50_000);
  });
});

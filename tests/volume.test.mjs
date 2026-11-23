/**
 * Voli buys a network's volume ahead: the admin sets the terms, periods are made
 * from the start date, the network sees what its Voli drivers used of it, and the
 * admin marks each prepayment. A network on volume has no commission statements
 * from that month on, so no "overdue payout" alarm can come from it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let dataDir;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data?.token;
const daysAgo = n => new Date(Date.now() + 5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-volume-'));
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

test('volume terms: periods from the start date, usage, carry-over, prepayment mark, and no commission statements', async () => {
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  assert.ok(admin && op);

  // Before any terms the network's cabinet shows its commission statements.
  assert.equal((await call('/operator/volume', { token: op })).data.deal, null);

  // Fewer than 5 000 kWh, no price, or a wrong period are refused; a network cannot set its own terms.
  const bad = body => call('/admin/operators/op-001/volume', { method: 'POST', token: admin, body });
  assert.equal((await bad({ kwh: 4000, price: 1500, period: 'month', carry: true, start: daysAgo(40) })).status, 400);
  assert.equal((await bad({ kwh: 5000, price: 0, period: 'month', carry: true, start: daysAgo(40) })).status, 400);
  assert.equal((await bad({ kwh: 5000, price: 1500, period: 'year', carry: true, start: daysAgo(40) })).status, 400);
  assert.equal((await call('/admin/operators/op-001/volume', { method: 'POST', token: op, body: { kwh: 5000, price: 1, period: 'month', start: daysAgo(1) } })).status, 403);

  // Started 40 days ago, monthly: one closed period and the current one.
  const set = await bad({ kwh: 5000, price: 1500, period: 'month', carry: true, start: daysAgo(40) });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  const [cur, first] = set.data.periods;
  assert.equal(set.data.periods.length, 2);
  assert.equal(first.current, false);
  assert.equal(cur.current, true);
  assert.equal(first.from, daysAgo(40));
  assert.equal(first.amount, 5000 * 1500, 'Voli pays for the whole volume, whatever was used');
  assert.equal(cur.carriedIn, Math.max(0, Math.round((5000 - first.used) * 10) / 10), 'the unused rest moves on');
  assert.equal(cur.total, 5000 + cur.carriedIn);

  // The network sees the same, and has no commission statements from the start month on.
  const mine = (await call('/operator/volume', { token: op })).data;
  assert.equal(mine.deal.kwh, 5000);
  assert.deepEqual(mine.periods.map(p => p.id), set.data.periods.map(p => p.id));
  const a = (await call('/analytics?days=120', { token: admin })).data;
  assert.deepEqual(a.invoices.filter(i => i.operatorId === 'op-001' && i.month >= daysAgo(40).slice(0, 7)).map(i => i.id), []);

  // Raising the volume and going weekly applies from the next period; the current one keeps its terms.
  const raised = await bad({ kwh: 8000, price: 1500, period: 'week', carry: false, start: daysAgo(1) });
  assert.equal(raised.status, 200);
  assert.equal(raised.data.periods[0].kwh, 5000);
  assert.equal(raised.data.deal.start, daysAgo(40), 'the start date is fixed once periods exist');

  // The admin marks the prepayment; the network sees "paid"; the mark can be taken back.
  assert.equal((await call(`/admin/volume/${first.id}/paid`, { method: 'POST', token: admin, body: { amount: 7_500_000, paidAt: daysAgo(35), ref: '' } })).status, 400);
  const paid = await call(`/admin/volume/${first.id}/paid`, { method: 'POST', token: admin, body: { amount: 7_500_000, paidAt: daysAgo(35), ref: '124' } });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.equal(paid.data.status, 'paid');
  assert.equal((await call(`/admin/volume/${first.id}/paid`, { method: 'POST', token: admin, body: { amount: 1, paidAt: daysAgo(1), ref: '1' } })).status, 409);
  const seen = (await call('/operator/volume', { token: op })).data.periods.find(p => p.id === first.id);
  assert.equal(seen.paidRef, '124');
  assert.equal(seen.receipt.status, 'waiting', 'the network is asked to confirm');

  // The network: "not received" needs a reason; then it can still confirm; a confirmed one cannot be disputed.
  const receipt = (body, token = op) => call(`/operator/volume/${first.id}/receipt`, { method: 'POST', token, body });
  assert.equal((await call(`/operator/volume/${cur.id}/receipt`, { method: 'POST', token: op, body: { ok: true } })).status, 400, 'nothing marked yet');
  assert.equal((await receipt({ ok: false, note: '' })).status, 400);
  const disputed = await receipt({ ok: false, note: 'Деньги не пришли' });
  assert.equal(disputed.data.receipt.status, 'disputed');
  assert.equal((await call('/admin/volume', { token: admin })).data.find(v => v.operatorId === 'op-001').periods.find(p => p.id === first.id).receipt.note, 'Деньги не пришли');
  assert.equal((await receipt({ ok: true })).data.receipt.status, 'confirmed');
  assert.equal((await receipt({ ok: false, note: 'передумали' })).status, 409);
  assert.equal((await receipt({ ok: true }, admin)).status, 403, 'only the network answers');
  assert.equal((await call(`/admin/volume/${first.id}/paid`, { method: 'DELETE', token: admin })).data.status, 'overdue', 'unpaid 35 days after its start is overdue');
});

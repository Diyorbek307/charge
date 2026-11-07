/**
 * Paying networks their share: a month reads paid only once the admin
 * marks the bank transfer, and the network sees it in its cabinet.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const PORT = 9900 + Math.floor(Math.random() * 300);
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
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-payouts-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '' },
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

const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;

test('a payout is paid only when the admin marks the transfer; the network sees it', async () => {
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const before = (await call('/analytics?days=30', { token: admin })).data.invoices;
  const open = before.find(i => (i.status === 'processing' || i.status === 'overdue') && i.mode !== 'direct');
  assert.ok(open, 'last month waits for its payout');
  assert.equal(open.paidAt, undefined);

  // Nonsense is refused.
  assert.equal((await call('/admin/payouts', { method: 'POST', token: admin, body: { invoiceId: open.id, operatorId: open.operatorId, amount: open.payout, paidAt: '2026-11-01', ref: '' } })).status, 400);
  assert.equal((await call('/admin/payouts', { method: 'POST', token: admin, body: { invoiceId: 'INV-XX-0000', operatorId: open.operatorId, amount: 1, paidAt: '2026-11-01', ref: '7' } })).status, 404);

  const ok = await call('/admin/payouts', { method: 'POST', token: admin, body: { invoiceId: open.id, operatorId: open.operatorId, amount: open.payout, paidAt: '2026-11-03', ref: '1245' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('/admin/payouts', { method: 'POST', token: admin, body: { invoiceId: open.id, operatorId: open.operatorId, amount: open.payout, paidAt: '2026-11-03', ref: '1245' } })).status, 409);

  const after = (await call('/analytics?days=30', { token: admin })).data.invoices.find(i => i.id === open.id && i.operatorId === open.operatorId);
  assert.equal(after.status, 'paid');
  assert.equal(after.paidRef, '1245');
  assert.equal(after.paidAmount, open.payout);

  // Only the admin marks payouts.
  const op = await login('operator', 'operator@greencharge.uz', 'Operator2026');
  assert.equal((await call('/admin/payouts', { method: 'POST', token: op, body: { invoiceId: open.id, operatorId: open.operatorId, amount: 1, paidAt: '2026-11-03', ref: '1' } })).status, 403);

  // A wrong mark is taken back and the month waits again.
  assert.equal((await call(`/admin/payouts/${open.id}/${open.operatorId}`, { method: 'DELETE', token: admin })).status, 200);
  const undone = (await call('/analytics?days=30', { token: admin })).data.invoices.find(i => i.id === open.id && i.operatorId === open.operatorId);
  assert.notEqual(undone.status, 'paid');
});

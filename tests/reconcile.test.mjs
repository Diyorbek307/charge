/**
 * Reconciling top-ups with the provider's statement: a CSV from the Payme or
 * Click cabinet is matched to our orders, and only the differences come back.
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
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const login = async (portal, l, p) => (await call('/auth/login', { method: 'POST', body: { portal, login: l, password: p } })).data.token;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-rec-'));
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

test('a statement is matched to our orders and only the differences come back', async () => {
  const driver = await login('driver', '+998901234567', 'Driver2026');
  const paid = [];
  for (const amount of [50000, 70000]) {
    const order = (await call('/payments/topup', { method: 'POST', token: driver, body: { provider: 'payme', amount } })).data.order;
    await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token: driver });
    paid.push(order);
  }
  // The first matches, the second is missing from the statement, and a payment we never saw is in it.
  const statement = ['Заказ;Сумма;Статус', `${paid[0].id};50 000;Успешно`, 'PAY-UNKNOWN;30000;Успешно', 'PAY-CANCELLED;10000;Отменён'].join('\r\n');
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const r = await call('/admin/reconcile', { method: 'POST', token: admin, body: { provider: 'payme', statement } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.lines, 3);
  const kinds = r.data.diffs.map(d => d.kind).sort();
  assert.deepEqual(kinds, ['ours-only', 'theirs-only']);
  assert.equal(r.data.diffs.find(d => d.kind === 'ours-only').order.id, paid[1].id);
  assert.equal(r.data.diffs.find(d => d.kind === 'theirs-only').line.amount, 30000);
  assert.equal(r.data.theirPaid, 80000);
  assert.equal(r.data.ourPaid, 120000);
});

test('amounts in tiyin are read as tiyin, and a wrong amount is flagged', async () => {
  const driver = await login('driver', '+998901234567', 'Driver2026');
  const order = (await call('/payments/topup', { method: 'POST', token: driver, body: { provider: 'click', amount: 40000 } })).data.order;
  await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token: driver });
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const ok = await call('/admin/reconcile', { method: 'POST', token: admin, body: { provider: 'click', statement: `order,amount (tiyin)\n${order.id},4000000` } });
  assert.deepEqual(ok.data.diffs, []);
  const off = await call('/admin/reconcile', { method: 'POST', token: admin, body: { provider: 'click', statement: `order,amount\n${order.id},39000` } });
  assert.equal(off.data.diffs[0].kind, 'amount');
});

test('a statement without the needed columns is refused, and only the admin may reconcile', async () => {
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  assert.equal((await call('/admin/reconcile', { method: 'POST', token: admin, body: { provider: 'payme', statement: 'a;b\n1;2' } })).status, 400);
  assert.equal((await call('/admin/reconcile', { token: admin })).status, 200);
  const driver = await login('driver', '+998901234567', 'Driver2026');
  assert.equal((await call('/admin/reconcile', { token: driver })).status, 403);
});

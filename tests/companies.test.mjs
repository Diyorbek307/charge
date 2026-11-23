/**
 * Many companies: the admin makes one, its manager sets a password by the
 * invitation link, and from then on it has its own money, people, charges
 * and reports — it never sees or spends another company's.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 10200 + Math.floor(Math.random() * 300);
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

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-companies-'));
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

test('a new company: invited manager sets a password, has its own empty account, and sees nobody else', async () => {
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const made = await call('/admin/companies', { method: 'POST', token: admin, body: { name: 'Taxi Park Bir', inn: '123456789', managerName: 'Sardor Aliyev', email: 'Park@Bir.uz' } });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.equal(made.data.mail.sent, false, 'no mail configured here: the admin gets the link to send');
  const token = new URL(made.data.link).searchParams.get('invite');
  const orgId = made.data.company.id;

  // Before the password is set nobody gets in.
  assert.equal(await login('business', 'park@bir.uz', 'anything12345'), undefined);
  // Same email or INN twice is refused.
  assert.equal((await call('/admin/companies', { method: 'POST', token: admin, body: { name: 'Another', managerName: 'Y Z', email: 'park@bir.uz' } })).status, 409);
  assert.equal((await call('/admin/companies', { method: 'POST', token: admin, body: { name: 'Another', inn: '123456789', managerName: 'Y Z', email: 'x@y.uz' } })).status, 409);

  assert.equal((await call(`/auth/invite/${token}`)).data.org, 'Taxi Park Bir');
  assert.equal((await call(`/auth/invite/${token}`, { method: 'POST', body: { password: 'short' } })).status, 400);
  assert.equal((await call(`/auth/invite/${token}`, { method: 'POST', body: { password: 'Strong-pass-2026' } })).status, 200);
  // The link works once.
  assert.equal((await call(`/auth/invite/${token}`, { method: 'POST', body: { password: 'Other-pass-2026' } })).status, 404);

  const biz = await login('business', 'park@bir.uz', 'Strong-pass-2026');
  assert.ok(biz, 'the manager signs in with the new password');
  const st = (await call('/state', { token: biz })).data;
  assert.deepEqual(Object.keys(st.wallets), [orgId]);
  assert.equal(st.wallets[orgId].balance, 0);
  assert.equal(st.employees.length, 0, 'not the demo company’s people');
  assert.equal(st.vehicles.length, 0);
  assert.ok(st.sessions.every(s => !s.corporate), 'not the demo company’s charges');

  // The admin credits a bank transfer.
  const credited = await call(`/admin/companies/${orgId}/credit`, { method: 'POST', token: admin, body: { amount: 500000, reference: 'п/п 15' } });
  assert.equal(credited.status, 200, JSON.stringify(credited.data));
  assert.equal((await call('/state', { token: biz })).data.wallets[orgId].balance, 500000);
});

test('an employee charges on their own company’s money; companies cannot touch each other’s people', async () => {
  const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
  const list = (await call('/admin/companies', { token: admin })).data;
  const bir = list.find(c => c.name === 'Taxi Park Bir');
  const biz = await login('business', 'park@bir.uz', 'Strong-pass-2026');
  const demoBiz = await login('business', 'fleet@uzauto.uz', 'Business2026');
  const demoBalance = (await call('/state', { token: demoBiz })).data.wallets['biz-001'].balance;

  // A demo driver who is not yet anyone's employee.
  const demo = (await call('/state', { token: demoBiz })).data.employees;
  const nilufarInDemo = demo.find(e => e.driverId === 'acc-driver');
  // Already in the demo company: another company cannot take the same person.
  const taken = await call('/employees', { method: 'POST', token: biz, body: { name: 'Alisher', phone: '+998901234567', limit: 100000 } });
  assert.equal(taken.status, 409);
  assert.match(taken.data.error, /другой компании/);
  // Nor change the demo company's employee's limit or remove them.
  assert.equal((await call(`/employees/${nilufarInDemo.id}/limit`, { method: 'POST', token: biz, body: { limit: 1 } })).status, 404);
  assert.equal((await call(`/employees/${nilufarInDemo.id}`, { method: 'DELETE', token: biz })).status, 404);

  // The demo company lets the person go; the new company adds them.
  assert.equal((await call(`/employees/${nilufarInDemo.id}`, { method: 'DELETE', token: demoBiz })).status, 200);
  const added = await call('/employees', { method: 'POST', token: biz, body: { name: 'Alisher Tursunov', phone: '+998901234567', limit: 300000 } });
  assert.equal(added.status, 200, JSON.stringify(added.data));
  assert.equal((await call('/state', { token: biz })).data.employees.length, 1);
  assert.ok(!(await call('/state', { token: demoBiz })).data.employees.some(e => e.driverId === 'acc-driver'));

  // Nilufar charges "paid by the company": the new company pays, not the demo one.
  const nilufar = await login('driver', '+998901234567', 'Driver2026');
  assert.ok(nilufar)
  const me = (await call('/state', { token: nilufar })).data;
  assert.equal(me.employer?.org, 'Taxi Park Bir');
  const station = me.stations.find(s => !s.ocpi && !s.uzgrid && s.connectors.some(c => c.status === 'available'));
  const c = station.connectors.find(x => x.status === 'available');
  const start = await call('/sessions/start', { method: 'POST', token: nilufar, body: { stationId: station.id, connectorId: c.id, payer: 'company' } });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const stop = await call(`/sessions/${start.data.session.id}/stop`, { method: 'POST', token: nilufar });
  const cost = stop.data.session.cost;
  assert.equal((await call('/state', { token: biz })).data.wallets[bir.id].balance, 500000 - cost);
  assert.equal((await call('/state', { token: demoBiz })).data.wallets['biz-001'].balance, demoBalance, 'the demo company paid nothing');
  // The charge shows in the new company's list, not the demo one's.
  assert.ok((await call('/state', { token: biz })).data.sessions.some(s => s.id === start.data.session.id));
  assert.ok(!(await call('/state', { token: demoBiz })).data.sessions.some(s => s.id === start.data.session.id));
  // And the refund goes back to the company that paid.
  const txn = (await call('/state', { token: biz })).data.transactions.find(t => t.sessionId === start.data.session.id);
  assert.equal((await call(`/transactions/${txn.id}/refund`, { method: 'POST', token: admin })).status, 200);
  assert.equal((await call('/state', { token: biz })).data.wallets[bir.id].balance, 500000);
});

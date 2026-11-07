/**
 * A fleet adds employees by phone, one or a list; their driver account
 * is linked by that phone, at once or on their first sign-in.
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
  dataDir = mkdtempSync(join(tmpdir(), 'oc-employees-'));
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

test('a fleet adds employees by phone, imports a list, and the driver is linked by that phone', async () => {
  const biz = await login('business', 'fleet@uzauto.uz', 'Business2026');
  const count = async () => (await call('/analytics?days=30', { token: biz })).data.employees.length;
  const before = await count();

  assert.equal((await call('/employees', { method: 'POST', token: biz, body: { name: 'A', phone: '123' } })).status, 400);
  const one = await call('/employees', { method: 'POST', token: biz, body: { name: 'Jasur Qodirov', phone: '+998 93 555 11 22', dept: 'Логистика', limit: '1 200 000' } });
  assert.equal(one.status, 200);
  assert.equal(one.data.linked, false);
  assert.equal((await call('/employees', { method: 'POST', token: biz, body: { name: 'Jasur Qodirov', phone: '935551122' } })).status, 409);

  const list = await call('/employees/import', { method: 'POST', token: biz, body: { rows: [
    { name: 'Malika Sobirova', phone: '+998 97 111 22 33', limit: 900000 },
    { name: 'Без телефона', phone: '' },
    { name: 'Jasur again', phone: '+998935551122' },
  ] } });
  assert.equal(list.data.added, 1);
  assert.equal(list.data.skipped.length, 2);
  assert.equal(await count(), before + 2);

  // Jasur signs up in the driver app with that phone: the company charge is there for him.
  const code = (await call('/auth/code/request', { method: 'POST', body: { to: '+998935551122' } })).data;
  assert.ok(code.demoCode, 'the demo shows the code');
  const v = (await call('/auth/code/verify', { method: 'POST', body: { to: '+998935551122', code: code.demoCode } })).data;
  const done = (await call('/auth/code/finish', { method: 'POST', body: { ticket: v.ticket, name: 'Jasur Qodirov', consent: { version: 99 } } })).data;
  assert.ok(done.token, 'signed up');
  const me = (await call('/state', { token: done.token })).data;
  assert.equal(me.employer?.employeeId, one.data.employee.id);

  const emp = (await call('/analytics?days=30', { token: biz })).data.employees.find(e => e.name === 'Malika Sobirova');
  assert.equal((await call(`/employees/${emp.id}`, { method: 'DELETE', token: biz })).status, 200);
  assert.equal(await count(), before + 1);
});

/**
 * Landing-page leads: the launch waitlist and partner requests. They are
 * real people's data, so beyond validation the tests check that only the
 * admin can read them and that a demo reset does not wipe them.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5100 + Math.floor(Math.random() * 400);
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

const login = async (portal, loginName, password) =>
  (await call('/auth/login', { method: 'POST', body: { portal, login: loginName, password } })).data.token;

const lead = (over = {}) => call('/leads', {
  method: 'POST',
  body: { kind: 'operator', name: 'Анвар', phone: '+998 90 111 22 33', company: 'Volt Tashkent', consent: true, ...over },
});

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-leads-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const until = Date.now() + 15000;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error('server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
});

after(() => {
  server?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

describe('leads', () => {
  test('rejects a lead without consent, a bad phone or a missing company', async () => {
    assert.equal((await lead({ consent: false })).status, 400);
    assert.equal((await lead({ phone: '12345' })).status, 400);
    assert.equal((await lead({ company: '' })).status, 400);
    assert.equal((await lead({ kind: 'investor' })).status, 400);
  });

  test('stores a partner request and announces it to the admin only', async () => {
    const res = await lead();
    assert.equal(res.status, 201);

    const admin = await login('admin', 'admin@onecharge.uz', 'Admin2026');
    const { data } = await call('/leads', { token: admin });
    const saved = data.leads.find(l => l.company === 'Volt Tashkent');
    assert.ok(saved, 'lead is listed for the admin');
    assert.equal(saved.phone, '+998901112233');
    assert.equal(saved.status, 'new');
    assert.ok(saved.consentAt);

    const operator = await login('operator', 'operator@greencharge.uz', 'Operator2026');
    assert.equal((await call('/leads', { token: operator })).status, 403);
    assert.equal((await call('/leads')).status, 401);

    const pub = (await call('/state')).data;
    assert.ok(!('leads' in pub));
    assert.ok(!pub.events.some(e => e.type === 'lead.new'), 'the event is not public');
  });

  test('a repeat sign-up is not stored twice, and a bot filling the honeypot is dropped', async () => {
    const driver = { kind: 'driver', name: 'Лола', phone: '+998935554433', company: '' };
    assert.equal((await lead(driver)).status, 201);
    const again = await lead(driver);
    assert.equal(again.status, 200);
    assert.equal(again.data.duplicate, true);

    const bot = await lead({ name: 'Bot', phone: '+998935550000', website: 'http://spam.example' });
    assert.equal(bot.status, 200);

    const admin = await login('admin', 'admin@onecharge.uz', 'Admin2026');
    const { leads } = (await call('/leads', { token: admin })).data;
    assert.equal(leads.filter(l => l.phone === '+998935554433').length, 1);
    assert.ok(!leads.some(l => l.name === 'Bot'));
  });

  test('the admin can update status and note, and a demo reset keeps leads', async () => {
    const admin = await login('admin', 'admin@onecharge.uz', 'Admin2026');
    const first = (await call('/leads', { token: admin })).data.leads[0];

    const upd = await call(`/leads/${first.id}`, { method: 'PATCH', token: admin, body: { status: 'contacted', note: 'Позвонить в пятницу' } });
    assert.equal(upd.status, 200);
    assert.equal(upd.data.status, 'contacted');
    assert.equal((await call(`/leads/${first.id}`, { method: 'PATCH', token: admin, body: { status: 'deleted' } })).status, 400);

    assert.equal((await call('/admin/reset', { method: 'POST', token: admin })).status, 200);
    const admin2 = await login('admin', 'admin@onecharge.uz', 'Admin2026');
    const after = (await call('/leads', { token: admin2 })).data.leads;
    assert.ok(after.some(l => l.id === first.id && l.status === 'contacted'), 'lead survives the reset');
  });

  test('limits how many leads one client can send', async () => {
    let last;
    for (let i = 0; i < 8; i++) last = await lead({ phone: `+99890700000${i}`, company: `Fleet ${i}`, kind: 'fleet' });
    assert.equal(last.status, 429);
  });
});

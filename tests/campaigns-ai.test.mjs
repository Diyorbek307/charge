/**
 * Voli's own campaigns from the admin portal (who pays, where they apply,
 * what the network still gets) and the AI agents of the support chat in
 * their basic mode: answering common questions, calling a person, stepping
 * back when a person answers.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 7800 + Math.floor(Math.random() * 300);
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

async function newDriver(phone, name) {
  const code = (await call('/auth/sms/request', { method: 'POST', body: { phone, purpose: 'register' } })).data.demoCode;
  const r = await call('/auth/register', { method: 'POST', body: { phone, code, name, password: 'Driver2026x', consent: { version: 1, marketing: true } } });
  assert.equal(r.status, 201);
  return r.data.token;
}
const waitFor = async (fn, ms = 4000) => {
  for (let t = 0; t < ms; t += 100) {
    const v = await fn();
    if (v) return v;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
};

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oc-camp-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', ANTHROPIC_API_KEY: '' },
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

describe('campaigns from the admin portal', () => {
  test('a campaign Voli pays for lowers the driver price, leaves the network its full price, and shows everywhere', async () => {
    const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
    assert.equal((await call('/admin/promos', { method: 'POST', token: admin, body: { title: 'Без плательщика', percent: 20 } })).status, 400);

    const created = await call('/admin/promos', { method: 'POST', token: admin, body: { title: 'Неделя Voli', note: 'На всех станциях', percent: 60, funder: 'voli', operatorIds: null, announce: true } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.id;
    const pub = (await call('/promos')).data.find(p => p.id === id);
    assert.equal(pub.funder, 'voli');
    assert.equal(pub.operatorId, null);
    assert.equal(pub.note, 'На всех станциях');

    // Every network sees the campaign in its own portal.
    const op = await login('operator', 'operator@voli.uz', 'Operator2026').catch(() => null);
    if (op) assert.ok((await call('/operator/promos', { token: op })).data.some(p => p.id === id));

    const driver = await newDriver('+998935553001', 'Jasur Olimov');
    const order = (await call('/payments/topup', { method: 'POST', token: driver, body: { provider: 'payme', amount: 500000 } })).data.order;
    await call(`/payments/order/${order.id}/sandbox-confirm`, { method: 'POST', token: driver });
    const st = (await call('/state', { token: driver })).data.stations.find(s => !s.ocpi && !s.private && !s.direct && s.connectors.some(c => c.status === 'available'));
    const c = st.connectors.find(x => x.status === 'available');
    const started = await call('/sessions/start', { method: 'POST', token: driver, body: { stationId: st.id, connectorId: c.id } });
    assert.ok(started.status < 300, JSON.stringify(started.data));
    const s = started.data.session;
    assert.equal(s.promo?.id, id, 'the campaign applies at the start');
    assert.equal(s.promo.funder, 'voli');
    assert.ok(s.price < s.networkPrice, 'the driver pays less than the network gets');
    await new Promise(r => setTimeout(r, 1200));
    const done = (await call(`/sessions/${s.id}/stop`, { method: 'POST', token: driver })).data.session;
    assert.ok(done.cost > 0);

    const overview = (await call('/admin/promos', { token: admin })).data;
    const row = overview.promos.find(p => p.id === id);
    assert.equal(row.uses, 1);
    assert.ok(row.voliPaid > 0, 'Voli pays the network the difference');
    assert.equal(overview.voliPaidMonth, row.voliPaid);
    assert.ok(overview.driversReachable >= 1);

    assert.equal((await call(`/operator/promos/${id}`, { method: 'DELETE', token: admin })).status, 200);
    assert.ok(!(await call('/promos')).data.some(p => p.id === id), 'a stopped campaign leaves the map');
  });

  test('a campaign for chosen networks covers only them', async () => {
    const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
    assert.equal((await call('/admin/promos', { method: 'POST', token: admin, body: { title: 'Нет такой', percent: 10, funder: 'network', operatorIds: ['op-nope'] } })).status, 400);
    const r = await call('/admin/promos', { method: 'POST', token: admin, body: { title: 'Ночь в двух сетях', percent: 10, funder: 'network', operatorIds: ['op-001', 'op-002'], fromHour: 23, toHour: 7 } });
    assert.equal(r.status, 201);
    assert.deepEqual(r.data.operatorIds, ['op-001', 'op-002']);
    assert.equal(r.data.funder, 'network');
  });
});

describe('AI agents in the support chat (basic mode)', () => {
  test('answer common questions, call a person when needed, and step back when a person answers', async () => {
    const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
    const view = (await call('/admin/ai-agents', { token: admin })).data;
    assert.equal(view.on, true);
    assert.equal(view.connected, false, 'no key: the basic mode');
    assert.deepEqual(view.agents.map(a => a.id), ['charging', 'payments', 'account']);

    const driver = await newDriver('+998935553002', 'Malika Rasulova');
    await call('/support/messages', { method: 'POST', token: driver, body: { text: 'Как пополнить кошелёк?' } });
    const first = await waitFor(async () => (await call('/support/messages', { token: driver })).data.messages.find(m => m.from === 'ai'));
    assert.ok(first, 'an agent answers');
    assert.equal(first.agent, 'payments');
    assert.match(first.text, /Payme|Click/);

    await call('/support/messages', { method: 'POST', token: driver, body: { text: 'Списали деньги дважды, верните' } });
    const thread = await waitFor(async () => {
      const t = (await call('/support/messages', { token: driver })).data;
      return t.messages.filter(m => m.from === 'ai').length === 2 ? t : null;
    });
    assert.ok(thread);
    const adminThread = (await call('/admin/support', { token: admin })).data.find(t => t.id === thread.id);
    assert.equal(adminThread.needsHuman, true, 'a money dispute goes to a person');

    // A person answers: the agents stay out of the chat.
    const answered = (await call(`/admin/support/${thread.id}`, { method: 'POST', token: admin, body: { text: 'Проверяю, вернусь через 10 минут' } })).data;
    assert.equal(answered.needsHuman, false);
    assert.ok(answered.aiHoldUntil);
    await call('/support/messages', { method: 'POST', token: driver, body: { text: 'Как пополнить через Click?' } });
    await new Promise(r => setTimeout(r, 600));
    assert.equal((await call('/support/messages', { token: driver })).data.messages.filter(m => m.from === 'ai').length, 2);

    // And come back at the admin's word.
    assert.equal((await call(`/admin/support/${thread.id}`, { method: 'POST', token: admin, body: { ai: true } })).data.aiHoldUntil, null);

    const stats = (await call('/admin/ai-agents', { token: admin })).data.agents.find(a => a.id === 'payments');
    assert.equal(stats.answered, 2);
    assert.equal(stats.handoffs, 1);
  });

  test('the admin edits agents and tries them without writing to anyone', async () => {
    const admin = await login('admin', 'admin@voli.uz', 'Admin2026');
    const saved = (await call('/admin/ai-agents', { method: 'PUT', token: admin, body: { agents: [{ id: 'account', name: 'Профиль и вход' }] } })).data;
    assert.equal(saved.agents.find(a => a.id === 'account').name, 'Профиль и вход');
    const a = (await call('/admin/ai-agents/test', { method: 'POST', token: admin, body: { text: 'Забыл пароль, как войти?' } })).data;
    assert.equal(a.agent, 'account');
    assert.equal(a.agentName, 'Профиль и вход');
    assert.equal(a.handoff, false);
    assert.equal(a.source, 'basic');
    const danger = (await call('/admin/ai-agents/test', { method: 'POST', token: admin, body: { text: 'Авария на трассе, машина дымит' } })).data;
    assert.equal(danger.handoff, true);
    assert.match(danger.reply, /101/);

    // Switched off: drivers get people only.
    await call('/admin/ai-agents', { method: 'PUT', token: admin, body: { on: false } });
    const driver = await newDriver('+998935553003', 'Otabek Nazarov');
    await call('/support/messages', { method: 'POST', token: driver, body: { text: 'Как пополнить кошелёк?' } });
    await new Promise(r => setTimeout(r, 600));
    const t = (await call('/support/messages', { token: driver })).data;
    assert.equal(t.messages.filter(m => m.from === 'ai').length, 0);
    assert.equal(t.aiActive, false);
    await call('/admin/ai-agents', { method: 'PUT', token: admin, body: { on: true } });
  });
});

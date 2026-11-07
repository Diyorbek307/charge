import { db } from './db.js';
import { api, requireAuth } from './api.js';

/**
 * Who wrote to support, at a glance: the admin answering a chat sees the
 * person's account, money and recent trouble beside it, so a question is
 * answered without opening five pages. Drivers, networks and fleets each get
 * what matters for them.
 */

const DAY = 86400_000;
const recent = (list, days) => list.filter(x => Date.now() - Date.parse(x.start ?? x.created ?? x.at) < days * DAY);
const sum = (list, k) => list.reduce((n, x) => n + (x[k] ?? 0), 0);

function driverProfile(a) {
  const sessions = db.data.sessions.filter(s => s.userId === a.id).sort((x, y) => y.start.localeCompare(x.start));
  const done = sessions.filter(s => s.status === 'completed');
  const month = recent(done, 30);
  const failed = recent(sessions.filter(s => s.status === 'failed'), 30);
  const debts = (db.data.creditDebts ?? []).filter(d => d.userId === a.id && !d.paidAt);
  const employee = db.data.employees.find(e => e.driverId === a.id);
  return {
    kind: 'driver',
    id: a.id,
    name: a.name,
    login: a.login,
    since: a.created ?? null,
    blocked: !!a.blocked,
    car: a.car ? [a.car.make, a.car.model].filter(Boolean).join(' ') || null : null,
    balance: db.data.wallets[a.id]?.balance ?? 0,
    debt: sum(debts, 'amount'),
    company: employee ? (db.find('accounts', x => x.portal === 'business')?.org ?? 'Компания') : null,
    totals: { sessions: done.length, spent: sum(done, 'cost'), energy: Math.round(sum(done, 'energy')) },
    month: { sessions: month.length, spent: sum(month, 'cost'), failed: failed.length },
    sessions: sessions.slice(0, 6).map(s => ({ id: s.id, start: s.start, station: s.stationName, energy: s.energy, cost: s.cost, status: s.status, stopReason: s.stopReason ?? null })),
    payments: (db.data.payments ?? []).filter(p => p.userId === a.id).slice(0, 5).map(p => ({ id: p.id, provider: p.provider, amount: p.amount, status: p.status, at: p.paidAt ?? p.created })),
    reports: (db.data.alerts ?? []).filter(x => x.reporterId === a.id).slice(0, 3).map(x => ({ id: x.id, message: x.message, ack: !!x.ack, at: x.ts ?? x.created ?? null })),
  };
}

function operatorProfile(a) {
  const op = db.byId('operators', a.orgId);
  const stations = db.data.stations.filter(s => s.operatorId === a.orgId);
  const connectors = stations.flatMap(s => s.connectors);
  const month = recent(db.data.sessions.filter(s => s.operatorId === a.orgId && s.status === 'completed'), 30);
  const payouts = (db.data.payouts ?? []).filter(p => p.operatorId === a.orgId).sort((x, y) => y.paidAt.localeCompare(x.paidAt));
  return {
    kind: 'operator',
    id: a.id,
    name: a.name,
    login: a.login,
    org: op?.name ?? a.orgId,
    commission: op?.commission ?? null,
    mode: op?.payout?.mode ?? 'platform',
    stations: stations.length,
    connectors: connectors.length,
    down: connectors.filter(c => c.status === 'unavailable').length,
    month: { sessions: month.length, revenue: sum(month, 'cost') },
    openAlerts: (db.data.alerts ?? []).filter(x => x.operatorId === a.orgId && !x.ack).length,
    lastPayout: payouts[0] ? { month: payouts[0].month, amount: payouts[0].amount, paidAt: payouts[0].paidAt, ref: payouts[0].ref } : null,
  };
}

function businessProfile(a) {
  const wallet = db.data.wallets[a.orgId] ?? null;
  const drivers = new Set(db.data.employees.map(e => e.driverId).filter(Boolean));
  const month = recent(db.data.sessions.filter(s => s.corporate && drivers.has(s.userId) && s.status === 'completed'), 30);
  return {
    kind: 'business',
    id: a.id,
    name: a.name,
    login: a.login,
    org: a.org ?? a.orgId,
    balance: wallet?.balance ?? 0,
    employees: db.data.employees.length,
    waiting: db.data.employees.filter(e => !e.driverId).length,
    budget: sum(db.data.employees, 'limit'),
    month: { sessions: month.length, spent: sum(month, 'cost') },
  };
}

api.get('/admin/support/:id/profile', requireAuth('admin'), (req, res) => {
  const t = (db.data.supportThreads ?? []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Обращение не найдено' });
  const a = db.byId('accounts', t.userId);
  if (!a) return res.json({ kind: 'gone', name: t.user });
  if (a.portal === 'operator') return res.json(operatorProfile(a));
  if (a.portal === 'business') return res.json(businessProfile(a));
  if (a.portal === 'api') return res.json({ kind: 'api', id: a.id, name: a.name, login: a.login, org: a.org ?? null, webhooks: (db.data.webhooks ?? []).filter(w => w.ownerId === a.id).length });
  res.json(driverProfile(a));
});

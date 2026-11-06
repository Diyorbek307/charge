import { db } from './db.js';
import { api, requireAuth } from './api.js';
import { adminUsers } from './analytics.js';
import { demandFor } from './demand.js';

/**
 * What waits for the admin, counted in one place: the red marks in the menu
 * and the "needs attention" row on the overview. Each count names the page
 * that deals with it, so a tap leads straight there.
 */
export function inboxFor(now = Date.now()) {
  const d = db.data;
  const sos = (d.sos ?? []).filter(s => s.status === 'open').length;
  const support = (d.supportThreads ?? []).filter(t => t.status !== 'closed' && (t.needsHuman || (t.unreadAdmin ?? 0) > 0)).length;
  const leads = (d.leads ?? []).filter(l => l.status === 'new').length;
  const alerts = (d.alerts ?? []).filter(a => !a.ack).length;
  const critical = (d.alerts ?? []).filter(a => !a.ack && a.severity === 'critical').length;
  const overdue = new Set((d.creditDebts ?? []).filter(x => !x.paidAt && Date.parse(x.dueAt) < now).map(x => x.userId)).size;
  const stuckPayments = (d.payments ?? []).filter(p => p.status === 'pending' && now - Date.parse(p.created) > 86400_000).length;
  const operators = (d.operators ?? []).filter(o => o.status === 'pending').length;
  const photos = (d.driverPhotos ?? []).filter(p => p.status === 'pending').length;
  return {
    items: [
      { key: 'sos', page: 'sos', count: sos, label: 'SOS водителей', urgent: true },
      { key: 'support', page: 'support', count: support, label: 'Чаты ждут ответа', urgent: true },
      { key: 'alerts', page: 'map', count: alerts, label: critical ? `Сбои станций, ${critical} критич.` : 'Сбои станций', urgent: critical > 0 },
      { key: 'leads', page: 'leads', count: leads, label: 'Новые заявки', urgent: false },
      { key: 'operators', page: 'operators', count: operators, label: 'Сети на проверке', urgent: false },
      { key: 'photos', page: 'photos', count: photos, label: 'Фото от водителей', urgent: false },
      { key: 'credit', page: 'credit', count: overdue, label: 'Просрочены долги', urgent: false },
      { key: 'payments', page: 'payments', count: stuckPayments, label: 'Зависшие платежи', urgent: false },
    ],
  };
}

api.get('/admin/inbox', requireAuth('admin'), (_req, res) => {
  res.json(inboxFor());
});

const norm = v => String(v ?? '').toLowerCase().replace(/[\s()+-]/g, '');

/**
 * One box for everything in the admin: drivers by name or phone, stations,
 * networks, charges by their id, applications. Each hit says which page
 * opens it and what to search there.
 */
export function searchAll(raw, limit = 6) {
  const q = norm(raw);
  if (q.length < 2) return [];
  const has = (...fields) => fields.some(f => norm(f).includes(q));
  const d = db.data;
  const hits = [];
  const users = adminUsers().users;
  for (const u of users.filter(u => has(u.name, u.phone)).slice(0, limit)) hits.push({ kind: 'user', id: u.id, title: u.name, sub: [u.phone, u.city].filter(Boolean).join(' · '), page: 'users', query: u.phone || u.name });
  for (const s of d.stations.filter(s => has(s.name, s.city, s.address, s.id)).slice(0, limit)) hits.push({ kind: 'station', id: s.id, title: s.name, sub: `${s.city} · ${s.operator}`, page: 'map', query: s.name });
  for (const o of d.operators.filter(o => has(o.name, o.contact)).slice(0, limit)) hits.push({ kind: 'operator', id: o.id, title: o.name, sub: o.contact ?? '', page: 'operators', query: o.name });
  for (const s of d.sessions.filter(s => has(s.id)).slice(0, limit)) hits.push({ kind: 'session', id: s.id, title: s.id, sub: `${s.user} · ${s.stationName}`, page: 'sessions', query: s.id });
  for (const l of (d.leads ?? []).filter(l => has(l.name, l.phone, l.company, l.id)).slice(0, limit)) hits.push({ kind: 'lead', id: l.id, title: l.company || l.name, sub: `${l.id} · ${l.phone}`, page: 'leads', query: l.phone });
  return hits;
}

api.get('/admin/search', requireAuth('admin'), (req, res) => {
  res.json({ hits: searchAll(String(req.query.q ?? '').slice(0, 60)) });
});

/**
 * What waits for a network in its own portal, about its own stations only:
 * faults not yet acknowledged, connectors out of order, stations that let
 * drivers down, and stations short of connectors.
 */
export function networkInboxFor(operatorId) {
  const d = db.data;
  const mine = d.stations.filter(s => s.operatorId === operatorId);
  const ids = new Set(mine.map(s => s.id));
  const alerts = (d.alerts ?? []).filter(a => !a.ack && (a.operatorId === operatorId || ids.has(a.stationId))).length;
  const down = mine.reduce((n, s) => n + s.connectors.filter(c => c.status === 'unavailable').length, 0);
  const weak = mine.filter(s => s.reliability && s.reliability.score < 90).length;
  const short = demandFor().stations.filter(s => ids.has(s.id) && s.fullHours >= 5).length;
  return {
    items: [
      { key: 'alerts', page: 'alerts', count: alerts, label: 'Оповещения без ответа', urgent: true },
      { key: 'down', page: 'stations', count: down, label: 'Разъёмы не работают', urgent: down > 0 },
      { key: 'weak', page: 'stations', count: weak, label: 'Станции с надёжностью ниже 90%', urgent: false },
      { key: 'short', page: 'stations', count: short, label: 'Не хватает разъёмов', urgent: false },
    ],
  };
}

api.get('/operator/inbox', requireAuth('operator'), (req, res) => {
  res.json(networkInboxFor(req.account.orgId));
});

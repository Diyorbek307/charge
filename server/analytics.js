import { db } from './db.js';

/**
 * Aggregates for the dashboards, computed from sessions on every request so
 * the numbers always match the tables next to them.
 *
 * Scope follows the viewer: the admin sees the network, an operator its own
 * stations, a fleet its corporate sessions, a driver their own charges.
 */

const TZ = 5 * 3600_000; // Asia/Tashkent, no DST
const DAY = 86400_000;
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

const tkDate = ms => new Date(ms + TZ).toISOString().slice(0, 10);
const tkHour = ms => new Date(ms + TZ).getUTCHours();
const tkWeekday = ms => (new Date(ms + TZ).getUTCDay() + 6) % 7; // Mon = 0
const tkMidnight = ms => Math.floor((ms + TZ) / DAY) * DAY - TZ;
const monthKey = ms => tkDate(ms).slice(0, 7);

/** Masks a phone for viewers who should not see it in full. */
export const maskPhone = p => (p ? `${p.slice(0, 6)} ${p.slice(6, 8)} ••• •• ${p.slice(-2)}` : '');

function scopeSessions(viewer) {
  const all = db.data.sessions;
  switch (viewer?.portal) {
    case 'admin':
      return all;
    case 'operator':
      return all.filter(s => s.operatorId === viewer.orgId);
    case 'business':
      return all.filter(s => s.corporate);
    case 'driver':
      return all.filter(s => s.userId === viewer.id);
    default:
      return [];
  }
}

function scopeStations(viewer) {
  const all = db.data.stations;
  return viewer?.portal === 'operator' ? all.filter(s => s.operatorId === viewer.orgId) : all;
}

function totalsOf(list, stations, periodDays) {
  const done = list.filter(s => s.status === 'completed');
  const energy = done.reduce((n, s) => n + s.energy, 0);
  const revenue = done.reduce((n, s) => n + s.cost, 0);
  const minutes = done.reduce((n, s) => n + (Date.parse(s.end) - Date.parse(s.start)) / 60000, 0);
  const users = new Map();
  for (const s of done) users.set(s.userId, (users.get(s.userId) ?? 0) + 1);
  const repeat = [...users.values()].filter(n => n > 1).length;
  const commission = done.reduce((n, s) => n + s.cost * (rateOf(s.operatorId) / 100), 0);
  // Share of connector-hours spent charging over the period.
  const evse = stations.reduce((n, st) => n + st.connectors.length, 0);
  const utilization = evse ? (minutes / 60) / (evse * 24 * periodDays) : 0;
  return {
    sessions: list.length,
    completed: done.length,
    failed: list.filter(s => s.status === 'failed').length,
    energy: round(energy, 1),
    revenue: Math.round(revenue),
    commission: Math.round(commission),
    payout: Math.round(revenue - commission),
    avgKwh: done.length ? round(energy / done.length, 1) : 0,
    avgCheck: done.length ? Math.round(revenue / done.length) : 0,
    avgMinutes: done.length ? Math.round(minutes / done.length) : 0,
    avgPrice: energy ? Math.round(revenue / energy) : 0,
    uniqueUsers: users.size,
    repeatShare: users.size ? round((repeat / users.size) * 100, 1) : 0,
    utilization: round(utilization * 100, 1),
    successRate: list.length ? round((done.length / list.filter(s => s.status !== 'active').length) * 100, 1) : 100,
  };
}

function rateOf(operatorId) {
  return db.byId('operators', operatorId)?.commission ?? 3;
}

const pct = (now, before) => (before ? round(((now - before) / before) * 100, 1) : null);

export function analyticsFor(viewer, { days = 30 } = {}) {
  const now = Date.now();
  const span = Math.min(Math.max(Number(days) || 30, 1), 45);
  const from = tkMidnight(now) - (span - 1) * DAY;
  const prevFrom = from - span * DAY;

  const scoped = scopeSessions(viewer);
  const stations = scopeStations(viewer);
  const inRange = scoped.filter(s => Date.parse(s.start) >= from);
  const prevRange = scoped.filter(s => {
    const t = Date.parse(s.start);
    return t >= prevFrom && t < from;
  });
  const done = inRange.filter(s => s.status === 'completed');

  const totals = totalsOf(inRange, stations, span);
  const prev = totalsOf(prevRange, stations, span);
  const today = totalsOf(scoped.filter(s => Date.parse(s.start) >= tkMidnight(now)), stations, 1);

  const daily = [];
  for (let t = from; t <= now; t += DAY) {
    const key = tkDate(t);
    const list = done.filter(s => tkDate(Date.parse(s.start)) === key);
    daily.push({
      date: key,
      sessions: list.length,
      energy: round(list.reduce((n, s) => n + s.energy, 0), 1),
      revenue: list.reduce((n, s) => n + s.cost, 0),
    });
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, energy: 0 }));
  const weekday = Array.from({ length: 7 }, (_, day) => ({ day, sessions: 0, revenue: 0 }));
  const connectors = new Map();
  for (const s of done) {
    const t = Date.parse(s.start);
    hourly[tkHour(t)].sessions += 1;
    hourly[tkHour(t)].energy = round(hourly[tkHour(t)].energy + s.energy, 1);
    weekday[tkWeekday(t)].sessions += 1;
    weekday[tkWeekday(t)].revenue += s.cost;
    const c = connectors.get(s.connector) ?? { type: s.connector, sessions: 0, energy: 0 };
    c.sessions += 1;
    c.energy = round(c.energy + s.energy, 1);
    connectors.set(s.connector, c);
  }
  const connectorList = [...connectors.values()]
    .map(c => ({ ...c, share: done.length ? round((c.sessions / done.length) * 100, 1) : 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  const byStation = stations
    .map(st => {
      const list = done.filter(s => s.stationId === st.id);
      const minutes = list.reduce((n, s) => n + (Date.parse(s.end) - Date.parse(s.start)) / 60000, 0);
      return {
        id: st.id,
        name: st.name,
        city: st.city,
        operator: st.operator,
        operatorId: st.operatorId,
        connectors: st.connectors.length,
        free: st.connectors.filter(c => c.status === 'available').length,
        sessions: list.length,
        energy: round(list.reduce((n, s) => n + s.energy, 0), 1),
        revenue: list.reduce((n, s) => n + s.cost, 0),
        utilization: round(((minutes / 60) / (st.connectors.length * 24 * span)) * 100, 1),
        rating: st.rating,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const cities = new Map();
  for (const st of byStation) {
    const c = cities.get(st.city) ?? { city: st.city, stations: 0, connectors: 0, sessions: 0, revenue: 0, energy: 0 };
    c.stations += 1;
    c.connectors += st.connectors;
    c.sessions += st.sessions;
    c.revenue += st.revenue;
    c.energy = round(c.energy + st.energy, 1);
    cities.set(st.city, c);
  }

  const operatorIds = viewer?.portal === 'operator' ? [viewer.orgId] : viewer?.portal === 'admin' ? db.data.operators.map(o => o.id) : [];
  const operators = operatorIds.map(id => {
    const o = db.byId('operators', id);
    const own = db.data.stations.filter(st => st.operatorId === id);
    const t = totalsOf(inRange.filter(s => s.operatorId === id), own, span);
    const p = totalsOf(prevRange.filter(s => s.operatorId === id), own, span);
    return {
      id,
      name: o.name,
      logo: o.logo,
      status: o.status,
      integration: o.integration,
      since: o.since,
      region: o.region,
      contact: o.contact,
      iban: o.iban,
      commissionRate: o.commission,
      stations: own.length,
      evse: own.reduce((n, st) => n + st.connectors.length, 0),
      online: own.reduce((n, st) => n + st.connectors.filter(c => c.status !== 'unavailable').length, 0),
      ...t,
      revenueDelta: pct(t.revenue, p.revenue),
      trend: daily.map(d => done.filter(s => s.operatorId === id && tkDate(Date.parse(s.start)) === d.date).reduce((n, s) => n + s.cost, 0)),
    };
  });

  // Six months: roll-ups for older months, live sessions for recent ones.
  const monthly = new Map();
  // Roll-ups are per operator, so only network views can use them.
  const ownMonthly =
    viewer?.portal === 'admin' || viewer?.portal === 'operator'
      ? (db.data.monthly ?? []).filter(m => operatorIds.includes(m.operatorId))
      : [];
  {
    for (const m of ownMonthly) {
      const row = monthly.get(m.month) ?? { month: m.month, sessions: 0, energy: 0, revenue: 0, commission: 0 };
      row.sessions += m.sessions;
      row.energy += m.energy;
      row.revenue += m.revenue;
      row.commission += Math.round(m.revenue * (rateOf(m.operatorId) / 100));
      monthly.set(m.month, row);
    }
  }
  for (const s of scoped) {
    if (s.status !== 'completed') continue;
    const key = monthKey(Date.parse(s.start));
    if (ownMonthly.some(m => m.month === key)) continue;
    const row = monthly.get(key) ?? { month: key, sessions: 0, energy: 0, revenue: 0, commission: 0 };
    row.sessions += 1;
    row.energy = round(row.energy + s.energy, 1);
    row.revenue += s.cost;
    row.commission += Math.round(s.cost * (rateOf(s.operatorId) / 100));
    monthly.set(key, row);
  }
  const months = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  const result = {
    range: { from: new Date(from).toISOString(), to: new Date(now).toISOString(), days: span },
    totals,
    prev,
    today,
    deltas: {
      sessions: pct(totals.sessions, prev.sessions),
      energy: pct(totals.energy, prev.energy),
      revenue: pct(totals.revenue, prev.revenue),
      avgCheck: pct(totals.avgCheck, prev.avgCheck),
      uniqueUsers: pct(totals.uniqueUsers, prev.uniqueUsers),
      avgMinutes: pct(totals.avgMinutes, prev.avgMinutes),
    },
    network: {
      stations: stations.length,
      connectors: stations.reduce((n, st) => n + st.connectors.length, 0),
      online: stations.reduce((n, st) => n + st.connectors.filter(c => c.status !== 'unavailable').length, 0),
      busy: stations.reduce((n, st) => n + st.connectors.filter(c => c.status === 'occupied').length, 0),
      cities: cities.size,
      active: scoped.filter(s => s.status === 'active').length,
    },
    daily,
    hourly,
    weekday,
    connectors: connectorList,
    stations: byStation,
    cities: [...cities.values()].sort((a, b) => b.revenue - a.revenue),
    operators,
    monthly: months,
  };

  // Customers: full contact for the admin, masked for operators.
  if (viewer?.portal === 'admin' || viewer?.portal === 'operator') {
    const customers = new Map((db.data.customers ?? []).map(c => [c.id, c]));
    const rows = new Map();
    for (const s of done) {
      const row = rows.get(s.userId) ?? { id: s.userId, sessions: 0, spent: 0, energy: 0, last: s.start, stations: new Set() };
      row.sessions += 1;
      row.spent += s.cost;
      row.energy = round(row.energy + s.energy, 1);
      if (s.start > row.last) row.last = s.start;
      row.stations.add(s.stationId);
      rows.set(s.userId, row);
    }
    result.customers = [...rows.values()]
      .map(r => {
        const c = customers.get(r.id) ?? db.byId('accounts', r.id);
        return {
          id: r.id,
          name: c?.name ?? r.id,
          phone: viewer.portal === 'admin' ? c?.phone ?? c?.login ?? '' : maskPhone(c?.phone ?? c?.login ?? ''),
          car: c?.car ?? '',
          city: c?.city ?? '',
          sessions: r.sessions,
          spent: r.spent,
          energy: r.energy,
          last: r.last,
          stations: r.stations.size,
        };
      })
      .sort((a, b) => b.spent - a.spent);
  }

  if (viewer?.portal === 'business' || viewer?.portal === 'admin') {
    result.employees = db.data.employees.map(e => {
      const list = done.filter(s => s.userId === e.driverId && s.corporate);
      return {
        id: e.id,
        name: e.name,
        dept: e.dept,
        vehicle: e.vehicle,
        limit: e.limit,
        spentMonth: e.spent,
        sessions: list.length,
        energy: round(list.reduce((n, s) => n + s.energy, 0), 1),
        spent: list.reduce((n, s) => n + s.cost, 0),
      };
    });
    const depts = new Map();
    for (const e of result.employees) {
      const d = depts.get(e.dept) ?? { dept: e.dept, spent: 0, sessions: 0 };
      d.spent += e.spent;
      d.sessions += e.sessions;
      depts.set(e.dept, d);
    }
    result.departments = [...depts.values()].sort((a, b) => b.spent - a.spent);
  }

  return result;
}

/**
 * The admin's user directory: seeded customers plus drivers who signed up
 * through SMS, with their activity over the last 45 days.
 */
export function adminUsers() {
  const accounts = db.data.accounts.filter(a => a.portal === 'driver');
  const customers = db.data.customers ?? [];
  const known = new Set(customers.map(c => c.id));
  const list = [
    ...customers,
    ...accounts
      .filter(a => !known.has(a.id))
      .map(a => ({ id: a.id, name: a.name, phone: a.login, car: '', city: '', registered: a.created ?? null, status: a.blocked ? 'blocked' : 'active', selfRegistered: true })),
  ];
  const stats = new Map();
  for (const s of db.data.sessions) {
    if (s.status !== 'completed') continue;
    const row = stats.get(s.userId) ?? { sessions: 0, spent: 0, last: null };
    row.sessions += 1;
    row.spent += s.cost;
    if (!row.last || s.start > row.last) row.last = s.start;
    stats.set(s.userId, row);
  }
  const weekAgo = Date.now() - 7 * DAY;
  return {
    total: list.length,
    active: list.filter(u => u.status === 'active' && stats.has(u.id)).length,
    newWeek: list.filter(u => u.registered && Date.parse(u.registered) >= weekAgo).length,
    blocked: list.filter(u => u.status === 'blocked').length,
    users: list
      .map(u => ({ ...u, ...(stats.get(u.id) ?? { sessions: 0, spent: 0, last: null }) }))
      .sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '')),
  };
}

export function setUserStatus(id, status) {
  if (status === 'blocked') db.data.tokens = db.data.tokens.filter(t => t.accountId !== id);
  const customer = (db.data.customers ?? []).find(c => c.id === id);
  if (customer) {
    customer.status = status;
    db.save();
    return customer;
  }
  const account = db.data.accounts.find(a => a.id === id && a.portal === 'driver');
  if (!account) return null;
  account.blocked = status === 'blocked';
  db.save();
  return { id, status };
}

/** A blocked driver is signed out everywhere and cannot sign in again. */
export function isBlocked(accountId) {
  if (db.data.accounts.find(a => a.id === accountId)?.blocked) return true;
  return (db.data.customers ?? []).some(c => c.id === accountId && c.status === 'blocked');
}

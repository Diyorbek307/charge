import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * Driver features beyond charging itself: when a busy connector frees up,
 * community reports, loyalty points, SOS, family wallets and private hosts.
 * Routes are mounted from api.js, which passes its auth and event helpers.
 */

const DAY = 86400_000;
const now = () => Date.now();
const id = prefix => `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const short = name => {
  const [a, b] = String(name ?? '').split(' ');
  return b ? `${a} ${b[0]}.` : a || 'Водитель';
};
const tkMonthStart = (t = now()) => {
  const d = new Date(t + 5 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 5 * 3600_000;
};

// ---------------------------------------------------------------------------
// When will a busy connector be free
// ---------------------------------------------------------------------------

let typical = { at: 0, dc: 45, ac: 120 };
/** Median length of a completed charge, fast and slow, over 30 days — refreshed every 10 minutes. */
function typicalMinutes() {
  if (now() - typical.at < 10 * 60_000) return typical;
  const since = now() - 30 * DAY;
  const pick = fast =>
    db.data.sessions
      .filter(s => s.status === 'completed' && s.end && Date.parse(s.start) >= since && ((s.power ?? 50) >= 50) === fast)
      .map(s => (Date.parse(s.end) - Date.parse(s.start)) / 60000)
      .sort((a, b) => a - b);
  const median = list => (list.length ? Math.round(list[Math.floor(list.length / 2)]) : null);
  typical = { at: now(), dc: median(pick(true)) ?? 45, ac: median(pick(false)) ?? 120 };
  return typical;
}

/** Per connector: free now, or an estimate of when the running charge ends; plus the queue's expected wait. */
export function stationForecast(station) {
  const t = typicalMinutes();
  const connectors = station.connectors.map(c => {
    if (c.status !== 'occupied') return { id: c.id, status: c.status, freeInMin: c.status === 'available' ? 0 : null };
    const s = db.data.sessions.find(x => x.status === 'active' && x.stationId === station.id && x.connectorId === c.id);
    if (!s) return { id: c.id, status: c.status, freeInMin: null };
    const typicalLen = (c.power ?? 50) >= 50 ? t.dc : t.ac;
    const planned = s.plannedEnd ? Date.parse(s.plannedEnd) : Date.parse(s.start) + typicalLen * 60_000;
    // A charge running past its typical length usually ends soon; never promise "now".
    return { id: c.id, status: c.status, freeInMin: Math.max(3, Math.round((planned - now()) / 60000)), basis: s.plannedEnd ? 'planned' : 'typical' };
  });
  const busy = connectors.filter(c => c.freeInMin !== null && c.freeInMin > 0).map(c => c.freeInMin).sort((a, b) => a - b);
  const queue = (db.data.queues ?? []).filter(q => q.stationId === station.id).length;
  return {
    stationId: station.id,
    connectors,
    nextFreeInMin: connectors.some(c => c.freeInMin === 0) ? 0 : busy[0] ?? null,
    queue,
    // Each driver ahead takes the next connector to free up.
    queueWaitMin: queue && busy.length ? busy[Math.min(queue - 1, busy.length - 1)] + Math.floor((queue - 1) / Math.max(1, busy.length)) * (t.dc) : null,
    typical: { dc: t.dc, ac: t.ac },
  };
}

// ---------------------------------------------------------------------------
// Community reports: drivers tell each other how a station really is
// ---------------------------------------------------------------------------

export const REPORT_KINDS = ['works', 'broken', 'queue', 'no_queue', 'power', 'access'];
const reports = () => (db.data.communityReports ??= []);

export function addReport(account, station, { kind, value, note }) {
  if (!REPORT_KINDS.includes(kind)) return { error: 'Неизвестный тип отметки' };
  let power = null;
  if (kind === 'power') {
    power = Math.round(Number(value));
    if (!(power >= 1 && power <= 400)) return { error: 'Мощность — от 1 до 400 кВт' };
  }
  // One fresh report of a kind per driver and station: later ones replace it.
  const recent = reports().find(r => r.stationId === station.id && r.userId === account.id && r.kind === kind && now() - Date.parse(r.ts) < 6 * 3600_000);
  if (recent) return { error: 'Вы уже отмечали это на станции за последние 6 часов', status: 409 };
  if (reports().filter(r => r.userId === account.id && now() - Date.parse(r.ts) < DAY).length >= 20) return { error: 'Не больше 20 отметок в сутки', status: 429 };
  const report = {
    id: id('CR'),
    stationId: station.id,
    userId: account.id,
    user: short(account.name),
    kind,
    value: power,
    note: String(note ?? '').trim().slice(0, 200),
    ts: new Date().toISOString(),
    confirms: [],
    // Charged here within a day: the report comes from someone who was there.
    verified: db.data.sessions.some(s => s.userId === account.id && s.stationId === station.id && now() - Date.parse(s.start) < DAY),
  };
  reports().unshift(report);
  if (reports().length > 3000) reports().length = 3000;
  db.save();
  return { report };
}

export function confirmReport(account, reportId) {
  const r = reports().find(x => x.id === reportId);
  if (!r) return { error: 'Отметка не найдена', status: 404 };
  if (r.userId === account.id) return { error: 'Нельзя подтвердить свою отметку', status: 409 };
  if (r.confirms.includes(account.id)) return { error: 'Вы уже подтвердили', status: 409 };
  if (now() - Date.parse(r.ts) > DAY) return { error: 'Отметка устарела', status: 409 };
  r.confirms.push(account.id);
  // The author earns points when others confirm what they saw.
  addPoints(r.userId, 5, 'Подтверждённая отметка о станции');
  db.save();
  return { report: r };
}

/** The last 24 hours of reports for a station, summarised. */
export function stationCommunity(stationId) {
  const fresh = reports().filter(r => r.stationId === stationId && now() - Date.parse(r.ts) < DAY);
  const count = kind => fresh.filter(r => r.kind === kind).reduce((n, r) => n + 1 + r.confirms.length, 0);
  const powers = fresh.filter(r => r.kind === 'power').map(r => r.value);
  return {
    works: count('works'),
    broken: count('broken'),
    queue: count('queue'),
    noQueue: count('no_queue'),
    access: count('access'),
    power: powers.length ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null,
    reports: fresh.slice(0, 20).map(({ confirms, ...r }) => ({ ...r, confirms: confirms.length })),
  };
}

// ---------------------------------------------------------------------------
// Loyalty: points for charging and for helpful reports, redeemed into the wallet
// ---------------------------------------------------------------------------

export const POINT_VALUE_UZS = 10; // 100 points = 1 000 сум
const ledger = () => (db.data.points ??= []);

export function addPoints(userId, delta, reason) {
  if (!delta) return;
  ledger().unshift({ id: id('PT'), userId, delta, reason, ts: new Date().toISOString() });
  if (ledger().length > 20000) ledger().length = 20000;
}

export function loyaltyFor(userId) {
  const mine = ledger().filter(p => p.userId === userId);
  const balance = mine.reduce((n, p) => n + p.delta, 0);
  const earned90 = mine.filter(p => p.delta > 0 && now() - Date.parse(p.ts) < 90 * DAY).reduce((n, p) => n + p.delta, 0);
  const tier = earned90 >= 1000 ? 'gold' : earned90 >= 300 ? 'silver' : 'start';
  const confirmed = reports().filter(r => r.userId === userId && r.confirms.length > 0).length;
  return {
    balance,
    earned90,
    tier,
    next: tier === 'gold' ? null : { tier: tier === 'start' ? 'silver' : 'gold', need: (tier === 'start' ? 300 : 1000) - earned90 },
    trusted: confirmed >= 10,
    confirmedReports: confirmed,
    valueUzs: balance * POINT_VALUE_UZS,
    history: mine.slice(0, 30),
  };
}

export function redeemPoints(userId, points) {
  const n = Number(points);
  if (!Number.isInteger(n) || n < 100 || n % 100) return { error: 'Списываются от 100 баллов, кратно 100' };
  const { balance } = loyaltyFor(userId);
  if (n > balance) return { error: 'Недостаточно баллов', status: 409 };
  const wallet = db.data.wallets[userId];
  if (!wallet) return { error: 'Кошелёк не найден', status: 404 };
  addPoints(userId, -n, 'Обмен на баланс кошелька');
  wallet.balance += n * POINT_VALUE_UZS;
  db.save();
  return { wallet, amount: n * POINT_VALUE_UZS };
}

// ---------------------------------------------------------------------------
// SOS: a driver in trouble reaches the platform's dispatcher
// ---------------------------------------------------------------------------

export const SOS_KINDS = ['tow', 'mobile_charge', 'breakdown', 'accident', 'station', 'other'];
const sosList = () => (db.data.sos ??= []);

export function createSos(account, b) {
  if (!SOS_KINDS.includes(b.kind)) return { error: 'Выберите, что случилось' };
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const hasPlace = Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lat < 50 && lng > 50 && lng < 80;
  if (sosList().some(x => x.userId === account.id && x.status !== 'closed')) return { error: 'У вас уже есть открытая заявка — диспетчер с ней работает', status: 409 };
  const sos = {
    id: id('SOS'),
    userId: account.id,
    user: account.name,
    phone: account.login,
    kind: b.kind,
    lat: hasPlace ? lat : null,
    lng: hasPlace ? lng : null,
    note: String(b.note ?? '').trim().slice(0, 300),
    status: 'open',
    ts: new Date().toISOString(),
    takenBy: null,
    closedAt: null,
  };
  sosList().unshift(sos);
  if (sosList().length > 2000) sosList().length = 2000;
  db.save();
  return { sos };
}

export function setSosStatus(sosId, status, actor) {
  const s = sosList().find(x => x.id === sosId);
  if (!s) return { error: 'Заявка не найдена', status: 404 };
  if (!['taken', 'closed'].includes(status)) return { error: 'Статус: taken или closed' };
  s.status = status;
  if (status === 'taken') s.takenBy = actor.name;
  if (status === 'closed') s.closedAt = new Date().toISOString();
  db.save();
  return { sos: s };
}

export const sosFor = userId => sosList().filter(s => s.userId === userId).slice(0, 10);
export const allSos = () => sosList().slice(0, 200);

// ---------------------------------------------------------------------------
// Family: a driver lets relatives pay from their wallet, each within a monthly limit
// ---------------------------------------------------------------------------

const families = () => (db.data.families ??= []);
// { ownerId, memberId, limit, status: 'pending' | 'active', invitedAt }

export function familySpend(ownerId, memberId) {
  const from = tkMonthStart();
  return db.data.sessions
    .filter(s => s.familyOwner === ownerId && s.userId === memberId && s.status === 'completed' && Date.parse(s.start) >= from)
    .reduce((n, s) => n + s.cost, 0);
}

export function inviteFamily(owner, { phone, limit }) {
  const member = db.data.accounts.find(a => a.portal === 'driver' && a.login === phone);
  if (!member) return { error: 'Водитель с таким номером не зарегистрирован', status: 404 };
  if (member.id === owner.id) return { error: 'Нельзя пригласить себя', status: 409 };
  const lim = Math.round(Number(limit));
  if (!(lim >= 10_000 && lim <= 10_000_000)) return { error: 'Лимит — от 10 000 до 10 000 000 сум в месяц' };
  if (families().filter(f => f.ownerId === owner.id).length >= 5) return { error: 'В семье до 5 человек', status: 409 };
  if (families().some(f => f.ownerId === owner.id && f.memberId === member.id)) return { error: 'Этот водитель уже в вашей семье', status: 409 };
  const link = { ownerId: owner.id, memberId: member.id, limit: lim, status: 'pending', invitedAt: new Date().toISOString() };
  families().push(link);
  db.save();
  return { link, member };
}

export function answerFamily(member, ownerId, accept) {
  const link = families().find(f => f.ownerId === ownerId && f.memberId === member.id && f.status === 'pending');
  if (!link) return { error: 'Приглашение не найдено', status: 404 };
  if (accept) link.status = 'active';
  else families().splice(families().indexOf(link), 1);
  db.save();
  return { link: accept ? link : null };
}

export function updateFamily(owner, memberId, { limit, remove }) {
  const link = families().find(f => f.ownerId === owner.id && f.memberId === memberId);
  if (!link) return { error: 'Не найден', status: 404 };
  if (remove) {
    families().splice(families().indexOf(link), 1);
    db.save();
    return { removed: true };
  }
  const lim = Math.round(Number(limit));
  if (!(lim >= 10_000 && lim <= 10_000_000)) return { error: 'Лимит — от 10 000 до 10 000 000 сум в месяц' };
  link.limit = lim;
  db.save();
  return { link };
}

/** For the state: who I pay for, and whose wallets I may use. */
export function familyFor(userId) {
  const name = id => db.byId('accounts', id)?.name ?? id;
  const phone = id => db.byId('accounts', id)?.login ?? '';
  return {
    members: families().filter(f => f.ownerId === userId).map(f => ({ memberId: f.memberId, name: name(f.memberId), phone: phone(f.memberId), limit: f.limit, status: f.status, spent: familySpend(userId, f.memberId) })),
    payers: families().filter(f => f.memberId === userId).map(f => {
      const spent = familySpend(f.ownerId, userId);
      return { ownerId: f.ownerId, name: name(f.ownerId), limit: f.limit, status: f.status, spent, left: Math.max(0, f.limit - spent) };
    }),
  };
}

/** May this driver charge to that owner's wallet right now, and how much is left. */
export function familyAllowance(memberId, ownerId) {
  const link = families().find(f => f.ownerId === ownerId && f.memberId === memberId && f.status === 'active');
  if (!link) return null;
  return { left: link.limit - familySpend(ownerId, memberId), limit: link.limit };
}

// ---------------------------------------------------------------------------
// Private hosts: homes, hotels and offices share their charger and earn
// ---------------------------------------------------------------------------

export const HOST_KINDS = ['home', 'hotel', 'business', 'parking', 'cafe'];
export const HOST_COMMISSION = 10; // % the platform keeps from a host's charges
const applications = () => (db.data.hostApplications ??= []);

export function applyHost(account, b, validate) {
  if (!HOST_KINDS.includes(b.kind)) return { error: 'Выберите, где стоит зарядка' };
  const checked = validate(b);
  if (checked.error) return checked;
  if (applications().some(a => a.userId === account.id && a.status === 'pending')) return { error: 'Ваша заявка уже на проверке', status: 409 };
  const app = {
    id: id('HOST'),
    userId: account.id,
    user: account.name,
    phone: account.login,
    kind: b.kind,
    ...checked.data,
    note: String(b.note ?? '').trim().slice(0, 300),
    status: 'pending',
    ts: new Date().toISOString(),
    decidedAt: null,
    reason: null,
    stationId: null,
  };
  applications().unshift(app);
  db.save();
  return { application: app };
}

/** Approving makes the host a small operator of its own, with its station waiting for OCPP. */
export function decideHost(appId, approve, reason, createStation) {
  const app = applications().find(a => a.id === appId);
  if (!app) return { error: 'Заявка не найдена', status: 404 };
  if (app.status !== 'pending') return { error: 'Заявка уже рассмотрена', status: 409 };
  app.decidedAt = new Date().toISOString();
  if (!approve) {
    app.status = 'rejected';
    app.reason = String(reason ?? '').trim().slice(0, 200) || 'Без комментария';
    db.save();
    return { application: app };
  }
  const opId = `host-${app.userId}`;
  let operator = db.byId('operators', opId);
  if (!operator) {
    operator = {
      id: opId,
      name: `${app.user} · частная`,
      logo: '⌂',
      status: 'active',
      integration: 'OCPP 1.6-J',
      since: new Date().toISOString().slice(0, 10),
      region: app.city,
      contact: app.phone,
      iban: '',
      commission: HOST_COMMISSION,
      stations: 0,
      evse: 0,
      revenue: 0,
      sessions: 0,
      host: true,
      ownerId: app.userId,
    };
    db.data.operators.push(operator);
  }
  const station = createStation(operator, app);
  station.private = { kind: app.kind, ownerId: app.userId };
  app.status = 'approved';
  app.stationId = station.id;
  db.save();
  return { application: app, station };
}

export const hostApplicationsFor = userId => applications().filter(a => a.userId === userId);
export const allHostApplications = () => applications();

/** What a host has earned: their stations' completed charges minus the platform share. */
export function hostEarnings(userId) {
  const opId = `host-${userId}`;
  const stations = db.data.stations.filter(s => s.operatorId === opId);
  const ids = new Set(stations.map(s => s.id));
  const done = db.data.sessions.filter(s => ids.has(s.stationId) && s.status === 'completed');
  const gross = done.reduce((n, s) => n + s.cost, 0);
  const net = done.reduce((n, s) => n + Math.round(s.cost * (1 - (s.commissionRate ?? HOST_COMMISSION) / 100)), 0);
  return { stations, sessions: done.length, energy: Math.round(done.reduce((n, s) => n + s.energy, 0)), gross, net };
}

import { db } from './db.js';

/**
 * Admin tools computed from live data: risk signals, charge-record checks and
 * the tariff windows. Rules, not a model — every finding names the records
 * it is based on so an admin can check it.
 */

const DAY = 86400_000;
const nameOf = id => (db.data.customers ?? []).find(c => c.id === id)?.name ?? db.byId('accounts', id)?.name ?? id;
const hoursOf = s => Math.max(0, (Date.parse(s.end) - Date.parse(s.start)) / 3600_000);

/** The most a connector could have delivered in the session's time, with 5% meter tolerance. */
const maxEnergy = s => (s.power ?? 350) * hoursOf(s) * 1.05 + 0.5;

export function riskReport(now = Date.now()) {
  const reviews = (db.data.riskReviews ??= {});
  const since = now - 30 * DAY;
  const sessions = db.data.sessions.filter(s => Date.parse(s.start) >= since);
  const findings = [];
  const add = f => findings.push({ ...f, review: reviews[f.id] ?? null });

  // Repeated failed starts in a week: a broken car adapter, or someone probing chargers.
  const week = now - 7 * DAY;
  const failed = new Map();
  for (const s of sessions) if (s.status === 'failed' && Date.parse(s.start) >= week) failed.set(s.userId, [...(failed.get(s.userId) ?? []), s]);
  for (const [userId, list] of failed) {
    if (list.length < 3) continue;
    add({
      id: `failed:${userId}:${list[0].id}`,
      rule: 'failed_starts',
      risk: list.length >= 5 ? 'high' : 'medium',
      userId,
      user: nameOf(userId),
      detail: `${list.length} неудачных запусков за 7 дней на ${new Set(list.map(s => s.stationId)).size} станциях`,
      at: list[0].start,
      refs: list.map(s => s.id),
    });
  }

  // More energy than the connector could physically deliver in that time.
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.end || s.energy <= maxEnergy(s)) continue;
    add({
      id: `energy:${s.id}`,
      rule: 'impossible_energy',
      risk: 'critical',
      userId: s.userId,
      user: nameOf(s.userId),
      detail: `${s.energy} кВт·ч за ${Math.round(hoursOf(s) * 60)} мин на разъёме ${s.power ?? '?'} кВт — больше физически возможного (${Math.round(maxEnergy(s))} кВт·ч)`,
      at: s.start,
      refs: [s.id],
    });
  }

  // One account charging two cars at once: a shared or stolen account.
  const byUser = new Map();
  for (const s of sessions) if (s.status !== 'failed') byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const prevEnd = Date.parse(prev.end ?? new Date(now).toISOString());
      if (Date.parse(cur.start) < prevEnd - 60_000 && prev.stationId !== cur.stationId) {
        add({
          id: `overlap:${prev.id}:${cur.id}`,
          rule: 'parallel_sessions',
          risk: 'high',
          userId,
          user: nameOf(userId),
          detail: `Две зарядки одновременно: ${prev.stationName} и ${cur.stationName}`,
          at: cur.start,
          refs: [prev.id, cur.id],
        });
      }
    }
  }

  // Top-ups abandoned again and again within a day: card testing.
  const dayAgo = now - DAY;
  const cancelled = new Map();
  for (const o of db.data.payments ?? []) {
    if ((o.status === 'cancelled' || o.status === 'expired') && Date.parse(o.created) >= dayAgo) cancelled.set(o.userId, [...(cancelled.get(o.userId) ?? []), o]);
  }
  for (const [userId, list] of cancelled) {
    if (list.length < 3) continue;
    add({
      id: `payments:${userId}:${list[0].id}`,
      rule: 'abandoned_payments',
      risk: 'high',
      userId,
      user: nameOf(userId),
      detail: `${list.length} неоплаченных или отменённых пополнений за сутки`,
      at: list[0].created,
      refs: list.map(o => o.id),
    });
  }

  // Refunds piling up for one person.
  const refunds = new Map();
  for (const t of db.data.transactions) if (t.status === 'refunded' && Date.parse(t.time) >= since) refunds.set(t.userId, [...(refunds.get(t.userId) ?? []), t]);
  for (const [userId, list] of refunds) {
    if (list.length < 2) continue;
    add({
      id: `refunds:${userId}:${list[0].id}`,
      rule: 'repeated_refunds',
      risk: 'medium',
      userId,
      user: nameOf(userId),
      detail: `${list.length} возвратов за 30 дней на ${list.reduce((n, t) => n + t.amount, 0).toLocaleString('ru-RU')} сум`,
      at: list[0].time,
      refs: list.map(t => t.id),
    });
  }

  const order = { critical: 0, high: 1, medium: 2 };
  findings.sort((a, b) => Number(!!a.review) - Number(!!b.review) || order[a.risk] - order[b.risk] || b.at.localeCompare(a.at));
  return {
    checked: { sessions: sessions.length, payments: (db.data.payments ?? []).length },
    open: findings.filter(f => !f.review).length,
    findings,
  };
}

export function reviewFinding(id, decision, actor, note = '') {
  const reviews = (db.data.riskReviews ??= {});
  reviews[id] = { decision, by: actor.name, at: new Date().toISOString(), note: String(note).slice(0, 300) };
  db.save();
  return reviews[id];
}

/**
 * Charge-record checks: each completed session must add up — time, energy,
 * price and the money actually taken.
 */
export function cdrReport(now = Date.now(), days = 30) {
  const since = now - days * DAY;
  const done = db.data.sessions.filter(s => s.status === 'completed' && Date.parse(s.start) >= since);
  const txBySession = new Map(db.data.transactions.map(t => [t.sessionId, t]));
  const stations = new Set(db.data.stations.map(s => s.id));
  const issues = [];
  const flag = (s, check, detail) => issues.push({ sessionId: s.id, check, detail, station: s.stationName, operator: s.operator, start: s.start, cost: s.cost });

  for (const s of done) {
    if (!s.end || Date.parse(s.end) <= Date.parse(s.start)) flag(s, 'time', 'Конец раньше начала или не записан');
    if (s.energy > maxEnergy(s)) flag(s, 'energy', `${s.energy} кВт·ч больше возможного для ${s.power ?? '?'} кВт за это время`);
    if (s.price && Math.abs(Math.round(s.energy * s.price) - s.cost) > 1) flag(s, 'amount', `${s.energy} × ${s.price} ≠ ${s.cost} сум`);
    if (s.basePrice && s.multiplier && Math.abs(Math.round(s.basePrice * s.multiplier) - (s.price ?? 0)) > 1) flag(s, 'tariff', `Цена ${s.price} не равна ${s.basePrice} × ${s.multiplier}`);
    const t = txBySession.get(s.id);
    if (!t) flag(s, 'payment', 'Нет списания за зарядку');
    else if (t.status !== 'refunded' && t.amount !== s.cost) flag(s, 'payment', `Списано ${t.amount}, а по зарядке ${s.cost} сум`);
    if (!stations.has(s.stationId)) flag(s, 'station', 'Станция не найдена в сети');
  }
  const bad = new Set(issues.map(i => i.sessionId));
  return {
    days,
    checked: done.length,
    passed: done.length - bad.size,
    energy: Math.round(done.reduce((n, s) => n + s.energy, 0)),
    amount: done.reduce((n, s) => n + s.cost, 0),
    issues: issues.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 300),
  };
}

// ---------------------------------------------------------------------------
// Time-of-day tariff windows, editable by the admin
// ---------------------------------------------------------------------------

export const DEFAULT_BANDS = [
  { band: 'green', from: 23, to: 7, multiplier: 0.7 },
  { band: 'day', from: 10, to: 17, multiplier: 0.9 },
  { band: 'peak', from: 17, to: 22, multiplier: 1.25 },
];

export const tariffBands = () => db.data.tariffBands ?? DEFAULT_BANDS;

const inWindow = (hour, { from, to }) => (from <= to ? hour >= from && hour < to : hour >= from || hour < to);

/** The band an hour falls into; hours outside every window are standard (×1). */
export function bandFor(hour) {
  const hit = tariffBands().find(b => inWindow(hour, b));
  return hit ? { band: hit.band, multiplier: hit.multiplier } : { band: 'standard', multiplier: 1 };
}

export function setTariffBands(input) {
  if (!Array.isArray(input) || input.length !== 3) return { error: 'Нужны три окна: green, day, peak' };
  const bands = [];
  for (const name of ['green', 'day', 'peak']) {
    const b = input.find(x => x?.band === name);
    if (!b) return { error: `Нет окна ${name}` };
    const from = Number(b.from);
    const to = Number(b.to);
    const multiplier = Math.round(Number(b.multiplier) * 100) / 100;
    if (![from, to].every(h => Number.isInteger(h) && h >= 0 && h <= 23) || from === to) return { error: `Часы окна ${name} — от 0 до 23, начало и конец разные` };
    if (!(multiplier >= 0.5 && multiplier <= 2)) return { error: `Множитель окна ${name} — от 0.5 до 2` };
    bands.push({ band: name, from, to, multiplier });
  }
  for (let h = 0; h < 24; h++) {
    if (bands.filter(b => inWindow(h, b)).length > 1) return { error: `Окна пересекаются в ${String(h).padStart(2, '0')}:00` };
  }
  db.data.tariffBands = bands;
  db.save();
  return { bands };
}

import { db } from './db.js';
import { beginSession, completeSession } from './api.js';
import { rng, sessionsBetween, chargeMinutes, plannedEnergy, HOUR_WEIGHT } from './history.js';

/**
 * Keeps the demo network alive between visits.
 *
 * Every minute it finishes simulated charges whose planned time is up and
 * starts new ones on free connectors, following the time of day. If the
 * server slept (Render's free tier does), the missing history is generated
 * on wake-up so charts never show a hole.
 *
 * Only stations beyond the original six take part, so the flows the tests
 * and the e2e suite drive are never touched. Simulated events reach the live
 * channel but stay out of the audit log, webhooks and push.
 */

const TICK_MS = Number(process.env.DEMO_TICK_MS) || 60_000;
const TZ = 5 * 3600_000;
const MAX_GAP_MS = 30 * 86400_000;
const SYSTEM = { id: 'system', name: 'OCPP', portal: 'system' };

const hourNow = () => new Date(Date.now() + TZ).getUTCHours();
const eligible = () => db.data.stations.slice(6).filter(st => db.byId('operators', st.operatorId)?.status === 'active');

/** Generates the sessions that would have happened while the server was down. */
function fillGap() {
  const to = Date.now() - 20 * 60_000;
  const until = Date.parse(db.data.historyUntil ?? '');
  // A database from before the simulation has no mark: start counting from now.
  if (!Number.isFinite(until)) {
    db.data.historyUntil = new Date(to).toISOString();
    return 0;
  }
  if (to - until < 10 * 60_000) return 0;
  // Never rebuild more than the dashboards can show.
  const from = Math.max(until, to - MAX_GAP_MS);
  const r = rng(Math.floor(from / 1000));
  const fresh = sessionsBetween({ stations: db.data.stations, customers: db.data.customers ?? [], from, to, r });
  fresh.sort((a, b) => a.start.localeCompare(b.start));
  for (const s of fresh) {
    s.id = db.nextId('session', 'S-');
    db.data.sessions.unshift(s);
    db.data.transactions.unshift({
      id: db.nextId('txn', 'TXN-'),
      sessionId: s.id,
      userId: s.userId,
      user: s.user,
      amount: s.cost,
      method: s.corporate ? 'Корпоративный счёт' : 'Кошелёк',
      status: s.status === 'failed' ? 'failed' : 'completed',
      time: s.end,
    });
  }
  db.data.historyUntil = new Date(to).toISOString();
  db.save();
  return fresh.length;
}

function finishDue(now) {
  for (const s of db.data.sessions.filter(x => x.status === 'active' && x.source === 'demo')) {
    // Sessions from before the simulation existed get a planned end now.
    if (!s.plannedEnd) s.plannedEnd = new Date(Date.parse(s.start) + 60 * 60_000).toISOString();
    if (Date.parse(s.plannedEnd) <= now) completeSession(s, SYSTEM, { simulated: true });
  }
}

function startSome(r) {
  const stations = eligible();
  const connectors = stations.flatMap(st => st.connectors.map(c => ({ st, c })));
  const busy = db.data.sessions.filter(x => x.status === 'active' && x.source === 'demo').length;
  // Target occupancy follows the daily rhythm: ~4% at night, ~18% at the evening peak.
  const target = Math.round(connectors.length * 0.12 * HOUR_WEIGHT[hourNow()]);
  let need = Math.min(3, target - busy);
  const charging = new Set(db.data.sessions.filter(x => x.status === 'active').map(x => x.userId));
  const drivers = (db.data.customers ?? []).filter(c => c.status === 'active' && !c.fleet && !charging.has(c.id));
  for (let attempt = 0; need > 0 && attempt < 12 && drivers.length; attempt++) {
    const free = connectors.filter(({ c }) => c.status === 'available');
    if (!free.length) return;
    const { st, c } = free[Math.floor(r() * free.length)];
    const local = drivers.filter(d => d.city === st.city);
    const pool = local.length && r() < 0.8 ? local : drivers;
    const driver = pool[Math.floor(r() * pool.length)];
    const result = beginSession({ id: driver.id, name: driver.name, portal: 'driver' }, st.id, c.id, { simulated: true });
    if (!result.session) continue;
    result.session.user = `${driver.name.split(' ')[0]} ${driver.name.split(' ')[1]?.[0] ?? ''}.`.trim();
    result.session.plannedEnd = new Date(Date.now() + chargeMinutes(c, plannedEnergy(c, r), r) * 60_000).toISOString();
    drivers.splice(drivers.indexOf(driver), 1);
    need -= 1;
  }
}

function tick(r) {
  try {
    const now = Date.now();
    finishDue(now);
    startSome(r);
    db.data.historyUntil = new Date(now).toISOString();
    db.save();
  } catch (err) {
    console.warn('[demo] tick failed:', err.message);
  }
}

export function startDemoLife() {
  const filled = fillGap();
  if (filled) console.log(`[demo] filled ${filled} sessions while the server was asleep`);
  const r = rng(Date.now() % 2 ** 31);
  const timer = setInterval(() => tick(r), TICK_MS);
  timer.unref?.();
  setTimeout(() => tick(r), Math.min(5000, TICK_MS)).unref?.();
  return () => clearInterval(timer);
}

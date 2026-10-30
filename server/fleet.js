/**
 * The tariff for taxi parks and couriers: cars that charge every day.
 *
 *   a discount that grows with the park's volume over the last 30 days
 *   (Voli pays it, the network earns its full price), priority in a
 *   queue for the park's drivers, one account for the whole park, and a
 *   report per driver for any month.
 */
import { db } from './db.js';
import { setting } from './settings.js';

const DAY = 86_400_000;
/** The volume tiers, as the admin set them (server/settings.js). */
const TAXI_TIERS_NOW = () => setting('fleet.tiers');
const plans = () => (db.data.fleetPlans ??= {});

const kwh30 = () => {
  const since = Date.now() - 30 * DAY;
  return Math.round(db.data.sessions.filter(s => s.corporate && s.status === 'completed' && Date.parse(s.start) >= since).reduce((n, s) => n + (s.energy ?? 0), 0));
};

export function fleetPlanFor(orgId = 'biz-001') {
  const p = plans()[orgId];
  const volume = kwh30();
  const TAXI_TIERS = TAXI_TIERS_NOW();
  const i = TAXI_TIERS.reduce((best, t, k) => (volume >= t.kwh ? k : best), 0);
  const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
  const saved = db.data.sessions.filter(s => s.corporate && s.fleetCovered && new Date(Date.parse(s.start) + 5 * 3600_000).toISOString().startsWith(month)).reduce((n, s) => n + s.fleetCovered, 0);
  return {
    plan: p?.plan ?? 'standard',
    since: p?.since ?? null,
    kwh30: volume,
    discount: p?.plan === 'taxi' ? TAXI_TIERS[i].pct : 0,
    tierDiscount: TAXI_TIERS[i].pct,
    next: TAXI_TIERS[i + 1] ?? null,
    tiers: TAXI_TIERS,
    savedThisMonth: saved,
  };
}

export function setFleetPlan(orgId, plan) {
  if (!['standard', 'taxi'].includes(plan)) return { status: 400, error: 'Тариф: standard или taxi' };
  plans()[orgId] = { plan, since: new Date().toISOString() };
  db.save();
  return { plan: fleetPlanFor(orgId) };
}

/** The park's discount on a company charge right now, %. */
export const fleetDiscount = (orgId = 'biz-001') => fleetPlanFor(orgId).discount;

/** A driver of a park on the taxi tariff stands ahead in queues. */
export const fleetPriority = driverId => !!db.find('employees', e => e.driverId === driverId) && fleetPlanFor().plan === 'taxi';

/** Per driver for a month (YYYY-MM, Tashkent): charges, energy, money, night share, typical stop, where. */
export function fleetDriverReport(month) {
  const inMonth = s => new Date(Date.parse(s.start) + 5 * 3600_000).toISOString().startsWith(month);
  return db.data.employees.map(e => {
    const list = db.data.sessions.filter(s => s.userId === e.driverId && s.corporate && s.status === 'completed' && inMonth(s));
    const energy = list.reduce((n, s) => n + (s.energy ?? 0), 0);
    const cost = list.reduce((n, s) => n + (s.cost ?? 0), 0);
    const minutes = list.map(s => (Date.parse(s.end ?? s.start) - Date.parse(s.start)) / 60000).sort((a, b) => a - b);
    const where = new Map();
    for (const s of list) where.set(s.stationName, (where.get(s.stationName) ?? 0) + 1);
    return {
      employeeId: e.id,
      name: e.name,
      vehicle: e.vehicle,
      charges: list.length,
      energy: Math.round(energy * 10) / 10,
      cost: Math.round(cost),
      avgPrice: energy ? Math.round(cost / energy) : 0,
      nightShare: list.length ? Math.round((list.filter(s => s.multiplier === 0.7).length / list.length) * 100) : 0,
      medianMinutes: minutes.length ? Math.round(minutes[Math.floor(minutes.length / 2)]) : 0,
      topStation: [...where.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      saved: list.reduce((n, s) => n + (s.fleetCovered ?? 0), 0),
    };
  });
}

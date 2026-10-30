import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * Discounts that a partner network runs at its own stations and pays for
 * itself: "−20% at night", "−50% on the first charge". The driver pays the
 * reduced price, so the network simply earns less on that session — Voli's
 * commission is a share of what the driver paid, as for any other charge.
 *
 * A promo covers either every station of the network or a chosen few, and
 * optionally only some hours (Tashkent time) and only until a date.
 *
 * Voli's own team runs campaigns too, from the admin portal: across every
 * network or a chosen few (operatorId null, operatorIds the list or null for
 * all). Such a campaign is paid either by the networks, as agreed with them,
 * or by Voli — then the network still gets its full price and Voli pays the
 * difference, like with Plus.
 */

const TZ = 5 * 3600_000;
const tashkentHour = (at = Date.now()) => new Date(at + TZ).getUTCHours();

/** A few promos the demo networks run, so the map shows them from the start. */
function demoPromos() {
  const until = new Date(Date.now() + 30 * 86400_000).toISOString();
  return [
    { id: 'PR-001', operatorId: 'op-002', title: 'Ночью дешевле', percent: 20, fromHour: 23, toHour: 7, firstOnly: false, stationIds: null, until },
    { id: 'PR-002', operatorId: 'op-001', title: 'Первая зарядка в сети', percent: 50, fromHour: null, toHour: null, firstOnly: true, stationIds: null, until },
    { id: 'PR-003', operatorId: 'op-003', title: 'Скидка на трассе', percent: 15, fromHour: null, toHour: null, firstOnly: false, stationIds: ['st-004'], until },
  ].map(p => ({ ...p, active: true, createdAt: new Date().toISOString(), createdBy: 'seed' }));
}

export const promos = () => (db.data.promos ??= demoPromos());

const live = (p, at = Date.now()) => p.active && (!p.until || Date.parse(p.until) > at);
const inHours = (p, hour) => {
  if (p.fromHour == null || p.toHour == null) return true;
  return p.fromHour <= p.toHour ? hour >= p.fromHour && hour < p.toHour : hour >= p.fromHour || hour < p.toHour;
};
const coversNetwork = (p, operatorId) => (p.operatorId ? p.operatorId === operatorId : !p.operatorIds || p.operatorIds.includes(operatorId));
const covers = (p, station) => coversNetwork(p, station.operatorId) && (!p.stationIds || p.stationIds.includes(station.id));

/** What every driver sees on the map: running promos, nothing internal. */
export const publicPromos = (at = Date.now()) =>
  promos()
    .filter(p => live(p, at))
    .map(({ id, operatorId, operatorIds, title, note, percent, fromHour, toHour, firstOnly, stationIds, until, funder }) => ({
      id, operatorId: operatorId ?? null, operatorIds: operatorIds ?? null, title, note: note ?? null, percent, fromHour, toHour, firstOnly, stationIds, until, funder: funder ?? 'network',
    }));

/**
 * The best promo this driver gets at this station right now, or null.
 * "First charge" counts only completed charges at the same network, or in
 * Voli at all for a campaign of Voli's own.
 */
export function promoFor(station, account, at = Date.now()) {
  const hour = tashkentHour(at);
  const fits = promos().filter(p => {
    if (!live(p, at) || !covers(p, station) || !inHours(p, hour)) return false;
    if (!p.firstOnly) return true;
    return !db.data.sessions.some(s => s.userId === account?.id && (!p.operatorId || s.operatorId === station.operatorId) && s.status === 'completed');
  });
  return fits.sort((a, b) => b.percent - a.percent)[0] ?? null;
}

/**
 * A campaign of Voli's own, from the admin portal: every network or a chosen
 * few, paid by Voli or by the networks. Returns { promo } or { error }.
 */
export function createCampaign(b = {}, actor = '') {
  const funder = b.funder === 'voli' ? 'voli' : b.funder === 'network' ? 'network' : null;
  if (!funder) return { error: 'Укажите, кто оплачивает скидку: Voli или сети' };
  let operatorIds = null;
  if (Array.isArray(b.operatorIds) && b.operatorIds.length) {
    const known = new Set(db.data.operators.map(o => o.id));
    if (b.operatorIds.some(id => !known.has(id))) return { error: 'Такой сети нет' };
    operatorIds = [...new Set(b.operatorIds)];
  }
  let stationIds = null;
  if (Array.isArray(b.stationIds) && b.stationIds.length) {
    const ok = new Set(db.data.stations.filter(s => !operatorIds || operatorIds.includes(s.operatorId)).map(s => s.id));
    if (b.stationIds.some(id => !ok.has(id))) return { error: 'Станции — только из выбранных сетей' };
    stationIds = [...new Set(b.stationIds)];
  }
  // The checks of a network's own promo apply as they are; then it becomes Voli's.
  const r = createPromo(null, { ...b, stationIds: null }, actor);
  if (r.error) return r;
  Object.assign(r.promo, { operatorIds, stationIds, note: text(b.note, 200) || null, funder, by: 'admin' });
  db.save();
  return r;
}

const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const hourOrNull = v => (v === null || v === undefined || v === '' ? null : Number(v));

/** Validates and stores a promo of one network. Returns { promo } or { error }. */
export function createPromo(operatorId, b = {}, actor = '') {
  const percent = Math.round(Number(b.percent));
  if (!Number.isFinite(percent) || percent < 5 || percent > 100) return { error: 'Скидка — от 5 до 100%' };
  const fromHour = hourOrNull(b.fromHour);
  const toHour = hourOrNull(b.toHour);
  if ((fromHour === null) !== (toHour === null)) return { error: 'Укажите оба часа: с какого и до какого' };
  if (fromHour !== null && (![fromHour, toHour].every(h => Number.isInteger(h) && h >= 0 && h <= 23) || fromHour === toHour)) {
    return { error: 'Часы — от 0 до 23, начало и конец разные' };
  }
  let stationIds = null;
  if (Array.isArray(b.stationIds) && b.stationIds.length) {
    const own = new Set(db.data.stations.filter(s => s.operatorId === operatorId).map(s => s.id));
    if (b.stationIds.some(id => !own.has(id))) return { error: 'Скидку можно дать только на станции своей сети' };
    stationIds = [...new Set(b.stationIds)];
  }
  let until = null;
  if (b.until) {
    const t = Date.parse(b.until);
    if (!Number.isFinite(t) || t <= Date.now()) return { error: 'Дата окончания — в будущем' };
    until = new Date(t).toISOString();
  }
  const firstOnly = !!b.firstOnly;
  const title = text(b.title, 60) || (firstOnly ? `−${percent}% на первую зарядку` : fromHour !== null ? `−${percent}% с ${fromHour}:00 до ${toHour}:00` : `−${percent}% на зарядку`);
  const promo = {
    id: `PR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    operatorId, title, percent, fromHour, toHour, firstOnly, stationIds, until,
    active: true, createdAt: new Date().toISOString(), createdBy: actor,
  };
  promos().unshift(promo);
  db.save();
  return { promo };
}

export function stopPromo(operatorId, id) {
  const p = promos().find(x => x.id === id && (operatorId === null || x.operatorId === operatorId));
  if (!p) return null;
  p.active = false;
  db.save();
  return p;
}

/** For the network's own portal: all its promos and how many charges used each. */
export function promosOf(operatorId) {
  return promos()
    .filter(p => operatorId === null || coversNetwork(p, operatorId))
    .map(p => {
      const used = db.data.sessions.filter(s => s.promo?.id === p.id && s.status === 'completed' && (operatorId === null || s.operatorId === operatorId));
      return {
        ...p,
        operatorIds: p.operatorIds ?? null,
        funder: p.funder ?? 'network',
        uses: used.length,
        discount: used.reduce((n, s) => n + Math.round((s.basePrice * (s.multiplier ?? 1) - s.price) * s.energy), 0),
        voliPaid: used.reduce((n, s) => n + (s.promoCovered ?? 0), 0),
      };
    });
}

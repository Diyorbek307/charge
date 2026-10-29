/**
 * Autocharge: the charger knows the car and starts by itself — no app, no
 * QR, no card. A DC charger sees the car's unique ID over the cable (the
 * EVCCID, a MAC address) and sends it as the idTag in Authorize and
 * StartTransaction.
 *
 * Linking happens once: the driver opens a ten-minute window for the
 * station they are at and plugs in; the first unknown car ID that station
 * reports is bound to the driver. From then on that car ID authorises a
 * charge paid from the driver's wallet, anywhere on OCPP chargers.
 */
import { db } from './db.js';
import { setting, feature } from './settings.js';

const WINDOW_MS = () => setting('autocharge.windowMin') * 60_000;
const links = () => (db.data.autocharge ??= []);
const windows = () => (db.data.autochargeWindows ??= []);

/** A car ID as chargers send it: "VID:0A1B2C3D4E5F", "0A:1B:…", or bare hex. */
export function normalizeCarId(raw) {
  const hex = String(raw ?? '').toUpperCase().replace(/^VID:/, '').replace(/[^0-9A-F]/g, '');
  return hex.length >= 12 && hex.length <= 16 ? hex : null;
}

/** The driver a car ID belongs to, when Autocharge is on for it. */
export function accountByCarId(raw) {
  // Switched off by the admin: a car ID is a stranger again.
  if (!feature('autocharge')) return null;
  const id = normalizeCarId(raw);
  if (!id) return null;
  const link = links().find(l => l.carId === id && l.enabled);
  return link ? db.byId('accounts', link.userId) : null;
}

/** Opens the linking window at one station for a driver. */
export function openWindow(account, stationId) {
  const station = db.byId('stations', stationId);
  if (!station) return { status: 404, error: 'Станция не найдена' };
  if (!station.ocpp) return { status: 409, error: 'Эта станция не подключена напрямую — Autocharge работает на станциях с OCPP' };
  // One window per station at a time: two drivers pairing side by side would be ambiguous.
  const busy = windows().find(w => w.stationId === stationId && w.userId !== account.id && Date.parse(w.until) > Date.now());
  if (busy) return { status: 409, error: 'На этой станции уже привязывают другую машину — попробуйте через несколько минут' };
  for (let i = windows().length - 1; i >= 0; i--) if (windows()[i].userId === account.id || Date.parse(windows()[i].until) <= Date.now()) windows().splice(i, 1);
  const w = { userId: account.id, stationId, until: new Date(Date.now() + WINDOW_MS()).toISOString() };
  windows().push(w);
  db.save();
  return { window: w };
}

/**
 * A charger reported a car ID nobody has: if a driver is linking at this
 * station, it becomes theirs. Returns the account, or null.
 */
export function linkFromCharger(stationId, raw) {
  if (!feature('autocharge')) return null;
  const carId = normalizeCarId(raw);
  if (!carId) return null;
  const i = windows().findIndex(w => w.stationId === stationId && Date.parse(w.until) > Date.now());
  if (i < 0) return null;
  const w = windows().splice(i, 1)[0];
  const account = db.byId('accounts', w.userId);
  if (!account) return null;
  // A car belongs to one driver; linking it again moves it.
  for (const l of links()) if (l.carId === carId) l.enabled = false;
  links().unshift({ carId, userId: account.id, car: account.car ? `${account.car.brand} ${account.car.model}` : null, since: new Date().toISOString(), enabled: true, stationId });
  db.save();
  return account;
}

export function autochargeFor(userId) {
  const mine = links().filter(l => l.userId === userId && l.enabled);
  const w = windows().find(x => x.userId === userId && Date.parse(x.until) > Date.now()) ?? null;
  return {
    cars: mine.map(l => ({ carId: `${l.carId.slice(0, 4)}…${l.carId.slice(-4)}`, car: l.car, since: l.since })),
    linking: w ? { stationId: w.stationId, until: w.until } : null,
  };
}

export function unlink(userId) {
  let n = 0;
  for (const l of links()) if (l.userId === userId && l.enabled) {
    l.enabled = false;
    n++;
  }
  for (let i = windows().length - 1; i >= 0; i--) if (windows()[i].userId === userId) windows().splice(i, 1);
  db.save();
  return n;
}

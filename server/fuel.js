/**
 * Gas and petrol stations for the map's «Газ» and «Бензин» modes.
 *
 * The list comes from OpenStreetMap (server/data/fuel-uz.json, refreshed with
 * scripts/fuel-osm.mjs). Whether there is gas right now is not in any open
 * data, so drivers say it: «Газ есть», «Газа нет», «Очередь». A mark holds for
 * 3 hours; the newest one is what others see.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth } from './api.js';

const HOLD = 3 * 3600_000;
const COOLDOWN = 20 * 60_000;
export const FUEL_STATUSES = ['yes', 'no', 'queue'];

let data = { source: '', at: '', stations: [] };
try {
  data = JSON.parse(readFileSync(new URL('./data/fuel-uz.json', import.meta.url), 'utf8'));
} catch {
  /* no snapshot: the modes show an empty map */
}
const byId = new Map(data.stations.map(s => [s.id, s]));
const marks = () => (db.data.fuelReports ??= []);
const fresh = (stationId, fuel) => marks().filter(m => m.stationId === stationId && m.fuel === fuel && Date.now() - Date.parse(m.ts) < HOLD);

/** What drivers said in the last 3 hours: the newest mark wins. */
export function fuelStatus(stationId, fuel) {
  const list = fresh(stationId, fuel);
  if (!list.length) return null;
  const last = list[0];
  return { status: last.status, at: last.ts, count: list.filter(m => m.status === last.status).length };
}

const view = (s, fuel) => ({ ...s, now: fuelStatus(s.id, fuel) });
const ofKind = (s, kind) => (kind === 'gas' ? s.metan || s.propan : s.petrol);

api.get('/fuel', (req, res) => {
  const kind = req.query.kind === 'petrol' ? 'petrol' : 'gas';
  res.json({ source: data.source, at: data.at, stations: data.stations.filter(s => ofKind(s, kind)).map(s => view(s, kind)) });
});

api.post('/fuel/:id/report', requireAuth('driver'), (req, res) => {
  const station = byId.get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Заправка не найдена' });
  const fuel = req.body?.fuel === 'petrol' ? 'petrol' : 'gas';
  const status = String(req.body?.status ?? '');
  if (!FUEL_STATUSES.includes(status)) return res.status(400).json({ error: 'Неизвестная отметка' });
  const mine = marks().find(m => m.stationId === station.id && m.userId === req.account.id && Date.now() - Date.parse(m.ts) < COOLDOWN);
  if (mine) return res.status(409).json({ error: 'Вы уже отмечали эту заправку — можно снова через 20 минут' });
  marks().unshift({ id: `FM-${randomUUID().slice(0, 8)}`, stationId: station.id, fuel, status, userId: req.account.id, user: req.account.name ?? '', ts: new Date().toISOString() });
  if (marks().length > 5000) marks().length = 5000;
  db.save();
  res.status(201).json(view(station, fuel));
});

// ---------------------------------------------------------------------------
// Admin: how many stations the map has, what drivers said, and removing a false mark.
// ---------------------------------------------------------------------------

api.get('/admin/fuel', requireAuth('admin'), (_req, res) => {
  const day = Date.now() - 24 * 3600_000;
  const recent = marks().filter(m => Date.parse(m.ts) > day);
  res.json({
    source: data.source,
    at: data.at,
    total: data.stations.length,
    gas: data.stations.filter(s => s.metan || s.propan).length,
    petrol: data.stations.filter(s => s.petrol).length,
    day: { marks: recent.length, yes: recent.filter(m => m.status === 'yes').length, no: recent.filter(m => m.status === 'no').length, queue: recent.filter(m => m.status === 'queue').length, drivers: new Set(recent.map(m => m.userId)).size },
    marks: marks().slice(0, 200).map(m => {
      const st = byId.get(m.stationId);
      return { ...m, station: st?.name || st?.brand || null, address: st?.address ?? null, lat: st?.lat ?? null, lng: st?.lng ?? null };
    }),
  });
});

api.delete('/admin/fuel/marks/:id', requireAuth('admin'), (req, res) => {
  const i = marks().findIndex(m => m.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Отметка не найдена' });
  marks().splice(i, 1);
  db.save();
  res.json({ removed: true });
});

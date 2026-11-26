/**
 * Gas and petrol stations for the map's «Газ» and «Бензин» modes.
 *
 * The list comes from OpenStreetMap (server/data/fuel-uz.json, refreshed with
 * scripts/fuel-osm.mjs). Whether there is gas right now is not in any open
 * data, so drivers say it: «Газ есть», «Газа нет», «Очередь». A mark holds for
 * 3 hours; the newest one is what others see.
 */
import { readFileSync } from 'node:fs';
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
  marks().unshift({ stationId: station.id, fuel, status, userId: req.account.id, ts: new Date().toISOString() });
  if (marks().length > 5000) marks().length = 5000;
  db.save();
  res.status(201).json(view(station, fuel));
});

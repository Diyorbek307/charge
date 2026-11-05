import { db } from './db.js';
import { api, requireAuth } from './api.js';
import { attempt } from './guard.js';

/**
 * Demand the network does not meet yet — the case for a new charger, made
 * with numbers:
 *
 *   full hours   hours in the last 30 days when every connector of a
 *                station was taken (from the charge history);
 *   busy views   a driver opened a station and nothing was free;
 *   lost search  a search on the map found no station at all, with the
 *                area it came from rounded to about 5 km.
 *
 * Nothing here names a driver: the app sends no account with these.
 */

const DAY = 86400_000;
const KEEP = 5000;
const events = () => (db.data.demand ??= []);
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
// About 5 km: enough to see a district, too coarse to find a house.
const coarse = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 20) / 20 : null);

api.post('/demand', (req, res) => {
  const tries = attempt(`demand:${req.ip}`, 60, 10 * 60_000);
  if (!tries.ok) return res.status(204).end();
  const b = req.body ?? {};
  const at = new Date().toISOString();
  if (b.kind === 'busy') {
    const station = db.byId('stations', clean(b.stationId, 40));
    if (!station) return res.status(204).end();
    events().push({ kind: 'busy', stationId: station.id, at });
  } else if (b.kind === 'search') {
    const q = clean(b.q, 60).toLowerCase();
    if (q.length < 3) return res.status(204).end();
    events().push({ kind: 'search', q, lat: coarse(b.lat), lng: coarse(b.lng), at });
  } else return res.status(204).end();
  if (events().length > KEEP) events().splice(0, events().length - KEEP);
  db.save();
  res.status(204).end();
});

/** Minutes in [from, to) when at least `slots` charges ran at once. */
function fullMinutes(sessions, slots, from, to) {
  const edges = [];
  for (const s of sessions) {
    const start = Math.max(Date.parse(s.start), from);
    const end = Math.min(Date.parse(s.end ?? s.start) || start, to);
    if (end > start) edges.push([start, 1], [end, -1]);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let running = 0;
  let since = 0;
  let total = 0;
  for (const [t, step] of edges) {
    if (running >= slots) total += t - since;
    running += step;
    since = t;
  }
  return total / 60_000;
}

export function demandFor({ days = 30 } = {}) {
  const now = Date.now();
  const from = now - days * DAY;
  const byStation = new Map();
  for (const s of db.data.sessions) {
    if (Date.parse(s.start) < from - DAY) continue;
    (byStation.get(s.stationId) ?? byStation.set(s.stationId, []).get(s.stationId)).push(s);
  }
  const recent = events().filter(e => Date.parse(e.at) >= from);
  const views = new Map();
  for (const e of recent) if (e.kind === 'busy') views.set(e.stationId, (views.get(e.stationId) ?? 0) + 1);

  const stations = db.data.stations
    .map(st => {
      const working = st.connectors.filter(c => c.status !== 'unavailable').length || st.connectors.length;
      const hours = fullMinutes(byStation.get(st.id) ?? [], working, from, now) / 60;
      return { id: st.id, name: st.name, city: st.city, operator: st.operator, connectors: st.connectors.length, fullHours: Math.round(hours * 10) / 10, busyViews: views.get(st.id) ?? 0 };
    })
    .filter(s => s.fullHours > 0 || s.busyViews > 0)
    .sort((a, b) => b.fullHours + b.busyViews - (a.fullHours + a.busyViews))
    .slice(0, 12);

  const searches = new Map();
  const areas = new Map();
  for (const e of recent) {
    if (e.kind !== 'search') continue;
    searches.set(e.q, (searches.get(e.q) ?? 0) + 1);
    if (e.lat != null && e.lng != null) {
      const key = `${e.lat},${e.lng}`;
      areas.set(key, (areas.get(key) ?? 0) + 1);
    }
  }
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    days,
    stations,
    searches: top(searches, 10).map(([q, count]) => ({ q, count })),
    areas: top(areas, 10).map(([key, count]) => {
      const [lat, lng] = key.split(',').map(Number);
      return { lat, lng, count };
    }),
    totals: { busyViews: recent.filter(e => e.kind === 'busy').length, lostSearches: recent.filter(e => e.kind === 'search').length },
  };
}

api.get('/admin/demand', requireAuth('admin'), (_req, res) => {
  res.json(demandFor());
});

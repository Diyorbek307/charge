import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth } from './api.js';

/**
 * Speed cameras for the in-app navigator, from two sources:
 *
 *   OpenStreetMap   highway=speed_camera nodes, fetched through Overpass
 *                   (several mirrors, results cached a day per area), so
 *                   the app does not depend on one public server;
 *   drivers         "a camera is here", like in Waze: shown at once and
 *                   marked as reported by drivers, confirmed by others,
 *                   hidden after repeated "it is not here".
 *
 * Nothing is invented: an area without data shows no cameras.
 */

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const DAY = 86400_000;
const cache = new Map(); // key -> { at, cameras }
const reports = () => (db.data.cameraReports ??= []);

/** Areas snap to a 0.25° grid so nearby routes share a cache entry. */
const snap = v => Math.floor(v * 4) / 4;

const loading = new Map(); // key -> Promise

/**
 * The navigator asks once, at the start of a route: it gets what is cached
 * within a few seconds, and a slow public server fills the cache for the
 * next route instead of holding this one up.
 */
async function fromOsm(s, w, n, e) {
  // Tests and offline installs switch the public source off.
  if (process.env.OSM_CAMERAS === 'false') return [];
  const key = `${snap(s)},${snap(w)},${snap(n) + 0.25},${snap(e) + 0.25}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return hit.cameras;
  if (!loading.has(key)) loading.set(key, fetchOsm(key, hit).finally(() => loading.delete(key)));
  const quick = new Promise(resolve => setTimeout(() => resolve(hit?.cameras ?? []), 3500));
  return Promise.race([loading.get(key), quick]);
}

async function fetchOsm(key, hit) {
  const q = `[out:json][timeout:20];(node["highway"="speed_camera"](${key}););out body;`;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'PowerGo/1.0 (EV charging app)' }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const json = await res.json();
      const cameras = (json.elements ?? [])
        .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon))
        .map(x => ({ id: `osm-${x.id}`, lat: x.lat, lng: x.lon, maxspeed: Number.parseInt(x.tags?.maxspeed, 10) || null, kind: 'speed', source: 'osm' }));
      cache.set(key, { at: Date.now(), cameras });
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      return cameras;
    } catch {
      /* next mirror */
    }
  }
  // No mirror answered: an old answer is better than none.
  return hit?.cameras ?? [];
}

const visible = r => r.denied < 3 || r.confirmed > r.denied;
const inBox = (c, s, w, n, e) => c.lat >= s && c.lat <= n && c.lng >= w && c.lng <= e;

api.get('/cameras', async (req, res) => {
  const [s, w, n, e] = String(req.query.bbox ?? '').split(',').map(Number);
  if (![s, w, n, e].every(Number.isFinite) || n <= s || e <= w || n - s > 3 || e - w > 3) {
    return res.status(400).json({ error: 'bbox=юг,запад,север,восток, не больше 3° по стороне' });
  }
  const osm = await fromOsm(s, w, n, e);
  const drivers = reports()
    .filter(r => visible(r) && inBox(r, s, w, n, e))
    .map(r => ({ id: r.id, lat: r.lat, lng: r.lng, maxspeed: r.maxspeed, kind: r.kind, source: 'drivers', confirmed: r.confirmed }));
  res.json({ cameras: [...osm.filter(c => inBox(c, s, w, n, e)), ...drivers] });
});

api.post('/cameras', requireAuth('driver'), (req, res) => {
  const b = req.body ?? {};
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!(lat > 37 && lat < 46 && lng > 55.9 && lng < 73.2)) return res.status(400).json({ error: 'Камера должна быть в пределах Узбекистана' });
  const kind = ['speed', 'redlight', 'average'].includes(b.kind) ? b.kind : 'speed';
  const maxspeed = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].includes(Number(b.maxspeed)) ? Number(b.maxspeed) : null;
  // The same camera reported twice within ~40 m counts as a confirmation.
  const near = reports().find(r => Math.abs(r.lat - lat) < 0.0004 && Math.abs(r.lng - lng) < 0.0005);
  if (near) {
    if (!near.voters.includes(req.account.id)) {
      near.voters.push(req.account.id);
      near.confirmed++;
      db.save();
    }
    return res.json({ camera: near, merged: true });
  }
  const today = reports().filter(r => r.by === req.account.id && Date.now() - Date.parse(r.at) < DAY).length;
  if (today >= 20) return res.status(429).json({ error: 'Слишком много отметок за день' });
  const camera = { id: `CAM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, lat, lng, kind, maxspeed, by: req.account.id, at: new Date().toISOString(), confirmed: 1, denied: 0, voters: [req.account.id] };
  reports().push(camera);
  db.save();
  res.status(201).json({ camera });
});

/** "There is no camera here": three such votes hide a driver-reported camera. */
api.post('/cameras/:id/deny', requireAuth('driver'), (req, res) => {
  const r = reports().find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Камера не найдена' });
  if (!r.voters.includes(`-${req.account.id}`)) {
    r.voters.push(`-${req.account.id}`);
    r.denied++;
    db.save();
  }
  res.json({ visible: visible(r) });
});

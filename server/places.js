import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth } from './api.js';

/**
 * "While you charge": what is a short walk from a station.
 *
 *   partners   cafés, shops and the like that pay PowerGo to be shown to
 *              drivers at a station, with an offer for them. Each show and
 *              each tap is counted: that is what the partner is billed for
 *              (`pricePerShow`, sum).
 *   places     everything else around, from OpenStreetMap through Overpass
 *              (food, a prayer room or mosque, toilets, shops), cached a day
 *              per station so the public servers are asked rarely.
 *
 * Nothing is invented: a station with no data around shows none.
 */

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const DAY = 86400_000;
export const KINDS = ['food', 'prayer', 'toilets', 'shop', 'hotel'];
const cache = new Map();
const loading = new Map();

const partners = () => (db.data.partnerPlaces ??= demoPartners());

/** Demo partners at a few stations, until real contracts are signed. */
function demoPartners() {
  const at = id => db.byId('stations', id);
  const near = (st, dLat, dLng) => (st ? { lat: Math.round((st.geoLat + dLat) * 1e5) / 1e5, lng: Math.round((st.geoLng + dLng) * 1e5) / 1e5 } : null);
  const until = new Date(Date.now() + 90 * DAY).toISOString();
  return [
    { id: 'PP-001', name: 'Coffee Lab', kind: 'food', stationIds: ['st-001'], ...near(at('st-001'), 0.0011, 0.0008), offer: '−15% на кофе и выпечку водителям PowerGo', pricePerShow: 50, shows: 0, taps: 0, until, active: true },
    { id: 'PP-002', name: 'Korzinka', kind: 'shop', stationIds: ['st-002'], ...near(at('st-002'), -0.0009, 0.0012), offer: 'Вода в подарок при покупке от 50 000 сум', pricePerShow: 40, shows: 0, taps: 0, until, active: true },
    { id: 'PP-003', name: 'Choyxona Samarqand', kind: 'food', stationIds: ['st-003'], ...near(at('st-003'), 0.0007, -0.001), offer: 'Чай бесплатно, пока заряжается машина', pricePerShow: 50, shows: 0, taps: 0, until, active: true },
  ].filter(p => Number.isFinite(p.lat));
}

const km = (a, b) => {
  const r = d => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
/** About 4.5 km/h on foot, plus a minute to get going. */
const walkMin = d => Math.max(1, Math.round((d / 4.5) * 60) + 1);

async function fromOsm(st) {
  if (process.env.OSM_PLACES === 'false') return [];
  const key = st.id;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return hit.places;
  if (!loading.has(key)) loading.set(key, fetchOsm(st, hit).finally(() => loading.delete(key)));
  // A slow public server fills the cache for next time instead of holding the card up.
  const quick = new Promise(resolve => setTimeout(() => resolve(hit?.places ?? null), 4000));
  return Promise.race([loading.get(key), quick]);
}

async function fetchOsm(st, hit) {
  const { geoLat: lat, geoLng: lng } = st;
  const q = `[out:json][timeout:20];(
    nwr(around:800,${lat},${lng})[amenity~"^(cafe|restaurant|fast_food)$"];
    nwr(around:1500,${lat},${lng})[amenity=place_of_worship][religion=muslim];
    nwr(around:800,${lat},${lng})[amenity=toilets];
    nwr(around:800,${lat},${lng})[shop~"^(supermarket|convenience|mall|bakery)$"];
    nwr(around:2000,${lat},${lng})[tourism~"^(hotel|motel|guest_house|hostel)$"];
  );out center 80;`;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'PowerGo/1.0 (EV charging app)' }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const json = await res.json();
      const places = (json.elements ?? [])
        .map(e => {
          const t = e.tags ?? {};
          const kind = t.amenity === 'place_of_worship' ? 'prayer' : t.amenity === 'toilets' ? 'toilets' : t.shop ? 'shop' : t.tourism ? 'hotel' : 'food';
          const p = { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon };
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
          return { id: `osm-${e.type}-${e.id}`, name: t['name:ru'] || t.name || t['name:uz'] || '', kind, ...p, hours: t.opening_hours ?? null };
        })
        .filter(p => p && (p.name || p.kind === 'toilets' || p.kind === 'prayer'));
      cache.set(st.id, { at: Date.now(), places });
      if (cache.size > 800) cache.delete(cache.keys().next().value);
      return places;
    } catch {
      /* next mirror */
    }
  }
  return hit?.places ?? null;
}

/** Partners shown at a station: live, paid up, and a real walk away — a contract for a far station does not make it near. */
const partnersAt = st => partners().filter(p => p.active && Date.parse(p.until) > Date.now() && km({ lat: st.geoLat, lng: st.geoLng }, p) <= 1.2);

api.get('/stations/:id/places', async (req, res) => {
  const st = db.byId('stations', req.params.id);
  if (!st) return res.status(404).json({ error: 'Станция не найдена' });
  const here = { lat: st.geoLat, lng: st.geoLng };
  const shown = partnersAt(st);
  // Each answer is one show to the partner.
  for (const p of shown) p.shows = (p.shows ?? 0) + 1;
  if (shown.length) db.save();
  const osm = await fromOsm(st);
  const withDist = list => list.map(p => ({ ...p, km: Math.round(km(here, p) * 100) / 100, walkMin: walkMin(km(here, p)) })).sort((a, b) => a.km - b.km);
  const places = withDist((osm ?? []).filter(p => !shown.some(s => s.name && p.name && s.name.toLowerCase() === p.name.toLowerCase())));
  res.json({
    partners: withDist(shown.map(p => ({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, offer: p.offer }))),
    places: places.slice(0, 30),
    counts: Object.fromEntries(KINDS.map(k => [k, places.filter(p => p.kind === k).length + shown.filter(p => p.kind === k).length])),
    // null: the map service did not answer in time; the next look will have it.
    loaded: osm !== null,
  });
});

/** A driver tapped a partner: counted, then the app opens the way there. */
api.post('/places/:id/tap', (req, res) => {
  const p = partners().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Место не найдено' });
  p.taps = (p.taps ?? 0) + 1;
  db.save();
  res.json({ ok: true });
});

// The platform signs partners up and bills them by shows and taps.
api.get('/admin/partners', requireAuth('admin'), (_req, res) => {
  res.json(partners().map(p => ({ ...p, bill: (p.shows ?? 0) * (p.pricePerShow ?? 0) })));
});

api.post('/admin/partners', requireAuth('admin'), (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? '').trim().slice(0, 60);
  const offer = String(b.offer ?? '').trim().slice(0, 120);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const days = Number(b.days ?? 30);
  if (!name || !offer) return res.status(400).json({ error: 'Название и предложение для водителей обязательны' });
  if (!KINDS.includes(b.kind)) return res.status(400).json({ error: 'Тип: еда, намаз, туалет, магазин или ночлег' });
  if (!(lat > 30 && lat < 50 && lng > 50 && lng < 80)) return res.status(400).json({ error: 'Координаты места в Узбекистане' });
  if (!(days >= 1 && days <= 365)) return res.status(400).json({ error: 'Срок — от 1 до 365 дней' });
  const p = {
    id: `PP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    name, kind: b.kind, lat, lng, offer,
    stationIds: Array.isArray(b.stationIds) ? b.stationIds.filter(id => db.byId('stations', id)) : [],
    pricePerShow: Math.max(0, Math.round(Number(b.pricePerShow ?? 50))),
    shows: 0, taps: 0, until: new Date(Date.now() + days * DAY).toISOString(), active: true,
  };
  partners().unshift(p);
  db.save();
  res.status(201).json(p);
});

api.delete('/admin/partners/:id', requireAuth('admin'), (req, res) => {
  const p = partners().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Партнёр не найден' });
  p.active = false;
  db.save();
  res.json(p);
});

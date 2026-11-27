/**
 * Networks shown on the map without charging through Voli: their stations,
 * and a button that opens the station in the network's own app.
 *
 * Spectre gave its public station list (no prices, no live status):
 *   https://api.spectre-energy.uz/public-api/stations
 *   https://app.spectre-energy.uz/s/<public_id>  — the station, with a deep link into their app
 * They asked for a UTM mark on the link, so they can see the drivers Voli sends.
 *
 * A snapshot lives in server/data/spectre-stations.json; a real server also
 * refreshes it from the API every 6 hours. Chargers standing together (within
 * 60 m) are one point on the map.
 */
import { readFileSync } from 'node:fs';
import { api } from './api.js';
import { REAL_SERVER } from './db.js';

const SPECTRE_API = process.env.SPECTRE_API_URL ?? 'https://api.spectre-energy.uz/public-api/stations';
const REFRESH = 6 * 3600_000;
const UTM = 'utm_source=voli&utm_medium=app&utm_campaign=map';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const spectreLink = publicId => `https://app.spectre-energy.uz/s/${encodeURIComponent(publicId)}?${UTM}`;

const metres = (a, b) => {
  const cos = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * cos);
};
/** «Vatan kinoteatri 20 kW Hybrid K3» → the place «Vatan kinoteatri». */
const placeName = name => String(name ?? '').replace(/\s+\d+(?:[.,]\d+)?\s*kW\b.*$/i, '').replace(/\s+[KК]\d+\s*$/, '').trim();

/** The API's chargers → points on the map. Bad entries are skipped, never trusted. */
export function spectreSites(raw) {
  const list = Array.isArray(raw?.stations) ? raw.stations : [];
  const sites = [];
  for (const c of list) {
    const lat = Number(c?.location?.lat);
    const lng = Number(c?.location?.lng);
    if (!UUID.test(String(c?.public_id ?? '')) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const name = String(c.name ?? '').slice(0, 120);
    const charger = { id: c.public_id, name, power: Number(c.power_kw) || null, hybrid: /hybrid/i.test(name), link: spectreLink(c.public_id) };
    const near = sites.find(s => metres(s, { lat, lng }) < 60);
    if (near) {
      near.chargers.push(charger);
      continue;
    }
    sites.push({ id: `spectre-${c.public_id}`, network: 'spectre', operator: 'Spectre', name: placeName(name) || 'Spectre', address: String(c.address ?? '').slice(0, 200), lat, lng, chargers: [charger] });
  }
  for (const s of sites) {
    s.chargers.sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    s.maxPower = s.chargers[0].power;
    s.link = s.chargers[0].link;
  }
  return sites;
}

let state = { at: '', sites: [] };
try {
  const raw = JSON.parse(readFileSync(new URL('./data/spectre-stations.json', import.meta.url), 'utf8'));
  state = { at: 'snapshot', sites: spectreSites(raw) };
} catch {
  /* no snapshot: nothing until the API answers */
}

async function refresh() {
  try {
    const res = await fetch(SPECTRE_API, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sites = spectreSites(await res.json());
    // A broken answer never empties the map.
    if (sites.length >= Math.min(50, state.sites.length / 2)) state = { at: new Date().toISOString(), sites };
  } catch (e) {
    console.warn(`[partner-map] Spectre: ${e.message}`);
  }
}
if (REAL_SERVER && SPECTRE_API) {
  setTimeout(refresh, 20_000).unref?.();
  setInterval(refresh, REFRESH).unref?.();
}

api.get('/partner-map', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ networks: [{ id: 'spectre', name: 'Spectre', at: state.at, chargers: state.sites.reduce((n, s) => n + s.chargers.length, 0) }], sites: state.sites });
});

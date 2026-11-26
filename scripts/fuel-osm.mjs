/**
 * Gas and petrol stations of Uzbekistan from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL) into server/data/fuel-uz.json, which the map's
 * «Газ» and «Бензин» modes show.
 *
 *   node scripts/fuel-osm.mjs              — downloads from Overpass
 *   node scripts/fuel-osm.mjs saved.json   — uses an Overpass answer saved before
 *
 * Whether there is gas right now is not in any open data: drivers mark it in
 * the app (server/fuel.js).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const QUERY = '[out:json][timeout:90];area["ISO3166-1"="UZ"][admin_level=2]->.uz;nwr["amenity"="fuel"](area.uz);out center tags;';
const OUT = new URL('../server/data/fuel-uz.json', import.meta.url);

const raw = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], 'utf8'))
  : await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: QUERY }), headers: { 'User-Agent': 'voli-app' } })).json();

const yes = v => v === 'yes';
const no = v => v === 'no';
const METAN = /метан|metan|methane|cng|агнкс|agnks|компрессор/i;
const PROPAN = /пропан|propan|propane|lpg|агзс|agzs|суюлтирилган/i;
const GAS = /газ|gaz\b|gas\b/i;
const PETROL = /бензин|benzin|азс|ayoqsh|lukoil|лукойл|neft|нефт|petrol|mustang|shell|uzbekneftegaz/i;

const stations = [];
for (const e of raw.elements ?? []) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) continue;
  const name = (t['name:ru'] || t.name || t['name:uz'] || t.brand || '').trim();
  const text = `${name} ${t.brand ?? ''} ${t.operator ?? ''}`;
  const tag = keys => keys.map(k => t[`fuel:${k}`]);
  const metanTags = tag(['cng', 'metan', 'methane', 'natural_gas', 'lng']);
  const propanTags = tag(['lpg', 'propane', 'propan']);
  const octane = Object.entries(t).filter(([k]) => /^fuel:octane_/.test(k)).map(([, v]) => v);
  const metan = metanTags.some(yes) || METAN.test(text) ? true : metanTags.some(no) ? false : null;
  const propan = propanTags.some(yes) || PROPAN.test(text) ? true : propanTags.some(no) ? false : null;
  const gasOnlyByName = (METAN.test(text) || PROPAN.test(text) || GAS.test(text)) && !PETROL.test(text);
  const petrol = octane.some(yes) || PETROL.test(text) ? true : octane.length && octane.every(no) ? false : gasOnlyByName ? null : true;
  const diesel = yes(t['fuel:diesel']) ? true : no(t['fuel:diesel']) ? false : null;
  const gas = metan || propan || (gasOnlyByName && GAS.test(text));
  if (!gas && !petrol) continue;
  const address = [t['addr:city'], t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
  stations.push({
    id: `osm-${e.type[0]}${e.id}`,
    name: name || null,
    brand: t.brand || t.operator || null,
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    metan: metan ?? (gas && !propan ? true : null),
    propan,
    petrol: petrol === true,
    diesel,
    address: address || null,
    hours: t.opening_hours || null,
  });
}

mkdirSync(new URL('../server/data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({ source: '© OpenStreetMap contributors (ODbL)', at: new Date().toISOString().slice(0, 10), stations }));
console.log(`${stations.length} stations · gas ${stations.filter(s => s.metan || s.propan).length} · petrol ${stations.filter(s => s.petrol).length}`);

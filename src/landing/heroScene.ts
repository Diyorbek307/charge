import { UZ_RINGS } from './uzShape';

/**
 * Flat geometry for the hero map: Uzbekistan's outline, hub cities and the
 * charging corridors between them, projected into one SVG coordinate space.
 */

export type ScenePoint = { id: string; lat: number; lng: number };
export type SceneStation = ScenePoint & { power: number; free: number; total: number };

const LAT0 = 41.3;
const K = Math.cos((LAT0 * Math.PI) / 180);
/** SVG units per degree of latitude. */
const S = 60;
const PAD = 24;

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const ring of UZ_RINGS) {
  for (const [lng, lat] of ring) {
    minX = Math.min(minX, lng * K * S); maxX = Math.max(maxX, lng * K * S);
    minY = Math.min(minY, -lat * S); maxY = Math.max(maxY, -lat * S);
  }
}

export const MAP_W = Math.round(maxX - minX + PAD * 2);
export const MAP_H = Math.round(maxY - minY + PAD * 2);

/** lng/lat → SVG x/y, north up. */
export function project(lng: number, lat: number): [number, number] {
  return [lng * K * S - minX + PAD, -lat * S - minY + PAD];
}

/** The country outline as one SVG path (even-odd fill). */
export const UZ_PATH = UZ_RINGS.map(ring =>
  ring.map(([lng, lat], i) => {
    const [x, y] = project(lng, lat);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('') + 'Z',
).join('');

export const HUB_CITIES: ScenePoint[] = [
  { id: 'tashkent', lat: 41.311, lng: 69.24 },
  { id: 'samarkand', lat: 39.654, lng: 66.96 },
  { id: 'bukhara', lat: 39.775, lng: 64.429 },
  { id: 'khiva', lat: 41.378, lng: 60.364 },
  { id: 'nukus', lat: 42.46, lng: 59.603 },
  { id: 'namangan', lat: 40.998, lng: 71.673 },
  { id: 'andijan', lat: 40.783, lng: 72.344 },
  { id: 'fergana', lat: 40.386, lng: 71.787 },
  { id: 'navoi', lat: 40.103, lng: 65.374 },
  { id: 'karshi', lat: 38.861, lng: 65.789 },
  { id: 'termez', lat: 37.224, lng: 67.278 },
  { id: 'jizzakh', lat: 40.116, lng: 67.842 },
  { id: 'gulistan', lat: 40.49, lng: 68.784 },
  { id: 'kokand', lat: 40.529, lng: 70.943 },
  { id: 'urgench', lat: 41.55, lng: 60.633 },
];

/** Charging corridors along the main highways. */
export const CORRIDORS: [string, string][] = [
  ['tashkent', 'gulistan'], ['gulistan', 'jizzakh'], ['jizzakh', 'samarkand'],
  ['samarkand', 'navoi'], ['navoi', 'bukhara'], ['bukhara', 'urgench'],
  ['urgench', 'khiva'], ['urgench', 'nukus'], ['samarkand', 'karshi'],
  ['karshi', 'termez'], ['tashkent', 'kokand'], ['kokand', 'fergana'],
  ['fergana', 'andijan'], ['kokand', 'namangan'], ['namangan', 'andijan'],
  ['bukhara', 'karshi'],
];

/** The trip the hero car drives: Tashkent → Samarkand → Bukhara → Khiva. */
export const HERO_TRIP = ['tashkent', 'gulistan', 'jizzakh', 'samarkand', 'navoi', 'bukhara', 'urgench', 'khiva'];

const city = new Map(HUB_CITIES.map(c => [c.id, project(c.lng, c.lat)]));
export const cityXY = (id: string) => city.get(id) ?? [0, 0];

/** A gently bowed segment between two cities, so roads don't look ruled. */
function bow(a: [number, number], b: [number, number], k = 0.12) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return `Q${(mx - dy * k).toFixed(1)} ${(my + dx * k).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

export const CORRIDOR_PATHS = CORRIDORS.map(([a, b]) => {
  const pa = cityXY(a), pb = cityXY(b);
  return `M${pa[0].toFixed(1)} ${pa[1].toFixed(1)}${bow(pa, pb)}`;
});

export const TRIP_PATH = HERO_TRIP.map((id, i) => {
  const p = cityXY(id);
  return i ? bow(cityXY(HERO_TRIP[i - 1]), p) : `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
}).join('');

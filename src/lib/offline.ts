/**
 * Offline packs for the highways: before a trip the driver saves the map of
 * the road corridor, the stations on it and the road itself. On the desert
 * stretches (Bukhara — Khiva, the Kyzylkum) the app then opens, shows the
 * map and the chargers, and guides along the saved road with no signal.
 *
 * The files sit in Cache Storage under `pg-offline-*`, which the service
 * worker serves first and never clears on a new build. The pack list and
 * the station snapshot live in localStorage.
 */
import { useEffect, useState } from 'react';
import type { Station } from '../data/mockData';
import { MAP_STYLE } from './mapTiles';
import { dist, project, type Camera, type LatLng, type Route } from './nav';

export interface OfflinePack {
  id: string;
  name: string;
  /** When it was saved, ms. */
  at: number;
  tiles: number;
  bytes: number;
  /** The road, thinned to a point every ~150 m. */
  line: [number, number][];
  stations: string[];
  cameras: Camera[];
}

const PACKS = 'oc-offline-packs';
const SNAPSHOT = 'oc-offline-stations';
const MAP_CACHE = 'pg-offline-map';
const APP_CACHE = 'pg-offline-app';
const CHANGE = 'oc-offline-change';
/** A pack never asks for more than this many map tiles; a long trip is still well under it. */
export const MAX_TILES = 3000;
/** Average vector tile out on the roads, for the size shown before saving. */
const AVG_TILE_KB = 28;

const read = <T,>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or private mode: the pack still works this visit */
  }
};

export const offlinePacks = (): OfflinePack[] => read<OfflinePack[]>(PACKS, []);

/** The saved packs, kept current when one is added or removed anywhere in the app. */
export function useOfflinePacks() {
  const [packs, setPacks] = useState(offlinePacks);
  useEffect(() => {
    const on = () => setPacks(offlinePacks());
    window.addEventListener(CHANGE, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(CHANGE, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return packs;
}

/** Stations as they were when a pack was last saved: the map's fallback with no signal at all. */
export const savedStations = (): { at: number; stations: Station[] } | null => read(SNAPSHOT, null);

// ── tiles ────────────────────────────────────────────────────────────────

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
/** Width of one tile at this zoom and latitude, km. */
const tileKm = (lat: number, z: number) => (40075 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** Uzbekistan's box: the overview zooms cover all of it, so the map never shows a blank country. */
const UZ = { s: 37.1, n: 45.6, w: 55.9, e: 73.2 };

/**
 * Tiles to keep: the country at overview zooms, the road corridor up to
 * zoom 12 (a tile either side from zoom 10), and the streets around each
 * charger up to zoom 15 so its entrance can be found.
 */
export function tilesFor(line: LatLng[], spots: LatLng[]): string[] {
  const out = new Set<string>();
  const add = (z: number, x: number, y: number) => out.add(`${z}/${x}/${y}`);
  for (let z = 5; z <= 7; z++) {
    for (let x = tileX(UZ.w, z); x <= tileX(UZ.e, z); x++) for (let y = tileY(UZ.n, z); y <= tileY(UZ.s, z); y++) add(z, x, y);
  }
  for (let z = 8; z <= 12; z++) {
    const ring = 1;
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      // Walk each segment in steps of a third of a tile so no tile on the road is skipped.
      const q = line[i + 1] ?? p;
      const n = Math.max(1, Math.ceil(dist(p, q) / 1000 / (tileKm(p.lat, z) / 3)));
      for (let k = 0; k < n; k++) {
        const lat = p.lat + ((q.lat - p.lat) * k) / n;
        const lng = p.lng + ((q.lng - p.lng) * k) / n;
        const x = tileX(lng, z);
        const y = tileY(lat, z);
        for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) add(z, x + dx, y + dy);
      }
    }
  }
  for (const s of spots) {
    for (let z = 13; z <= 15; z++) {
      const x = tileX(s.lng, z);
      const y = tileY(s.lat, z);
      const ring = 1;
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) add(z, x + dx, y + dy);
    }
  }
  return [...out];
}

export const estimateMb = (tiles: number) => Math.max(1, Math.round((tiles * AVG_TILE_KB) / 1024));

/** Every file the vector map needs besides tiles: style, tile manifest, icons and the fonts for Latin and Cyrillic. */
async function styleFiles(): Promise<{ files: string[]; tileTemplate: string | null; rasterTemplates: string[] }> {
  if (!MAP_STYLE) return { files: [], tileTemplate: null, rasterTemplates: [] };
  const style = (await (await fetch(MAP_STYLE)).json()) as {
    sources: Record<string, { type: string; url?: string; tiles?: string[]; maxzoom?: number }>;
    sprite?: string;
    glyphs?: string;
    layers: { layout?: { 'text-font'?: unknown } }[];
  };
  const files = [MAP_STYLE];
  let tileTemplate: string | null = null;
  const rasterTemplates: string[] = [];
  for (const src of Object.values(style.sources)) {
    if (src.type === 'vector' && src.url) {
      files.push(src.url);
      const tj = (await (await fetch(src.url)).json()) as { tiles: string[] };
      tileTemplate = tj.tiles[0] ?? null;
    } else if (src.type === 'vector' && src.tiles?.[0]) tileTemplate = src.tiles[0];
    if (src.type === 'raster' && src.tiles?.[0] && (src.maxzoom ?? 22) <= 7) rasterTemplates.push(src.tiles[0]);
  }
  if (style.sprite) for (const v of ['', '@2x']) for (const ext of ['json', 'png']) files.push(`${style.sprite}${v}.${ext}`);
  if (style.glyphs) {
    const stacks = new Set<string>();
    for (const l of style.layers) {
      const f = l.layout?.['text-font'];
      if (Array.isArray(f) && f.every(x => typeof x === 'string')) stacks.add(f.join(','));
    }
    // Latin, Latin extended (Uzbek letters), Cyrillic, and the quote marks of oʻ/gʻ.
    const ranges = ['0-255', '256-511', '512-767', '768-1023', '1024-1279', '8192-8447'];
    for (const s of stacks) for (const r of ranges) files.push(style.glyphs.replace('{fontstack}', s).replace('{range}', r));
  }
  return { files: files.map(u => new URL(u).href), tileTemplate, rasterTemplates };
}

/** The app's own code, so every screen opens offline, not only the ones already visited. */
async function appFiles(): Promise<string[]> {
  try {
    const list = (await (await fetch('/asset-list.json', { cache: 'no-store' })).json()) as string[];
    return ['/', ...list.filter(f => /\.(m?js|css|woff2?)$/.test(f)).map(f => `/${f}`)];
  } catch {
    return ['/'];
  }
}

/** Fetches into a cache with a few requests at a time, skipping what is already there. */
async function fill(cacheName: string, urls: string[], onFile: (bytes: number) => void, signal?: AbortSignal) {
  const cache = await caches.open(cacheName);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
      const url = urls[next++];
      const have = await cache.match(url);
      if (have) {
        onFile(Number(have.headers.get('content-length')) || AVG_TILE_KB * 1024);
        continue;
      }
      try {
        const res = await fetch(url, { signal, mode: url.startsWith('/') ? 'same-origin' : 'cors' });
        if (res.ok) {
          const blob = await res.clone().blob();
          await cache.put(url, res);
          onFile(blob.size);
        } else onFile(0);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        onFile(0);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/** Thins a road to a point every `step` metres. */
function thin(line: LatLng[], step = 150): [number, number][] {
  const out: [number, number][] = [];
  let last: LatLng | null = null;
  for (const p of line) {
    if (!last || dist(last, p) >= step) {
      out.push([+p.lat.toFixed(5), +p.lng.toFixed(5)]);
      last = p;
    }
  }
  const end = line[line.length - 1];
  if (end) out.push([+end.lat.toFixed(5), +end.lng.toFixed(5)]);
  return out;
}

export interface SaveInput {
  id: string;
  name: string;
  line: LatLng[];
  stations: Station[];
  cameras?: Camera[];
  allStations: Station[];
  onProgress: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Saves a road: map files, tiles, the app's code, and the stations along it. */
export async function savePack(input: SaveInput): Promise<OfflinePack> {
  // Ask the browser not to clear these files when space runs low.
  await navigator.storage?.persist?.().catch(() => false);
  const spots = input.stations.map(s => ({ lat: s.geoLat, lng: s.geoLng }));
  const keys = tilesFor(input.line, [...spots, input.line[0], input.line[input.line.length - 1]].filter(Boolean)).slice(0, MAX_TILES);
  const { files, tileTemplate, rasterTemplates } = await styleFiles();
  const tiles = tileTemplate ? keys.map(k => { const [z, x, y] = k.split('/'); return tileTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y); }) : [];
  // The shaded relief under the overview zooms.
  const relief = rasterTemplates.flatMap(t => keys.filter(k => Number(k.split('/')[0]) <= 6).map(k => { const [z, x, y] = k.split('/'); return t.replace('{z}', z).replace('{x}', x).replace('{y}', y); }));
  const app = await appFiles();
  const total = files.length + tiles.length + relief.length + app.length;
  let done = 0;
  let bytes = 0;
  const tick = (b: number) => {
    done++;
    bytes += b;
    input.onProgress(done, total);
  };
  await fill(APP_CACHE, app, tick, input.signal);
  await fill(MAP_CACHE, files, tick, input.signal);
  await fill(MAP_CACHE, [...tiles, ...relief], tick, input.signal);

  const pack: OfflinePack = {
    id: input.id,
    name: input.name,
    at: Date.now(),
    tiles: tiles.length,
    bytes,
    line: thin(input.line),
    stations: input.stations.map(s => s.id),
    cameras: input.cameras ?? [],
  };
  write(PACKS, [pack, ...offlinePacks().filter(p => p.id !== pack.id)]);
  // Every station, not only the trip's: with no signal the whole map still has something true to show.
  write(SNAPSHOT, { at: Date.now(), stations: input.allStations });
  window.dispatchEvent(new Event(CHANGE));
  return pack;
}

/** Removes a pack; its map files go once no other pack uses them. */
export async function deletePack(id: string) {
  const rest = offlinePacks().filter(p => p.id !== id);
  write(PACKS, rest);
  if (!rest.length) {
    await caches.delete(MAP_CACHE);
    await caches.delete(APP_CACHE);
    try {
      localStorage.removeItem(SNAPSHOT);
    } catch {
      /* nothing to clear */
    }
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** How much the packs take on this device, bytes. */
export const packsBytes = (packs = offlinePacks()) => packs.reduce((n, p) => n + p.bytes, 0);

/**
 * A route with no signal: the stretch of a saved road between here and the
 * destination, when both lie on it. No turn list, but distance, time,
 * where the car is on the road and the cameras still work.
 */
export function offlineRoute(from: LatLng, to: LatLng): Route | null {
  for (const p of offlinePacks()) {
    const line = p.line.map(([lat, lng]) => ({ lat, lng }));
    if (line.length < 2) continue;
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
    const full: Route = { line, cum, length: cum[cum.length - 1], duration: 0, steps: [] };
    const a = project(full, from);
    const b = project(full, to);
    // Both ends within 5 km of the saved road.
    if (a.off > 5000 || b.off > 5000) continue;
    const [lo, hi] = a.along <= b.along ? [a, b] : [b, a];
    const part = [lo.point, ...line.filter((_, i) => cum[i] > lo.along && cum[i] < hi.along), hi.point];
    const ordered = a.along <= b.along ? part : part.reverse();
    const pcum = [0];
    for (let i = 1; i < ordered.length; i++) pcum.push(pcum[i - 1] + dist(ordered[i - 1], ordered[i]));
    const length = pcum[pcum.length - 1];
    // Highway pace, as the trip planner assumes.
    return { line: ordered, cum: pcum, length, duration: (length / 1000 / 80) * 3600, steps: [] };
  }
  return null;
}

/** Cameras saved with the packs, inside a box. */
export function offlineCameras(box: { s: number; w: number; n: number; e: number }): Camera[] {
  const seen = new Set<string>();
  return offlinePacks()
    .flatMap(p => p.cameras)
    .filter(c => c.lat >= box.s && c.lat <= box.n && c.lng >= box.w && c.lng <= box.e && !seen.has(c.id) && (seen.add(c.id), true));
}

import { useEffect, useState } from 'react';

/** Where the driver is, once they have shared it on the map; shared across screens. */
type Point = { lat: number; lng: number };
/** A fix also says how sure it is (metres) and, when moving, which way (degrees from north). */
export type Fix = Point & { accuracy?: number; heading?: number | null };
let here: Fix | null = null;
const listeners = new Set<(p: Fix | null) => void>();
const LAST = 'oc-last-pos';

export function setMyLocation(p: Fix | null) {
  here = p;
  for (const l of listeners) l(p);
  if (p) {
    try {
      localStorage.setItem(LAST, JSON.stringify({ lat: p.lat, lng: p.lng, ts: Date.now() }));
    } catch {
      /* private mode */
    }
  }
}

/**
 * Where the driver was last time, for opening the map there at once instead
 * of jumping from Tashkent. Not a current position: distances never use it.
 */
export function lastKnown(maxAgeDays = 14): Point | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? 'null') as (Point & { ts: number }) | null;
    if (v && Date.now() - v.ts < maxAgeDays * 86400_000) return { lat: v.lat, lng: v.lng };
  } catch {
    /* nothing saved */
  }
  return null;
}

/** Whether the browser will hand over the position without asking ('granted'), ask ('prompt') or never ('denied'). */
export async function geoPermission(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'unknown';
  }
}

/** Keeps the position fresh while a map is open; returns the stop. */
export function watchLocation(): () => void {
  if (!navigator.geolocation?.watchPosition) return () => undefined;
  const id = navigator.geolocation.watchPosition(
    pos => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: Number.isFinite(pos.coords.heading) && (pos.coords.speed ?? 0) > 1 ? pos.coords.heading : null }),
    () => undefined,
    { maximumAge: 15_000, timeout: 20_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function useMyLocation() {
  const [p, setP] = useState(here);
  useEffect(() => {
    listeners.add(setP);
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}

/** Asks the browser once; resolves to null when the driver says no. */
export function locate(timeout = 8000): Promise<Fix | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setMyLocation(p);
        resolve(p);
      },
      () => resolve(null),
      { timeout },
    );
  });
}

/** Great-circle distance in km. */
export function km(a: Point, b: Point) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Rough road time: roads are ~1.3× the straight line; ~30 km/h in town, ~70 km/h between cities. */
export function driveMinutes(distanceKm: number) {
  const road = distanceKm * 1.3;
  return Math.max(1, Math.round((road / (road < 20 ? 30 : 70)) * 60));
}

export const fmtKm = (d: number) => (d < 1 ? `${Math.max(10, Math.round((d * 1000) / 10) * 10)} м` : d < 10 ? `${d.toFixed(1).replace('.', ',')} км` : `${Math.round(d)} км`);

/** Open right now by the station's hours ("24/7" or "08:00–22:00"), in Tashkent time. */
export function openNow(hours: string | undefined, at = Date.now()) {
  if (!hours || hours === '24/7') return true;
  const m = hours.match(/^(\d\d):(\d\d)[–-](\d\d):(\d\d)$/);
  if (!m) return true;
  const d = new Date(at + 5 * 3600_000);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  const from = +m[1] * 60 + +m[2];
  const to = +m[3] * 60 + +m[4];
  return from <= to ? now >= from && now < to : now >= from || now < to;
}

/** Connector names differ in spacing between sources ("Type 2" / "Type2"). */
export const samePort = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

import { useEffect, useState } from 'react';

/** Where the driver is, once they have shared it on the map; shared across screens. */
type Point = { lat: number; lng: number };
let here: Point | null = null;
const listeners = new Set<(p: Point | null) => void>();

export function setMyLocation(p: Point | null) {
  here = p;
  for (const l of listeners) l(p);
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
export function locate(timeout = 8000): Promise<Point | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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

export const fmtKm = (d: number) => (d < 10 ? `${d.toFixed(1).replace('.', ',')} км` : `${Math.round(d)} км`);

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

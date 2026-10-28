import { useState } from 'react';
import { Coffee, Hotel, Fuel, Bath, LoaderCircle, MapPin } from 'lucide-react';

/**
 * What is around a charging stop while the car charges: cafés, hotels,
 * toilets and fuel stations, from OpenStreetMap through the Overpass API.
 * Fetched only when the driver asks, and cached for the session.
 */

type Place = { name: string; kind: 'food' | 'hotel' | 'toilets' | 'fuel'; lat: number; lng: number };
const cache = new Map<string, Place[]>();

async function nearby(lat: number, lng: number): Promise<Place[]> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key)!;
  const q = `[out:json][timeout:15];(
    nwr(around:1200,${lat},${lng})[amenity~"^(cafe|restaurant|fast_food)$"];
    nwr(around:1200,${lat},${lng})[amenity=toilets];
    nwr(around:3000,${lat},${lng})[tourism~"^(hotel|motel|guest_house|hostel)$"];
    nwr(around:2000,${lat},${lng})[amenity=fuel];
  );out center 60;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }) });
  if (!res.ok) throw new Error('Сервис карт не ответил');
  const json = (await res.json()) as { elements: { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }[] };
  const places = json.elements
    .map(e => {
      const t = e.tags ?? {};
      const kind: Place['kind'] = t.tourism ? 'hotel' : t.amenity === 'toilets' ? 'toilets' : t.amenity === 'fuel' ? 'fuel' : 'food';
      return { name: t['name:ru'] || t.name || t['name:uz'] || '', kind, lat: e.lat ?? e.center?.lat ?? lat, lng: e.lon ?? e.center?.lon ?? lng };
    })
    .filter(p => p.name || p.kind === 'toilets');
  cache.set(key, places);
  return places;
}

const ICON = { food: <Coffee size={12} />, hotel: <Hotel size={12} />, toilets: <Bath size={12} />, fuel: <Fuel size={12} /> };
const LABEL = { food: 'Еда', hotel: 'Ночлег', toilets: 'Туалет', fuel: 'АЗС' };

export default function NearbyStop({ lat, lng }: { lat: number; lng: number }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setPlaces(await nearby(lat, lng));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!places) {
    return (
      <button onClick={load} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 disabled:opacity-50">
        {busy ? <LoaderCircle size={11} className="animate-spin" /> : <MapPin size={11} />}
        {busy ? 'Ищем…' : 'Что рядом, пока заряжаетесь'}
        {error && <span className="text-red-500 font-normal ml-1">{error}</span>}
      </button>
    );
  }
  const by = (k: Place['kind']) => places.filter(p => p.kind === k);
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap gap-1">
        {(['food', 'hotel', 'toilets', 'fuel'] as const).map(k => (
          <span key={k} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg ${by(k).length ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{ICON[k]}{`${LABEL[k]} · ${by(k).length}`}</span>
        ))}
      </div>
      {places.filter(p => p.name).slice(0, 4).map((p, i) => (
        <a key={i} href={`https://yandex.uz/maps/?pt=${p.lng},${p.lat}&z=17`} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-slate-600 truncate hover:underline">
          {ICON[p.kind]} <span className="ml-1">{p.name}</span>
        </a>
      ))}
      <p className="text-[10px] text-slate-400">Данные © участники OpenStreetMap</p>
    </div>
  );
}

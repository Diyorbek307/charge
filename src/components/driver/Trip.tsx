import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpDown, Zap, Flag, Circle, Clock, Wallet, AlertTriangle, Route as RouteIcon } from 'lucide-react';
import type { Station } from '../../data/mockData';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';
import NearbyStop from './Nearby';
import OfflineTrip from './OfflineTrip';

const CITIES: { id: string; name: string; lat: number; lng: number }[] = [
  { id: 'tashkent', name: 'Ташкент', lat: 41.311, lng: 69.24 },
  { id: 'samarkand', name: 'Самарканд', lat: 39.654, lng: 66.96 },
  { id: 'bukhara', name: 'Бухара', lat: 39.775, lng: 64.429 },
  { id: 'navoi', name: 'Навои', lat: 40.103, lng: 65.374 },
  { id: 'jizzakh', name: 'Джизак', lat: 40.116, lng: 67.842 },
  { id: 'gulistan', name: 'Гулистан', lat: 40.49, lng: 68.784 },
  { id: 'karshi', name: 'Карши', lat: 38.861, lng: 65.789 },
  { id: 'termez', name: 'Термез', lat: 37.224, lng: 67.278 },
  { id: 'kokand', name: 'Коканд', lat: 40.529, lng: 70.943 },
  { id: 'fergana', name: 'Фергана', lat: 40.386, lng: 71.787 },
  { id: 'namangan', name: 'Наманган', lat: 40.998, lng: 71.673 },
  { id: 'andijan', name: 'Андижан', lat: 40.783, lng: 72.344 },
  { id: 'urgench', name: 'Ургенч', lat: 41.55, lng: 60.633 },
  { id: 'khiva', name: 'Хива', lat: 41.378, lng: 60.364 },
  { id: 'nukus', name: 'Нукус', lat: 42.46, lng: 59.603 },
];

/** Roads are longer than the straight line; 1.25 is typical for Uzbekistan's trunk roads. */
const ROAD = 1.25;
/** kWh per km for an average EV at highway speed. */
const USE = 0.18;
/** Left in the battery on arrival at the destination, and at a charger. */
const RESERVE = 10;
const STOP_RESERVE = 15;
const DEFAULT_TARGET = 80;
const SPEED = 80;
/** How far off the road a charger may be. */
const DETOUR_KM = 20;
const effectiveKw = (power: number) => (power >= 50 ? power * 0.6 : Math.min(power, 11) * 0.95);

/**
 * Weather changes what a kilometre costs: cold batteries and the heater take
 * about a fifth more in winter, the air conditioning a little in the summer
 * heat. Figures are typical for EVs, not one car's.
 */
export type Weather = 'mild' | 'cold' | 'hot';
const WEATHER: Record<Weather, { extra: number; label: string }> = {
  mild: { extra: 0, label: 'Обычная погода' },
  cold: { extra: 0.22, label: 'Холод, от 0 до −15 °C' },
  hot: { extra: 0.08, label: 'Жара, от +35 °C' },
};
/** The weather to expect this month in Tashkent: winter December–February, heat June–August. */
export const seasonNow = (d = new Date()): Weather => {
  const m = new Date(d.getTime() + 5 * 3600_000).getUTCMonth();
  return m === 11 || m <= 1 ? 'cold' : m >= 5 && m <= 7 ? 'hot' : 'mild';
};

/**
 * The Kamchik pass (2 267 m) between Tashkent and the Fergana valley: about
 * 2 000 m of climb one way. Lifting a two-tonne car that high takes ~11 kWh;
 * regeneration wins back part of it on the descent, so ~7 kWh is counted
 * where the road crosses the pass.
 */
const KAMCHIK = { lat: 41.1, lng: 70.52, kwh: 7 };
const VALLEY = new Set(['kokand', 'fergana', 'namangan', 'andijan']);
/** A trip between the Fergana valley and anywhere west of it goes over the pass. */
export const crossesKamchik = (from: string, to: string) => VALLEY.has(from) !== VALLEY.has(to);

type Stop = { station: Station; atKm: number; arrive: number; leave: number; kwh: number; minutes: number; cost: number; power: number; price: number };
type Plan = { km: number; stops: Stop[]; arrive: number; chargeMin: number; cost: number } | { error: string; km: number; stops: Stop[] };

/** Position along the from→to line (km) and distance off it, on a flat local projection. */
function project(from: { lat: number; lng: number }, to: { lat: number; lng: number }, p: { lat: number; lng: number }) {
  const kx = 111.32 * Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180);
  const ky = 110.57;
  const ax = 0, ay = 0;
  const bx = (to.lng - from.lng) * kx, by = (to.lat - from.lat) * ky;
  const px = (p.lng - from.lng) * kx, py = (p.lat - from.lat) * ky;
  const len = Math.hypot(bx - ax, by - ay);
  const t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (len * len);
  const off = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
  return { along: t * len, off, len };
}

export function plan(stations: Station[], from: { lat: number; lng: number }, to: { lat: number; lng: number }, startSoc: number, pack: number, carKw: number, TARGET = DEFAULT_TARGET, road: { weather?: Weather; pass?: boolean } = {}): Plan {
  const line = project(from, to, to);
  const total = line.len * ROAD;
  // The battery pays in "energy km": the distance with the weather and the pass added.
  const factor = 1 + WEATHER[road.weather ?? 'mild'].extra;
  const passAt = road.pass ? Math.min(Math.max(project(from, to, KAMCHIK).along * ROAD, 0), total) : Infinity;
  const passKm = road.pass ? KAMCHIK.kwh / USE : 0;
  const energy = (km: number) => km * factor + (km >= passAt ? passKm : 0);
  const totalE = energy(total);
  const candidates = stations
    .map(st => ({ st, ...project(from, to, { lat: st.geoLat, lng: st.geoLng }) }))
    .filter(c => c.along > 0 && c.along < line.len && c.off <= DETOUR_KM && c.st.connectors.some(k => k.status !== 'unavailable'))
    .map(c => {
      const usable = c.st.connectors.filter(k => k.status !== 'unavailable');
      const best = usable.reduce((a, b) => (b.power > a.power ? b : a));
      const km = c.along * ROAD + c.off;
      return { st: c.st, km, e: energy(km), power: Math.min(best.power, carKw), price: best.price };
    })
    .sort((a, b) => a.km - b.km);

  const kmPerPct = pack / 100 / USE;
  const stops: Stop[] = [];
  let at = 0;
  let atE = 0;
  let soc = startSoc;
  for (let guard = 0; guard < 12; guard++) {
    const reach = (soc - RESERVE) * kmPerPct;
    if (totalE - atE <= reach) {
      const arrive = Math.round(soc - (totalE - atE) / kmPerPct);
      return { km: Math.round(total), stops, arrive, chargeMin: stops.reduce((n, s) => n + s.minutes, 0), cost: stops.reduce((n, s) => n + s.cost, 0) };
    }
    // The farthest charger we can reach, preferring fast ones close to it.
    const toCharger = (soc - STOP_RESERVE) * kmPerPct;
    const reachable = candidates.filter(c => c.km > at + 5 && c.e - atE <= toCharger);
    if (!reachable.length) {
      return { error: `После ${Math.round(at)} км нет станции сети в пределах запаса хода (${Math.round(toCharger / factor)} км). На этом участке сеть ещё строится.`, km: Math.round(total), stops };
    }
    const far = reachable[reachable.length - 1].km;
    const pick = reachable.filter(c => c.km >= far - 40).sort((a, b) => b.power - a.power || b.km - a.km)[0];
    const arrive = soc - (pick.e - atE) / kmPerPct;
    // Charge only what the rest of the trip needs, up to 80%.
    const toFinish = RESERVE + 10 + (totalE - pick.e) / kmPerPct;
    let need = toFinish;
    if (toFinish > TARGET) {
      // Not enough to finish on 80%: charge at least far enough for the next charger, above 80% if it is far.
      const ahead = candidates.filter(c => c.km > pick.km + 5 && c.e - pick.e <= (100 - STOP_RESERVE) * kmPerPct);
      const hop = ahead.length ? STOP_RESERVE + (ahead[ahead.length - 1].e - pick.e) / kmPerPct : toFinish;
      need = Math.min(100, Math.max(TARGET, Math.min(hop, toFinish)));
    }
    const leave = Math.max(arrive, need);
    const kwh = ((leave - arrive) / 100) * pack;
    const minutes = Math.ceil((kwh / effectiveKw(pick.power)) * 60);
    stops.push({ station: pick.st, atKm: Math.round(pick.km), arrive: Math.round(arrive), leave: Math.round(leave), kwh: Math.round(kwh * 10) / 10, minutes, cost: Math.round(kwh * pick.price), power: pick.power, price: pick.price });
    at = pick.km;
    atE = pick.e;
    soc = leave;
  }
  return { error: 'Маршрут слишком длинный для планировщика', km: Math.round(total), stops };
}

const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min} мин`);

/** Plans a trip between cities on the real network: which chargers, how long, how much. */
export default function TripPlannerScreen({ onBack, onSelectStation }: { onBack: () => void; onSelectStation: (s: Station) => void }) {
  const { sessions, state } = useSync();
  const me = sessions.driver;
  const stations = useLiveStations();
  const companyCar = state?.vehicles.find(v => v.driverId === me?.id);
  const pack = me?.car?.battery ?? 60;
  const carKw = me?.car?.maxKw ?? 150;
  const [from, setFrom] = useState('tashkent');
  const [to, setTo] = useState('samarkand');
  const [soc, setSoc] = useState(companyCar?.battery ?? 80);
  const [weather, setWeather] = useState<Weather>(seasonNow);

  const a = CITIES.find(c => c.id === from)!;
  const b = CITIES.find(c => c.id === to)!;
  const pass = crossesKamchik(from, to);
  const result = useMemo(() => (from === to ? null : plan(stations, a, b, soc, pack, carKw, me?.car?.chargeLimit ?? DEFAULT_TARGET, { weather, pass })), [stations, a, b, soc, pack, carKw, from, to, me?.car?.chargeLimit, weather, pass]);
  const driveMin = result ? Math.round((result.km / SPEED) * 60) : 0;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Дорога по Узбекистану</h1>
          <p className="text-xs text-slate-500">{me?.car ? `${me.car.brand} ${me.car.model} · ${pack} кВт·ч` : `Батарея ${pack} кВт·ч — укажите свою машину в профиле`}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Circle size={12} className="text-emerald-500 fill-emerald-500 shrink-0" />
                <select value={from} onChange={e => setFrom(e.target.value)} aria-label="Откуда" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800">
                  {CITIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Flag size={12} className="text-sky-600 shrink-0" />
                <select value={to} onChange={e => setTo(e.target.value)} aria-label="Куда" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800">
                  {CITIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <button onClick={() => { setFrom(to); setTo(from); }} aria-label="Поменять местами" className="p-2 rounded-xl bg-slate-100 text-slate-500"><ArrowUpDown size={16} /></button>
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Заряд на старте</span><span className="font-semibold text-slate-800 tabular-nums">{soc}%</span></div>
            <input type="range" min={20} max={100} step={5} value={soc} onChange={e => setSoc(Number(e.target.value))} aria-label="Заряд на старте, %" className="w-full accent-sky-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Погода в дороге</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Погода в дороге">
              {(['mild', 'cold', 'hot'] as const).map(w => (
                <button key={w} role="radio" aria-checked={weather === w} onClick={() => setWeather(w)}
                  className={`px-2 py-2 rounded-xl text-[11px] font-semibold leading-tight transition-colors ${weather === w ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {w === 'mild' ? 'Обычно' : w === 'cold' ? 'Холод' : 'Жара'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!result ? (
          <p className="text-center text-sm text-slate-400 py-6">Выберите разные города</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <RouteIcon size={14} />, value: `${result.km} км`, label: 'по дороге' },
                { icon: <Clock size={14} />, value: dur(driveMin + ('error' in result ? 0 : result.chargeMin)), label: 'в пути с зарядками' },
                { icon: <Wallet size={14} />, value: 'error' in result ? '—' : `${Math.round(result.cost / 1000)}k`, label: 'сум на зарядку' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-2xl border border-slate-100 p-3 text-center">
                  <p className="text-sky-600 flex justify-center mb-1">{k.icon}</p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums">{k.value}</p>
                  <p className="text-[10px] text-slate-400">{k.label}</p>
                </div>
              ))}
            </div>

            {(weather !== 'mild' || pass) && (
              <div className="rounded-2xl bg-[#FFF4D1] text-[#6b4600] px-4 py-3 text-xs space-y-1">
                {weather !== 'mild' && <p>{`${WEATHER[weather].label}: расход примерно на ${Math.round(WEATHER[weather].extra * 100)}% выше — остановки посчитаны с этим.`}</p>}
                {pass && <p>{`Перевал Камчик (2 267 м): подъём съедает около ${KAMCHIK.kwh} кВт·ч — зарядитесь перед ним с запасом.`}</p>}
              </div>
            )}

            <ol className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
              <li className="flex gap-3">
                <Circle size={14} className="text-emerald-500 fill-emerald-500 mt-0.5 shrink-0" />
                <div><p className="text-sm font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{`старт · ${soc}%`}</p></div>
              </li>
              {result.stops.map((s, i) => (
                <li key={s.station.id} className="flex gap-3">
                  <Zap size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                  <button onClick={() => onSelectStation(s.station)} className="text-left w-full">
                    {i === 0 && s.atKm < 30 && <p className="text-[11px] font-semibold text-amber-600">Подзарядитесь перед выездом</p>}
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.station.name}</p>
                    <p className="text-xs text-slate-500">{`${s.atKm} км · ${s.station.city} · до ${s.power} кВт · ${s.price.toLocaleString('ru-RU')} сум/кВт·ч`}</p>
                    <p className="text-xs text-slate-400">{`${s.arrive}% → ${s.leave}% · ${s.kwh.toLocaleString('ru-RU')} кВт·ч · ${dur(s.minutes)} · ${s.cost.toLocaleString('ru-RU')} сум`}</p>
                  </button>
                  <NearbyStop lat={s.station.geoLat} lng={s.station.geoLng} />
                  </div>
                </li>
              ))}
              {'error' in result ? (
                <li className="flex gap-3 text-amber-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <p className="text-sm">{result.error}</p>
                </li>
              ) : (
                <li className="flex gap-3">
                  <Flag size={14} className="text-sky-600 mt-0.5 shrink-0" />
                  <div><p className="text-sm font-semibold text-slate-800">{b.name}</p><p className="text-xs text-slate-400">{`прибытие с ~${result.arrive}% заряда`}</p></div>
                </li>
              )}
            </ol>
            {state?.platform?.features.offline !== false && <OfflineTrip
              id={[from, to].sort().join('-')}
              name={`${a.name} — ${b.name}`}
              from={a}
              to={b}
              stations={result.stops.map(s => s.station)}
              allStations={stations}
            />}
            <p className="text-[11px] text-slate-400 px-1">Оценка: расход 0,18 кВт·ч/км (в холод и жару — больше, см. выше), скорость 80 км/ч, запас 15% у станции и 10% в конце, зарядка до 80% (выше — только если иначе не доехать). Цена — по текущим тарифам станций, к оплате — по фактической энергии и тарифу в момент старта.</p>
          </>
        )}
      </div>
    </div>
  );
}

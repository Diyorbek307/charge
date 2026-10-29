import { useEffect, useMemo, useRef, useState } from 'react';
import { offlineRoute, offlineCameras } from '../../lib/offline';
import { MapContainer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw, RefreshCw, Flag, X, Volume2, VolumeX, Camera as CameraIcon, LoaderCircle, Play, Zap,
} from 'lucide-react';
import type { Station } from '../../data/mockData';
import { useI18n } from '../../lib/i18n';
import { useSync } from '../../lib/sync';
import {
  type Camera, type LatLng, type Lang, type Route, type Step, fetchRoute, fetchCameras, project, pointAt, bearing, word, fmtDist, action, say, voiceLang, dist, spokenDist, spokenTime, prefetchSpeech,
} from '../../lib/nav';
import BaseMap from '../BaseMap';

const CITY_CENTER: LatLng = { lat: 41.3111, lng: 69.2797 };

function ManeuverIcon({ s, size = 34 }: { s: Step | null; size?: number }) {
  if (!s) return <ArrowUp size={size} />;
  if (s.type === 'arrive') return <Flag size={size} />;
  if (s.type === 'roundabout' || s.type === 'rotary') return <RefreshCw size={size} />;
  switch (s.modifier) {
    case 'right':
    case 'sharp right':
      return <ArrowRight size={size} />;
    case 'left':
    case 'sharp left':
      return <ArrowLeft size={size} />;
    case 'slight right':
      return <CornerUpRight size={size} />;
    case 'slight left':
      return <CornerUpLeft size={size} />;
    case 'uturn':
      return <RotateCcw size={size} />;
    default:
      return <ArrowUp size={size} />;
  }
}

/** Keeps the map on the car, pointing where it drives. */
function Follow({ at, zoom }: { at: LatLng | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (at) map.setView([at.lat, at.lng], zoom, { animate: true });
  }, [at, zoom, map]);
  return null;
}

const carIcon = (heading: number) =>
  L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#111;border:3px solid #FFC83D;display:grid;place-items:center;box-shadow:0 2px 10px rgba(0,0,0,.35);transform:rotate(${heading}deg)"><svg width="16" height="16" viewBox="0 0 24 24" fill="#FFC83D"><path d="M12 2 20 21 12 16 4 21z"/></svg></div>`,
  });
const camIcon = (driver: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:8px;background:${driver ? '#F59E0B' : '#DC2626'};border:2px solid white;display:grid;place-items:center;box-shadow:0 1px 6px rgba(0,0,0,.3)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></div>`,
  });
const flagIcon = L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  html: '<div style="width:34px;height:34px;border-radius:12px;background:#FFC83D;border:2px solid #111;display:grid;place-items:center"><svg width="18" height="18" viewBox="0 0 48 48"><path d="M28.5 6 L12.5 27.5 H22.5 L19 42 L35.5 19.5 H25.5 Z" fill="#111"/></svg></div>',
});

/**
 * Turn-by-turn navigation to a station, inside the app: the route on our map,
 * the next manoeuvre in words and by voice, cameras ahead with their limit,
 * rerouting when the car leaves the route, and the charge one tap away on
 * arrival. Without GPS (a desktop), a demo drive plays the route.
 */

/** Cameras on the route from the server, or the ones saved with an offline pack when there is no signal. */
async function camerasFor(r: Route): Promise<Camera[]> {
  const saved = () => {
    const lats = r.line.map(p => p.lat);
    const lngs = r.line.map(p => p.lng);
    return offlineCameras({ s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lngs), e: Math.max(...lngs) }).filter(c => project(r, c).off < 35);
  };
  try {
    const live = await fetchCameras(r);
    return live.length || navigator.onLine ? live : saved();
  } catch {
    return saved();
  }
}

export default function Navigator({ station, onClose, onArrive }: { station: Station; onClose: () => void; onArrive: () => void }) {
  const { lang: uiLang } = useI18n();
  const lang = uiLang as Lang;
  const { actions } = useSync();
  const dest = useMemo(() => ({ lat: station.geoLat, lng: station.geoLng }), [station.geoLat, station.geoLng]);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [speed, setSpeed] = useState<number | null>(null); // km/h
  const [heading, setHeading] = useState(0);
  const [noGps, setNoGps] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [sim, setSim] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const spoken = useRef(new Set<string>());
  const offCount = useRef(0);
  const routing = useRef(false);

  // Real position.
  useEffect(() => {
    if (!navigator.geolocation) {
      setNoGps(true);
      return;
    }
    const fallback = setTimeout(() => setNoGps(true), 7000);
    const id = navigator.geolocation.watchPosition(
      p => {
        clearTimeout(fallback);
        setNoGps(false);
        if (sim) return;
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        if (p.coords.speed !== null && p.coords.speed >= 0) setSpeed(Math.round(p.coords.speed * 3.6));
        if (p.coords.heading !== null && !Number.isNaN(p.coords.heading)) setHeading(p.coords.heading);
      },
      () => setNoGps(true),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => {
      clearTimeout(fallback);
      navigator.geolocation.clearWatch(id);
    };
  }, [sim]);

  const origin = pos ?? (noGps ? CITY_CENTER : null);

  const build = async (from: LatLng) => {
    if (routing.current) return;
    routing.current = true;
    setError(null);
    try {
      let r: Route;
      try {
        r = await fetchRoute(from, dest);
      } catch (e) {
        // No signal: follow a road saved for offline, when both ends lie on it.
        const saved = offlineRoute(from, dest);
        if (!saved) throw new Error(navigator.onLine ? (e as Error).message : 'Нет связи, а эта дорога не сохранена. Сохраните трассу в «Поездке» перед выездом.');
        r = saved;
        setNote('Без связи — ведём по сохранённой трассе, без подсказок поворотов');
      }
      setRoute(r);
      spoken.current.clear();
      setCameras(await camerasFor(r));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      routing.current = false;
    }
  };
  useEffect(() => {
    if (origin && !route) void build(origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, route]);

  // Cameras reported meanwhile, or just fetched from OpenStreetMap, appear within a minute.
  useEffect(() => {
    if (!route) return;
    const t = setInterval(() => void camerasFor(route).then(setCameras), 60_000);
    return () => clearInterval(t);
  }, [route]);

  // Demo drive: along the route at ~55 km/h, sped up four times.
  useEffect(() => {
    if (!sim || !route) return;
    let along = route ? project(route, pos ?? route.line[0]).along : 0;
    const t = setInterval(() => {
      along = Math.min(route.length, along + 60);
      const p = pointAt(route, along);
      const ahead = pointAt(route, Math.min(route.length, along + 20));
      setPos(p);
      setHeading(bearing(p, ahead));
      setSpeed(55);
      if (along >= route.length) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, route]);

  // Where the car is on the route, and what comes next.
  const here = route && origin ? project(route, origin) : null;
  const along = here?.along ?? 0;
  const left = route ? Math.max(0, route.length - along) : 0;
  const next = route?.steps.find(s => s.type !== 'depart' && s.along > along + 8) ?? null;
  const toNext = next ? Math.max(0, next.along - along) : 0;
  const arrived = !!route && (left < 30 || (origin ? dist(origin, dest) < 25 : false));
  const camsAhead = route
    ? cameras
        .map(c => ({ c, at: project(route, c).along - along }))
        .filter(x => x.at > 0 && x.at < 600)
        .sort((a, b) => a.at - b.at)
    : [];
  const cam = camsAhead[0] ?? null;
  const over = !!cam?.c.maxspeed && speed !== null && speed > cam.c.maxspeed + 5;
  const etaMin = route ? Math.max(1, Math.round(((route.duration * left) / Math.max(1, route.length)) / 60)) : 0;
  const etaClock = new Date(Date.now() + etaMin * 60000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // Off the route for a few fixes in a row: build a new one from here.
  useEffect(() => {
    if (!here || !origin || arrived) return;
    offCount.current = here.off > 60 ? offCount.current + 1 : 0;
    if (offCount.current >= 3) {
      offCount.current = 0;
      setNote(word(lang, 'reroute'));
      if (!muted) say(voiceLang(lang), word(voiceLang(lang), 'reroute'));
      void build(origin).then(() => setNote(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng]);

  // What is said about a turn: at ~1 km, at ~300 m and "now", with the next
  // turn chained on when it follows close behind.
  const turnPhrases = (vl: Lang, step: Step, distFar: number, distNear: number) => {
    if (!route) return null;
    const a = action(vl, step);
    const full = `${a.base}${a.street ? ` ${word(vl, 'onto', { name: a.street })}` : ''}`;
    const low = `${full.charAt(0).toLowerCase()}${full.slice(1)}`;
    const after = route.steps.find(x => x.along > step.along + 8 && x.type !== 'arrive');
    const chained = after && after.along - step.along < 150 ? `, ${word(vl, 'then')} ${action(vl, after).base.toLowerCase()}` : '';
    return {
      far: `${word(vl, 'in', { d: spokenDist(vl, distFar) })} ${low}`,
      near: `${word(vl, 'in', { d: spokenDist(vl, distNear) })} ${low}${chained}`,
      now: `${word(vl, 'now')} ${action(vl, step).base.toLowerCase()}${chained}`,
    };
  };

  // The voice is fetched ahead: the phrases of the next turn are ready before it comes.
  useEffect(() => {
    if (!route || !next || muted) return;
    const vl = voiceLang(lang);
    const p = turnPhrases(vl, next, 1000, 300);
    if (p) prefetchSpeech(vl, [p.far, p.near, p.now]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, next?.along, muted, lang]);

  // Voice, the way drivers here are used to from big navigators. Each camera
  // once at ~500 m with a chime and its limit; speeding is said at once.
  useEffect(() => {
    if (!route || muted) return;
    const vl = voiceLang(lang);
    const speak = (key: string, text: string, urgent = false, chimeFirst = false) => {
      if (spoken.current.has(key)) return;
      spoken.current.add(key);
      say(vl, text, urgent, { chime: chimeFirst });
    };
    if (arrived) return speak('arrive', word(vl, 'arriveSay', { name: station.name }), true);
    if (!spoken.current.has('depart') && along < 50) speak('depart', word(vl, 'departSay', { d: spokenDist(vl, route.length), t: spokenTime(vl, route.duration / 60) }));
    if (next) {
      const p = turnPhrases(vl, next, toNext, toNext)!;
      if (toNext <= 1100 && toNext > 700) speak(`${next.along}-1k`, p.far);
      if (toNext <= 380 && toNext > 160) speak(`${next.along}-300`, p.near);
      if (toNext <= 90) speak(`${next.along}-now`, p.now, true);
    }
    if (cam && cam.at <= 550) speak(`cam-${cam.c.id}`, `${word(vl, 'camAhead')}, ${spokenDist(vl, cam.at)}${cam.c.maxspeed ? `. ${word(vl, 'limitSay', { v: cam.c.maxspeed })}` : ''}`, false, true);
    if (over) speak(`over-${cam?.c.id}`, word(vl, 'overSay', { v: cam?.c.maxspeed ?? '' }), true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, along, next, toNext, cam, over, arrived, muted, lang]);

  const reportCamera = async () => {
    if (!origin) return;
    try {
      await actions.reportCamera(origin.lat, origin.lng);
      setNote('Спасибо — камера отмечена, другие водители её увидят');
      if (route) setCameras(await camerasFor(route));
    } catch (e) {
      setNote((e as Error).message);
    }
    setTimeout(() => setNote(null), 4000);
  };

  const a = next ? action(lang, next) : null;
  const passed = route && here ? route.line.slice(0, here.seg + 1).concat([here.point]) : [];
  const ahead = route && here ? [here.point, ...route.line.slice(here.seg + 1)] : route?.line ?? [];

  return (
    <div className="absolute inset-0 z-[9998] flex flex-col bg-[#111]" role="dialog" aria-modal="true" aria-label={`Навигация до ${station.name}`}>
      <div className="relative flex-1">
        <MapContainer center={[dest.lat, dest.lng]} zoom={15} zoomControl={false} attributionControl={false} className="absolute inset-0" style={{ background: '#e5e5e5' }}>
          <BaseMap />
          {passed.length > 1 && <Polyline positions={passed.map(p => [p.lat, p.lng])} pathOptions={{ color: '#9CA3AF', weight: 7, opacity: 0.8 }} />}
          {ahead.length > 1 && <Polyline positions={ahead.map(p => [p.lat, p.lng])} pathOptions={{ color: '#2563EB', weight: 8, opacity: 0.9 }} />}
          {cameras.map(c => (
            <Marker key={c.id} position={[c.lat, c.lng]} icon={camIcon(c.source === 'drivers')} />
          ))}
          <Marker position={[dest.lat, dest.lng]} icon={flagIcon} />
          {origin && <Marker position={[origin.lat, origin.lng]} icon={carIcon(heading)} />}
          <Follow at={origin} zoom={speed && speed > 70 ? 15 : 16} />
        </MapContainer>

        {/* Next manoeuvre */}
        <div className="absolute top-3 left-3 right-3 z-[1000] space-y-2">
          <div className="rounded-2xl bg-[#111] text-white p-3 flex items-center gap-3 shadow-xl">
            <div className="w-14 h-14 rounded-xl bg-[#FFC83D] text-[#111] grid place-items-center shrink-0"><ManeuverIcon s={arrived ? { type: 'arrive' } as Step : next} /></div>
            <div className="flex-1 min-w-0">
              {!route ? (
                <p className="text-sm flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />{error ?? 'Строим маршрут…'}</p>
              ) : arrived ? (
                <p className="text-lg font-bold">{word(lang, 'arrive')}</p>
              ) : (
                <>
                  <p className="text-2xl font-bold leading-tight tabular-nums">{fmtDist(lang, toNext)}</p>
                  <p className="text-sm text-white/85 truncate">
                    {a?.base}
                    {a?.street && <span data-no-translate>{` · ${a.street}`}</span>}
                  </p>
                </>
              )}
            </div>
            <button onClick={() => setMuted(m => !m)} aria-label={muted ? 'Включить голос' : 'Выключить голос'} className="p-2 rounded-xl bg-white/10">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          {cam && cam.at <= 500 && !arrived && (
            <div role="alert" className={`rounded-2xl px-3 py-2 flex items-center gap-2 text-white shadow-lg ${over ? 'bg-red-600' : 'bg-[#DC2626]/90'}`}>
              <CameraIcon size={18} />
              <span className="font-semibold text-sm flex-1">{word(lang, 'camera', { d: fmtDist(lang, cam.at) })}{cam.c.source === 'drivers' ? ' · отметили водители' : ''}</span>
              {cam.c.maxspeed && <span className="w-9 h-9 rounded-full bg-white text-[#111] border-4 border-red-500 grid place-items-center text-xs font-black">{cam.c.maxspeed}</span>}
            </div>
          )}
          {over && <p className="rounded-xl bg-red-600 text-white text-sm font-bold px-3 py-2 text-center">{word(lang, 'over')}</p>}
          {note && <p className="rounded-xl bg-white/95 text-slate-800 text-sm px-3 py-2 shadow">{note}</p>}
        </div>

        {/* Speed */}
        {speed !== null && (
          <div className="absolute left-3 bottom-3 z-[1000] w-16 h-16 rounded-full bg-white shadow-lg grid place-items-center">
            <div className="text-center leading-none">
              <p className={`text-xl font-black tabular-nums ${over ? 'text-red-600' : 'text-slate-900'}`}>{speed}</p>
              <p className="text-[10px] text-slate-500">км/ч</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="bg-white rounded-t-3xl -mt-4 relative z-[1001] px-4 pt-4 pb-6 space-y-3">
        {arrived ? (
          <>
            <p className="text-base font-bold text-slate-900">{station.name}</p>
            <button onClick={onArrive} className="w-full py-3.5 rounded-2xl bg-[#FFC83D] text-[#111] font-bold inline-flex items-center justify-center gap-2"><Zap size={18} />Начать зарядку</button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-slate-900 tabular-nums">{route ? `${etaMin} мин · ${fmtDist(lang, left)}` : '—'}</p>
              <p className="text-xs text-slate-500 truncate">{route ? `Прибытие в ${etaClock} · ${station.name}` : station.name}</p>
            </div>
            <button onClick={reportCamera} aria-label="Здесь камера" className="w-11 h-11 rounded-xl bg-slate-100 grid place-items-center"><CameraIcon size={18} className="text-slate-700" /></button>
            <button onClick={onClose} aria-label="Завершить навигацию" className="w-11 h-11 rounded-xl bg-red-50 grid place-items-center"><X size={20} className="text-red-600" /></button>
          </div>
        )}
        {noGps && !sim && route && !arrived && (
          <button onClick={() => setSim(true)} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold inline-flex items-center justify-center gap-2">
            <Play size={15} />Нет GPS — показать демо-поездку
          </button>
        )}
        {noGps && !pos && <p className="text-[11px] text-slate-500">Без GPS маршрут строится от центра Ташкента. В машине навигатор ведёт по вашему местоположению.</p>}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Zap, Flame, Fuel, Navigation, X, Clock, Users } from 'lucide-react';
import type { FuelKind, FuelStation } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { km, fmtKm } from '../../lib/geo';
import { plural } from '../../lib/analytics';

/**
 * The map's «Газ» and «Бензин» modes: gas and petrol stations from
 * OpenStreetMap instead of the chargers, and drivers telling each other
 * whether there is gas right now (server/fuel.js).
 */
export type MapMode = 'ev' | FuelKind;

const LOOK: Record<FuelKind, { color: string; soft: string; ink: string }> = {
  gas: { color: '#2563EB', soft: '#EAF1FE', ink: '#1D4ED8' },
  petrol: { color: '#EA7A12', soft: '#FFF2E5', ink: '#B45309' },
};
const NOW_COLOR = { yes: '#16A34A', no: '#EF4444', queue: '#F59E0B' } as const;

export function readMapMode(): MapMode {
  try {
    const m = localStorage.getItem('pg-map-mode');
    return m === 'gas' || m === 'petrol' ? m : 'ev';
  } catch {
    return 'ev';
  }
}
export function saveMapMode(m: MapMode) {
  try {
    localStorage.setItem('pg-map-mode', m);
  } catch {
    /* private mode: the choice lasts until the app closes */
  }
}

/** Электро · Газ · Бензин — one tap changes what the map shows. */
export function MapModeSwitch({ mode, onChange }: { mode: MapMode; onChange: (m: MapMode) => void }) {
  const items: { id: MapMode; label: string; icon: ReactNode; fill: string; ink: string; tint: string; glow: string }[] = [
    { id: 'ev', label: 'Электро', icon: <Zap size={15} strokeWidth={2.4} />, fill: 'linear-gradient(145deg,#E2F99A,#B9EC2E)', ink: '#111', tint: '#5B8A00', glow: 'rgba(143,214,26,.45)' },
    { id: 'gas', label: 'Газ', icon: <Flame size={15} strokeWidth={2.4} />, fill: 'linear-gradient(145deg,#4F8DF7,#2563EB)', ink: '#fff', tint: '#2563EB', glow: 'rgba(37,99,235,.38)' },
    { id: 'petrol', label: 'Бензин', icon: <Fuel size={15} strokeWidth={2.4} />, fill: 'linear-gradient(145deg,#FFA54A,#EA7A12)', ink: '#fff', tint: '#EA7A12', glow: 'rgba(234,122,18,.38)' },
  ];
  const at = Math.max(0, items.findIndex(i => i.id === mode));
  const cur = items[at];
  return (
    <div className="px-3 mb-3" role="radiogroup" aria-label="Что показать на карте">
      {/* A sliding coloured thumb under the chosen fuel; the others keep their colour on the icon. */}
      <div className="relative grid grid-cols-3 p-1 rounded-[20px] bg-[#F3F4F1] border border-slate-100">
        <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 rounded-2xl"
          style={{ width: 'calc((100% - 8px) / 3)', transform: `translateX(${at * 100}%)`, background: cur.fill, boxShadow: `0 6px 16px ${cur.glow}`, transition: 'transform .35s cubic-bezier(.32,.72,0,1), background .25s, box-shadow .25s' }} />
        {items.map(i => {
          const on = mode === i.id;
          return (
            <button key={i.id} role="radio" aria-checked={on} onClick={() => onChange(i.id)}
              className="relative z-[1] h-11 rounded-2xl text-[14px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-[.97] transition-[color,transform] duration-200"
              style={{ color: on ? i.ink : '#475569' }}>
              <span className="w-6 h-6 rounded-lg grid place-items-center transition-colors duration-200"
                style={on ? { background: i.ink === '#fff' ? 'rgba(255,255,255,.22)' : 'rgba(17,17,17,.08)', color: i.ink } : { background: '#fff', color: i.tint, boxShadow: '0 1px 2px rgba(15,23,42,.08)' }}>
                {i.icon}
              </span>
              {i.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function useFuelStations(kind: FuelKind | null) {
  const { actions } = useSync();
  const [list, setList] = useState<FuelStation[] | null>(null);
  useEffect(() => {
    if (!kind) return;
    let live = true;
    setList(null);
    actions.fuelStations(kind).then(r => live && setList(r.stations)).catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [actions, kind]);
  const replace = (s: FuelStation) => setList(v => v?.map(x => (x.id === s.id ? s : x)) ?? v);
  return { list, replace };
}

const pinCache = new Map<string, L.DivIcon>();
function fuelIcon(kind: FuelKind, now: FuelStation['now'], selected: boolean) {
  const key = `${kind}-${now?.status ?? ''}-${selected}`;
  let icon = pinCache.get(key);
  if (!icon) {
    const { color } = LOOK[kind];
    const size = selected ? 40 : 30;
    const glyph = kind === 'gas'
      ? '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'
      : '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>';
    const dot = now ? `<span style="position:absolute;right:-3px;top:-3px;width:12px;height:12px;border-radius:50%;background:${NOW_COLOR[now.status]};border:2px solid #fff"></span>` : '';
    const html = `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.3)${selected ? `,0 0 0 6px ${color}33` : ''};display:grid;place-items:center">`
      + `<svg width="${size / 2}" height="${size / 2}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>${dot}</div>`;
    icon = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    pinCache.set(key, icon);
  }
  return icon;
}

/** The stations in view (and a little around it), at most 150 nearest the centre, so the map stays quick. */
export function FuelMarkers({ kind, stations, selected, onSelect }: { kind: FuelKind; stations: FuelStation[]; selected: FuelStation | null; onSelect: (s: FuelStation) => void }) {
  const map = useMap();
  const [view, setView] = useState(() => ({ b: map.getBounds().pad(0.3), c: map.getCenter() }));
  useMapEvents({ moveend: () => setView({ b: map.getBounds().pad(0.3), c: map.getCenter() }) });
  // The chosen station goes to the upper part of the map: the card covers the lower half.
  useEffect(() => {
    if (!selected) return;
    const zoom = Math.max(map.getZoom(), 14);
    const p = map.project([selected.lat, selected.lng], zoom).add([0, map.getSize().y * 0.16]);
    map.flyTo(map.unproject(p, zoom), zoom, { duration: 0.6 });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Switching to «Газ» or «Бензин»: if none is in view, show the nearest few.
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!stations.length || fitted.current === kind) return;
    fitted.current = kind;
    const c = map.getCenter();
    // What is really in sight: above the sheet, below the top buttons.
    const size = map.getSize();
    const b = L.latLngBounds(map.containerPointToLatLng([0, 140]), map.containerPointToLatLng([size.x, size.y * 0.45]));
    if (stations.some(s => b.contains([s.lat, s.lng]))) return;
    const near = [...stations].sort((x, y) => ((x.lat - c.lat) ** 2 + (x.lng - c.lng) ** 2) - ((y.lat - c.lat) ** 2 + (y.lng - c.lng) ** 2)).slice(0, 5);
    map.fitBounds(L.latLngBounds([[c.lat, c.lng], ...near.map(s => [s.lat, s.lng] as [number, number])]), { paddingTopLeft: [40, 140], paddingBottomRight: [40, map.getSize().y * 0.55], maxZoom: 15 });
  }, [stations, kind, map]);
  const shown = useMemo(() => stations
    .filter(s => view.b.contains([s.lat, s.lng]))
    .map(s => ({ s, d: (s.lat - view.c.lat) ** 2 + (s.lng - view.c.lng) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 150)
    .map(x => x.s), [stations, view]);
  return (
    <>
      {shown.map(s => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={fuelIcon(kind, s.now, s.id === selected?.id)} zIndexOffset={s.id === selected?.id ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(s) }} />
      ))}
    </>
  );
}

const title = (s: FuelStation, kind: FuelKind) => s.name || s.brand || (kind === 'gas' ? 'Газовая заправка' : 'Заправка');
const ago = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return min < 60 ? `${min} мин назад` : `${Math.floor(min / 60)} ч назад`;
};
const NOW_TEXT: Record<FuelKind, Record<'yes' | 'no' | 'queue', string>> = {
  gas: { yes: 'Газ есть', no: 'Газа нет', queue: 'Очередь' },
  petrol: { yes: 'Бензин есть', no: 'Бензина нет', queue: 'Очередь' },
};

function chips(s: FuelStation) {
  const out: string[] = [];
  if (s.metan) out.push('Метан');
  if (s.propan) out.push('Пропан');
  if (s.petrol) out.push('Бензин');
  if (s.diesel) out.push('Дизель');
  return out;
}

/** The sheet under the map in the fuel modes: the chosen station, or the nearest ones. */
export function FuelSheet({ kind, stations, selected, here, onSelect, onClose, onUpdated }: {
  kind: FuelKind; stations: FuelStation[] | null; selected: FuelStation | null; here: { lat: number; lng: number } | null;
  onSelect: (s: FuelStation) => void; onClose: () => void; onUpdated: (s: FuelStation) => void;
}) {
  const { actions, sessions } = useSync();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const look = LOOK[kind];
  useEffect(() => setNote(null), [selected?.id]);

  const nearest = useMemo(() => {
    if (!stations) return [];
    const from = here ?? { lat: 41.3111, lng: 69.2797 };
    return stations.map(s => ({ s, d: km(from, s) })).sort((a, b) => a.d - b.d).slice(0, 4);
  }, [stations, here]);

  const report = async (status: 'yes' | 'no' | 'queue') => {
    if (!selected || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const s = await actions.fuelReport(selected.id, { fuel: kind, status });
      onUpdated(s);
      setNote({ ok: true, text: 'Спасибо! Отметку увидят другие водители' });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (stations === null) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">Загружаем заправки…</p>;
  }

  if (selected) {
    const d = here ? km(here, selected) : null;
    const now = selected.now;
    return (
      <div className="px-3 pg-reveal">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: look.soft, color: look.ink }}>
            {kind === 'gas' ? <Flame size={20} /> : <Fuel size={20} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-extrabold text-slate-900 leading-tight">{title(selected, kind)}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{[selected.brand && selected.brand !== selected.name ? selected.brand : null, selected.address, d !== null ? fmtKm(d) : null].filter(Boolean).join(' · ') || 'Адрес уточняется'}</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="w-9 h-9 rounded-xl bg-slate-100 grid place-items-center text-slate-600 shrink-0"><X size={17} /></button>
        </div>

        <div className="mt-2.5 flex gap-1.5 flex-wrap">
          {chips(selected).map(c => <span key={c} className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">{c}</span>)}
          {selected.hours && <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"><Clock size={11} />{selected.hours}</span>}
        </div>

        <div className="mt-2.5 rounded-2xl border border-slate-100 px-3.5 py-2.5 flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: now ? NOW_COLOR[now.status] : '#CBD5E1' }} />
          <p className="flex-1 text-sm">
            {now ? (
              <><b className="text-slate-900">{NOW_TEXT[kind][now.status]}</b><span className="text-slate-500">{` · по словам водителей, ${ago(now.at)}`}</span></>
            ) : (
              <span className="text-slate-500">{kind === 'gas' ? 'Пока никто не отметил, есть ли газ' : 'Пока никто не отметил, есть ли бензин'}</span>
            )}
          </p>
        </div>

        {sessions.driver && (
          <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label={kind === 'gas' ? 'Есть ли газ' : 'Есть ли бензин'}>
            {(['yes', 'no', 'queue'] as const).map(st => (
              <button key={st} disabled={busy} onClick={() => report(st)}
                className="h-10 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1 bg-slate-50 border border-slate-100 text-slate-700 disabled:opacity-50">
                {st === 'queue' ? <Users size={13} /> : <span className="w-2 h-2 rounded-full" style={{ background: NOW_COLOR[st] }} />}
                {NOW_TEXT[kind][st]}
              </button>
            ))}
          </div>
        )}
        {note && <p className={`mt-1.5 text-xs ${note.ok ? 'text-emerald-700' : 'text-red-600'}`}>{note.text}</p>}

        <a href={`https://yandex.uz/maps/?rtext=~${selected.lat},${selected.lng}&rtt=auto`} target="_blank" rel="noopener noreferrer"
          className="mt-2.5 h-12 rounded-2xl bg-[#111] text-white text-[15px] font-bold flex items-center justify-center gap-2">
          <Navigation size={17} className="text-[#C6F432] fill-[#C6F432]" />Маршрут
        </a>
        <p className="mt-1.5 text-[10px] text-slate-400 text-center">Заправки — © OpenStreetMap. Есть ли топливо — по отметкам водителей за 3 часа.</p>
      </div>
    );
  }

  return (
    <div className="px-3">
      <p className="text-xs font-semibold text-slate-500 mb-1.5">
        {here ? `Ближайшие · ${stations.length} ${plural(stations.length, ['заправка', 'заправки', 'заправок'])} на карте` : `${stations.length} ${plural(stations.length, ['заправка', 'заправки', 'заправок'])} на карте`}
      </p>
      <div className="space-y-1.5">
        {nearest.map(({ s, d }) => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl bg-slate-50 hover:bg-slate-100">
            <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: look.soft, color: look.ink }}>
              {kind === 'gas' ? <Flame size={17} /> : <Fuel size={17} />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-slate-900 truncate">{title(s, kind)}</span>
              <span className="block text-xs text-slate-500 truncate">
                {s.now ? <b style={{ color: NOW_COLOR[s.now.status] }}>{`${NOW_TEXT[kind][s.now.status]} · ${ago(s.now.at)}`}</b> : chips(s).join(' · ') || '—'}
              </span>
            </span>
            {here && <span className="text-xs font-semibold text-slate-700 shrink-0">{fmtKm(d)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

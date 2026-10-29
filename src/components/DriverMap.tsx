import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, SlidersHorizontal, Navigation, X, Wallet, List, Map as MapIcon, Clock, Info, Percent } from 'lucide-react';
import type { Station } from '../data/mockData';
import type { Promo } from '../lib/api';
import { useLiveStations } from '../lib/live';
import { useSync } from '../lib/sync';
import { locate as askLocation, samePort, openNow, km, fmtKm } from '../lib/geo';
import { plural } from '../lib/analytics';
import { MAP_TILES, MAP_ATTRIBUTION, MAP_TILE_CLASS } from '../lib/mapTiles';
import { promoNow, isNight, networkLook, discounted, useDriverPromos } from '../lib/promos';
import { NetworkBadge } from './driver/NetworkBadge';

const statusColor: Record<string, string> = {
  available: '#16A34A',
  occupied: '#EF4444',
  unavailable: '#94A3B8',
  reserved: '#F59E0B',
};
const statusLabel: Record<string, string> = {
  available: 'Свободно',
  occupied: 'Занято',
  unavailable: 'Недоступно',
  reserved: 'Забронировано',
};

const CONNECTORS = [
  { id: 'all', label: 'Все' },
  { id: 'CCS2', label: 'CCS2' },
  { id: 'Type2', label: 'Type 2' },
  { id: 'GB/T DC', label: 'GB/T' },
  { id: 'CHAdeMO', label: 'CHAdeMO' },
];
const POWER = [
  { id: 'all', label: 'Все', sub: '', test: () => true },
  { id: 'ac', label: 'AC ≤22кВт', sub: 'Медленная', test: (kw: number) => kw <= 22 },
  { id: 'dc', label: 'DC 50кВт+', sub: 'Быстрая', test: (kw: number) => kw >= 50 },
  { id: 'hpc', label: 'DC 150кВт+', sub: 'Сверхбыстрая', test: (kw: number) => kw >= 150 },
];

const TASHKENT: [number, number] = [41.3111, 69.2797];
/** From this zoom on, each pin carries its network and free count. */
const LABEL_ZOOM = 12;

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const BOLT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M13.2 2 5 13.4h5.6L9.4 22l8.6-11.6h-5.7z"/></svg>';
const PCT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="#22D3EE"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';

/**
 * A station pin: a round badge (bolt, or % when the network runs a promo
 * here) and, close up, a dark tag with the network, free/total and a moon
 * for a night discount.
 */
function stationIcon(s: Station, promo: Promo | null, labelled: boolean) {
  const free = freeOf(s);
  const look = networkLook(s.operator);
  const off = s.status === 'unavailable';
  const fill = promo ? 'linear-gradient(135deg,#FFC83D,#FF9F0A)' : off ? '#94A3B8' : free > 0 ? '#16A34A' : '#EF4444';
  const tag = labelled
    ? `<div class="pg-tag"><span class="pg-tag-logo" style="background:${look.color}">${look.initials}</span><span class="pg-tag-name">${esc(s.operator)}</span><span class="pg-tag-sep">·</span><span>${s.connectors.length}/<b style="color:${free ? '#4ADE80' : '#F87171'}">${free}</b></span>${promo && isNight(promo) ? `<span class="pg-tag-sep">·</span>${MOON}` : ''}</div>`
    : '';
  const html = `<div class="pg-pin${promo ? ' pg-pin-promo' : ''}">${tag}<div class="pg-dot" style="background:${fill};color:${promo ? '#111' : '#fff'}">${promo ? PCT : BOLT}</div></div>`;
  return L.divIcon({ html, className: 'pg-pin-wrap', iconSize: [0, 0], iconAnchor: [0, 0] });
}

function clusterIcon(count: number, free: number, promo: boolean) {
  const size = count >= 10 ? 54 : 48;
  const html = `<div class="pg-cluster" style="width:${size}px;height:${size}px">
    <div class="pg-cluster-in">${count}<span>${free} своб.</span></div>${promo ? '<i class="pg-cluster-pct">%</i>' : ''}
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const freeOf = (s: Station) => s.connectors.filter(c => c.status === 'available').length;
const opId = (s: Station) => (s as Station & { operatorId?: string }).operatorId;

/**
 * Groups stations that would overlap on screen at the current zoom into one
 * bubble; tapping a bubble zooms in until they separate. Small enough that a
 * clustering library is not worth the dependency.
 */
function ClusteredMarkers({ stations, promos, onSelect }: { stations: Station[]; promos: Promo[]; onSelect: (s: Station) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), moveend: () => setZoom(map.getZoom()) });
  const labelled = zoom >= LABEL_ZOOM;

  const groups = useMemo(() => {
    const out: { stations: Station[]; lat: number; lng: number }[] = [];
    // Labelled pins are wider, so they need more room before they separate.
    const radius = labelled ? 58 : 44;
    for (const s of stations) {
      const p = map.project([s.geoLat, s.geoLng], zoom);
      const g = out.find(c => map.project([c.lat, c.lng], zoom).distanceTo(p) < radius);
      if (g) {
        g.stations.push(s);
        g.lat = g.stations.reduce((n, x) => n + x.geoLat, 0) / g.stations.length;
        g.lng = g.stations.reduce((n, x) => n + x.geoLng, 0) / g.stations.length;
      } else out.push({ stations: [s], lat: s.geoLat, lng: s.geoLng });
    }
    return out;
  }, [stations, zoom, map, labelled]);

  return (
    <>
      {groups.map(g => {
        if (g.stations.length === 1) {
          const s = g.stations[0];
          const promo = promoNow({ id: s.id, operatorId: opId(s) }, promos);
          return (
            <Marker
              key={s.id}
              position={[s.geoLat, s.geoLng]}
              icon={stationIcon(s, promo, labelled)}
              title={`${s.name} · ${s.operator} · ${freeOf(s)}/${s.connectors.length} свободно${promo ? ` · ${promo.title}` : ''}`}
              eventHandlers={{ click: () => onSelect(s) }}
            />
          );
        }
        const free = g.stations.reduce((n, s) => n + freeOf(s), 0);
        const promo = g.stations.some(s => promoNow({ id: s.id, operatorId: opId(s) }, promos));
        return (
          <Marker
            key={g.stations.map(s => s.id).join('-')}
            position={[g.lat, g.lng]}
            icon={clusterIcon(g.stations.length, free, promo)}
            title={`${g.stations.length} ${plural(g.stations.length, ['станция', 'станции', 'станций'])}`}
            eventHandlers={{
              click: () => map.fitBounds(L.latLngBounds(g.stations.map(s => [s.geoLat, s.geoLng] as [number, number])), { padding: [60, 60], maxZoom: 15 }),
            }}
          />
        );
      })}
    </>
  );
}

/** Lets the overlay controls move the map. */
function MapBridge({ target }: { target: { lat: number; lng: number; zoom: number; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
  }, [target, map]);
  return null;
}

const chip = (on: boolean, tone: 'dark' | 'green' | 'yellow' = 'dark') =>
  `shrink-0 h-9 px-3.5 rounded-2xl text-[13px] font-semibold border transition-colors inline-flex items-center gap-1.5 ${
    on
      ? tone === 'green' ? 'bg-emerald-600 text-white border-emerald-600' : tone === 'yellow' ? 'bg-[#FFC83D] text-[#111] border-[#FFC83D]' : 'bg-[#111] text-white border-[#111]'
      : 'bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-100'
  }`;

export default function DriverMap({ onSelectStation, onOpenWallet, onSos, hideChrome = false }: { onSelectStation: (s: Station) => void; onOpenWallet?: () => void; onSos?: () => void; hideChrome?: boolean }) {
  const stations = useLiveStations();
  const [status, setStatus] = useState('all');
  const [connector, setConnector] = useState('all');
  const [power, setPower] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [target, setTarget] = useState<{ lat: number; lng: number; zoom: number; n: number } | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState('');
  const [legend, setLegend] = useState(false);

  // The driver's own car, when they have told us: "only stations that fit my car".
  const { sessions, state } = useSync();
  const promos = useDriverPromos();
  const car = sessions.driver?.car ?? null;
  const balance = (sessions.driver && state?.wallets[sessions.driver.id]?.balance) ?? 0;
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [network, setNetwork] = useState('all');
  // Comfort filters and the list over the map (the map always stays underneath).
  const [openOnly, setOpenOnly] = useState(false);
  const [amen, setAmen] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const toggleAmen = (a: string) => setAmen(v => (v.includes(a) ? v.filter(x => x !== a) : [...v, a]));

  // Networks that have stations on the map, biggest first.
  const networks = useMemo(() => {
    const count = new Map<string, { id: string; name: string; n: number }>();
    for (const s of stations) {
      const id = opId(s) ?? s.operator;
      const cur = count.get(id) ?? { id, name: s.operator, n: 0 };
      cur.n++;
      count.set(id, cur);
    }
    return [...count.values()].sort((a, b) => b.n - a.n);
  }, [stations]);

  const powerTest = POWER.find(p => p.id === power)!.test;
  const filtered = stations.filter(s => {
    if (status !== 'all' && s.status !== status) return false;
    if (network !== 'all' && (opId(s) ?? s.operator) !== network) return false;
    const conns = s.connectors.filter(
      c =>
        (connector === 'all' || samePort(c.type, connector)) &&
        powerTest(c.power) &&
        (!onlyMine || !car || samePort(c.type, car.port) || (car.port === 'CCS2' && samePort(c.type, 'Type 2'))) &&
        (!onlyFree || c.status === 'available'),
    );
    if (!conns.length) return false;
    if (openOnly && !openNow(s.hours)) return false;
    if (amen.length && !amen.every(a => (s.amenities ?? []).includes(a))) return false;
    if (onlyPromo && !promoNow({ id: s.id, operatorId: opId(s) }, promos)) return false;
    return true;
  });
  const q = search.trim().toLowerCase();
  const matches = q
    ? filtered.filter(s => [s.name, s.city, s.address, s.operator].some(v => v.toLowerCase().includes(q))).slice(0, 6)
    : [];
  const activeFilters = [status, connector, power].filter(v => v !== 'all').length;
  const quick = onlyFree || onlyMine || openOnly || onlyPromo || amen.length > 0 || network !== 'all';

  const pick = (s: Station) => {
    setSearch('');
    setTarget({ lat: s.geoLat, lng: s.geoLng, zoom: 15, n: Date.now() });
    onSelectStation(s);
  };

  const locate = () => {
    setLocateNote('');
    if (!navigator.geolocation) {
      setTarget({ lat: TASHKENT[0], lng: TASHKENT[1], zoom: 12, n: Date.now() });
      return;
    }
    setLocating(true);
    // Shared with the station card, which then shows distance and drive time.
    void askLocation().then(pos => {
      setLocating(false);
      if (pos) {
        setMe([pos.lat, pos.lng]);
        setTarget({ lat: pos.lat, lng: pos.lng, zoom: 13, n: Date.now() });
      } else {
        setLocateNote('Геолокация недоступна — показываем Ташкент');
        setTarget({ lat: TASHKENT[0], lng: TASHKENT[1], zoom: 12, n: Date.now() });
      }
    });
  };

  const panel = q || listOpen || showFilters;

  return (
    <div className="relative isolate w-full h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
      <MapContainer center={TASHKENT} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILES} className={MAP_TILE_CLASS} />
        <ClusteredMarkers stations={filtered} promos={promos} onSelect={pick} />
        {me && (
          <Marker
            position={me}
            icon={L.divIcon({ html: '<div class="pg-me"></div>', className: '', iconSize: [20, 20], iconAnchor: [10, 10] })}
          />
        )}
        <MapBridge target={target} />
      </MapContainer>

      {!hideChrome && (
        <>
          {/* Top: the balance one glance away, and the map tools */}
          <div className="absolute top-3 left-3 right-3 z-[1000] flex items-start justify-between gap-2 pointer-events-none">
            {onOpenWallet && sessions.driver ? (
              <button onClick={onOpenWallet} aria-label="Кошелёк" className="pointer-events-auto flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-2xl bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)]">
                <span className="w-9 h-9 rounded-xl bg-[#FFC83D] text-[#111] grid place-items-center"><Wallet size={18} /></span>
                <span className="text-left leading-tight">
                  <span className="block text-[11px] text-slate-500">Баланс</span>
                  <span className="block text-[15px] font-bold text-slate-900 tabular-nums">{`${balance.toLocaleString('ru-RU')} сум`}</span>
                </span>
              </button>
            ) : <span />}
            <div className="pointer-events-auto flex flex-col gap-2 items-end">
              <button onClick={() => { setListOpen(v => !v); setShowFilters(false); }} aria-pressed={listOpen} aria-label={listOpen ? 'Показать карту' : 'Станции списком'} className="w-12 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)] grid place-items-center text-slate-800">
                {listOpen ? <MapIcon size={20} /> : <List size={20} />}
              </button>
              <button onClick={() => setLegend(v => !v)} aria-expanded={legend} aria-label="Что значат значки" className="w-12 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)] grid place-items-center text-slate-800">
                <Info size={20} />
              </button>
              {legend && (
                <div className="w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 text-xs text-slate-700" style={{ animation: 'enter-up 0.2s ease both' }}>
                  <p className="flex items-center gap-2"><span className="pg-legend" style={{ background: '#16A34A' }} />Есть свободные</p>
                  <p className="flex items-center gap-2"><span className="pg-legend" style={{ background: '#EF4444' }} />Все заняты</p>
                  <p className="flex items-center gap-2"><span className="pg-legend" style={{ background: '#94A3B8' }} />Не работает</p>
                  <p className="flex items-center gap-2"><span className="pg-legend grid place-items-center text-[#111] font-black text-[10px]" style={{ background: 'linear-gradient(135deg,#FFC83D,#FF9F0A)' }}>%</span>Скидка от сети</p>
                  <p className="flex items-center gap-2 pt-2 border-t border-slate-100"><b className="text-slate-900">4/2</b>всего / свободно</p>
                  <p className="flex items-center gap-2"><span dangerouslySetInnerHTML={{ __html: MOON }} />ночная скидка</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom sheet: search, networks, quick filters. The map stays tappable above it. */}
          <div className="absolute inset-x-0 bottom-0 z-[1000]">
            <div className="relative">
              <div className="absolute -top-[60px] left-3 right-3 flex items-end justify-between pointer-events-none">
                {onSos ? (
                  <button onClick={onSos} aria-label="SOS — нужна помощь" className="pointer-events-auto w-12 h-12 rounded-2xl bg-red-600 text-white font-extrabold text-xs shadow-lg active:scale-95">SOS</button>
                ) : <span />}
                <button onClick={locate} aria-label="Моё местоположение" className="pointer-events-auto w-12 h-12 rounded-2xl bg-white shadow-[0_4px_20px_rgba(15,23,42,0.15)] grid place-items-center">
                  <Navigation size={20} className={`text-[#2563EB] fill-[#2563EB] ${locating ? 'animate-pulse' : ''}`} />
                </button>
              </div>
              {locateNote && (
                <p className="absolute -top-[110px] left-3 right-3 text-xs text-center bg-slate-900/85 text-white rounded-xl px-3 py-2">{locateNote}</p>
              )}

              <div className="bg-white rounded-t-[28px] shadow-[0_-8px_30px_rgba(15,23,42,0.12)] pt-2 pb-3">
                <div className="mx-auto w-10 h-1 rounded-full bg-slate-200 mb-2" aria-hidden="true" />

                {panel && (
                  <div className="px-3 mb-2 max-h-[min(52vh,420px)] overflow-y-auto">
                    {q && (
                      <div role="listbox" aria-label="Найденные станции" className="rounded-2xl border border-slate-100 overflow-hidden">
                        {matches.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-500">Ничего не нашлось{activeFilters || quick ? ' с текущими фильтрами' : ''}</p>
                        ) : (
                          matches.map(s => (
                            <button key={s.id} role="option" aria-selected={false} onClick={() => pick(s)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0">
                              <NetworkBadge name={s.operator} size={32} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                                <span className="block text-xs text-slate-500 truncate">{s.city} · {s.operator}</span>
                              </span>
                              <span className="text-xs font-semibold shrink-0" style={{ color: statusColor[s.status] }}>{freeOf(s)}/{s.connectors.length}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {/* The same stations as a list, nearest first — easier with one hand in the car. */}
                    {listOpen && !q && (
                      <div role="list" aria-label="Станции списком" className="space-y-2">
                        {filtered.length === 0 && <p className="px-1 py-3 text-sm text-slate-500">Нет станций под эти фильтры</p>}
                        {[...filtered]
                          .map(s => ({ s, d: me ? km({ lat: me[0], lng: me[1] }, { lat: s.geoLat, lng: s.geoLng }) : null }))
                          .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : freeOf(b.s) - freeOf(a.s)))
                          .slice(0, 40)
                          .map(({ s, d }) => {
                            const cheapest = Math.min(...s.connectors.map(c => c.price));
                            const promo = promoNow({ id: s.id, operatorId: opId(s) }, promos);
                            return (
                              <button key={s.id} role="listitem" onClick={() => { setListOpen(false); pick(s); }} className="w-full flex items-center gap-3 p-3 text-left rounded-2xl bg-slate-50 hover:bg-slate-100">
                                <NetworkBadge name={s.operator} size={38} promo={!!promo} />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-semibold text-slate-900 truncate">{s.name}</span>
                                  <span className="block text-xs text-slate-500 truncate">
                                    {`${s.operator} · `}<b style={{ color: statusColor[s.status] }}>{`${freeOf(s)}/${s.connectors.length}`}</b>{' свободно · от '}
                                    {promo && <s className="text-slate-400 mr-1">{cheapest.toLocaleString('ru-RU')}</s>}
                                    {`${discounted(cheapest, promo).toLocaleString('ru-RU')} сум`}
                                  </span>
                                  {!openNow(s.hours) && <span className="text-[11px] text-red-600 inline-flex items-center gap-1"><Clock size={10} />{`Закрыто · ${s.hours}`}</span>}
                                </span>
                                {d !== null && <span className="text-xs font-semibold text-slate-700 shrink-0">{fmtKm(d)}</span>}
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {showFilters && !q && !listOpen && (
                      <div className="space-y-3" style={{ animation: 'enter-up 0.2s ease both' }}>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">СТАТУС</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {['all', 'available', 'occupied', 'reserved'].map(f => (
                              <button key={f} onClick={() => setStatus(f)} aria-pressed={status === f} className={chip(status === f)}>
                                {f === 'all' ? 'Все' : statusLabel[f]}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">ТИП РАЗЪЁМА</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {CONNECTORS.map(c => (
                              <button key={c.id} onClick={() => setConnector(c.id)} aria-pressed={connector === c.id} className={chip(connector === c.id)}>
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">МОЩНОСТЬ</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {POWER.map(p => (
                              <button key={p.id} onClick={() => setPower(p.id)} aria-pressed={power === p.id}
                                className={`py-2 rounded-2xl text-center transition-colors ${power === p.id ? 'bg-[#111] text-white' : 'bg-slate-50 hover:bg-slate-100'}`}>
                                <p className={`text-xs font-semibold ${power === p.id ? 'text-white' : 'text-slate-700'}`}>{p.label}</p>
                                {p.sub && <p className={`text-[10px] ${power === p.id ? 'text-white/70' : 'text-slate-400'}`}>{p.sub}</p>}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">УДОБСТВА</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {['Кафе', 'Туалет', 'Wi-Fi', 'Крытая парковка', 'ТЦ'].map(a => (
                              <button key={a} onClick={() => toggleAmen(a)} aria-pressed={amen.includes(a)} className={chip(amen.includes(a), 'yellow')}>{a}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <p className="flex-1 text-xs text-slate-500">Найдено станций: <b className="text-slate-800">{filtered.length}</b></p>
                          <button onClick={() => { setStatus('all'); setConnector('all'); setPower('all'); setOnlyFree(false); setOnlyMine(false); setOnlyPromo(false); setOpenOnly(false); setAmen([]); setNetwork('all'); }} className="px-3 h-10 bg-slate-100 text-slate-600 text-xs font-semibold rounded-2xl hover:bg-slate-200">
                            Сбросить
                          </button>
                          <button onClick={() => setShowFilters(false)} className="px-5 h-10 bg-[#111] text-white text-xs font-semibold rounded-2xl">
                            Готово
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="px-3 flex items-center gap-2">
                  <div className="flex-1 h-12 bg-slate-50 rounded-2xl flex items-center gap-2 px-3.5 border border-slate-100 focus-within:border-slate-300">
                    <Search size={18} className="text-slate-400 shrink-0" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Найти зарядную станцию"
                      aria-label="Поиск станции"
                      className="flex-1 min-w-0 text-[15px] outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} aria-label="Очистить поиск" className="p-1 text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowFilters(!showFilters); setListOpen(false); }}
                    aria-label="Фильтры"
                    aria-expanded={showFilters}
                    className={`relative w-12 h-12 rounded-2xl grid place-items-center border transition-colors ${showFilters ? 'bg-[#111] text-white border-[#111]' : 'bg-slate-50 text-slate-700 border-slate-100'}`}
                  >
                    <SlidersHorizontal size={18} />
                    {activeFilters + amen.length > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#FFC83D] text-[#111] text-[10px] font-bold grid place-items-center border-2 border-white">{activeFilters + amen.length}</span>
                    )}
                  </button>
                </div>

                {/* Networks: every partner on the map, one tap to see only theirs */}
                <div className="mt-2.5 px-3 flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Сети">
                  <button onClick={() => setNetwork('all')} aria-pressed={network === 'all'} className={`shrink-0 h-10 px-4 rounded-2xl text-sm font-semibold border-2 ${network === 'all' ? 'border-[#111] bg-white text-[#111]' : 'border-transparent bg-slate-50 text-slate-700'}`}>Все</button>
                  {networks.map(n => (
                    <button key={n.id} onClick={() => setNetwork(v => (v === n.id ? 'all' : n.id))} aria-pressed={network === n.id} className={`shrink-0 h-10 pl-1.5 pr-3.5 rounded-2xl text-sm font-semibold border-2 inline-flex items-center gap-2 ${network === n.id ? 'border-[#111] bg-white text-[#111]' : 'border-transparent bg-slate-50 text-slate-700'}`}>
                      <NetworkBadge name={n.name} size={28} />
                      <span className="whitespace-nowrap">{n.name}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-2 px-3 flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Быстрые фильтры">
                  <button onClick={() => setOnlyPromo(v => !v)} aria-pressed={onlyPromo} className={chip(onlyPromo, 'yellow')}><Percent size={13} />Скидки</button>
                  <button onClick={() => setOnlyFree(v => !v)} aria-pressed={onlyFree} className={chip(onlyFree, 'green')}>Свободные</button>
                  {car && (
                    <button onClick={() => setOnlyMine(v => !v)} aria-pressed={onlyMine} className={chip(onlyMine)}>{`Для ${car.brand} ${car.model}`}</button>
                  )}
                  <button onClick={() => setOpenOnly(v => !v)} aria-pressed={openOnly} className={chip(openOnly, 'green')}>Открыто сейчас</button>
                  {quick && <span className="shrink-0 self-center text-xs font-semibold text-slate-500 px-1">{`${filtered.length} ${plural(filtered.length, ['станция', 'станции', 'станций'])}`}</span>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

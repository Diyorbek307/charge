import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, Filter, Navigation, X, Zap, Wallet, List, Clock } from 'lucide-react';
import type { Station } from '../data/mockData';
import { useLiveStations } from '../lib/live';
import { useSync } from '../lib/sync';
import { locate as askLocation, samePort, openNow, km, fmtKm } from '../lib/geo';
import { plural } from '../lib/analytics';

const statusColor: Record<string, string> = {
  available: '#22C55E',
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

function stationIcon(color: string, free: number, total: number) {
  const html = `<div style="width:38px;height:38px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:white;font:800 11px Inter,sans-serif;letter-spacing:-.02em">
    ${free > 0 ? `${free}/${total}` : '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:12px solid white;margin-bottom:2px"></div>'}
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -22] });
}

function clusterIcon(count: number, free: number) {
  const size = count >= 10 ? 56 : 50;
  const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(17,17,17,0.18);display:flex;align-items:center;justify-content:center">
    <div style="width:${size - 10}px;height:${size - 10}px;border-radius:50%;background:#111111;border:2.5px solid #FFC83D;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FFC83D;font:800 13px/1 Inter,sans-serif">
      ${count}<span style="font:700 8px/1 Inter,sans-serif;opacity:.85;margin-top:2px">${free} своб.</span>
    </div>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const freeOf = (s: Station) => s.connectors.filter(c => c.status === 'available').length;

/**
 * Groups stations that would overlap on screen at the current zoom into one
 * bubble; tapping a bubble zooms in until they separate. Small enough that a
 * clustering library is not worth the dependency.
 */
function ClusteredMarkers({ stations, onSelect }: { stations: Station[]; onSelect: (s: Station) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), moveend: () => setZoom(map.getZoom()) });

  const groups = useMemo(() => {
    const out: { stations: Station[]; lat: number; lng: number }[] = [];
    const radius = 44;
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
  }, [stations, zoom, map]);

  return (
    <>
      {groups.map(g => {
        if (g.stations.length === 1) {
          const s = g.stations[0];
          const maxKw = Math.max(...s.connectors.map(c => c.power));
          const minPrice = Math.min(...s.connectors.map(c => c.price));
          return (
            <Marker key={s.id} position={[s.geoLat, s.geoLng]} icon={stationIcon(statusColor[s.status], freeOf(s), s.connectors.length)} eventHandlers={{ click: () => onSelect(s) }}>
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 150 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 2px 0', color: '#0F172A' }}>{s.name}</p>
                  <p style={{ fontSize: 12, margin: 0, color: '#64748B' }}>
                    {freeOf(s)}/{s.connectors.length} свободно · до {maxKw} кВт · от {minPrice.toLocaleString('ru-RU')} сум
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        }
        const free = g.stations.reduce((n, s) => n + freeOf(s), 0);
        return (
          <Marker
            key={g.stations.map(s => s.id).join('-')}
            position={[g.lat, g.lng]}
            icon={clusterIcon(g.stations.length, free)}
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

export default function DriverMap({ onSelectStation, onOpenWallet }: { onSelectStation: (s: Station) => void; onOpenWallet?: () => void }) {
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

  // The driver's own car, when they have told us: "only stations that fit my car".
  const { sessions, state } = useSync();
  const car = sessions.driver?.car ?? null;
  const balance = (sessions.driver && state?.wallets[sessions.driver.id]?.balance) ?? 0;
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  // Comfort filters and the list over the map (the map always stays underneath).
  const [openOnly, setOpenOnly] = useState(false);
  const [amen, setAmen] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const toggleAmen = (a: string) => setAmen(v => (v.includes(a) ? v.filter(x => x !== a) : [...v, a]));

  const powerTest = POWER.find(p => p.id === power)!.test;
  const filtered = stations.filter(s => {
    if (status !== 'all' && s.status !== status) return false;
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
    return true;
  });
  const q = search.trim().toLowerCase();
  const matches = q
    ? filtered.filter(s => [s.name, s.city, s.address, s.operator].some(v => v.toLowerCase().includes(q))).slice(0, 6)
    : [];
  const activeFilters = [status, connector, power].filter(v => v !== 'all').length;

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

  return (
    <div className="relative isolate w-full h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
      <MapContainer center={[41.2, 66.6]} zoom={6} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusteredMarkers stations={filtered} onSelect={pick} />
        {me && (
          <Marker
            position={me}
            icon={L.divIcon({ html: '<div style="width:18px;height:18px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] })}
          />
        )}
        <MapBridge target={target} />
      </MapContainer>

      {/* Search and filters */}
      <div className="absolute top-3 left-3 right-3 z-[1000]">
        <div className="bg-white rounded-2xl shadow-lg flex items-center gap-2 px-3 py-2.5 border border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Станция, город или адрес..."
            aria-label="Поиск станции"
            className="flex-1 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Очистить поиск" className="p-1 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Фильтры"
            aria-expanded={showFilters}
            className={`relative p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            <Filter size={14} />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-bold flex items-center justify-center border border-white">{activeFilters}</span>
            )}
          </button>
        </div>

        {!q && !showFilters && (
          <div className="mt-2 flex gap-1.5 items-start">
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Быстрые фильтры">
            <button onClick={() => setListOpen(v => !v)} aria-pressed={listOpen} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm border inline-flex items-center gap-1 ${listOpen ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-slate-700 border-slate-100'}`}>
              <List size={12} />{listOpen ? 'Карта' : 'Список'}
            </button>
            <button onClick={() => setOnlyFree(v => !v)} aria-pressed={onlyFree} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm border ${onlyFree ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-700 border-slate-100'}`}>
              Свободные
            </button>
            {car && (
              <button onClick={() => setOnlyMine(v => !v)} aria-pressed={onlyMine} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm border ${onlyMine ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-700 border-slate-100'}`}>
                {`Для ${car.brand} ${car.model}`}
              </button>
            )}
            <button onClick={() => setOpenOnly(v => !v)} aria-pressed={openOnly} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm border ${openOnly ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-700 border-slate-100'}`}>
              Открыто сейчас
            </button>
            {['Кафе', 'Туалет', 'Wi-Fi', 'Крытая парковка', 'ТЦ'].map(a => (
              <button key={a} onClick={() => toggleAmen(a)} aria-pressed={amen.includes(a)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm border ${amen.includes(a) ? 'bg-[#FFC83D] text-[#111] border-[#FFC83D]' : 'bg-white text-slate-700 border-slate-100'}`}>
                {a}
              </button>
            ))}
            {(onlyFree || onlyMine || openOnly || amen.length > 0) && <span className="shrink-0 self-center text-[11px] font-semibold text-slate-600 bg-white/90 rounded-full px-2 py-1 shadow-sm">{`${filtered.length} ${plural(filtered.length, ['станция', 'станции', 'станций'])}`}</span>}
          </div>
            {/* The wallet is always one glance away, as in every charging app drivers know. */}
            {onOpenWallet && sessions.driver && (
              <button onClick={onOpenWallet} aria-label="Кошелёк" className="ml-auto shrink-0 flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full bg-white border border-slate-100 shadow-sm">
                <span className="w-6 h-6 rounded-full bg-[#FFC83D] text-[#111] grid place-items-center"><Wallet size={12} /></span>
                <span className="text-left leading-tight">
                  <span className="block text-[10px] text-slate-500">Баланс</span>
                  <span className="block text-xs font-bold text-slate-900 tabular-nums">{`${balance.toLocaleString('ru-RU')} сум`}</span>
                </span>
              </button>
            )}
          </div>
        )}

        {/* The same stations as a list, nearest first — easier with one hand in the car. */}
        {listOpen && !q && (
          <div className="mt-2 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-y-auto max-h-[calc(100vh-260px)]" role="list" aria-label="Станции списком">
            {filtered.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Нет станций под эти фильтры</p>}
            {[...filtered]
              .map(s => ({ s, d: me ? km({ lat: me[0], lng: me[1] }, { lat: s.geoLat, lng: s.geoLng }) : null }))
              .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : b.s.connectors.filter(c => c.status === 'available').length - a.s.connectors.filter(c => c.status === 'available').length))
              .slice(0, 40)
              .map(({ s, d }) => {
                const free = s.connectors.filter(c => c.status === 'available').length;
                const cheapest = Math.min(...s.connectors.map(c => c.price));
                return (
                  <button key={s.id} role="listitem" onClick={() => { setListOpen(false); pick(s); }} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: statusColor[s.status] }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                      <span className="block text-xs text-slate-500 truncate">{`${s.operator} · ${free}/${s.connectors.length} свободно · от ${cheapest.toLocaleString('ru-RU')} сум`}</span>
                      {!openNow(s.hours) && <span className="text-[11px] text-red-600 inline-flex items-center gap-1"><Clock size={10} />{`Закрыто · ${s.hours}`}</span>}
                    </span>
                    {d !== null && <span className="text-xs font-semibold text-slate-700 shrink-0">{fmtKm(d)}</span>}
                  </button>
                );
              })}
          </div>
        )}

        {q && (
          <div className="mt-2 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden" role="listbox" aria-label="Найденные станции">
            {matches.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">Ничего не нашлось{activeFilters ? ' с текущими фильтрами' : ''}</p>
            ) : (
              matches.map(s => (
                <button key={s.id} role="option" aria-selected={false} onClick={() => pick(s)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: statusColor[s.status] }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{s.city} · {s.operator}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500 shrink-0">{freeOf(s)}/{s.connectors.length}</span>
                </button>
              ))
            )}
          </div>
        )}

        {showFilters && !q && (
          <div className="mt-2 bg-white rounded-2xl shadow-lg p-3 border border-slate-100 space-y-3" style={{ animation: 'enter-up 0.2s ease both' }}>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">СТАТУС</p>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'available', 'occupied', 'reserved'].map(f => (
                  <button key={f} onClick={() => setStatus(f)} aria-pressed={status === f}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${status === f ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {f === 'all' ? 'Все' : statusLabel[f]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">ТИП РАЗЪЁМА</p>
              <div className="flex gap-1.5 flex-wrap">
                {CONNECTORS.map(c => (
                  <button key={c.id} onClick={() => setConnector(c.id)} aria-pressed={connector === c.id}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${connector === c.id ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-sky-50 hover:text-sky-600'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">МОЩНОСТЬ</p>
              <div className="grid grid-cols-4 gap-1.5">
                {POWER.map(p => (
                  <button key={p.id} onClick={() => setPower(p.id)} aria-pressed={power === p.id}
                    className={`py-1.5 rounded-xl text-center transition-colors ${power === p.id ? 'bg-sky-500 text-white' : 'bg-slate-100 hover:bg-sky-50'}`}>
                    <p className={`text-[11px] font-semibold ${power === p.id ? 'text-white' : 'text-slate-700'}`}>{p.label}</p>
                    {p.sub && <p className={`text-[10px] ${power === p.id ? 'text-white/80' : 'text-slate-400'}`}>{p.sub}</p>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <p className="flex-1 text-xs text-slate-500">Найдено станций: <b className="text-slate-800">{filtered.length}</b></p>
              <button onClick={() => { setStatus('all'); setConnector('all'); setPower('all'); setOnlyFree(false); setOnlyMine(false); }} className="px-3 py-2 bg-slate-100 text-slate-500 text-xs font-medium rounded-xl hover:bg-slate-200 transition-colors">
                Сбросить
              </button>
              <button onClick={() => setShowFilters(false)} className="px-4 py-2 bg-sky-500 text-white text-xs font-semibold rounded-xl hover:bg-sky-600 transition-colors">
                Готово
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-20 right-3 bg-white/90 backdrop-blur rounded-xl shadow-sm border border-slate-100 p-2 space-y-1 z-[1000]">
        {Object.entries(statusColor).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v }} />
            <span className="text-xs text-slate-600">{statusLabel[k]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
          <Zap size={10} className="text-slate-400" />
          <span className="text-[10px] text-slate-500">свободно / всего</span>
        </div>
      </div>

      {/* My location */}
      <button
        onClick={locate}
        aria-label="Моё местоположение"
        className="absolute bottom-20 left-3 bg-white rounded-xl shadow-md p-2.5 border border-slate-100 z-[1000]"
      >
        <Navigation size={18} className={`text-sky-500 ${locating ? 'animate-pulse' : ''}`} />
      </button>
      {locateNote && (
        <p className="absolute bottom-[132px] left-3 right-3 z-[1000] text-xs text-center bg-slate-900/85 text-white rounded-xl px-3 py-2">{locateNote}</p>
      )}
    </div>
  );
}

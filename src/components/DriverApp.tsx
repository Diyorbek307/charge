import { useState, useEffect, useRef, type ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  MapPin, Navigation, Search, Filter, Zap, Clock, Star, ChevronRight, Home,
  X, Battery, BatteryCharging, Scan, History,
  User, Car, ArrowLeft, CheckCircle,
  Heart, Route, Bell, Settings, Lock, LogOut, ChevronDown, Plus,
  Wifi, Coffee, ParkingCircle, Toilet, CalendarCheck, Minus,
  AlertTriangle, Send, ThumbsUp, Flag, Trash2, StarIcon, Download, Phone,
  Gift, Trophy, Share2, Copy, TrendingUp, Award, Sparkles, Wallet, ArrowDownCircle,
  Smartphone, Monitor
} from 'lucide-react';
import { Station } from '../data/mockData';
import { useLiveStations, useLiveDriverSessions } from '../lib/live';
import { useSync } from '../lib/sync';
import AuthFlow from './AuthFlow';

type Screen = 'map' | 'station' | 'charging-start' | 'charging-active' | 'charging-done' | 'history' | 'profile' | 'trip' | 'booking' | 'booking-done' | 'add-car' | 'notifications' | 'reviews' | 'report' | 'favorites' | 'qr-scan' | 'onboarding' | 'cards' | 'loyalty' | 'referral' | 'app-settings' | 'wallet' | 'security' | 'support';
type Tab = 'map' | 'trips' | 'charging' | 'history' | 'profile';

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

function createStationIcon(color: string) {
  const html = `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:12px solid white;margin-bottom:2px;"></div>
  </div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

function UzbekistanMap({ onSelectStation }: { onSelectStation: (s: Station) => void }) {
  const stations = useLiveStations();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    // Fix Leaflet default icon paths broken by bundlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  const filtered = stations.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.city.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="relative w-full h-full" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Leaflet map */}
      <MapContainer
        center={[41.2, 68.0]}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filtered.map(station => (
          <Marker
            key={station.id}
            position={[station.geoLat, station.geoLng]}
            icon={createStationIcon(statusColor[station.status])}
            eventHandlers={{ click: () => onSelectStation(station) }}
          >
            <Popup>
              <div style={{ fontFamily: 'DM Sans, sans-serif', minWidth: 140 }}>
                <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px 0', color: '#0F172A' }}>{station.name}</p>
                <p style={{ fontSize: 12, margin: 0, color: '#64748B' }}>{station.connectors[0].power} кВт · {station.connectors[0].price.toLocaleString()} сум</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Top search bar — overlaid */}
      <div className="absolute top-3 left-3 right-3 z-[1000]">
        <div className="bg-white rounded-2xl shadow-lg flex items-center gap-2 px-3 py-2.5 border border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Станция или адрес..."
            className="flex-1 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            <Filter size={14} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-2 bg-white rounded-2xl shadow-lg p-3 border border-slate-100 space-y-3" style={{ animation: 'enter-up 0.2s ease both' }}>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">СТАТУС</p>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'available', 'occupied', 'reserved'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filter === f ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {f === 'all' ? 'Все' : statusLabel[f]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">ТИП РАЗЪЁМА</p>
              <div className="flex gap-1.5 flex-wrap">
                {['Все', 'CCS2', 'Type 2', 'CHAdeMO', 'GB/T'].map(c => (
                  <button key={c}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors">
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">МОЩНОСТЬ</p>
              <div className="flex gap-1.5">
                {[{ label: 'Все', sub: '' }, { label: 'AC ≤22кВт', sub: 'Медленная' }, { label: 'DC 50кВт', sub: 'Быстрая' }, { label: 'DC 150кВт+', sub: 'Сверхбыстрая' }].map(p => (
                  <button key={p.label}
                    className="flex-1 py-1.5 rounded-xl text-center bg-slate-100 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                    <p className="text-xs font-semibold text-slate-700">{p.label}</p>
                    {p.sub && <p className="text-[10px] text-slate-400">{p.sub}</p>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowFilters(false)} className="flex-1 py-2 bg-sky-500 text-white text-xs font-semibold rounded-xl hover:bg-sky-600 transition-colors">
                Применить
              </button>
              <button onClick={() => { setFilter('all'); setShowFilters(false); }} className="px-4 py-2 bg-slate-100 text-slate-500 text-xs font-medium rounded-xl hover:bg-slate-200 transition-colors">
                Сброс
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
      </div>

      {/* My location button */}
      <button className="absolute bottom-20 left-3 bg-white rounded-xl shadow-md p-2.5 border border-slate-100 z-[1000]">
        <Navigation size={18} className="text-sky-500" />
      </button>
    </div>
  );
}

function StationDetailSheet({ station, onClose, onStartCharging, onBook, onReviews, onReport }: { station: Station; onClose: () => void; onStartCharging: () => void; onBook: () => void; onReviews: () => void; onReport: () => void }) {
  const free = station.connectors.filter(c => c.status === 'available').length;

  const amenityIcon: Record<string, ReactNode> = {
    'Wi-Fi': <Wifi size={12} />, 'Кафе': <Coffee size={12} />, 'Парковка': <ParkingCircle size={12} />, 'Туалет': <Toilet size={12} />,
    'ТЦ': <Home size={12} />,
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 bg-white rounded-t-3xl shadow-2xl max-h-[75%] overflow-y-auto">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor[station.status] }} />
              <span className="text-xs font-medium" style={{ color: statusColor[station.status] }}>{statusLabel[station.status]}</span>
              <span className="text-xs text-slate-400">· {station.distance} км</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{station.name}</h2>
            <p className="text-sm text-slate-500">{station.operator}</p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{station.address}, {station.city}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100">
            <X size={16} className="text-slate-600" />
          </button>
        </div>

        {/* Photo */}
        <div className="rounded-2xl overflow-hidden mb-3 h-32 bg-slate-100">
          <img src={station.image} alt={station.name} className="w-full h-full object-cover" />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-xs text-slate-400">Мощность</p>
            <p className="text-sm font-bold text-slate-800">{station.totalPower}<span className="text-xs font-normal"> кВт</span></p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-xs text-slate-400">Свободно</p>
            <p className="text-sm font-bold text-slate-800">{free}<span className="text-xs font-normal">/{station.connectors.length}</span></p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-xs text-slate-400">Рейтинг</p>
            <p className="text-sm font-bold text-slate-800">⭐ {station.rating}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-xs text-slate-400">Часы</p>
            <p className="text-xs font-bold text-slate-800">{station.hours}</p>
          </div>
        </div>

        {/* Connectors */}
        <p className="text-xs font-semibold text-slate-500 mb-2">РАЗЪЕМЫ</p>
        <div className="space-y-2 mb-4">
          {station.connectors.map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-xl border border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Zap size={14} className="text-sky-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.type}</p>
                  <p className="text-xs text-slate-400">{c.power} кВт</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800 mono">{c.price.toLocaleString()} сум/кВт·ч</p>
                <div className="flex items-center gap-1 justify-end mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[c.status] }} />
                  <span className="text-xs" style={{ color: statusColor[c.status] }}>{statusLabel[c.status]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Amenities */}
        {station.amenities.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {station.amenities.map(a => (
              <span key={a} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-600">
                {amenityIcon[a] || null}{a}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={onStartCharging}
            className="bg-sky-500 hover:bg-sky-600 text-white rounded-xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <Scan size={16} />Начать зарядку
          </button>
          <button onClick={onBook}
            className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <CalendarCheck size={16} />Забронировать
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2 font-medium text-sm transition-colors flex items-center justify-center gap-1.5">
            <Heart size={13} />Избранное
          </button>
          <button onClick={onReviews} className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2 font-medium text-sm transition-colors flex items-center justify-center gap-1.5">
            <Star size={13} />Отзывы
          </button>
          <button onClick={onReport} className="bg-red-50 hover:bg-red-100 text-red-500 rounded-xl py-2 font-medium text-sm transition-colors flex items-center justify-center gap-1.5">
            <AlertTriangle size={13} />Проблема
          </button>
        </div>
      </div>
    </div>
  );
}

function ChargingStartScreen({ station, onBack, onConfirm, onOpenQR }: { station: Station | null; onBack: () => void; onConfirm: () => void; onOpenQR?: () => void }) {
  const [launchMode, setLaunchMode] = useState<'qr' | 'remote'>('qr');
  const [selectedConnector, setSelectedConnector] = useState(station?.connectors.find(c => c.status === 'available') || station?.connectors[0] || null);
  const [targetPct, setTargetPct] = useState(80);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const currentBattery = 34;
  const kwNeeded = selectedConnector ? ((targetPct - currentBattery) / 100) * 85 : 0;
  const estCost = selectedConnector ? Math.round(kwNeeded * selectedConnector.price) : 0;
  const estMinutes = selectedConnector ? Math.round((kwNeeded / selectedConnector.power) * 60) : 0;

  const doScan = () => {
    setScanning(true);
    setTimeout(() => { setScanning(false); setScanned(true); }, 1800);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Начало зарядки</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Launch mode */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-2">СПОСОБ ЗАПУСКА</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { mode: 'qr' as const, icon: <Scan size={20} />, label: 'QR-код' },
              { mode: 'remote' as const, icon: <Zap size={20} />, label: 'Удалённо' },
            ].map(m => (
              <button key={m.mode}
                onClick={() => {
                  if (m.mode === 'qr' && onOpenQR) { onOpenQR(); return; }
                  setLaunchMode(m.mode); setScanned(false);
                }}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${launchMode === m.mode ? 'border-sky-500 bg-sky-50 text-sky-600' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                {m.icon}
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* QR scanner */}
        {launchMode === 'qr' && (
          <div onClick={!scanned ? doScan : undefined}
            className={`rounded-2xl overflow-hidden relative cursor-pointer ${scanned ? 'bg-green-500' : 'bg-slate-900'}`}
            style={{ aspectRatio: '4/3' }}>
            {!scanned ? (
              <>
                <div className="absolute inset-5 border-2 border-sky-400/60 rounded-xl" />
                <div className="absolute top-5 left-5 w-5 h-5 border-t-2 border-l-2 border-sky-400" />
                <div className="absolute top-5 right-5 w-5 h-5 border-t-2 border-r-2 border-sky-400" />
                <div className="absolute bottom-12 left-5 w-5 h-5 border-b-2 border-l-2 border-sky-400" />
                <div className="absolute bottom-12 right-5 w-5 h-5 border-b-2 border-r-2 border-sky-400" />
                {scanning ? (
                  <div className="absolute inset-5 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-sky-400 animate-bounce" />
                  </div>
                ) : (
                  <div className="absolute inset-5 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-sky-400/50 animate-pulse" />
                  </div>
                )}
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <p className="text-white/60 text-xs">{scanning ? 'Сканирование...' : 'Нажмите для сканирования QR'}</p>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <CheckCircle size={40} className="text-white" />
                <p className="text-white font-bold">EVSE-1 найден</p>
                <p className="text-green-100 text-xs">{selectedConnector?.type} · {selectedConnector?.power} кВт</p>
              </div>
            )}
          </div>
        )}

        {/* Connector select */}
        {(launchMode === 'remote' || scanned) && station && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2">ВЫБОР РАЗЪЁМА</p>
            <div className="space-y-2">
              {station.connectors.map(c => (
                <button key={c.id} onClick={() => c.status === 'available' && setSelectedConnector(c)}
                  disabled={c.status !== 'available'}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selectedConnector?.id === c.id ? 'border-sky-500 bg-sky-50' : c.status !== 'available' ? 'border-slate-100 opacity-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'available' ? 'bg-green-500' : c.status === 'occupied' ? 'bg-red-500' : 'bg-slate-400'}`} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-slate-800">{c.type}</p>
                    <p className="text-xs text-slate-400">{c.id} · {c.power} кВт</p>
                  </div>
                  <p className="text-sm font-bold mono text-slate-700">{c.price.toLocaleString()} сум/кВт·ч</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Target charge */}
        {(launchMode === 'remote' || scanned) && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500">ЗАРЯДИТЬ ДО</p>
              <span className={`text-sm font-bold mono ${targetPct >= 80 ? 'text-green-600' : 'text-sky-600'}`}>{targetPct}%</span>
            </div>
            <input type="range" min={currentBattery + 5} max={100} step={5} value={targetPct}
              onChange={e => setTargetPct(Number(e.target.value))}
              className="w-full accent-sky-500 mb-3" />
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Нужно кВт·ч', value: kwNeeded.toFixed(1) },
                { label: 'Стоимость', value: `~${(estCost / 1000).toFixed(0)}k сум` },
                { label: 'Время', value: `~${estMinutes} мин` },
              ].map(s => (
                <div key={s.label} className="bg-sky-50 rounded-xl py-2 px-1">
                  <p className="text-sm font-bold mono text-sky-700">{s.value}</p>
                  <p className="text-xs text-sky-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-2">ОПЛАТА</p>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-8 h-5 bg-gradient-to-r from-orange-400 to-orange-600 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">H</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Humo •••• 4521</p>
              <p className="text-xs text-slate-400">Основная карта</p>
            </div>
            <ChevronDown size={16} className="text-slate-400" />
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 pt-2">
        <button onClick={onConfirm}
          disabled={launchMode === 'qr' && !scanned}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${launchMode === 'qr' && !scanned ? 'bg-slate-200 text-slate-400' : 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm'}`}>
          <Zap size={18} />Подтвердить и начать зарядку
        </button>
      </div>
    </div>
  );
}

function ChargingActiveScreen({ station, onStop }: { station: Station | null; onStop: () => void }) {
  const [progress, setProgress] = useState(42);
  const [energy, setEnergy] = useState(16.8);
  const [cost, setCost] = useState(33600);
  const [elapsed, setElapsed] = useState(14 * 60); // seconds
  const [power, setPower] = useState(148.2);
  const [notified80, setNotified80] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const target = 80;
  const pctRemain = Math.max(0, target - progress);
  const kwhRemain = (pctRemain / 100) * 85;
  const etaSecs = power > 0 ? Math.round((kwhRemain / power) * 3600) : 0;

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        const next = Math.min(p + 0.15, target);
        if (next >= target && !notified80) {
          setNotified80(true);
          setShowBanner(true);
          setTimeout(() => setShowBanner(false), 4000);
        }
        return next;
      });
      setEnergy(e => parseFloat((e + 0.08).toFixed(2)));
      setCost(c => c + 160);
      setElapsed(s => s + 2);
      setPower(p => parseFloat((148 + Math.random() * 6 - 3).toFixed(1)));
    }, 2000);
    return () => clearInterval(interval);
  }, [notified80]);

  const R_OUTER = 88;
  const R_MID = 74;
  const R_PROG = 60;
  const C_OUTER = 2 * Math.PI * R_OUTER;
  const C_MID = 2 * Math.PI * R_MID;
  const C_PROG = 2 * Math.PI * R_PROG;

  return (
    <div className="h-full flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(170deg, #050d1e 0%, #071428 35%, #050e1c 70%, #030a14 100%)' }}>

      {/* Deep space ambient */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-64 opacity-40" style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(52,211,153,0.18) 0%, transparent 60%)' }} />
        <div className="absolute bottom-0 left-0 right-0 h-48 opacity-30" style={{ background: 'radial-gradient(ellipse at 50% 110%, rgba(14,165,233,0.15) 0%, transparent 60%)' }} />
        {/* Star particles */}
        {[...Array(16)].map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{
              width: (i % 3) + 1, height: (i % 3) + 1,
              left: `${(i * 41 + 7) % 90}%`,
              top: `${(i * 31 + 5) % 80}%`,
              opacity: 0.15 + (i % 5) * 0.07,
              animation: `pulse ${2 + (i % 4)}s ease-in-out ${(i * 0.3) % 2}s infinite`,
            }} />
        ))}
      </div>

      {/* 80% notification banner */}
      {showBanner && (
        <div className="absolute top-14 left-3 right-3 z-30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #059669, #10B981)', border: '1px solid rgba(52,211,153,0.4)', boxShadow: '0 8px 32px rgba(16,185,129,0.4)' }}>
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center text-lg">🎉</div>
          <div>
            <p className="text-sm font-bold text-white">Цель достигнута!</p>
            <p className="text-xs text-emerald-100">Батарея заряжена до {target}%</p>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="relative px-4 pt-4 pb-1 text-white/60 text-xs flex items-center justify-between shrink-0 z-10">
        <span className="font-bold text-white/90 tracking-wider text-[11px]">ONE CHARGE</span>
        <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-full">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" style={{ animationDuration: '1.2s' }} />
          <span className="text-emerald-300 font-semibold text-[10px] tracking-wider">ЗАРЯДКА АКТИВНА</span>
        </div>
      </div>

      {/* Station info */}
      <div className="relative px-4 pb-1 text-center shrink-0 z-10">
        <p className="text-white/75 text-sm font-semibold">{station?.name}</p>
        <p className="text-white/35 text-[11px]">{station?.operator} · CCS2 · EVSE-1</p>
      </div>

      {/* ─── Charging ring visualization ─── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
        <div className="relative mb-3" style={{ width: 220, height: 220 }}>

          {/* Pulsing halos */}
          <div className="absolute inset-0 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.6) 0%, transparent 60%)', animation: 'charge-glow 2.4s ease-in-out infinite' }} />
          <div className="absolute rounded-full border border-emerald-400/20"
            style={{ inset: -10, animation: 'pulse-halo 2.8s ease-out 0s infinite' }} />
          <div className="absolute rounded-full border border-emerald-400/12"
            style={{ inset: -10, animation: 'pulse-halo 2.8s ease-out 0.9s infinite' }} />
          <div className="absolute rounded-full border border-sky-400/10"
            style={{ inset: -10, animation: 'pulse-halo 2.8s ease-out 1.8s infinite' }} />

          {/* SVG rings */}
          <svg viewBox="0 0 200 200" className="w-full h-full absolute inset-0" style={{ overflow: 'visible' }}>
            {/* Outer spinning dashed ring */}
            <g style={{ transformOrigin: '100px 100px', animation: 'spin-cw 12s linear infinite' }}>
              <circle cx="100" cy="100" r={R_OUTER} fill="none"
                stroke="rgba(52,211,153,0.15)" strokeWidth="1.5"
                strokeDasharray="6 8" />
            </g>

            {/* Mid counter-spinning ring */}
            <g style={{ transformOrigin: '100px 100px', animation: 'spin-ccw 8s linear infinite' }}>
              <circle cx="100" cy="100" r={R_MID} fill="none"
                stroke="rgba(56,189,248,0.12)" strokeWidth="1"
                strokeDasharray="3 14" />
            </g>

            {/* Outer ring track */}
            <circle cx="100" cy="100" r={R_PROG} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="9"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }} />

            {/* Target arc ghost */}
            <circle cx="100" cy="100" r={R_PROG} fill="none"
              stroke="rgba(52,211,153,0.1)" strokeWidth="9"
              strokeDasharray={`${C_PROG * target / 100} ${C_PROG}`}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }} />

            {/* Progress arc — main */}
            <circle cx="100" cy="100" r={R_PROG} fill="none"
              stroke="url(#chargeGrad)" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={C_PROG}
              strokeDashoffset={C_PROG * (1 - progress / 100)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', transition: 'stroke-dashoffset 1.8s cubic-bezier(0.34,1,0.64,1)' }} />

            {/* Progress arc glow copy */}
            <circle cx="100" cy="100" r={R_PROG} fill="none"
              stroke="rgba(52,211,153,0.3)" strokeWidth="16" strokeLinecap="round"
              strokeDasharray={C_PROG}
              strokeDashoffset={C_PROG * (1 - progress / 100)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', transition: 'stroke-dashoffset 1.8s cubic-bezier(0.34,1,0.64,1)', filter: 'blur(4px)' }} />

            <defs>
              <linearGradient id="chargeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="50%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#38BDF8" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div style={{ animation: 'energy-bolt 1.8s ease-in-out infinite' }}>
              <BatteryCharging size={20} className="text-emerald-300 mb-1" />
            </div>
            <span className="text-[52px] font-bold text-white mono leading-none tracking-tight"
              style={{ textShadow: '0 0 30px rgba(52,211,153,0.5)' }}>
              {Math.round(progress)}
            </span>
            <span className="text-emerald-400/70 text-sm font-bold">%</span>
          </div>
        </div>

        {/* ETA pill */}
        <div className="mb-4">
          {progress < target ? (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <Clock size={11} className="text-sky-400" />
              <p className="text-white/60 text-xs">до {target}% · ~{Math.ceil(etaSecs / 60)} мин</p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/25 px-3 py-1.5 rounded-full">
              <span className="text-emerald-400 text-xs font-bold">✓ Цель достигнута</span>
            </div>
          )}
        </div>

        {/* Live stats */}
        <div className="grid grid-cols-3 gap-2 w-full">
          {[
            { label: 'кВт·ч', value: energy.toFixed(2), sub: 'получено', color: '#34D399' },
            { label: 'кВт', value: power.toFixed(1), sub: 'мощность', color: '#38BDF8' },
            { label: '', value: fmt(elapsed), sub: 'прошло', color: '#A78BFA' },
          ].map(stat => (
            <div key={stat.sub}
              className="rounded-2xl p-3 text-center border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
              <p className="text-white/40 text-[10px] mb-0.5 tracking-wide">{stat.sub}</p>
              <p className="font-bold text-[15px] mono" style={{ color: stat.color, textShadow: `0 0 12px ${stat.color}60` }}>{stat.value}</p>
              <p className="text-white/25 text-[10px]">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Cost + remaining */}
        <div className="mt-2 grid grid-cols-2 gap-2 w-full">
          <div className="rounded-2xl p-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-white/35 text-[10px] mb-0.5">стоимость</p>
            <p className="text-white font-bold mono text-sm">{cost.toLocaleString()} сум</p>
          </div>
          <div className="rounded-2xl p-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-white/35 text-[10px] mb-0.5">осталось</p>
            <p className="text-white font-bold mono text-sm">{progress < target ? `~${Math.ceil(etaSecs / 60)} мин` : '— готово'}</p>
          </div>
        </div>
      </div>

      {/* Stop button */}
      <div className="relative px-4 pb-6 pt-2 z-10">
        <button onClick={onStop}
          className="w-full text-white rounded-2xl py-4 font-bold text-[15px] transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
          Остановить зарядку
        </button>
      </div>
    </div>
  );
}

function ChargingDoneScreen({ station, onClose, summary }: { station: Station | null; onClose: () => void; summary?: { energy: number; cost: number; minutes: number } | null }) {
  const [rated, setRated] = useState(0);
  const [ratingDone, setRatingDone] = useState(false);
  const [confetti] = useState(() => Array.from({length: 24}, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: ['#38BDF8','#34D399','#F59E0B','#F472B6','#A78BFA','#FB923C'][i % 6],
    size: 6 + (i % 5) * 2,
    delay: (i * 0.08).toFixed(2),
    dur: (1.8 + (i % 4) * 0.3).toFixed(1),
  })));
  // Real numbers from the session that just ended; demo values only as a fallback.
  const kwh = summary?.energy ?? 38.4;
  const minutes = summary?.minutes ?? 43;
  const co2Saved = (kwh * 0.023).toFixed(2);
  const kmAdded = Math.round(kwh / 0.18);
  const cost = 76800;
  const serviceFee = 5000;

  return (
    <div className="h-full flex flex-col bg-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {confetti.map(c => (
          <div key={c.id} style={{
            position: 'absolute',
            left: `${c.x}%`,
            top: '-20px',
            width: c.size,
            height: c.size,
            background: c.color,
            borderRadius: c.id % 3 === 0 ? '50%' : '2px',
            animation: `confetti-fall ${c.dur}s ${c.delay}s ease-in both`,
          }} />
        ))}
      </div>
      {/* Hero */}
      <div className="bg-gradient-to-b from-green-500 to-green-600 px-4 pt-6 pb-8 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute rounded-full bg-white/10 animate-ping"
              style={{ width: `${20 + i * 10}px`, height: `${20 + i * 10}px`, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', animationDelay: `${i * 0.15}s`, animationDuration: '2s' }} />
          ))}
        </div>
        <div className="relative">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={34} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold">Зарядка завершена!</h2>
          <p className="text-green-100 text-sm mt-0.5">{station?.name}</p>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { value: String(kwh), unit: 'кВт·ч', label: 'заряжено' },
              { value: summary ? `${(summary.cost / 1000).toFixed(1)}k` : '80%', unit: summary ? 'сум' : '', label: summary ? 'списано' : 'заряд батареи' },
              { value: String(minutes), unit: 'мин', label: 'время' },
            ].map(s => (
              <div key={s.label} className="bg-white/15 rounded-2xl py-2">
                <p className="text-xl font-bold mono">{s.value}<span className="text-sm font-normal">{s.unit}</span></p>
                <p className="text-green-100 text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Hero */}
        <div className="animate-scale-in bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white text-center relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute -left-2 -bottom-3 w-14 h-14 bg-white/10 rounded-full" />
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={28} className="text-white" />
          </div>
          <h2 className="text-xl font-bold mb-0.5">Отлично!</h2>
          <p className="text-green-100 text-sm">Батарея заряжена с 24% до 80%</p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: 'кВт·ч', value: `${kwh}` },
              { label: 'мин', value: '43' },
              { label: 'км добавлено', value: `+${kmAdded}` },
            ].map(s => (
              <div key={s.label} className="bg-white/15 rounded-xl py-2">
                <p className="text-xl font-bold mono">{s.value}</p>
                <p className="text-xs text-green-100">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Eco badge */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">🌿</div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Вы сэкономили {co2Saved} кг CO₂</p>
            <p className="text-xs text-emerald-600">по сравнению с бензиновым авто на этот пробег</p>
          </div>
        </div>

        {/* Receipt */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">ЭЛЕКТРОННЫЙ ЧЕК</p>
              <p className="text-xs text-slate-400 mono">#CDR-S-1043 · 4 сен 2026</p>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Оплачено</span>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Станция', value: station?.name || 'Toshkent Siti Hub' },
              { label: 'Оператор', value: station?.operator || 'GreenCharge UZ' },
              { label: 'Разъём', value: 'CCS2 · макс 150 кВт' },
              { label: 'Начало', value: '15:22:04' },
              { label: 'Конец', value: '16:05:37' },
              { label: 'Длительность', value: '43 мин 33 сек' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-xs text-slate-400">{row.label}</span>
                <span className="text-xs font-medium text-slate-700">{row.value}</span>
              </div>
            ))}
            <div className="border-t border-dashed border-slate-200 pt-2 mt-1 space-y-1.5">
              {[
                { label: `${kwh} кВт·ч × 2 000 сум`, value: `${(kwh * 2000).toLocaleString()} сум` },
                { label: 'Сервисный сбор', value: `${serviceFee.toLocaleString()} сум` },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-xs">
                  <span className="text-slate-400">{row.label}</span>
                  <span className="text-slate-700 mono">{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center border-t border-slate-100 pt-2 mt-1">
                <span className="text-sm font-bold text-slate-900">Итого</span>
                <span className="text-base font-bold text-sky-600 mono">{cost.toLocaleString()} сум</span>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500">Метод оплаты</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-3 bg-gradient-to-r from-orange-400 to-orange-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold" style={{ fontSize: '6px' }}>H</span>
                </div>
                <span className="font-medium text-slate-700">Humo •••• 4521</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick rating */}
        {!ratingDone ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3 text-center">Оцените эту зарядку</p>
            <div className="flex justify-center gap-2 mb-3">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setRated(s)}
                  className={`text-2xl transition-transform active:scale-90 ${s <= rated ? 'text-amber-400' : 'text-slate-200'}`}>★</button>
              ))}
            </div>
            {rated > 0 && (
              <button onClick={() => setRatingDone(true)}
                className="w-full py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600">
                Отправить оценку
              </button>
            )}
          </div>
        ) : (
          <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 text-center">
            <p className="text-sm font-semibold text-sky-700">Спасибо за оценку! ⭐ {rated}/5</p>
          </div>
        )}
      </div>

      <div className="px-4 pb-6 pt-2 grid grid-cols-2 gap-2">
        <button className="border border-slate-200 text-slate-700 rounded-2xl py-3 font-medium text-sm flex items-center justify-center gap-1.5">
          <Download size={14} />Чек PDF
        </button>
        <button onClick={onClose} className="bg-sky-500 text-white rounded-2xl py-3 font-semibold text-sm">
          Готово
        </button>
        <button className="w-full border border-slate-200 text-slate-500 rounded-2xl py-2.5 text-sm">
          Поделиться маршрутом
        </button>
      </div>
    </div>
  );
}

function ChargingHubScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const stations = useLiveStations();
  const nearbyStations = stations.slice(0, 3);
  const [activeCard, setActiveCard] = useState<'promo' | 'subscription' | null>(null);

  const subscriptionPlans = [
    { name: 'Базовый', price: '49 000', kwh: 50, badge: '', color: 'from-slate-500 to-slate-600' },
    { name: 'Стандарт', price: '89 000', kwh: 100, badge: 'Популярный', color: 'from-sky-500 to-sky-600' },
    { name: 'Премиум', price: '159 000', kwh: 200, badge: '25% выгода', color: 'from-violet-500 to-violet-600' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100">
        <h1 className="text-lg font-bold text-slate-900">Зарядка</h1>
        <p className="text-xs text-slate-500 mt-0.5">BYD Han EV · 34% заряда · ~142 км</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Current battery card */}
        <div className="bg-gradient-to-br from-sky-500 to-sky-700 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full" />
          <div className="absolute -right-2 -bottom-4 w-16 h-16 bg-white/10 rounded-full" />
          <p className="text-xs text-sky-200 mb-2 font-medium">МОЙ АВТОМОБИЛЬ</p>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-4xl font-bold mono">34%</p>
              <p className="text-sky-200 text-sm">~142 км запаса</p>
            </div>
            <div className="text-right">
              <p className="text-sky-200 text-xs">до полного</p>
              <p className="text-xl font-bold mono">~55 мин</p>
              <p className="text-sky-200 text-xs">при 150 кВт</p>
            </div>
          </div>
          {/* Battery bar */}
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full relative" style={{ width: '34%' }}>
              <div className="absolute right-0 top-0 h-full w-1 bg-sky-300 animate-pulse" />
            </div>
          </div>
          <div className="flex justify-between text-xs text-sky-200 mt-1">
            <span>0%</span><span>Цель: 80%</span><span>100%</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => onNavigate('map')}
              className="bg-white text-sky-600 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
              <MapPin size={15} />На карте
            </button>
            <button onClick={() => onNavigate('qr-scan')}
              className="bg-white/20 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 border border-white/30 active:scale-95 transition-all">
              <Scan size={15} />QR-сканер
            </button>
          </div>
        </div>

        {/* Quick charge targets */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">ЗАРЯДИТЬ ДО</p>
          <div className="flex gap-2">
            {[60, 80, 100].map(pct => (
              <button key={pct}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all ${pct === 80 ? 'bg-sky-500 text-white border-sky-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-sky-300'}`}>
                {pct}%
                <p className="text-xs font-normal mt-0.5 opacity-70">
                  {pct === 60 ? '~245 км' : pct === 80 ? '~326 км' : '~407 км'}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-3 p-3 bg-sky-50 rounded-xl flex justify-between items-center text-sm">
            <span className="text-slate-600">Стоимость до 80%</span>
            <span className="font-bold text-sky-700 mono">~92 000 сум</span>
          </div>
        </div>

        {/* Nearby stations */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Ближайшие станции</p>
            <button onClick={() => onNavigate('map')} className="text-xs text-sky-500 font-medium">Все на карте →</button>
          </div>
          <div className="space-y-2">
            {nearbyStations.map((s, i) => {
              const free = s.connectors.filter(c => c.status === 'available').length;
              const dist = [0.8, 1.4, 2.1][i];
              return (
                <div key={s.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${free > 0 ? 'bg-green-500' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.city} · {dist} км · {free}/{s.connectors.length} свободно</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold mono text-slate-800">{s.connectors[0].price.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">сум/кВт·ч</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subscription */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Подписка ONE CHARGE+</p>
            <span className="text-xs text-sky-500 bg-sky-50 px-2 py-0.5 rounded-full">Активна</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Стандарт · Август 2026</p>
                <p className="text-xs text-slate-400">68 / 100 кВт·ч использовано</p>
              </div>
              <span className="text-2xl font-bold mono text-sky-600">68%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: '68%' }} />
            </div>
            <p className="text-xs text-slate-400">Осталось 32 кВт·ч · сбрасывается 1 сентября</p>
          </div>
        </div>

        {/* Subscription plans */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Тарифы подписки</p>
          <div className="grid grid-cols-3 gap-2">
            {subscriptionPlans.map(plan => (
              <div key={plan.name} className={`rounded-2xl p-3 bg-gradient-to-br ${plan.color} text-white relative`}>
                {plan.badge && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-xs bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                <p className="text-xs font-semibold opacity-80 mt-2">{plan.name}</p>
                <p className="text-base font-bold mono mt-0.5">{plan.price}</p>
                <p className="text-xs opacity-70">сум/мес</p>
                <p className="text-xs font-semibold mt-1">{plan.kwh} кВт·ч</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PowerMiniChart({ energy, maxPower }: { energy: number; maxPower: number }) {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const progress = i / 11;
    const base = progress < 0.15 ? progress / 0.15 : progress < 0.75 ? 1 : 1 - (progress - 0.75) / 0.25;
    return Math.max(5, Math.round(base * maxPower + (Math.random() - 0.5) * 8));
  });
  const max = Math.max(...pts);
  const w = 180, h = 44;
  const coords = pts.map((v, i) => `${Math.round((i / 11) * w)},${Math.round(h - (v / max) * (h - 4) - 2)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id={`pg${energy}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill={`url(#pg${energy})`} />
      <polyline points={coords} fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryScreen() {
  const sessions = useLiveDriverSessions();
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats = { sessions: 5, energy: 192.4, cost: 378020, co2: (192.4 * 0.023).toFixed(1), bonus: 192 };

  const monthBars = [
    { m: 'Июн', kwh: 52, cost: 102400 },
    { m: 'Июл', kwh: 78, cost: 153600 },
    { m: 'Авг', kwh: 62, cost: 122020 },
  ];
  const maxKwh = Math.max(...monthBars.map(b => b.kwh));

  const sessionDetails: Record<string, { socStart: number; socEnd: number; maxPower: number; tariff: number; card: string; station: string }> = {};
  sessions.forEach(s => {
    sessionDetails[s.id] = {
      socStart: Math.max(10, Math.round(Math.random() * 30 + 10)),
      socEnd: Math.min(95, Math.round(Math.random() * 20 + 65)),
      maxPower: s.connector === 'CCS2' ? 150 : s.connector === 'CHAdeMO' ? 100 : 22,
      tariff: Math.round(s.cost / s.energy),
      card: Math.random() > 0.5 ? 'Humo •••• 4521' : 'Uzcard •••• 8832',
      station: s.stationName,
    };
  });

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">История зарядок</h1>
            <p className="text-xs text-slate-500 mt-0.5">{stats.sessions} сессий · {stats.energy} кВт·ч · {stats.cost.toLocaleString()} сум</p>
          </div>
          <button className="p-2 bg-slate-100 rounded-xl"><Download size={15} className="text-slate-600" /></button>
        </div>
        <div className="flex gap-1 mt-3">
          {(['week', 'month', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${period === p ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Всё время'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'кВт·ч', value: String(stats.energy), color: 'text-sky-600' },
            { label: 'потрачено', value: `${(stats.cost/1000).toFixed(0)}k`, color: 'text-slate-900' },
            { label: 'кг CO₂ saved', value: String(stats.co2), color: 'text-green-600' },
            { label: 'бонусов', value: `+${stats.bonus}`, color: 'text-amber-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-3 text-center">
              <p className={`text-lg font-bold mono ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">кВт·ч по месяцам</p>
          <div className="flex items-end gap-3 h-16">
            {monthBars.map(b => (
              <div key={b.m} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-slate-500 mono">{b.kwh}</span>
                <div className="w-full bg-sky-500 rounded-t-md" style={{ height: `${(b.kwh / maxKwh) * 52}px` }} />
                <span className="text-xs text-slate-400">{b.m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions */}
        {sessions.map(s => {
          const det = sessionDetails[s.id] || { socStart: 20, socEnd: 80, maxPower: 150, tariff: 2000, card: 'Humo •••• 4521', station: s.stationName };
          const isOpen = expanded === s.id;
          return (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-full p-4 text-left">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{s.stationName}</p>
                    <p className="text-xs text-slate-400">{s.operator} · {s.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900 mono">{s.cost.toLocaleString()} сум</p>
                    <p className="text-xs text-amber-500">+{Math.round(s.energy / 10)} бонусов</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock size={11} />{s.duration}</span>
                  <span className="flex items-center gap-1"><Zap size={11} />{s.energy} кВт·ч</span>
                  <span className="text-xs px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-md">{s.connector}</span>
                  <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
                  {/* SOC progress */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1"><Battery size={11} />Батарея</span>
                      <span className="font-semibold text-slate-700">{det.socStart}% → {det.socEnd}%</span>
                    </div>
                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div className="absolute left-0 top-0 h-full bg-slate-200 rounded-full" style={{ width: `${det.socStart}%` }} />
                      <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-sky-400 to-green-400 rounded-full transition-all" style={{ width: `${det.socEnd}%` }} />
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                        +{det.socEnd - det.socStart}%
                      </div>
                    </div>
                  </div>

                  {/* Power chart */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Мощность зарядки (кВт)</p>
                    <div className="bg-slate-950 rounded-xl p-2 pb-1">
                      <PowerMiniChart energy={s.energy} maxPower={det.maxPower} />
                      <div className="flex justify-between text-[10px] text-slate-600 px-1 mt-0.5">
                        <span>Старт</span>
                        <span className="text-sky-400">макс {det.maxPower} кВт</span>
                        <span>Конец</span>
                      </div>
                    </div>
                  </div>

                  {/* Receipt */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <p className="text-[11px] font-bold text-slate-400 tracking-wider">ЧЕК</p>
                    {[
                      { label: 'Энергия', value: `${s.energy} кВт·ч` },
                      { label: 'Тариф', value: `${det.tariff.toLocaleString()} сум/кВт·ч` },
                      { label: 'Сервисный сбор', value: '5 000 сум' },
                      { label: 'Итого', value: `${s.cost.toLocaleString()} сум`, bold: true },
                      { label: 'Оплата', value: det.card },
                      { label: 'CDR ID', value: s.id, mono: true },
                    ].map(row => (
                      <div key={row.label} className={`flex justify-between text-xs ${row.bold ? 'border-t border-slate-200 pt-2 mt-1' : ''}`}>
                        <span className="text-slate-500">{row.label}</span>
                        <span className={`${row.bold ? 'font-bold text-slate-900' : 'text-slate-700 font-medium'} ${row.mono ? 'font-mono text-[10px]' : ''}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 text-xs py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-medium transition-colors">
                      Повторить маршрут
                    </button>
                    <button className="flex-1 text-xs py-2.5 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 font-medium transition-colors">
                      Скачать чек
                    </button>
                    <button className="text-xs py-2.5 px-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 font-medium transition-colors">
                      Оценить
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppSettingsScreen({ onBack }: { onBack: () => void }) {
  const [language, setLanguage] = useState<'ru' | 'uz' | 'en'>('ru');
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(
    () => (localStorage.getItem('oc-theme') === 'dark' ? 'dark' : localStorage.getItem('oc-theme') === 'auto' ? 'auto' : 'light')
  );

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    localStorage.setItem('oc-theme', theme);
    window.dispatchEvent(new CustomEvent('oc-theme-change', { detail: { dark: isDark } }));
  }, [theme]);
  const [notifCharge, setNotifCharge] = useState(true);
  const [notifPrice, setNotifPrice] = useState(true);
  const [notifNearby, setNotifNearby] = useState(false);
  const [notifPromo, setNotifPromo] = useState(true);
  const [unitKwh, setUnitKwh] = useState(true);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-sky-500' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  const SectionHeader = ({ label }: { label: string }) => (
    <p className="text-xs font-semibold text-slate-400 tracking-widest px-4 pt-5 pb-2">{label}</p>
  );

  const Row = ({ label, right }: { label: string; right: ReactNode }) => (
    <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50 last:border-none">
      <span className="text-sm text-slate-700">{label}</span>
      {right}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Настройки приложения</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SectionHeader label="ИНТЕРФЕЙС" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-50">
            <p className="text-sm text-slate-700 mb-2">Язык</p>
            <div className="flex gap-2">
              {([['ru', 'Русский'], ['uz', "O'zbek"], ['en', 'English']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLanguage(val)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${language === val ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-sm text-slate-700 mb-2">Тема</p>
            <div className="flex gap-2">
              {([['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Авто']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTheme(val)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${theme === val ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionHeader label="УВЕДОМЛЕНИЯ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <Row label="Зарядка завершена" right={<Toggle value={notifCharge} onChange={() => setNotifCharge(v => !v)} />} />
          <Row label="Снижение цен" right={<Toggle value={notifPrice} onChange={() => setNotifPrice(v => !v)} />} />
          <Row label="Новые станции рядом" right={<Toggle value={notifNearby} onChange={() => setNotifNearby(v => !v)} />} />
          <Row label="Акции и бонусы" right={<Toggle value={notifPromo} onChange={() => setNotifPromo(v => !v)} />} />
        </div>

        <SectionHeader label="ДАННЫЕ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Единицы</span>
            <div className="flex gap-2">
              <button
                onClick={() => setUnitKwh(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${unitKwh ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
              >кВт·ч</button>
              <button
                onClick={() => setUnitKwh(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${!unitKwh ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}
              >кВт</button>
            </div>
          </div>
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Валюта</span>
            <span className="text-sm text-slate-400">Сум (UZS)</span>
          </div>
          <button className="px-4 py-3.5 flex items-center justify-between w-full">
            <span className="text-sm text-slate-700">Очистить кэш карт</span>
            <span className="text-xs text-sky-500 font-medium">Очистить</span>
          </button>
        </div>

        <SectionHeader label="О ПРИЛОЖЕНИИ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden mb-6">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Версия</span>
            <span className="text-sm text-slate-400">1.8.3 (209)</span>
          </div>
          {[
            { label: 'Условия использования' },
            { label: 'Политика конфиденциальности' },
            { label: 'Отправить отзыв' },
          ].map(item => (
            <button key={item.label} className="px-4 py-3.5 flex items-center justify-between w-full border-b border-slate-50 last:border-none hover:bg-slate-50 transition-colors">
              <span className="text-sm text-slate-700">{item.label}</span>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WalletScreen({ onBack }: { onBack: () => void }) {
  const [balance] = useState(47500);
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedCard, setSelectedCard] = useState(0);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [autoRecharge, setAutoRecharge] = useState(true);

  const quickAmounts = [10000, 20000, 50000, 100000];
  const cards = [
    { label: 'Humo •••• 4521', color: 'from-orange-400 to-orange-600', letter: 'H' },
    { label: 'Uzcard •••• 8832', color: 'from-blue-400 to-blue-600', letter: 'U' },
  ];

  const transactions = [
    { id: 'W-1042', type: 'topup', amount: 50000, label: 'Пополнение — Humo 4521', date: '07 сент, 14:20' },
    { id: 'W-1041', type: 'charge', amount: -76800, label: 'Зарядка — GreenCharge Toshkent', date: '07 сент, 11:05' },
    { id: 'W-1040', type: 'topup', amount: 100000, label: 'Пополнение — Uzcard 8832', date: '05 сент, 09:30' },
    { id: 'W-1039', type: 'charge', amount: -78280, label: 'Зарядка — EV Hub Samarkand', date: '04 сент, 17:45' },
    { id: 'W-1038', type: 'charge', amount: -97680, label: 'Зарядка — AutoCharge Fergana', date: '03 сент, 12:20' },
    { id: 'W-1037', type: 'topup', amount: 200000, label: 'Пополнение — Humo 4521', date: '01 сент, 08:00' },
    { id: 'W-1036', type: 'charge', amount: -75820, label: 'Зарядка — SolarStation Bukhara', date: '31 авг, 16:10' },
  ];

  const doTopUp = () => {
    const amt = selectedAmount || parseInt(customAmount) || 0;
    if (amt < 5000) return;
    setTopUpSuccess(true);
    setTimeout(() => {
      setShowTopUp(false);
      setTopUpSuccess(false);
      setSelectedAmount(null);
      setCustomAmount('');
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-900">Мой кошелёк</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Balance card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-5 text-white shadow-xl">
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-1">БАЛАНС ONE CHARGE</p>
          <p className="text-3xl font-bold tracking-tight mb-3">{balance.toLocaleString()} сум</p>
          <div className="flex items-center gap-2 mb-4">
            {autoRecharge && (
              <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full font-medium border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                Автопополнение включено
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTopUp(true)}
              className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 rounded-2xl text-sm font-semibold transition-colors active:scale-95">
              Пополнить
            </button>
            <button className="flex-1 py-2.5 bg-slate-700 rounded-2xl text-sm font-semibold text-slate-400 cursor-not-allowed">
              Снять
            </button>
          </div>
        </div>

        {/* Auto-recharge toggle */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
            <Zap size={17} className="text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Автопополнение</p>
            <p className="text-xs text-slate-400 mt-0.5">Пополнять на 50 000 сум при балансе &lt; 10 000 сум</p>
          </div>
          <button
            onClick={() => setAutoRecharge(v => !v)}
            className="relative shrink-0"
            style={{ width: 44, height: 24 }}
          >
            <div
              className="absolute inset-0 rounded-full transition-colors duration-200"
              style={{ background: autoRecharge ? '#22c55e' : '#cbd5e1' }}
            />
            <div
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200"
              style={{ left: autoRecharge ? 20 : 2 }}
            />
          </button>
        </div>

        {/* Transaction history */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">ИСТОРИЯ ОПЕРАЦИЙ</p>
          </div>
          <div className="divide-y divide-slate-50">
            {transactions.map(tx => (
              <div key={tx.id} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.type === 'topup' ? 'bg-green-50' : 'bg-sky-50'}`}>
                  {tx.type === 'topup'
                    ? <ArrowDownCircle size={17} className="text-green-500" />
                    : <Zap size={17} className="text-sky-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{tx.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{tx.date}</p>
                </div>
                <span className={`text-sm font-semibold font-mono shrink-0 ${tx.type === 'topup' ? 'text-green-600' : 'text-red-500'}`}>
                  {tx.type === 'topup' ? '+' : ''}{tx.amount.toLocaleString()} сум
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top-up modal */}
      {showTopUp && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end" onClick={e => { if (e.target === e.currentTarget) setShowTopUp(false); }}>
          <div className="bg-white rounded-t-3xl p-6 space-y-5 w-full" style={{ animation: 'enter-up 0.25s ease both' }}>
            <div className="flex justify-center mb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            {topUpSuccess ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl">✅</div>
                <p className="text-lg font-bold text-slate-900">Пополнено успешно!</p>
                <p className="text-sm text-slate-500">Средства зачислены на кошелёк</p>
              </div>
            ) : (
              <>
                <h2 className="text-base font-bold text-slate-900">Пополнить кошелёк</h2>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map(amt => (
                    <button key={amt}
                      onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                      className={`py-2 rounded-xl text-sm font-semibold transition-colors ${selectedAmount === amt ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                      {(amt / 1000).toFixed(0)}K
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <input
                  type="number"
                  value={customAmount}
                  onChange={e => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                  placeholder="Своя сумма, мин. 5 000 сум"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-400 placeholder:text-slate-300"
                />

                {/* Card selector */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500">КАРТА ДЛЯ ОПЛАТЫ</p>
                  {cards.map((card, idx) => (
                    <button key={card.label} onClick={() => setSelectedCard(idx)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedCard === idx ? 'border-sky-400 bg-sky-50' : 'border-slate-100 bg-white'}`}>
                      <div className={`w-8 h-5 bg-gradient-to-r ${card.color} rounded flex items-center justify-center`}>
                        <span className="text-white text-xs font-bold">{card.letter}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-800 flex-1 text-left">{card.label}</span>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedCard === idx ? 'border-sky-500' : 'border-slate-300'}`}>
                        {selectedCard === idx && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={doTopUp}
                  disabled={!(selectedAmount || (parseInt(customAmount) >= 5000))}
                  className="w-full py-3.5 bg-sky-500 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-all">
                  Пополнить{selectedAmount ? ` ${selectedAmount.toLocaleString()} сум` : customAmount ? ` ${parseInt(customAmount).toLocaleString()} сум` : ''}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityScreen({ onBack }: { onBack: () => void }) {
  const [pinEnabled, setPinEnabled] = useState(true);
  const [bioEnabled, setBioEnabled] = useState(true);
  const [twoFA, setTwoFA] = useState(false);
  const [pinPhase, setPinPhase] = useState<'idle' | 'enter' | 'confirm' | 'done'>('idle');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [analytics, setAnalytics] = useState(true);
  const [personalization, setPersonalization] = useState(true);
  const [crashReports, setCrashReports] = useState(true);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-sky-500' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  const handlePinKey = (k: string) => {
    if (pinPhase === 'idle' || pinPhase === 'done') return;
    if (k === '⌫') {
      if (pinPhase === 'enter') setPin(p => p.slice(0, -1));
      else setConfirmPin(p => p.slice(0, -1));
      setPinError('');
      return;
    }
    if (pinPhase === 'enter') {
      const next = pin + k;
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => { setPinPhase('confirm'); setPin(next); setConfirmPin(''); }, 150);
      }
    } else {
      const next = confirmPin + k;
      setConfirmPin(next);
      if (next.length === 4) {
        if (next === pin) {
          setPinPhase('done');
          setPinError('');
        } else {
          setPinError('PIN-коды не совпадают. Попробуйте снова.');
          setPin('');
          setConfirmPin('');
          setPinPhase('enter');
        }
      }
    }
  };

  const currentPin = pinPhase === 'enter' ? pin : confirmPin;

  const sessions = [
    { device: 'iPhone 15 Pro', os: 'iOS 17.4', location: 'Ташкент, UZ', time: 'Сейчас (текущее)', current: true },
    { device: 'Chrome / MacBook', os: 'macOS Sonoma', location: 'Ташкент, UZ', time: '3 часа назад', current: false },
    { device: 'Samsung Galaxy S24', os: 'Android 14', location: 'Самарканд, UZ', time: '2 дня назад', current: false },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Безопасность</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Section 1 — Login */}
        <div>
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-2 px-1">ВХОД В ПРИЛОЖЕНИЕ</p>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">PIN-код</p>
                <p className="text-xs text-slate-400">4-значный код при запуске</p>
              </div>
              <Toggle value={pinEnabled} onChange={() => setPinEnabled(v => !v)} />
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">Face ID / Touch ID</p>
                <p className="text-xs text-slate-400">Биометрический вход</p>
              </div>
              <Toggle value={bioEnabled} onChange={() => setBioEnabled(v => !v)} />
            </div>
            {pinPhase === 'idle' && (
              <div className="px-4 py-3">
                <button onClick={() => { setPinPhase('enter'); setPin(''); setConfirmPin(''); setPinError(''); }}
                  className="text-sky-500 text-sm font-medium">
                  Изменить PIN-код
                </button>
              </div>
            )}
          </div>

          {pinPhase !== 'idle' && (
            <div className="mt-3 bg-slate-900 rounded-2xl p-6">
              {pinPhase === 'done' ? (
                <div className="text-center py-2">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="text-green-400 font-semibold">PIN изменён</p>
                  <button onClick={() => setPinPhase('idle')} className="mt-3 text-slate-400 text-sm">Закрыть</button>
                </div>
              ) : (
                <>
                  <p className="text-white font-semibold text-center mb-4">
                    {pinPhase === 'enter' ? 'Введите новый PIN' : 'Подтвердите PIN'}
                  </p>
                  <div className="flex justify-center gap-3 mb-5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`w-4 h-4 rounded-full ${i < currentPin.length ? 'bg-sky-400' : 'border-2 border-slate-600'}`} />
                    ))}
                  </div>
                  {pinError && <p className="text-red-400 text-xs text-center mb-3">{pinError}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    {['1','2','3','4','5','6','7','8','9','*','0','⌫'].map(k => (
                      <button key={k} onClick={() => handlePinKey(k)}
                        className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white rounded-xl py-3.5 text-lg font-semibold transition-colors">
                        {k}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Section 2 — 2FA */}
        <div>
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-2 px-1">ДВУХФАКТОРНАЯ АУТЕНТИФИКАЦИЯ</p>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">SMS при входе с нового устройства</p>
              </div>
              <Toggle value={twoFA} onChange={() => setTwoFA(v => !v)} />
            </div>
            {twoFA && (
              <div className="px-4 pb-3.5">
                <div className="bg-sky-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-sky-700">Код будет отправлен на +998 90 *** 45 67</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3 — Active Sessions */}
        <div>
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-2 px-1">АКТИВНЫЕ СЕССИИ</p>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
            {sessions.map((s, i) => (
              <div key={i} className="px-4 py-3.5 flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                  {s.current || s.device.includes('iPhone') || s.device.includes('Samsung')
                    ? <Smartphone size={15} className="text-slate-500" />
                    : <Monitor size={15} className="text-slate-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{s.device}</p>
                  <p className="text-xs text-slate-400">{s.os}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">{s.location}</p>
                  <p className="text-xs text-slate-400">{s.time}</p>
                  {s.current
                    ? <span className="text-xs text-green-600 font-medium">Активна</span>
                    : <button className="text-xs text-red-500 font-medium">Завершить</button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4 — Privacy */}
        <div>
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-2 px-1">КОНФИДЕНЦИАЛЬНОСТЬ</p>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">Аналитика использования</p>
                <p className="text-xs text-slate-400">Помогает улучшать приложение</p>
              </div>
              <Toggle value={analytics} onChange={() => setAnalytics(v => !v)} />
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">Персонализация тарифов</p>
                <p className="text-xs text-slate-400">Индивидуальные предложения</p>
              </div>
              <Toggle value={personalization} onChange={() => setPersonalization(v => !v)} />
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Отчёты о сбоях</p>
                <p className="text-xs text-slate-400">Автоматически отправлять отчёты</p>
              </div>
              <Toggle value={crashReports} onChange={() => setCrashReports(v => !v)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'faq' | 'chat' | 'tickets' | 'contact'>('faq');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [chatMsg, setChatMsg] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Привет! Я ИИ-ассистент ONE CHARGE 🔋 Как могу помочь?' }
  ]);

  const faqs = [
    { q: 'Как начать зарядку?', a: 'Найдите станцию на карте → нажмите "Начать зарядку" → выберите коннектор → подтвердите. Либо отсканируйте QR-код на станции.' },
    { q: 'Почему зарядка не началась?', a: 'Проверьте: 1) Коннектор вставлен и зафиксирован, 2) Баланс кошелька достаточен, 3) Автомобиль в режиме зарядки. Если ошибка сохраняется — нажмите "Сообщить о проблеме".' },
    { q: 'Как пополнить кошелёк?', a: 'Профиль → Кошелёк → Пополнить. Доступны Humo, Uzcard, Visa, Mastercard. Минимальная сумма 5 000 сум. Зачисление мгновенное.' },
    { q: 'Как получить бонусы?', a: '1 балл за каждые 10 кВт·ч. Дополнительно: реферал +500 баллов, отзыв +200, день рождения +1000. Тратьте баллы на скидки в разделе Бонусы.' },
    { q: 'Как отменить бронирование?', a: 'История → нужная сессия → Отменить. Бесплатно до 30 минут до начала. После — штраф 3 000 сум.' },
  ];

  const tickets = [
    { id: 'RPT-8821', title: 'Не запустилась зарядка', station: 'GreenCharge Toshkent-1', date: '05 сент', status: 'resolved' },
    { id: 'RPT-7654', title: 'Неверное списание', station: 'EV Hub Samarkand', date: '28 авг', status: 'in_progress' },
    { id: 'RPT-6201', title: 'Сломан коннектор CCS2', station: 'AutoCharge Fergana', date: '15 авг', status: 'resolved' },
  ];

  const aiReply = (msg: string) => {
    if (msg.includes('зарядк') || msg.includes('старт')) return 'Для начала зарядки найдите станцию на карте и нажмите кнопку "Начать зарядку". Нужна помощь с конкретной станцией?';
    if (msg.includes('бонус') || msg.includes('балл')) return 'Ваш текущий баланс — 2 450 бонусных баллов. Уровень: Silver. До Gold осталось 1 550 баллов!';
    if (msg.includes('оплат') || msg.includes('кошел')) return 'Кошелёк ONE CHARGE поддерживает Humo, Uzcard, Visa и Mastercard. Пополнение мгновенное!';
    if (msg.includes('станц') || msg.includes('карт')) return 'В сети ONE CHARGE 108 станций по всему Узбекистану. Найдите ближайшую на главной карте или в разделе Избранные.';
    return 'Понял вас! Соединяю с оператором... Обычно отвечаем в течение 5 минут в рабочее время (9:00–21:00).';
  };

  const sendMsg = () => {
    const text = chatMsg.trim();
    if (!text) return;
    setChatHistory(h => [...h, { role: 'user', text }]);
    setChatMsg('');
    setTimeout(() => {
      setChatHistory(h => [...h, { role: 'ai', text: aiReply(text) }]);
    }, 1200);
  };

  const tabs: { id: 'faq' | 'chat' | 'tickets' | 'contact'; label: string }[] = [
    { id: 'faq', label: 'FAQ' },
    { id: 'chat', label: 'Чат' },
    { id: 'tickets', label: 'Заявки' },
    { id: 'contact', label: 'Контакты' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Поддержка</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 pb-3 shrink-0">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'faq' && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left">
                  <span className="text-sm font-medium text-slate-800 flex-1 pr-2">{faq.q}</span>
                  <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all ${openFaq === i ? 'max-h-48' : 'max-h-0'}`}>
                  <p className="px-4 pb-4 text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${m.role === 'user' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 pt-2 flex gap-2 bg-white border-t border-slate-100 shrink-0">
              <input
                value={chatMsg}
                onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMsg()}
                placeholder="Написать сообщение..."
                className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 text-sm outline-none text-slate-800 placeholder:text-slate-400"
              />
              <button onClick={sendMsg}
                className="w-10 h-10 bg-sky-500 rounded-2xl flex items-center justify-center shrink-0">
                <Send size={16} className="text-white" />
              </button>
            </div>
          </div>
        )}

        {tab === 'tickets' && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {tickets.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${t.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {t.status === 'resolved' ? 'Решено' : 'В работе'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{t.station}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-mono text-slate-500">{t.id}</span>
                  <span className="text-xs text-slate-400">{t.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'contact' && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <button className="w-full bg-sky-500 text-white rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Phone size={20} className="text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-base">+998 71 200-10-01</p>
                <p className="text-sky-100 text-xs">Поддержка 24/7</p>
              </div>
            </button>

            <button className="w-full bg-violet-600 text-white rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Send size={18} className="text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold">@onecharge_support</p>
                <p className="text-violet-200 text-xs">Telegram</p>
              </div>
            </button>

            <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                <span className="text-slate-600 text-lg">✉</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">support@onecharge.uz</p>
                <p className="text-xs text-slate-400">Email</p>
              </div>
            </div>

            <div className="bg-slate-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 mb-1">РЕЖИМ РАБОТЫ</p>
              <p className="text-sm text-slate-700">Пн–Пт 9:00–21:00, Сб–Вс 10:00–18:00</p>
              <p className="text-xs text-slate-500 mt-0.5">Экстренно: 24/7</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white text-xl font-bold shadow">
            AT
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Alisher Toshmatov</h1>
            <p className="text-sm text-slate-500">+998 90 123 45 67</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Star size={11} className="text-amber-400 fill-amber-400" />
              <span className="text-xs text-slate-500">4.9 · 47 зарядок</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {/* Car */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">МОЙ АВТОМОБИЛЬ</p>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
              <Car size={20} className="text-sky-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">BYD Han EV</p>
              <p className="text-xs text-slate-400">2024 · 85 кВт·ч · CCS2 · макс 150 кВт</p>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </div>
          <button onClick={() => onNavigate('add-car')} className="p-4 flex items-center gap-3 w-full border-t border-slate-50 hover:bg-slate-50 transition-colors">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <Plus size={16} className="text-slate-400" />
            </div>
            <span className="text-sm text-slate-500">Добавить автомобиль</span>
          </button>
        </div>

        {/* Payments */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">ПЛАТЁЖНЫЕ МЕТОДЫ</p>
          </div>
          <button onClick={() => onNavigate('cards')} className="w-full divide-y divide-slate-50 text-left">
            {[
              { label: 'Humo •••• 4521', sub: 'Основная', color: 'from-orange-400 to-orange-600', letter: 'H' },
              { label: 'Uzcard •••• 8832', sub: '', color: 'from-blue-400 to-blue-600', letter: 'U' },
            ].map(card => (
              <div key={card.label} className="p-4 flex items-center gap-3">
                <div className={`w-8 h-5 bg-gradient-to-r ${card.color} rounded flex items-center justify-center`}>
                  <span className="text-white text-xs font-bold">{card.letter}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{card.label}</p>
                  {card.sub && <p className="text-xs text-sky-500">{card.sub}</p>}
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            ))}
            <div className="p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                <Plus size={14} className="text-slate-500" />
              </div>
              <span className="text-sm text-slate-500">Управление картами</span>
            </div>
          </button>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {[
            { icon: <Wallet size={16} className="text-green-500" />, label: 'Кошелёк', count: '47 500 сум', screen: 'wallet' },
            { icon: <Star size={16} className="text-amber-400" />, label: 'Бонусы и уровни', count: '2 450 бонусов', screen: 'loyalty' },
            { icon: <Gift size={16} className="text-violet-400" />, label: 'Реферальная программа', count: '+5 000 сум', screen: 'referral' },
            { icon: <Heart size={16} className="text-red-400" />, label: 'Избранные станции', count: '8', screen: 'favorites' },
            { icon: <Bell size={16} className="text-amber-400" />, label: 'Уведомления', count: '2', screen: 'notifications' },
            { icon: <Lock size={16} className="text-slate-400" />, label: 'Безопасность', count: '', screen: 'security' },
            { icon: <Settings size={16} className="text-slate-400" />, label: 'Настройки', count: '', screen: 'app-settings' },
            { icon: <Phone size={16} className="text-sky-400" />, label: 'Поддержка', count: '', screen: 'support' },
          ].map(item => (
            <button key={item.label} onClick={item.screen ? () => onNavigate(item.screen as Screen) : undefined}
              className="p-4 flex items-center gap-3 w-full border-b border-slate-50 last:border-none hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center">
                {item.icon}
              </div>
              <span className="flex-1 text-sm font-medium text-slate-700 text-left">{item.label}</span>
              {item.count && <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full">{item.count}</span>}
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>

        <button className="w-full py-3 flex items-center justify-center gap-2 text-red-500 text-sm font-medium">
          <LogOut size={16} />Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}

const carBrands: Record<string, string[]> = {
  'BYD': ['Han EV', 'Atto 3', 'Tang EV', 'Seal', 'Dolphin'],
  'Hyundai': ['Ioniq 5', 'Ioniq 6', 'Kona Electric'],
  'Kia': ['EV6', 'EV9', 'Niro EV'],
  'Tesla': ['Model 3', 'Model Y', 'Model S', 'Model X'],
  'BMW': ['i3', 'i4', 'iX', 'iX3'],
  'Mercedes': ['EQA', 'EQB', 'EQC', 'EQS'],
  'Volkswagen': ['ID.3', 'ID.4', 'ID.6'],
  'Chevrolet': ['Bolt EV', 'Bolt EUV'],
  'Audi': ['e-tron', 'Q4 e-tron', 'A6 e-tron'],
  'Nio': ['ET5', 'ET7', 'ES8'],
};

const portTypes: { type: string; label: string; maxKw: number }[] = [
  { type: 'CCS2', label: 'CCS2 (DC)', maxKw: 150 },
  { type: 'CCS1', label: 'CCS1 (DC)', maxKw: 150 },
  { type: 'CHAdeMO', label: 'CHAdeMO (DC)', maxKw: 100 },
  { type: 'Type2', label: 'Type 2 (AC)', maxKw: 22 },
  { type: 'Type1', label: 'Type 1 (AC)', maxKw: 7 },
  { type: 'GB/T DC', label: 'GB/T DC', maxKw: 120 },
  { type: 'NACS', label: 'NACS (Tesla)', maxKw: 250 },
];

function AddCarScreen({ onBack, onSave }: { onBack: () => void; onSave: (car: { brand: string; model: string; year: number; battery: number; port: string; maxKw: number }) => void }) {
  const [brand, setBrand] = useState('BYD');
  const [model, setModel] = useState('Han EV');
  const [year, setYear] = useState(2024);
  const [battery, setBattery] = useState(85);
  const [port, setPort] = useState('CCS2');
  const [maxKw, setMaxKw] = useState(150);
  const [step, setStep] = useState<'form' | 'confirm'>('form');

  const selectedPort = portTypes.find(p => p.type === port);

  if (step === 'confirm') {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
          <button onClick={() => setStep('form')} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
          <h1 className="text-base font-bold text-slate-900">Подтверждение</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="flex flex-col items-center py-6">
            <div className="w-20 h-20 bg-sky-100 rounded-3xl flex items-center justify-center mb-4 text-4xl">🚗</div>
            <h2 className="text-xl font-bold text-slate-900">{brand} {model}</h2>
            <p className="text-slate-400 text-sm">{year}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {[
              { label: 'Марка', value: brand },
              { label: 'Модель', value: model },
              { label: 'Год', value: String(year) },
              { label: 'Ёмкость батареи', value: `${battery} кВт·ч` },
              { label: 'Тип разъема', value: selectedPort?.label || port },
              { label: 'Макс. мощность зарядки', value: `${maxKw} кВт` },
            ].map(row => (
              <div key={row.label} className="px-4 py-3 flex justify-between border-b border-slate-50 last:border-none">
                <span className="text-sm text-slate-500">{row.label}</span>
                <span className="text-sm font-semibold text-slate-800">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4">
            <p className="text-xs font-semibold text-sky-700 mb-2 flex items-center gap-1.5">
              <Zap size={12} />Совместимость с сетью ONE CHARGE
            </p>
            <div className="space-y-1.5">
              {portTypes.filter(p => p.type === port || p.type === 'Type2').map(pt => (
                <div key={pt.type} className="flex items-center gap-2 text-xs">
                  <CheckCircle size={12} className="text-green-500" />
                  <span className="text-sky-700">{pt.label} — совместимо ({pt.maxKw} кВт макс)</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={12} className="text-green-500" />
                <span className="text-sky-700">108 станций в сети ONE CHARGE · 276 EVSE</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-8 pt-2">
          <button onClick={() => onSave({ brand, model, year, battery, port, maxKw })}
            className="w-full bg-sky-500 text-white rounded-2xl py-4 font-bold text-base">
            Добавить автомобиль
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Добавить автомобиль</h1>
          <p className="text-xs text-slate-400">Данные для автоматической совместимости</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Brand */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">МАРКА</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(carBrands).map(b => (
              <button key={b} onClick={() => { setBrand(b); setModel(carBrands[b][0]); }}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${brand === b ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">МОДЕЛЬ</p>
          <div className="flex flex-wrap gap-2">
            {(carBrands[brand] || []).map(m => (
              <button key={m} onClick={() => setModel(m)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${model === m ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Year */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ГОД ВЫПУСКА</p>
            <span className="text-sm font-bold text-slate-900 mono">{year}</span>
          </div>
          <input type="range" min="2020" max="2026" value={year} onChange={e => setYear(Number(e.target.value))}
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>2020</span><span>2026</span></div>
        </div>

        {/* Battery */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ЁМКОСТЬ БАТАРЕИ</p>
            <span className="text-sm font-bold text-slate-900 mono">{battery} кВт·ч</span>
          </div>
          <input type="range" min="20" max="120" step="5" value={battery} onChange={e => setBattery(Number(e.target.value))}
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>20 кВт·ч</span><span>120 кВт·ч</span></div>
        </div>

        {/* Port type */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">ТИП ЗАРЯДНОГО РАЗЪЕМА</p>
          <div className="space-y-2">
            {portTypes.map(pt => (
              <button key={pt.type} onClick={() => { setPort(pt.type); setMaxKw(pt.maxKw); }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-colors ${port === pt.type ? 'border-sky-500 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${port === pt.type ? 'bg-sky-500' : 'bg-slate-200'}`}>
                    <Zap size={12} className={port === pt.type ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <span className="text-sm font-medium text-slate-800">{pt.label}</span>
                </div>
                <span className="text-xs text-slate-400">макс. {pt.maxKw} кВт</span>
              </button>
            ))}
          </div>
        </div>

        {/* Max charge power */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">МАКС. МОЩНОСТЬ ЗАРЯДКИ</p>
            <span className="text-sm font-bold text-slate-900 mono">{maxKw} кВт</span>
          </div>
          <input type="range" min="3" max={selectedPort?.maxKw || 150} step="1" value={maxKw} onChange={e => setMaxKw(Number(e.target.value))}
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>3 кВт</span><span>{selectedPort?.maxKw} кВт</span></div>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2">
        <button onClick={() => setStep('confirm')}
          className="w-full bg-sky-500 text-white rounded-2xl py-4 font-bold text-base">
          Далее →
        </button>
      </div>
    </div>
  );
}

function NotificationsScreen({ onBack }: { onBack: () => void }) {
  type NotifType = 'charge' | 'payment' | 'booking' | 'promo' | 'alert' | 'system';
  type Notif = { id: number; type: NotifType; icon: string; title: string; body: string; time: string; date: string; read: boolean; action?: string };

  const initial: Notif[] = [
    { id: 1, type: 'charge', icon: '⚡', title: 'Зарядка завершена', body: 'Toshkent Siti Hub · CCS2 · 38.4 кВт·ч · 76 800 сум · 42 мин', time: '15:05', date: 'Сегодня', read: false, action: 'Посмотреть квитанцию' },
    { id: 2, type: 'payment', icon: '💳', title: 'Оплата прошла успешно', body: 'Humo •••• 4521 · 76 800 сум · TXN-28491', time: '15:05', date: 'Сегодня', read: false, action: 'Детали платежа' },
    { id: 3, type: 'booking', icon: '📅', title: 'Бронь через 30 минут', body: 'Yunusobod Mall · EVSE-002 · CCS2 150 кВт · подъезжайте заранее', time: '09:30', date: 'Сегодня', read: false, action: 'Открыть бронь' },
    { id: 4, type: 'charge', icon: '🎯', title: 'Достигнуто 80% заряда', body: 'Samarqand Gateway · BYD Han EV · цель достигнута, продолжаем до 100%', time: '28 авг, 14:20', date: '28 авг', read: true },
    { id: 5, type: 'promo', icon: '🎁', title: 'Ночной тариф −30%', body: 'GreenCharge UZ · 23:00–06:00 каждую ночь · до 15 сент 2026', time: '27 авг', date: '27 авг', read: true, action: 'Активировать' },
    { id: 6, type: 'alert', icon: '⚠️', title: 'Станция временно недоступна', body: 'Namangan Industrial · CCS2 EVSE-001 · техническое обслуживание · EVSE-002 работает', time: '26 авг', date: '26 авг', read: true },
    { id: 7, type: 'system', icon: '🔒', title: 'Новый вход в аккаунт', body: 'iPhone 15 Pro · Ташкент, UZ · если это не вы — смените PIN', time: '25 авг', date: '25 авг', read: true, action: 'Проверить устройства' },
    { id: 8, type: 'payment', icon: '↩️', title: 'Возврат средств', body: 'Yunusobod Mall · 12 400 сум возвращено на карту Humo •••• 4521', time: '22 авг', date: '22 авг', read: true, action: 'Детали' },
    { id: 9, type: 'system', icon: '⭐', title: 'Оцените зарядку', body: 'Toshkent Siti Hub · 21 авг · ваш отзыв поможет другим водителям', time: '21 авг', date: '21 авг', read: true, action: 'Оставить отзыв' },
    { id: 10, type: 'promo', icon: '🚀', title: 'Реферальный бонус зачислен', body: '+5 000 сум на баланс ONE CHARGE · вы пригласили Bobur M.', time: '20 авг', date: '20 авг', read: true },
  ];

  const [notifs, setNotifs] = useState<Notif[]>(initial);
  const [filter, setFilter] = useState<'all' | NotifType>('all');

  const typeLabel: Record<string, string> = { charge: 'Зарядки', payment: 'Платежи', booking: 'Брони', promo: 'Акции', alert: 'Предупреждения', system: 'Система' };
  const typeDot: Record<string, string> = { charge: 'bg-sky-500', payment: 'bg-green-500', booking: 'bg-violet-500', promo: 'bg-amber-500', alert: 'bg-red-500', system: 'bg-slate-400' };

  const unreadCount = notifs.filter(n => !n.read).length;

  const filtered = filter === 'all' ? notifs : notifs.filter(n => n.type === filter);

  const markAll = () => setNotifs(ns => ns.map(n => ({ ...n, read: true })));
  const markRead = (id: number) => setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  const dismiss = (id: number) => setNotifs(ns => ns.filter(n => n.id !== id));

  // Group by date
  const grouped = filtered.reduce<Record<string, Notif[]>>((acc, n) => {
    if (!acc[n.date]) acc[n.date] = [];
    acc[n.date].push(n);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-0 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900 leading-tight">Уведомления</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-slate-400">{unreadCount} непрочитанных</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAll} className="text-xs text-sky-500 font-semibold px-3 py-1.5 rounded-xl hover:bg-sky-50 active:scale-95 transition-all">
              Прочитать все
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
          {(['all', 'charge', 'payment', 'booking', 'promo', 'alert', 'system'] as const).map(f => {
            const active = filter === f;
            const count = f === 'all' ? unreadCount : notifs.filter(n => n.type === f && !n.read).length;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {f === 'all' ? 'Все' : typeLabel[f]}
                {count > 0 && (
                  <span className={`ml-1.5 px-1 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white text-slate-900' : 'bg-sky-500 text-white'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <span className="text-4xl">🔔</span>
            <p className="text-sm font-semibold text-slate-700">Нет уведомлений</p>
            <p className="text-xs text-slate-400">В этом разделе пока пусто</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <p className="px-4 pt-4 pb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{date}</p>
              <div className="px-3 space-y-1.5 pb-2">
                {items.map(n => (
                  <div key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`relative flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer active:scale-[0.99] ${
                      !n.read
                        ? 'bg-sky-50 border-sky-100 shadow-sm'
                        : 'bg-white border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <span className="absolute top-3.5 right-3 w-2 h-2 bg-sky-500 rounded-full" />
                    )}

                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${!n.read ? 'bg-sky-100' : 'bg-slate-100'}`}>
                      {n.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <p className={`text-sm leading-tight ${!n.read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{n.title}</p>
                        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{n.time}</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{n.body}</p>

                      {n.action && (
                        <div className="flex items-center justify-between mt-2">
                          <button className="text-xs text-sky-600 font-semibold hover:underline">{n.action} →</button>
                          <button
                            onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                            className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            Скрыть
                          </button>
                        </div>
                      )}

                      {/* Type pill */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className={`w-1 h-1 rounded-full ${typeDot[n.type]}`} />
                        <span className="text-[10px] text-slate-400">{typeLabel[n.type]}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <div className="h-6" />
      </div>
    </div>
  );
}

const mockReviews = [
  { id: 1, author: 'Alisher T.', avatar: 'AT', date: '2 сент 2026', rating: 5, text: 'Отличная станция! Зарядился за 40 минут до 80%. CCS2 работает стабильно, персонал вежливый. Рекомендую.', likes: 12, connector: 'CCS2' },
  { id: 2, author: 'Nilufar K.', avatar: 'NK', date: '1 сент 2026', rating: 4, text: 'Хорошее место, но иногда очереди в час-пик. Лучше приезжать утром. Есть кафе рядом — удобно ждать.', likes: 8, connector: 'Type 2' },
  { id: 3, author: 'Bobur M.', avatar: 'BM', date: '29 авг 2026', rating: 5, text: 'Уже третий раз здесь. Цена адекватная, скорость 148 кВт стабильно. Приложение работает без сбоев.', likes: 15, connector: 'CCS2' },
  { id: 4, author: 'Dilshod R.', avatar: 'DR', date: '25 авг 2026', rating: 3, text: 'Один из четырёх разъёмов не работал. Поддержка ответила быстро, но сам факт неприятен. Надеюсь починят.', likes: 4, connector: 'CCS2' },
];

function ReviewsScreen({ station, onBack }: { station: Station | null; onBack: () => void }) {
  const [reviews, setReviews] = useState(mockReviews);
  const [myRating, setMyRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const avgRating = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);

  const submit = () => {
    if (!myRating || !text.trim()) return;
    setReviews(prev => [{
      id: Date.now(), author: 'Alisher T.', avatar: 'AT',
      date: 'Сейчас', rating: myRating, text: text.trim(), likes: 0, connector: 'CCS2',
    }, ...prev]);
    setSubmitted(true);
    setText('');
    setMyRating(0);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Отзывы и рейтинг</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Rating summary */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold text-slate-900 mono">{avgRating}</p>
            <div className="flex gap-0.5 justify-center mt-1">
              {[1,2,3,4,5].map(i => (
                <Star key={i} size={12} className={i <= Math.round(Number(avgRating)) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">{reviews.length} отзывов</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5,4,3,2,1].map(star => {
              const count = reviews.filter(r => r.rating === star).length;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-3">{star}</span>
                  <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / reviews.length) * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 w-3">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Write review */}
        {!submitted ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Оставить отзыв</p>
            <div className="flex gap-1 mb-3">
              {[1,2,3,4,5].map(i => (
                <button key={i}
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setMyRating(i)}
                  className="p-1">
                  <Star size={24} className={i <= (hoverRating || myRating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
                </button>
              ))}
            </div>
            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Расскажите о своём опыте зарядки..."
              className="w-full text-sm border border-slate-200 rounded-xl p-3 outline-none resize-none focus:border-sky-400 text-slate-700 placeholder:text-slate-300"
              rows={3}
            />
            <button
              onClick={submit}
              disabled={!myRating || !text.trim()}
              className={`mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${myRating && text.trim() ? 'bg-sky-500 text-white hover:bg-sky-600' : 'bg-slate-100 text-slate-400'}`}>
              <Send size={14} />Отправить отзыв
            </button>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Отзыв опубликован!</p>
              <p className="text-xs text-green-600">Спасибо за обратную связь.</p>
            </div>
          </div>
        )}

        {/* Reviews list */}
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center text-xs font-bold text-sky-600 shrink-0">
                  {r.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{r.author}</p>
                    <span className="text-xs text-slate-400">{r.date}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={11} className={i <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
                    ))}
                    <span className="text-xs text-slate-400 ml-1">{r.connector}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{r.text}</p>
              <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-slate-50">
                <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-500 transition-colors">
                  <ThumbsUp size={12} />Полезно ({r.likes})
                </button>
                <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors ml-auto">
                  <Flag size={12} />Жалоба
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const reportCategories = [
  { id: 'broken', icon: '🔧', label: 'Неисправный разъем', sub: 'Коннектор не работает или повреждён' },
  { id: 'stuck', icon: '🔒', label: 'Разъем застрял', sub: 'Невозможно извлечь кабель' },
  { id: 'payment', icon: '💳', label: 'Проблема с оплатой', sub: 'Не списалось или лишнее списание' },
  { id: 'slow', icon: '🐌', label: 'Медленная зарядка', sub: 'Мощность ниже заявленной' },
  { id: 'app', icon: '📱', label: 'Проблема с приложением', sub: 'Не запускается зарядка через приложение' },
  { id: 'safety', icon: '⚠️', label: 'Вопрос безопасности', sub: 'Запах гари, искры или другое' },
  { id: 'other', icon: '💬', label: 'Другое', sub: 'Произвольное описание' },
];

function ReportScreen({ station, onBack }: { station: Station | null; onBack: () => void }) {
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-slate-900">Сообщить о проблеме</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mb-5 text-4xl">✅</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Сообщение отправлено</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">Мы передали информацию оператору станции. Как правило, проблемы устраняются в течение 24 часов.</p>
        <div className="w-full bg-sky-50 border border-sky-100 rounded-2xl p-4 text-left">
          <p className="text-xs font-semibold text-sky-700 mb-2">НОМЕР ЗАЯВКИ</p>
          <p className="text-lg font-bold text-sky-800 mono">#RPT-{Math.floor(Math.random()*9000+1000)}</p>
          <p className="text-xs text-sky-600 mt-1">Вы получите уведомление после устранения</p>
        </div>
        <button onClick={onBack} className="mt-6 w-full bg-sky-500 text-white rounded-2xl py-3.5 font-semibold text-base">Закрыть</button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Сообщить о проблеме</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">КАТЕГОРИЯ ПРОБЛЕМЫ</p>
          <div className="space-y-2">
            {reportCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${category === cat.id ? 'border-red-400 bg-red-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                <span className="text-xl">{cat.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{cat.label}</p>
                  <p className="text-xs text-slate-400">{cat.sub}</p>
                </div>
                {category === cat.id && <div className="w-5 h-5 bg-red-400 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle size={12} className="text-white" />
                </div>}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">ОПИСАНИЕ (необязательно)</p>
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Укажите подробности — номер разъема, время возникновения..."
            className="w-full text-sm border border-slate-200 rounded-xl p-3 outline-none resize-none focus:border-red-300 text-slate-700 placeholder:text-slate-300"
            rows={4} />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <AlertTriangle size={12} />При проблеме с безопасностью немедленно отключитесь и отойдите от станции.
          </p>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2">
        <button onClick={() => category && setSent(true)}
          disabled={!category}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${category ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
          <Send size={16} />Отправить сообщение
        </button>
      </div>
    </div>
  );
}

function FavoritesScreen({ onBack, onSelectStation }: { onBack: () => void; onSelectStation: (s: Station) => void }) {
  const stations = useLiveStations();
  const [favs, setFavs] = useState(stations.slice(0, 4));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'rating' | 'distance'>('rating');

  const filtered = favs
    .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return a.connectors[0].price - b.connectors[0].price;
    });

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Избранные станции</h1>
        <span className="ml-auto text-xs text-slate-400">{favs.length} станций</span>
      </div>

      {favs.length > 0 && (
        <div className="bg-white px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск станций..."
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-xs text-sky-500 font-medium shrink-0">Сбросить</button>
            )}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'name' | 'rating' | 'distance')}
            className="text-xs text-slate-600 bg-slate-100 rounded-xl px-2 py-2 outline-none border-none"
          >
            <option value="rating">Рейтинг</option>
            <option value="name">Название</option>
            <option value="distance">Цена</option>
          </select>
        </div>
      )}

      {favs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <Heart size={48} className="text-slate-200 mb-4" />
          <p className="text-slate-400 text-sm">Нет избранных станций.<br />Добавьте станцию на её странице.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <Search size={48} className="text-slate-200 mb-4" />
          <p className="text-slate-400 text-sm">Нет станций по запросу</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {filtered.map(s => {
            const free = s.connectors.filter(c => c.status === 'available').length;
            const statusColors: Record<string, string> = { available: 'text-green-600', occupied: 'text-red-500', unavailable: 'text-slate-400', reserved: 'text-amber-500' };
            const statusLabels: Record<string, string> = { available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно', reserved: 'Забронировано' };
            return (
              <button key={s.id} onClick={() => onSelectStation(s)}
                className="w-full bg-white rounded-2xl border border-slate-100 p-4 text-left hover:border-sky-200 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.operator}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setFavs(prev => prev.filter(f => f.id !== s.id)); }}
                        className="p-1.5 rounded-xl bg-slate-50 hover:bg-red-50 transition-colors">
                        <Trash2 size={13} className="text-slate-400 hover:text-red-400" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className={`font-medium ${statusColors[s.status]}`}>{statusLabels[s.status]}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{free}/{s.connectors.length} разъемов</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{s.totalPower} кВт</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-0.5">
                        <Star size={10} className="text-amber-400 fill-amber-400" />{s.rating}
                      </span>
                      <span>{s.connectors[0].price.toLocaleString()} сум/кВт·ч</span>
                      <span>{s.city}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BookingScreen({ station, onBack, onConfirm }: { station: Station | null; onBack: () => void; onConfirm: () => void }) {
  const [date, setDate] = useState('2026-09-05');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [connector, setConnector] = useState(0);

  const freeConnectors = station?.connectors.filter(c => c.status === 'available') || [];
  const estimatedCost = freeConnectors[connector]
    ? Math.round((freeConnectors[connector].power * duration / 60) * freeConnectors[connector].price)
    : 0;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Бронирование</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Connector select */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">РАЗЪЕМ</p>
          <div className="space-y-2">
            {freeConnectors.map((c, i) => (
              <button key={c.id} onClick={() => setConnector(i)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${connector === i ? 'border-sky-500 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <Zap size={14} className="text-sky-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-slate-800">{c.type}</p>
                  <p className="text-xs text-slate-400">{c.power} кВт · {c.price.toLocaleString()} сум/кВт·ч</p>
                </div>
                {connector === i && <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                  <CheckCircle size={12} className="text-white" />
                </div>}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500">ДАТА И ВРЕМЯ</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Дата</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-sky-400 text-slate-800" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Время начала</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-sky-400 text-slate-800" />
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500">ДЛИТЕЛЬНОСТЬ</p>
            <p className="text-sm font-bold text-slate-900 mono">{duration} мин</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setDuration(d => Math.max(15, d - 15))}
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200">
              <Minus size={16} />
            </button>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${(duration / 240) * 100}%` }} />
            </div>
            <button onClick={() => setDuration(d => Math.min(240, d + 15))}
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>15 мин</span><span>4 ч</span>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-sky-700 mb-2">ИТОГ БРОНИРОВАНИЯ</p>
          <div className="space-y-1.5 text-sm">
            {[
              ['Станция', station?.name || '—'],
              ['Разъем', freeConnectors[connector]?.type + ' · ' + freeConnectors[connector]?.power + ' кВт'],
              ['Дата', date],
              ['Время', time + ' – ' + (() => { const [h, m] = time.split(':').map(Number); const end = h * 60 + m + duration; return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`; })()],
              ['Стоимость брони', '2 000 сум'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-sky-700/70">{k}</span>
                <span className="font-medium text-sky-900">{v}</span>
              </div>
            ))}
            <div className="border-t border-sky-200 pt-2 flex justify-between">
              <span className="font-semibold text-sky-800">Прогноз зарядки</span>
              <span className="font-bold text-sky-900 mono">~{estimatedCost.toLocaleString()} сум</span>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2">
        <button onClick={onConfirm}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2">
          <CalendarCheck size={18} />Подтвердить бронь · 2 000 сум
        </button>
      </div>
    </div>
  );
}

function BookingDoneScreen({ station, onClose }: { station: Station | null; onClose: () => void }) {
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mb-5 shadow-lg shadow-amber-100">
          <CalendarCheck size={38} className="text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Бронь подтверждена!</h2>
        <p className="text-slate-500 text-sm mb-6">Ваш разъем зарезервирован. Жёлтый маркер на карте.</p>

        <div className="w-full bg-white rounded-2xl border border-slate-100 p-4 mb-4 text-left">
          <p className="text-xs font-semibold text-slate-400 mb-3">ДЕТАЛИ БРОНИ</p>
          {[
            ['Станция', station?.name || '—'],
            ['Разъем', 'CCS2 · 150 кВт'],
            ['Дата', '5 сент 2026'],
            ['Время', '10:00 – 11:00'],
            ['Номер брони', '#BK-7821'],
            ['Статус', '🟡 Забронировано'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5 border-b border-slate-50 last:border-none text-sm">
              <span className="text-slate-500">{k}</span>
              <span className="font-medium text-slate-800">{v}</span>
            </div>
          ))}
        </div>

        <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <Clock size={12} />Приедьте в течение 15 минут после начала брони, иначе она будет отменена.
          </p>
        </div>
      </div>
      <div className="px-4 pb-8 grid grid-cols-2 gap-2">
        <button className="border border-slate-200 text-slate-700 rounded-2xl py-3 font-medium text-sm">Добавить в календарь</button>
        <button onClick={onClose} className="bg-sky-500 text-white rounded-2xl py-3 font-semibold text-sm">Готово</button>
      </div>
    </div>
  );
}

const NEAREST_STATIONS = [
  { name: 'Yunusobod Mall DC', dist: '1.2 км', time: '4 мин', free: 3, total: 8, power: '150 кВт', type: 'CCS2', color: '#22C55E' },
  { name: 'Toshkent Siti Hub', dist: '2.4 км', time: '8 мин', free: 8, total: 12, power: '150 кВт', type: 'CCS2', color: '#22C55E' },
  { name: 'Mirzo Ulugbek Plaza', dist: '3.8 км', time: '12 мин', free: 1, total: 4, power: '50 кВт', type: 'CCS2/AC', color: '#F59E0B' },
  { name: 'Chilanzar AC Point', dist: '5.1 км', time: '16 мин', free: 2, total: 2, power: '22 кВт', type: 'Type 2', color: '#22C55E' },
];

const ROUTE_DATA: Record<string, { km: number; time: string; stops: { name: string; dist: number; kwh: number; cost: number; time: string; power: string }[]; voiceRu: string }> = {
  'Samarqand': {
    km: 348, time: '4ч 20м',
    stops: [
      { name: 'GreenCharge Navoi', dist: 220, kwh: 35, cost: 70000, time: '40 мин', power: 'CCS2 150кВт' },
    ],
    voiceRu: 'Маршрут до Самарканда рассчитан. Расстояние триста сорок восемь километров. По дороге вы встретите одну зарядную станцию. Рекомендуемая остановка: GreenCharge Навои, на расстоянии двести двадцать километров. Время зарядки сорок минут. Прибытие с зарядом двадцать пять процентов.',
  },
  'Buxoro': {
    km: 596, time: '7ч 40м',
    stops: [
      { name: 'EcoVolt Jizzax', dist: 190, kwh: 30, cost: 60000, time: '35 мин', power: 'CCS2 100кВт' },
      { name: 'GreenCharge Navoi', dist: 370, kwh: 38, cost: 76000, time: '45 мин', power: 'CCS2 150кВт' },
    ],
    voiceRu: 'Маршрут до Бухары рассчитан. Расстояние пятьсот девяносто шесть километров. По дороге вы встретите две зарядные станции. Первая остановка: ЭкоВольт Джизак, сто девяносто километров. Вторая остановка: GreenCharge Навои, триста семьдесят километров. Прибытие с зарядом восемнадцать процентов.',
  },
  'Namangan': {
    km: 328, time: '4ч 05м',
    stops: [
      { name: 'SilkRoad Angren', dist: 120, kwh: 25, cost: 50000, time: '30 мин', power: 'CCS2 100кВт' },
    ],
    voiceRu: 'Маршрут до Намангана рассчитан. Расстояние триста двадцать восемь километров. По дороге вы встретите одну зарядную станцию. Рекомендуемая остановка: СилкРоад Ангрен, сто двадцать километров. Время зарядки тридцать минут. Прибытие с зарядом двадцать два процента.',
  },
  'Farg\'ona': {
    km: 338, time: '4ч 15м',
    stops: [
      { name: 'EcoVolt Kokand', dist: 240, kwh: 32, cost: 64000, time: '38 мин', power: 'CCS2 150кВт' },
    ],
    voiceRu: 'Маршрут до Ферганы рассчитан. Расстояние триста тридцать восемь километров. По дороге вы встретите одну зарядную станцию. Рекомендуемая остановка: ЭкоВольт Коканд, двести сорок километров. Время зарядки тридцать восемь минут.',
  },
};

function TripPlannerScreen({ onBack }: { onBack: () => void }) {
  const [from, setFrom] = useState('Toshkent, Amir Temur sq.');
  const [to, setTo] = useState('Samarqand, Registon');
  const [battery, setBattery] = useState(65);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showNearest, setShowNearest] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [nearestLoading, setNearestLoading] = useState(false);

  const destKey = Object.keys(ROUTE_DATA).find(k => to.toLowerCase().includes(k.toLowerCase())) ?? 'Samarqand';
  const routeData = ROUTE_DATA[destKey];

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.rate = 0.88;
    u.pitch = 1.05;
    u.volume = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const findNearest = () => {
    setNearestLoading(true);
    setTimeout(() => { setNearestLoading(false); setShowNearest(true); }, 1200);
    speak('Ищу ближайшие зарядные станции. Найдено четыре станции в радиусе пяти километров.');
  };

  const startPlanning = () => {
    setPhase('loading');
    setProgress(0);
    setShowNearest(false);
    const steps = [10, 30, 55, 75, 90, 100];
    steps.forEach((p, i) => setTimeout(() => {
      setProgress(p);
      if (p === 100) {
        setTimeout(() => {
          setPhase('done');
          setTimeout(() => speak(routeData.voiceRu), 600);
        }, 300);
      }
    }, i * 320));
  };

  const routes = [
    {
      label: 'Быстрый', badge: 'AI выбор', color: 'border-sky-400 bg-sky-50',
      km: 348, time: '4ч 20м', cost: 89000, stops: 1, arrivalPct: 25,
      stops_list: [
        { icon: '🟢', label: from, sub: `Старт · заряд ${battery}%` },
        { icon: '⚡', label: 'Navoi, GreenCharge DC', sub: '40 мин · CCS2 150кВт · 35кВт·ч · 70 000 сум' },
        { icon: '📍', label: to, sub: 'Прибытие с ~25% заряда' },
      ],
    },
    {
      label: 'Эконом', badge: 'Дешевле', color: 'border-green-400 bg-green-50',
      km: 362, time: '5ч 05м', cost: 62000, stops: 2, arrivalPct: 31,
      stops_list: [
        { icon: '🟢', label: from, sub: `Старт · заряд ${battery}%` },
        { icon: '⚡', label: 'Jizzax, EcoVolt AC', sub: '65 мин · Type2 22кВт · 28кВт·ч · 33 600 сум' },
        { icon: '⚡', label: 'Samarqand Gateway', sub: '25 мин · CCS2 · 12кВт·ч · 28 400 сум' },
        { icon: '📍', label: to, sub: 'Прибытие с ~31% заряда' },
      ],
    },
    {
      label: 'Без остановок', badge: battery >= 65 ? '✓ Возможно' : '⚠ Риск', color: battery >= 65 ? 'border-amber-400 bg-amber-50' : 'border-red-300 bg-red-50',
      km: 340, time: '3ч 55м', cost: 0, stops: 0, arrivalPct: battery >= 65 ? 12 : 3,
      stops_list: [
        { icon: '🟢', label: from, sub: `Старт · заряд ${battery}%` },
        { icon: '📍', label: to, sub: `Прибытие с ~${battery >= 65 ? 12 : 3}% заряда ${battery < 65 ? '⚠ Риск разряда' : ''}` },
      ],
    },
  ];

  const r = routes[selected];

  return (
    <div className="h-full flex flex-col" style={{ background: '#F0F4FA' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100/80"
        style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)' }}>
        <button onClick={onBack} className="p-2 rounded-xl bg-white/20 backdrop-blur"><ArrowLeft size={18} className="text-white" /></button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-white">AI Маршрут & Станции</h1>
          <p className="text-xs text-sky-100/80">Голосовой помощник · поиск по маршруту</p>
        </div>
        {speaking && (
          <button onClick={stopSpeaking} className="flex items-center gap-1.5 bg-white/20 border border-white/30 px-2.5 py-1.5 rounded-xl">
            {/* Animated waveform */}
            <span className="flex items-end gap-0.5 h-4">
              {[1,2,3,4,3,2,1].map((h, i) => (
                <span key={i} className="w-0.5 bg-white rounded-full"
                  style={{ height: `${h * 3 + 2}px`, animation: `bounce 0.6s ease-in-out ${i * 80}ms infinite` }} />
              ))}
            </span>
            <span className="text-[10px] text-white font-medium">Стоп</span>
          </button>
        )}
        {phase === 'done' && !speaking && (
          <button onClick={() => speak(routeData.voiceRu)}
            className="flex items-center gap-1 bg-white/20 border border-white/30 px-2.5 py-1.5 rounded-xl text-[11px] text-white font-medium">
            🔊 Слушать
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* ── Nearest stations button ── */}
        <button onClick={findNearest} disabled={nearestLoading}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed text-left transition-all active:scale-95"
          style={{ borderColor: '#0EA5E9', background: 'rgba(14,165,233,0.06)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #0EA5E9, #38BDF8)', boxShadow: '0 4px 12px rgba(14,165,233,0.3)' }}>
            {nearestLoading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin-cw 0.8s linear infinite' }} />
              : <MapPin size={18} className="text-white" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Найти ближайшие станции</p>
            <p className="text-xs text-slate-400">{nearestLoading ? 'Определяю местоположение...' : 'GPS · в радиусе 5 км · голосовой отчёт'}</p>
          </div>
          <div className="ml-auto text-sky-400">›</div>
        </button>

        {/* Nearest stations list */}
        {showNearest && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ animation: 'enter-up 0.3s ease both' }}>
            <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ближайшие станции</p>
              <button onClick={() => setShowNearest(false)} className="text-slate-400 text-base leading-none">×</button>
            </div>
            {NEAREST_STATIONS.map((s, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                  <Zap size={14} className="text-sky-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                  <p className="text-[10px] text-slate-400">{s.dist} · {s.time} · {s.power} · {s.type}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs font-semibold text-slate-700">{s.free}/{s.total}</span>
                  </div>
                  <p className="text-[9px] text-slate-400">свободно</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Route inputs ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Маршрут</p>
          <div className="flex items-center gap-3 pb-3 border-b border-slate-50">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
            <input value={from} onChange={e => setFrom(e.target.value)} placeholder="Откуда"
              className="flex-1 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          </div>
          <div className="flex items-center gap-3 pt-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <input value={to} onChange={e => { setTo(e.target.value); setPhase('idle'); }} placeholder="Куда (напр. Samarqand, Buxoro...)"
              className="flex-1 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          </div>
        </div>

        {/* Battery */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-slate-600 flex items-center gap-1.5"><Battery size={14} />Текущий заряд</span>
            <span className={`text-sm font-bold mono ${battery < 30 ? 'text-red-500' : battery < 50 ? 'text-amber-500' : 'text-emerald-600'}`}>{battery}%</span>
          </div>
          <input type="range" min="10" max="100" value={battery} onChange={e => { setBattery(Number(e.target.value)); setPhase('idle'); }}
            className="w-full accent-sky-500" />
        </div>

        {phase === 'idle' && (
          <button onClick={startPlanning}
            className="w-full text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', boxShadow: '0 4px 16px rgba(14,165,233,0.4)' }}>
            <Route size={16} />Построить маршрут + голос
          </button>
        )}

        {phase === 'loading' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">AI анализирует маршрут...</p>
              <span className="text-xs text-sky-600 mono font-bold">{progress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #38BDF8, #0EA5E9, #0284C7)' }} />
            </div>
            {[
              { label: 'Расчёт расхода по маршруту', done: progress >= 30 },
              { label: 'Поиск станций по трассе', done: progress >= 55 },
              { label: 'Оптимизация остановок', done: progress >= 75 },
              { label: 'Подготовка голосового отчёта', done: progress >= 100 },
            ].map(step => (
              <div key={step.label} className={`flex items-center gap-2 text-xs transition-all ${step.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                {step.done ? <CheckCircle size={12} /> : <div className="w-3 h-3 rounded-full border border-slate-200" />}
                {step.label}
              </div>
            ))}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3" style={{ animation: 'enter-up 0.4s ease both' }}>
            {/* AI voice banner */}
            <div className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg, #050A14, #0d1628)', border: '1px solid rgba(56,189,248,0.2)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #0EA5E9, #7C3AED)' }}>
                🎙️
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Голосовой AI готов</p>
                <p className="text-xs text-slate-400">По маршруту {from.split(',')[0]} → {to.split(',')[0]} — {routeData.stops.length} зарядная станция</p>
              </div>
              <button onClick={() => speak(routeData.voiceRu)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #0EA5E9, #7C3AED)' }}>
                🔊 Слушать
              </button>
            </div>

            {/* Route summary */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-slate-800">{from.split(',')[0]} → {to.split(',')[0]}</p>
                <span className="text-xs bg-sky-50 text-sky-600 px-2 py-1 rounded-lg font-medium">AI выбор</span>
              </div>
              <div className="flex gap-4 text-xs text-slate-500 mb-4">
                <span className="font-bold text-slate-800 mono">{routeData.km} км</span>
                <span>{routeData.time}</span>
                <span>{routeData.stops.length} {routeData.stops.length === 1 ? 'остановка' : 'остановки'}</span>
              </div>

              {/* Route timeline */}
              <div className="space-y-0">
                {/* Start */}
                <div className="flex items-start gap-3 pb-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-3 h-3 rounded-full bg-sky-500 mt-0.5" />
                    <div className="w-0.5 flex-1 bg-slate-200 mt-1" style={{ minHeight: 24 }} />
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold text-slate-800">{from}</p>
                    <p className="text-xs text-slate-400">Старт · заряд {battery}%</p>
                  </div>
                </div>

                {/* Stops */}
                {routeData.stops.map((stop, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center mt-0"
                        style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                        <Zap size={8} className="text-white" />
                      </div>
                      <div className="w-0.5 flex-1 bg-slate-200 mt-1" style={{ minHeight: 24 }} />
                    </div>
                    <div className="pb-1 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex-1">
                      <p className="text-xs font-bold text-amber-800">⚡ {stop.name}</p>
                      <p className="text-[10px] text-amber-600">{stop.power} · {stop.kwh} кВт·ч · {stop.time} · {stop.cost.toLocaleString()} сум</p>
                      <p className="text-[10px] text-amber-500">{stop.dist} км от старта</p>
                    </div>
                  </div>
                ))}

                {/* End */}
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{to}</p>
                    <p className="text-xs text-slate-400">Прибытие · заряд ~{battery >= 65 ? 25 : 15}%</p>
                  </div>
                </div>
              </div>
            </div>

            <button className="w-full text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
              <Navigation size={16} />Начать навигацию
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── QR SCAN SCREEN ──────────────────────────────────────────────────────────
type QRPhase = 'idle' | 'permission' | 'scanning' | 'processing' | 'success' | 'error' | 'manual';

const QR_VALID_CODES: Record<string, string> = {
  'GCU-TH-01': '0', 'GCU-TH-02': '1', 'ECO-YM-03': '2', 'ECO-YM-04': '3',
  'SRB-BX-01': '4', 'SRB-BX-02': '5', 'ONE-TH-05': '0', 'ONE-SM-02': '1',
};

function QRScanScreen({ onBack, onStartCharging }: { onBack: () => void; onStartCharging: (s: Station) => void }) {
  const stations = useLiveStations();
  const [phase, setPhase] = useState<QRPhase>('idle');
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [scanPct, setScanPct] = useState(0);
  const [manualCode, setManualCode] = useState('');
  const [scannedStation, setScannedStation] = useState<Station | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [scanBounce, setScanBounce] = useState(false);
  const rafRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const recentScans = [
    { code: 'GCU-TH-01', station: stations[0], time: 'Вчера, 18:34' },
    { code: 'ECO-YM-03', station: stations[1], time: '3 дня назад' },
    { code: 'SRB-BX-01', station: stations[4] || stations[0], time: 'Неделю назад' },
  ];

  // Animate scan line
  useEffect(() => {
    if (phase !== 'scanning') { cancelAnimationFrame(rafRef.current); return; }
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const t = ((ts - start) % 2000) / 2000;
      setScanPct(t < 0.5 ? t * 2 : 2 - t * 2);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const startScan = () => {
    setPhase('permission');
    timerRef.current = setTimeout(() => {
      setPhase('scanning');
      timerRef.current = setTimeout(() => {
        setPhase('processing');
        timerRef.current = setTimeout(() => {
          const s = stations[Math.floor(Math.random() * Math.min(3, stations.length))];
          setScannedStation(s);
          setScanBounce(true);
          setTimeout(() => setScanBounce(false), 600);
          setPhase('success');
        }, 700);
      }, 2800);
    }, 500);
  };

  const submitManual = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    const idx = QR_VALID_CODES[code];
    if (idx !== undefined) {
      const s = stations[Number(idx)];
      setScannedStation(s);
      setPhase('success');
    } else {
      setErrorMsg(`Код «${code}» не найден.\nПроверьте правильность ввода.`);
      setPhase('error');
    }
  };

  const reset = () => { setPhase('idle'); setScannedStation(null); setManualCode(''); setErrorMsg(''); };

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); clearTimeout(timerRef.current); }, []);
  useEffect(() => { if (phase === 'manual') setTimeout(() => inputRef.current?.focus(), 100); }, [phase]);

  // ── IDLE ──
  if (phase === 'idle') return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(180deg,#F0F9FF 0%,#F8FAFC 100%)' }}>
      {/* Header */}
      <div className="bg-white/80 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100/80">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-900">Сканер QR-кода</h1>
          <p className="text-xs text-slate-400">Подключитесь к зарядной станции</p>
        </div>
        <button onClick={() => setPhase('manual')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-medium active:scale-95 transition-transform">
          <span className="text-[11px]">⌨</span> Код
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Main CTA */}
        <div className="rounded-3xl overflow-hidden relative" style={{ background: 'linear-gradient(145deg,#0C1A3A,#0A1628)', boxShadow: '0 12px 40px rgba(14,165,233,0.25)' }}>
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full opacity-20"
              style={{ background: '#0EA5E9', filter: 'blur(40px)' }} />
          </div>
          <div className="relative z-10 px-6 py-8 flex flex-col items-center">
            {/* QR icon */}
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
                style={{ background: 'rgba(14,165,233,0.15)', border: '1.5px solid rgba(14,165,233,0.3)' }}>
                {/* Corner accents */}
                {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos,cls],i) => (
                  <div key={i} className={`absolute ${pos} w-4 h-4 border-sky-400 rounded-sm`} style={{ [pos.includes('top') ? 'top' : 'bottom']: -1, [pos.includes('left') ? 'left' : 'right']: -1, borderTopColor: cls.includes('border-t') ? '#38BDF8' : 'transparent', borderBottomColor: cls.includes('border-b') ? '#38BDF8' : 'transparent', borderLeftColor: cls.includes('border-l') ? '#38BDF8' : 'transparent', borderRightColor: cls.includes('border-r') ? '#38BDF8' : 'transparent', borderWidth: 2 }} />
                ))}
                <Scan size={32} className="text-sky-400" style={{ filter: 'drop-shadow(0 0 8px #38BDF8)' }} />
              </div>
              {/* Pulse rings */}
              {[1,2].map(i => (
                <div key={i} className="absolute inset-0 rounded-2xl border border-sky-400/30" style={{ animation: `pulse-halo ${1.5 + i * 0.5}s ease-out infinite`, animationDelay: `${i * 0.4}s` }} />
              ))}
            </div>
            <h2 className="text-white font-bold text-lg mb-1">Отсканируйте QR</h2>
            <p className="text-sky-200/60 text-xs text-center mb-6">QR-код расположен на корпусе\nзарядного разъёма или табличке</p>
            <button onClick={startScan}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg,#0EA5E9,#0284C7)', boxShadow: '0 6px 24px rgba(14,165,233,0.4)' }}>
              <Scan size={18} className="text-white" />
              <span className="text-white">Открыть камеру</span>
            </button>
          </div>
        </div>

        {/* Or divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">или</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Manual entry */}
        <button onClick={() => setPhase('manual')}
          className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 active:scale-98 transition-all hover:border-sky-200 hover:bg-sky-50/30"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <span className="text-base">⌨️</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-slate-800">Ввести код вручную</p>
            <p className="text-xs text-slate-400">Найдите код на корпусе станции</p>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>

        {/* Recent scans */}
        {recentScans.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Недавние станции</p>
              <button className="text-[11px] text-sky-500 font-semibold">Очистить</button>
            </div>
            {recentScans.map((r, i) => (
              <button key={i} onClick={() => { setScannedStation(r.station); setPhase('success'); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sky-50/40 transition-colors border-b border-slate-50 last:border-b-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' }}>
                  <Zap size={15} className="text-sky-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.station.name}</p>
                  <p className="text-xs text-slate-400 inter">{r.code} · {r.time}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor[r.station.status] }} />
                  <span className="text-[10px] text-slate-400">{statusLabel[r.station.status]}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Где найти QR-код</p>
          <div className="space-y-2.5">
            {[
              { icon: '🔌', text: 'На кабеле или корпусе разъёма' },
              { icon: '📋', text: 'На информационной табличке станции' },
              { icon: '📱', text: 'В приложении ONE CHARGE (раздел бронирований)' },
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-base leading-none shrink-0 mt-0.5">{t.icon}</span>
                <p className="text-[12px] text-slate-600 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-50">
            <button className="flex items-center gap-1.5 text-xs text-sky-500 font-semibold">
              <span>Подробная справка</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* NFC hint */}
        <div className="flex items-start gap-3 px-1">
          <span className="text-lg shrink-0">📶</span>
          <p className="text-xs text-slate-400 leading-relaxed">
            Некоторые станции поддерживают <strong className="text-slate-600">NFC</strong> — просто
            поднесите телефон к метке на корпусе станции.
          </p>
        </div>
      </div>
    </div>
  );

  // ── PERMISSION ──
  if (phase === 'permission') return (
    <div className="h-full flex flex-col items-center justify-center" style={{ background: '#0A0F1E' }}>
      <div className="w-16 h-16 rounded-2xl bg-sky-500/20 flex items-center justify-center mb-4" style={{ border: '1px solid rgba(14,165,233,0.3)' }}>
        <Scan size={28} className="text-sky-400" />
      </div>
      <p className="text-white font-bold text-base mb-1">Доступ к камере</p>
      <p className="text-slate-500 text-sm text-center px-8">Запрашиваем разрешение…</p>
      <div className="mt-6 flex gap-1">
        {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-sky-400" style={{ animation: `bounce 0.9s ease-in-out ${i * 0.18}s infinite` }} />)}
      </div>
    </div>
  );

  // ── SCANNING ──
  if (phase === 'scanning') {
    const viewSize = 220;
    const boxY = scanPct * (viewSize - 4);
    return (
      <div className="h-full flex flex-col relative overflow-hidden" style={{ background: '#000' }}>
        {/* Camera simulation */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#050A14 0%,#0A1428 100%)' }}>
          {/* Fake camera grain */}
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
          {/* Vignette */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />
        </div>

        {/* Top bar */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-5 pb-3">
          <button onClick={() => { cancelAnimationFrame(rafRef.current); clearTimeout(timerRef.current); reset(); }}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} className="text-white" />
          </button>
          <p className="text-white font-semibold text-sm">Сканер QR</p>
          <button onClick={() => setTorchOn(t => !t)}
            className={`w-10 h-10 rounded-full backdrop-blur flex items-center justify-center active:scale-90 transition-all ${torchOn ? 'bg-amber-400' : 'bg-white/10'}`}>
            <span className="text-base">{torchOn ? '🔦' : '💡'}</span>
          </button>
        </div>

        {/* Scan zone */}
        <div className="flex-1 relative flex flex-col items-center justify-center z-10">
          {/* Overlay masks */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-black/55" />
          </div>

          {/* Clear scan window */}
          <div className="relative" style={{ width: viewSize, height: viewSize }}>
            {/* Clear cutout */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', zIndex: 1 }}>
              {/* Scanning laser */}
              <div className="absolute left-0 right-0 h-0.5 pointer-events-none"
                style={{ top: `${boxY}px`, background: 'linear-gradient(90deg,transparent,#38BDF8,#7DD3FC,#38BDF8,transparent)', boxShadow: '0 0 12px #38BDF8, 0 0 24px rgba(56,189,248,0.5)', zIndex: 3, transition: 'top 0.016s linear' }} />
              {/* Fake QR pattern (subtle) */}
              <div className="absolute inset-4 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.3) 0px,rgba(255,255,255,0.3) 1px,transparent 1px,transparent 8px),repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0px,rgba(255,255,255,0.3) 1px,transparent 1px,transparent 8px)' }} />
            </div>

            {/* Corner brackets — animated */}
            {(['tl','tr','bl','br'] as const).map(corner => {
              const top = corner.startsWith('t');
              const left = corner.endsWith('l');
              return (
                <div key={corner} className="absolute z-10"
                  style={{ [top ? 'top' : 'bottom']: -1, [left ? 'left' : 'right']: -1, width: 28, height: 28 }}>
                  <div className="absolute" style={{
                    [top ? 'top' : 'bottom']: 0, [left ? 'left' : 'right']: 0, width: 28, height: 28,
                    borderTop: top ? '3px solid #38BDF8' : 'none',
                    borderBottom: !top ? '3px solid #38BDF8' : 'none',
                    borderLeft: left ? '3px solid #38BDF8' : 'none',
                    borderRight: !left ? '3px solid #38BDF8' : 'none',
                    borderRadius: top && left ? '10px 0 0 0' : top && !left ? '0 10px 0 0' : !top && left ? '0 0 0 10px' : '0 0 10px 0',
                    filter: 'drop-shadow(0 0 6px #38BDF8)',
                  }} />
                </div>
              );
            })}
          </div>

          {/* Status text */}
          <div className="mt-6 text-center">
            <p className="text-white/90 font-semibold text-sm">Наведите на QR-код</p>
            <p className="text-white/40 text-xs mt-1">Удерживайте камеру ровно</p>
          </div>

          {/* Zoom pill */}
          <div className="mt-4 flex gap-1 bg-black/40 rounded-full p-1 backdrop-blur">
            {[1, 1.5, 2].map(z => (
              <button key={z} onClick={() => setZoom(z)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-90 ${zoom === z ? 'bg-white text-black' : 'text-white/60'}`}>
                {z}×
              </button>
            ))}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="relative z-20 px-8 pb-8 pt-4 flex items-center justify-between">
          <button onClick={() => { cancelAnimationFrame(rafRef.current); clearTimeout(timerRef.current); setPhase('manual'); }}
            className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform">
            <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
              <span className="text-xl">⌨️</span>
            </div>
            <span className="text-white/60 text-[10px]">Ввести код</span>
          </button>

          <div className="w-16 h-16 rounded-full bg-sky-500/20 flex items-center justify-center" style={{ border: '2px solid rgba(56,189,248,0.5)', boxShadow: '0 0 20px rgba(56,189,248,0.3)' }}>
            <Scan size={26} className="text-sky-400" style={{ animation: 'pulse 1.5s ease-in-out infinite', filter: 'drop-shadow(0 0 4px #38BDF8)' }} />
          </div>

          <button className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform">
            <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
              <span className="text-xl">🖼️</span>
            </div>
            <span className="text-white/60 text-[10px]">Галерея</span>
          </button>
        </div>

        {/* Torch overlay glow */}
        {torchOn && <div className="absolute inset-0 pointer-events-none z-5" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 70%)' }} />}
      </div>
    );
  }

  // ── PROCESSING ──
  if (phase === 'processing') return (
    <div className="h-full flex flex-col items-center justify-center" style={{ background: '#0A0F1E' }}>
      <div className="relative w-20 h-20 mb-5">
        <div className="absolute inset-0 rounded-full border-2 border-sky-500/30" style={{ animation: 'spin-cw 1s linear infinite' }} />
        <div className="absolute inset-2 rounded-full border-2 border-sky-400/50" style={{ animation: 'spin-ccw 0.7s linear infinite' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Scan size={28} className="text-sky-400" style={{ filter: 'drop-shadow(0 0 8px #38BDF8)' }} />
        </div>
      </div>
      <p className="text-white font-bold text-base mb-1">Считываем код…</p>
      <p className="text-slate-500 text-sm">Проверяем станцию в системе</p>
    </div>
  );

  // ── SUCCESS ──
  if (phase === 'success' && scannedStation) {
    const avail = scannedStation.connectors.filter(c => c.status === 'available');
    return (
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(180deg,#F0FFF4 0%,#F8FAFC 100%)' }}>
        <div className="bg-white/80 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100/80">
          <button onClick={reset} className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <h1 className="text-base font-bold text-slate-900">Станция найдена</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {/* Success badge */}
          <div className="flex flex-col items-center py-4">
            <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${scanBounce ? 'scale-110' : 'scale-100'}`}
              style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)', boxShadow: '0 8px 24px rgba(34,197,94,0.4)', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
              <CheckCircle size={32} className="text-white" />
              <div className="absolute inset-0 rounded-2xl" style={{ border: '2px solid rgba(255,255,255,0.3)', animation: 'pulse-halo 1.8s ease-out 1' }} />
            </div>
            <p className="font-bold text-emerald-700 text-base">QR распознан!</p>
            <p className="text-slate-400 text-xs mt-0.5">Станция подтверждена системой ONE CHARGE</p>
          </div>

          {/* Station card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
            <div className="px-4 py-4 flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' }}>
                <Zap size={22} className="text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-base truncate">{scannedStation.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <MapPin size={11} className="text-slate-400 shrink-0" />
                  <p className="text-xs text-slate-400 truncate">{scannedStation.address}, {scannedStation.city}</p>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: scannedStation.status === 'available' ? '#DCFCE7' : '#FEF3C7', color: scannedStation.status === 'available' ? '#15803D' : '#D97706' }}>
                    {statusLabel[scannedStation.status]}
                  </span>
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-amber-400 fill-amber-400" />
                    <span className="text-[11px] font-semibold text-slate-600">{scannedStation.rating}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">· {scannedStation.distance} км</span>
                </div>
              </div>
            </div>

            {/* Connector grid */}
            <div className="border-t border-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Доступные разъёмы</p>
              <div className="grid grid-cols-2 gap-2">
                {scannedStation.connectors.map(c => (
                  <div key={c.id} className={`flex items-center gap-2 p-2.5 rounded-xl border ${c.status === 'available' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'available' ? 'bg-emerald-500' : c.status === 'occupied' ? 'bg-red-500' : 'bg-slate-400'}`} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-slate-800 truncate">{c.type}</p>
                      <p className="text-[10px] text-slate-400">{c.power} кВт · {c.price.toLocaleString()} сум</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Amenities row */}
            {scannedStation.amenities && scannedStation.amenities.length > 0 && (
              <div className="border-t border-slate-50 px-4 py-2.5 flex gap-2 flex-wrap">
                {scannedStation.amenities.slice(0, 4).map((a, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 bg-slate-50 rounded-lg text-slate-500">{a}</span>
                ))}
              </div>
            )}
          </div>

          {/* Availability warning */}
          {avail.length === 0 && (
            <div className="flex items-start gap-3 p-4 rounded-2xl border" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Разъёмы заняты</p>
                <p className="text-xs text-amber-600 mt-0.5">Все коннекторы сейчас заняты. Вы можете забронировать место в очереди или прийти позже.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2.5 pb-2">
            <button
              onClick={() => avail.length > 0 && onStartCharging(scannedStation)}
              disabled={avail.length === 0}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: avail.length > 0 ? 'linear-gradient(135deg,#0EA5E9,#0284C7)' : undefined, backgroundColor: avail.length === 0 ? '#E2E8F0' : undefined, color: avail.length > 0 ? '#fff' : '#94A3B8', boxShadow: avail.length > 0 ? '0 6px 20px rgba(14,165,233,0.35)' : undefined }}>
              <Zap size={18} />Начать зарядку
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button className="py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 active:scale-95 transition-all hover:bg-slate-50">
                <CalendarCheck size={15} />Забронировать
              </button>
              <button className="py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 active:scale-95 transition-all hover:bg-slate-50">
                <Navigation size={15} />Маршрут
              </button>
            </div>

            <button onClick={reset}
              className="w-full py-3 rounded-2xl font-medium text-sm text-slate-500 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Scan size={14} />Сканировать другой код
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ERROR ──
  if (phase === 'error') return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(180deg,#FFF5F5 0%,#F8FAFC 100%)' }}>
      <div className="bg-white/80 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100/80">
        <button onClick={reset} className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-bold text-slate-900">Ошибка сканирования</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center" style={{ border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-bold text-slate-900 text-base mb-1">Станция не найдена</p>
          <p className="text-slate-500 text-sm leading-relaxed whitespace-pre-line">{errorMsg}</p>
        </div>
        <div className="w-full space-y-2.5 pt-2">
          <button onClick={startScan}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#0EA5E9,#0284C7)', boxShadow: '0 4px 16px rgba(14,165,233,0.3)' }}>
            <Scan size={16} />Сканировать ещё раз
          </button>
          <button onClick={() => { setPhase('manual'); setManualCode(''); }}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 active:scale-95 transition-all">
            <span className="text-base">⌨️</span>Ввести другой код
          </button>
          <button onClick={reset} className="w-full py-3 text-slate-400 text-sm font-medium active:scale-95 transition-all">
            Вернуться назад
          </button>
        </div>
        <div className="w-full mt-2 p-4 rounded-2xl bg-white border border-slate-100">
          <p className="text-xs font-semibold text-slate-700 mb-2">Возможные причины:</p>
          <div className="space-y-1.5">
            {['QR-код принадлежит другой сети', 'Станция временно отключена от системы', 'Неверный формат кода — нужен формат XXX-XX-00'].map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                <p className="text-xs text-slate-500">{r}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── MANUAL ENTRY ──
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={() => setPhase('idle')} className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-900">Ввод кода станции</h1>
          <p className="text-xs text-slate-400">Найдите код на корпусе устройства</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Input */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 inter">Код EVSE / станции</p>
          <input ref={inputRef}
            value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && submitManual()}
            placeholder="Например: GCU-TH-01"
            className="w-full bg-transparent text-2xl font-bold mono text-slate-900 tracking-widest outline-none placeholder:text-slate-300"
          />
          {manualCode.length > 0 && (
            <button onClick={() => setManualCode('')} className="mt-2 text-xs text-slate-400 flex items-center gap-1 active:scale-95">
              <X size={11} /> Очистить
            </button>
          )}
        </div>

        {/* Format hint */}
        <div className="flex items-start gap-2.5 px-1">
          <span className="text-sm shrink-0">💡</span>
          <p className="text-xs text-slate-400 leading-relaxed">
            Формат кода: <span className="font-mono font-bold text-slate-600">XXX-XX-00</span>, например <span className="font-mono text-sky-600">GCU-TH-01</span>. Код нанесён на наклейку или гравировку на корпусе разъёма.
          </p>
        </div>

        {/* Recent codes */}
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 px-1">Недавние коды</p>
          <div className="space-y-2">
            {recentScans.map((r, i) => (
              <button key={i} onClick={() => setManualCode(r.code)}
                className="w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-slate-200 active:scale-98 transition-all hover:border-sky-200 text-left">
                <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                  <Zap size={14} className="text-sky-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold mono text-slate-800">{r.code}</p>
                  <p className="text-xs text-slate-400 truncate">{r.station.name}</p>
                </div>
                <span className="text-[10px] text-slate-300">{r.time}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Example codes */}
        <div className="bg-slate-50 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Тестовые коды (демо)</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(QR_VALID_CODES).slice(0, 5).map(c => (
              <button key={c} onClick={() => setManualCode(c)}
                className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold mono text-sky-600 hover:border-sky-300 active:scale-95 transition-all">
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 pt-2 space-y-2">
        <button onClick={submitManual} disabled={!manualCode.trim()}
          className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
          style={{ background: manualCode.trim() ? 'linear-gradient(135deg,#0EA5E9,#0284C7)' : '#E2E8F0', color: manualCode.trim() ? '#fff' : '#94A3B8', boxShadow: manualCode.trim() ? '0 6px 20px rgba(14,165,233,0.35)' : 'none' }}>
          <CheckCircle size={18} />Найти станцию
        </button>
        <button onClick={startScan}
          className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-slate-100 text-slate-600 active:scale-95 transition-all">
          <Scan size={15} />Открыть камеру
        </button>
      </div>
    </div>
  );
}

// ─── LOYALTY SCREEN ──────────────────────────────────────────────────────────

const loyaltyHistory = [
  { id: 1, type: 'earned', desc: 'Зарядка на Toshkent City Hub', amount: +120, date: '7 сент', kwh: 38.4 },
  { id: 2, type: 'earned', desc: 'Первая зарядка после регистрации', amount: +500, date: '5 сент' },
  { id: 3, type: 'spent', desc: 'Скидка на зарядку', amount: -200, date: '4 сент' },
  { id: 4, type: 'earned', desc: 'Зарядка на Yunusobod Mall', amount: +95, date: '3 сент', kwh: 24.1 },
  { id: 5, type: 'earned', desc: 'Реферальный бонус — Bobur M.', amount: +500, date: '20 авг' },
  { id: 6, type: 'earned', desc: 'Зарядка на Samarkand Plaza', amount: +143, date: '18 авг', kwh: 41.2 },
  { id: 7, type: 'earned', desc: 'Бонус за оценку приложения', amount: +200, date: '15 авг' },
  { id: 8, type: 'spent', desc: 'Скидка 5% на сессию', amount: -358, date: '12 авг' },
];

const levels = [
  { name: 'Starter', minPts: 0, maxPts: 999, color: '#94A3B8', icon: '⚡', perks: ['1 балл за каждые 10 кВт·ч'] },
  { name: 'Silver', minPts: 1000, maxPts: 4999, color: '#94A3B8', icon: '🥈', perks: ['1.5× бонусы', 'Бесплатное бронирование×2/мес'] },
  { name: 'Gold', minPts: 5000, maxPts: 14999, color: '#F59E0B', icon: '🥇', perks: ['2× бонусы', 'Приоритет на пиковых станциях', 'Чат с поддержкой'] },
  { name: 'Platinum', minPts: 15000, maxPts: Infinity, color: '#8B5CF6', icon: '💎', perks: ['3× бонусы', 'VIP-поддержка 24/7', 'Эксклюзивные тарифы', 'Личный менеджер'] },
];

function LoyaltyScreen({ onBack }: { onBack: () => void }) {
  const points = 2450;
  const currentLevel = levels.find(l => points >= l.minPts && points <= l.maxPts) || levels[0];
  const nextLevel = levels[levels.indexOf(currentLevel) + 1];
  const progress = nextLevel ? Math.round(((points - currentLevel.minPts) / (nextLevel.minPts - currentLevel.minPts)) * 100) : 100;
  const [tab, setTab] = useState<'overview' | 'history' | 'redeem'>('overview');

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative px-4 pt-4 pb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-white/80 text-sm mb-4">
            <ArrowLeft size={16} />Назад
          </button>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium mb-0.5">МОЙ УРОВЕНЬ</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentLevel.icon}</span>
                <span className="text-white text-2xl font-bold">{currentLevel.name}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-xs font-medium mb-0.5">БОНУСЫ</p>
              <p className="text-white text-3xl font-bold">{points.toLocaleString()}</p>
            </div>
          </div>
          {nextLevel && (
            <div>
              <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
                <span>{points.toLocaleString()} из {nextLevel.minPts.toLocaleString()} до {nextLevel.name}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-white/60 text-xs mt-1">{(nextLevel.minPts - points).toLocaleString()} баллов до следующего уровня</p>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="flex bg-black/10 mx-4 mb-0 rounded-xl p-1">
          {(['overview', 'history', 'redeem'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${tab === t ? 'bg-white text-amber-700' : 'text-white/70'}`}>
              {t === 'overview' ? 'Обзор' : t === 'history' ? 'История' : 'Потратить'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* Earn rate */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-3">КАК ЗАРАБАТЫВАТЬ БАЛЛЫ</p>
              <div className="space-y-2.5">
                {[
                  { icon: '⚡', label: `${currentLevel.name === 'Gold' || currentLevel.name === 'Platinum' ? '2' : '1'} балл за 10 кВт·ч зарядки`, sub: `Уровень ${currentLevel.name}` },
                  { icon: '👥', label: '500 баллов за реферала', sub: 'Пригласите друга' },
                  { icon: '⭐', label: '200 баллов за отзыв', sub: 'После каждой зарядки' },
                  { icon: '🎂', label: '1 000 баллов в день рождения', sub: 'Единоразово' },
                ].map(e => (
                  <div key={e.label} className="flex items-center gap-3">
                    <span className="text-xl w-8 shrink-0 text-center">{e.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{e.label}</p>
                      <p className="text-xs text-slate-400">{e.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Levels */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-3">УРОВНИ ПРОГРАММЫ</p>
              <div className="space-y-3">
                {levels.map((lvl, i) => {
                  const isActive = lvl.name === currentLevel.name;
                  return (
                    <div key={lvl.name} className={`rounded-xl p-3 border transition-all ${isActive ? 'border-amber-300 bg-amber-50' : 'border-slate-100'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{lvl.icon}</span>
                        <span className="text-sm font-bold text-slate-800">{lvl.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {lvl.maxPts === Infinity ? `${lvl.minPts.toLocaleString()}+ баллов` : `${lvl.minPts.toLocaleString()}–${lvl.maxPts.toLocaleString()}`}
                        </span>
                        {isActive && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">ТЕКУЩИЙ</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {lvl.perks.map(p => (
                          <span key={p} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-green-600">+{loyaltyHistory.filter(h => h.amount > 0).reduce((s, h) => s + h.amount, 0).toLocaleString()}</p>
                <p className="text-xs text-green-500">Начислено</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-red-500">{loyaltyHistory.filter(h => h.amount < 0).reduce((s, h) => s + h.amount, 0).toLocaleString()}</p>
                <p className="text-xs text-red-400">Потрачено</p>
              </div>
            </div>
            {loyaltyHistory.map(h => (
              <div key={h.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${h.type === 'earned' ? 'bg-green-100' : 'bg-red-100'}`}>
                  {h.type === 'earned' ? <TrendingUp size={16} className="text-green-600" /> : <Zap size={16} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{h.desc}</p>
                  <p className="text-xs text-slate-400">{h.date}{h.kwh ? ` · ${h.kwh} кВт·ч` : ''}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${h.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {h.amount > 0 ? '+' : ''}{h.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'redeem' && (
          <div className="p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 px-1">НА ЧТО ПОТРАТИТЬ {points.toLocaleString()} БАЛЛОВ</p>
            {[
              { icon: '⚡', title: 'Скидка на зарядку', desc: '200 баллов = 200 сум скидки', cost: 200, color: 'bg-sky-50 border-sky-100' },
              { icon: '📅', title: 'Бесплатное бронирование', desc: '150 баллов = 1 бронирование', cost: 150, color: 'bg-violet-50 border-violet-100' },
              { icon: '🚗', title: 'Приоритетная очередь', desc: '500 баллов = приоритет на 1 день', cost: 500, color: 'bg-amber-50 border-amber-100' },
              { icon: '🎁', title: 'Подарочный сертификат', desc: '2 000 баллов = 10 000 сум', cost: 2000, color: 'bg-green-50 border-green-100' },
              { icon: '💎', title: 'Upgrade до Gold', desc: '3 000 баллов = +1 уровень (разово)', cost: 3000, color: 'bg-pink-50 border-pink-100' },
            ].map(r => (
              <div key={r.title} className={`${r.color} border rounded-2xl p-4 flex items-center gap-3`}>
                <span className="text-2xl shrink-0">{r.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
                </div>
                <button disabled={points < r.cost}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 transition-colors ${points >= r.cost ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                  {r.cost.toLocaleString()} б
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── REFERRAL SCREEN ─────────────────────────────────────────────────────────

function ReferralScreen({ onBack }: { onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = 'ALISHER-7821';
  const invites = [
    { name: 'Bobur M.', status: 'active', reward: 5000, date: '20 авг' },
    { name: 'Nilufar K.', status: 'pending', reward: 0, date: '3 сент' },
    { name: 'Sardor T.', status: 'active', reward: 5000, date: '28 авг' },
  ];
  const totalEarned = invites.filter(i => i.status === 'active').reduce((s, i) => s + i.reward, 0);

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative px-4 pt-4 pb-8">
          <button onClick={onBack} className="flex items-center gap-1 text-white/80 text-sm mb-4">
            <ArrowLeft size={16} />Назад
          </button>
          <div className="text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Gift size={32} className="text-white" />
            </div>
            <h1 className="text-white text-xl font-bold mb-1">Пригласите друга</h1>
            <p className="text-white/70 text-sm">Вы и ваш друг получите по 5 000 сум на баланс</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Приглашено', value: invites.length.toString() },
            { label: 'Активных', value: invites.filter(i => i.status === 'active').length.toString() },
            { label: 'Заработано', value: `${totalEarned.toLocaleString()} сум` },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Referral code */}
        <div className="bg-white rounded-2xl border border-violet-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">ВАШ РЕФЕРАЛЬНЫЙ КОД</p>
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-3">
            <span className="flex-1 text-lg font-bold text-violet-700 font-mono tracking-widest">{code}</span>
            <button onClick={copyCode}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-violet-500 text-white hover:bg-violet-400'}`}>
              {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
              {copied ? 'Скопировано!' : 'Копировать'}
            </button>
          </div>
          <button className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-colors">
            <Share2 size={16} />Поделиться ссылкой
          </button>
        </div>

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">КАК ЭТО РАБОТАЕТ</p>
          <div className="space-y-3">
            {[
              { step: '1', text: 'Поделитесь своим кодом с другом' },
              { step: '2', text: 'Друг регистрируется и вводит ваш код' },
              { step: '3', text: 'Друг совершает первую зарядку на сумму от 10 000 сум' },
              { step: '4', text: 'Вы и друг получаете по 5 000 сум на баланс ONE CHARGE' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-violet-100 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-violet-600">{s.step}</div>
                <p className="text-sm text-slate-700">{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Invite list */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">ПРИГЛАШЁННЫЕ</p>
          </div>
          {invites.map(inv => (
            <div key={inv.name} className="px-4 py-3 flex items-center gap-3 border-b border-slate-50 last:border-none">
              <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center text-sm font-bold text-violet-600">
                {inv.name[0]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{inv.name}</p>
                <p className="text-xs text-slate-400">{inv.date}</p>
              </div>
              {inv.status === 'active' ? (
                <div className="text-right">
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">Активен</span>
                  <p className="text-xs text-green-600 font-semibold mt-0.5">+{inv.reward.toLocaleString()} сум</p>
                </div>
              ) : (
                <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Ожидает зарядки</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING SCREEN ───────────────────────────────────────────────────────

function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  // Step 2 - car
  const [carBrand, setCarBrand] = useState('BYD');
  const [carModel, setCarModel] = useState('');
  const [battery, setBattery] = useState(77);
  const [connector, setConnector] = useState('CCS2');
  // Step 3 - payment
  const [paymentType, setPaymentType] = useState<'humo' | 'uzcard' | null>(null);
  const [cardNum, setCardNum] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cardHolder, setCardHolder] = useState('');

  const onboardBrands = ['BYD', 'Hyundai', 'Kia', 'Tesla', 'Chevrolet', 'Geely', 'Other'];
  const batteryOptions = [40, 60, 77, 82, 100];
  const connectorOptions = ['CCS2', 'Type 2', 'CHAdeMO'];

  const formatCardNum = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };
  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  const steps = [
    // Step 1: Welcome
    <div key="welcome" className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ animation: 'enter-up 0.4s ease both' }}>
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center mb-6 shadow-xl shadow-sky-200">
        <Zap size={44} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2 leading-tight">Добро пожаловать в ONE CHARGE!</h1>
      <p className="text-slate-500 text-sm mb-8 leading-relaxed">Национальная сеть зарядки для электромобилей</p>
      <div className="w-full space-y-3 text-left">
        {[
          { icon: <MapPin size={18} className="text-sky-500" />, text: '108 станций по всему Узбекистану' },
          { icon: <Star size={18} className="text-amber-500" />, text: 'Быстрая оплата через Humo / Uzcard' },
          { icon: <Route size={18} className="text-emerald-500" />, text: 'AI-планировщик маршрутов' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">{item.icon}</div>
            <span className="text-sm font-medium text-slate-700">{item.text}</span>
          </div>
        ))}
      </div>
    </div>,

    // Step 2: Add car
    <div key="car" className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ animation: 'enter-up 0.35s ease both' }}>
      <div className="text-center pb-2">
        <h2 className="text-lg font-bold text-slate-900">Ваш автомобиль</h2>
        <p className="text-sm text-slate-400">Мы подберём подходящие станции и разъёмы</p>
      </div>
      {/* Brand grid */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">МАРКА</p>
        <div className="grid grid-cols-4 gap-2">
          {onboardBrands.map(b => (
            <button key={b} onClick={() => setCarBrand(b)}
              className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${carBrand === b ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
              {b}
            </button>
          ))}
        </div>
      </div>
      {/* Model */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">МОДЕЛЬ</p>
        <input value={carModel} onChange={e => setCarModel(e.target.value)}
          placeholder={`Например: ${carBrand === 'BYD' ? 'Han EV' : carBrand === 'Hyundai' ? 'Ioniq 5' : 'Введите модель'}`}
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 text-slate-800 placeholder:text-slate-300" />
      </div>
      {/* Battery */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">ЁМКОСТЬ БАТАРЕИ</p>
        <div className="flex gap-2">
          {batteryOptions.map(b => (
            <button key={b} onClick={() => setBattery(b)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${battery === b ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-600'}`}>
              {b}<span className="block text-[10px] font-normal opacity-70">кВт·ч</span>
            </button>
          ))}
        </div>
      </div>
      {/* Connector */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">ТИП РАЗЪЁМА</p>
        <div className="flex gap-2">
          {connectorOptions.map(c => (
            <button key={c} onClick={() => setConnector(c)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${connector === c ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-600'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 3: Payment
    <div key="payment" className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ animation: 'enter-up 0.35s ease both' }}>
      <div className="text-center pb-2">
        <h2 className="text-lg font-bold text-slate-900">Способ оплаты</h2>
        <p className="text-sm text-slate-400">Выберите платёжную систему</p>
      </div>
      {/* Card type selection */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { type: 'humo' as const, label: 'Humo', gradient: 'from-orange-400 to-red-500', letter: 'H' },
          { type: 'uzcard' as const, label: 'Uzcard', gradient: 'from-blue-400 to-blue-700', letter: 'U' },
        ].map(card => (
          <button key={card.type} onClick={() => setPaymentType(card.type)}
            className={`relative rounded-2xl p-5 text-white text-left transition-all ${paymentType === card.type ? 'ring-2 ring-sky-500 ring-offset-2' : ''} bg-gradient-to-br ${card.gradient}`}>
            {paymentType === card.type && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <CheckCircle size={14} className="text-sky-500" />
              </div>
            )}
            <div className="w-10 h-7 bg-white/25 rounded-lg flex items-center justify-center mb-3">
              <span className="font-bold text-base">{card.letter}</span>
            </div>
            <p className="font-bold text-base">{card.label}</p>
          </button>
        ))}
      </div>
      {/* Card fields */}
      {paymentType && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3" style={{ animation: 'enter-up 0.3s ease both' }}>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">НОМЕР КАРТЫ</label>
            <input value={cardNum} onChange={e => setCardNum(formatCardNum(e.target.value))}
              placeholder="0000 0000 0000 0000"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 font-mono tracking-wider text-slate-800 placeholder:text-slate-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">СРОК</label>
              <input value={expiry} onChange={e => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 font-mono text-slate-800 placeholder:text-slate-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">ВЛАДЕЛЕЦ</label>
              <input value={cardHolder} onChange={e => setCardHolder(e.target.value.toUpperCase())}
                placeholder="ИМЯ ФАМИЛИЯ"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 text-slate-800 placeholder:text-slate-300 uppercase" />
            </div>
          </div>
        </div>
      )}
    </div>,
  ];

  return (
    <div className="absolute inset-0 bg-white flex flex-col" style={{ zIndex: 9999, fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
        <span className="text-sm font-bold text-sky-500">ONE CHARGE</span>
        {step > 0 && (
          <button onClick={() => onComplete()} className="text-xs text-slate-400 font-medium px-3 py-1.5 rounded-xl hover:bg-slate-100">
            Пропустить
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 py-3 shrink-0">
        {[0, 1, 2].map(i => (
          <div key={i} className={`rounded-full transition-all ${i === step ? 'w-5 h-2.5 bg-sky-500' : i < step ? 'w-2.5 h-2.5 bg-sky-300' : 'w-2.5 h-2.5 bg-slate-200'}`} />
        ))}
      </div>

      {/* Step content */}
      {steps[step]}

      {/* Bottom button */}
      <div className="px-4 pb-8 pt-3 shrink-0 space-y-2">
        <button
          onClick={() => { if (step < 2) setStep(s => s + 1); else onComplete(); }}
          className="w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl py-4 font-bold text-base shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2">
          {step === 2 ? <><CheckCircle size={18} />Готово — начать</> : 'Далее →'}
        </button>
        {step === 1 && (
          <button onClick={() => setStep(2)} className="w-full text-slate-400 text-sm font-medium py-2">
            Добавить позже
          </button>
        )}
      </div>
    </div>
  );
}

// ─── CARDS SCREEN ────────────────────────────────────────────────────────────

type SavedCard = {
  id: string;
  type: 'humo' | 'uzcard' | 'visa' | 'mastercard';
  last4: string;
  holder: string;
  expiry: string;
  isPrimary: boolean;
};

function detectCardType(num: string): 'humo' | 'uzcard' | 'visa' | 'mastercard' | null {
  const raw = num.replace(/\s/g, '');
  if (raw.startsWith('9860')) return 'humo';
  if (raw.startsWith('8600')) return 'uzcard';
  if (raw.startsWith('4')) return 'visa';
  if (raw.startsWith('5')) return 'mastercard';
  return null;
}

function CardsScreen({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState<SavedCard[]>([
    { id: 'c1', type: 'humo', last4: '4521', holder: 'Alisher Toshmatov', expiry: '12/27', isPrimary: true },
    { id: 'c2', type: 'uzcard', last4: '8834', holder: 'Alisher Toshmatov', expiry: '08/26', isPrimary: false },
  ]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNum, setNewNum] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newCvc, setNewCvc] = useState('');
  const [newHolder, setNewHolder] = useState('');
  const [showCvc, setShowCvc] = useState(false);

  const formatCardNum = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 16);
    return d.replace(/(\d{4})(?=\d)/g, '$1 ');
  };
  const formatExpiry = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) return d.slice(0, 2) + '/' + d.slice(2);
    return d;
  };

  const cardGradient: Record<string, string> = {
    humo: 'from-orange-400 to-orange-600',
    uzcard: 'from-blue-500 to-blue-700',
    visa: 'from-slate-700 to-slate-900',
    mastercard: 'from-red-500 to-orange-600',
  };
  const cardLetterBg: Record<string, string> = { humo: 'H', uzcard: 'U', visa: 'V', mastercard: 'M' };

  const makePrimary = (id: string) => {
    setCards(cs => cs.map(c => ({ ...c, isPrimary: c.id === id })));
    setExpanded(null);
  };
  const deleteCard = (id: string) => {
    setCards(cs => cs.filter(c => c.id !== id));
    setDeleteTarget(null);
    setExpanded(null);
  };
  const addCard = () => {
    const raw = newNum.replace(/\s/g, '');
    if (raw.length < 16 || !newExpiry || !newHolder) return;
    const type = detectCardType(raw) || 'visa';
    const newCard: SavedCard = {
      id: 'c' + Date.now(),
      type, last4: raw.slice(-4), holder: newHolder, expiry: newExpiry, isPrimary: cards.length === 0,
    };
    setCards(cs => [...cs, newCard]);
    setNewNum(''); setNewExpiry(''); setNewCvc(''); setNewHolder('');
    setShowAddForm(false);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="flex-1 text-base font-bold text-slate-900">Мои карты</h1>
        <button onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white rounded-xl text-xs font-semibold active:scale-95 transition-all">
          <Plus size={13} />Добавить
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Saved cards */}
        {cards.map(card => (
          <div key={card.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setExpanded(expanded === card.id ? null : card.id)}
              className="w-full p-4 flex items-center gap-3">
              {/* Mini card visual */}
              <div className={`w-12 h-8 rounded-xl bg-gradient-to-r ${cardGradient[card.type]} flex items-center justify-center shrink-0 shadow-sm`}>
                <span className="text-white text-sm font-bold">{cardLetterBg[card.type]}</span>
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 capitalize">{card.type} •••• {card.last4}</p>
                  {card.isPrimary && (
                    <span className="text-[10px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full font-semibold">Основная</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{card.holder} · {card.expiry}</p>
              </div>
              <ChevronRight size={16} className={`text-slate-400 transition-transform ${expanded === card.id ? 'rotate-90' : ''}`} />
            </button>

            {expanded === card.id && (
              <div className="border-t border-slate-50 px-4 pb-4 pt-3 space-y-2" style={{ animation: 'enter-up 0.2s ease both' }}>
                {!card.isPrimary && (
                  <button onClick={() => makePrimary(card.id)}
                    className="w-full py-2.5 bg-sky-50 text-sky-600 rounded-xl text-sm font-semibold border border-sky-100 hover:bg-sky-100 active:scale-95 transition-all">
                    Сделать основной
                  </button>
                )}
                <button onClick={() => setDeleteTarget(card.id)}
                  className="w-full py-2.5 bg-red-50 text-red-500 rounded-xl text-sm font-semibold border border-red-100 hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-2">
                  <Trash2 size={14} />Удалить карту
                </button>
              </div>
            )}
          </div>
        ))}

        {cards.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <div className="text-4xl mb-3">💳</div>
            <p className="text-sm font-medium">Нет сохранённых карт</p>
          </div>
        )}

        {/* Add card form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3" style={{ animation: 'enter-up 0.3s ease both', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p className="text-sm font-semibold text-slate-700">Добавить карту</p>
            {/* Card number with type detection */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Номер карты</label>
              <div className="relative">
                <input value={newNum} onChange={e => setNewNum(formatCardNum(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 font-mono tracking-wider pr-16 text-slate-800 placeholder:text-slate-300" />
                {detectCardType(newNum) && (
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold px-1.5 py-0.5 rounded text-white bg-gradient-to-r ${cardGradient[detectCardType(newNum)!]}`}>
                    {cardLetterBg[detectCardType(newNum)!]}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Срок действия</label>
                <input value={newExpiry} onChange={e => setNewExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 font-mono text-slate-800 placeholder:text-slate-300" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">CVC</label>
                <div className="relative">
                  <input value={newCvc} onChange={e => setNewCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    type={showCvc ? 'text' : 'password'}
                    placeholder="•••"
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 pr-9 outline-none focus:border-sky-400 font-mono text-slate-800 placeholder:text-slate-300" />
                  <button onClick={() => setShowCvc(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-0.5">
                    <Lock size={13} />
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Имя владельца</label>
              <input value={newHolder} onChange={e => setNewHolder(e.target.value.toUpperCase())}
                placeholder="ИМЯ ФАМИЛИЯ"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 uppercase text-slate-800 placeholder:text-slate-300" />
            </div>
            <button onClick={addCard}
              disabled={newNum.replace(/\s/g, '').length < 16 || !newExpiry || !newHolder}
              className="w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl py-3.5 font-bold text-sm disabled:opacity-40 active:scale-95 transition-all">
              Добавить карту
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="absolute inset-0 z-50 bg-black/40 flex items-end" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          <div className="w-full bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3" style={{ animation: 'enter-up 0.25s ease both' }}>
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex flex-col items-center text-center pb-2">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-3">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <p className="text-base font-bold text-slate-900 mb-1">Удалить карту?</p>
              <p className="text-sm text-slate-500">Это действие нельзя отменить. Карта будет удалена из вашего профиля.</p>
            </div>
            <button onClick={() => deleteCard(deleteTarget)}
              className="w-full py-3.5 bg-red-500 text-white rounded-2xl font-bold text-sm hover:bg-red-600 active:scale-95 transition-all">
              Удалить
            </button>
            <button onClick={() => setDeleteTarget(null)}
              className="w-full py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-semibold text-sm active:scale-95 transition-all">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'map', label: 'Карта', icon: <MapPin size={20} /> },
  { id: 'trips', label: 'Поездки', icon: <Route size={20} /> },
  { id: 'charging', label: 'Зарядка', icon: <Zap size={20} /> },
  { id: 'history', label: 'История', icon: <History size={20} /> },
  { id: 'profile', label: 'Профиль', icon: <User size={20} /> },
];

interface Toast { id: string; icon: string; title: string; body: string; color: string; }

function PushToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4500); return () => clearTimeout(t); }, []);
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl cursor-pointer active:scale-98 transition-transform"
      onClick={onDismiss}
      style={{ background: 'rgba(15,23,42,0.94)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', animation: 'toast-in 0.4s cubic-bezier(0.16,1,0.3,1) both', minWidth: 280 }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
        style={{ background: toast.color + '22', border: `1px solid ${toast.color}40` }}>
        {toast.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-tight">{toast.title}</p>
        <p className="text-white/55 text-xs mt-0.5 leading-snug">{toast.body}</p>
      </div>
      <button className="text-white/30 hover:text-white/60 text-lg leading-none mt-0.5 shrink-0">×</button>
    </div>
  );
}

export default function DriverApp() {
  const { actions, sessions: portalSessions, state, refresh } = useSync();
  const driverAccount = portalSessions.driver;
  // The session this driver currently has running, as the server sees it.
  const liveSession = state?.sessions.find(
    s => s.status === 'active' && s.userId === driverAccount?.id,
  ) ?? null;

  const [lastSummary, setLastSummary] = useState<{ energy: number; cost: number; minutes: number } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('map');
  const [screen, setScreen] = useState<Screen>('map');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pushToast = (t: Omit<Toast, 'id'>) =>
    setToasts(p => [...p, { ...t, id: Date.now().toString() }]);

  /**
   * Starts a real session on the server so every other portal sees it. Falls
   * through to the local screen either way — a demo shouldn't dead-end on a
   * connector someone else grabbed first.
   */
  const startCharging = async () => {
    const station = selectedStation;
    const connector =
      station?.connectors.find(c => c.status === 'available') ?? station?.connectors[0];

    if (station && connector && driverAccount) {
      try {
        await actions.startSession('driver', station.id, connector.id);
        await refresh();
      } catch (err) {
        pushToast({
          icon: '⚠️',
          title: 'Не удалось начать зарядку',
          body: err instanceof Error ? err.message : 'Попробуйте другой коннектор',
          color: '#F59E0B',
        });
      }
    }
    setScreen('charging-active');
  };

  const stopCharging = async () => {
    if (liveSession) {
      try {
        const { session } = await actions.stopSession('driver', liveSession.id);
        setLastSummary({
          energy: session.energy,
          cost: session.cost,
          minutes: Math.max(
            1,
            Math.round(
              (new Date(session.end ?? Date.now()).getTime() - new Date(session.start).getTime()) / 60000,
            ),
          ),
        });
        await refresh();
      } catch {
        /* already stopped elsewhere — the done screen is still correct */
      }
    }
    setScreen('charging-done');
  };
  const dismissToast = (id: string) =>
    setToasts(p => p.filter(t => t.id !== id));

  // Demo toasts after onboarding completes
  useEffect(() => {
    if (showOnboarding) return;
    const demos: [number, Omit<Toast, 'id'>][] = [
      [3000, { icon: '⚡', title: 'Зарядка доступна', body: 'GreenCharge Toshkent · EVSE-2 свободен · 150 кВт', color: '#22C55E' }],
      [8000, { icon: '🔋', title: 'Заряд 80%', body: 'BYD Han EV · Рекомендуем отключить', color: '#0EA5E9' }],
      [14000, { icon: '💳', title: 'Оплата прошла', body: '184 000 сум · Humo ••4521', color: '#8B5CF6' }],
      [20000, { icon: '📍', title: 'Станция рядом', body: 'EcoVolt Yunusobod · 0.4 км от вас', color: '#F59E0B' }],
    ];
    demos.forEach(([delay, t]) => {
      const timer = setTimeout(() => pushToast(t), delay);
      toastTimers.current.push(timer);
    });
    return () => toastTimers.current.forEach(clearTimeout);
  }, [showOnboarding]);

  const handleSelectStation = (s: Station) => {
    setSelectedStation(s);
    setScreen('station');
  };

  const handleBack = () => {
    setScreen('map');
    setSelectedStation(null);
  };

  const renderContent = () => {
    if (screen === 'cards') return <CardsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'charging-start') return <ChargingStartScreen station={selectedStation} onBack={() => setScreen('station')} onConfirm={startCharging} onOpenQR={() => setScreen('qr-scan')} />;
    if (screen === 'charging-active') return <ChargingActiveScreen station={selectedStation} onStop={stopCharging} />;
    if (screen === 'charging-done') return <ChargingDoneScreen station={selectedStation} onClose={handleBack} summary={lastSummary} />;
    if (screen === 'trip') return <TripPlannerScreen onBack={() => setScreen('map')} />;
    if (screen === 'booking') return <BookingScreen station={selectedStation} onBack={() => setScreen('station')} onConfirm={() => setScreen('booking-done')} />;
    if (screen === 'booking-done') return <BookingDoneScreen station={selectedStation} onClose={handleBack} />;
    if (screen === 'add-car') return <AddCarScreen onBack={() => setScreen('map')} onSave={() => setScreen('map')} />;
    if (screen === 'notifications') return <NotificationsScreen onBack={() => setScreen('map')} />;
    if (screen === 'reviews') return <ReviewsScreen station={selectedStation} onBack={() => setScreen('station')} />;
    if (screen === 'report') return <ReportScreen station={selectedStation} onBack={() => setScreen('station')} />;
    if (screen === 'favorites') return <FavoritesScreen onBack={() => setScreen('map')} onSelectStation={s => { setSelectedStation(s); setScreen('station'); }} />;
    if (screen === 'qr-scan') return <QRScanScreen onBack={() => setScreen(selectedStation ? 'station' : 'map')} onStartCharging={s => { setSelectedStation(s); setScreen('charging-start'); }} />;
    if (screen === 'loyalty') return <LoyaltyScreen onBack={() => setScreen('profile')} />;
    if (screen === 'referral') return <ReferralScreen onBack={() => setScreen('profile')} />;
    if (screen === 'app-settings') return <AppSettingsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'wallet') return <WalletScreen onBack={() => setScreen('profile')} />;
    if (screen === 'security') return <SecurityScreen onBack={() => setScreen('profile')} />;
    if (screen === 'support') return <SupportScreen onBack={() => setScreen('profile')} />;

    if (activeTab === 'history') return <HistoryScreen />;
    if (activeTab === 'profile') return <ProfileScreen onNavigate={setScreen} />;
    if (activeTab === 'trips') return <TripPlannerScreen onBack={() => setActiveTab('map')} />;
    if (activeTab === 'charging') return <ChargingHubScreen onNavigate={(s) => { setScreen(s as Screen); setActiveTab('map'); }} />;

    return (
      <div className="relative w-full h-full">
        <UzbekistanMap onSelectStation={handleSelectStation} />
        {/* QR scan FAB */}
        {screen === 'map' && (
          <button onClick={() => setScreen('qr-scan')}
            className="absolute bottom-4 right-4 z-20 flex items-center gap-2 pl-3 pr-4 py-3 rounded-2xl font-semibold text-sm text-white active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#0EA5E9,#0284C7)', boxShadow: '0 6px 20px rgba(14,165,233,0.45)' }}>
            <Scan size={17} />
            QR
          </button>
        )}
        {screen === 'station' && selectedStation && (
          <StationDetailSheet station={selectedStation} onClose={handleBack} onStartCharging={() => setScreen('charging-start')} onBook={() => setScreen('booking')} onReviews={() => setScreen('reviews')} onReport={() => setScreen('report')} />
        )}
      </div>
    );
  };

  const showTabs = !['charging-start', 'charging-active', 'charging-done', 'trip', 'booking', 'booking-done', 'add-car', 'notifications', 'reviews', 'report', 'favorites', 'qr-scan', 'cards', 'app-settings', 'wallet', 'security', 'support'].includes(screen);

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {showOnboarding && <OnboardingScreen onComplete={() => setShowOnboarding(false)} />}
      {/* Status bar */}
      <div className="bg-white px-4 pt-2 pb-1 flex items-center justify-between shrink-0 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-800 mono">09:41</span>
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5 items-end">
            {[3, 4, 5, 6].map(h => <div key={h} className={`w-0.5 rounded-sm ${h <= 4 ? 'bg-slate-400' : 'bg-slate-800'}`} style={{ height: `${h * 2}px` }} />)}
          </div>
          <Battery size={14} className="text-slate-800 ml-1" />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>

      {/* Push notification toasts */}
      {toasts.length > 0 && (
        <div className="absolute top-14 left-3 right-3 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <PushToast toast={t} onDismiss={() => dismissToast(t.id)} />
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      {showTabs && (
        <div className="bg-white border-t border-slate-100 px-2 py-2 flex items-center justify-around shrink-0">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id && !['station'].includes(screen);
            const isCharging = tab.id === 'charging';
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setScreen('map'); setSelectedStation(null); }}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${isActive ? 'text-sky-500' : 'text-slate-400'}`}>
                {isCharging && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 items-center justify-center">
                      <span className="text-white" style={{ fontSize: 7, fontWeight: 700 }}>⚡</span>
                    </span>
                  </span>
                )}
                {tab.icon}
                <span className="text-xs">{tab.label}</span>
                {isActive && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-sky-500 rounded-full" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

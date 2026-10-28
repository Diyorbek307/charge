import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  MapPin, Navigation, Search, Filter, Zap, Clock, Star, ChevronRight, Home,
  X, Battery, BatteryCharging, Scan, History,
  User, Car, ArrowLeft, CheckCircle,
  Heart, Route, Bell, Settings, Lock, LogOut, ChevronDown, Plus,
  Wifi, Coffee, ParkingCircle, Toilet, CalendarCheck, Minus,
  AlertTriangle, Send, ThumbsUp, Flag, Trash2, StarIcon, Download, Phone,
  Gift, Trophy, Share2, Copy, TrendingUp, Award, Sparkles, Wallet, ArrowDownCircle,
  Smartphone, Monitor, Building2, Moon,
  ScanFace,
} from 'lucide-react';
import { Station } from '../data/mockData';
import { useLiveStations } from '../lib/live';
import { plural } from '../lib/analytics';
import DriverMap from './DriverMap';
import { useSync } from '../lib/sync';
import EcoScreen, { GreenHourBanner } from './EcoScreen';
import PushToggle from './PushToggle';
import { BRAND } from '../brand';
import { ChargingActiveScreen, ChargingDoneScreen } from './driver/Charging';
import HistoryScreen from './driver/History';
import ChargingHubScreen from './driver/Hub';
import TripPlannerScreen from './driver/Trip';
import { ProfileScreen, SecurityScreen, NotificationsScreen } from './driver/Account';
import { useFavorites } from './driver/favorites';
import { StationForecastBlock, StationCommunityBlock } from './driver/StationExtras';
import { FinanceScreen, LoyaltyScreen, FamilyScreen, HostScreen, SosSheet } from './driver/Extras';
import { CreditScreen, FaceCheck } from './driver/Credit';
import type { Payer } from '../lib/api';
import { useMyLocation, km, fmtKm, driveMinutes, routeLinks } from '../lib/geo';
import { inTelegram, telegramInitData } from '../lib/telegram';
import type { Booking, Session, PaymentOrder } from '../lib/api';
import AuthFlow from './AuthFlow';

type Screen = 'map' | 'station' | 'charging-start' | 'charging-active' | 'charging-done' | 'history' | 'profile' | 'trip' | 'booking' | 'booking-done' | 'add-car' | 'notifications' | 'reviews' | 'report' | 'favorites' | 'qr-scan' | 'onboarding' | 'app-settings' | 'finance' | 'loyalty' | 'family' | 'host' | 'wallet' | 'security' | 'support' | 'eco' | 'credit';
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

function StationDetailSheet({ station, onClose, onStartCharging, onBook, onReviews, onReport }: { station: Station; onClose: () => void; onStartCharging: () => void; onBook: () => void; onReviews: () => void; onReport: () => void }) {
  const free = station.connectors.filter(c => c.status === 'available').length;
  const { state, actions, sessions: portalSessions, refresh } = useSync();
  const me = portalSessions.driver;
  const favorites = useFavorites();
  const favorite = favorites.has(station.id);
  const here = useMyLocation();
  const dist = here ? km(here, { lat: station.geoLat, lng: station.geoLng }) : null;
  const route = routeLinks({ lat: station.geoLat, lng: station.geoLng });
  const queue = (state?.queues ?? []).filter(q => q.stationId === station.id);
  const myIndex = queue.findIndex(q => q.userId === me?.id);
  const myTurn = myIndex >= 0 && queue[myIndex].notified;
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const toggleQueue = async () => {
    setQueueBusy(true);
    setQueueError(null);
    try {
      if (myIndex >= 0) await actions.leaveQueue('driver', station.id);
      else await actions.joinQueue('driver', station.id);
      await refresh();
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Не удалось изменить очередь');
    } finally {
      setQueueBusy(false);
    }
  };

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
              {dist !== null && <span className="text-xs text-slate-400">{`· ${fmtKm(dist)} · ~${driveMinutes(dist)} мин`}</span>}
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
            <p className="text-sm font-bold text-slate-800">⭐ {station.rating.toFixed(1)}</p>
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

        <StationForecastBlock stationId={station.id} connectors={station.connectors} />
        <StationCommunityBlock stationId={station.id} />

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
          {free === 0 && !myTurn ? (
            <button onClick={toggleQueue} disabled={queueBusy}
              className={`${myIndex >= 0 ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-violet-500 hover:bg-violet-600 text-white'} rounded-xl py-3 font-semibold text-sm transition-colors flex flex-col items-center justify-center leading-tight disabled:opacity-60`}>
              <span>{myIndex >= 0 ? `Вы №${myIndex + 1} · выйти` : 'Встать в очередь'}</span>
              <span className="text-[10px] font-normal opacity-80">{queue.length} в очереди</span>
            </button>
          ) : (
            <button onClick={onStartCharging}
              className={`${myTurn ? 'bg-green-500 hover:bg-green-600 animate-pulse' : 'bg-sky-500 hover:bg-sky-600'} text-white rounded-xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2`}>
              <Scan size={16} />{myTurn ? 'Ваша очередь — начать' : 'Начать зарядку'}
            </button>
          )}
          <button onClick={onBook}
            className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <CalendarCheck size={16} />Забронировать
          </button>
        </div>
        <GreenHourBanner />
        {queueError && (
          <p role="alert" className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{queueError}</p>
        )}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <a href={route.yandex} target="_blank" rel="noopener noreferrer" className="bg-slate-900 text-white rounded-xl py-2.5 font-semibold text-sm flex items-center justify-center gap-1.5">
            <Navigation size={14} />Маршрут · Яндекс
          </a>
          <a href={route.google} target="_blank" rel="noopener noreferrer" className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 font-medium text-sm flex items-center justify-center gap-1.5">
            <Navigation size={14} />Google Maps
          </a>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => favorites.toggle(station.id)} aria-pressed={favorite} className={`rounded-xl py-2 font-medium text-sm transition-colors flex items-center justify-center gap-1.5 ${favorite ? 'bg-red-50 text-red-500' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
            <Heart size={13} className={favorite ? 'fill-red-500' : ''} />{favorite ? 'В избранном' : 'Избранное'}
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

function ChargingStartScreen({ station, onBack, onConfirm, onOpenQR }: { station: Station | null; onBack: () => void; onConfirm: (connectorId: string | null, payer: Payer, faceToken?: string) => void; onOpenQR?: () => void }) {
  const { state, sessions: portalSessions } = useSync();
  const me = portalSessions.driver;
  const balance = (me && state?.wallets[me.id]?.balance) ?? 0;
  const employer = state?.employer ?? null;
  const familyWallets = (state?.family?.payers ?? []).filter(p => p.status === 'active');
  const credit = state?.credit?.enrolled ? state.credit : null;
  const [payer, setPayer] = useState<Payer>(employer && employer.left > 0 ? 'company' : 'self');
  const [faceCheck, setFaceCheck] = useState(false);
  const [launchMode, setLaunchMode] = useState<'qr' | 'remote'>('qr');
  const [selectedConnector, setSelectedConnector] = useState(station?.connectors.find(c => c.status === 'available') || station?.connectors[0] || null);
  const [targetPct, setTargetPct] = useState(80);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  // The driver's own car when the account has one, otherwise a typical arrival charge.
  const currentBattery = state?.vehicles.find(v => v.driverId === me?.id)?.battery ?? 34;
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
          <div className="space-y-2" role="radiogroup" aria-label="Кто платит">
            <button
              role="radio"
              aria-checked={payer === 'self'}
              onClick={() => setPayer('self')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${payer === 'self' ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center"><Wallet size={16} /></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">Мой кошелёк</p>
                <p className="text-xs text-slate-400">{`Баланс ${balance.toLocaleString('ru-RU')} сум · пополнение через Payme или Click`}</p>
              </div>
            </button>
            {employer && (
              <button
                role="radio"
                aria-checked={payer === 'company'}
                onClick={() => setPayer('company')}
                disabled={employer.left <= 0}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50 ${payer === 'company' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><Building2 size={16} /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{`За счёт компании · ${employer.org}`}</p>
                  <p className="text-xs text-slate-400">{employer.left > 0 ? `Осталось ${employer.left.toLocaleString('ru-RU')} из ${employer.limit.toLocaleString('ru-RU')} сум в этом месяце` : 'Лимит на этот месяц исчерпан'}</p>
                </div>
              </button>
            )}
            {familyWallets.map(f => (
              <button
                key={f.ownerId}
                role="radio"
                aria-checked={payer === `family:${f.ownerId}`}
                onClick={() => setPayer(`family:${f.ownerId}`)}
                disabled={f.left <= 0}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50 ${payer === `family:${f.ownerId}` ? 'border-violet-500 bg-violet-50' : 'border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center"><Heart size={16} /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{`Семейный кошелёк · ${f.name}`}</p>
                  <p className="text-xs text-slate-400">{f.left > 0 ? `Осталось ${f.left.toLocaleString('ru-RU')} из ${f.limit.toLocaleString('ru-RU')} сум в этом месяце` : 'Лимит на этот месяц исчерпан'}</p>
                </div>
              </button>
            ))}
            {credit && (
              <button
                role="radio"
                aria-checked={payer === 'credit'}
                onClick={() => setPayer('credit')}
                disabled={credit.available <= 0}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50 ${payer === 'credit' ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-[#111] text-[#FFC83D] flex items-center justify-center"><ScanFace size={16} /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">В долг · подтверждение лицом</p>
                  <p className="text-xs text-slate-400">
                    {credit.overdue ? 'Есть просроченный долг — сначала погасите его' : credit.available > 0 ? `Доступно ${credit.available.toLocaleString('ru-RU')} сум · оплатить за ${credit.days} дней` : 'Лимит исчерпан'}
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 pt-2">
        <button onClick={() => (payer === 'credit' ? setFaceCheck(true) : onConfirm(selectedConnector?.id ?? null, payer))}
          disabled={launchMode === 'qr' && !scanned}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${launchMode === 'qr' && !scanned ? 'bg-slate-200 text-slate-400' : 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-sm'}`}>
          <Zap size={18} />Подтвердить и начать зарядку
        </button>
      </div>
      {faceCheck && (
        <FaceCheck
          onClose={() => setFaceCheck(false)}
          onVerified={token => {
            setFaceCheck(false);
            onConfirm(selectedConnector?.id ?? null, 'credit', token);
          }}
        />
      )}
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
  const { actions, refresh, state, sessions: portalSessions } = useSync();
  const driverId = portalSessions.driver?.id;
  // Balance is owned by the server so a top-up shows up in every portal.
  const balance = (driverId && state?.wallets?.[driverId]?.balance) ?? 0;
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [provider, setProvider] = useState<'payme' | 'click'>('payme');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);

  const quickAmounts = [10000, 20000, 50000, 100000];
  const providers = [
    { id: 'payme' as const, name: 'Payme', letter: 'P', color: '#00B3B3' },
    { id: 'click' as const, name: 'Click', letter: 'C', color: '#0073FF' },
  ];

  // Money in: paid top-ups. Money out: charges paid from the wallet, refunds back in.
  useEffect(() => {
    actions.listPayments('driver').then(setOrders).catch(() => setOrders([]));
  }, [actions, balance]);
  const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  const transactions = [
    ...orders.filter(o => o.status === 'paid').map(o => ({ id: o.id, type: 'topup', amount: o.amount, label: `Пополнение — ${o.provider === 'payme' ? 'Payme' : 'Click'}`, at: o.paidAt ?? o.created })),
    ...(state?.transactions ?? [])
      .filter(t => t.userId === driverId && t.method === 'Кошелёк')
      .map(t => {
        const ses = state?.sessions.find(x => x.id === t.sessionId);
        const refunded = t.status === 'refunded';
        return { id: t.id, type: refunded ? 'topup' : 'charge', amount: refunded ? t.amount : -t.amount, label: `${refunded ? 'Возврат' : 'Зарядка'} — ${ses?.stationName ?? t.sessionId}`, at: t.time };
      }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30)
    .map(x => ({ ...x, date: fmt(x.at) }));

  /**
   * The wallet is credited only once the provider confirms the payment. With
   * a merchant account that happens on the provider's checkout page; until
   * one exists, the sandbox runs the same confirmation path server-side.
   */
  const doTopUp = async () => {
    const amt = selectedAmount || parseInt(customAmount) || 0;
    if (amt < 5000) return;
    setPaying(true);
    setPayError(null);
    try {
      const { order, checkoutUrl, sandbox } = await actions.createTopUpOrder('driver', provider, amt);
      if (!sandbox) {
        window.location.href = checkoutUrl;
        return;
      }
      await actions.sandboxConfirm('driver', order.id);
      await refresh();
      setTopUpSuccess(true);
      setTimeout(() => {
        setShowTopUp(false);
        setTopUpSuccess(false);
        setSelectedAmount(null);
        setCustomAmount('');
      }, 2000);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Оплата не прошла');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-900">Мой кошелёк</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Balance card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-5 text-white shadow-xl">
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-1">БАЛАНС Zaryad24</p>
          <p className="text-3xl font-bold tracking-tight mb-3">{balance.toLocaleString()} сум</p>
          <p className="text-xs text-slate-400 mb-4">Пополнение через Payme или Click · списывается за каждую зарядку по счётчику</p>
          <div className="flex gap-2">
            <button onClick={() => setShowTopUp(true)}
              className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 rounded-2xl text-sm font-semibold transition-colors active:scale-95">
              Пополнить
            </button>

          </div>
        </div>

        {/* Transaction history */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">ИСТОРИЯ ОПЕРАЦИЙ</p>
          </div>
          <div className="divide-y divide-slate-50">
            {transactions.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Операций пока нет</p>}
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

                {/* Payment provider */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500">СПОСОБ ОПЛАТЫ</p>
                  <div className="grid grid-cols-2 gap-2">
                    {providers.map(p => (
                      <button key={p.id} onClick={() => setProvider(p.id)} aria-pressed={provider === p.id}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-colors ${provider === p.id ? 'border-sky-400 bg-sky-50 text-slate-900' : 'border-slate-100 bg-white text-slate-500'}`}>
                        <span className="w-6 h-6 rounded-lg grid place-items-center text-white text-xs" style={{ background: p.color }}>{p.letter}</span>
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">Кошелёк пополнится после подтверждения платежа от {provider === 'payme' ? 'Payme' : 'Click'}</p>
                </div>

                {payError && (
                  <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{payError}</p>
                )}

                <button
                  onClick={doTopUp}
                  disabled={paying || !(selectedAmount || (parseInt(customAmount) >= 5000))}
                  className="w-full py-3.5 bg-sky-500 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-all">
                  {paying ? 'Подтверждаем оплату…' : `Оплатить через ${provider === 'payme' ? 'Payme' : 'Click'}`}{!paying && (selectedAmount ? ` ${selectedAmount.toLocaleString()} сум` : customAmount ? ` ${parseInt(customAmount).toLocaleString()} сум` : '')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SupportScreen({ onBack, onReport }: { onBack: () => void; onReport: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const faqs = [
    { q: 'Как начать зарядку?', a: 'Найдите станцию на карте или отсканируйте QR-код на ней → «Начать зарядку» → выберите разъём и способ оплаты → подтвердите. Подключите кабель к машине — зарядка начнётся, когда станция её подтвердит.' },
    { q: 'Почему зарядка не началась?', a: 'Частые причины: разъём занят или забронирован, на кошельке меньше чем на 5 кВт·ч, исчерпан лимит компании. Текст ошибки на экране подскажет, что именно. Если станция неисправна — сообщите о проблеме, оператор получит оповещение сразу.' },
    { q: 'Как пополнить кошелёк?', a: 'Профиль → Кошелёк → Пополнить через Payme или Click. Деньги зачисляются, когда платёжная система подтвердит оплату. Данные карт мы не храним — их обрабатывают Payme и Click.' },
    { q: 'Сколько стоит зарядка?', a: 'Цену за кВт·ч задаёт оператор станции, она видна на карточке разъёма. Ночью (23:00–07:00) — ×0.7, днём (10:00–17:00) — ×0.9, вечером в пик (17:00–22:00) — ×1.25. Тариф фиксируется в момент старта, оплата — по фактической энергии.' },
    { q: 'Как работает бронь?', a: `Бронь держит разъём за вами 15 минут после назначенного времени и стоит ${(2000).toLocaleString('ru-RU')} сум. Если отменить до начала окна — плата возвращается на кошелёк.` },
    { q: 'Я сотрудник компании-клиента. Как заряжаться за счёт компании?', a: 'Если ваш номер привязан к автопарку компании, при старте зарядки появится вариант «За счёт компании» и остаток вашего месячного лимита. Лимит меняет менеджер автопарка.' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Поддержка</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <button onClick={onReport} className="w-full bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3 text-left">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle size={18} className="text-amber-600" /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">Проблема на станции</p>
            <p className="text-xs text-slate-500">Сообщение сразу уходит оператору станции</p>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <p className="text-xs font-semibold text-slate-400 tracking-widest px-1 pt-1">ЧАСТЫЕ ВОПРОСЫ</p>
        {faqs.map((faq, i) => (
          <div key={faq.q} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} className="w-full px-4 py-3.5 flex items-center justify-between text-left">
              <span className="text-sm font-medium text-slate-800 flex-1 pr-2">{faq.q}</span>
              <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
            </button>
            {openFaq === i && <p className="px-4 pb-4 text-sm text-slate-500 leading-relaxed">{faq.a}</p>}
          </div>
        ))}

        <a href={`mailto:${BRAND.email}`} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center shrink-0"><Send size={17} className="text-sky-600" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{BRAND.email}</p>
            <p className="text-xs text-slate-400">Напишите нам — укажите номер телефона и, если есть, номер зарядки из чека</p>
          </div>
        </a>
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

function AddCarScreen({ onBack, onSave }: { onBack: () => void; onSave: (car: { brand: string; model: string; year: number; battery: number; port: string; maxKw: number; chargeLimit: number }) => void }) {
  // Editing starts from the car already saved, if there is one.
  const saved = useSync().sessions.driver?.car;
  const [brand, setBrand] = useState(saved?.brand ?? 'BYD');
  const [model, setModel] = useState(saved?.model ?? 'Han EV');
  const [year, setYear] = useState(saved?.year ?? 2024);
  const [battery, setBattery] = useState(saved?.battery ?? 85);
  const [port, setPort] = useState(saved?.port.replace(/^Type (\d)$/, 'Type$1') ?? 'CCS2');
  const [maxKw, setMaxKw] = useState(saved?.maxKw ?? 150);
  const [chargeLimit, setChargeLimit] = useState(saved?.chargeLimit ?? 80);
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
              <Zap size={12} />Совместимость с сетью Zaryad24
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
                <span className="text-sky-700">108 станций в сети Zaryad24 · 276 EVSE</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-8 pt-2">
          <button onClick={() => onSave({ brand, model, year, battery, port, maxKw, chargeLimit })}
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
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ЛИМИТ ЗАРЯДА</p>
            <span className="text-sm font-bold text-slate-900 mono">{chargeLimit}%</span>
          </div>
          <input type="range" min="50" max="100" step="5" value={chargeLimit} onChange={e => setChargeLimit(Number(e.target.value))} aria-label="Лимит заряда, %" className="w-full accent-sky-500" />
          <p className="text-xs text-slate-400 mt-1">{`Запас хода при ${chargeLimit}% ≈ ${Math.round((battery * chargeLimit) / 100 / 0.18)} км. До 80% быстрее и бережнее для батареи.`}</p>
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

function ReviewsScreen({ station, onBack }: { station: Station | null; onBack: () => void }) {
  const { state, sessions: portalSessions } = useSync();
  const me = portalSessions.driver;
  const mine = (state?.sessions ?? []).filter(x => x.userId === me?.id && x.stationId === station?.id && x.status === 'completed');
  const rated = mine.filter(x => x.rating);
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Оценки станции</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
          <p className="text-4xl font-bold text-slate-900 tabular-nums">{station ? station.rating.toFixed(1) : '—'}</p>
          <p className="text-amber-400 text-lg">{'★★★★★'.slice(0, Math.round(station?.rating ?? 0))}<span className="text-slate-200">{'★★★★★'.slice(Math.round(station?.rating ?? 0))}</span></p>
          <p className="text-xs text-slate-400 mt-1">{`${station?.reviews ?? 0} оценок водителей после зарядки`}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-sm font-semibold text-slate-800 mb-1">Ваши оценки</p>
          {mine.length === 0 ? (
            <p className="text-sm text-slate-500">Оценить станцию можно после зарядки на ней — на экране чека или в истории.</p>
          ) : (
            <p className="text-sm text-slate-500">{`Зарядок здесь: ${mine.length}, оценено: ${rated.length}. Неоценённые зарядки — в истории.`}</p>
          )}
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
  const { actions } = useSync();
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const submit = async () => {
    const chosen = reportCategories.find(c => c.id === category);
    if (!station || !chosen) return;
    setSending(true);
    setSendError(null);
    try {
      const { alert } = await actions.reportIssue('driver', station.id, { category: chosen.label, details: text });
      setSent(alert.id);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

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
          <p className="text-lg font-bold text-sky-800 mono">{sent}</p>
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
        {sendError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{sendError}</p>
        )}
        <button onClick={submit}
          disabled={!category || sending}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${category ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
          <Send size={16} />Отправить сообщение
        </button>
      </div>
    </div>
  );
}

function FavoritesScreen({ onBack, onSelectStation }: { onBack: () => void; onSelectStation: (s: Station) => void }) {
  const stations = useLiveStations();
  const favorites = useFavorites();
  const favs = stations.filter(s => favorites.has(s.id));
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
                      <button onClick={e => { e.stopPropagation(); favorites.toggle(s.id); }}
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
                        <Star size={10} className="text-amber-400 fill-amber-400" />{s.rating.toFixed(1)}
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

/** Next quarter hour at least 15 minutes out, in the browser's local time. */
function nextBookableSlot() {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function BookingScreen({ station, onBack, onConfirm }: { station: Station | null; onBack: () => void; onConfirm: (booking: Booking) => void }) {
  const { actions, refresh } = useSync();
  const [slot] = useState(nextBookableSlot);
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [connector, setConnector] = useState(0);

  const freeConnectors = station?.connectors.filter(c => c.status === 'available') || [];
  const submit = async () => {
    const chosen = freeConnectors[connector];
    if (!station || !chosen) return;
    setSubmitting(true);
    setBookError(null);
    try {
      const { booking } = await actions.createBooking('driver', station.id, {
        connectorId: chosen.id,
        startsAt: new Date(`${date}T${time}`).toISOString(),
        minutes: duration,
      });
      await refresh();
      onConfirm(booking);
    } catch (err) {
      setBookError(err instanceof Error ? err.message : 'Не удалось забронировать');
    } finally {
      setSubmitting(false);
    }
  };

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
        {bookError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{bookError}</p>
        )}
        <button onClick={submit} disabled={submitting || !freeConnectors[connector]}
          className="w-full disabled:opacity-60 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2">
          <CalendarCheck size={18} />Подтвердить бронь · 2 000 сум
        </button>
      </div>
    </div>
  );
}

function BookingDoneScreen({ station, booking, onClose }: { station: Station | null; booking: Booking | null; onClose: () => void }) {
  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
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
            ['Станция', booking?.stationName || station?.name || '—'],
            ['Разъем', booking ? `${booking.connectorType} · ${booking.power} кВт` : '—'],
            ['Дата', booking ? new Date(booking.startsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—'],
            ['Время', booking ? `${fmtTime(booking.startsAt)} – ${fmtTime(booking.endsAt)}` : '—'],
            ['Номер брони', booking?.code ?? '—'],
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

type QRPhase = 'idle' | 'permission' | 'scanning' | 'processing' | 'success' | 'error' | 'manual';

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
    // The sticker on a charger carries its station ID, e.g. ST-001.
    const s = stations.find(x => x.id.toUpperCase() === code || x.id.toUpperCase() === code.replace(/^ST(\d)/, 'ST-$1'));
    if (s) {
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
        <div className="rounded-3xl overflow-hidden relative" style={{ background: 'linear-gradient(145deg,#1F1F1F,#111111)', boxShadow: '0 12px 40px rgba(255, 200, 61,0.25)' }}>
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full opacity-20"
              style={{ background: '#FFC83D', filter: 'blur(40px)' }} />
          </div>
          <div className="relative z-10 px-6 py-8 flex flex-col items-center">
            {/* QR icon */}
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
                style={{ background: 'rgba(255, 200, 61,0.15)', border: '1.5px solid rgba(255, 200, 61,0.3)' }}>
                {/* Corner accents */}
                {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos,cls],i) => (
                  <div key={i} className={`absolute ${pos} w-4 h-4 border-sky-400 rounded-sm`} style={{ [pos.includes('top') ? 'top' : 'bottom']: -1, [pos.includes('left') ? 'left' : 'right']: -1, borderTopColor: cls.includes('border-t') ? '#FFC83D' : 'transparent', borderBottomColor: cls.includes('border-b') ? '#FFC83D' : 'transparent', borderLeftColor: cls.includes('border-l') ? '#FFC83D' : 'transparent', borderRightColor: cls.includes('border-r') ? '#FFC83D' : 'transparent', borderWidth: 2 }} />
                ))}
                <Scan size={32} className="text-sky-400" style={{ filter: 'drop-shadow(0 0 8px #FFC83D)' }} />
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
              style={{ background: 'linear-gradient(135deg,#FFC83D,#FFB000)', boxShadow: '0 6px 24px rgba(255, 200, 61,0.35)' }}>
              <Scan size={18} className="text-[#111]" />
              <span className="text-[#111]">Открыть камеру</span>
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
              { icon: '📱', text: 'В приложении Zaryad24 (раздел бронирований)' },
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
      <div className="w-16 h-16 rounded-2xl bg-sky-500/20 flex items-center justify-center mb-4" style={{ border: '1px solid rgba(255, 200, 61,0.3)' }}>
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
                style={{ top: `${boxY}px`, background: 'linear-gradient(90deg,transparent,#FFC83D,#FFE58A,#FFC83D,transparent)', boxShadow: '0 0 12px #FFC83D, 0 0 24px rgba(255, 200, 61,0.5)', zIndex: 3, transition: 'top 0.016s linear' }} />
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
                    borderTop: top ? '3px solid #FFC83D' : 'none',
                    borderBottom: !top ? '3px solid #FFC83D' : 'none',
                    borderLeft: left ? '3px solid #FFC83D' : 'none',
                    borderRight: !left ? '3px solid #FFC83D' : 'none',
                    borderRadius: top && left ? '10px 0 0 0' : top && !left ? '0 10px 0 0' : !top && left ? '0 0 0 10px' : '0 0 10px 0',
                    filter: 'drop-shadow(0 0 6px #FFC83D)',
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

          <div className="w-16 h-16 rounded-full bg-sky-500/20 flex items-center justify-center" style={{ border: '2px solid rgba(255, 200, 61,0.5)', boxShadow: '0 0 20px rgba(255, 200, 61,0.3)' }}>
            <Scan size={26} className="text-sky-400" style={{ animation: 'pulse 1.5s ease-in-out infinite', filter: 'drop-shadow(0 0 4px #FFC83D)' }} />
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
          <Scan size={28} className="text-sky-400" style={{ filter: 'drop-shadow(0 0 8px #FFC83D)' }} />
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
            <p className="text-slate-400 text-xs mt-0.5">Станция подтверждена системой Zaryad24</p>
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
                    <span className="text-[11px] font-semibold text-slate-600">{scannedStation.rating.toFixed(1)}</span>
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
              style={{ background: avail.length > 0 ? 'linear-gradient(135deg,#FFC83D,#FFB000)' : undefined, backgroundColor: avail.length === 0 ? '#E2E8F0' : undefined, color: avail.length > 0 ? '#111' : '#94A3B8', boxShadow: avail.length > 0 ? '0 6px 20px rgba(255, 200, 61,0.35)' : undefined }}>
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
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-[#111] active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#FFC83D,#FFB000)', boxShadow: '0 4px 16px rgba(255, 200, 61,0.3)' }}>
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
            {stations.slice(0, 5).map(st => st.id.toUpperCase()).map(c => (
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
          style={{ background: manualCode.trim() ? 'linear-gradient(135deg,#FFC83D,#FFB000)' : '#E2E8F0', color: manualCode.trim() ? '#111' : '#94A3B8', boxShadow: manualCode.trim() ? '0 6px 20px rgba(255, 200, 61,0.35)' : 'none' }}>
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
  { name: 'Platinum', minPts: 15000, maxPts: Infinity, color: '#4F6BFF', icon: '💎', perks: ['3× бонусы', 'VIP-поддержка 24/7', 'Эксклюзивные тарифы', 'Личный менеджер'] },
];

function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { actions, updateAccount } = useSync();
  const stations = useLiveStations();
  const [step, setStep] = useState(0);
  const [carBrand, setCarBrand] = useState('BYD');
  const [carModel, setCarModel] = useState('');
  const [battery, setBattery] = useState(60);
  const [connector, setConnector] = useState('CCS2');
  const [saving, setSaving] = useState(false);
  const [carError, setCarError] = useState('');

  const onboardBrands = ['BYD', 'Hyundai', 'Kia', 'Tesla', 'Chevrolet', 'Geely', 'Zeekr', 'Другая'];
  const batteryOptions = [40, 60, 77, 82, 100];
  const connectorOptions = ['CCS2', 'GB/T DC', 'Type 2', 'CHAdeMO'];
  const cities = new Set(stations.map(s => s.city)).size;

  const saveCar = async () => {
    if (!carModel.trim()) return setStep(2);
    setSaving(true);
    setCarError('');
    try {
      const maxKw = connector === 'Type 2' ? 11 : connector === 'CHAdeMO' ? 50 : 150;
      const { user } = await actions.saveCar('driver', { brand: carBrand === 'Другая' ? 'Другая марка' : carBrand, model: carModel.trim(), year: new Date().getFullYear(), battery, port: connector, maxKw });
      updateAccount('driver', user);
      setStep(2);
    } catch (e) {
      setCarError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    <div key="welcome" className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ animation: 'enter-up 0.4s ease both' }}>
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center mb-6 shadow-xl shadow-sky-200">
        <Zap size={44} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2 leading-tight">{`Добро пожаловать в ${BRAND.name}`}</h1>
      <p className="text-slate-500 text-sm mb-8 leading-relaxed">Все зарядные станции разных операторов — в одном приложении</p>
      <div className="w-full space-y-3 text-left">
        {[
          { icon: <MapPin size={18} className="text-sky-500" />, text: `${stations.length} ${plural(stations.length, ['станция', 'станции', 'станций'])} в ${cities} ${plural(cities, ['городе', 'городах', 'городах'])} — свободные разъёмы в реальном времени` },
          { icon: <Wallet size={18} className="text-emerald-500" />, text: 'Один кошелёк для всех сетей, пополнение через Payme и Click' },
          { icon: <Route size={18} className="text-violet-500" />, text: 'Планировщик поездок между городами по станциям сети' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">{item.icon}</div>
            <span className="text-sm font-medium text-slate-700">{item.text}</span>
          </div>
        ))}
      </div>
    </div>,

    <div key="car" className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ animation: 'enter-up 0.35s ease both' }}>
      <div className="text-center pb-2">
        <h2 className="text-lg font-bold text-slate-900">Ваш автомобиль</h2>
        <p className="text-sm text-slate-400">Чтобы показывать подходящие разъёмы, время и стоимость зарядки</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">МАРКА</p>
        <div className="grid grid-cols-4 gap-2">
          {onboardBrands.map(b => (
            <button key={b} onClick={() => setCarBrand(b)} aria-pressed={carBrand === b} className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${carBrand === b ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{b}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">МОДЕЛЬ</p>
        <input value={carModel} onChange={e => setCarModel(e.target.value)} aria-label="Модель" placeholder={carBrand === 'BYD' ? 'Например: Song Plus' : carBrand === 'Hyundai' ? 'Например: Ioniq 5' : 'Модель'} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 text-slate-800 placeholder:text-slate-300" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">ЁМКОСТЬ БАТАРЕИ</p>
        <div className="flex gap-2">
          {batteryOptions.map(b => (
            <button key={b} onClick={() => setBattery(b)} aria-pressed={battery === b} className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${battery === b ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-600'}`}>
              {b}<span className="block text-[10px] font-normal opacity-70">кВт·ч</span>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">БЫСТРАЯ ЗАРЯДКА</p>
        <div className="grid grid-cols-2 gap-2">
          {connectorOptions.map(c => (
            <button key={c} onClick={() => setConnector(c)} aria-pressed={connector === c} className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${connector === c ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-600'}`}>{c}</button>
          ))}
        </div>
      </div>
      {carError && <p className="text-xs text-red-500 px-1">{carError}</p>}
    </div>,

    <div key="pay" className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ animation: 'enter-up 0.35s ease both' }}>
      <div className="text-center pb-2">
        <h2 className="text-lg font-bold text-slate-900">Как платить</h2>
        <p className="text-sm text-slate-400">Без привязки карты в приложении</p>
      </div>
      {[
        { icon: <Wallet size={18} className="text-emerald-500" />, title: 'Кошелёк', text: 'Пополняете через Payme или Click — данные карты остаются у платёжной системы.' },
        { icon: <Zap size={18} className="text-sky-500" />, title: 'Оплата по факту', text: 'За зарядку списывается только полученная энергия по цене станции.' },
        { icon: <Moon size={18} className="text-violet-500" />, title: 'Ночью дешевле', text: 'С 23:00 до 07:00 цена ×0.7 на всех станциях сети.' },
      ].map(x => (
        <div key={x.title} className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">{x.icon}</div>
          <div><p className="text-sm font-semibold text-slate-800">{x.title}</p><p className="text-xs text-slate-500 mt-0.5">{x.text}</p></div>
        </div>
      ))}
    </div>,
  ];

  return (
    <div className="absolute inset-0 bg-white flex flex-col" style={{ zIndex: 9999, fontFamily: 'Inter, sans-serif' }}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
        <span className="text-sm font-bold text-sky-500">{BRAND.name}</span>
        <button onClick={() => onComplete()} className="text-xs text-slate-400 font-medium px-3 py-1.5 rounded-xl hover:bg-slate-100">Пропустить</button>
      </div>
      <div className="flex items-center justify-center gap-2 py-3 shrink-0">
        {[0, 1, 2].map(i => (
          <div key={i} className={`rounded-full transition-all ${i === step ? 'w-5 h-2.5 bg-sky-500' : i < step ? 'w-2.5 h-2.5 bg-sky-300' : 'w-2.5 h-2.5 bg-slate-200'}`} />
        ))}
      </div>
      {steps[step]}
      <div className="px-4 pb-8 pt-3 shrink-0 space-y-2">
        <button
          onClick={() => { if (step === 0) setStep(1); else if (step === 1) void saveCar(); else onComplete(); }}
          disabled={saving}
          className="w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl py-4 font-bold text-base shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {step === 2 ? <><CheckCircle size={18} />Готово — к карте</> : step === 1 && carModel.trim() ? 'Сохранить и далее →' : 'Далее →'}
        </button>
        {step === 1 && <button onClick={() => setStep(2)} className="w-full text-slate-400 text-sm font-medium py-2">Добавить позже</button>}
      </div>
    </div>
  );
}

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
  const { actions, sessions: portalSessions, state, refresh, events, updateAccount } = useSync();
  const driverAccount = portalSessions.driver;
  // The session this driver currently has running, as the server sees it.
  const liveSession = state?.sessions.find(
    s => s.status === 'active' && s.userId === driverAccount?.id,
  ) ?? null;

  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [sos, setSos] = useState(false);
  const watched = useRef<string | null>(null);
  const [lastBooking, setLastBooking] = useState<Booking | null>(null);
  // Shown once per account on this device.
  const onboardKey = `oc-onboarded-${driverAccount?.id ?? 'guest'}`;
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem(onboardKey);
    } catch {
      return true;
    }
  });
  const finishOnboarding = () => {
    try {
      localStorage.setItem(onboardKey, '1');
    } catch {
      /* private mode */
    }
    setShowOnboarding(false);
  };
  const [activeTab, setActiveTab] = useState<Tab>('map');
  const [screen, setScreen] = useState<Screen>('map');
  // The wallet opens from the profile or from the balance on the map; Back returns there.
  const walletFrom = useRef<Screen>('profile');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (t: Omit<Toast, 'id'>) =>
    setToasts(p => [...p, { ...t, id: Date.now().toString() }]);

  /**
   * Starts a real session on the server so every other portal sees it. Falls
   * through to the local screen either way — a demo shouldn't dead-end on a
   * connector someone else grabbed first.
   */
  const seenQueueEvent = useRef<string | null>(null);
  useEffect(() => {
    const ready = events.find(
      e => e.type === 'queue.ready' && (e.payload as { userId?: string })?.userId === driverAccount?.id,
    );
    if (ready && seenQueueEvent.current !== ready.id) {
      seenQueueEvent.current = ready.id;
      pushToast({ icon: '🔌', title: 'Ваша очередь подошла', body: ready.message + ' · держим 5 минут', color: '#22C55E' });
    }
    // pushToast is a stable local helper; re-running on it would be noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, driverAccount]);

  const startCharging = async (connectorId: string | null = null, payer: Payer = 'self', faceToken?: string) => {
    const station = selectedStation;
    const connector =
      station?.connectors.find(c => c.id === connectorId && c.status === 'available') ??
      station?.connectors.find(c => c.status === 'available') ??
      station?.connectors[0];

    if (station && connector && driverAccount) {
      try {
        await actions.startSession('driver', station.id, connector.id, payer, faceToken);
        await refresh();
      } catch (err) {
        pushToast({
          icon: '⚠️',
          title: 'Не удалось начать зарядку',
          body: err instanceof Error ? err.message : 'Попробуйте другой коннектор',
          color: '#F59E0B',
        });
        // Stay put: showing "charging active" after a refusal would be a lie.
        return;
      }
    }
    setScreen('charging-active');
  };

  useEffect(() => {
    if (liveSession) {
      watched.current = liveSession.id;
      return;
    }
    if (screen !== 'charging-active' || !watched.current) return;
    const ended = state?.sessions.find(x => x.id === watched.current);
    if (ended && ended.status !== 'active') {
      watched.current = null;
      setLastSession(ended);
      setScreen('charging-done');
    }
  }, [liveSession, screen, state]);

  // Signed in inside Telegram with a password: link the two so next time is one tap.
  useEffect(() => {
    if (!driverAccount || driverAccount.telegram || !inTelegram()) return;
    void telegramInitData().then(initData => {
      if (initData) actions.telegramLink(initData).then(r => updateAccount('driver', r.user)).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverAccount?.id]);

  const saveCar = async (car: { brand: string; model: string; year: number; battery: number; port: string; maxKw: number; chargeLimit: number }) => {
    try {
      const { user } = await actions.saveCar('driver', { ...car, port: car.port.replace(/^Type(\d)$/, 'Type $1') });
      updateAccount('driver', user);
      setScreen('profile');
    } catch (err) {
      pushToast({ icon: '⚠️', title: 'Не удалось сохранить автомобиль', body: err instanceof Error ? err.message : 'Попробуйте ещё раз', color: '#F59E0B' });
    }
  };

  const stopCharging = async () => {
    if (liveSession) {
      try {
        const r = await actions.stopSession('driver', liveSession.id);
        // A station on OCPP or a partner network stops on its own time: the receipt
        // opens once its final record settles the session (the effect above).
        if ((r as { pending?: boolean }).pending) {
          pushToast({ icon: '⏳', title: 'Останавливаем зарядку', body: 'Ждём подтверждения от станции — чек откроется сам', color: '#FFB000' });
          return;
        }
        watched.current = null;
        setLastSession(r.session);
        await refresh();
      } catch {
        /* already stopped elsewhere — the done screen is still correct */
      }
    }
    setScreen('charging-done');
  };
  const dismissToast = (id: string) =>
    setToasts(p => p.filter(t => t.id !== id));


  const handleSelectStation = (s: Station) => {
    setSelectedStation(s);
    setScreen('station');
  };

  const handleBack = () => {
    setScreen('map');
    setSelectedStation(null);
  };

  const renderContent = () => {
    if (screen === 'charging-start') return <ChargingStartScreen station={selectedStation} onBack={() => setScreen('station')} onConfirm={startCharging} onOpenQR={() => setScreen('qr-scan')} />;
    if (screen === 'charging-active') return <ChargingActiveScreen session={liveSession} startBattery={state?.vehicles.find(v => v.driverId === driverAccount?.id)?.battery ?? null} packKwh={driverAccount?.car?.battery} limit={driverAccount?.car?.chargeLimit} onStop={stopCharging} />;
    if (screen === 'charging-done') return <ChargingDoneScreen session={lastSession} onClose={handleBack} />;
    if (screen === 'trip') return <TripPlannerScreen onBack={() => setScreen('map')} onSelectStation={handleSelectStation} />;
    if (screen === 'booking') return <BookingScreen station={selectedStation} onBack={() => setScreen('station')} onConfirm={b => { setLastBooking(b); setScreen('booking-done'); }} />;
    if (screen === 'booking-done') return <BookingDoneScreen station={selectedStation} booking={lastBooking} onClose={handleBack} />;
    if (screen === 'add-car') return <AddCarScreen onBack={() => setScreen('profile')} onSave={saveCar} />;
    if (screen === 'notifications') return <NotificationsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'reviews') return <ReviewsScreen station={selectedStation} onBack={() => setScreen('station')} />;
    if (screen === 'report') return <ReportScreen station={selectedStation} onBack={() => setScreen('station')} />;
    if (screen === 'favorites') return <FavoritesScreen onBack={() => setScreen('map')} onSelectStation={s => { setSelectedStation(s); setScreen('station'); }} />;
    if (screen === 'qr-scan') return <QRScanScreen onBack={() => setScreen(selectedStation ? 'station' : 'map')} onStartCharging={s => { setSelectedStation(s); setScreen('charging-start'); }} />;
    if (screen === 'app-settings') return <AppSettingsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'wallet') return <WalletScreen onBack={() => setScreen(walletFrom.current)} />;
    if (screen === 'eco') return <EcoScreen onBack={() => setScreen('profile')} />;
    if (screen === 'security') return <SecurityScreen onBack={() => setScreen('profile')} />;
    if (screen === 'finance') return <FinanceScreen onBack={() => setScreen('profile')} />;
    if (screen === 'loyalty') return <LoyaltyScreen onBack={() => setScreen('profile')} />;
    if (screen === 'family') return <FamilyScreen onBack={() => setScreen('profile')} />;
    if (screen === 'credit') return <CreditScreen onBack={() => setScreen('profile')} />;
    if (screen === 'host') return <HostScreen onBack={() => setScreen('profile')} />;
    if (screen === 'support') return <SupportScreen onBack={() => setScreen('profile')} onReport={() => setScreen(selectedStation ? 'report' : 'map')} />;

    if (activeTab === 'history') return <HistoryScreen />;
    if (activeTab === 'profile') return <ProfileScreen onNavigate={s => { walletFrom.current = 'profile'; setScreen(s as Screen); }} />;
    if (activeTab === 'trips') return <TripPlannerScreen onBack={() => setActiveTab('map')} onSelectStation={st => { setActiveTab('map'); handleSelectStation(st); }} />;
    if (activeTab === 'charging') return <ChargingHubScreen onNavigate={(s) => { setScreen(s as Screen); setActiveTab('map'); }} onSelectStation={st => { setActiveTab('map'); handleSelectStation(st); }} onOpenCharge={() => { setActiveTab('map'); setScreen('charging-active'); }} />;

    return (
      <div className="relative w-full h-full">
        <DriverMap onSelectStation={handleSelectStation} onOpenWallet={() => { walletFrom.current = 'map'; setScreen('wallet'); }} />
        {/* QR scan FAB */}
        {screen === 'map' && (
          <button onClick={() => setScreen('qr-scan')}
            className="absolute bottom-4 right-4 z-20 flex items-center gap-2 pl-3 pr-4 py-3 rounded-2xl font-semibold text-sm text-[#111] active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#FFC83D,#FFB000)', boxShadow: '0 6px 20px rgba(255, 200, 61,0.45)' }}>
            <Scan size={17} />
            QR
          </button>
        )}
        {screen === 'map' && (
          <button onClick={() => setSos(true)} aria-label="SOS — нужна помощь" className="absolute bottom-[136px] left-3 z-20 w-11 h-11 rounded-xl bg-red-600 text-white font-extrabold text-xs shadow-lg active:scale-95">SOS</button>
        )}
        {sos && <SosSheet onClose={() => setSos(false)} />}
        {screen === 'station' && selectedStation && (
          <StationDetailSheet station={selectedStation} onClose={handleBack} onStartCharging={() => setScreen('charging-start')} onBook={() => setScreen('booking')} onReviews={() => setScreen('reviews')} onReport={() => setScreen('report')} />
        )}
      </div>
    );
  };

  const showTabs = !['charging-start', 'charging-active', 'charging-done', 'trip', 'booking', 'booking-done', 'add-car', 'notifications', 'reviews', 'report', 'favorites', 'qr-scan', 'app-settings', 'wallet', 'security', 'support', 'finance', 'loyalty', 'family', 'host', 'credit'].includes(screen);

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative" style={{ fontFamily: 'Inter, sans-serif' }}>
      {showOnboarding && <OnboardingScreen onComplete={finishOnboarding} />}
      {/* Status bar of the device mock — a real phone draws its own */}
      <div className="bg-white px-4 pt-2 pb-1 hidden sm:flex items-center justify-between shrink-0 border-b border-slate-100">
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
        <div className="bg-white border-t border-slate-100 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shrink-0">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id && !['station'].includes(screen);
            // The badge means a charge is running right now, nothing else.
            const isCharging = tab.id === 'charging' && !!liveSession;
            return (
              <button key={tab.id} aria-current={isActive ? 'page' : undefined} onClick={() => { setActiveTab(tab.id); setScreen('map'); setSelectedStation(null); }}
                className={`relative flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl transition-colors ${isActive ? 'text-sky-500' : 'text-slate-400'}`}>
                {isCharging && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 items-center justify-center">
                      <span className="text-white" style={{ fontSize: 7, fontWeight: 700 }}>⚡</span>
                    </span>
                  </span>
                )}
                {tab.icon}
                <span className="text-[11px] sm:text-xs max-w-full truncate">{tab.label}</span>
                {isActive && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-sky-500 rounded-full" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  MapPin, Navigation, Search, Zap, Clock, Star, ChevronRight, Home, X, Battery, BatteryCharging,
  Scan, History, User, ArrowLeft, CheckCircle, Heart, Route, ChevronDown, Plus, Wifi, Coffee,
  ParkingCircle, Toilet, CalendarCheck, Minus, AlertTriangle, Send, Wallet, ArrowDownCircle,
  Building2, Moon, ScanFace, Percent,
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
import { NetworkTopUp, NetworkWalletList } from './driver/NetworkWallets';
import Navigator from './driver/Navigator';
import { useRoadDistance } from '../lib/nav';
import DealsScreen from './driver/Deals';
import QRScanScreen from './driver/QRScan';
import RewardsScreen, { RewardBurst } from './driver/Rewards';
import BatteryScreen from './driver/Battery';
import { useOfflinePacks, deletePack, packsBytes, savedStations } from '../lib/offline';
import { NetworkBadge } from './driver/NetworkBadge';
import { ChargerFriend } from './driver/Illustration';
import { promoNow, promosOf, promoHours, discounted, useDriverPromos } from '../lib/promos';
import SupportChat from './driver/SupportChat';
import { useI18n } from '../lib/i18n';
import type { Payer, ChargeGoal } from '../lib/api';
import { useMyLocation, km, fmtKm, driveMinutes, locate, openNow, samePort } from '../lib/geo';
import { inTelegram, telegramInitData } from '../lib/telegram';
import type { Booking, Session, PaymentOrder } from '../lib/api';
import AuthFlow from './AuthFlow';

type Screen = 'map' | 'station' | 'charging-start' | 'charging-active' | 'charging-done' | 'history' | 'profile' | 'trip' | 'booking' | 'booking-done' | 'add-car' | 'notifications' | 'reviews' | 'report' | 'favorites' | 'qr-scan' | 'onboarding' | 'app-settings' | 'finance' | 'loyalty' | 'family' | 'host' | 'wallet' | 'security' | 'support' | 'eco' | 'credit' | 'navigate' | 'rewards' | 'battery';
type Tab = 'map' | 'charging' | 'deals' | 'profile';
/** Minutes as "25 мин" or "5 ч 10 мин". */
const hm = (m: number) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`);
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '—';

const statusColor: Record<string, string> = {
  available: '#22C55E',
  occupied: '#EF4444',
  unavailable: '#94A3B8',
  reserved: '#F59E0B',
};

function StationDetailSheet({ station, onClose, onStartCharging, onBook, onReviews, onReport, onNavigate }: { station: Station; onClose: () => void; onStartCharging: () => void; onBook: () => void; onReviews: () => void; onReport: () => void; onNavigate: () => void }) {
  const free = station.connectors.filter(c => c.status === 'available').length;
  const { state, actions, sessions: portalSessions, refresh } = useSync();
  const me = portalSessions.driver;
  const favorites = useFavorites();
  const favorite = favorites.has(station.id);
  const here = useMyLocation();
  const crow = here ? km(here, { lat: station.geoLat, lng: station.geoLng }) : null;
  // By road when the routing service answers; as the crow flies (marked ≈) until then.
  const road = useRoadDistance(here, { lat: station.geoLat, lng: station.geoLng });
  const dist = road?.km ?? crow;
  const drive = road ? road.min : crow !== null ? driveMinutes(crow) : null;
  const queue = (state?.queues ?? []).filter(q => q.stationId === station.id);
  const myIndex = queue.findIndex(q => q.userId === me?.id);
  const myTurn = myIndex >= 0 && queue[myIndex].notified;
  const mapOnly = state?.operators.find(o => o.id === (station as Station & { operatorId?: string }).operatorId)?.integration === 'Только карта';
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

  const opRef = { id: station.id, operatorId: (station as Station & { operatorId?: string }).operatorId };
  const driverPromos = useDriverPromos();
  const promo = promoNow(opRef, driverPromos);
  const later = promo ? null : promosOf(opRef, driverPromos)[0] ?? null;
  const pointStatus: Record<string, { text: string; color: string; bg: string }> = {
    available: { text: 'Свободно', color: '#16A34A', bg: '#F0FDF4' },
    occupied: { text: 'Заряжается', color: '#EA580C', bg: '#FFF7ED' },
    reserved: { text: 'Забронировано', color: '#D97706', bg: '#FFFBEB' },
    unavailable: { text: 'Не работает', color: '#64748B', bg: '#F8FAFC' },
  };
  const maxKw = Math.max(0, ...station.connectors.map(c => c.power));
  // Nothing to queue for when every point is out of order, and no start while the site is shut.
  const working = station.connectors.filter(c => c.status !== 'unavailable').length;
  const closed = !openNow(station.hours);

  // The card slides away the way it came: by the cross, or pulled down by its handle.
  const sheet = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 220);
  };
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const dragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (sheet.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = sheet.current;
    if (!drag.current || !el) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const dragEnd = () => {
    const el = sheet.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d) return;
    if (d.dy > 90) {
      el.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)';
      el.style.transform = 'translateY(105%)';
      setLeaving(true);
      setTimeout(onClose, 200);
    } else {
      el.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1)';
      el.style.transform = '';
    }
  };

  return (
    <div ref={sheet} data-sheet className={`absolute inset-x-0 bottom-0 z-30 bg-white rounded-t-[28px] shadow-[0_-12px_40px_rgba(15,23,42,0.18)] max-h-[82%] overflow-y-auto overscroll-contain ${leaving ? 'pg-sheet-out' : 'pg-sheet-in'}`}>
      {/* Handle and the network it belongs to; pull it down to close */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur pt-2.5 pb-2 px-4 touch-none cursor-grab active:cursor-grabbing" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        <div className="mx-auto w-10 h-1 bg-slate-200 rounded-full mb-2" />
        <div className="flex items-center gap-2">
          <button onClick={close} aria-label="Закрыть" className="w-9 h-9 -ml-1 rounded-xl grid place-items-center hover:bg-slate-100">
            <X size={20} className="text-slate-700" />
          </button>
          <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-800 truncate">{station.operator}</span>
          <button onClick={() => favorites.toggle(station.id)} aria-pressed={favorite} aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-slate-100">
            <Heart key={String(favorite)} size={19} className={favorite ? 'fill-red-500 text-red-500 pg-pop' : 'text-slate-600'} />
          </button>
        </div>
      </div>
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <NetworkBadge name={station.operator} size={52} promo={!!promo} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 leading-tight tracking-tight">{station.name}</h2>
            <p className="text-sm text-slate-500 mt-0.5 flex items-start gap-1"><MapPin size={13} className="mt-0.5 shrink-0" />{`${station.address}, ${station.city}`}</p>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800"><Star size={14} className="fill-[#FFC83D] text-[#FFC83D]" />{station.rating.toFixed(1)}</span>
              {dist !== null && <span key={road ? 'road' : 'crow'} className={`inline-flex items-center gap-1 text-slate-600 ${road ? 'pg-pop' : ''}`} title={road ? 'По дороге' : 'По прямой — уточняем по дорогам'}><Navigation size={13} />{`${road ? '' : '≈ '}${fmtKm(dist)}`}{road && <span className="text-[11px] text-slate-400">по дороге</span>}</span>}
              {drive !== null && <span className="inline-flex items-center gap-1 text-slate-600"><Clock size={13} />{hm(drive)}</span>}
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: statusColor[station.status] }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor[station.status] }} />
                {`${free}/${station.connectors.length} свободно`}
              </span>
            </div>
          </div>
        </div>

        {/* The network's own discount, now or later today */}
        {(promo || later) && (
          <div className="mb-3 rounded-2xl px-3.5 py-3 flex items-center gap-3" style={{ background: promo ? 'linear-gradient(135deg,#FFE08A,#FFC83D)' : '#FFFBEB' }}>
            <span className="w-10 h-10 rounded-xl bg-[#111] text-[#FFC83D] grid place-items-center shrink-0"><Percent size={19} strokeWidth={2.6} /></span>
            {promo ? (
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold text-[#111]">{`−${promo.percent}% · ${promo.title}`}</span>
                <span className="block text-xs text-[#111]/70">{`${promo.firstOnly ? 'На первую зарядку в сети · ' : ''}${promoHours(promo)} · скидку даёт ${station.operator}`}</span>
              </span>
            ) : later && (
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold text-[#111]">{`−${later.percent}% · ${promoHours(later)}`}</span>
                <span className="block text-xs text-[#111]/70">{`${later.title} — в эти часы цена ниже`}</span>
              </span>
            )}
          </div>
        )}

        {/* Photo */}
        <div className="rounded-2xl overflow-hidden mb-3 h-32 bg-slate-100 relative">
          {/* With no signal the photo may not load: the card keeps a calm tile instead of a broken image. */}
          <span className="absolute inset-0 grid place-items-center text-slate-300" aria-hidden="true"><Zap size={34} /></span>
          <img src={station.photoAt ? `/api/stations/${station.id}/photo?v=${encodeURIComponent(station.photoAt)}` : station.image} alt={station.name} className="relative w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
          {!openNow(station.hours) && <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold">{`Закрыто · ${station.hours}`}</span>}
          <span className="absolute bottom-2 left-2 flex gap-1.5">
            <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-white text-xs font-semibold">{station.hours}</span>
            <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-white text-xs font-semibold">{`до ${maxKw} кВт`}</span>
          </span>
        </div>

        {/* How to find it on site */}
        {station.findHint && (
          <div className="mb-3 flex gap-2 items-start rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
            <MapPin size={15} className="text-[#8a5b00] mt-0.5 shrink-0" />
            <p className="text-sm text-slate-700"><span className="font-semibold">Как найти: </span>{station.findHint}</p>
          </div>
        )}

        {/* Charge points: each connector as a lettered point, like on the charger itself */}
        <p className="text-xs font-semibold text-slate-500 mb-2 tracking-wide">ТОЧКИ ЗАРЯДКИ</p>
        <div className="space-y-2 mb-4">
          {station.connectors.map((c, i) => {
            const look = pointStatus[c.status] ?? pointStatus.unavailable;
            return (
              <div key={c.id} className="relative overflow-hidden flex items-center gap-3 py-3 pl-3 pr-11 rounded-2xl border" style={{ borderColor: c.status === 'occupied' ? '#FDBA74' : '#F1F5F9', background: c.status === 'unavailable' ? '#F8FAFC' : '#fff' }}>
                <span className="relative z-[1] w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: look.bg, color: look.color }}>
                  {c.status === 'occupied' ? <BatteryCharging size={19} /> : <Zap size={19} />}
                </span>
                <div className="relative z-[1] flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-900 leading-tight">{c.type} <span className="text-sm font-semibold" style={{ color: look.color }}>{look.text}</span></p>
                  <p className="text-xs text-slate-500 mt-0.5">{`${c.power} кВт`}</p>
                </div>
                <div className="relative z-[1] text-right">
                  {promo && <p className="text-[11px] text-slate-400 line-through tabular-nums">{c.price.toLocaleString('ru-RU')}</p>}
                  <p className={`text-sm font-extrabold tabular-nums ${promo ? 'px-2 py-0.5 rounded-lg bg-[#FFC83D] text-[#111]' : 'text-slate-900'}`}>
                    {discounted(c.price, promo).toLocaleString('ru-RU')}<span className="text-[10px] font-semibold opacity-70"> сум/кВт·ч</span>
                  </p>
                </div>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[34px] font-black text-slate-200 leading-none select-none pointer-events-none" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
              </div>
            );
          })}
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
        {mapOnly ? (
          // A network with no integration: we show where and how much; its own app runs the charge.
          <div className="mb-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
            <p className="text-sm font-semibold text-slate-800">{`Зарядка — в приложении ${station.operator}`}</p>
            <p className="text-xs text-slate-500 mt-0.5">Эта сеть пока не подключена к запуску из PowerGo. Здесь — расположение, разъёмы и цены.</p>
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {working === 0 || closed ? (
            // Out of order or shut: say why instead of offering a start that would fail.
            <div className="rounded-2xl py-3 bg-slate-100 text-slate-500 text-sm font-semibold flex flex-col items-center justify-center leading-tight text-center px-2">
              <span>{working === 0 ? 'Станция не работает' : 'Сейчас закрыто'}</span>
              <span className="text-[10px] font-normal">{working === 0 ? 'Все разъёмы неисправны' : `Часы работы ${station.hours}`}</span>
            </div>
          ) : free === 0 && !myTurn ? (
            <button onClick={toggleQueue} disabled={queueBusy}
              className={`${myIndex >= 0 ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-violet-600 hover:bg-violet-700 text-white'} rounded-2xl py-3 font-semibold text-sm transition-colors flex flex-col items-center justify-center leading-tight disabled:opacity-60`}>
              <span>{myIndex >= 0 ? `Вы №${myIndex + 1} · выйти` : 'Встать в очередь'}</span>
              <span className="text-[10px] font-normal opacity-80">{queue.length} в очереди</span>
            </button>
          ) : (
            <button onClick={onStartCharging}
              className={`${myTurn ? 'bg-green-500 hover:bg-green-600 animate-pulse text-white' : 'text-[#111]'} rounded-2xl py-3.5 font-bold text-[15px] transition-transform active:scale-[0.98] flex items-center justify-center gap-2`}
              style={myTurn ? undefined : { background: 'linear-gradient(135deg,#FFD66B,#FFB000)', boxShadow: '0 6px 18px rgba(255,176,0,0.35)' }}>
              <Scan size={16} />{myTurn ? 'Ваша очередь — начать' : 'Начать зарядку'}
            </button>
          )}
          <button onClick={onBook}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <CalendarCheck size={16} />Забронировать
          </button>
        </div>
        )}
        <GreenHourBanner />
        {queueError && (
          <p role="alert" className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{queueError}</p>
        )}
        {/* Navigation inside the app: route, voice, cameras. */}
        <button onClick={onNavigate} className="w-full mb-2 bg-[#111] text-white rounded-2xl py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          <Navigation size={17} className="text-[#FFC83D] fill-[#FFC83D]" />{dist !== null && drive !== null ? `Маршрут · ${road ? '' : '≈ '}${fmtKm(dist)} · ${hm(drive)}` : 'Маршрут'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onReviews} className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl py-2.5 font-medium text-sm transition-colors flex items-center justify-center gap-1.5">
            <Star size={14} />{`Отзывы · ${station.reviews}`}
          </button>
          <button onClick={onReport} className="bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl py-2.5 font-medium text-sm transition-colors flex items-center justify-center gap-1.5">
            <AlertTriangle size={14} />Проблема
          </button>
        </div>
      </div>
    </div>
  );
}

/** Large mode: a bigger root size scales every rem-sized text, gap and button in the app. */
const readLarge = () => {
  try {
    return localStorage.getItem('oc-large') === '1';
  } catch {
    return false;
  }
};
function useLargeMode() {
  const [large, setLarge] = useState(readLarge);
  useEffect(() => {
    const on = (e: Event) => setLarge(!!(e as CustomEvent<{ large: boolean }>).detail?.large);
    window.addEventListener('oc-large-change', on);
    return () => window.removeEventListener('oc-large-change', on);
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = large ? '112.5%' : '';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [large]);
}

/** What the driver wants from a charge, and when it should start. */
type ChargeOptions = { goal?: ChargeGoal; startAt?: string };

function ChargingStartScreen({ station, preferConnector, onBack, onConfirm, onOpenQR }: { station: Station | null; preferConnector?: string | null; onBack: () => void; onConfirm: (connectorId: string | null, payer: Payer, faceToken?: string, options?: ChargeOptions) => void | Promise<void>; onOpenQR?: () => void }) {
  const { state, sessions: portalSessions } = useSync();
  const me = portalSessions.driver;
  const balance = (me && state?.wallets[me.id]?.balance) ?? 0;
  const bonus = state?.rewards?.bonus.balance ?? 0;
  const employer = state?.employer ?? null;
  const familyWallets = (state?.family?.payers ?? []).filter(p => p.status === 'active');
  const credit = state?.credit?.enrolled ? state.credit : null;
  const [payer, setPayer] = useState<Payer>(employer && employer.left > 0 ? 'company' : 'self');
  const [faceCheck, setFaceCheck] = useState(false);
  // Networks paid directly take only the driver's balance at that network.
  const netWallet = state?.networkWallets?.find(w => w.direct && w.operatorId === (station as (Station & { operatorId?: string }) | null)?.operatorId) ?? null;
  const [netTopUp, setNetTopUp] = useState(false);
  // The station is already known (picked on the map or scanned), so the app can start it; QR is the other way.
  const [launchMode, setLaunchMode] = useState<'qr' | 'remote'>('remote');
  const [confirming, setConfirming] = useState(false);
  const driverPromos = useDriverPromos();
  const promo = station ? promoNow({ id: station.id, operatorId: (station as Station & { operatorId?: string }).operatorId }, driverPromos) : null;
  // Held by id: the station is live, so the chosen point shows its status as it is now.
  const [selectedId, setSelectedId] = useState(() => (station?.connectors.find(c => c.id === preferConnector && c.status === 'available') ?? station?.connectors.find(c => c.status === 'available') ?? station?.connectors[0])?.id ?? null);
  const selectedConnector = station?.connectors.find(c => c.id === selectedId) ?? null;
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  // The driver's own car when the account has one, otherwise a typical arrival charge.
  const currentBattery = state?.vehicles.find(v => v.driverId === me?.id)?.battery ?? 34;
  const pack = me?.car?.battery ?? 75;
  // The slider moves in steps of 5 from a round number, so 80% is a stop on it.
  const minPct = Math.min(100, Math.ceil((currentBattery + 5) / 5) * 5);
  const [targetPct, setTargetPct] = useState(() => Math.min(100, Math.max(me?.car?.chargeLimit ?? 80, minPct)));
  const [goalKind, setGoalKind] = useState<'percent' | 'sum' | 'km'>('percent');
  const [goalSum, setGoalSum] = useState(30000);
  const [goalKm, setGoalKm] = useState(100);
  const [when, setWhen] = useState<'now' | 'night'>('now');
  // Tashkent is UTC+5: the night tariff runs 23:00–07:00, i.e. 18:00–02:00 UTC.
  const utcHour = new Date().getUTCHours();
  const nightNow = utcHour >= 18 || utcHour < 2;
  const nextNight = () => {
    const d = new Date();
    d.setUTCHours(18, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };
  // What the network charges right now, its discount included.
  const price = discounted(selectedConnector?.price ?? 1800, promo);
  const kwNeeded = !selectedConnector ? 0
    : goalKind === 'percent' ? Math.max(0, ((targetPct - currentBattery) / 100) * pack)
    : goalKind === 'km' ? goalKm * 0.18
    : goalSum / price;
  const estCost = goalKind === 'sum' ? goalSum : Math.round(kwNeeded * price * (when === 'night' ? 0.7 : 1));
  const estMinutes = selectedConnector ? Math.round((kwNeeded / Math.max(3, selectedConnector.power * 0.85)) * 60) : 0;
  const goal = goalKind === 'percent' ? { kind: 'percent' as const, value: targetPct, fromPct: currentBattery } : goalKind === 'sum' ? { kind: 'sum' as const, value: goalSum } : { kind: 'km' as const, value: goalKm };
  const options = { goal, ...(when === 'night' && !nightNow ? { startAt: nextNight() } : {}) };
  // The server asks for 5 kWh up front before a start.
  const netMinimum = selectedConnector ? selectedConnector.price * 5 : 0;
  const netShort = netWallet ? Math.max(0, netMinimum - netWallet.balance) : 0;
  const canStart = !!station && selectedConnector?.status === 'available' && netShort === 0 && !confirming && !(launchMode === 'qr' && !scanned);
  const confirm = async (payerNow: Payer, faceToken?: string, opts: ChargeOptions = options) => {
    setConfirming(true);
    try {
      await onConfirm(selectedConnector?.id ?? null, payerNow, faceToken, opts);
    } finally {
      setConfirming(false);
    }
  };

  const doScan = () => {
    setScanning(true);
    setTimeout(() => { setScanning(false); setScanned(true); }, 1800);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
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
              { mode: 'remote' as const, icon: <Zap size={20} />, label: 'Из приложения' },
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
                <button key={c.id} onClick={() => c.status === 'available' && setSelectedId(c.id)}
                  disabled={c.status !== 'available'}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selectedConnector?.id === c.id ? 'border-sky-500 bg-sky-50' : c.status !== 'available' ? 'border-slate-100 opacity-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'available' ? 'bg-green-500' : c.status === 'occupied' ? 'bg-red-500' : 'bg-slate-400'}`} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-slate-800">{c.type}</p>
                    <p className="text-xs text-slate-400">{c.id} · {c.power} кВт</p>
                  </div>
                  <span className="text-right">
                    {promo && <span className="block text-[11px] text-slate-400 line-through tabular-nums">{c.price.toLocaleString('ru-RU')}</span>}
                    <span className="block text-sm font-bold mono text-slate-700">{`${discounted(c.price, promo).toLocaleString('ru-RU')} сум/кВт·ч`}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Goal: the charge stops by itself when it gets there */}
        {(launchMode === 'remote' || scanned) && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2">СКОЛЬКО ЗАРЯДИТЬ</p>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl mb-3" role="radiogroup" aria-label="Цель зарядки">
              {([['percent', 'До %'], ['sum', 'На сумму'], ['km', 'На км']] as const).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={goalKind === k} onClick={() => setGoalKind(k)}
                  className={`py-1.5 rounded-lg text-xs font-semibold ${goalKind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
            {goalKind === 'percent' && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{`Сейчас ≈ ${currentBattery}%`}</span>
                  <span className={`text-sm font-bold mono ${targetPct >= 80 ? 'text-green-600' : 'text-sky-600'}`}>{targetPct}%</span>
                </div>
                <input type="range" min={minPct} max={100} step={5} value={targetPct} aria-label="Зарядить до, %"
                  onChange={e => setTargetPct(Number(e.target.value))}
                  className="w-full accent-[#FFB000] mb-3" />
              </>
            )}
            {goalKind !== 'percent' && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {(goalKind === 'sum' ? [20000, 30000, 50000, 100000] : [50, 100, 150, 250]).map(v => {
                  const active = goalKind === 'sum' ? goalSum === v : goalKm === v;
                  return (
                    <button key={v} onClick={() => (goalKind === 'sum' ? setGoalSum(v) : setGoalKm(v))} aria-pressed={active}
                      className={`py-2 rounded-xl text-sm font-semibold ${active ? 'bg-[#FFC83D] text-[#111]' : 'bg-slate-100 text-slate-700'}`}>
                      {goalKind === 'sum' ? `${v / 1000}K` : `${v} км`}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'кВт·ч', value: kwNeeded.toFixed(1) },
                { label: promo ? `сум · −${promo.percent}%` : 'сум', value: `~${(Math.round(estCost / 100) * 100).toLocaleString('ru-RU')}` },
                { label: 'Время', value: `~${estMinutes} мин` },
              ].map(s => (
                <div key={s.label} className="bg-sky-50 rounded-xl py-2 px-1 transition-all">
                  <p className="text-sm font-bold mono text-sky-700">{s.value}</p>
                  <p className="text-xs text-sky-500">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Зарядка остановится сама, когда дойдёт до цели — пришлём уведомление.</p>

            {/* When to start */}
            {!nightNow && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">КОГДА НАЧАТЬ</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Когда начать">
                  <button role="radio" aria-checked={when === 'now'} onClick={() => setWhen('now')}
                    className={`p-2.5 rounded-xl border-2 text-left ${when === 'now' ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200'}`}>
                    <span className="block text-sm font-semibold text-slate-800">Сейчас</span>
                  </button>
                  <button role="radio" aria-checked={when === 'night'} onClick={() => setWhen('night')} disabled={payer === 'credit'}
                    className={`p-2.5 rounded-xl border-2 text-left disabled:opacity-50 ${when === 'night' ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200'}`}>
                    <span className="block text-sm font-semibold text-slate-800">Ночью в 23:00</span>
                    <span className="block text-[11px] text-emerald-700">на 30% дешевле</span>
                  </button>
                </div>
                {when === 'night' && <p className="text-[11px] text-slate-500 mt-2">Оставьте машину подключённой — зарядка начнётся сама в 23:00 по ночному тарифу. Отменить можно на экране «Зарядка».</p>}
              </div>
            )}
          </div>
        )}

        {/* Payment */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-2">ОПЛАТА</p>
          {netWallet ? (
            // A network paid directly: only the driver's balance at that network pays here.
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#FFB000] bg-amber-50">
                <span className="w-8 h-8 rounded-lg bg-white grid place-items-center text-lg" aria-hidden="true">{netWallet.logo}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{`Баланс сети ${netWallet.name}`}</p>
                  <p className="text-xs text-slate-500">{`${netWallet.balance.toLocaleString('ru-RU')} сум · деньги поступают сети напрямую`}</p>
                </div>
                <button onClick={() => setNetTopUp(true)} className="px-3 py-1.5 rounded-xl bg-[#FFC83D] text-[#111] text-xs font-semibold">Пополнить</button>
              </div>
              {netShort > 0 && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2">{`Для старта нужно ещё ${netShort.toLocaleString('ru-RU')} сум на балансе этой сети`}</p>}
            </div>
          ) : (
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
                <p className="text-xs text-slate-400">{bonus > 0 ? `Баланс ${balance.toLocaleString('ru-RU')} сум · сначала спишется бонус ${bonus.toLocaleString('ru-RU')} сум` : `Баланс ${balance.toLocaleString('ru-RU')} сум · пополнение через Payme или Click`}</p>
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
                onClick={() => { setPayer('credit'); setWhen('now'); }}
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
          )}
        </div>
      </div>
      {netTopUp && netWallet && <NetworkTopUp wallet={netWallet} need={netMinimum} onClose={() => setNetTopUp(false)} />}

      <div className="px-4 pb-6 pt-2">
        {selectedConnector && selectedConnector.status !== 'available' && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mb-2 pg-reveal">Этот разъём уже занят — выберите свободный</p>
        )}
        <button onClick={() => (netWallet ? void confirm('self') : payer === 'credit' ? setFaceCheck(true) : void confirm(payer))}
          disabled={!canStart}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${canStart ? 'text-[#111] shadow-[0_8px_22px_rgba(255,176,0,0.35)]' : 'bg-slate-200 text-slate-400'}`}
          style={canStart ? { background: 'linear-gradient(135deg,#FFD66B,#FFB000)' } : undefined}>
          {confirming ? <span className="w-[18px] h-[18px] rounded-full border-2 border-[#111]/30 border-t-[#111] animate-spin" /> : <Zap size={18} />}
          {confirming ? 'Запускаем…' : when === 'night' && !nightNow ? 'Запланировать на 23:00' : 'Подтвердить и начать зарядку'}
        </button>
      </div>
      {faceCheck && (
        <FaceCheck
          onClose={() => setFaceCheck(false)}
          onVerified={token => {
            setFaceCheck(false);
            void confirm('credit', token, { goal });
          }}
        />
      )}
    </div>
  );
}

function AppSettingsScreen({ onBack }: { onBack: () => void }) {
  // The app's language, not a local copy of it.
  const { lang: language, setLang: setLanguage } = useI18n();
  const [large, setLarge] = useState(() => readLarge());
  useEffect(() => {
    try {
      localStorage.setItem('oc-large', large ? '1' : '0');
    } catch {
      /* private mode: this session only */
    }
    window.dispatchEvent(new CustomEvent('oc-large-change', { detail: { large } }));
  }, [large]);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(
    () => (localStorage.getItem('oc-theme') === 'dark' ? 'dark' : localStorage.getItem('oc-theme') === 'auto' ? 'auto' : 'light')
  );

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    localStorage.setItem('oc-theme', theme);
    window.dispatchEvent(new CustomEvent('oc-theme-change', { detail: { dark: isDark } }));
  }, [theme]);
  // The switches are remembered on this device; before, they reset on every visit.
  const [notes, setNotes] = useState<Record<'charge' | 'price' | 'nearby' | 'promo', boolean>>(() => {
    const base = { charge: true, price: true, nearby: false, promo: true };
    try {
      return { ...base, ...JSON.parse(localStorage.getItem('oc-note-prefs') ?? '{}') };
    } catch {
      return base;
    }
  });
  const flip = (k: keyof typeof notes) => setNotes(n => {
    const next = { ...n, [k]: !n[k] };
    try {
      localStorage.setItem('oc-note-prefs', JSON.stringify(next));
    } catch {
      /* private mode */
    }
    return next;
  });
  const [cacheNote, setCacheNote] = useState<string | null>(null);
  const clearMapCache = async () => {
    let n = 0;
    try {
      for (const key of await caches.keys()) if (/tile|map/i.test(key)) n += (await caches.delete(key)) ? 1 : 0;
    } catch {
      /* no Cache Storage here */
    }
    setCacheNote(n ? 'Кэш карт очищен' : 'Кэш карт уже пуст');
    setTimeout(() => setCacheNote(null), 2500);
  };

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) => (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0 ${value ? 'bg-[#FFB000]' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] ${value ? 'translate-x-6' : 'translate-x-1'}`} />
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
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
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
                  aria-pressed={language === val}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${language === val ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3.5 border-b border-slate-50 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-700">Крупный шрифт и кнопки</p>
              <p className="text-xs text-slate-400">Всё крупнее и проще нажимать — удобно в машине и для зрения</p>
            </div>
            <Toggle label="Крупный шрифт и кнопки" value={large} onChange={() => setLarge(v => !v)} />
          </div>
          <div className="px-4 py-3.5">
            <p className="text-sm text-slate-700 mb-2">Тема</p>
            <div className="flex gap-2">
              {([['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Авто']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTheme(val)}
                  aria-pressed={theme === val}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${theme === val ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionHeader label="УВЕДОМЛЕНИЯ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <Row label="Зарядка завершена" right={<Toggle label="Зарядка завершена" value={notes.charge} onChange={() => flip('charge')} />} />
          <Row label="Снижение цен" right={<Toggle label="Снижение цен" value={notes.price} onChange={() => flip('price')} />} />
          <Row label="Новые станции рядом" right={<Toggle label="Новые станции рядом" value={notes.nearby} onChange={() => flip('nearby')} />} />
          <Row label="Скидки сетей" right={<Toggle label="Скидки сетей" value={notes.promo} onChange={() => flip('promo')} />} />
        </div>

        <SectionHeader label="ДАННЫЕ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Валюта</span>
            <span className="text-sm text-slate-400">Сум (UZS)</span>
          </div>
          <button onClick={() => void clearMapCache()} className="px-4 py-3.5 flex items-center justify-between w-full hover:bg-slate-50">
            <span className="text-sm text-slate-700">Очистить кэш карт</span>
            <span key={cacheNote ?? 'idle'} className={`text-xs font-medium ${cacheNote ? 'text-emerald-600 pg-pop' : 'text-sky-600'}`}>{cacheNote ?? 'Очистить'}</span>
          </button>
        </div>

        <OfflineSection />

        <SectionHeader label="О ПРИЛОЖЕНИИ" />
        <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden mb-6">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-50">
            <span className="text-sm text-slate-700">Версия</span>
            <span className="text-sm text-slate-400">{APP_VERSION}</span>
          </div>
          {[
            { label: 'Условия использования', href: '/?doc=terms' },
            { label: 'Политика конфиденциальности', href: '/?doc=privacy' },
            { label: 'Публичная оферта', href: '/?doc=offer' },
            { label: 'Отправить отзыв', href: `mailto:${BRAND.email}?subject=${encodeURIComponent(`Отзыв о ${BRAND.name}`)}` },
          ].map(item => (
            <a key={item.label} href={item.href} target={item.href.startsWith('/') ? '_blank' : undefined} rel="noreferrer" className="px-4 py-3.5 flex items-center justify-between w-full border-b border-slate-50 last:border-none hover:bg-slate-50 transition-colors">
              <span className="text-sm text-slate-700">{item.label}</span>
              <ChevronRight size={16} className="text-slate-400" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Saved roads for driving without signal, and the room they take. */
function OfflineSection() {
  const packs = useOfflinePacks();
  return (
    <>
      <p className="text-xs font-semibold text-slate-400 tracking-widest px-4 pt-5 pb-2">ОФЛАЙН-КАРТЫ</p>
      <div className="bg-white rounded-2xl border border-slate-100 mx-4 overflow-hidden">
        {packs.length === 0 ? (
          <p className="px-4 py-3.5 text-sm text-slate-500">Пока нет. В «Поездке» выберите маршрут и нажмите «Сохранить для офлайна» — карта трассы, станции и коды будут работать без связи.</p>
        ) : (
          <>
            {packs.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3 border-b border-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{`${Math.max(1, Math.round(p.bytes / 1048576))} МБ · ${p.stations.length} станций · ${new Date(p.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}</p>
                </div>
                <button onClick={() => void deletePack(p.id)} aria-label={`Удалить ${p.name}`} className="p-2 rounded-xl bg-red-50 text-red-600"><X size={14} /></button>
              </div>
            ))}
            <p className="px-4 py-2.5 text-xs text-slate-400">{`Всего ${Math.max(1, Math.round(packsBytes(packs) / 1048576))} МБ на этом телефоне`}</p>
          </>
        )}
      </div>
    </>
  );
}

function WalletScreen({ onBack, onRewards }: { onBack: () => void; onRewards: () => void }) {
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
    ...orders.filter(o => o.status === 'paid').map(o => {
      const network = o.operatorId ? state?.networkWallets?.find(w => w.operatorId === o.operatorId)?.name ?? o.operatorId : null;
      return { id: o.id, type: 'topup', amount: o.amount, label: network ? `Баланс сети ${network} — ${o.provider === 'payme' ? 'Payme' : 'Click'}` : `Пополнение — ${o.provider === 'payme' ? 'Payme' : 'Click'}`, at: o.paidAt ?? o.created };
    }),
    ...(state?.transactions ?? [])
      .filter(t => t.userId === driverId && (t.method === 'Кошелёк' || t.method.startsWith('Баланс сети')))
      .map(t => {
        const ses = state?.sessions.find(x => x.id === t.sessionId);
        const refunded = t.status === 'refunded';
        const viaNetwork = t.method.startsWith('Баланс сети');
        const fromWallet = t.amount - (t.bonus ?? 0);
        return { id: t.id, type: refunded ? 'topup' : 'charge', amount: refunded ? t.amount : -fromWallet, label: `${refunded ? 'Возврат' : 'Зарядка'} — ${ses?.stationName ?? t.sessionId}${viaNetwork ? ' · баланс сети' : ''}${t.bonus ? ` · ${t.bonus.toLocaleString('ru-RU')} бонусом` : ''}`, at: t.time };
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
    if (amt < 5000 || amt > 10_000_000 || paying) return;
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
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-1">БАЛАНС PowerGo</p>
          <p key={balance} className="text-3xl font-bold tracking-tight mb-3 tabular-nums pg-pop">{balance.toLocaleString('ru-RU')} сум</p>
          <p className="text-xs text-slate-400 mb-4">Пополнение через Payme или Click · списывается за каждую зарядку по счётчику</p>
          <div className="flex gap-2">
            <button onClick={() => setShowTopUp(true)}
              className="flex-1 py-2.5 bg-[#FFC83D] hover:bg-[#FFB000] text-[#111] rounded-2xl text-sm font-semibold transition-colors active:scale-95">
              Пополнить
            </button>

          </div>
        </div>

        {(state?.rewards?.bonus.balance ?? 0) > 0 && (
          <button onClick={onRewards} className="w-full rounded-2xl p-4 flex items-center gap-3 text-left text-[#111]" style={{ background: 'linear-gradient(135deg,#FFF3C4,#FFE08A)' }}>
            <span className="text-2xl" aria-hidden="true">🎁</span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold opacity-70">БОНУС POWERGO</span>
              <span className="block text-lg font-black tabular-nums">{`${state!.rewards!.bonus.balance.toLocaleString('ru-RU')} сум`}</span>
              {state!.rewards!.bonus.nextExpiry && <span className="block text-[11px] opacity-70">{`Тратится первым · до ${new Date(state!.rewards!.bonus.nextExpiry).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}</span>}
            </span>
            <ChevronRight size={16} className="opacity-50" />
          </button>
        )}

        <NetworkWalletList />

        {/* Transaction history */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">ИСТОРИЯ ОПЕРАЦИЙ</p>
          </div>
          <div className="divide-y divide-slate-50 pg-stagger">
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
                  {tx.type === 'topup' ? '+' : ''}{tx.amount.toLocaleString('ru-RU')} сум
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top-up modal */}
      {showTopUp && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end pg-fade" onClick={e => { if (e.target === e.currentTarget && !paying) setShowTopUp(false); }}>
          <div className="bg-white rounded-t-3xl p-6 space-y-5 w-full pg-sheet-in">
            <div className="flex justify-center mb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            {topUpSuccess ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl pg-pop">✅</div>
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
                  type="text"
                  inputMode="numeric"
                  aria-label="Своя сумма"
                  value={customAmount}
                  onChange={e => { setCustomAmount(e.target.value.replace(/\D/g, '').slice(0, 8)); setSelectedAmount(null); }}
                  onKeyDown={e => e.key === 'Enter' && void doTopUp()}
                  placeholder="Своя сумма, от 5 000 до 10 000 000 сум"
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
                  disabled={paying || !(selectedAmount || (parseInt(customAmount) >= 5000 && parseInt(customAmount) <= 10_000_000))}
                  className="w-full py-3.5 bg-sky-500 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-all">
                  {paying ? 'Подтверждаем оплату…' : `Оплатить через ${provider === 'payme' ? 'Payme' : 'Click'}`}{!paying && (selectedAmount ? ` ${selectedAmount.toLocaleString('ru-RU')} сум` : customAmount ? ` ${parseInt(customAmount).toLocaleString('ru-RU')} сум` : '')}
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
        <SupportChat />
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
              <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
            </button>
            {openFaq === i && <p className="px-4 pb-4 text-sm text-slate-500 leading-relaxed pg-reveal">{faq.a}</p>}
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

/** "+100 000 sum for your car's details", while that reward is still to get. */
function CarBonusBanner() {
  const reward = useSync().state?.rewards?.achievements.find(a => a.id === 'car');
  if (!reward || reward.grantedAt) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl px-4 py-3 flex items-center gap-3 text-[#111] pg-reveal" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFC83D)' }}>
      <span className="text-2xl pg-float" aria-hidden="true">🎁</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-extrabold">{`+${reward.amount.toLocaleString('ru-RU')} сум на зарядку`}</span>
        <span className="block text-xs opacity-75">PowerGo дарит бонус за данные вашего автомобиля</span>
      </span>
    </div>
  );
}

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
  const [saving, setSaving] = useState(false);
  const stations = useLiveStations();
  // New model years go on sale before the calendar year turns.
  const maxYear = new Date().getFullYear() + 1;

  const selectedPort = portTypes.find(p => p.type === port);
  // Where this car can actually charge, counted from the live map, not a slogan.
  const fitting = stations.filter(st => st.connectors.some(c => samePort(c.type, port) || samePort(c.type, 'Type 2'))).length;
  const fittingFast = stations.filter(st => st.connectors.some(c => samePort(c.type, port) && c.power >= 50)).length;
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ brand, model, year, battery, port, maxKw, chargeLimit });
    } finally {
      setSaving(false);
    }
  };

  if (step === 'confirm') {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
          <button onClick={() => setStep('form')} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
          <h1 className="text-base font-bold text-slate-900">Подтверждение</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="flex flex-col items-center py-6">
            <div className="w-20 h-20 bg-sky-100 rounded-3xl flex items-center justify-center mb-4 text-4xl pg-pop">🚗</div>
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
              <Zap size={12} />Совместимость с сетью PowerGo
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={12} className="text-green-500" />
                <span className="text-sky-700">{`${fitting} ${plural(fitting, ['станция подходит', 'станции подходят', 'станций подходят'])} на карте`}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={12} className={fittingFast ? 'text-green-500' : 'text-slate-300'} />
                <span className="text-sky-700">{fittingFast ? `${fittingFast} — с быстрой зарядкой ${selectedPort?.label ?? port}` : `Быстрых станций с ${selectedPort?.label ?? port} пока нет`}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-8 pt-2">
          <button onClick={() => void save()} disabled={saving}
            className="w-full bg-sky-500 text-white rounded-2xl py-4 font-bold text-base disabled:opacity-60">
            {saving ? 'Сохраняем…' : saved ? 'Сохранить изменения' : 'Добавить автомобиль'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">{saved ? 'Мой автомобиль' : 'Добавить автомобиль'}</h1>
          <p className="text-xs text-slate-400">Данные для автоматической совместимости</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <CarBonusBanner />
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
          <input type="range" min="2015" max={maxYear} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Год выпуска"
            className="w-full accent-sky-500" />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>2015</span><span>{maxYear}</span></div>
        </div>

        {/* Battery */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">ЁМКОСТЬ БАТАРЕИ</p>
            <span className="text-sm font-bold text-slate-900 mono">{battery} кВт·ч</span>
          </div>
          <input type="range" min="20" max="120" step="5" value={battery} onChange={e => setBattery(Number(e.target.value))} aria-label="Ёмкость батареи, кВт·ч"
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
          <input type="range" min="3" max={selectedPort?.maxKw || 150} step="1" value={maxKw} onChange={e => setMaxKw(Number(e.target.value))} aria-label="Макс. мощность зарядки, кВт"
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

function ReportScreen({ station: given, onBack }: { station: Station | null; onBack: () => void }) {
  const { actions } = useSync();
  const stations = useLiveStations();
  const here = useMyLocation();
  // Opened from Support there is no station yet: the nearest one is the likely one, and it can be changed.
  const nearestFirst = here ? [...stations].sort((a, b) => km(here, { lat: a.geoLat, lng: a.geoLng }) - km(here, { lat: b.geoLat, lng: b.geoLng })) : stations;
  const [pickedId, setPickedId] = useState<string>('');
  const station = given ?? stations.find(x => x.id === pickedId) ?? null;
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
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-slate-900">Сообщить о проблеме</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mb-5 text-4xl pg-pop">✅</div>
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
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Сообщить о проблеме</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!given && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <label htmlFor="report-station" className="text-xs font-semibold text-slate-500 mb-2 block">СТАНЦИЯ</label>
            <select id="report-station" value={pickedId} onChange={e => setPickedId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-sky-400 text-slate-800 bg-white">
              <option value="">Выберите станцию</option>
              {nearestFirst.map(x => <option key={x.id} value={x.id}>{`${x.name} · ${x.city}`}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5">{here ? 'Сначала ближайшие к вам' : 'Сообщение получит оператор этой станции'}</p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">КАТЕГОРИЯ ПРОБЛЕМЫ</p>
          <div className="space-y-2">
            {reportCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)} aria-pressed={category === cat.id}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${category === cat.id ? 'border-red-400 bg-red-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                <span className="text-xl">{cat.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{cat.label}</p>
                  <p className="text-xs text-slate-400">{cat.sub}</p>
                </div>
                {category === cat.id && <div className="w-5 h-5 bg-red-400 rounded-full flex items-center justify-center shrink-0 pg-pop">
                  <CheckCircle size={12} className="text-white" />
                </div>}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">ОПИСАНИЕ (необязательно)</p>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 500))} aria-label="Описание проблемы"
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
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2 pg-shake">{sendError}</p>
        )}
        <button onClick={submit}
          disabled={!category || !station || sending}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${category && station ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
          <Send size={16} />{sending ? 'Отправляем…' : !station ? 'Выберите станцию' : !category ? 'Выберите проблему' : 'Отправить сообщение'}
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
  const [sort, setSort] = useState<'name' | 'rating' | 'price'>('rating');
  const cheapest = (s: Station) => Math.min(Infinity, ...s.connectors.map(c => c.price));

  const q = query.trim().toLowerCase();
  const filtered = favs
    .filter(s => !q || `${s.name} ${s.operator} ${s.city}`.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
      return cheapest(a) - cheapest(b);
    });

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Избранные станции</h1>
        <span className="ml-auto text-xs text-slate-400">{`${favs.length} ${plural(favs.length, ['станция', 'станции', 'станций'])}`}</span>
      </div>

      {favs.length > 0 && (
        <div className="bg-white px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Поиск по избранному"
              placeholder="Поиск станций..."
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-xs text-sky-500 font-medium shrink-0">Сбросить</button>
            )}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'name' | 'rating' | 'price')}
            aria-label="Сортировка"
            className="text-xs text-slate-600 bg-slate-100 rounded-xl px-2 py-2 outline-none border-none"
          >
            <option value="rating">Рейтинг</option>
            <option value="name">Название</option>
            <option value="price">Сначала дешевле</option>
          </select>
        </div>
      )}

      {favs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <ChargerFriend size={150} mood="wait" />
          <p className="text-slate-700 text-sm font-semibold mt-2">Пока пусто</p>
          <p className="text-slate-400 text-sm mt-0.5">Нажмите <Heart size={13} className="inline -mt-0.5 text-red-400" /> на карточке станции — она появится здесь.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <Search size={48} className="text-slate-200 mb-4" />
          <p className="text-slate-400 text-sm">Нет станций по запросу</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pg-stagger">
          {filtered.map(s => {
            const free = s.connectors.filter(c => c.status === 'available').length;
            const statusColors: Record<string, string> = { available: 'text-green-600', occupied: 'text-red-500', unavailable: 'text-slate-400', reserved: 'text-amber-500' };
            const statusLabels: Record<string, string> = { available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно', reserved: 'Забронировано' };
            return (
              <div key={s.id} role="button" tabIndex={0} onClick={() => onSelectStation(s)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectStation(s)}
                className="w-full bg-white rounded-2xl border border-slate-100 p-4 text-left hover:border-sky-200 transition-colors cursor-pointer active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img src={s.image} alt={s.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.operator}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); favorites.toggle(s.id); }} aria-label={`Убрать ${s.name} из избранного`}
                        className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
                        <Heart size={14} className="fill-red-500 text-red-500" />
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
                      <span>{`от ${cheapest(s).toLocaleString('ru-RU')} сум/кВт·ч`}</span>
                      <span>{s.city}</span>
                    </div>
                  </div>
                </div>
              </div>
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
  const startsAt = new Date(`${date}T${time}`);
  // A slot that has already begun cannot be held.
  const inPast = !(startsAt.getTime() > Date.now());
  const submit = async () => {
    const chosen = freeConnectors[connector];
    if (!station || !chosen || inPast) return;
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
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
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
            {freeConnectors.length === 0 && (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-3">Сейчас все разъёмы заняты — забронировать можно, когда освободится хотя бы один. Встаньте в очередь на карточке станции.</p>
            )}
            {freeConnectors.map((c, i) => (
              <button key={c.id} onClick={() => setConnector(i)} aria-pressed={connector === i}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${connector === i ? 'border-sky-500 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <Zap size={14} className="text-sky-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-slate-800">{c.type}</p>
                  <p className="text-xs text-slate-400">{c.power} кВт · {c.price.toLocaleString()} сум/кВт·ч</p>
                </div>
                {connector === i && <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center pg-pop">
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
              <input type="date" value={date} min={slot.date} onChange={e => setDate(e.target.value)}
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
            <button onClick={() => setDuration(d => Math.max(15, d - 15))} aria-label="Меньше на 15 минут" disabled={duration <= 15}
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-40">
              <Minus size={16} />
            </button>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]" style={{ width: `${(duration / 240) * 100}%` }} />
            </div>
            <button onClick={() => setDuration(d => Math.min(240, d + 15))} aria-label="Больше на 15 минут" disabled={duration >= 240}
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-40">
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
              ['Разъем', freeConnectors[connector] ? `${freeConnectors[connector].type} · ${freeConnectors[connector].power} кВт` : '—'],
              ['Дата', startsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })],
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
        {inPast && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mb-2 pg-reveal">Это время уже прошло — выберите позже</p>}
        <button onClick={submit} disabled={submitting || !freeConnectors[connector] || inPast}
          className="w-full disabled:opacity-50 text-[#111] rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-[0_8px_22px_rgba(255,176,0,0.3)] disabled:shadow-none"
          style={{ background: 'linear-gradient(135deg,#FFD66B,#FFB000)' }}>
          <CalendarCheck size={18} />{submitting ? 'Бронируем…' : 'Подтвердить бронь · 2 000 сум'}
        </button>
      </div>
    </div>
  );
}

/** The booking as an .ics file: the phone's calendar opens it and reminds before the slot. */
function addToCalendar(b: Booking) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t: string) => t.replace(/[\\,;]/g, m => `\\${m}`);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${BRAND.name}//Booking//RU`, 'BEGIN:VEVENT',
    `UID:${b.id}@${BRAND.name.toLowerCase()}`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.startsAt)}`, `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${esc(`Зарядка · ${b.stationName ?? ''}`)}`,
    `DESCRIPTION:${esc(`Бронь ${b.code ?? ''} · ${b.connectorType} · ${b.power} кВт. Держим 15 минут после начала.`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Скоро бронь на зарядку', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `booking-${b.code ?? b.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BookingDoneScreen({ station, booking, onClose }: { station: Station | null; booking: Booking | null; onClose: () => void }) {
  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mb-5 shadow-lg shadow-amber-100 pg-pop">
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
        <button onClick={() => booking && addToCalendar(booking)} disabled={!booking} className="border border-slate-200 text-slate-700 rounded-2xl py-3 font-medium text-sm disabled:opacity-40">Добавить в календарь</button>
        <button onClick={onClose} className="bg-sky-500 text-white rounded-2xl py-3 font-semibold text-sm">Готово</button>
      </div>
    </div>
  );
}

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
      <CarBonusBanner />
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

// The QR scanner sits in the middle, raised: it is how most charges start.
const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'map', label: 'Карта', icon: <MapPin size={21} strokeWidth={2.2} /> },
  { id: 'charging', label: 'Зарядка', icon: <Zap size={21} strokeWidth={2.2} /> },
  { id: 'deals', label: 'Скидки', icon: <Percent size={21} strokeWidth={2.4} /> },
  { id: 'profile', label: 'Профиль', icon: <User size={21} strokeWidth={2.2} /> },
];

/**
 * The yellow marker under the open tab. Moving to another tab it hops there
 * in an arc — over the QR button when it crosses it — stretching on the way
 * and squashing as it lands, so the eye follows where you went.
 */
function TabMarker({ slot }: { slot: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(slot);
  useEffect(() => {
    const el = ref.current;
    const from = last.current;
    last.current = slot;
    if (!el || from === slot) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !el.animate) return;
    const crossesQr = (from < 2) !== (slot < 2);
    const lift = crossesQr ? -30 : -14 - Math.abs(slot - from) * 4;
    const x = (n: number) => `${n * 100}%`;
    const mid = (from + slot) / 2;
    el.animate(
      [
        { transform: `translateX(${x(from)}) translateY(0) scale(1, 1)` },
        { transform: `translateX(${x(from + (slot - from) * 0.15)}) translateY(2px) scale(1.12, 0.86)`, offset: 0.12 },
        { transform: `translateX(${x(mid)}) translateY(${lift}px) scale(0.8, 1.12)`, offset: 0.5 },
        { transform: `translateX(${x(slot)}) translateY(3px) scale(1.14, 0.84)`, offset: 0.82 },
        { transform: `translateX(${x(slot)}) translateY(0) scale(1, 1)` },
      ],
      { duration: 560, easing: 'cubic-bezier(.33,0,.25,1)' },
    );
  }, [slot]);
  return (
    <span ref={ref} aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-1/5 px-1.5 pointer-events-none z-[1]"
      style={{ transform: `translateX(${slot * 100}%)` }}>
      <span className="block h-full rounded-[20px] shadow-[0_6px_16px_rgba(255,176,0,0.4)]" style={{ background: 'linear-gradient(145deg,#FFD66B,#FFC83D)' }} />
    </span>
  );
}

interface Toast { id: string; icon: string; title: string; body: string; color: string; }

function LoaderCircleIcon() {
  return <span className="w-4 h-4 rounded-full border-2 border-amber-300 border-t-[#FFB000] animate-spin shrink-0" aria-hidden="true" />;
}

function PushToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const startY = useRef<number | null>(null);
  const leave = () => setLeaving(true);
  useEffect(() => { const t = setTimeout(leave, 4500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDismiss, 240);
    return () => clearTimeout(t);
    // onDismiss is stable for this toast's id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);
  return (
    <div role="status" className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl cursor-pointer active:scale-98 transition-transform ${leaving ? 'pg-toast-out' : ''}`}
      onClick={leave}
      onPointerDown={e => { startY.current = e.clientY; }}
      onPointerUp={e => { if (startY.current !== null && startY.current - e.clientY > 30) leave(); startY.current = null; }}
      style={{ background: 'rgba(15,23,42,0.94)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', animation: 'toast-in 0.4s cubic-bezier(0.16,1,0.3,1) both', minWidth: 280 }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
        style={{ background: toast.color + '22', border: `1px solid ${toast.color}40` }}>
        {toast.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-tight">{toast.title}</p>
        <p className="text-white/55 text-xs mt-0.5 leading-snug">{toast.body}</p>
      </div>
      <button onClick={e => { e.stopPropagation(); leave(); }} aria-label="Закрыть уведомление" className="text-white/30 hover:text-white/60 text-lg leading-none mt-0.5 shrink-0">×</button>
    </div>
  );
}

/** A start asked for with no signal: sent by itself once the phone is back online. */
type PendingStart = { stationId: string; stationName: string; connectorId: string; payer: Payer; goal?: ChargeGoal; at: number };
const PENDING = 'oc-pending-start';
const readPending = (): PendingStart | null => {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING) ?? 'null') as PendingStart | null;
    // A start older than half an hour is no longer what the driver wants.
    return p && Date.now() - p.at < 30 * 60_000 ? p : null;
  } catch {
    return null;
  }
};

/** Whether the phone has a connection: the browser's word, and the live channel not answering. */
function useOnline() {
  const { connection } = useSync();
  const [browser, setBrowser] = useState(() => navigator.onLine);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const on = () => setBrowser(true);
    const off = () => setBrowser(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  // A dropped stream for a few seconds is a weak signal, not a blip.
  useEffect(() => {
    if (connection !== 'offline') return setStalled(false);
    const t = setTimeout(() => setStalled(true), 6000);
    return () => clearTimeout(t);
  }, [connection]);
  return browser && !stalled;
}

export default function DriverApp() {
  const { actions, sessions: portalSessions, state, refresh, events, updateAccount, connection } = useSync();
  const online = useOnline();
  const [pending, setPending] = useState<PendingStart | null>(readPending);
  const keepPending = (p: PendingStart | null) => {
    setPending(p);
    try {
      if (p) localStorage.setItem(PENDING, JSON.stringify(p));
      else localStorage.removeItem(PENDING);
    } catch {
      /* private mode: this visit only */
    }
  };
  // When the stations were last seen live, for "data as of 14:32" with no signal.
  const [liveAt, setLiveAt] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem('oc-live-at')) || savedStations()?.at || null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (connection !== 'live' || !state) return;
    const now = Date.now();
    setLiveAt(now);
    try {
      localStorage.setItem('oc-live-at', String(now));
    } catch {
      /* private mode */
    }
  }, [connection, state]);
  const packs = useOfflinePacks();
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
  const liveStations = useLiveStations();
  const liveStationsById = (id: string) => liveStations.find(s => s.id === id);
  const [activeTab, setActiveTab] = useState<Tab>('map');
  const driverPromoCount = useDriverPromos().length;
  const [screen, setScreen] = useState<Screen>('map');
  // The wallet opens from the profile or from the balance on the map; Back returns there.
  const walletFrom = useRef<Screen>('profile');
  // The car form opens from the profile, the charging tab or the rewards; saving returns there.
  const carFrom = useRef<Screen>('profile');
  const batteryFrom = useRef<Screen>('profile');
  // A reward just reached: shown big, one at a time.
  const [burst, setBurst] = useState<{ amount: number; title: string } | null>(null);
  const seenRewards = useRef(new Set<string>());
  useLargeMode();
  const [picked, setSelectedStation] = useState<Station | null>(null);
  // The card follows the live feed: a connector taken a second ago shows as taken.
  const selectedStation = picked ? liveStationsById(picked.id) ?? picked : null;
  // Where Report and Support were opened from, so Back returns there.
  const reportFrom = useRef<Screen>('station');
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Two toasts can arrive in the same millisecond; each needs its own id.
  const toastSeq = useRef(0);
  const pushToast = (t: Omit<Toast, 'id'>) =>
    setToasts(p => [...p.slice(-2), { ...t, id: `${Date.now()}-${toastSeq.current++}` }]);

  /**
   * Starts a real session on the server so every other portal sees it. Falls
   * through to the local screen either way — a demo shouldn't dead-end on a
   * connector someone else grabbed first.
   */
  // Shortcuts from the app icon: ?go=qr opens the scanner, ?go=nearest the closest free station, ?go=charging the hub.
  const shortcutDone = useRef(false);
  // The charge point a sticker named: offered first when the charge starts.
  const preferPoint = useRef<string | null>(null);
  useEffect(() => {
    if (shortcutDone.current || !driverAccount || !liveStations.length) return;
    const params = new URLSearchParams(window.location.search);
    const go = params.get('go');
    const fromSticker = params.get('station');
    if (!go && !fromSticker) return;
    shortcutDone.current = true;
    const url = new URL(window.location.href);
    for (const k of ['go', 'station', 'point']) url.searchParams.delete(k);
    window.history.replaceState(null, '', url.toString());
    // A QR sticker scanned with the phone's own camera lands here.
    if (fromSticker) {
      const s = liveStations.find(x => x.id.toLowerCase() === fromSticker.toLowerCase());
      if (s) {
        preferPoint.current = params.get('point');
        setActiveTab('map');
        setSelectedStation(s);
        setScreen('station');
      } else {
        pushToast({ icon: '⚠️', title: 'Станция не найдена', body: 'Этой станции больше нет на карте — сообщите в поддержку', color: '#F59E0B' });
      }
      return;
    }
    if (go === 'qr') setScreen('qr-scan');
    if (go === 'charging') setActiveTab('charging');
    if (go === 'nearest') {
      void locate().then(here => {
        const free = liveStations.filter(s => s.connectors.some(c => c.status === 'available'));
        const pick = here ? [...free].sort((a, b) => km(here, { lat: a.geoLat, lng: a.geoLng }) - km(here, { lat: b.geoLat, lng: b.geoLng }))[0] : free[0];
        if (pick) {
          setSelectedStation(pick);
          setScreen('station');
        }
      });
    }
  }, [driverAccount, liveStations]);

  // Progress of a charge and of a scheduled start, as they happen.
  const seenChargeEvents = useRef(new Set<string>());
  useEffect(() => {
    const mine = events.filter(e => ['session.progress', 'session.goal', 'schedule.started', 'schedule.failed', 'session.failed'].includes(e.type) && !seenChargeEvents.current.has(e.id));
    for (const e of mine.slice(0, 3)) {
      seenChargeEvents.current.add(e.id);
      // Only what happened in the last minute: older events are history, not news.
      if (Date.now() - Date.parse(e.ts) > 60_000) continue;
      const look = {
        'session.progress': { icon: '⏳', title: 'Зарядка почти готова', color: '#FFB000' },
        'session.goal': { icon: '✅', title: 'Зарядка завершена', color: '#22C55E' },
        'schedule.started': { icon: '🌙', title: 'Отложенная зарядка началась', color: '#22C55E' },
        'schedule.failed': { icon: '⚠️', title: 'Отложенная зарядка не началась', color: '#F59E0B' },
        'session.failed': { icon: '⚠️', title: 'Зарядка не началась', color: '#F59E0B' },
      }[e.type as 'session.goal'];
      pushToast({ ...look, body: e.message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => {
    const fresh = events.find(e => e.type === 'reward.granted' && !seenRewards.current.has(e.entity ?? e.id) && Date.now() - Date.parse(e.ts) < 60_000);
    // Not under the welcome screens: it waits until they close.
    if (!fresh || burst || showOnboarding) return;
    seenRewards.current.add(fresh.entity ?? fresh.id);
    const p = fresh.payload as { amount?: number; title?: string };
    if (p.amount) setBurst({ amount: p.amount, title: p.title ?? 'Награда' });
  }, [events, burst, showOnboarding]);

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

  const startCharging = async (connectorId: string | null = null, payer: Payer = 'self', faceToken?: string, options: ChargeOptions = {}, at: Station | null = selectedStation) => {
    const station = at;
    const connector =
      station?.connectors.find(c => c.id === connectorId && c.status === 'available') ??
      station?.connectors.find(c => c.status === 'available') ??
      station?.connectors[0];

    // "Start at 23:00": the server starts it then, at the night price.
    if (options.startAt && station && connector) {
      try {
        await actions.scheduleCharge({ stationId: station.id, connectorId: connector.id, payer, goal: options.goal, at: options.startAt });
        await refresh();
        pushToast({ icon: '🌙', title: 'Зарядка начнётся в 23:00', body: `${station.name} · по ночному тарифу. Оставьте машину подключённой`, color: '#FFB000' });
        setActiveTab('charging');
        setScreen('map');
      } catch (err) {
        pushToast({ icon: '⚠️', title: 'Не удалось отложить зарядку', body: err instanceof Error ? err.message : 'Попробуйте ещё раз', color: '#F59E0B' });
      }
      return;
    }

    if (station && connector && driverAccount) {
      // No signal at the charger: keep the start and send it the moment the phone is back online.
      if (!online || !navigator.onLine) {
        if (payer === 'credit') {
          pushToast({ icon: '📡', title: 'Нужна связь', body: 'Зарядка в долг подтверждается лицом — это возможно только онлайн', color: '#F59E0B' });
          return;
        }
        keepPending({ stationId: station.id, stationName: station.name, connectorId: connector.id, payer, goal: options.goal, at: Date.now() });
        pushToast({ icon: '📡', title: 'Запустим, как только появится связь', body: `${station.name} · подключите кабель к машине`, color: '#FFB000' });
        setScreen('map');
        return;
      }
      try {
        await actions.startSession('driver', station.id, connector.id, payer, faceToken, options.goal);
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

  const sendingPending = useRef(false);
  useEffect(() => {
    if (!pending || !online || connection !== 'live' || !driverAccount || sendingPending.current) return;
    sendingPending.current = true;
    void actions.startSession('driver', pending.stationId, pending.connectorId, pending.payer, undefined, pending.goal)
      .then(async () => {
        await refresh();
        pushToast({ icon: '⚡', title: 'Связь появилась — зарядка запущена', body: pending.stationName, color: '#22C55E' });
        keepPending(null);
        setActiveTab('map');
        setScreen('charging-active');
      })
      .catch(err => {
        pushToast({ icon: '⚠️', title: 'Зарядка не запустилась', body: err instanceof Error ? err.message : 'Попробуйте ещё раз', color: '#F59E0B' });
        keepPending(null);
      })
      .finally(() => {
        sendingPending.current = false;
      });
    // pushToast and keepPending are local helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, online, connection, driverAccount]);

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
      const { user, granted } = await actions.saveCar('driver', { ...car, port: car.port.replace(/^Type(\d)$/, 'Type $1') });
      updateAccount('driver', user);
      const g = granted?.[0];
      if (g) {
        seenRewards.current.add(g.id);
        setBurst({ amount: g.amount, title: g.title });
      }
      await refresh();
      setScreen(carFrom.current);
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


  // The station card lives on the map, so opening one from any tab goes there.
  const handleSelectStation = (s: Station) => {
    setActiveTab('map');
    setSelectedStation(s);
    setScreen('station');
  };

  const backToStation = () => {
    setActiveTab('map');
    setScreen('station');
  };

  const handleBack = () => {
    setScreen('map');
    setSelectedStation(null);
  };

  const renderContent = () => {
    if (screen === 'charging-start') return <ChargingStartScreen station={selectedStation} preferConnector={preferPoint.current} onBack={backToStation} onConfirm={startCharging} onOpenQR={() => setScreen('qr-scan')} />;
    if (screen === 'charging-active') return <ChargingActiveScreen session={liveSession} startBattery={state?.vehicles.find(v => v.driverId === driverAccount?.id)?.battery ?? null} packKwh={driverAccount?.car?.battery} limit={driverAccount?.car?.chargeLimit} onStop={stopCharging} onLeave={() => { setActiveTab('charging'); setScreen('map'); }} />;
    if (screen === 'charging-done') return <ChargingDoneScreen session={lastSession} onClose={handleBack} />;
    if (screen === 'trip') return <TripPlannerScreen onBack={() => setScreen('map')} onSelectStation={handleSelectStation} />;
    if (screen === 'booking') return <BookingScreen station={selectedStation} onBack={backToStation} onConfirm={b => { setLastBooking(b); setScreen('booking-done'); }} />;
    if (screen === 'booking-done') return <BookingDoneScreen station={selectedStation} booking={lastBooking} onClose={handleBack} />;
    if (screen === 'add-car') return <AddCarScreen onBack={() => setScreen(carFrom.current)} onSave={saveCar} />;
    if (screen === 'battery') return <BatteryScreen onBack={() => setScreen(batteryFrom.current)} onAddCar={() => { carFrom.current = 'battery'; setScreen('add-car'); }} />;
    if (screen === 'rewards') return <RewardsScreen onBack={() => setScreen('profile')} onAddCar={() => { carFrom.current = 'rewards'; setScreen('add-car'); }} />;
    if (screen === 'notifications') return <NotificationsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'reviews') return <ReviewsScreen station={selectedStation} onBack={backToStation} />;
    if (screen === 'report') return <ReportScreen station={reportFrom.current === 'station' ? selectedStation : null} onBack={() => (reportFrom.current === 'station' ? backToStation() : setScreen(reportFrom.current))} />;
    if (screen === 'favorites') return <FavoritesScreen onBack={() => setScreen('map')} onSelectStation={handleSelectStation} />;
    if (screen === 'qr-scan') return <QRScanScreen onBack={() => (selectedStation && activeTab === 'map' ? setScreen('station') : setScreen('map'))} onStartCharging={(s, point) => { preferPoint.current = point ?? null; setActiveTab('map'); setSelectedStation(s); setScreen('charging-start'); }} onBook={s => { setActiveTab('map'); setSelectedStation(s); setScreen('booking'); }} onRoute={s => { setActiveTab('map'); setSelectedStation(s); setScreen('navigate'); }} />;
    if (screen === 'app-settings') return <AppSettingsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'wallet') return <WalletScreen onBack={() => setScreen(walletFrom.current)} onRewards={() => setScreen('rewards')} />;
    if (screen === 'eco') return <EcoScreen onBack={() => setScreen('profile')} />;
    if (screen === 'security') return <SecurityScreen onBack={() => setScreen('profile')} />;
    if (screen === 'finance') return <FinanceScreen onBack={() => setScreen('profile')} />;
    if (screen === 'loyalty') return <LoyaltyScreen onBack={() => setScreen('profile')} />;
    if (screen === 'family') return <FamilyScreen onBack={() => setScreen('profile')} />;
    if (screen === 'credit') return <CreditScreen onBack={() => setScreen('profile')} />;
    if (screen === 'navigate' && selectedStation) return <Navigator station={selectedStation} onClose={backToStation} onArrive={() => setScreen('charging-start')} />;
    if (screen === 'host') return <HostScreen onBack={() => setScreen('profile')} />;
    if (screen === 'support') return <SupportScreen onBack={() => setScreen('profile')} onReport={() => { reportFrom.current = 'support'; setScreen('report'); }} />;

    if (screen === 'history') return <HistoryScreen onBack={() => { setScreen('map'); setActiveTab('charging'); }} />;
    if (activeTab === 'deals') return <DealsScreen onSelectStation={st => { setActiveTab('map'); handleSelectStation(st); }} onRoute={st => { setActiveTab('map'); setSelectedStation(st); setScreen('navigate'); }} />;
    if (activeTab === 'profile') return <ProfileScreen onNavigate={s => { walletFrom.current = 'profile'; carFrom.current = 'profile'; batteryFrom.current = 'profile'; setScreen(s as Screen); }} />;
    if (activeTab === 'charging') return <ChargingHubScreen onNavigate={(s) => { carFrom.current = 'map'; batteryFrom.current = 'map'; setScreen(s as Screen); }} onSelectStation={st => { setActiveTab('map'); handleSelectStation(st); }} onOpenCharge={() => { setActiveTab('map'); setScreen('charging-active'); }} onRepeat={(st, cid, goal) => { setActiveTab('map'); setSelectedStation(st); void startCharging(cid, 'self', undefined, { goal }, st); }} />;

    return (
      <div className="relative w-full h-full">
        <DriverMap onSelectStation={handleSelectStation} onOpenWallet={() => { walletFrom.current = 'map'; setScreen('wallet'); }} onSos={() => setSos(true)} hideChrome={screen !== 'map'} selected={screen === 'station' ? selectedStation : null} autoLocate={!showOnboarding} />
        {sos && <SosSheet onClose={() => setSos(false)} />}
        {screen === 'station' && selectedStation && (
          <StationDetailSheet station={selectedStation} onClose={handleBack} onStartCharging={() => setScreen('charging-start')} onBook={() => setScreen('booking')} onReviews={() => setScreen('reviews')} onReport={() => { reportFrom.current = 'station'; setScreen('report'); }} onNavigate={() => setScreen('navigate')} />
        )}
      </div>
    );
  };

  const showTabs = !['history', 'charging-start', 'charging-active', 'charging-done', 'trip', 'booking', 'booking-done', 'add-car', 'notifications', 'reviews', 'report', 'favorites', 'qr-scan', 'app-settings', 'wallet', 'security', 'support', 'finance', 'loyalty', 'family', 'host', 'credit', 'navigate', 'eco', 'rewards', 'battery'].includes(screen);

  return (
    <div className="pg-app h-full flex flex-col bg-white overflow-hidden relative" style={{ fontFamily: 'Inter, sans-serif' }}>
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
        {/* A soft hand-over between screens; the map stays mounted under its station card. */}
        <div key={screen === 'map' || screen === 'station' ? `tab-${activeTab}` : `screen-${screen}`} className="pg-screen h-full">
          {renderContent()}
        </div>
      </div>

      {/* No signal: what is shown is the last data seen, and the saved roads still work */}
      {!online && !showOnboarding && (
        <div data-offline-banner className="absolute top-2 inset-x-3 z-40 flex justify-center pointer-events-none">
          <div role="status" className="pointer-events-auto max-w-full flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-2xl bg-[#111]/92 backdrop-blur text-white shadow-lg pg-reveal">
            <span className="w-7 h-7 rounded-xl bg-white/10 grid place-items-center shrink-0 animate-pulse">📡</span>
            <span className="text-xs leading-tight min-w-0">
              <span className="block font-semibold">{liveAt ? `Нет связи · данные на ${new Date(liveAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}` : 'Нет связи'}</span>
              <span className="block text-white/60 truncate">{packs.length ? `Сохранены трассы: ${packs.map(p => p.name).join(', ')}` : 'Перед дорогой сохраните трассу в «Поездке»'}</span>
            </span>
          </div>
        </div>
      )}
      {pending && showTabs && (
        <div className="absolute inset-x-3 bottom-[92px] z-40 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-2xl bg-white border border-amber-200 shadow-lg pg-sheet-in">
            <LoaderCircleIcon />
            <span className="text-xs text-slate-700 min-w-0 truncate">{`Ждём связь · старт на ${pending.stationName}`}</span>
            <button onClick={() => keepPending(null)} className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600">Отменить</button>
          </div>
        </div>
      )}

      {burst && <RewardBurst amount={burst.amount} title={burst.title} onDone={() => setBurst(null)} />}

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

      {/* Tab bar: a light floating pill; the yellow marker glides to the open tab */}
      {showTabs && (
        <div className="shrink-0 bg-white px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          <nav aria-label="Разделы" className="relative h-[64px] rounded-[26px] bg-white/90 backdrop-blur-xl border border-slate-100 grid grid-cols-5 items-center shadow-[0_10px_34px_rgba(22,22,26,0.12),0_2px_6px_rgba(22,22,26,0.05)]">
            <TabMarker slot={[0, 1, 3, 4][tabs.findIndex(t => t.id === activeTab)] ?? 0} />
            {[tabs[0], tabs[1], null, tabs[2], tabs[3]].map(tab => {
              if (!tab) {
                return (
                  <div key="qr" className="relative z-[3] flex justify-center">
                    <button onClick={() => setScreen('qr-scan')} aria-label="Сканировать QR на станции"
                      className="pg-qr -mt-9 w-[64px] h-[64px] rounded-[22px] grid place-items-center text-[#111] border-[5px] border-white"
                      style={{ background: 'linear-gradient(145deg,#FFE08A,#FFB000)', boxShadow: '0 10px 24px rgba(255,176,0,0.55)' }}>
                      <Scan size={26} strokeWidth={2.4} />
                    </button>
                  </div>
                );
              }
              const isActive = activeTab === tab.id;
              // The badge means a charge is running right now, nothing else.
              const isCharging = tab.id === 'charging' && !!liveSession;
              const promoCount = tab.id === 'deals' ? driverPromoCount : 0;
              return (
                <button key={tab.id} aria-current={isActive ? 'page' : undefined} onClick={() => { setActiveTab(tab.id); setScreen('map'); setSelectedStation(null); setSos(false); }}
                  className={`relative z-[2] h-full min-w-0 flex flex-col items-center justify-center gap-0.5 duration-300 ${isActive ? 'text-[#111]' : 'text-slate-400 hover:text-slate-700'}`}>
                  <span key={isActive ? 'on' : 'off'} className={`relative grid place-items-center ${isActive ? 'pg-icon-pop' : ''} ${isCharging ? 'pg-icon-charge' : ''}`}>
                    {tab.icon}
                    {isCharging && (
                      <span aria-hidden="true" className="absolute -top-1 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white" />
                      </span>
                    )}
                    {promoCount > 0 && !isActive && (
                      <span aria-hidden="true" className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#FF3B30] text-white text-[9px] font-bold grid place-items-center border-2 border-white">{promoCount}</span>
                    )}
                  </span>
                  <span className={`text-[10.5px] max-w-full truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

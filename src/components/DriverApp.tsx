import { useState, useEffect, useRef, type ReactNode } from 'react';
import { MapPin, Zap, Battery, Scan, User, Percent } from 'lucide-react';
import { Station } from '../data/mockData';
import { useLiveStations } from '../lib/live';
import DriverMap from './DriverMap';
import { useSync } from '../lib/sync';
import EcoScreen from './EcoScreen';
import { ChargingActiveScreen, ChargingDoneScreen } from './driver/Charging';
import HistoryScreen from './driver/History';
import ChargingHubScreen from './driver/Hub';
import TripPlannerScreen from './driver/Trip';
import { ProfileScreen, SecurityScreen, NotificationsScreen } from './driver/Account';
import { FinanceScreen, LoyaltyScreen, FamilyScreen, HostScreen, SosSheet } from './driver/Extras';
import { CreditScreen } from './driver/Credit';
import Navigator from './driver/Navigator';
import DealsScreen from './driver/Deals';
import QRScanScreen from './driver/QRScan';
import RewardsScreen, { RewardBurst } from './driver/Rewards';
import ReferralScreen from './driver/Referral';
import BatteryScreen from './driver/Battery';
import PlusScreen from './driver/Plus';
import AutochargeScreen from './driver/Autocharge';
import { useOfflinePacks, savedStations } from '../lib/offline';
import { usePlatform } from '../lib/platform';
import { useDriverPromos } from '../lib/promos';
import type { Payer, ChargeGoal } from '../lib/api';
import { km, locate } from '../lib/geo';
import { inTelegram, telegramInitData } from '../lib/telegram';
import type { Booking, Session } from '../lib/api';
import Tour from './driver/Tour';
import { readFirstRun, tourSeen, markTour } from '../lib/firstRun';
import { subscribePush } from './PushToggle';
import { enableNativePush, nativePushAvailable } from '../lib/nativePush';
import { BookingDoneScreen, BookingScreen } from './driver/screens/Booking';
import { AddCarScreen } from './driver/screens/Car';
import { type ChargeOptions, ChargingStartScreen, useLargeMode } from './driver/screens/ChargingStart';
import { FavoritesScreen } from './driver/screens/Favorites';
import { OnboardingScreen } from './driver/screens/Onboarding';
import { ReportScreen, ReviewsScreen } from './driver/screens/Reviews';
import { AppSettingsScreen } from './driver/screens/Settings';
import { StationDetailSheet } from './driver/screens/StationSheet';
import { SupportScreen } from './driver/screens/Support';
import { WalletScreen } from './driver/screens/Wallet';

type Screen = 'map' | 'station' | 'charging-start' | 'charging-active' | 'charging-done' | 'history' | 'profile' | 'trip' | 'booking' | 'booking-done' | 'add-car' | 'notifications' | 'reviews' | 'report' | 'favorites' | 'qr-scan' | 'onboarding' | 'app-settings' | 'finance' | 'loyalty' | 'family' | 'host' | 'wallet' | 'security' | 'support' | 'eco' | 'credit' | 'navigate' | 'rewards' | 'battery' | 'plus' | 'autocharge' | 'referral';
type Tab = 'map' | 'charging' | 'deals' | 'profile';
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
  // The car question, once per account on a device — not at all when the account already has its car.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (driverAccount?.car) return false;
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
  const { onboarding } = usePlatform();
  const appRef = useRef<HTMLDivElement>(null);
  const [touring, setTouring] = useState(false);
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
    if (go === 'deals') setActiveTab('deals');
    // From the lock-screen notice: straight to the running charge when there is one.
    if (go === 'charging') {
      if (state?.sessions.some(s => s.status === 'active' && s.userId === driverAccount.id)) setScreen('charging-active');
      else setActiveTab('charging');
    }
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

  // The tour once per account, after the car screens, when the map is in front.
  useEffect(() => {
    if (!driverAccount || showOnboarding || touring || !onboarding.tour || tourSeen(driverAccount.id)) return;
    if (screen === 'map' && activeTab === 'map') setTouring(true);
  }, [driverAccount, showOnboarding, touring, onboarding.tour, screen, activeTab]);
  const endTour = () => {
    if (driverAccount) markTour(driverAccount.id);
    setTouring(false);
  };

  // The agreement accepted on this device's first screens becomes the account's record.
  useEffect(() => {
    const local = readFirstRun();
    if (!driverAccount || !local || (driverAccount.consent?.version ?? 0) >= local.version) return;
    actions.acceptConsent({ version: local.version, marketing: local.marketing }).then(r => updateAccount('driver', r.user)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverAccount?.id, driverAccount?.consent?.version]);

  // Notifications allowed on the first screens: subscribe the account once it exists.
  useEffect(() => {
    // The store app: the phone's token is sent on every start, as Firebase may change it.
    if (driverAccount && readFirstRun()?.push && nativePushAvailable()) {
      void enableNativePush().catch(() => {});
      return;
    }
    if (!driverAccount || !readFirstRun()?.push || !('Notification' in window) || Notification.permission !== 'granted') return;
    const key = `pg-push-${driverAccount.id}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    subscribePush('driver')
      .then(() => {
        try {
          localStorage.setItem(key, '1');
        } catch {
          /* private mode */
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverAccount?.id]);

  // A new campaign of Voli's, while the app is open: a notice that leads to the deals.
  const seenCampaign = useRef<string | null>(null);
  useEffect(() => {
    const c = events.find(e => e.type === 'promo.campaign' && Date.now() - Date.parse(e.ts) < 60_000);
    if (!c || seenCampaign.current === c.id || !driverAccount) return;
    seenCampaign.current = c.id;
    pushToast({ icon: '🎁', title: 'Новая акция Voli', body: c.message, color: '#FFB000' });
    // pushToast is a stable local helper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, driverAccount]);

  const seenQueueEvent = useRef<string | null>(null);
  useEffect(() => {
    const ready = events.find(
      e => e.type === 'queue.ready' && (e.payload as { userId?: string })?.userId === driverAccount?.id,
    );
    if (ready && seenQueueEvent.current !== ready.id) {
      seenQueueEvent.current = ready.id;
      pushToast({ icon: '🔌', title: 'Ваша очередь подошла', body: `${ready.message} · держим ${state?.platform?.queueHoldMin ?? 5} минут`, color: '#22C55E' });
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
          body: err instanceof Error ? err.message : 'Попробуйте другой разъём',
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
    if (screen === 'autocharge') return <AutochargeScreen onBack={() => setScreen('profile')} />;
    if (screen === 'plus') return <PlusScreen onBack={() => setScreen('profile')} onTopUp={() => { walletFrom.current = 'plus'; setScreen('wallet'); }} />;
    if (screen === 'battery') return <BatteryScreen onBack={() => setScreen(batteryFrom.current)} onAddCar={() => { carFrom.current = 'battery'; setScreen('add-car'); }} />;
    if (screen === 'referral') return <ReferralScreen onBack={() => setScreen('profile')} />;
    if (screen === 'rewards') return <RewardsScreen onBack={() => setScreen('profile')} onAddCar={() => { carFrom.current = 'rewards'; setScreen('add-car'); }} />;
    if (screen === 'notifications') return <NotificationsScreen onBack={() => setScreen('profile')} />;
    if (screen === 'reviews') return <ReviewsScreen station={selectedStation} onBack={backToStation} />;
    if (screen === 'report') return <ReportScreen station={reportFrom.current === 'station' ? selectedStation : null} onBack={() => (reportFrom.current === 'station' ? backToStation() : setScreen(reportFrom.current))} />;
    if (screen === 'favorites') return <FavoritesScreen onBack={() => setScreen('map')} onSelectStation={handleSelectStation} />;
    if (screen === 'qr-scan') return <QRScanScreen onBack={() => (selectedStation && activeTab === 'map' ? setScreen('station') : setScreen('map'))} onStartCharging={(s, point) => { preferPoint.current = point ?? null; setActiveTab('map'); setSelectedStation(s); setScreen('charging-start'); }} onBook={s => { setActiveTab('map'); setSelectedStation(s); setScreen('booking'); }} onRoute={s => { setActiveTab('map'); setSelectedStation(s); setScreen('navigate'); }} />;
    if (screen === 'app-settings') return <AppSettingsScreen onBack={() => setScreen('profile')} onReplayTour={() => { if (driverAccount) markTour(driverAccount.id, false); setActiveTab('map'); setScreen('map'); }} />;
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
          <StationDetailSheet station={selectedStation} onClose={handleBack} onStartCharging={id => { preferPoint.current = id ?? null; setScreen('charging-start'); }} onBook={() => setScreen('booking')} onReviews={() => setScreen('reviews')} onReport={() => { reportFrom.current = 'station'; setScreen('report'); }} onNavigate={() => setScreen('navigate')} onOpenStation={id => { const s = liveStationsById(id); if (s) handleSelectStation(s); }} />
        )}
      </div>
    );
  };

  const showTabs = !['history', 'charging-start', 'charging-active', 'charging-done', 'trip', 'booking', 'booking-done', 'add-car', 'notifications', 'reviews', 'report', 'favorites', 'qr-scan', 'app-settings', 'wallet', 'security', 'support', 'finance', 'loyalty', 'family', 'host', 'credit', 'navigate', 'eco', 'rewards', 'battery', 'plus', 'autocharge', 'referral'].includes(screen);

  return (
    <div ref={appRef} className="pg-app h-full flex flex-col bg-white overflow-hidden relative" style={{ fontFamily: 'Inter, sans-serif' }}>
      {showOnboarding && <OnboardingScreen onComplete={finishOnboarding} />}
      {touring && <Tour root={appRef} onDone={endTour} />}
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
                    <button onClick={() => setScreen('qr-scan')} aria-label="Сканировать QR на станции" data-tour="qr"
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
                <button key={tab.id} data-tour={`tab-${tab.id}`} aria-current={isActive ? 'page' : undefined} onClick={() => { setActiveTab(tab.id); setScreen('map'); setSelectedStation(null); setSos(false); }}
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

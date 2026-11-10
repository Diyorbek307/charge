// Moved out of DriverApp.tsx: ArrivalBlock, StationDetailSheet.
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { MapPin, Navigation, Zap, Clock, Star, ChevronRight, Home, X, Scan, Heart, Wifi, Coffee, ParkingCircle, Toilet, CalendarCheck, AlertTriangle, Percent, Share2, ShieldCheck } from 'lucide-react';
import { Station } from '../../../data/mockData';
import { useSync } from '../../../lib/sync';
import { GreenHourBanner } from '../../EcoScreen';
import { useFavorites } from '../favorites';
import { StationForecastBlock, StationCommunityBlock } from '../StationExtras';
import Navigator from '../Navigator';
import { openInYandex } from '../../../lib/externalNav';
import AddStationPhoto from '../AddStationPhoto';
import { useRoadDistance } from '../../../lib/nav';
import WhileCharging from '../WhileCharging';
import { usePlatform } from '../../../lib/platform';
import { NetworkBadge } from '../NetworkBadge';
import { promoNow, promosOf, promoHours, useDriverPromos, promoGiver } from '../../../lib/promos';
import { useMyLocation, km, fmtKm, driveMinutes, openNow } from '../../../lib/geo';
import type { ArrivalChance } from '../../../lib/api';
import PriceToday from '../PriceToday';
import { API_ORIGIN } from '../../../lib/site';
import { useTariffNow, priceNow } from '../../../lib/tariff';
import { ConnectorTile } from './ChargingStart';
import { hm, statusColor } from './shared';

/**
 * "Will it be free when I get there?" — the chance of a free point at the
 * arrival time, with booking and nearby stations when the chance is low.
 */
export function ArrivalBlock({ station, etaMin, onBook, onOpen }: { station: Station; etaMin: number; onBook: () => void; onOpen: (id: string) => void }) {
  const { actions, state } = useSync();
  const [a, setA] = useState<ArrivalChance | null>(null);
  // Live statuses change the answer; the request is cheap and cached by the minute.
  const busyKey = station.connectors.map(c => c.status).join();
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => void actions.arrival(station.id, etaMin).then(r => alive && setA(r)).catch(() => alive && setA(null)), 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [actions, station.id, etaMin, busyKey, state?.queues?.length]);
  if (!a) return null;
  const look = a.verdict === 'likely' ? { text: 'Скорее всего свободно', color: '#16A34A', bg: '#F0FDF4' } : a.verdict === 'maybe' ? { text: 'Может быть занято', color: '#B45309', bg: '#F7FEE7' } : { text: 'Скорее всего займут', color: '#DC2626', bg: '#FEF2F2' };
  const at = new Date(Date.now() + a.etaMin * 60_000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  return (
    <div className="mb-3 rounded-2xl border p-3.5 pg-reveal" style={{ background: look.bg, borderColor: `${look.color}33` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">{`Когда доедете · ~${at}`}</p>
        <span className="text-xs font-extrabold tabular-nums" style={{ color: look.color }}>{`${a.chance}%`}</span>
      </div>
      <p className="text-sm font-bold mt-0.5" style={{ color: look.color }}>{look.text}</p>
      <div className="h-1.5 rounded-full bg-white/70 mt-2 overflow-hidden">
        <div className="h-full rounded-full pg-bar" style={{ width: `${a.chance}%`, background: look.color }} />
      </div>
      {a.verdict !== 'likely' && (
        <div className="mt-2.5 space-y-1.5">
          {a.waitAfterMin !== null && <p className="text-xs text-slate-600">{`Если займут — освободится примерно через ${a.waitAfterMin} мин после приезда`}</p>}
          <button onClick={onBook} className="w-full py-2 rounded-xl bg-white text-sm font-semibold text-slate-800 border border-slate-200 inline-flex items-center justify-center gap-1.5"><CalendarCheck size={14} />Забронировать на это время</button>
          {a.alternatives.map(x => (
            <button key={x.stationId} onClick={() => onOpen(x.stationId)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800 truncate">{x.name}</span>
                <span className="block text-[11px] text-slate-500">{`${fmtKm(x.km)} от этой · ${x.operator}`}</span>
              </span>
              <span className="text-xs font-extrabold text-emerald-600 tabular-nums">{`${x.chance}%`}</span>
              <ChevronRight size={14} className="text-slate-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StationDetailSheet({ station, onClose, onStartCharging, onBook, onReviews, onReport, onNavigate, onOpenStation }: { station: Station; onClose: () => void; onStartCharging: (connectorId?: string) => void; onBook: () => void; onReviews: () => void; onReport: () => void; onNavigate: () => void; onOpenStation: (id: string) => void }) {
  const free = station.connectors.filter(c => c.status === 'available').length;
  const { state, actions, sessions: portalSessions, refresh } = useSync();
  // Opened and nothing free: demand this station does not meet. Once per station per visit, with no name.
  useEffect(() => {
    if (free > 0) return;
    const key = `voli-busy-${station.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    actions.reportDemand({ kind: 'busy', stationId: station.id }).catch(() => {});
  }, [free, station.id, actions]);
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
  // The time-of-day band the charge would start at, so the card shows what the driver will pay.
  const tariffK = useTariffNow();
  const later = promo ? null : promosOf(opRef, driverPromos)[0] ?? null;
  const pointStatus: Record<string, { text: string; color: string; bg: string }> = {
    available: { text: 'Свободно', color: '#16A34A', bg: '#F0FDF4' },
    occupied: { text: 'Заряжается', color: '#EA580C', bg: '#FFF7ED' },
    reserved: { text: 'Забронировано', color: '#D97706', bg: '#F7FEE7' },
    unavailable: { text: 'Не работает', color: '#64748B', bg: '#F8FAFC' },
  };
  const maxKw = Math.max(0, ...station.connectors.map(c => c.power));
  // What the admin has switched on.
  const { features: on } = usePlatform();
  // Nothing to queue for when every point is out of order, and no start while the site is shut.
  const working = station.connectors.filter(c => c.status !== 'unavailable').length;
  const closed = !openNow(station.hours);

  // The card slides away the way it came: by the cross, or pulled down by its handle.
  // It opens half way, the map and the way to the station above it; pulled up or scrolled, it opens fully.
  const sheet = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
    drag.current.dy = e.clientY - drag.current.y;
    if (drag.current.dy < 0) return; // upwards: opens the card on release
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const dragEnd = () => {
    const el = sheet.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d) return;
    if (d.dy < -30) {
      setExpanded(true);
      return;
    }
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

  // The operator's own photo first, then the rest; the first is the cover.
  const photos = [...new Set([station.photoAt ? `${API_ORIGIN}/api/stations/${station.id}/photo?v=${encodeURIComponent(station.photoAt)}` : null, station.image, ...(station.gallery ?? []).map(g => `${API_ORIGIN}/api/stations/${station.id}/gallery/${g.id}?v=${encodeURIComponent(g.at)}`)].filter((u): u is string => !!u))];
  const [shared, setShared] = useState<string | null>(null);
  const share = async () => {
    const url = `${window.location.origin}/?portal=driver&station=${station.id}`;
    try {
      if (navigator.share) await navigator.share({ title: station.name, text: `${station.name} · ${station.address}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared('Ссылка на станцию скопирована');
        setTimeout(() => setShared(null), 2500);
      }
    } catch {
      /* the driver closed the share sheet */
    }
  };
  const canStart = !mapOnly && !closed;
  const overlayBtn = 'w-10 h-10 rounded-full grid place-items-center bg-black/45 backdrop-blur-md text-white hover:bg-black/60 transition-colors';

  return (
    <div ref={sheet} data-sheet data-expanded={expanded || undefined} onScroll={e => { if (!expanded && e.currentTarget.scrollTop > 6) setExpanded(true); }}
      className={`absolute inset-x-0 bottom-0 z-30 bg-white rounded-t-[28px] shadow-[0_-12px_40px_rgba(15,23,42,0.18)] ${expanded ? 'max-h-[88%]' : 'max-h-[54%]'} transition-[max-height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] overflow-y-auto overscroll-contain ${leaving ? 'pg-sheet-out' : 'pg-sheet-in'}`}>
      {/* The cover photo, with close, share and favourite over it; pull it down to close */}
      <div className={`relative ${expanded ? 'h-52' : 'h-32'} transition-[height] duration-500 bg-slate-800 rounded-t-[28px] overflow-hidden touch-none cursor-grab active:cursor-grabbing`} onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        {/* With no signal the photo may not load: the card keeps a calm tile instead of a broken image. */}
        <span className="absolute inset-0 grid place-items-center text-white/20" aria-hidden="true"><Zap size={40} /></span>
        {photos[0] && <img src={photos[0]} alt={station.name} className="relative w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/25 pointer-events-none" />
        <div className="absolute top-2 inset-x-0 mx-auto w-10 h-1 bg-white/70 rounded-full" />
        <div className="absolute top-4 inset-x-3 flex items-center justify-between">
          <button onClick={close} aria-label="Закрыть" className={overlayBtn}><X size={19} /></button>
          <span className="flex gap-2">
            <AddStationPhoto stationId={station.id} className={overlayBtn} onNote={t => { setShared(t); setTimeout(() => setShared(null), 3500); }} />
            <button onClick={share} aria-label="Поделиться станцией" className={overlayBtn}><Share2 size={17} /></button>
            <button onClick={() => favorites.toggle(station.id)} aria-pressed={favorite} aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'} className={overlayBtn}>
              <Heart key={String(favorite)} size={18} className={favorite ? 'fill-red-500 text-red-500 pg-pop' : ''} />
            </button>
          </span>
        </div>
        <span className="absolute bottom-3 left-3 flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-white text-xs font-semibold">
          <NetworkBadge name={station.operator} size={22} promo={!!promo} />{station.operator}
        </span>
      </div>

      <div className="px-4 pt-4 pb-6">
        {shared && <p role="status" className="mb-2 text-xs text-emerald-700">{shared}</p>}
        {/* Name, where, how far, open or not */}
        <h2 className="text-[26px] font-extrabold text-slate-900 leading-tight tracking-tight">{station.name}</h2>
        <div className="mt-1 flex items-start justify-between gap-3 text-sm">
          <p className="text-slate-500 min-w-0">{`${station.address}, ${station.city}`}</p>
          {dist !== null && <span key={road ? 'road' : 'crow'} className={`shrink-0 inline-flex items-center gap-1 font-semibold text-slate-700 ${road ? 'pg-pop' : ''}`} title={road ? 'По дороге' : 'По прямой — уточняем по дорогам'}><Navigation size={13} className="text-[#3D6B00]" />{`${road ? '' : '≈ '}${fmtKm(dist)}`}</span>}
        </div>
        <div className="mt-2.5 flex items-center flex-wrap gap-2 text-sm">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${closed ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
            <Clock size={12} />{closed ? `Закрыто · ${station.hours}` : `Открыто · ${station.hours}`}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700"><Star size={12} className="fill-[#C6F432] text-[#C6F432]" />{station.rating.toFixed(1)}</span>
          {station.reliability && (
            <span title={`Удачных запусков за 30 дней${station.reliability.uptime !== null ? ` · в работе ${Math.round(station.reliability.uptime)}% времени` : ''}`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${station.reliability.score >= 95 ? 'bg-emerald-50 text-emerald-700' : station.reliability.score >= 85 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-600'}`}>
              <ShieldCheck size={12} />{`Надёжность ${Math.round(station.reliability.score)}%`}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700"><Zap size={12} />{`до ${maxKw} кВт`}</span>
          {drive !== null && <span className="inline-flex items-center gap-1 text-xs text-slate-500">{`${hm(drive)} в пути`}</span>}
        </div>

        {/* More photos of the site */}
        {photos.length > 1 && (
          <div className="mt-4 -mx-4 px-4 flex gap-2.5 overflow-x-auto no-scrollbar snap-x">
            {photos.slice(1).map(src => (
              <img key={src} src={src} alt="" loading="lazy" className="snap-start shrink-0 w-[46%] h-24 rounded-2xl object-cover bg-slate-100" onError={e => { e.currentTarget.style.display = 'none'; }} />
            ))}
          </div>
        )}

        {/* The network's own discount, now or later today */}
        {(promo || later) && (
          <div className="mt-4 rounded-2xl px-3.5 py-3 flex items-center gap-3" style={{ background: promo ? 'linear-gradient(135deg,#E2F99A,#C6F432)' : '#F7FEE7' }}>
            <span className="w-10 h-10 rounded-xl bg-[#111] text-[#C6F432] grid place-items-center shrink-0"><Percent size={19} strokeWidth={2.6} /></span>
            {promo ? (
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold text-[#111]">{`−${promo.percent}% · ${promo.title}`}</span>
                <span className="block text-xs text-[#111]/70">{`${promo.firstOnly ? (promo.operatorId ? 'На первую зарядку в сети · ' : 'На первую зарядку · ') : ''}${promoHours(promo)} · скидку даёт ${promoGiver(promo, station.operator)}`}</span>
              </span>
            ) : later && (
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold text-[#111]">{`−${later.percent}% · ${promoHours(later)}`}</span>
                <span className="block text-xs text-[#111]/70">{`${later.title} — в эти часы цена ниже`}</span>
              </span>
            )}
          </div>
        )}

        {on.arrival && drive !== null && !mapOnly && <div className="mt-3"><ArrivalBlock station={station} etaMin={drive} onBook={onBook} onOpen={onOpenStation} /></div>}

        {/* How to find it on site */}
        {station.findHint && (
          <div className="mt-3 flex gap-2 items-start rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
            <MapPin size={15} className="text-[#3d6b00] mt-0.5 shrink-0" />
            <p className="text-sm text-slate-700"><span className="font-semibold">Как найти: </span>{station.findHint}</p>
          </div>
        )}

        {/* Connectors: each a lettered point, like on the charger, with its own start */}
        <div className="mt-5 mb-2.5 flex items-baseline justify-between">
          <h3 className="text-[17px] font-bold text-slate-900">Доступные разъёмы</h3>
          <span className="text-xs font-semibold" style={{ color: statusColor[station.status] }}>{`${free} из ${station.connectors.length} свободно`}</span>
        </div>
        <div className="space-y-2.5 mb-4">
          {station.connectors.map((c, i) => {
            const look = pointStatus[c.status] ?? pointStatus.unavailable;
            const isFree = c.status === 'available';
            return (
              <div key={c.id} className="flex items-center gap-3 p-2.5 pr-3 rounded-2xl border border-slate-100 bg-white" style={c.status === 'unavailable' ? { background: '#F8FAFC' } : undefined}>
                <ConnectorTile letter={String.fromCharCode(65 + i)} dc={c.power >= 50} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-900 leading-tight">{`${c.power >= 50 ? 'DC' : 'AC'} ${c.type}`}<span className="ml-1.5 text-[13px] font-semibold text-slate-600">{`${c.power} кВт`}</span></p>
                  <p className="text-[12px] text-slate-500 tabular-nums mt-0.5 whitespace-nowrap">
                    {(promo || tariffK < 1) && <span className="text-slate-400 line-through mr-1">{c.price.toLocaleString('ru-RU')}</span>}
                    <span className={`font-semibold ${promo || tariffK < 1 ? 'px-1.5 rounded-md bg-[#C6F432] text-[#111]' : 'text-slate-700'}`}>{priceNow(c.price, tariffK, promo?.percent).toLocaleString('ru-RU')}</span>
                    {' сум/кВт·ч'}
                  </p>
                  <p className="text-xs font-semibold inline-flex items-center gap-1 mt-0.5" style={{ color: look.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: look.color }} />{look.text}
                  </p>
                </div>
                {isFree && canStart ? (
                  <button onClick={() => onStartCharging(c.id)} className="shrink-0 px-4 py-3 rounded-xl text-sm font-bold text-[#111] active:scale-95 transition-transform" style={{ background: 'linear-gradient(135deg,#D9F77A,#8FD61A)', boxShadow: '0 4px 12px rgba(143,214,26,0.3)' }}>
                    Зарядиться
                  </button>
                ) : (
                  <span className="shrink-0 px-3.5 py-3 rounded-xl text-sm font-semibold text-slate-400 bg-slate-100">
                    {isFree ? (closed ? 'Закрыто' : 'В приложении сети') : c.status === 'occupied' ? 'Занят' : c.status === 'reserved' ? 'Бронь' : 'Не работает'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {!mapOnly && <PriceToday station={opRef} basePrice={Math.min(...station.connectors.filter(c => c.status !== 'unavailable').map(c => c.price), Infinity) || 0} promos={driverPromos} />}
        <StationForecastBlock stationId={station.id} connectors={station.connectors} />
        {on.places && <div className="mb-4"><WhileCharging stationId={station.id} /></div>}
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
            <p className="text-xs text-slate-500 mt-0.5">Эта сеть пока не подключена к запуску из Voli. Здесь — расположение, разъёмы и цены.</p>
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {working === 0 || closed ? (
            // Out of order or shut: say why instead of offering a start that would fail.
            <div className="rounded-2xl py-3 bg-slate-100 text-slate-500 text-sm font-semibold flex flex-col items-center justify-center leading-tight text-center px-2">
              <span>{working === 0 ? 'Станция не работает' : 'Сейчас закрыто'}</span>
              <span className="text-[10px] font-normal">{working === 0 ? 'Все разъёмы неисправны' : `Часы работы ${station.hours}`}</span>
            </div>
          ) : free === 0 && !myTurn && on.queue ? (
            <button onClick={toggleQueue} disabled={queueBusy}
              className={`${myIndex >= 0 ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-violet-600 hover:bg-violet-700 text-white'} rounded-2xl py-3 font-semibold text-sm transition-colors flex flex-col items-center justify-center leading-tight disabled:opacity-60`}>
              <span>{myIndex >= 0 ? `Вы №${myIndex + 1} · выйти` : 'Встать в очередь'}</span>
              <span className="text-[10px] font-normal opacity-80">{queue.length} в очереди</span>
            </button>
          ) : (
            <button onClick={() => onStartCharging()}
              className={`${myTurn ? 'bg-green-500 hover:bg-green-600 animate-pulse text-white' : 'text-[#111]'} rounded-2xl py-3.5 font-bold text-[15px] transition-transform active:scale-[0.98] flex items-center justify-center gap-2`}
              style={myTurn ? undefined : { background: 'linear-gradient(135deg,#D9F77A,#8FD61A)', boxShadow: '0 6px 18px rgba(143,214,26,0.35)' }}>
              <Scan size={16} />{myTurn ? 'Ваша очередь — начать' : 'Начать зарядку'}
            </button>
          )}
          {on.bookings ? <button onClick={onBook}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <CalendarCheck size={16} />Забронировать
          </button> : <span />}
        </div>
        )}
        <GreenHourBanner />
        {queueError && (
          <p role="alert" className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{queueError}</p>
        )}
        {/* Navigation inside the app: route, voice, cameras. */}
        <div className="flex gap-2 mb-2">
          {on.navigator && <button onClick={onNavigate} className="flex-1 min-w-0 bg-[#111] text-white rounded-2xl py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <Navigation size={17} className="text-[#C6F432] fill-[#C6F432] shrink-0" /><span className="truncate">{dist !== null && drive !== null ? `Маршрут · ${road ? '' : '≈ '}${fmtKm(dist)} · ${hm(drive)}` : 'Маршрут'}</span>
          </button>}
          {/* The same route in Yandex Navigator, for those who drive with it. */}
          <button onClick={() => openInYandex({ lat: station.geoLat, lng: station.geoLng }, station.name)} aria-label="Открыть в Яндекс Навигаторе" title="Открыть в Яндекс Навигаторе"
            className={`${on.navigator ? 'px-3.5' : 'flex-1'} bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2`}>
            <span aria-hidden="true" className="w-5 h-5 rounded-full bg-[#FC3F1D] text-white text-[11px] font-black grid place-items-center">Я</span>{on.navigator ? 'Яндекс' : 'Маршрут в Яндекс Навигаторе'}
          </button>
        </div>
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

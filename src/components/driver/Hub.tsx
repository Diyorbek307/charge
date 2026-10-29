import { useEffect, useState } from 'react';
import { BatteryMedium, MapPin, Scan, Route, Zap, Moon, Sun, Clock, Calendar, Users, Car, ChevronRight, Navigation, Wallet, RotateCcw, X, History, Heart } from 'lucide-react';
import type { Station } from '../../data/mockData';
import type { TariffForecast, ChargeGoal } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';
import { useMyLocation, locate as askLocation, samePort } from '../../lib/geo';
import { promoNow, discounted, useDriverPromos } from '../../lib/promos';

const BAND_LABEL: Record<string, string> = { green: 'Зелёные часы', day: 'Дневной тариф', standard: 'Обычный тариф', peak: 'Вечерний пик' };
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
/** Great-circle distance in km. */
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The "Charging" tab: what is going on for me right now, and where I can charge next. */
export default function ChargingHubScreen({ onNavigate, onSelectStation, onOpenCharge, onRepeat }: { onNavigate: (s: string) => void; onSelectStation: (s: Station) => void; onOpenCharge: () => void; onRepeat: (station: Station, connectorId: string, goal: ChargeGoal) => void }) {
  const { state, sessions, actions, refresh } = useSync();
  const me = sessions.driver;
  const stations = useLiveStations();
  const [forecast, setForecast] = useState<TariffForecast | null>(null);
  // Shared with the map and the station card.
  const here = useMyLocation();
  const [locating, setLocating] = useState(false);
  const promos = useDriverPromos();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cancelBooking = async (id: string) => {
    setCancelling(id);
    try {
      const { refunded } = await actions.cancelBooking('driver', id);
      await refresh();
      setNote(refunded ? 'Бронь отменена — 2 000 сум вернулись на кошелёк' : 'Бронь отменена');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось отменить бронь');
    } finally {
      setCancelling(null);
      setTimeout(() => setNote(null), 3500);
    }
  };
  const stationOf = (id: string) => stations.find(s => s.id === id);

  useEffect(() => {
    actions.tariffForecast().then(setForecast).catch(() => setForecast(null));
  }, [actions]);

  const live = state?.sessions.find(s => s.status === 'active' && s.userId === me?.id);
  const bookings = (state?.bookings ?? []).filter(b => b.userId === me?.id && b.status === 'active');
  const queue = (state?.queues ?? []).filter(q => q.userId === me?.id);
  const car = me?.car;
  const companyCar = state?.vehicles.find(v => v.driverId === me?.id);
  const scheduled = state?.scheduled ?? [];

  // "Like last time": the same station, connector type and goal, in one tap.
  const last = [...(state?.sessions ?? [])].filter(s => s.userId === me?.id && s.status === 'completed').sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''))[0];
  const lastStation = last ? stations.find(s => s.id === last.stationId) : undefined;
  const lastConnector = lastStation?.connectors.find(c => c.id === last?.connectorId && c.status === 'available') ?? lastStation?.connectors.find(c => c.status === 'available' && c.type === last?.connector);
  const lastGoal: ChargeGoal = last?.goal ? (last.goal.kind === 'percent' ? { kind: 'percent', value: last.goal.value } : { kind: last.goal.kind, value: last.goal.value }) : { kind: 'percent', value: car?.chargeLimit ?? 80 };
  const goalLabel = (g: ChargeGoal) => (g.kind === 'percent' ? `до ${g.value}%` : g.kind === 'km' ? `на ${g.value} км` : `на ${g.value.toLocaleString('ru-RU')} сум`);

  const free = stations
    .filter(s => s.connectors.some(c => c.status === 'available'))
    .map(s => ({ s, d: here ? km(here, { lat: s.geoLat, lng: s.geoLng }) : null }))
    .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : b.s.connectors.filter(c => c.status === 'available').length - a.s.connectors.filter(c => c.status === 'available').length))
    .slice(0, 5);

  const locate = () => {
    setLocating(true);
    void askLocation().then(() => setLocating(false));
  };

  /**
   * The cheapest place to charge from here: the energy the car needs at each
   * station's price right now, plus the energy spent driving there. Only free
   * connectors that fit the car, within 60 km.
   */
  const mult = forecast?.current.multiplier ?? 1;
  const needKwh = car ? Math.max(10, (car.battery * ((car.chargeLimit ?? 80) - 20)) / 100) : 30;
  const fits = (type: string) => !car || samePort(type, car.port) || (car.port === 'CCS2' && samePort(type, 'Type 2'));
  const options = here
    ? stations
        .map(st => {
          const conns = st.connectors.filter(c => c.status === 'available' && fits(c.type));
          if (!conns.length) return null;
          const d = km(here, { lat: st.geoLat, lng: st.geoLng });
          if (d > 60) return null;
          // The network's own discount counts: it is what the driver will pay.
          const promo = promoNow({ id: st.id, operatorId: (st as Station & { operatorId?: string }).operatorId }, promos);
          const c = conns.reduce((a, b) => (b.price < a.price ? b : a));
          const price = Math.round(discounted(c.price, promo) * mult);
          const roadKwh = d * 1.3 * 0.18;
          return { st, d, price, power: c.power, charge: needKwh * price, total: (needKwh + roadKwh) * price };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  const nearest = options.length ? options.reduce((a, b) => (b.d < a.d ? b : a)) : null;
  const ranked = [...options].sort((a, b) => a.total - b.total).slice(0, 3);
  const cheapest = ranked[0];
  const saving = cheapest && nearest && cheapest.st.id !== nearest.st.id ? Math.round(nearest.total - cheapest.total) : 0;

  const cur = forecast?.current;
  const best = forecast?.bestWindow;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100">
        <h1 className="text-lg font-bold text-slate-900">Зарядка</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {car ? `${car.brand} ${car.model} · ${car.battery} кВт·ч · ${car.port}` : companyCar ? `${companyCar.model} · заряд ${companyCar.battery}%` : 'Добавьте автомобиль в профиле — для точных оценок'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pg-stagger">
        {note && <p role="status" className="text-xs text-slate-700 bg-white border border-slate-100 rounded-xl px-3 py-2 pg-reveal">{note}</p>}
        {live && (
          <button onClick={onOpenCharge} className="w-full rounded-2xl p-4 text-left text-white flex items-center gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #065F46, #047857)' }}>
            <span className="absolute inset-0 pointer-events-none opacity-30" style={{ background: 'linear-gradient(100deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%)', backgroundSize: '200% 100%', animation: 'pg-shine 2.4s linear infinite' }} />
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center pg-icon-charge"><Zap size={18} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Идёт зарядка</p>
              <p className="text-xs text-white/80 truncate">{`${live.stationName} · с ${time(live.start)}`}</p>
            </div>
            <ChevronRight size={16} />
          </button>
        )}

        {bookings.map(b => {
          const st = stationOf(b.stationId);
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-violet-100 p-4 flex items-center gap-3">
              <button onClick={() => st && onSelectStation(st)} disabled={!st} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0"><Calendar size={17} className="text-violet-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{`Бронь ${b.code ?? ''} · ${b.stationName ?? ''}`}</p>
                  <p className="text-xs text-slate-500">{`${time(b.startsAt)}–${time(b.endsAt)} · держим до ${time(b.graceUntil)}`}</p>
                </div>
              </button>
              <button onClick={() => void cancelBooking(b.id)} disabled={cancelling === b.id} aria-label={`Отменить бронь ${b.code ?? ''}`} className="p-2 rounded-xl bg-slate-100 disabled:opacity-50"><X size={15} /></button>
            </div>
          );
        })}

        {queue.map(q => {
          const st = stationOf(q.stationId);
          return (
            <button key={q.id} onClick={() => st && onSelectStation(st)} className={`w-full bg-white rounded-2xl border p-4 flex items-center gap-3 text-left ${q.notified ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-sky-100'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${q.notified ? 'bg-emerald-50 animate-pulse' : 'bg-sky-50'}`}><Users size={17} className={q.notified ? 'text-emerald-600' : 'text-sky-600'} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{`Очередь · ${st?.name ?? q.stationId}`}</p>
                <p className="text-xs text-slate-500">{q.notified ? 'Разъём освободился — держим его для вас 5 минут' : 'Сообщим, как только разъём освободится'}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          );
        })}

        {scheduled.map(x => (
          <div key={x.id} className="bg-white rounded-2xl border border-amber-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#111] flex items-center justify-center"><Moon size={17} className="text-[#FFC83D]" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{`Начнётся в ${time(x.at)} · ${x.stationName}`}</p>
              <p className="text-xs text-slate-500 truncate">{`${x.connector}${x.goal ? ` · ${goalLabel(x.goal)}` : ''} · ночной тариф`}</p>
            </div>
            <button onClick={() => actions.cancelSchedule(x.id).then(refresh).catch(() => {})} aria-label="Отменить отложенную зарядку" className="p-2 rounded-xl bg-slate-100"><X size={15} /></button>
          </div>
        ))}

        {!live && last && lastStation && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><RotateCcw size={13} />КАК В ПРОШЛЫЙ РАЗ</p>
            <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{lastStation.name}</p>
            <p className="text-xs text-slate-500">{`${last.connector} · ${goalLabel(lastGoal)}`}</p>
            <button
              onClick={() => lastConnector && onRepeat(lastStation, lastConnector.id, lastGoal)}
              disabled={!lastConnector}
              className="mt-3 w-full py-2.5 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Zap size={15} />{lastConnector ? 'Зарядить так же' : 'Сейчас все такие разъёмы заняты'}
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Wallet size={15} className="text-emerald-500" />Выгоднее всего сейчас</p>
          {!here ? (
            <button onClick={locate} disabled={locating} className="mt-2 w-full py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Navigation size={14} />{locating ? 'Определяем…' : 'Найти рядом со мной'}
            </button>
          ) : ranked.length === 0 ? (
            <p className="text-xs text-slate-400 mt-1">В радиусе 60 км нет свободных подходящих разъёмов</p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mt-1">{`Для ${Math.round(needKwh)} кВт·ч с учётом дороги до станции`}</p>
              {saving > 500 && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5 mt-2">{`${cheapest.st.name} выгоднее ближайшей на ${saving.toLocaleString('ru-RU')} сум, даже с дорогой`}</p>}
              <ul className="mt-2 space-y-1.5">
                {ranked.map((o, i) => (
                  <li key={o.st.id}>
                    <button onClick={() => onSelectStation(o.st)} className="w-full flex items-center gap-3 text-left rounded-xl px-2 py-1.5 hover:bg-slate-50">
                      <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center ${i === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{o.st.name}</span>
                        <span className="block text-xs text-slate-400">{`${o.d < 10 ? o.d.toFixed(1) : Math.round(o.d)} км · ${o.price.toLocaleString('ru-RU')} сум/кВт·ч · до ${o.power} кВт`}</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-800">{`${Math.round(o.total / 1000)}k`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {cur && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {cur.band === 'green' ? <Moon size={16} className="text-emerald-500" /> : <Sun size={16} className={cur.band === 'peak' ? 'text-red-500' : 'text-amber-500'} />}
                <p className="text-sm font-semibold text-slate-800">{BAND_LABEL[cur.band]}</p>
              </div>
              <span className={`text-sm font-bold tabular-nums ${cur.multiplier < 1 ? 'text-emerald-600' : cur.multiplier > 1 ? 'text-red-500' : 'text-slate-700'}`}>{`×${cur.multiplier}`}</span>
            </div>
            {best && best.startsInHours > 0 && (
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5"><Clock size={12} />{`Дешевле всего с ${hh(best.from)} до ${hh(best.to)} (×${best.multiplier}) — через ${best.startsInHours} ч`}</p>
            )}
            {best && best.startsInHours === 0 && <p className="text-xs text-emerald-600 mt-2">Сейчас самый дешёвый тариф — хорошее время зарядиться</p>}
            <div className="flex gap-0.5 mt-3" aria-hidden="true">
              {(forecast?.hours ?? []).slice(0, 24).map((h, i) => (
                <div key={h.hour} title={`${hh(h.hour)} ×${h.multiplier}`} className="flex-1 h-6 rounded-sm pg-grow" style={{ background: h.band === 'green' ? '#10B981' : h.band === 'peak' ? '#EF4444' : h.band === 'day' ? '#FBBF24' : '#CBD5E1', opacity: h.hour === forecast?.currentHour ? 1 : 0.55, animationDelay: `${i * 18}ms` }} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>сейчас</span><span>+12 ч</span><span>+24 ч</span></div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: <History size={17} />, label: 'История', go: 'history' },
            { icon: <Route size={17} />, label: 'Поездка', go: 'trip' },
            { icon: <BatteryMedium size={17} />, label: 'Батарея', go: 'battery' },
            { icon: <Heart size={17} />, label: 'Избранное', go: 'favorites' },
          ].map(b => (
            <button key={b.label} onClick={() => onNavigate(b.go)} className="bg-white rounded-2xl border border-slate-100 py-3 flex flex-col items-center gap-1 text-slate-700 hover:border-sky-300">
              <span className="text-sky-600">{b.icon}</span>
              <span className="text-xs font-medium">{b.label}</span>
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">{here ? 'Свободно рядом' : 'Свободно сейчас'}</p>
            {!here && (
              <button onClick={locate} disabled={locating} className="text-xs text-sky-600 font-medium inline-flex items-center gap-1 disabled:opacity-50">
                <Navigation size={12} />{locating ? 'Определяем…' : 'Рядом со мной'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {free.map(({ s, d }) => {
              const open = s.connectors.filter(c => c.status === 'available');
              const fastest = Math.max(...open.map(c => c.power));
              const cheapest = Math.min(...open.map(c => c.price));
              return (
                <button key={s.id} onClick={() => onSelectStation(s)} className="w-full bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 text-left hover:border-sky-200">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-400">{`${s.city}${d !== null ? ` · ${d < 10 ? d.toFixed(1) : Math.round(d)} км` : ''} · ${open.length}/${s.connectors.length} свободно · до ${fastest} кВт`}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-800">{cheapest.toLocaleString('ru-RU')}</p>
                    <p className="text-xs text-slate-400">сум/кВт·ч</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {!car && (
          <button onClick={() => onNavigate('add-car')} className="w-full bg-white rounded-2xl border border-dashed border-slate-200 p-4 flex items-center gap-3 text-left">
            <Car size={18} className="text-slate-400" />
            <span className="text-sm text-slate-500">Укажите свой автомобиль — покажем время и стоимость зарядки под его батарею</span>
          </button>
        )}
      </div>
    </div>
  );
}

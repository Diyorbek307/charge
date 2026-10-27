import { useEffect, useState } from 'react';
import { MapPin, Scan, Route, Zap, Moon, Sun, Clock, Calendar, Users, Car, ChevronRight, Navigation } from 'lucide-react';
import type { Station } from '../../data/mockData';
import type { TariffForecast } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';

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
export default function ChargingHubScreen({ onNavigate, onSelectStation, onOpenCharge }: { onNavigate: (s: string) => void; onSelectStation: (s: Station) => void; onOpenCharge: () => void }) {
  const { state, sessions, actions } = useSync();
  const me = sessions.driver;
  const stations = useLiveStations();
  const [forecast, setForecast] = useState<TariffForecast | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    actions.tariffForecast().then(setForecast).catch(() => setForecast(null));
  }, [actions]);

  const live = state?.sessions.find(s => s.status === 'active' && s.userId === me?.id);
  const bookings = (state?.bookings ?? []).filter(b => b.userId === me?.id && b.status === 'active');
  const queue = (state?.queues ?? []).filter(q => q.userId === me?.id);
  const car = me?.car;
  const companyCar = state?.vehicles.find(v => v.driverId === me?.id);

  const free = stations
    .filter(s => s.connectors.some(c => c.status === 'available'))
    .map(s => ({ s, d: here ? km(here, { lat: s.geoLat, lng: s.geoLng }) : null }))
    .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : b.s.connectors.filter(c => c.status === 'available').length - a.s.connectors.filter(c => c.status === 'available').length))
    .slice(0, 5);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { timeout: 8000 },
    );
  };

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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {live && (
          <button onClick={onOpenCharge} className="w-full rounded-2xl p-4 text-left text-white flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #059669, #0AAF97)' }}>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Zap size={18} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Идёт зарядка</p>
              <p className="text-xs text-white/80 truncate">{`${live.stationName} · с ${time(live.start)}`}</p>
            </div>
            <ChevronRight size={16} />
          </button>
        )}

        {bookings.map(b => (
          <div key={b.id} className="bg-white rounded-2xl border border-violet-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center"><Calendar size={17} className="text-violet-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{`Бронь ${b.code ?? ''} · ${b.stationName ?? ''}`}</p>
              <p className="text-xs text-slate-500">{`${time(b.startsAt)}–${time(b.endsAt)} · держим до ${time(b.graceUntil)}`}</p>
            </div>
          </div>
        ))}

        {queue.map(q => (
          <div key={q.id} className="bg-white rounded-2xl border border-sky-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center"><Users size={17} className="text-sky-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{`Очередь · ${stations.find(s => s.id === q.stationId)?.name ?? q.stationId}`}</p>
              <p className="text-xs text-slate-500">{q.notified ? 'Разъём освободился — держим его для вас 5 минут' : 'Сообщим, как только разъём освободится'}</p>
            </div>
          </div>
        ))}

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
              {(forecast?.hours ?? []).slice(0, 24).map(h => (
                <div key={h.hour} title={`${hh(h.hour)} ×${h.multiplier}`} className="flex-1 h-6 rounded-sm" style={{ background: h.band === 'green' ? '#10B981' : h.band === 'peak' ? '#EF4444' : h.band === 'day' ? '#FBBF24' : '#CBD5E1', opacity: h.hour === forecast?.currentHour ? 1 : 0.55 }} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>сейчас</span><span>+12 ч</span><span>+24 ч</span></div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <MapPin size={17} />, label: 'Карта', go: 'map' },
            { icon: <Scan size={17} />, label: 'QR-код', go: 'qr-scan' },
            { icon: <Route size={17} />, label: 'Маршрут', go: 'trip' },
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

import { useMemo, useState } from 'react';
import { Percent, Navigation, Moon, Clock, Sparkles, MapPin } from 'lucide-react';
import type { Station } from '../../data/mockData';
import type { Promo } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';
import { useMyLocation, km, fmtKm, driveMinutes } from '../../lib/geo';
import { plural } from '../../lib/analytics';
import { promosOf, promoNow, promoHours, isNight, discounted, useDriverPromos } from '../../lib/promos';
import { NetworkBadge } from './NetworkBadge';

const opId = (s: Station) => (s as Station & { operatorId?: string }).operatorId;
const untilText = (iso: string | null) => (iso ? `до ${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : 'без срока');

/**
 * Discounts from partner networks: what runs, where, and how far. Each
 * discount is paid by the network that runs it; PowerGo only shows it and
 * applies it at the start of a charge.
 */
export default function DealsScreen({ onSelectStation, onRoute }: { onSelectStation: (s: Station) => void; onRoute: (s: Station) => void }) {
  const { state } = useSync();
  const promos = useDriverPromos();
  const stations = useLiveStations();
  const here = useMyLocation();
  const [only, setOnly] = useState<string | null>(null);

  const networkName = (id: string) => state?.operators.find(o => o.id === id)?.name ?? stations.find(s => opId(s) === id)?.operator ?? 'Сеть';

  const rows = useMemo(() => {
    return stations
      .map(s => {
        const ref = { id: s.id, operatorId: opId(s) };
        const all = promosOf(ref, promos).filter(p => !only || p.id === only);
        if (!all.length) return null;
        const now = promoNow(ref, all);
        const best = now ?? [...all].sort((a, b) => b.percent - a.percent)[0];
        const d = here ? km(here, { lat: s.geoLat, lng: s.geoLng }) : null;
        return { s, best, now: !!now, d };
      })
      .filter((r): r is { s: Station; best: Promo; now: boolean; d: number | null } => !!r)
      .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : Number(b.now) - Number(a.now) || b.best.percent - a.best.percent));
  }, [stations, promos, here, only]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="px-4 pt-5 pb-3 bg-white">
        <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight">Скидки</h1>
        <p className="text-sm text-slate-500 mt-0.5">Акции сетей-партнёров — скидку оплачивает сама сеть</p>
      </div>

      {promos.length > 0 && (
        <div className="bg-white pb-4">
          <div className="px-4 scroll-px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x" role="group" aria-label="Акции">
            {promos.map(p => {
              const on = only === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setOnly(on ? null : p.id)}
                  aria-pressed={on}
                  className={`snap-start shrink-0 w-[248px] text-left rounded-3xl p-4 relative overflow-hidden transition-transform active:scale-[0.98] ${on ? 'ring-2 ring-[#111]' : ''}`}
                  style={{ background: 'linear-gradient(135deg,#FFD66B 0%,#FFB000 100%)' }}
                >
                  <span className="absolute -right-6 -bottom-8 text-[110px] font-black text-white/25 leading-none select-none" aria-hidden="true">%</span>
                  <span className="flex items-center gap-2">
                    <NetworkBadge name={networkName(p.operatorId)} size={30} />
                    <span className="text-sm font-semibold text-[#111]/80 truncate">{networkName(p.operatorId)}</span>
                  </span>
                  <span className="block mt-3 text-[34px] font-black text-[#111] leading-none tracking-tight">{`−${p.percent}%`}</span>
                  <span className="block mt-1 text-sm font-semibold text-[#111] truncate">{p.title}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-[#111]">
                    <span className="px-2 py-1 rounded-lg bg-white/60 inline-flex items-center gap-1">{isNight(p) ? <Moon size={11} /> : <Clock size={11} />}{promoHours(p)}</span>
                    {p.firstOnly && <span className="px-2 py-1 rounded-lg bg-white/60 inline-flex items-center gap-1"><Sparkles size={11} />первая зарядка</span>}
                    <span className="px-2 py-1 rounded-lg bg-white/60">{untilText(p.until)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 pt-4 pb-6 space-y-3" role="list" aria-label="Станции со скидкой">
        <p className="text-xs font-semibold text-slate-500">
          {rows.length ? `${rows.length} ${plural(rows.length, ['станция', 'станции', 'станций'])} со скидкой${here ? ' · ближние сверху' : ''}` : ''}
        </p>
        {rows.length === 0 && (
          <div className="rounded-3xl bg-white border border-slate-100 p-6 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-[#FFC83D]/30 grid place-items-center"><Percent size={22} className="text-[#8a5b00]" /></span>
            <p className="mt-3 font-semibold text-slate-800">Сейчас акций нет</p>
            <p className="text-sm text-slate-500 mt-1">Когда сеть запустит скидку, она появится здесь и значком «%» на карте</p>
          </div>
        )}
        {rows.map(({ s, best, now, d }) => {
          const cheapest = Math.min(...s.connectors.map(c => c.price));
          const maxKw = Math.max(...s.connectors.map(c => c.power));
          const types = [...new Set(s.connectors.map(c => c.type.replace('GB/T DC', 'GB/T').replace('Type2', 'Type 2')))];
          const free = s.connectors.filter(c => c.status === 'available').length;
          return (
            <div key={s.id} role="listitem" className="rounded-3xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.04)] p-4">
              <button onClick={() => onSelectStation(s)} className="w-full flex items-start gap-3 text-left">
                <span className="relative shrink-0 w-12 h-12 rounded-full grid place-items-center text-[#111]" style={{ background: 'linear-gradient(135deg,#FFC83D,#FF9F0A)' }}>
                  <Percent size={20} strokeWidth={2.8} />
                  <span className="absolute -bottom-1 -right-1"><NetworkBadge name={s.operator} size={22} /></span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[16px] font-bold text-slate-900 truncate">{s.name}</span>
                  <span className="block text-sm text-slate-500 truncate flex items-center gap-1"><MapPin size={12} className="shrink-0" />{`${s.address}, ${s.city}`}</span>
                  <span className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${now ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {now ? `Действует сейчас · −${best.percent}%` : `${best.title} · ${promoHours(best)}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] text-slate-400 line-through tabular-nums">{`${cheapest.toLocaleString('ru-RU')} сум`}</span>
                  <span className="block px-2.5 py-1 rounded-xl border-2 border-[#FFB000] text-sm font-extrabold text-slate-900 tabular-nums">{`${discounted(cheapest, best).toLocaleString('ru-RU')}`}<span className="text-[10px] font-semibold text-slate-500"> сум</span></span>
                </span>
              </button>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700">{`${maxKw} кВт`}</span>
                  {types.map(t => <span key={t} className="shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700">{t}</span>)}
                  <span className={`shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold ${free ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{free ? `${free} своб.` : 'занято'}</span>
                </div>
                <button onClick={() => onRoute(s)} aria-label={`Маршрут до ${s.name}`} className="shrink-0 h-10 pl-3 pr-3.5 rounded-2xl bg-[#111] text-white text-sm font-semibold inline-flex items-center gap-1.5">
                  <Navigation size={15} className="text-[#FFC83D] fill-[#FFC83D]" />
                  {d !== null ? `${fmtKm(d)} · ${driveMinutes(d)} мин` : 'Маршрут'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

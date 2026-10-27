import { useState } from 'react';
import { Car, BatteryCharging, Gauge, MapPin, Moon, X } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, dateTime, plural } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty } from '../admin/ui';
import { FLEET, vehicleState, VEHICLE_PILL } from './shared';

/** The company cars: live state, what each one cost over 30 days, and its charges. */
export default function BusinessFleet() {
  const { data, error } = useAnalytics('business', 30);
  const { state } = useSync();
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Page title="Автопарк">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const vehicles = state?.vehicles ?? [];
  const live = (state?.sessions ?? []).filter(s => s.status === 'active' && s.corporate);
  const trips = (data.trips ?? []).filter(x => x.status === 'completed');
  const statsOf = (plate: string) => {
    const list = trips.filter(x => x.plate === plate);
    const energy = list.reduce((n, x) => n + x.energy, 0);
    const cost = list.reduce((n, x) => n + x.cost, 0);
    return { list, energy, cost, price: energy ? cost / energy : 0, night: list.filter(x => x.night).length };
  };
  const states = vehicles.map(v => vehicleState(v, live));
  const selected = vehicles.find(v => v.id === open);
  const sel = selected ? statsOf(selected.plate) : null;

  return (
    <Page title="Автопарк" subtitle={`${vehicles.length} ${plural(vehicles.length, ['машина', 'машины', 'машин'])} · расходы на зарядку за 30 дней`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Машин" value={vehicles.length} sub="закреплены за сотрудниками" icon={<Car size={14} />} tone="violet" />
        <Kpi label="Заряжаются" value={states.filter(s => s === 'charging').length} sub="прямо сейчас" icon={<BatteryCharging size={14} />} tone="sky" />
        <Kpi label="Нужна зарядка" value={states.filter(s => s === 'low').length} sub="заряд ниже 30%" icon={<Gauge size={14} />} tone="amber" />
        <Kpi label="Средний заряд" value={`${num(vehicles.reduce((n, v) => n + v.battery, 0) / Math.max(1, vehicles.length), 0)}%`} sub="по всем машинам" icon={<Gauge size={14} />} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vehicles.map((v, i) => {
          const st = states[i];
          const s = statsOf(v.plate);
          const pill = VEHICLE_PILL[st];
          return (
            <button key={v.id} onClick={() => setOpen(v.id)} className={`text-left bg-white rounded-2xl p-4 border transition-shadow hover:shadow-md ${open === v.id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{v.model}</p>
                  <p className="text-xs text-slate-400 font-mono">{v.plate}</p>
                </div>
                <Pill tone={pill.tone}>{pill.label}</Pill>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Заряд</span><span className="font-semibold text-slate-800 tabular-nums">{v.battery}%</span></div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${st === 'charging' ? 'animate-pulse' : ''}`} style={{ width: `${v.battery}%`, background: v.battery < 30 ? '#F59E0B' : FLEET }} />
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div><dt className="text-[11px] text-slate-400">Зарядок</dt><dd className="text-sm font-bold text-slate-800 tabular-nums">{s.list.length}</dd></div>
                <div><dt className="text-[11px] text-slate-400">кВт·ч</dt><dd className="text-sm font-bold text-slate-800 tabular-nums">{num(s.energy, 0)}</dd></div>
                <div><dt className="text-[11px] text-slate-400">Расходы</dt><dd className="text-sm font-bold text-slate-800 tabular-nums">{money(s.cost, false)}</dd></div>
              </dl>
              <p className="mt-3 pt-3 border-t border-slate-50 text-xs text-slate-500 flex justify-between gap-2">
                <span className="truncate">{v.driver}</span>
                <span className="tabular-nums">{`${num(v.odo)} км`}</span>
              </p>
            </button>
          );
        })}
      </div>

      {selected && sel && (
        <Card
          pad={false}
          title={`${selected.model} · ${selected.plate}`}
          right={<button onClick={() => setOpen(null)} aria-label="Закрыть" className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>}
        >
          <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-slate-400">Водитель</p><p className="font-semibold text-slate-800">{selected.driver}</p></div>
            <div><p className="text-xs text-slate-400">Средняя цена</p><p className="font-semibold text-slate-800 tabular-nums">{`${num(sel.price)} сум/кВт·ч`}</p></div>
            <div><p className="text-xs text-slate-400">Ночных зарядок</p><p className="font-semibold text-slate-800 tabular-nums">{`${sel.night} / ${sel.list.length}`}</p></div>
            <div><p className="text-xs text-slate-400">Пробег</p><p className="font-semibold text-slate-800 tabular-nums">{`${num(selected.odo)} км`}</p></div>
          </div>
          {sel.list.length === 0 ? (
            <Empty text="За 30 дней эта машина не заряжалась за счёт компании" />
          ) : (
            <ul className="divide-y divide-slate-50 border-t border-slate-50">
              {sel.list.slice(0, 12).map(x => (
                <li key={x.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-xs text-slate-400 w-28 tabular-nums">{dateTime(x.start)}</span>
                  <span className="flex-1 min-w-[160px] text-slate-700 truncate"><MapPin size={11} className="inline mr-1 text-slate-400" />{`${x.station} · ${x.city}`}</span>
                  <span className="text-xs text-slate-500">{x.connector}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{`${num(x.energy, 1)} кВт·ч`}</span>
                  {x.night && <Pill tone="green"><Moon size={10} />ночь</Pill>}
                  <span className="font-semibold text-slate-800 tabular-nums w-28 text-right">{money(x.cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Page>
  );
}

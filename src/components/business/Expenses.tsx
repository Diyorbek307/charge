import { useEffect, useMemo, useState } from 'react';
import { Wallet, Zap, Moon, Receipt } from 'lucide-react';
import { useAnalytics, money, num, dateTime, duration } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, SearchBox, Pagination, Empty, BarList } from '../admin/ui';
import ExportButton from '../ExportButton';
import { FLEET } from './shared';

const PER_PAGE = 15;

/** Every company-paid charge of the last 30 days, filterable and exportable for accounting. */
export default function BusinessExpenses() {
  const { data, error } = useAnalytics('business', 30);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('all');
  const [nightOnly, setNightOnly] = useState(false);
  const [page, setPage] = useState(1);

  const trips = data?.trips ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trips
      .filter(x => dept === 'all' || x.dept === dept)
      .filter(x => !nightOnly || x.night)
      .filter(x => !q || [x.employee, x.station, x.city, x.vehicle, x.plate, x.id].some(v => v.toLowerCase().includes(q)));
  }, [trips, query, dept, nightOnly]);
  useEffect(() => setPage(1), [query, dept, nightOnly]);

  if (!data) return <Page title="Расходы">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const done = shown.filter(x => x.status === 'completed');
  const cost = done.reduce((n, x) => n + x.cost, 0);
  const energy = done.reduce((n, x) => n + x.energy, 0);
  const nightDone = done.filter(x => x.night);
  // What night charges saved against the day price (night is ×0,7).
  const saved = nightDone.reduce((n, x) => n + Math.round(x.cost / 0.7 - x.cost), 0);
  const depts = [...new Set(trips.map(x => x.dept).filter(Boolean))].sort();
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages);
  const byStation = new Map<string, { key: string; label: string; value: number; n: number }>();
  for (const x of done) {
    const r = byStation.get(x.stationId) ?? { key: x.stationId, label: x.station, value: 0, n: 0 };
    r.value += x.cost;
    r.n += 1;
    byStation.set(x.stationId, r);
  }

  return (
    <Page
      title="Расходы"
      subtitle="Зарядки за счёт компании за 30 дней — для бухгалтерии и контроля"
      actions={
        <ExportButton
          name="fleet-expenses"
          title="Расходы на зарядку автопарка"
          portal="business"
          headers={['ID', 'Дата', 'Сотрудник', 'Отдел', 'Машина', 'Госномер', 'Станция', 'Город', 'Разъём', 'кВт·ч', 'Цена, сум/кВт·ч', 'Сумма, сум', 'Статус']}
          rows={shown.map(x => [x.id, dateTime(x.start), x.employee, x.dept, x.vehicle, x.plate, x.station, x.city, x.connector, x.energy, x.price, x.cost, x.status === 'failed' ? 'Ошибка' : x.night ? 'Ночной тариф' : 'Завершена'])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Сумма" value={money(cost, false)} sub="сум по фильтру" icon={<Wallet size={14} />} tone="violet" />
        <Kpi label="Зарядок" value={num(done.length)} sub={`${shown.length - done.length} с ошибкой запуска`} icon={<Zap size={14} />} tone="sky" />
        <Kpi label="Энергия" value={num(energy, 0)} sub={`кВт·ч · ${num(energy ? cost / energy : 0)} сум/кВт·ч`} icon={<Receipt size={14} />} tone="amber" />
        <Kpi label="Сэкономлено ночью" value={money(saved, false)} sub={`сум · ${nightDone.length} ночных зарядок`} icon={<Moon size={14} />} tone="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Сотрудник, станция, машина" />
        <select value={dept} onChange={e => setDept(e.target.value)} aria-label="Отдел" className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700">
          <option value="all">Все отделы</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={nightOnly} onChange={e => setNightOnly(e.target.checked)} className="accent-indigo-600" />
          Только ночные
        </label>
      </div>

      <Card pad={false}>
        {shown.length === 0 ? (
          <Empty text="Ничего не найдено — измените фильтры" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
                  <th className="px-5 py-3 font-semibold">Дата</th>
                  <th className="px-5 py-3 font-semibold">Сотрудник</th>
                  <th className="px-5 py-3 font-semibold">Машина</th>
                  <th className="px-5 py-3 font-semibold">Станция</th>
                  <th className="px-5 py-3 font-semibold text-right">кВт·ч</th>
                  <th className="px-5 py-3 font-semibold text-right">Время</th>
                  <th className="px-5 py-3 font-semibold text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice((current - 1) * PER_PAGE, current * PER_PAGE).map(x => (
                  <tr key={x.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 text-xs text-slate-500 tabular-nums whitespace-nowrap">{dateTime(x.start)}</td>
                    <td className="px-5 py-2.5"><p className="text-slate-800">{x.employee}</p><p className="text-xs text-slate-400">{x.dept}</p></td>
                    <td className="px-5 py-2.5"><p className="text-slate-700">{x.vehicle}</p><p className="text-xs text-slate-400 font-mono">{x.plate}</p></td>
                    <td className="px-5 py-2.5"><p className="text-slate-700">{x.station}</p><p className="text-xs text-slate-400">{`${x.city} · ${x.connector}`}</p></td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{num(x.energy, 1)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-500 text-xs">{duration((Date.parse(x.end) - Date.parse(x.start)) / 60000)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {x.status === 'failed' ? (
                        <Pill tone="red">Не запустилась</Pill>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 tabular-nums">
                          {x.night && <Moon size={11} className="text-emerald-500" aria-label="Ночной тариф" />}
                          {money(x.cost)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={current} pages={pages} onPage={setPage} total={shown.length} label="зарядок" />
      </Card>

      <Card title="Где заряжаются чаще всего" right={<span className="text-xs text-slate-400">по сумме</span>}>
        <BarList color={FLEET} rows={[...byStation.values()].sort((a, b) => b.value - a.value).slice(0, 6).map(r => ({ key: r.key, label: r.label, sub: `${r.n}×`, value: r.value, display: money(r.value) }))} />
      </Card>
    </Page>
  );
}

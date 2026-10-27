import { useMemo, useState } from 'react';
import { Users, Repeat, Receipt, Star } from 'lucide-react';
import { useAnalytics, money, num, dateTime, plural } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pagination, SearchBox, Empty } from '../admin/ui';

const PER_PAGE = 20;

export default function OperatorCustomers() {
  const { data, error } = useAnalytics('operator', 30);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.customers ?? []).filter(c => !q || [c.name, c.car, c.city].some(v => v.toLowerCase().includes(q)));
  }, [data, query]);
  if (!data) return <Page title="Клиенты">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const rated = data.stations.filter(s => s.rating > 0);
  const rating = rated.length ? rated.reduce((n, s) => n + s.rating, 0) / rated.length : 0;

  return (
    <Page
      title="Клиенты"
      subtitle="Водители, которые заряжались на ваших станциях за 30 дней · телефоны скрыты по правилам платформы"
      actions={
        <ExportButton
          name="my-customers"
          title="Клиенты сети"
          portal="operator"
          headers={['Водитель', 'Телефон', 'Автомобиль', 'Город', 'Сессии', 'кВт·ч', 'Потрачено, сум', 'Станций', 'Последний визит']}
          rows={rows.map(c => [c.name, c.phone, c.car, c.city, c.sessions, c.energy, c.spent, c.stations, c.last])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Уникальных водителей" value={num(data.totals.uniqueUsers)} change={data.deltas.uniqueUsers} icon={<Users size={14} />} tone="sky" />
        <Kpi label="Возвращаются" value={`${num(data.totals.repeatShare, 0)}%`} sub="заряжались больше одного раза" icon={<Repeat size={14} />} tone="emerald" />
        <Kpi label="Средний чек" value={money(data.totals.avgCheck, false)} sub="сум за сессию" change={data.deltas.avgCheck} icon={<Receipt size={14} />} tone="violet" />
        <Kpi label="Рейтинг станций" value={rating ? `★ ${num(rating, 1)}` : '—'} sub={`${rated.length} ${plural(rated.length, ['станция', 'станции', 'станций'])} с отзывами`} icon={<Star size={14} />} tone="amber" />
      </div>

      <Card pad={false}>
        <div className="px-5 pt-4 pb-3"><SearchBox value={query} onChange={v => { setQuery(v); setPage(1); }} placeholder="Имя, автомобиль или город" /></div>
        {rows.length === 0 ? (
          <Empty text="Никого не нашлось" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2.5 font-semibold">Водитель</th>
                  <th className="px-5 py-2.5 font-semibold">Телефон</th>
                  <th className="px-5 py-2.5 font-semibold">Автомобиль</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Сессии</th>
                  <th className="px-5 py-2.5 font-semibold text-right">кВт·ч</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Потрачено</th>
                  <th className="px-5 py-2.5 font-semibold">Последний визит</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((current - 1) * PER_PAGE, current * PER_PAGE).map(c => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5"><p className="font-semibold text-slate-800">{c.name}</p><p className="text-[11px] text-slate-400">{c.city || '—'} · {c.stations} {plural(c.stations, ['станция', 'станции', 'станций'])}</p></td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">{c.phone}</td>
                    <td className="px-5 py-2.5 text-slate-600">{c.car || '—'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{c.sessions}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{num(c.energy, 1)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-800 whitespace-nowrap">{money(c.spent)}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dateTime(c.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={current} pages={pages} onPage={setPage} total={rows.length} label="водителей" />
      </Card>
    </Page>
  );
}

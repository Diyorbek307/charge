import { useEffect, useState } from 'react';
import { TrendingUp, Wallet, Percent, Users, Zap, Receipt } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Investor as InvestorData } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, monthShort, monthLong } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, CHART } from './ui';

const mln = (n: number) => `${num(n / 1_000_000, 1)} млн`;

/**
 * The page to show an investor or a bank: turnover through Voli and our
 * commission month by month, the growth rate, and the size of the network.
 */
export default function Investor() {
  const { actions } = useSync();
  const [data, setData] = useState<InvestorData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    actions.adminInvestor().then(setData).catch(e => setError((e as Error).message));
  }, [actions]);

  if (!data) return <Page title="Для инвестора">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const { last, growth, months, network } = data;
  const closed = months.filter(m => !m.partial);

  return (
    <Page
      title="Для инвестора"
      subtitle={last ? `Последний закрытый месяц — ${monthLong(last.month)} · ${network.networks} сетей · ${network.stations} станций · ${network.cities} городов` : 'Данных пока нет'}
      actions={<ExportButton name="investor" title="Voli по месяцам" portal="admin" headers={['Месяц', 'Оборот, сум', 'Комиссия Voli, сум', 'Зарядки', 'кВт·ч', 'Водители', 'Средний чек, сум']} rows={months.map(m => [m.month, m.revenue, m.commission, m.sessions, m.energy, m.drivers ?? '', m.avgCheck])} />}
    >
      {last && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Оборот за месяц" value={mln(last.revenue)} sub="сум через Voli" change={growth.revenue} icon={<Wallet size={14} />} tone="amber" />
          <Kpi label="Комиссия Voli" value={mln(last.commission)} sub="сум за месяц" change={growth.commission} icon={<Percent size={14} />} tone="emerald" />
          <Kpi label="Годовой темп" value={mln(data.yearRunRate)} sub="комиссия × 12" icon={<TrendingUp size={14} />} tone="violet" />
          <Kpi label="Рост в месяц" value={data.cmgr === null ? '—' : `${num(data.cmgr, 1)}%`} sub={`оборот, в среднем за ${closed.length - 1} мес.`} icon={<TrendingUp size={14} />} tone="sky" />
          <Kpi label="Водители" value={last.drivers === null ? '—' : num(last.drivers)} sub="заряжались за месяц" change={growth.drivers} icon={<Users size={14} />} tone="slate" />
          <Kpi label="Средний чек" value={money(last.avgCheck, false)} sub={`сум · ${num(last.sessions)} зарядок`} change={growth.sessions} icon={<Receipt size={14} />} tone="slate" />
        </div>
      )}

      <Card title="Оборот и комиссия по месяцам" right={<span className="text-xs text-slate-400">закрытые месяцы</span>}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={closed}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="r" tickFormatter={v => `${Math.round(v / 1_000_000)}`} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={36} />
            <YAxis yAxisId="c" orientation="right" tickFormatter={v => `${num(v / 1_000_000, 1)}`} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={l => monthLong(String(l))} formatter={(v, n) => [money(v as number), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="r" dataKey="revenue" name="Оборот, млн сум" fill={CHART.primary} radius={[4, 4, 0, 0]} />
            <Line yAxisId="c" dataKey="commission" name="Комиссия Voli, млн сум" stroke={CHART.secondary} strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card pad={false} title="По месяцам">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums min-w-[720px]">
            <thead>
              <tr className="text-right text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                <th className="text-left px-5 py-2.5 font-semibold">Месяц</th>
                <th className="px-5 py-2.5 font-semibold">Оборот</th>
                <th className="px-5 py-2.5 font-semibold">Комиссия</th>
                <th className="px-5 py-2.5 font-semibold">Зарядки</th>
                <th className="px-5 py-2.5 font-semibold">МВт·ч</th>
                <th className="px-5 py-2.5 font-semibold">Водители</th>
                <th className="px-5 py-2.5 font-semibold">Ср. чек</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map(m => (
                <tr key={m.month} className="border-b border-slate-50 last:border-0 text-right">
                  <td className="text-left px-5 py-2.5 text-slate-700 whitespace-nowrap">{monthLong(m.month)}{m.partial && <span className="ml-2 text-xs text-slate-400">идёт</span>}</td>
                  <td className="px-5 py-2.5 font-semibold text-slate-900">{money(m.revenue)}</td>
                  <td className="px-5 py-2.5 text-emerald-700">{money(m.commission)}</td>
                  <td className="px-5 py-2.5">{num(m.sessions)}</td>
                  <td className="px-5 py-2.5"><span className="inline-flex items-center gap-1"><Zap size={11} className="text-[#E09A00]" />{num(m.energy / 1000, 1)}</span></td>
                  <td className="px-5 py-2.5">{m.drivers === null ? '—' : num(m.drivers)}</td>
                  <td className="px-5 py-2.5">{money(m.avgCheck)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

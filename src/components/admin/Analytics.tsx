import { useState } from 'react';
import { Activity, Zap, Wallet, Clock, Gauge, Tag } from 'lucide-react';
import { ComposedChart, Bar, Line, BarChart, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAnalytics, money, num, dayShort, weekdayShort } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Segmented, BarList, CHART } from './ui';

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const { data, error } = useAnalytics('admin', days);
  if (!data) return <Page title="Аналитика">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const t = data.totals;
  const weakest = [...data.stations].sort((a, b) => a.utilization - b.utilization).slice(0, 5);

  return (
    <Page
      title="Аналитика"
      subtitle={`За ${days} дней · сравнение с предыдущими ${days}`}
      actions={
        <>
          <Segmented value={days} onChange={setDays} options={[{ id: 7, label: '7 дней' }, { id: 14, label: '14 дней' }, { id: 30, label: '30 дней' }]} />
          <ExportButton
            name="stations-analytics"
            title={`Станции за ${days} дней`}
            portal="admin"
            headers={['Станция', 'Город', 'Оператор', 'Разъёмы', 'Сессии', 'кВт·ч', 'Выручка, сум', 'Загрузка, %']}
            rows={data.stations.map(s => [s.name, s.city, s.operator, s.connectors, s.sessions, s.energy, s.revenue, s.utilization])}
          />
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Сессии" value={num(t.completed)} change={data.deltas.sessions} icon={<Activity size={14} />} tone="sky" />
        <Kpi label="Энергия" value={`${num(t.energy / 1000, 1)} МВт·ч`} change={data.deltas.energy} icon={<Zap size={14} />} tone="amber" />
        <Kpi label="Выручка" value={money(t.revenue, false)} sub="сум" change={data.deltas.revenue} icon={<Wallet size={14} />} tone="emerald" />
        <Kpi label="Ср. сессия" value={`${t.avgMinutes} мин`} sub={`${num(t.avgKwh, 1)} кВт·ч`} change={data.deltas.avgMinutes} goodWhenUp={false} icon={<Clock size={14} />} tone="violet" />
        <Kpi label="Ср. цена" value={num(t.avgPrice)} sub="сум за кВт·ч" icon={<Tag size={14} />} tone="slate" />
        <Kpi label="Загрузка" value={`${num(t.utilization, 1)}%`} sub="разъёмо-часов" icon={<Gauge size={14} />} tone="sky" />
      </div>

      <Card title="Энергия и сессии по дням">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data.daily.filter(d => !d.partial)}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayShort} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval={days > 14 ? 4 : 0} />
            <YAxis yAxisId="e" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={l => dayShort(String(l))} formatter={(v, n) => (n === 'Энергия, кВт·ч' ? [num(v as number, 1), n] : [v as number, n])} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="e" dataKey="energy" name="Энергия, кВт·ч" fill={CHART.primary} radius={[3, 3, 0, 0]} />
            <Line yAxisId="s" dataKey="sessions" name="Сессии" stroke={CHART.secondary} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="По дням недели">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.weekday}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={d => weekdayShort(Number(d))} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={d => weekdayShort(Number(d))} formatter={v => [v as number, 'Сессий']} />
              <Bar dataKey="sessions" fill={CHART.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Типы разъёмов">
          <div className="flex items-center gap-4">
            <div className="w-36 h-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.connectors} dataKey="sessions" nameKey="type" innerRadius={40} outerRadius={64} paddingAngle={2} stroke="none">
                    {data.connectors.map((c, i) => <Cell key={c.type} fill={CHART.palette[i % CHART.palette.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} formatter={(v, n) => [`${v} сессий`, n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-2 text-sm">
              {data.connectors.map((c, i) => (
                <li key={c.type} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART.palette[i % CHART.palette.length] }} />
                  <span className="flex-1 text-slate-700">{c.type}</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{num(c.share, 1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Города">
          <BarList rows={data.cities.slice(0, 7).map(c => ({ key: c.city, label: c.city, sub: `${c.stations} ст.`, value: c.revenue, display: money(c.revenue, false) }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Лучшие станции по выручке">
          <BarList rows={data.stations.slice(0, 8).map(s => ({ key: s.id, label: s.name, sub: s.city, value: s.revenue, display: money(s.revenue, false) }))} />
        </Card>
        <Card title="Самая низкая загрузка" right={<span className="text-xs text-slate-400">кандидаты на акции и перенос</span>}>
          <BarList color={CHART.accent} rows={weakest.map(s => ({ key: s.id, label: s.name, sub: `${s.city} · ${s.sessions} сесс.`, value: s.utilization, display: `${num(s.utilization, 1)}%` }))} />
        </Card>
      </div>
    </Page>
  );
}

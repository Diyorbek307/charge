import { MapPin, Zap, Users, Activity, Wallet, Percent, Receipt, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, dayShort, todayLong, time, duration, plural } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, CHART } from './ui';

export default function AdminOverview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data, error } = useAnalytics('admin', 30);
  const { state } = useSync();
  if (!data) return <Page title="Национальный обзор" subtitle={todayLong()}>{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const t = data.totals;
  const running = (state?.sessions ?? []).filter(s => s.status === 'active');
  const openAlerts = (state?.alerts ?? []).filter(a => !a.ack);
  const critical = openAlerts.filter(a => a.severity === 'critical').length;

  return (
    <Page
      title="Национальный обзор"
      subtitle={<>{todayLong()} · показатели за 30 дней, сравнение с предыдущими 30</>}
      actions={
        critical ? (
          <Pill tone="red"><AlertTriangle size={12} />{critical} {plural(critical, ['критическое оповещение', 'критических оповещения', 'критических оповещений'])}</Pill>
        ) : (
          <Pill tone="green"><CheckCircle2 size={12} />Критических оповещений нет</Pill>
        )
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Станции" value={num(data.network.stations)} sub={`${data.network.cities} ${plural(data.network.cities, ['город', 'города', 'городов'])} · ${data.operators.filter(o => o.status === 'active').length} ${plural(data.operators.filter(o => o.status === 'active').length, ['оператор', 'оператора', 'операторов'])}`} icon={<MapPin size={14} />} tone="sky" />
        <Kpi label="Разъёмы онлайн" value={`${data.network.online}/${data.network.connectors}`} sub={`${data.network.busy} заряжают сейчас`} icon={<Zap size={14} />} tone="amber" />
        <Kpi label="Активные водители" value={num(t.uniqueUsers)} change={data.deltas.uniqueUsers} sub={`повторных ${num(t.repeatShare, 0)}%`} icon={<Users size={14} />} tone="violet" />
        <Kpi label="Сессии сегодня" value={num(data.today.sessions)} sub={`${num(data.today.energy, 0)} кВт·ч · ${money(data.today.revenue)}`} icon={<Activity size={14} />} tone="emerald" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Выручка сети" value={money(t.revenue, false)} sub="сум" change={data.deltas.revenue} icon={<Wallet size={14} />} tone="emerald" />
        <Kpi label="Комиссия платформы" value={money(t.commission, false)} sub={`сум · ${num((t.commission / Math.max(t.revenue, 1)) * 100, 1)}% от оборота`} icon={<Percent size={14} />} tone="violet" />
        <Kpi label="Средний чек" value={money(t.avgCheck, false)} sub={`сум · ${num(t.avgKwh, 1)} кВт·ч`} change={data.deltas.avgCheck} icon={<Receipt size={14} />} tone="sky" />
        <Kpi label="Успешные сессии" value={`${num(t.successRate, 1)}%`} sub={`${t.failed} с ошибкой из ${num(t.sessions)}`} icon={<CheckCircle2 size={14} />} tone={t.successRate >= 97 ? 'emerald' : 'amber'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Выручка по дням" right={<span className="text-xs text-slate-400">сум · {num(t.completed)} сессий</span>} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.daily.filter(d => !d.partial)}>
              <defs>
                <linearGradient id="ovRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayShort} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={v => money(v as number, false)} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={64} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
                labelFormatter={l => dayShort(String(l))}
                formatter={(v, name) => (name === 'revenue' ? [money(v as number), 'Выручка'] : [v as number, 'Сессии'])}
              />
              <Area type="monotone" dataKey="revenue" stroke={CHART.primary} fill="url(#ovRev)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Операторы" right={<button onClick={() => onNavigate('operators')} className="text-xs text-sky-600 font-semibold inline-flex items-center gap-1">Все <ArrowRight size={12} /></button>}>
          <ul className="space-y-2">
            {data.operators.map(o => (
              <li key={o.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50">
                <span className="text-lg" aria-hidden="true">{o.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{o.name}</p>
                  <p className="text-xs text-slate-400">{o.stations} ст. · {o.evse} разъёмов · {num(o.completed)} сесс.</p>
                </div>
                {o.status === 'active' ? (
                  <span className="text-xs font-semibold text-slate-700 tabular-nums text-right">
                    {money(o.revenue, false)}
                    <span className={`block text-[11px] ${(o.revenueDelta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {o.revenueDelta === null ? '' : `${o.revenueDelta >= 0 ? '+' : ''}${num(o.revenueDelta, 1)}%`}
                    </span>
                  </span>
                ) : (
                  <Pill tone="amber">На ревью</Pill>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Нагрузка по часам" right={<span className="text-xs text-slate-400">сессий за 30 дней, время Ташкента</span>} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="hour" tickFormatter={h => String(h).padStart(2, '0')} tick={{ fontSize: 10, fill: CHART.axis }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: CHART.axis }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={h => `${String(h).padStart(2, '0')}:00`} formatter={v => [v as number, 'Сессий']} />
              <Bar dataKey="sessions" fill={CHART.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Оповещения" right={<span className="text-xs text-slate-400">{openAlerts.length} открыто</span>}>
          {openAlerts.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Открытых оповещений нет</p>
          ) : (
            <ul className="space-y-2">
              {openAlerts.slice(0, 5).map(a => (
                <li key={a.id} className="flex gap-2.5 p-2.5 rounded-xl bg-slate-50">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.station}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{a.message}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{time(a.time)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        pad={false}
        title={<span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Заряжаются сейчас · {running.length}</span>}
        right={<button onClick={() => onNavigate('sessions')} className="text-xs text-sky-600 font-semibold inline-flex items-center gap-1">Все сессии <ArrowRight size={12} /></button>}
      >
        {running.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-400">Сейчас никто не заряжается</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2 font-semibold">Сессия</th>
                  <th className="px-5 py-2 font-semibold">Водитель</th>
                  <th className="px-5 py-2 font-semibold">Станция</th>
                  <th className="px-5 py-2 font-semibold">Разъём</th>
                  <th className="px-5 py-2 font-semibold text-right">Идёт</th>
                  <th className="px-5 py-2 font-semibold text-right">кВт·ч</th>
                </tr>
              </thead>
              <tbody>
                {running.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 font-mono text-xs text-sky-600 whitespace-nowrap">{s.id}</td>
                    <td className="px-5 py-2.5 text-slate-700">{s.user}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.stationName}<span className="text-xs text-slate-400"> · {s.operator}</span></td>
                    <td className="px-5 py-2.5 text-slate-500">{s.connector} · {s.power ?? '—'} кВт</td>
                    <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">{duration((Date.now() - Date.parse(s.start)) / 60000)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-slate-800 tabular-nums">{num(s.energy, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}

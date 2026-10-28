import { Zap, MapPin, Wallet, Activity, Receipt, Gauge, ArrowRight } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, dayShort, todayLong, duration, plural } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, BarList, CHART } from '../admin/ui';

function greeting() {
  const h = new Date(Date.now() + 5 * 3600_000).getUTCHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

export default function OperatorDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data, error } = useAnalytics('operator', 30);
  const { state, sessions } = useSync();
  const me = sessions.operator;
  if (!data) return <Page title={greeting()}>{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const own = new Set(data.stations.map(s => s.id));
  const running = (state?.sessions ?? []).filter(s => s.status === 'active' && own.has(s.stationId));
  // Live draw: what each running session's charger is delivering, roughly.
  const powerKw = running.reduce((n, s) => n + Math.min(s.power ?? 22, (s.power ?? 22) >= 50 ? (s.power ?? 50) * 0.6 : 11), 0);
  const t = data.totals;
  const busyShare = data.network.connectors ? (data.network.busy / data.network.connectors) * 100 : 0;

  return (
    <Page title={`${greeting()}, ${me?.org ?? 'оператор'}`} subtitle={<>{todayLong()} · ваша сеть, показатели за 30 дней</>}>
      <div className="relative overflow-hidden rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 text-[#111] bg-gradient-to-r from-[#FFC83D] to-[#FFB000]" style={{ boxShadow: '0 4px 24px rgba(255,176,0,0.25)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black/10 rounded-xl flex items-center justify-center"><Zap size={20} /></div>
          <div>
            <p className="text-black/70 text-xs font-medium">Мощность сейчас</p>
            <p className="text-2xl font-bold tabular-nums">{powerKw >= 1000 ? `${num(powerKw / 1000, 2)} МВт` : `${num(powerKw, 0)} кВт`}</p>
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div><p className="text-3xl font-bold tabular-nums">{running.length}</p><p className="text-black/70 text-xs">{plural(running.length, ['зарядка идёт', 'зарядки идут', 'зарядок идёт'])}</p></div>
          <div><p className="text-3xl font-bold tabular-nums">{data.today.completed}</p><p className="text-black/70 text-xs">завершено сегодня</p></div>
          <div><p className="text-3xl font-bold tabular-nums">{num(busyShare, 0)}%</p><p className="text-black/70 text-xs">разъёмов занято</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Станции" value={num(data.network.stations)} sub={`${data.network.online} из ${data.network.connectors} разъёмов онлайн`} icon={<MapPin size={14} />} tone="sky" />
        <Kpi label="Выручка" value={money(t.revenue, false)} sub="сум за 30 дней" change={data.deltas.revenue} icon={<Wallet size={14} />} tone="emerald" />
        <Kpi label="Сессии" value={num(t.completed)} sub={`ср. ${duration(t.avgMinutes)}`} change={data.deltas.sessions} icon={<Activity size={14} />} tone="violet" />
        <Kpi label="Средний чек" value={money(t.avgCheck, false)} sub={`сум · загрузка ${num(t.utilization, 1)}%`} change={data.deltas.avgCheck} icon={<Receipt size={14} />} tone="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Выручка по дням" right={<span className="text-xs text-slate-400">сум</span>} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.daily.filter(d => !d.partial)}>
              <defs>
                <linearGradient id="opRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayShort} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={v => money(v as number, false)} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={64} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={l => dayShort(String(l))} formatter={v => [money(v as number), 'Выручка']} />
              <Area type="monotone" dataKey="revenue" stroke={CHART.primary} fill="url(#opRev)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Станции по выручке" right={<button onClick={() => onNavigate('stations')} className="text-xs text-sky-600 font-semibold inline-flex items-center gap-1">Все <ArrowRight size={12} /></button>}>
          <BarList rows={data.stations.slice(0, 6).map(s => ({ key: s.id, label: s.name, sub: `${num(s.utilization, 1)}%`, value: s.revenue, display: money(s.revenue, false) }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Нагрузка по часам" right={<span className="text-xs text-slate-400 inline-flex items-center gap-1"><Gauge size={12} />пик — когда включать бронь</span>} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={data.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="hour" tickFormatter={h => String(h).padStart(2, '0')} tick={{ fontSize: 10, fill: CHART.axis }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: CHART.axis }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={h => `${String(h).padStart(2, '0')}:00`} formatter={v => [v as number, 'Сессий']} />
              <Bar dataKey="sessions" fill={CHART.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Типы разъёмов">
          <ul className="space-y-2.5">
            {data.connectors.map((c, i) => (
              <li key={c.type}>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-700">{c.type}</span><span className="font-semibold text-slate-800 tabular-nums">{num(c.share, 1)}%</span></div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${c.share}%`, background: CHART.palette[i % CHART.palette.length] }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card pad={false} title={<span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Заряжаются сейчас</span>} right={<button onClick={() => onNavigate('sessions')} className="text-xs text-sky-600 font-semibold inline-flex items-center gap-1">Все сессии <ArrowRight size={12} /></button>}>
        {running.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-400">Сейчас на ваших станциях никто не заряжается</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {running.map(s => (
              <li key={s.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-xs text-sky-600 w-20">{s.id}</span>
                <span className="text-slate-700 w-28">{s.user}</span>
                <span className="text-slate-600 flex-1 min-w-[160px]">{s.stationName}</span>
                <span className="text-slate-500 text-xs">{s.connector} · {s.power} кВт</span>
                <span className="text-slate-500 text-xs tabular-nums w-20 text-right">{duration((Date.now() - Date.parse(s.start)) / 60000)}</span>
                <span className="font-semibold text-slate-800 tabular-nums w-24 text-right">{num(s.energy, 1)} кВт·ч</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

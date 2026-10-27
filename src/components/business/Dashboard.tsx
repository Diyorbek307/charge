import { Wallet, Zap, Receipt, Moon, ArrowRight, AlertTriangle, Car, BatteryCharging } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, dayShort, todayLong, dateTime, duration, plural } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, BarList, Pill, CHART } from '../admin/ui';
import { FLEET, vehicleState, limitShare } from './shared';

export default function BusinessDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data, error } = useAnalytics('business', 30);
  const { state, sessions } = useSync();
  const me = sessions.business;
  if (!data) return <Page title="Обзор автопарка">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const t = data.totals;
  const acc = data.account;
  const vehicles = state?.vehicles ?? [];
  const live = (state?.sessions ?? []).filter(s => s.status === 'active' && s.corporate);
  const trips = data.trips ?? [];
  const nightShare = trips.length ? (trips.filter(x => x.night && x.status === 'completed').length / Math.max(1, trips.filter(x => x.status === 'completed').length)) * 100 : 0;
  const employees = [...(data.employees ?? [])].map(e => ({ ...e, ...limitShare(e.spentMonth, e.limit) })).sort((a, b) => b.share - a.share);
  const near = employees.filter(e => e.share >= 0.8);
  const budgetShare = acc?.budget ? (acc.spentMonth / acc.budget) * 100 : 0;
  const lowBalance = acc && acc.balance < acc.threshold;

  return (
    <Page title={`${me?.org ?? 'Автопарк'}`} subtitle={<>{todayLong()} · корпоративные зарядки, показатели за 30 дней</>}>
      <div className="relative overflow-hidden rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 text-white" style={{ background: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)', boxShadow: '0 4px 24px rgba(79,107,255,0.3)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Wallet size={20} /></div>
          <div>
            <p className="text-white/80 text-xs font-medium">Баланс корпоративного счёта</p>
            <p className="text-2xl font-bold tabular-nums">{money(acc?.balance ?? 0)}</p>
            {acc?.runwayDays !== null && acc?.runwayDays !== undefined && (
              <p className="text-white/70 text-xs mt-0.5">{`хватит примерно на ${acc.runwayDays} дн. при текущих расходах`}</p>
            )}
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div><p className="text-3xl font-bold tabular-nums">{live.length}</p><p className="text-white/80 text-xs">{plural(live.length, ['машина заряжается', 'машины заряжаются', 'машин заряжается'])}</p></div>
          <div><p className="text-3xl font-bold tabular-nums">{num(budgetShare, 0)}%</p><p className="text-white/80 text-xs">бюджета месяца</p></div>
          <div><p className="text-3xl font-bold tabular-nums">{near.length}</p><p className="text-white/80 text-xs">у лимита</p></div>
        </div>
        <button onClick={() => onNavigate('billing')} className="px-4 py-2 rounded-xl bg-white text-indigo-700 text-sm font-semibold hover:bg-white/90">Пополнить</button>
      </div>

      {lowBalance && (
        <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <AlertTriangle size={15} />
          {`Баланс ниже порога ${money(acc!.threshold)} — сотрудники не смогут начать зарядку за счёт компании, когда он закончится.`}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Расходы" value={money(t.revenue, false)} sub="сум за 30 дней" change={data.deltas.revenue} goodWhenUp={false} icon={<Wallet size={14} />} tone="violet" />
        <Kpi label="Зарядки" value={num(t.completed)} sub={`ср. ${duration(t.avgMinutes)}`} change={data.deltas.sessions} icon={<Zap size={14} />} tone="sky" />
        <Kpi label="Цена за кВт·ч" value={num(t.avgPrice)} sub={`сум · ${num(t.energy, 0)} кВт·ч всего`} icon={<Receipt size={14} />} tone="amber" />
        <Kpi label="Ночные зарядки" value={`${num(nightShare, 0)}%`} sub="цена ×0.7 с 23:00 до 07:00" icon={<Moon size={14} />} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Расходы по дням" right={<span className="text-xs text-slate-400">сум</span>} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.daily.filter(d => !d.partial)}>
              <defs>
                <linearGradient id="bizSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={FLEET} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={FLEET} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayShort} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={v => money(v as number, false)} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={64} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={l => dayShort(String(l))} formatter={v => [money(v as number), 'Расходы']} />
              <Area type="monotone" dataKey="revenue" stroke={FLEET} fill="url(#bizSpend)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="По отделам" right={<span className="text-xs text-slate-400">30 дней</span>}>
          {(data.departments ?? []).length ? (
            <BarList color={FLEET} rows={(data.departments ?? []).map(d => ({ key: d.dept, label: d.dept, sub: `${d.sessions} ${plural(d.sessions, ['зарядка', 'зарядки', 'зарядок'])}`, value: d.spent, display: money(d.spent, false) }))} />
          ) : (
            <p className="text-sm text-slate-400">Зарядок за счёт компании пока не было</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Лимиты сотрудников" right={<button onClick={() => onNavigate('employees')} className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1">Все <ArrowRight size={12} /></button>}>
          <ul className="space-y-3">
            {employees.slice(0, 5).map(e => (
              <li key={e.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
                  <span className="text-slate-700 truncate">{e.name} <span className="text-xs text-slate-400">{e.dept}</span></span>
                  <span className="font-semibold text-slate-800 tabular-nums shrink-0">{`${money(e.spentMonth, false)} из ${money(e.limit)}`}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, e.share * 100)}%`, background: e.color }} /></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Автопарк сейчас" right={<button onClick={() => onNavigate('fleet')} className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1">Все машины <ArrowRight size={12} /></button>}>
          <ul className="divide-y divide-slate-50">
            {vehicles.map(v => {
              const st = vehicleState(v, live);
              return (
                <li key={v.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${st === 'charging' ? 'bg-sky-50 text-sky-600' : st === 'low' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                    {st === 'charging' ? <BatteryCharging size={15} /> : <Car size={15} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-slate-800 truncate">{v.model}</span>
                    <span className="block text-xs text-slate-400">{`${v.plate} · ${v.driver}`}</span>
                  </span>
                  <span className="tabular-nums text-slate-700 font-semibold">{v.battery}%</span>
                  {st === 'charging' ? <Pill tone="sky">Заряжается</Pill> : st === 'low' ? <Pill tone="amber">Нужна зарядка</Pill> : <Pill tone="green">Готов</Pill>}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card pad={false} title="Последние зарядки" right={<button onClick={() => onNavigate('expenses')} className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1">Все расходы <ArrowRight size={12} /></button>}>
        {trips.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-400">Зарядок за счёт компании пока не было</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {trips.slice(0, 6).map(x => (
              <li key={x.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-xs text-slate-400 w-28 tabular-nums">{dateTime(x.start)}</span>
                <span className="text-slate-700 w-36 truncate">{x.employee}</span>
                <span className="text-slate-600 flex-1 min-w-[160px] truncate">{x.station}</span>
                <span className="text-slate-500 text-xs tabular-nums">{`${num(x.energy, 1)} кВт·ч`}</span>
                {x.night && <Pill tone="green"><Moon size={10} />ночь</Pill>}
                <span className="font-semibold text-slate-800 tabular-nums w-28 text-right">{x.status === 'failed' ? <Pill tone="red">Ошибка</Pill> : money(x.cost)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

import { useState } from 'react';
import { Building2, MapPin, Zap, Wallet, Mail, Calendar, PlugZap, Inbox } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, dateShort, plural } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, CHART } from './ui';
import { OcpiPartners } from './OcpiPartners';
import { OperatorSetup } from './OperatorSetup';

const STATUS = {
  active: { tone: 'green' as const, label: 'Активен' },
  pending: { tone: 'amber' as const, label: 'На ревью' },
  suspended: { tone: 'red' as const, label: 'Приостановлен' },
};

export default function AdminOperators({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data, error, reload } = useAnalytics('admin', 30);
  const { actions } = useSync();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [setup, setSetup] = useState<string | null>(null);

  if (!data) return <Page title="Операторы">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const setStatus = async (id: string, status: 'active' | 'suspended') => {
    setBusy(id);
    setFailure('');
    try {
      await actions.setOperatorStatus('admin', id, status);
      await reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const active = data.operators.filter(o => o.status === 'active');
  const pending = data.operators.filter(o => o.status === 'pending');

  return (
    <Page
      title="Операторы"
      subtitle={`${active.length} активных · ${pending.length} на ревью · показатели за 30 дней`}
      actions={
        <button onClick={() => onNavigate('leads')} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600">
          <Inbox size={15} />Заявки на подключение
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Операторы" value={data.operators.length} sub={`${active.length} ${plural(active.length, ['активный', 'активных', 'активных'])}`} icon={<Building2 size={14} />} tone="sky" />
        <Kpi label="Станции" value={num(data.network.stations)} sub={`${data.network.cities} ${plural(data.network.cities, ['город', 'города', 'городов'])}`} icon={<MapPin size={14} />} tone="emerald" />
        <Kpi label="Разъёмы" value={num(data.network.connectors)} sub={`${data.network.online} онлайн`} icon={<Zap size={14} />} tone="amber" />
        <Kpi label="Оборот сети" value={money(data.totals.revenue, false)} sub="сум за 30 дней" change={data.deltas.revenue} icon={<Wallet size={14} />} tone="violet" />
      </div>

      <OcpiPartners onChanged={reload} />

      {failure && <ErrorNote text={failure} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.operators.map(o => {
          const st = STATUS[o.status as keyof typeof STATUS] ?? STATUS.pending;
          return (
            <Card key={o.id}>
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5" aria-hidden="true">{o.logo}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{o.name}</h3>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    <Pill tone="slate"><PlugZap size={11} />{o.integration}</Pill>
                    {o.settlement === 'direct' && <Pill tone="amber">Оплата напрямую</Pill>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{o.region}</p>
                  <p className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Calendar size={11} />{`с ${dateShort(o.since)}`}</span>
                    <a href={`mailto:${o.contact}`} className="inline-flex items-center gap-1 hover:text-sky-600"><Mail size={11} />{o.contact}</a>
                  </p>
                </div>
              </div>

              <button onClick={() => setSetup(setup === o.id ? null : o.id)} aria-expanded={setup === o.id} className="mt-3 text-xs font-semibold text-[#8a5b00] hover:underline">
                {setup === o.id ? 'Скрыть подключение и оплату' : 'Подключение и оплата'}
              </button>
              {setup === o.id && <OperatorSetup operatorId={o.id} onChanged={reload} />}

              <div className="grid grid-cols-4 gap-2 mt-4">
                {[
                  ['Станции', num(o.stations)],
                  ['Разъёмы', `${o.online}/${o.evse}`],
                  ['Сессии', num(o.completed)],
                  ['Загрузка', `${num(o.utilization, 1)}%`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 px-2 py-2 text-center">
                    <p className="text-base font-bold text-slate-900 tabular-nums">{v}</p>
                    <p className="text-[11px] text-slate-400">{k}</p>
                  </div>
                ))}
              </div>

              {o.status !== 'pending' && (
                <div className="mt-4 flex items-end gap-4">
                  <div className="flex-1 h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={o.trend.map((v, i) => ({ i, v }))}>
                        <Area type="monotone" dataKey="v" stroke={CHART.primary} fill={CHART.primary} fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{money(o.revenue)}</p>
                    <p className="text-[11px] text-slate-400">
                      {`комиссия ${num(o.commissionRate, 1)}% · ${money(o.commission)}`}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                {o.status === 'pending' && (
                  <>
                    <p className="flex-1 text-xs text-slate-500">Станции появятся у водителей после одобрения.</p>
                    <button disabled={busy === o.id} onClick={() => setStatus(o.id, 'active')} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50">Одобрить</button>
                    <button disabled={busy === o.id} onClick={() => setStatus(o.id, 'suspended')} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Отклонить</button>
                  </>
                )}
                {o.status === 'active' && (
                  confirm === o.id ? (
                    <>
                      <p className="flex-1 text-xs text-red-600">{`Водители не смогут начать зарядку на станциях ${o.name}. Приостановить?`}</p>
                      <button disabled={busy === o.id} onClick={() => setStatus(o.id, 'suspended')} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50">Приостановить</button>
                      <button onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold">Отмена</button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 text-xs text-slate-400">{`Выплаты на ${o.iban}`}</p>
                      <button onClick={() => setConfirm(o.id)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">Приостановить</button>
                    </>
                  )
                )}
                {o.status === 'suspended' && (
                  <>
                    <p className="flex-1 text-xs text-red-600">Сеть приостановлена — запуск зарядки на её станциях запрещён.</p>
                    <button disabled={busy === o.id} onClick={() => setStatus(o.id, 'active')} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50">Возобновить</button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

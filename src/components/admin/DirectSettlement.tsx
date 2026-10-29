import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Zap, Percent, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { DirectReport, Portal } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty, Segmented, CHART } from './ui';

const KIND: Record<DirectReport['lines'][number]['kind'], { label: string; tone: 'green' | 'amber' | 'slate' | 'red' }> = {
  topup: { label: 'Пополнение', tone: 'green' },
  'topup-reversed': { label: 'Возврат платежа', tone: 'red' },
  charge: { label: 'Зарядка', tone: 'amber' },
  refund: { label: 'Возврат зарядки', tone: 'slate' },
};

/**
 * Money that goes straight to partner networks. Nothing here passes through
 * PowerGo: the networks' cashboxes confirm every payment to us, so we see
 * what each network received, what drivers charged, and the commission due.
 */
export function DirectSettlement({ portal }: { portal: Extract<Portal, 'admin' | 'operator'> }) {
  const { actions, events } = useSync();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [data, setData] = useState<DirectReport | null>(null);
  const [error, setError] = useState('');
  const latest = events.find(e => e.type === 'wallet.topup' || e.type === 'session.stop' || e.type === 'wallet.refund')?.id;
  const load = useCallback(() => {
    actions.directSettlement(portal, Number(days)).then(setData).catch(e => setError((e as Error).message));
  }, [actions, portal, days]);
  useEffect(load, [load, latest]);

  const title = portal === 'admin' ? 'Расчёты с сетями' : 'Прямые оплаты';
  if (!data) return <Page title={title}>{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const chart = data.rows.length
    ? data.rows[0].byDay.map((d, i) => ({ date: d.date.slice(5), received: data.rows.reduce((s, r) => s + (r.byDay[i]?.received ?? 0), 0), charged: data.rows.reduce((s, r) => s + (r.byDay[i]?.charged ?? 0), 0) }))
    : [];

  return (
    <Page
      title={title}
      subtitle={portal === 'admin'
        ? 'Сети, которые принимают оплату напрямую: деньги водителей идут в их кассы Payme и Click, а подтверждения — нам. Комиссию сеть оплачивает по счёту.'
        : 'Водители пополняют баланс вашей сети — деньги поступают в вашу кассу. Здесь всё, что прошло, и комиссия PowerGo за период.'}
      actions={<Segmented options={[{ id: '7', label: '7 дней' }, { id: '30', label: '30 дней' }, { id: '90', label: '90 дней' }]} value={days} onChange={setDays} />}
    >
      {error && <ErrorNote text={error} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Поступило сетям" value={money(data.totals.received, false)} sub="сум · пополнения" icon={<ArrowDownToLine size={14} />} tone="emerald" />
        <Kpi label="Списано за зарядки" value={money(data.totals.charged, false)} sub="сум" icon={<Zap size={14} />} tone="amber" />
        <Kpi label={portal === 'admin' ? 'Комиссия к оплате нам' : 'Комиссия PowerGo'} value={money(data.totals.commission, false)} sub="сум за период" icon={<Percent size={14} />} tone="violet" />
        <Kpi label="На балансах водителей" value={money(data.totals.held, false)} sub="сум · ещё не потрачено" icon={<Wallet size={14} />} tone="sky" />
      </div>

      {data.rows.length === 0 ? (
        <Card><Empty text={portal === 'admin' ? 'Пока ни одна сеть не принимает оплату напрямую — включите это в «Операторы → Подключение и оплата»' : 'Ваша сеть получает выплаты через платформу'} /></Card>
      ) : (
        <>
          <Card title="По дням" right={<span className="text-xs text-slate-400">сум</span>}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => money(v as number, false)} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v, n) => [money(Number(v ?? 0)), n === 'received' ? 'Поступило' : 'Списано']} />
                  <Bar dataKey="received" fill="#10B981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="charged" fill="#FFB000" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card pad={false} title={<span className="px-5 pt-5 block">По сетям</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-5 py-3 font-semibold">Сеть</th>
                    <th className="px-5 py-3 font-semibold text-right">Поступило</th>
                    <th className="px-5 py-3 font-semibold text-right">Зарядки</th>
                    <th className="px-5 py-3 font-semibold text-right">Комиссия</th>
                    <th className="px-5 py-3 font-semibold text-right">На балансах</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.operatorId} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.name}</p>
                        <p className="text-xs text-slate-500">
                          {r.mode === 'direct' ? 'оплата напрямую' : 'через платформу'}
                          {r.sandbox ? ' · демо-касса' : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <p className="font-semibold text-slate-900">{money(r.received)}</p>
                        <p className="text-xs text-slate-500">{`${num(r.payments)} платежей`}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <p className="text-slate-800">{money(r.charged)}</p>
                        <p className="text-xs text-slate-500">{`${num(r.charges)} зарядок`}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">{money(r.commission)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{money(r.held)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card pad={false} title={<span className="px-5 pt-5 block">Движение денег</span>}>
            {data.lines.length === 0 ? (
              <div className="p-5"><Empty text="За период движений не было" /></div>
            ) : (
              <div className="divide-y divide-slate-50">
                {data.lines.map(l => (
                  <div key={l.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-sm">
                    <Pill tone={KIND[l.kind].tone}>{KIND[l.kind].label}</Pill>
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-slate-800">{portal === 'admin' ? `${l.network} · ${l.user}` : l.user}</p>
                      <p className="text-xs text-slate-500">{`${dateTime(l.at)}${l.provider ? ` · ${l.provider === 'payme' ? 'Payme' : 'Click'}` : ''} · ${l.ref}`}</p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className={`font-semibold ${l.kind === 'topup' ? 'text-emerald-700' : 'text-slate-900'}`}>{`${l.kind === 'topup' ? '+' : ''}${money(l.amount)}`}</p>
                      {l.commission ? <p className="text-xs text-slate-500">{`комиссия ${money(l.commission)}`}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

export default DirectSettlement;

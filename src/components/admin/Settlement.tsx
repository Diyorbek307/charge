import { useMemo, useState } from 'react';
import { Banknote, Clock, Percent, CalendarClock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAnalytics, money, num, monthShort, monthLong, dateShort, plural } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Segmented, CHART, STATUS_PILL } from './ui';

/**
 * Monthly settlement with operators: the month is closed on the 1st and the
 * payout (revenue minus platform commission) leaves on the 2nd.
 */
export default function AdminSettlement() {
  const { data, error } = useAnalytics('admin', 30);
  const [status, setStatus] = useState<'all' | 'accruing' | 'processing' | 'paid'>('all');
  const invoices = useMemo(() => (data?.invoices ?? []).filter(i => status === 'all' || i.status === status), [data, status]);
  if (!data?.invoices) return <Page title="Расчёты с операторами">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const all = data.invoices;
  const months = [...new Set(all.map(i => i.month))].sort();
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const sum = (m: string | undefined, k: 'payout' | 'commission' | 'revenue') => all.filter(i => i.month === m).reduce((n, i) => n + i[k], 0);
  const nextPay = all.find(i => i.month === current)?.payDate;
  const chart = months.map(m => ({ month: m, payout: sum(m, 'payout'), commission: sum(m, 'commission') }));

  return (
    <Page
      title="Расчёты с операторами"
      subtitle="Месяц закрывается 1-го числа, выплата оператору — 2-го: оборот минус комиссия платформы"
      actions={
        <ExportButton
          name="invoices"
          title="Инвойсы операторам"
          portal="admin"
          headers={['Инвойс', 'Оператор', 'Период', 'Сессии', 'кВт·ч', 'Оборот, сум', 'Комиссия, %', 'Комиссия, сум', 'К выплате, сум', 'Дата выплаты', 'Статус', 'IBAN']}
          rows={invoices.map(i => [i.id, i.operator, monthLong(i.month), i.sessions, i.energy, i.revenue, i.commissionRate, i.commission, i.payout, i.payDate.slice(0, 10), STATUS_PILL[i.status].label, i.iban])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={`Начислено · ${monthShort(current)}`} value={money(sum(current, 'payout'), false)} sub="сум к выплате операторам" icon={<Clock size={14} />} tone="sky" />
        <Kpi label={`Выплачено · ${previous ? monthShort(previous) : '—'}`} value={money(sum(previous, 'payout'), false)} sub="сум" icon={<Banknote size={14} />} tone="emerald" />
        <Kpi label={`Комиссия · ${monthShort(current)}`} value={money(sum(current, 'commission'), false)} sub={`сум · ${num((sum(current, 'commission') / Math.max(sum(current, 'revenue'), 1)) * 100, 1)}% оборота`} icon={<Percent size={14} />} tone="violet" />
        <Kpi label="Следующая выплата" value={nextPay ? dateShort(nextPay) : '—'} sub={`${all.filter(i => i.month === current).length} ${plural(all.filter(i => i.month === current).length, ['инвойс', 'инвойса', 'инвойсов'])}`} icon={<CalendarClock size={14} />} tone="amber" />
      </div>

      <Card title="Выплаты операторам и комиссия по месяцам" right={<span className="text-xs text-slate-400">сум</span>}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="month" tickFormatter={m => monthShort(String(m))} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => money(v as number, false)} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={64} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
              labelFormatter={m => monthLong(String(m))}
              formatter={(v, name) => [money(v as number), name === 'payout' ? 'Операторам' : 'Комиссия']}
            />
            <Bar dataKey="payout" stackId="a" fill={CHART.primary} />
            <Bar dataKey="commission" stackId="a" fill={CHART.secondary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card pad={false} title="Инвойсы" right={
        <Segmented value={status} onChange={setStatus} options={[{ id: 'all', label: 'Все' }, { id: 'accruing', label: 'Начисляются' }, { id: 'processing', label: 'В обработке' }, { id: 'paid', label: 'Выплачены' }]} />
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                <th className="px-5 py-2.5 font-semibold">Инвойс</th>
                <th className="px-5 py-2.5 font-semibold">Оператор</th>
                <th className="px-5 py-2.5 font-semibold">Период</th>
                <th className="px-5 py-2.5 font-semibold text-right">Сессии</th>
                <th className="px-5 py-2.5 font-semibold text-right">Оборот</th>
                <th className="px-5 py-2.5 font-semibold text-right">Комиссия</th>
                <th className="px-5 py-2.5 font-semibold text-right">К выплате</th>
                <th className="px-5 py-2.5 font-semibold">Выплата</th>
                <th className="px-5 py-2.5 font-semibold">Статус</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5 font-mono text-xs text-sky-600">{i.id}</td>
                  <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap"><span className="mr-1.5" aria-hidden="true">{i.logo}</span>{i.operator}</td>
                  <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{monthLong(i.month)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{num(i.sessions)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{money(i.revenue)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-red-500 whitespace-nowrap">−{money(i.commission)} <span className="text-[11px] text-slate-400">({num(i.commissionRate, 1)}%)</span></td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-emerald-700 whitespace-nowrap">{money(i.payout)}</td>
                  <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dateShort(i.payDate)}</td>
                  <td className="px-5 py-2.5"><Pill tone={STATUS_PILL[i.status].tone}>{STATUS_PILL[i.status].label}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

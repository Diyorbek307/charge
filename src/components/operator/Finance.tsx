import { Wallet, Percent, Banknote, CalendarClock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAnalytics, money, num, monthShort, monthLong, dateShort } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, CHART, STATUS_PILL } from '../admin/ui';

export default function OperatorFinance() {
  const { data, error } = useAnalytics('operator', 30);
  if (!data?.invoices) return <Page title="Финансы">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const inv = data.invoices;
  const current = inv.find(i => i.status === 'accruing');
  const lastPaid = inv.find(i => i.status === 'paid');
  const op = data.operators[0];

  return (
    <Page
      title="Финансы и выплаты"
      subtitle={`Платформа удерживает комиссию ${op ? num(op.commissionRate, 1) : '—'}% и переводит остаток 2-го числа следующего месяца${op?.iban ? ` на ${op.iban}` : ''}`}
      actions={
        <ExportButton
          name="my-invoices"
          title="Инвойсы"
          portal="operator"
          headers={['Инвойс', 'Период', 'Сессии', 'кВт·ч', 'Оборот, сум', 'Комиссия, сум', 'К выплате, сум', 'Дата выплаты', 'Статус']}
          rows={inv.map(i => [i.id, monthLong(i.month), i.sessions, i.energy, i.revenue, i.commission, i.payout, i.payDate.slice(0, 10), STATUS_PILL[i.status].label])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={current ? `Оборот · ${monthShort(current.month)}` : 'Оборот'} value={money(current?.revenue ?? 0, false)} sub={`сум · ${num(current?.sessions ?? 0)} сессий`} icon={<Wallet size={14} />} tone="emerald" />
        <Kpi label="Комиссия платформы" value={money(current?.commission ?? 0, false)} sub={`сум · ${op ? num(op.commissionRate, 1) : '—'}%`} icon={<Percent size={14} />} tone="violet" />
        <Kpi label="К выплате" value={money(current?.payout ?? 0, false)} sub={current ? `сум · ${dateShort(current.payDate)}` : ''} icon={<CalendarClock size={14} />} tone="sky" />
        <Kpi label="Последняя выплата" value={money(lastPaid?.payout ?? 0, false)} sub={lastPaid ? `сум · ${dateShort(lastPaid.payDate)}` : 'ещё не было'} icon={<Banknote size={14} />} tone="amber" />
      </div>

      <Card title="Оборот по месяцам" right={<span className="text-xs text-slate-400">сум</span>}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="month" tickFormatter={m => monthShort(String(m))} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => money(v as number, false)} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={64} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} labelFormatter={m => monthLong(String(m))} formatter={v => [money(v as number), 'Оборот']} />
            <Bar dataKey="revenue" fill={CHART.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2">Текущий месяц неполный — он ещё начисляется.</p>
      </Card>

      <Card pad={false} title="Инвойсы">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                <th className="px-5 py-2.5 font-semibold">Инвойс</th>
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
              {inv.map(i => (
                <tr key={i.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5 font-mono text-xs text-sky-600 whitespace-nowrap">{i.id}</td>
                  <td className="px-5 py-2.5 text-slate-700">{monthLong(i.month)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{num(i.sessions)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{money(i.revenue)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-red-500 whitespace-nowrap">−{money(i.commission)}</td>
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

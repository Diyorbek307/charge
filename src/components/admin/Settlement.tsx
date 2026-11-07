import { useMemo, useState } from 'react';
import { Banknote, Clock, Percent, CalendarClock, FileText, CheckCircle2, Undo2, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAnalytics, money, num, monthShort, monthLong, dateShort, plural, type Invoice } from '../../lib/analytics';
import { apiClient } from '../../lib/api';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Segmented, CHART, STATUS_PILL } from './ui';
import { downloadAct } from '../../lib/act';

/**
 * Monthly settlement with operators: the month is closed on the 1st and the
 * payout (revenue minus platform commission) leaves on the 2nd. A statement
 * reads "paid" only once the admin marks the bank transfer here.
 */

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** The form for one bank transfer: amount, date and the payment order's number. */
function MarkPayout({ inv, onDone, onCancel }: { inv: Invoice; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(inv.payout));
  const [paidAt, setPaidAt] = useState(today());
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.markPayout({ invoiceId: inv.id, operatorId: inv.operatorId, amount: Number(amount.replace(/\s/g, '')), paidAt, ref });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={`Выплата: ${inv.operator} · ${monthLong(inv.month)}`} right={<span className="text-xs text-slate-400">к выплате {money(inv.payout)}{inv.iban ? ` · ${inv.iban}` : ''}</span>}>
      <p className="text-sm text-slate-500 mb-3">Сначала переведите деньги из банка, потом отметьте перевод здесь. Сеть увидит его в своём кабинете.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-slate-500">Сумма перевода, сум
          <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Дата перевода
          <input type="date" value={paidAt} max={today()} onChange={e => setPaidAt(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Номер платёжного поручения
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder="например, 1245" className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800" />
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button disabled={busy || !ref.trim()} onClick={() => void save()} className="h-10 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">Отметить выплату</button>
        <button onClick={onCancel} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Отмена</button>
      </div>
    </Card>
  );
}
export default function AdminSettlement() {
  const { data, error, reload } = useAnalytics('admin', 30);
  const [status, setStatus] = useState<'all' | 'accruing' | 'processing' | 'overdue' | 'paid'>('all');
  const [marking, setMarking] = useState<Invoice | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const undo = async (i: Invoice) => {
    if (!window.confirm(`Снять отметку выплаты ${i.id}? Статус снова станет «не выплачено».`)) return;
    setUndoError(null);
    try {
      await apiClient.undoPayout(i.id, i.operatorId);
      reload();
    } catch (e) {
      setUndoError(e instanceof Error ? e.message : 'Не получилось');
    }
  };
  const invoices = useMemo(() => (data?.invoices ?? []).filter(i => status === 'all' || i.status === status), [data, status]);
  if (!data?.invoices) return <Page title="Расчёты с операторами">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const all = data.invoices;
  const months = [...new Set(all.map(i => i.month))].sort();
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const sum = (m: string | undefined, k: 'payout' | 'commission' | 'revenue') => all.filter(i => i.month === m).reduce((n, i) => n + i[k], 0);
  const paidOut = (m: string | undefined) => all.filter(i => i.month === m && i.status === 'paid').reduce((n, i) => n + (i.paidAmount ?? i.payout), 0);
  const overdue = all.filter(i => i.status === 'overdue');
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
          rows={invoices.map(i => [i.id, i.operator, monthLong(i.month), i.sessions, i.energy, i.revenue, i.commissionRate, i.commission, i.payout, (i.paidAt ?? i.payDate).slice(0, 10), STATUS_PILL[i.status].label, i.iban])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={`Начислено · ${monthShort(current)}`} value={money(sum(current, 'payout'), false)} sub="сум к выплате операторам" icon={<Clock size={14} />} tone="sky" />
        <Kpi label={`Выплачено · ${previous ? monthShort(previous) : '—'}`} value={money(paidOut(previous), false)} sub={`из ${money(sum(previous, 'payout'), false)} сум`} icon={<Banknote size={14} />} tone="emerald" />
        <Kpi label={`Комиссия · ${monthShort(current)}`} value={money(sum(current, 'commission'), false)} sub={`сум · ${num((sum(current, 'commission') / Math.max(sum(current, 'revenue'), 1)) * 100, 1)}% оборота`} icon={<Percent size={14} />} tone="violet" />
        <Kpi label="Следующая выплата" value={nextPay ? dateShort(nextPay) : '—'} sub={`${all.filter(i => i.month === current).length} ${plural(all.filter(i => i.month === current).length, ['инвойс', 'инвойса', 'инвойсов'])}`} icon={<CalendarClock size={14} />} tone="amber" />
      </div>

      {overdue.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p><b>{`Просрочено выплат: ${overdue.length}`}</b> {`на ${money(overdue.reduce((n, i) => n + i.payout, 0))}. Переведите сетям их долю и отметьте каждую выплату — иначе каждый день будет приходить напоминание.`}</p>
        </div>
      )}
      {marking && <MarkPayout inv={marking} onCancel={() => setMarking(null)} onDone={() => { setMarking(null); reload(); }} />}
      {undoError && <ErrorNote text={undoError} />}

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
        <Segmented value={status} onChange={setStatus} options={[{ id: 'all', label: 'Все' }, { id: 'accruing', label: 'Начисляются' }, { id: 'processing', label: 'В обработке' }, { id: 'overdue', label: 'Просрочены' }, { id: 'paid', label: 'Выплачены' }]} />
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
                <th className="px-5 py-2.5 font-semibold"><span className="sr-only">Акт</span></th>
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
                  <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {i.paidAt ? <><span className="text-emerald-700 font-semibold">{dateShort(i.paidAt)}</span><br /><span className="text-slate-400">п/п {i.paidRef}</span></> : i.mode === 'direct' ? 'напрямую сети' : dateShort(i.payDate)}
                  </td>
                  <td className="px-5 py-2.5"><Pill tone={STATUS_PILL[i.status].tone}>{STATUS_PILL[i.status].label}</Pill></td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="inline-flex gap-1.5">
                      {(i.status === 'processing' || i.status === 'overdue') && i.mode !== 'direct' && <button onClick={() => setMarking(i)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111] text-white text-xs font-semibold whitespace-nowrap"><CheckCircle2 size={12} />Отметить выплату</button>}
                      {i.paidAt && <button onClick={() => void undo(i)} title="Снять отметку" aria-label={`Снять отметку выплаты ${i.id}`} className="inline-flex items-center px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"><Undo2 size={12} /></button>}
                      {i.status !== 'accruing' && <button onClick={() => void downloadAct(i)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 whitespace-nowrap"><FileText size={12} />Акт PDF</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

import { useState, type ReactNode } from 'react';
import { Package, Zap, Battery, Banknote, CheckCircle2, XCircle } from 'lucide-react';
import { apiClient, type VolumePeriod, type VolumeView } from '../../lib/api';
import { money, num, dateShort } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Pill, Empty } from '../admin/ui';

/**
 * Voli buys the network's charging ahead: a volume of kWh each month or week,
 * paid whether drivers use it or not. Shared by the network's cabinet and the
 * admin (who also gets the buttons to mark a prepayment).
 */

const PAY: Record<VolumePeriod['status'], { tone: 'green' | 'amber' | 'red'; label: string }> = {
  paid: { tone: 'green', label: 'Оплачен' },
  due: { tone: 'amber', label: 'Ожидает оплаты' },
  overdue: { tone: 'red', label: 'Оплата просрочена' },
};

export const kwh = (n: number) => `${num(n)} кВт·ч`;
export const range = (p: VolumePeriod) => `${dateShort(p.from)} — ${dateShort(p.to)}`;
export const kindLabel = (k: 'month' | 'week') => (k === 'week' ? 'неделя' : 'месяц');

/** What the network said about a marked payment. */
export function ReceiptLine({ p }: { p: VolumePeriod }) {
  const r = p.receipt;
  if (!r) return null;
  if (r.status === 'confirmed') return <span className="text-[11px] font-semibold text-emerald-700">Сеть подтвердила получение</span>;
  if (r.status === 'auto') return <span className="text-[11px] text-slate-400">Принято: сеть не возразила</span>;
  if (r.status === 'disputed') return <span className="text-[11px] font-semibold text-red-600">{`Сеть: не получили — ${r.note ?? ''}`}</span>;
  return <span className="text-[11px] text-amber-700">{`Ждёт подтверждения сети до ${dateShort(r.by ?? '')}`}</span>;
}

export function PayStatus({ p }: { p: VolumePeriod }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Pill tone={PAY[p.status].tone}>{PAY[p.status].label}</Pill>
      <span className="text-[11px] text-slate-400 whitespace-nowrap">
        {p.paidAt ? `${dateShort(p.paidAt)}${p.paidRef ? ` · п/п ${p.paidRef}` : ''}` : `до ${dateShort(p.payBy)}`}
      </span>
      <ReceiptLine p={p} />
    </div>
  );
}

/** The network's answer to a payment Voli marked: received, or not (with what is wrong). */
function ConfirmReceipt({ p, onDone }: { p: VolumePeriod; onDone: () => void }) {
  const [disputing, setDisputing] = useState(p.receipt?.status === 'disputed');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (ok: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.volumeReceipt(p.id, ok, ok ? undefined : note.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  const disputed = p.receipt?.status === 'disputed';
  return (
    <div className={`rounded-2xl border px-4 py-3 ${disputed ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <p className="text-sm text-slate-800">
        <b>{`Voli отправила ${money(p.paidAmount ?? p.amount)} за ${range(p)}`}</b>
        {` · п/п ${p.paidRef ?? '—'} от ${dateShort(p.paidAt ?? '')}`}
      </p>
      <p className="text-xs text-slate-600 mt-1">
        {disputed
          ? `Вы сообщили: «${p.receipt?.note ?? ''}». Voli разбирается. Когда деньги придут, подтвердите получение.`
          : `Проверьте счёт и подтвердите получение до ${dateShort(p.receipt?.by ?? '')}. Если не ответить, оплата будет считаться принятой.`}
      </p>
      {disputing && !disputed && (
        <label className="block text-xs font-semibold text-slate-600 mt-3">Что не так
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="например, деньги не пришли или пришло меньше" className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white" />
        </label>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button disabled={busy} onClick={() => void send(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40"><CheckCircle2 size={14} />Деньги получены</button>
        {!disputed && (disputing
          ? <button disabled={busy || note.trim().length < 3} onClick={() => void send(false)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-red-300 bg-white text-red-700 text-sm font-semibold disabled:opacity-40"><XCircle size={14} />Отправить</button>
          : <button disabled={busy} onClick={() => setDisputing(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold disabled:opacity-40"><XCircle size={14} />Не получили</button>)}
      </div>
    </div>
  );
}

/** The bar of a period: used of bought, with what went over in red. */
export function UsageBar({ p }: { p: VolumePeriod }) {
  const share = p.total ? Math.min(100, (p.used / p.total) * 100) : 0;
  return (
    <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100} aria-label="Израсходовано">
      <div className={`h-full rounded-full ${p.over ? 'bg-red-500' : 'bg-[#8FD61A]'}`} style={{ width: `${share}%` }} />
    </div>
  );
}

export function PeriodsTable({ periods, action }: { periods: VolumePeriod[]; action?: (p: VolumePeriod) => ReactNode }) {
  if (!periods.length) return <Empty text="Первый период ещё не начался" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
            <th className="px-5 py-2.5 font-semibold">Период</th>
            <th className="px-5 py-2.5 font-semibold text-right">Выкуплено</th>
            <th className="px-5 py-2.5 font-semibold text-right">Перенесено</th>
            <th className="px-5 py-2.5 font-semibold text-right">Израсходовано</th>
            <th className="px-5 py-2.5 font-semibold text-right">Остаток</th>
            <th className="px-5 py-2.5 font-semibold text-right">Сумма</th>
            <th className="px-5 py-2.5 font-semibold">Оплата</th>
            {action && <th className="px-5 py-2.5 font-semibold"><span className="sr-only">Действия</span></th>}
          </tr>
        </thead>
        <tbody>
          {periods.map(p => (
            <tr key={p.id} className="border-b border-slate-50 last:border-0 align-top">
              <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">
                {range(p)}
                <span className="block text-[11px] text-slate-400">{p.current ? `${kindLabel(p.kind)} · идёт сейчас` : kindLabel(p.kind)}</span>
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{kwh(p.kwh)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{p.carriedIn ? kwh(p.carriedIn) : '—'}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">
                {kwh(p.used)}
                <span className="block text-[11px] text-slate-400">{`${num(p.sessions)} зарядок`}</span>
              </td>
              <td className={`px-5 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${p.over ? 'text-red-600' : 'text-emerald-700'}`}>
                {p.over ? `сверх ${kwh(p.over)}` : kwh(p.left)}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums text-slate-800 whitespace-nowrap">
                {money(p.amount)}
                {p.overAmount > 0 && <span className="block text-[11px] text-red-600">{`+ ${money(p.overAmount)} сверх объёма`}</span>}
              </td>
              <td className="px-5 py-2.5"><PayStatus p={p} /></td>
              {action && <td className="px-5 py-2.5 text-right">{action(p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const exportRows = (periods: VolumePeriod[]) =>
  periods.map(p => [p.from, p.to, kindLabel(p.kind), p.kwh, p.carriedIn, p.used, p.sessions, p.left, p.over, p.price, p.amount, p.overAmount, PAY[p.status].label, p.paidAt ?? '', p.paidRef ?? '']);
export const EXPORT_HEADERS = ['С', 'По', 'Период', 'Выкуплено, кВт·ч', 'Перенесено, кВт·ч', 'Израсходовано, кВт·ч', 'Зарядок', 'Остаток, кВт·ч', 'Сверх объёма, кВт·ч', 'Цена 1 кВт·ч, сум', 'Сумма, сум', 'Сверх объёма, сум', 'Оплата', 'Дата оплаты', 'П/п'];

/** The network's «Финансы» when Voli buys its volume. */
export function OperatorVolumeFinance({ data, reload }: { data: VolumeView; reload: () => void }) {
  const deal = data.deal!;
  const cur = data.periods.find(p => p.current) ?? data.periods[0];
  const paid = data.periods.filter(p => p.status === 'paid').reduce((s, p) => s + (p.paidAmount ?? p.amount), 0);
  return (
    <Page
      title="Финансы"
      subtitle={`Voli заранее выкупает у вашей сети ${kwh(deal.kwh)} за ${deal.period === 'week' ? 'каждую неделю' : 'каждый месяц'} по ${money(deal.price)} за 1 кВт·ч и платит за этот объём, сколько бы водители ни израсходовали`}
      actions={<ExportButton name="voli-volume" title="Выкуп объёма Voli" portal="operator" headers={EXPORT_HEADERS} rows={exportRows(data.periods)} />}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Выкуплено на период" value={num(cur?.total ?? deal.kwh)} sub={cur?.carriedIn ? `кВт·ч · в том числе ${num(cur.carriedIn)} перенесено` : 'кВт·ч'} icon={<Package size={14} />} tone="sky" />
        <Kpi label="Израсходовано" value={num(cur?.used ?? 0)} sub={`кВт·ч · ${num(cur?.sessions ?? 0)} зарядок`} icon={<Zap size={14} />} tone="emerald" />
        <Kpi label={cur?.over ? 'Сверх объёма' : 'Остаток'} value={num(cur?.over || cur?.left || 0)} sub="кВт·ч" icon={<Battery size={14} />} tone={cur?.over ? 'red' : 'violet'} />
        <Kpi label="Получено от Voli" value={money(paid, false)} sub="сум за всё время" icon={<Banknote size={14} />} tone="amber" />
      </div>

      {data.periods.filter(p => p.receipt?.status === 'waiting' || p.receipt?.status === 'disputed').map(p => <ConfirmReceipt key={p.id} p={p} onDone={reload} />)}

      {cur ? (
        <Card title={`Текущий период · ${range(cur)}`} right={<PayStatus p={cur} />}>
          <UsageBar p={cur} />
          <div className="flex flex-wrap justify-between gap-2 mt-2 text-xs text-slate-500">
            <span>{`Израсходовано ${kwh(cur.used)} из ${kwh(cur.total)}`}</span>
            <span>{cur.overAmount ? `К оплате Voli: ${money(cur.amount)} + ${money(cur.overAmount)} сверх объёма` : `К оплате Voli: ${money(cur.amount)}`}</span>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            {deal.carry ? 'Остаток в конце периода переносится на следующий.' : 'Остаток в конце периода не переносится.'}
            {' '}Зарядки водителей Voli считаются по показаниям счётчиков ваших станций, в реальном времени.
          </p>
        </Card>
      ) : (
        <Card title="Первый период">
          <p className="text-sm text-slate-500">{`Начнётся ${dateShort(deal.start)}.`}</p>
        </Card>
      )}

      <Card pad={false} title="Периоды">
        <PeriodsTable periods={data.periods} />
      </Card>
    </Page>
  );
}

import { useEffect, useState } from 'react';
import { FileCheck2, LoaderCircle, Upload, TriangleAlert, CheckCircle2 } from 'lucide-react';
import type { ReconcileProblem, ReconcileResult } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, dateTime } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Card, ErrorNote, Segmented } from './ui';

const PROVIDERS = [
  { id: 'payme', label: 'Payme' },
  { id: 'click', label: 'Click' },
  { id: 'uzum', label: 'Uzum' },
  { id: 'humo', label: 'Humo' },
] as const;
type Provider = (typeof PROVIDERS)[number]['id'];

const KIND: Record<string, string> = {
  'theirs-only': 'Нет у нас',
  'ours-only': 'Нет у провайдера',
  'not-credited': 'Не зачислено',
  amount: 'Сумма',
  'confirmed-not-credited': 'Не зачислено',
  'credited-not-confirmed': 'Не подтверждено',
  stuck: 'Завис',
};

/**
 * The end-of-day check of top-ups: orders that look wrong on our side, and,
 * with the provider's statement pasted or uploaded, every line that does not
 * agree with it.
 */
export default function Reconcile() {
  const { actions } = useSync();
  const [problems, setProblems] = useState<ReconcileProblem[] | null>(null);
  const [provider, setProvider] = useState<Provider>('payme');
  const [statement, setStatement] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    actions.ownPaymentProblems().then(r => setProblems(r.problems)).catch(() => setProblems([]));
  }, [actions]);

  const run = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await actions.reconcile({ provider, statement, from: from || undefined, to: to || undefined }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setStatement(String(reader.result ?? ''));
    reader.readAsText(file);
  };
  const field = 'border border-slate-200 rounded-xl px-3 py-2 text-sm';

  return (
    <Card title={<span className="inline-flex items-center gap-2"><FileCheck2 size={16} className="text-[#E09A00]" />Сверка с провайдером</span>}>
      {problems && problems.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5"><TriangleAlert size={15} />{`Требуют внимания: ${problems.length}`}</p>
          <ul className="mt-1.5 space-y-1 text-xs text-red-800">
            {problems.slice(0, 8).map(p => <li key={`${p.kind}-${p.order.id}`}>{`${p.order.id} · ${money(p.order.amount)} · ${p.note}`}</li>)}
          </ul>
        </div>
      )}
      {problems && problems.length === 0 && <p className="mb-4 text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} />Зависших и противоречивых заказов нет</p>}

      <p className="text-xs text-slate-500">Выгрузите из кабинета провайдера выписку за период в CSV и вставьте её сюда или загрузите файл. Нужны столбцы с номером транзакции или заказа и суммой.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented value={provider} onChange={setProvider} options={PROVIDERS.map(p => ({ id: p.id, label: p.label }))} />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="С даты" className={field} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="По дату" className={field} />
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">
          <Upload size={14} />Файл CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readFile(f); }} />
        </label>
      </div>
      <textarea value={statement} onChange={e => setStatement(e.target.value)} rows={5} placeholder={'Транзакция;Заказ;Сумма;Статус\n6b1f…;PAY-1A2B3C;150000;Успешно'} className={`${field} mt-2 w-full font-mono text-xs`} />
      {error && <ErrorNote text={error} />}
      <button onClick={() => void run()} disabled={busy || !statement.trim()} className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
        {busy && <LoaderCircle size={14} className="animate-spin" />}Сверить
      </button>

      {result && (
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 py-2"><p className="text-[11px] text-slate-500">У провайдера</p><p className="font-bold tabular-nums">{money(result.theirPaid)}</p></div>
            <div className="rounded-xl bg-slate-50 py-2"><p className="text-[11px] text-slate-500">У нас</p><p className="font-bold tabular-nums">{money(result.ourPaid)}</p></div>
            <div className={`rounded-xl py-2 ${result.difference ? 'bg-red-50' : 'bg-emerald-50'}`}><p className="text-[11px] text-slate-500">Разница</p><p className={`font-bold tabular-nums ${result.difference ? 'text-red-600' : 'text-emerald-700'}`}>{money(result.difference)}</p></div>
          </div>
          {result.diffs.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} />{`Всё сходится: ${num(result.lines)} строк выписки`}</p>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-red-700">{`Расхождений: ${result.diffs.length}`}</p>
                <ExportButton name={`reconcile-${result.provider}`} title={`Сверка ${result.provider}`} portal="admin" headers={['Что', 'Наш заказ', 'Транзакция провайдера', 'Сумма у нас', 'Сумма у провайдера', 'Пояснение']} rows={result.diffs.map(d => [KIND[d.kind] ?? d.kind, d.order?.id ?? '', d.line?.id ?? d.order?.theirs ?? '', d.order?.amount ?? '', d.line?.amount ?? '', d.note])} />
              </div>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {result.diffs.slice(0, 50).map((d, i) => (
                  <li key={i} className="py-2 flex items-start gap-3">
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-semibold">{KIND[d.kind] ?? d.kind}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-slate-800">{d.note}</span>
                      <span className="block text-xs text-slate-400 tabular-nums">{[d.order?.id, d.line?.id ?? d.line?.order, d.order?.paidAt ? dateTime(d.order.paidAt) : null, money(d.order?.amount ?? d.line?.amount ?? 0)].filter(Boolean).join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

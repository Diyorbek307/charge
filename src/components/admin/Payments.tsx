import { useMemo, useState } from 'react';
import { Wallet, ArrowDownToLine, Receipt, XCircle, RotateCcw } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, dateTime } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Segmented, SearchBox, Empty, STATUS_PILL } from './ui';

const PROVIDER = { payme: { label: 'Payme', color: '#33CCCC' }, click: { label: 'Click', color: '#0060F0' } };

export default function AdminPayments() {
  const { data, error } = useAnalytics('admin', 30);
  const { state, actions } = useSync();
  const [tab, setTab] = useState<'charges' | 'topups'>('charges');
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState('');

  const charges = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (state?.transactions ?? []).filter(t => !q || [t.id, t.user, t.sessionId].some(v => v.toLowerCase().includes(q)));
  }, [state, query]);
  const topups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.payments?.recent ?? []).filter(p => !q || [p.id, p.user].some(v => v.toLowerCase().includes(q)));
  }, [data, query]);

  if (!data || !data.payments) return <Page title="Платежи">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const p = data.payments;
  const paymeShare = p.amount ? (p.payme.amount / p.amount) * 100 : 0;

  const refund = async (id: string) => {
    setBusy(id);
    setFailure('');
    try {
      await actions.refundTransaction('admin', id);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <Page
      title="Платежи"
      subtitle="Деньги приходят пополнением кошелька через Payme и Click, зарядка списывается с кошелька · 30 дней"
      actions={
        <ExportButton
          name={tab === 'charges' ? 'charges' : 'topups'}
          title={tab === 'charges' ? 'Оплаты зарядок' : 'Пополнения кошелька'}
          portal="admin"
          headers={tab === 'charges' ? ['ID', 'Сессия', 'Плательщик', 'Способ', 'Сумма, сум', 'Время', 'Статус'] : ['ID', 'Провайдер', 'Плательщик', 'Сумма, сум', 'Создан', 'Статус']}
          rows={
            tab === 'charges'
              ? charges.map(t => [t.id, t.sessionId, t.user, t.method, t.amount, t.time, STATUS_PILL[t.status]?.label ?? t.status])
              : topups.map(x => [x.id, PROVIDER[x.provider as keyof typeof PROVIDER]?.label ?? x.provider, x.user, x.amount, x.created, STATUS_PILL[x.status]?.label ?? x.status])
          }
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Пополнения" value={money(p.amount, false)} sub={`сум · ${num(p.count)} платежей`} icon={<ArrowDownToLine size={14} />} tone="emerald" />
        <Kpi label="Оплачено зарядок" value={money(data.totals.revenue, false)} sub={`сум · ${num(data.totals.completed)} сессий`} change={data.deltas.revenue} icon={<Receipt size={14} />} tone="sky" />
        <Kpi label="Средний платёж" value={money(p.count ? p.amount / p.count : 0, false)} sub="сум за пополнение" icon={<Wallet size={14} />} tone="violet" />
        <Kpi label="Не прошли" value={num(p.cancelled)} sub={`${num(p.count ? (p.cancelled / (p.count + p.cancelled)) * 100 : 0, 1)}% попыток · ${p.pending} в ожидании`} icon={<XCircle size={14} />} tone={p.cancelled ? 'amber' : 'slate'} />
      </div>

      <Card title="Пополнения по платёжным системам" right={<span className="text-xs text-slate-400">30 дней</span>}>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
          <div style={{ width: `${paymeShare}%`, background: PROVIDER.payme.color }} />
          <div style={{ width: `${100 - paymeShare}%`, background: PROVIDER.click.color }} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {(['payme', 'click'] as const).map(k => (
            <div key={k} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="w-2.5 h-10 rounded-full" style={{ background: PROVIDER[k].color }} />
              <div>
                <p className="text-sm font-bold text-slate-900">{PROVIDER[k].label}</p>
                <p className="text-xs text-slate-500 tabular-nums">{money(p[k].amount)} · {num(p[k].count)} платежей · {num(p.amount ? (p[k].amount / p.amount) * 100 : 0, 1)}%</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {failure && <ErrorNote text={failure} />}

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <Segmented value={tab} onChange={setTab} options={[{ id: 'charges', label: 'Оплаты зарядок' }, { id: 'topups', label: 'Пополнения' }]} />
          <SearchBox value={query} onChange={setQuery} placeholder="ID, сессия или плательщик" />
        </div>
        {tab === 'charges' ? (
          charges.length === 0 ? <Empty text="Ничего не нашлось" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                    <th className="px-5 py-2.5 font-semibold">Транзакция</th>
                    <th className="px-5 py-2.5 font-semibold">Плательщик</th>
                    <th className="px-5 py-2.5 font-semibold">Способ</th>
                    <th className="px-5 py-2.5 font-semibold text-right">Сумма</th>
                    <th className="px-5 py-2.5 font-semibold">Время</th>
                    <th className="px-5 py-2.5 font-semibold">Статус</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {charges.slice(0, 60).map(t => (
                    <tr key={t.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-2.5"><span className="font-mono text-xs text-sky-600">{t.id}</span><span className="block font-mono text-[11px] text-slate-400">{t.sessionId}</span></td>
                      <td className="px-5 py-2.5 text-slate-700">{t.user}</td>
                      <td className="px-5 py-2.5"><Pill tone={t.method === 'Корпоративный счёт' ? 'violet' : 'sky'}>{t.method}</Pill></td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{t.amount ? money(t.amount) : '—'}</td>
                      <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dateTime(t.time)}</td>
                      <td className="px-5 py-2.5">
                        {t.status === 'refunded' ? <Pill tone="amber"><RotateCcw size={11} />Возвращено</Pill> : <Pill tone={STATUS_PILL[t.status]?.tone ?? 'slate'}>{t.status === 'completed' ? 'Оплачено' : STATUS_PILL[t.status]?.label ?? t.status}</Pill>}
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {t.status === 'completed' && t.amount > 0 && (
                          confirm === t.id ? (
                            <span className="inline-flex gap-1">
                              <button disabled={busy === t.id} onClick={() => refund(t.id)} className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50">Вернуть {money(t.amount)}</button>
                              <button onClick={() => setConfirm(null)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Отмена</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirm(t.id)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:text-amber-600 hover:border-amber-200">Возврат</button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : topups.length === 0 ? <Empty text="Ничего не нашлось" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2.5 font-semibold">Платёж</th>
                  <th className="px-5 py-2.5 font-semibold">Провайдер</th>
                  <th className="px-5 py-2.5 font-semibold">Плательщик</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Сумма</th>
                  <th className="px-5 py-2.5 font-semibold">Создан</th>
                  <th className="px-5 py-2.5 font-semibold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {topups.map(x => (
                  <tr key={x.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 font-mono text-xs text-sky-600">{x.id}</td>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <span className="w-2 h-2 rounded-full" style={{ background: PROVIDER[x.provider as keyof typeof PROVIDER]?.color ?? '#94A3B8' }} />
                        {PROVIDER[x.provider as keyof typeof PROVIDER]?.label ?? x.provider}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">{x.user}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{money(x.amount)}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dateTime(x.created)}</td>
                    <td className="px-5 py-2.5"><Pill tone={STATUS_PILL[x.status]?.tone ?? 'slate'}>{STATUS_PILL[x.status]?.label ?? x.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">
          {tab === 'charges' ? `Последние ${Math.min(charges.length, 60)} оплат` : `Последние ${topups.length} пополнений`} · полный реестр — в экспорте
        </p>
      </Card>
    </Page>
  );
}

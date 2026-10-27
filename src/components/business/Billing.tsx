import { useCallback, useEffect, useState } from 'react';
import { Wallet, CalendarClock, Landmark, CheckCircle, LoaderCircle } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { PaymentOrder } from '../../lib/api';
import { useAnalytics, money, num, monthLong, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty, STATUS_PILL } from '../admin/ui';
import ExportButton from '../ExportButton';

const PRESETS = [2_000_000, 5_000_000, 10_000_000];
const thisMonth = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);

/** The company account: balance, top-ups through Payme or Click, and monthly statements. */
export default function BusinessBilling() {
  const { data, error } = useAnalytics('business', 30);
  const { actions, refresh } = useSync();
  const [amount, setAmount] = useState(PRESETS[1]);
  const [provider, setProvider] = useState<'payme' | 'click'>('payme');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);

  const loadOrders = useCallback(() => {
    actions.listPayments('business').then(setOrders).catch(() => setOrders([]));
  }, [actions]);
  useEffect(loadOrders, [loadOrders]);

  if (!data) return <Page title="Счёт и оплата">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const acc = data.account;

  const pay = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { order, checkoutUrl, sandbox } = await actions.createTopUpOrder('business', provider, amount);
      if (!sandbox) {
        window.location.href = checkoutUrl;
        return;
      }
      // Demo keys: the provider's sandbox confirms the payment right away.
      await actions.sandboxConfirm('business', order.id);
      await refresh();
      setNote({ ok: true, text: `Счёт ${order.id} оплачен: +${money(amount)}` });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      loadOrders();
    }
  };

  const months = [...data.monthly].reverse();

  return (
    <Page title="Счёт и оплата" subtitle="Корпоративный счёт оплачивает зарядки сотрудников в пределах их лимитов">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Баланс" value={money(acc?.balance ?? 0, false)} sub="сум на счёте" icon={<Wallet size={14} />} tone="violet" />
        <Kpi label="Хватит на" value={acc?.runwayDays === null || acc?.runwayDays === undefined ? '—' : `${acc.runwayDays} дн.`} sub="при расходах последних 30 дней" icon={<CalendarClock size={14} />} tone="sky" />
        <Kpi label="Порог уведомления" value={money(acc?.threshold ?? 0, false)} sub="сум — предупредим, когда баланс ниже" icon={<Landmark size={14} />} tone="amber" />
        <Kpi label="Расходы месяца" value={money(acc?.spentMonth ?? 0, false)} sub={`сум из бюджета ${money(acc?.budget ?? 0)}`} icon={<Wallet size={14} />} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Пополнить счёт">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Сумма</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button key={p} onClick={() => setAmount(p)} aria-pressed={amount === p} className={`px-3 py-2 rounded-xl border text-sm font-semibold tabular-nums ${amount === p ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                    {money(p)}
                  </button>
                ))}
                <input
                  inputMode="numeric"
                  value={amount.toLocaleString('ru-RU')}
                  onChange={e => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
                  aria-label="Своя сумма, сум"
                  className="w-36 px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums focus:outline-none focus:border-indigo-400"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">От 1 000 до 10 000 000 сум за один платёж</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Способ оплаты</p>
              <div className="grid grid-cols-2 gap-2">
                {(['payme', 'click'] as const).map(p => (
                  <button key={p} onClick={() => setProvider(p)} aria-pressed={provider === p} className={`py-3 rounded-xl border-2 text-sm font-bold ${provider === p ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                    {p === 'payme' ? 'Payme' : 'Click'}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={pay}
              disabled={busy || amount < 1000 || amount > 10_000_000}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)' }}
            >
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Wallet size={15} />}
              {`Оплатить ${money(amount)}`}
            </button>
            {note && (note.ok ? <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3"><CheckCircle size={14} />{note.text}</p> : <ErrorNote text={note.text} />)}
            <p className="text-xs text-slate-400">Для оплаты по счёту с расчётного счёта компании напишите менеджеру — пришлём счёт на оплату с реквизитами.</p>
          </div>
        </Card>

        <Card pad={false} title="История пополнений">
          {orders.length === 0 ? (
            <Empty text="Пополнений с этого кабинета ещё не было" />
          ) : (
            <ul className="divide-y divide-slate-50">
              {orders.map(o => (
                <li key={o.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-slate-500 w-28">{o.id}</span>
                  <span className="text-slate-600 w-14">{o.provider === 'payme' ? 'Payme' : 'Click'}</span>
                  <span className="text-xs text-slate-400 flex-1">{dateTime(o.paidAt ?? o.created)}</span>
                  <Pill tone={STATUS_PILL[o.status]?.tone ?? 'slate'}>{STATUS_PILL[o.status]?.label ?? o.status}</Pill>
                  <span className="font-semibold text-slate-800 tabular-nums w-28 text-right">{money(o.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        pad={false}
        title="Акты по месяцам"
        right={
          <ExportButton
            name="fleet-statements"
            title="Акты по зарядке автопарка"
            portal="business"
            headers={['Месяц', 'Зарядок', 'кВт·ч', 'Сумма, сум', 'Статус']}
            rows={months.map(m => [monthLong(m.month), m.sessions, m.energy, m.revenue, m.month === thisMonth() ? 'Начисляется' : 'Закрыт'])}
          />
        }
      >
        {months.length === 0 ? (
          <Empty text="Актов пока нет" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
                <th className="px-5 py-3 font-semibold">Месяц</th>
                <th className="px-5 py-3 font-semibold text-right">Зарядок</th>
                <th className="px-5 py-3 font-semibold text-right">кВт·ч</th>
                <th className="px-5 py-3 font-semibold text-right">Сумма</th>
                <th className="px-5 py-3 font-semibold text-right">Статус</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5 font-semibold text-slate-800">{monthLong(m.month)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{num(m.sessions)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{num(m.energy, 0)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{money(m.revenue)}</td>
                  <td className="px-5 py-2.5 text-right">{m.month === thisMonth() ? <Pill tone="sky">Начисляется</Pill> : <Pill tone="green">Закрыт</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">Месяц закрывается 1-го числа следующего месяца; текущий ещё начисляется.</p>
      </Card>
    </Page>
  );
}

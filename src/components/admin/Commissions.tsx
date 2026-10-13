import { useState } from 'react';
import { Percent, Wallet, Building2 } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill } from './ui';

export default function AdminCommissions() {
  const { data, error, reload } = useAnalytics('admin', 30);
  const { actions } = useSync();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  if (!data) return <Page title="Комиссии">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const save = async (id: string) => {
    setBusy(true);
    setFailure('');
    try {
      await actions.setCommission('admin', id, Number(value.replace(',', '.')));
      setEditing(null);
      await reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const active = data.operators.filter(o => o.status !== 'pending');
  const weighted = data.totals.revenue ? (data.totals.commission / data.totals.revenue) * 100 : 0;

  return (
    <Page title="Комиссии" subtitle="Ставка платформы с каждой оплаченной зарядки, отдельно для каждого оператора · 30 дней">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Средневзвешенная ставка" value={`${num(weighted, 2)}%`} sub="от оборота сети" icon={<Percent size={14} />} tone="violet" />
        <Kpi label="Комиссия за 30 дней" value={money(data.totals.commission, false)} sub="сум" change={data.deltas.revenue} icon={<Wallet size={14} />} tone="emerald" />
        <Kpi label="Операторов с договором" value={active.length} sub={`ставки от ${num(Math.min(...active.map(o => o.commissionRate)), 1)} до ${num(Math.max(...active.map(o => o.commissionRate)), 1)}%`} icon={<Building2 size={14} />} tone="sky" />
      </div>

      {failure && <ErrorNote text={failure} />}

      <Card pad={false} title="Ставки по операторам">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                <th className="px-5 py-2.5 font-semibold">Оператор</th>
                <th className="px-5 py-2.5 font-semibold">Подключение</th>
                <th className="px-5 py-2.5 font-semibold">Ставка</th>
                <th className="px-5 py-2.5 font-semibold text-right">Оборот, 30 дн.</th>
                <th className="px-5 py-2.5 font-semibold text-right">Комиссия, 30 дн.</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.operators.map(o => (
                <tr key={o.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="text-lg" aria-hidden="true">{o.logo}</span>
                      <span>
                        <span className="block font-semibold text-slate-800">{o.name}</span>
                        {o.status === 'pending' && <Pill tone="amber">На ревью</Pill>}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3"><Pill tone="sky">{o.integration}</Pill></td>
                  <td className="px-5 py-3">
                    {editing === o.id ? (
                      <span className="inline-flex items-center gap-2">
                        <input
                          autoFocus
                          inputMode="decimal"
                          value={value}
                          onChange={e => setValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') void save(o.id); if (e.key === 'Escape') setEditing(null); }}
                          aria-label={`Ставка ${o.name}, %`}
                          className="w-20 text-sm border border-sky-300 rounded-lg px-2 py-1 outline-none tabular-nums"
                        />
                        <span className="text-slate-400">%</span>
                      </span>
                    ) : (
                      <span className="text-base font-bold text-slate-900 tabular-nums">{num(o.commissionRate, 1)}%</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{money(o.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-800">{money(o.commission)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {editing === o.id ? (
                      <span className="inline-flex gap-1">
                        <button disabled={busy} onClick={() => save(o.id)} className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-xs font-semibold disabled:opacity-50">Сохранить</button>
                        <button onClick={() => setEditing(null)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Отмена</button>
                      </span>
                    ) : (
                      <button onClick={() => { setEditing(o.id); setValue(String(o.commissionRate).replace('.', ',')); setFailure(''); }} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:text-sky-600 hover:border-sky-200">
                        Изменить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 space-y-1.5">
        <p className="font-semibold text-slate-700">Как начисляется</p>
        <p>• Комиссия удерживается с каждой успешной сессии в момент оплаты из кошелька водителя или корпоративного счёта.</p>
        <p>• Новая ставка действует для сессий, начатых после изменения; оператор получает уведомление в своём кабинете.</p>
        <p>• Итог за месяц попадает в инвойс оператора и выплачивается 2-го числа следующего месяца.</p>
      </div>
    </Page>
  );
}

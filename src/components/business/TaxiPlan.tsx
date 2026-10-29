import { useEffect, useState } from 'react';
import { Car, LoaderCircle, Users, Zap } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { FleetDriverRow } from '../../lib/api';
import { money, num } from '../../lib/analytics';
import { Card, Pill } from '../admin/ui';
import ExportButton from '../ExportButton';

const thisMonth = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);

/**
 * The taxi and courier tariff on the park's billing page: switch it on, see
 * the volume tier and the next one, and the month per driver.
 */
export default function TaxiPlan() {
  const { state, actions, refresh } = useSync();
  const plan = state?.fleetPlan;
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<FleetDriverRow[] | null>(null);
  useEffect(() => {
    actions.fleetReport(month).then(r => setRows(r.drivers)).catch(() => setRows([]));
  }, [actions, month, plan?.plan]);
  if (!plan) return null;
  const on = plan.plan === 'taxi';
  const toggle = async () => {
    setBusy(true);
    try {
      await actions.setFleetPlan(on ? 'standard' : 'taxi');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const pct = plan.next ? Math.min(100, Math.round((plan.kwh30 / plan.next.kwh) * 100)) : 100;

  return (
    <>
      <Card title="Тариф для такси и курьеров" right={on ? <Pill tone="green">{`подключён · −${plan.discount}%`}</Pill> : <Pill tone="slate">не подключён</Pill>}>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <p className="text-sm text-slate-600">Скидка растёт с объёмом парка за последние 30 дней. Её платит PowerGo — сети получают свою цену. Водители парка встают в очередь раньше обычных водителей, вся зарядка — на один счёт компании.</p>
            <div className="flex gap-2 flex-wrap">
              {plan.tiers.map(t => (
                <span key={t.kwh} className={`px-3 py-2 rounded-xl text-xs font-semibold ${plan.kwh30 >= t.kwh ? 'bg-[#FFF3C4] text-[#8a5b00]' : 'bg-slate-50 text-slate-500'}`}>
                  {`${t.kwh ? `от ${num(t.kwh)} кВт·ч` : 'с первого кВт·ч'} · −${t.pct}%`}
                </span>
              ))}
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{`${num(plan.kwh30)} кВт·ч за 30 дней`}</span>
                <span>{plan.next ? `до −${plan.next.pct}% осталось ${num(plan.next.kwh - plan.kwh30)} кВт·ч` : 'максимальная скидка'}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FFD66B,#FFB000)' }} /></div>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Сэкономлено в этом месяце</p>
              <p className="text-2xl font-black text-slate-900 tabular-nums">{money(plan.savedThisMonth)}</p>
            </div>
            <button onClick={() => void toggle()} disabled={busy} className={`py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${on ? 'bg-white border border-slate-200 text-slate-700' : 'text-[#111]'}`} style={on ? undefined : { background: 'linear-gradient(135deg,#FFD66B,#FFB000)' }}>
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              {on ? 'Вернуть обычный тариф' : `Подключить · сейчас −${plan.tierDiscount}%`}
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Отчёт по водителям"
        right={
          <span className="flex items-center gap-2">
            <input type="month" value={month} max={thisMonth()} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Месяц" className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
            {rows && rows.length > 0 && (
              <ExportButton portal="business" name={`fleet-drivers-${month}`} title={`Водители автопарка · ${month}`}
                headers={['Водитель', 'Машина', 'Зарядок', 'кВт·ч', 'Сумма, сум', 'Средняя цена', 'Ночью, %', 'Обычно, мин', 'Чаще всего', 'Скидка тарифа, сум']}
                rows={rows.map(r => [r.name, r.vehicle, r.charges, r.energy, r.cost, r.avgPrice, r.nightShare, r.medianMinutes, r.topStation ?? '—', r.saved])} />
            )}
          </span>
        }
        pad={false}
      >
        {!rows ? <p className="px-5 py-4 text-sm text-slate-400">Загружаем…</p> : rows.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400">Водителей пока нет</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2.5 font-semibold">Водитель</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Зарядок</th>
                  <th className="px-5 py-2.5 font-semibold text-right">кВт·ч</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Сумма</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Ночью</th>
                  <th className="px-5 py-2.5 font-semibold">Чаще всего</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.employeeId} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5"><p className="font-semibold text-slate-800 flex items-center gap-1.5"><Users size={13} className="text-slate-400" />{r.name}</p><p className="text-[11px] text-slate-400 flex items-center gap-1"><Car size={11} />{r.vehicle}</p></td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.charges}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{num(r.energy, 1)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{money(r.cost)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{`${r.nightShare}%`}</td>
                    <td className="px-5 py-2.5 text-slate-600 truncate max-w-[220px]"><span className="inline-flex items-center gap-1"><Zap size={12} className="text-[#FFB000]" />{r.topStation ?? '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

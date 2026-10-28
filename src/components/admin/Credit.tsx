import { useCallback, useEffect, useState } from 'react';
import { ScanFace, TriangleAlert, Wallet, Users } from 'lucide-react';
import type { CreditOverview } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty } from './ui';

/**
 * Drivers charging on credit: who owes what and since when. The face photo is
 * never shown here — it exists only to confirm the driver at the start of a charge.
 */
export function AdminCredit() {
  const { actions, events } = useSync();
  const [data, setData] = useState<CreditOverview | null>(null);
  const [error, setError] = useState('');
  const latest = events.find(e => e.type.startsWith('credit.') || e.type === 'session.stop')?.id;
  const load = useCallback(() => {
    actions.adminCredit('admin').then(setData).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load, latest]);

  const update = async (userId: string, body: { status?: 'active' | 'paused'; limit?: number }) => {
    try {
      setData(await actions.updateCredit('admin', userId, body));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data) return <Page title="Зарядка в долг">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const rows = [...data.rows].sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.debt - a.debt);
  return (
    <Page
      title="Зарядка в долг"
      subtitle={`Водители заряжаются сейчас и платят в течение ${data.days} дней. Каждый старт подтверждается лицом. Фото не показывается — только факт проверки.`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Подключили" value={num(data.totals.drivers)} sub="водителей" icon={<Users size={14} />} tone="slate" />
        <Kpi label="Долг сейчас" value={money(data.totals.debt, false)} sub="сум" icon={<Wallet size={14} />} tone="amber" />
        <Kpi label="Просрочено" value={money(data.totals.overdue, false)} sub={`сум · ${num(data.totals.overdueDrivers)} водит.`} icon={<TriangleAlert size={14} />} tone="red" />
        <Kpi label="Проверка лица" value={data.provider === 'myid' ? 'MyID' : 'Демо'} sub={data.provider === 'myid' ? 'через MyID' : 'сравнение лиц — после подключения MyID'} icon={<ScanFace size={14} />} tone="sky" />
      </div>
      {error && <ErrorNote text={error} />}
      {rows.length === 0 ? (
        <Card><Empty text="Пока никто не подключил зарядку в долг" /></Card>
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-3 font-semibold">Водитель</th>
                  <th className="px-4 py-3 font-semibold">Долг</th>
                  <th className="px-4 py-3 font-semibold">Срок</th>
                  <th className="px-4 py-3 font-semibold">Лимит</th>
                  <th className="px-4 py-3 font-semibold">Последняя проверка лица</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.userId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.user}</p>
                      <p className="text-xs text-slate-500">{`${r.phone ?? ''} · условия приняты ${dateTime(r.acceptedAt)}`}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">{money(r.debt)}</td>
                    <td className="px-4 py-3">
                      {r.overdue ? <Pill tone="red">Просрочено</Pill> : r.nextDue ? <span className="text-slate-600">{dateTime(r.nextDue)}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Лимит для ${r.user}`}
                        value={r.limit}
                        onChange={e => update(r.userId, { limit: Number(e.target.value) })}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm"
                      >
                        {[...new Set([100_000, 300_000, 500_000, 1_000_000, r.limit])].sort((a, b) => a - b).map(v => (
                          <option key={v} value={v}>{money(v)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.lastVerifiedAt ? dateTime(r.lastVerifiedAt) : 'ещё не было'}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'active' ? (
                        <button onClick={() => update(r.userId, { status: 'paused' })} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Приостановить</button>
                      ) : (
                        <button onClick={() => update(r.userId, { status: 'active' })} className="px-3 py-1.5 rounded-lg bg-[#FFC83D] text-[#111] text-xs font-semibold">Возобновить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Page>
  );
}

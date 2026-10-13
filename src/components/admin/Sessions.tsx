import { useEffect, useMemo, useState } from 'react';
import { Activity, Zap, AlertTriangle, Wallet, Square } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { Session } from '../../lib/api';
import { useAnalytics, money, num, dateTime, duration } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Pill, Pagination, SearchBox, Segmented, Empty, STATUS_PILL } from './ui';

const PER_PAGE = 20;
type S = Session & { basePrice?: number; multiplier?: number };

const minutesOf = (s: Session) => ((s.end ? Date.parse(s.end) : Date.now()) - Date.parse(s.start)) / 60000;

export default function AdminSessions() {
  const { state, actions } = useSync();
  const { data } = useAnalytics('admin', 30);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [operator, setOperator] = useState('all');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const sessions = (state?.sessions ?? []) as S[];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter(s => status === 'all' || s.status === status)
      .filter(s => operator === 'all' || s.operatorId === operator)
      .filter(s => !q || [s.id, s.user, s.stationName, s.operator].some(v => v.toLowerCase().includes(q)))
      .sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || b.start.localeCompare(a.start));
  }, [sessions, query, status, operator]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages);
  useEffect(() => setPage(1), [query, status, operator]);

  const stop = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await actions.stopSession('admin', id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const today = data?.today;
  const running = sessions.filter(s => s.status === 'active').length;

  return (
    <Page
      title="Сессии"
      subtitle="Последние 150 сессий и все текущие · обновляется в реальном времени"
      actions={
        <ExportButton
          name="sessions"
          title="Сессии зарядки"
          portal="admin"
          headers={['ID', 'Водитель', 'Станция', 'Оператор', 'Разъём', 'Начало', 'Окончание', 'кВт·ч', 'Цена, сум/кВт·ч', 'Сумма, сум', 'Статус']}
          rows={shown.map(s => [s.id, s.user, s.stationName, s.operator, s.connector, s.start, s.end ?? '', s.energy, s.price ?? '', s.cost, STATUS_PILL[s.status]?.label ?? s.status])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Сессии сегодня" value={today ? num(today.sessions) : '—'} sub={today ? `${num(today.energy, 0)} кВт·ч` : ''} icon={<Activity size={14} />} tone="sky" />
        <Kpi label="Заряжаются сейчас" value={num(running)} sub={`${state?.stats.evseOnline ?? 0} разъёмов онлайн`} icon={<Zap size={14} />} tone="emerald" />
        <Kpi label="Ошибки сегодня" value={today ? num(today.failed) : '—'} sub={data ? `успешных ${num(data.totals.successRate, 1)}% за 30 дней` : ''} icon={<AlertTriangle size={14} />} tone={today && today.failed ? 'amber' : 'slate'} />
        <Kpi label="Выручка сегодня" value={today ? money(today.revenue, false) : '—'} sub="сум" icon={<Wallet size={14} />} tone="violet" />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <SearchBox value={query} onChange={setQuery} placeholder="ID, водитель, станция или оператор" />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { id: 'all', label: 'Все' },
              { id: 'active', label: 'Идут' },
              { id: 'completed', label: 'Завершены' },
              { id: 'failed', label: 'Ошибки' },
            ]}
          />
          <select value={operator} onChange={e => setOperator(e.target.value)} aria-label="Оператор" className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700">
            <option value="all">Все операторы</option>
            {(state?.operators ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {shown.length === 0 ? (
          <Empty text="Сессий по этим условиям нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2.5 font-semibold">ID</th>
                  <th className="px-5 py-2.5 font-semibold">Водитель</th>
                  <th className="px-5 py-2.5 font-semibold">Станция</th>
                  <th className="px-5 py-2.5 font-semibold">Разъём</th>
                  <th className="px-5 py-2.5 font-semibold">Начало</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Длительность</th>
                  <th className="px-5 py-2.5 font-semibold text-right">кВт·ч</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Тариф</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Сумма</th>
                  <th className="px-5 py-2.5 font-semibold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice((current - 1) * PER_PAGE, current * PER_PAGE).map(s => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-2.5 font-mono text-xs text-sky-600 whitespace-nowrap">{s.id}</td>
                    <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">
                      {s.user}
                      {s.corporate && <span className="ml-1.5 text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">флот</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">
                      {s.stationName}
                      <span className="block text-[11px] text-slate-400">{s.operator}</span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{s.connector}{s.power ? ` · ${s.power} кВт` : ''}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dateTime(s.start)}</td>
                    <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">{s.status === 'failed' ? '—' : duration(minutesOf(s))}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{num(s.energy, 1)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                      {s.price ? num(s.price) : '—'}
                      {s.multiplier && s.multiplier !== 1 && (
                        <span className={`ml-1 text-[10px] font-bold ${s.multiplier < 1 ? 'text-emerald-600' : 'text-red-500'}`}>×{s.multiplier}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">{s.status === 'failed' ? '—' : money(s.cost)}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      {s.status === 'active' ? (
                        confirm === s.id ? (
                          <span className="inline-flex gap-1">
                            <button disabled={busy === s.id} onClick={() => stop(s.id)} className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50">Остановить</button>
                            <button onClick={() => setConfirm(null)} className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Нет</button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Pill tone="green">Идёт</Pill>
                            <button onClick={() => setConfirm(s.id)} title="Остановить удалённо" aria-label="Остановить удалённо" className="p-1 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500">
                              <Square size={11} />
                            </button>
                          </span>
                        )
                      ) : (
                        <Pill tone={STATUS_PILL[s.status]?.tone ?? 'slate'}>{STATUS_PILL[s.status]?.label ?? s.status}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={current} pages={pages} onPage={setPage} total={shown.length} label="сессий" />
      </Card>
    </Page>
  );
}

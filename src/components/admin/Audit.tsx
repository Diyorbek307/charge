import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, AlertTriangle, XOctagon, ListChecks } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { SyncEvent } from '../../lib/api';
import { num, dateTime } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Pagination, SearchBox, Segmented, Empty } from './ui';

const CATEGORY: [RegExp, string][] = [
  [/^auth\./, 'Доступ'],
  [/^user\./, 'Пользователи'],
  [/^(operator|commission)\./, 'Операторы'],
  [/^tariff\./, 'Тарифы'],
  [/^(settlement|wallet|payment)\./, 'Финансы'],
  [/^(alert|station|evse|ocpp)\./, 'Станции'],
  [/^(session|booking|queue)\./, 'Сессии'],
  [/^webhook\./, 'Интеграции'],
  [/^lead\./, 'Заявки'],
  [/^(report|system|employee)\./, 'Система'],
];
const categoryOf = (type: string) => CATEGORY.find(([re]) => re.test(type))?.[1] ?? 'Система';

function levelOf(e: SyncEvent): 'info' | 'warn' | 'error' {
  if (e.type === 'ocpp.offline' || (e.type === 'alert.new' && /крит|critical/i.test(e.message))) return 'error';
  if (/^(user\.status|alert\.new|wallet\.refund|commission\.update)/.test(e.type)) return 'warn';
  if (e.type === 'operator.status' && /приостанов/i.test(e.message)) return 'warn';
  return 'info';
}

const LEVEL = {
  info: { tone: 'sky' as const, label: 'INFO' },
  warn: { tone: 'amber' as const, label: 'WARN' },
  error: { tone: 'red' as const, label: 'ERROR' },
};
const PER_PAGE = 25;

export default function AdminAudit() {
  const { actions, events: live } = useSync();
  const [events, setEvents] = useState<SyncEvent[] | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [category, setCategory] = useState('Все');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    actions.events('admin', 300).then(setEvents).catch(e => setError(e.message));
  }, [actions]);
  useEffect(load, [load]);
  // New events arrive over the live channel; refetch so the log stays complete.
  const latest = live[0]?.id;
  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(load, 800);
    return () => clearTimeout(t);
  }, [latest, load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Meter ticks are telemetry, not audit; they would drown everything else.
    return (events ?? [])
      .filter(e => e.type !== 'session.tick')
      .map(e => ({ ...e, category: categoryOf(e.type), level: levelOf(e) }))
      .filter(e => level === 'all' || e.level === level)
      .filter(e => category === 'Все' || e.category === category)
      .filter(e => !q || [e.message, e.actor, e.type, e.entity ?? ''].some(v => v.toLowerCase().includes(q)));
  }, [events, level, category, query]);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  useEffect(() => setPage(1), [level, category, query]);

  if (!events) return <Page title="Журнал аудита">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const all = events.filter(e => e.type !== 'session.tick');
  const count = (l: 'warn' | 'error') => all.filter(e => levelOf(e) === l).length;
  const cats = ['Все', ...new Set(all.map(e => categoryOf(e.type)))];

  return (
    <Page
      title="Журнал аудита"
      subtitle="Все действия в системе: кто, что и когда сделал · последние 300 событий"
      actions={
        <ExportButton
          name="audit"
          title="Журнал аудита"
          portal="admin"
          headers={['ID', 'Время', 'Уровень', 'Категория', 'Тип', 'Кто', 'Портал', 'Событие', 'Объект']}
          rows={rows.map(e => [e.id, e.ts, LEVEL[e.level].label, e.category, e.type, e.actor, e.portal, e.message, e.entity ?? ''])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Событий" value={num(all.length)} icon={<ListChecks size={14} />} tone="slate" />
        <Kpi label="Информация" value={num(all.length - count('warn') - count('error'))} icon={<Info size={14} />} tone="sky" />
        <Kpi label="Предупреждения" value={num(count('warn'))} icon={<AlertTriangle size={14} />} tone="amber" />
        <Kpi label="Ошибки" value={num(count('error'))} icon={<XOctagon size={14} />} tone="red" />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <SearchBox value={query} onChange={setQuery} placeholder="Событие, пользователь или объект" />
          <Segmented value={level} onChange={setLevel} options={[{ id: 'all', label: 'Все уровни' }, { id: 'info', label: 'INFO' }, { id: 'warn', label: 'WARN' }, { id: 'error', label: 'ERROR' }]} />
          <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Категория" className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700">
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {rows.length === 0 ? (
          <Empty text="Событий по этим условиям нет" />
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.slice((current - 1) * PER_PAGE, current * PER_PAGE).map(e => (
              <li key={e.id} className="px-5 py-3 flex flex-wrap items-start gap-x-4 gap-y-1">
                <span className="text-xs text-slate-400 tabular-nums w-28 shrink-0 pt-0.5">{dateTime(e.ts)}</span>
                <span className="w-14 shrink-0"><Pill tone={LEVEL[e.level].tone}>{LEVEL[e.level].label}</Pill></span>
                <span className="w-28 shrink-0"><Pill tone="slate">{e.category}</Pill></span>
                <span className="flex-1 min-w-[220px]">
                  <span className="block text-sm text-slate-800">{e.message}</span>
                  <span className="block text-[11px] text-slate-400 font-mono">{e.type}{e.entity ? ` · ${e.entity}` : ''}</span>
                </span>
                <span className="text-xs text-slate-500 text-right shrink-0">
                  {e.actor}
                  <span className="block text-[11px] text-slate-400">{e.portal}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={current} pages={pages} onPage={setPage} total={rows.length} label="событий" />
      </Card>
    </Page>
  );
}

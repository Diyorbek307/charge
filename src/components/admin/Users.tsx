import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { AdminUsers as Directory } from '../../lib/api';
import { money, num, dateShort, dateTime } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Pagination, SearchBox, Segmented, Empty } from './ui';

const PER_PAGE = 20;
const formatPhone = (p: string) => (p.startsWith('+998') && p.length === 13 ? `${p.slice(0, 4)} ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11)}` : p);
const initials = (n: string) => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();

export default function AdminUsers() {
  const { actions, events } = useSync();
  const [dir, setDir] = useState<Directory | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'idle' | 'blocked'>('all');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    actions.adminUsers('admin').then(setDir).catch(e => setError(e.message));
  }, [actions]);
  useEffect(load, [load]);
  const lastUserEvent = events.find(e => e.type === 'user.status' || e.type === 'auth.register' || e.type === 'system.reset')?.id;
  useEffect(() => {
    if (lastUserEvent) load();
  }, [lastUserEvent, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (dir?.users ?? []).filter(u => {
      if (filter === 'active' && !(u.status === 'active' && u.sessions > 0)) return false;
      if (filter === 'idle' && (u.status !== 'active' || u.sessions > 0)) return false;
      if (filter === 'blocked' && u.status !== 'blocked') return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.car.toLowerCase().includes(q) || u.city.toLowerCase().includes(q) || (digits.length >= 3 && u.phone.includes(digits));
    });
  }, [dir, query, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  useEffect(() => setPage(1), [query, filter]);

  const setStatus = async (id: string, status: 'active' | 'blocked') => {
    setBusy(id);
    try {
      await actions.setUserStatus('admin', id, status);
      setDir(d => d && { ...d, users: d.users.map(u => (u.id === id ? { ...u, status } : u)), blocked: d.blocked + (status === 'blocked' ? 1 : -1) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  if (!dir) return <Page title="Пользователи">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  return (
    <Page
      title="Пользователи"
      subtitle={`${num(dir.total)} водителей в базе · активность за 60 дней`}
      actions={
        <ExportButton
          name="users"
          title="Пользователи"
          portal="admin"
          headers={['ID', 'Имя', 'Телефон', 'Автомобиль', 'Город', 'Сессии', 'Потрачено, сум', 'Последняя зарядка', 'Регистрация', 'Статус']}
          rows={shown.map(u => [u.id, u.name, u.phone, u.car, u.city, u.sessions, u.spent, u.last ?? '', u.registered ?? '', u.status === 'active' ? 'Активен' : 'Заблокирован'])}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Всего водителей" value={num(dir.total)} icon={<Users size={14} />} tone="sky" />
        <Kpi label="Заряжались" value={num(dir.active)} sub={`${num((dir.active / Math.max(dir.total, 1)) * 100, 0)}% базы за 60 дней`} icon={<UserCheck size={14} />} tone="emerald" />
        <Kpi label="Новые за 7 дней" value={num(dir.newWeek)} icon={<UserPlus size={14} />} tone="violet" />
        <Kpi label="Заблокированы" value={num(dir.blocked)} icon={<UserX size={14} />} tone="red" />
      </div>

      {error && <ErrorNote text={error} />}

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <SearchBox value={query} onChange={setQuery} placeholder="Имя, телефон, авто или город" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'Все' },
              { id: 'active', label: 'Заряжались' },
              { id: 'idle', label: 'Без зарядок' },
              { id: 'blocked', label: 'Заблокированы' },
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <Empty text="Никого не нашлось" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2.5 font-semibold">Водитель</th>
                  <th className="px-5 py-2.5 font-semibold">Телефон</th>
                  <th className="px-5 py-2.5 font-semibold">Автомобиль</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Сессии</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Потрачено</th>
                  <th className="px-5 py-2.5 font-semibold">Последняя зарядка</th>
                  <th className="px-5 py-2.5 font-semibold">Статус</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">{initials(u.name)}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                          <p className="text-[11px] text-slate-400">{`${u.city || '—'} · с ${u.registered ? dateShort(u.registered) : '—'}${u.selfRegistered ? ' · через SMS' : ''}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{formatPhone(u.phone)}</td>
                    <td className="px-5 py-2.5 text-slate-600">{u.car || '—'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{u.sessions}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{u.spent ? money(u.spent) : '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{u.last ? dateTime(u.last) : 'не заряжался'}</td>
                    <td className="px-5 py-2.5">{u.status === 'active' ? <Pill tone="green">Активен</Pill> : <Pill tone="red">Заблокирован</Pill>}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {confirm === u.id ? (
                        <span className="inline-flex gap-1">
                          <button disabled={busy === u.id} onClick={() => setStatus(u.id, 'blocked')} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50">Заблокировать</button>
                          <button onClick={() => setConfirm(null)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Отмена</button>
                        </span>
                      ) : u.status === 'active' ? (
                        <button onClick={() => setConfirm(u.id)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:text-red-600 hover:border-red-200">Заблокировать</button>
                      ) : (
                        <button disabled={busy === u.id} onClick={() => setStatus(u.id, 'active')} className="px-2.5 py-1 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Разблокировать</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={current} pages={pages} onPage={setPage} total={shown.length} label="водителей" />
      </Card>
    </Page>
  );
}

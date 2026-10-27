import { useState } from 'react';
import { Users, AlertTriangle, Wallet, Pencil, Check, X } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, currentMonth } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, SearchBox, BarList } from '../admin/ui';
import { FLEET, limitShare } from './shared';

const STEP = 100_000;

/** Monthly charging limits per employee — spending is checked against them on every charge. */
export default function BusinessEmployees() {
  const { data, error } = useAnalytics('business', 30);
  const { actions, refresh } = useSync();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!data) return <Page title="Сотрудники">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const rows = (data.employees ?? []).map(e => ({ ...e, ...limitShare(e.spentMonth, e.limit) }));
  const q = query.trim().toLowerCase();
  const shown = rows.filter(e => !q || [e.name, e.dept, e.vehicle].some(v => v.toLowerCase().includes(q))).sort((a, b) => b.share - a.share);
  const budget = rows.reduce((n, e) => n + e.limit, 0);
  const spent = rows.reduce((n, e) => n + e.spentMonth, 0);

  const save = async (id: string, name: string) => {
    const limit = Math.round(Number(value.replace(/\s/g, '')));
    if (!Number.isFinite(limit) || limit < 0) {
      setNote({ ok: false, text: 'Введите сумму в сумах, например 1500000' });
      return;
    }
    setBusy(true);
    try {
      await actions.setEmployeeLimit('business', id, limit);
      await refresh();
      setNote({ ok: true, text: `Лимит для ${name}: ${money(limit)} в месяц` });
      setEditing(null);
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Сотрудники" subtitle={`Лимиты на зарядку за счёт компании · ${currentMonth()}`} actions={<SearchBox value={query} onChange={setQuery} placeholder="Имя, отдел или машина" />}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Сотрудников" value={rows.length} sub="с корпоративной зарядкой" icon={<Users size={14} />} tone="violet" />
        <Kpi label="Бюджет месяца" value={money(budget, false)} sub="сум, сумма лимитов" icon={<Wallet size={14} />} tone="sky" />
        <Kpi label="Израсходовано" value={money(spent, false)} sub={`сум · ${num(budget ? (spent / budget) * 100 : 0, 0)}% бюджета`} icon={<Wallet size={14} />} tone="emerald" />
        <Kpi label="У лимита" value={rows.filter(e => e.share >= 0.8).length} sub={`превысили: ${rows.filter(e => e.share >= 1).length}`} icon={<AlertTriangle size={14} />} tone="amber" />
      </div>

      {note && (note.ok ? <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{note.text}</p> : <ErrorNote text={note.text} />)}

      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
                <th className="px-5 py-3 font-semibold">Сотрудник</th>
                <th className="px-5 py-3 font-semibold">Машина</th>
                <th className="px-5 py-3 font-semibold w-[280px]">Лимит в этом месяце</th>
                <th className="px-5 py-3 font-semibold text-right">Зарядок за 30 дней</th>
                <th className="px-5 py-3 font-semibold text-right">кВт·ч</th>
                <th className="px-5 py-3 font-semibold text-right">Расходы за 30 дней</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(e => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0 align-middle">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-800">{e.name}</p>
                    <p className="text-xs text-slate-400">{e.dept}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{e.vehicle}</td>
                  <td className="px-5 py-3">
                    {editing === e.id ? (
                      <form className="flex items-center gap-1.5" onSubmit={ev => { ev.preventDefault(); void save(e.id, e.name); }}>
                        <input
                          autoFocus
                          inputMode="numeric"
                          value={value}
                          onChange={ev => setValue(ev.target.value)}
                          aria-label="Новый лимит, сум"
                          className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm tabular-nums focus:outline-none focus:border-indigo-400"
                        />
                        <span className="text-xs text-slate-400">сум</span>
                        <button type="submit" disabled={busy} aria-label="Сохранить" className="p-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50"><Check size={13} /></button>
                        <button type="button" onClick={() => setEditing(null)} aria-label="Отмена" className="p-1.5 rounded-lg border border-slate-200 text-slate-500"><X size={13} /></button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs tabular-nums text-slate-600">{`${money(e.spentMonth, false)} из ${money(e.limit)}`}</span>
                          <span className="flex items-center gap-1.5">
                            {e.share >= 1 ? <Pill tone="red">превышен</Pill> : e.share >= 0.8 ? <Pill tone="amber">{`${num(e.share * 100, 0)}%`}</Pill> : null}
                            <button
                              onClick={() => { setEditing(e.id); setValue(String(e.limit)); setNote(null); }}
                              aria-label={`Изменить лимит: ${e.name}`}
                              title="Изменить лимит"
                              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            >
                              <Pencil size={12} />
                            </button>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, e.share * 100)}%`, background: e.color }} /></div>
                        <div className="flex gap-1 mt-1.5">
                          {[-STEP, STEP].map(d => (
                            <button
                              key={d}
                              disabled={busy || e.limit + d < 0}
                              onClick={() => { setValue(String(e.limit + d)); void (async () => { setBusy(true); try { await actions.setEmployeeLimit('business', e.id, e.limit + d); await refresh(); setNote({ ok: true, text: `Лимит для ${e.name}: ${money(e.limit + d)} в месяц` }); } catch (err) { setNote({ ok: false, text: (err as Error).message }); } finally { setBusy(false); } })(); }}
                              className="px-1.5 py-0.5 rounded-md border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40 tabular-nums"
                            >
                              {`${d > 0 ? '+' : '−'}${money(Math.abs(d), false)}`}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{e.sessions}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{num(e.energy, 0)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-800">{money(e.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">Лимит проверяется перед каждой зарядкой за счёт компании. Счётчик обнуляется 1-го числа.</p>
      </Card>

      <Card title="Расходы по отделам" right={<span className="text-xs text-slate-400">30 дней</span>}>
        <BarList color={FLEET} rows={(data.departments ?? []).map(d => ({ key: d.dept, label: d.dept, value: d.spent, display: money(d.spent) }))} />
      </Card>
    </Page>
  );
}

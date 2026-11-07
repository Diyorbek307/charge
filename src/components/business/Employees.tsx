import { useRef, useState } from 'react';
import { Users, AlertTriangle, Wallet, Pencil, Check, X, UserPlus, Upload, Download, Trash2, Clock } from 'lucide-react';
import { apiClient, type EmployeeRow } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { useAnalytics, money, num, currentMonth } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, SearchBox, BarList } from '../admin/ui';
import { FLEET, limitShare } from './shared';

const STEP = 100_000;

/** The spreadsheet layout the manager fills in (Excel saves it as CSV with ";"). */
const TEMPLATE = 'Имя;Телефон;Отдел;Лимит в месяц, сум;Машина\nAlisher Tursunov;+998 90 123 45 67;Продажи;1500000;BYD Han EV\n';

/** Rows of a CSV from Excel or Google Sheets: ";" or "," or tab, a header row optional. */
function parseRows(textIn: string): EmployeeRow[] {
  const lines = textIn.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = [';', '\t', ','].find(c => lines[0].includes(c)) ?? ';';
  const cells = (l: string) => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  let order = ['name', 'phone', 'dept', 'limit', 'vehicle'];
  const head = cells(lines[0]).map(c => c.toLowerCase());
  const isHeader = head.some(h => /имя|name|ism|телефон|phone/.test(h));
  if (isHeader) {
    order = head.map(h => /имя|name|ism|фио/.test(h) ? 'name' : /тел|phone/.test(h) ? 'phone' : /отдел|dept|bo.lim/.test(h) ? 'dept' : /лимит|limit/.test(h) ? 'limit' : /машин|car|vehicle|avto/.test(h) ? 'vehicle' : '');
  }
  return lines.slice(isHeader ? 1 : 0).map(l => {
    const row: Record<string, string> = {};
    cells(l).forEach((c, i) => { if (order[i]) row[order[i]] = c; });
    return { name: row.name ?? '', phone: row.phone ?? '', dept: row.dept, vehicle: row.vehicle, limit: row.limit };
  });
}

/** Adding people: one by phone, or a whole list from a spreadsheet. */
function AddEmployees({ onDone }: { onDone: (text: string) => void }) {
  const [mode, setMode] = useState<'one' | 'list' | null>(null);
  const [row, setRow] = useState<EmployeeRow>({ name: '', phone: '', dept: '', vehicle: '', limit: '1000000' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ row: number; reason: string }[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const field = (k: keyof EmployeeRow, label: string, placeholder: string, numeric = false) => (
    <label className="text-xs font-semibold text-slate-500">{label}
      <input value={String(row[k] ?? '')} inputMode={numeric ? 'numeric' : undefined} placeholder={placeholder} onChange={e => setRow(r => ({ ...r, [k]: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800" />
    </label>
  );
  const addOne = async () => {
    setBusy(true); setError(null);
    try {
      const r = await apiClient.addEmployee(row);
      onDone(r.linked ? `${row.name} добавлен — уже пользуется Voli, зарядка за счёт компании доступна сразу` : `${row.name} добавлен. Пусть установит Voli и войдёт с номером ${row.phone} — аккаунт привяжется сам`);
      setRow({ name: '', phone: '', dept: '', vehicle: '', limit: '1000000' });
      setMode(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const importFile = async (f: File) => {
    setBusy(true); setError(null); setSkipped([]);
    try {
      const rows = parseRows(await f.text());
      if (!rows.length) throw new Error('В файле нет строк');
      const r = await apiClient.importEmployees(rows);
      setSkipped(r.skipped);
      onDone(`Загружено: ${r.added}, из них уже в Voli: ${r.linked}${r.skipped.length ? `, пропущено: ${r.skipped.length}` : ''}`);
      if (!r.skipped.length) setMode(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const template = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    a.download = 'voli-employees.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setMode(mode === 'one' ? null : 'one')} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#111] text-white text-sm font-semibold"><UserPlus size={15} />Добавить сотрудника</button>
        <button onClick={() => setMode(mode === 'list' ? null : 'list')} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"><Upload size={15} />Загрузить списком</button>
      </div>
      {mode === 'one' && (
        <Card title="Новый сотрудник">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {field('name', 'Имя и фамилия', 'Alisher Tursunov')}
            {field('phone', 'Телефон', '+998 90 123 45 67')}
            {field('dept', 'Отдел', 'Продажи')}
            {field('vehicle', 'Машина', 'BYD Han EV')}
            {field('limit', 'Лимит в месяц, сум', '1000000', true)}
          </div>
          <p className="text-xs text-slate-400 mt-3">Сотрудник заряжается из своего приложения Voli: аккаунт привязывается по этому номеру телефона.</p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button disabled={busy || !row.name.trim() || !row.phone.trim()} onClick={() => void addOne()} className="h-10 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">Добавить</button>
            <button onClick={() => setMode(null)} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Отмена</button>
          </div>
        </Card>
      )}
      {mode === 'list' && (
        <Card title="Загрузить список сотрудников">
          <ol className="text-sm text-slate-600 space-y-1 list-decimal pl-5">
            <li>Скачайте шаблон и заполните его в Excel или Google Таблицах: имя, телефон, отдел, лимит, машина.</li>
            <li>{`Сохраните как CSV и загрузите сюда. До ${500} человек за раз.`}</li>
            <li>Те, кто уже пользуется Voli, привяжутся сразу; остальные — когда войдут в приложение со своим номером.</li>
          </ol>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={template} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"><Download size={15} />Скачать шаблон</button>
            <button disabled={busy} onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40"><Upload size={15} />{busy ? 'Загружаем…' : 'Выбрать файл CSV'}</button>
            <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          {skipped.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 max-h-40 overflow-y-auto">
              {skipped.map(s => <p key={s.row}>{`Строка ${s.row}: ${s.reason}`}</p>)}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

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
  const shown = rows.filter(e => !q || [e.name, e.dept, e.vehicle, e.phone ?? ''].some(v => v.toLowerCase().includes(q))).sort((a, b) => b.share - a.share);
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Удалить ${name} из автопарка? Заряжаться за счёт компании он больше не сможет.`)) return;
    try {
      await apiClient.removeEmployee(id);
      await refresh();
      setNote({ ok: true, text: `${name} удалён` });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    }
  };
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

      <AddEmployees onDone={text => { setNote({ ok: true, text }); void refresh(); }} />

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
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-slate-800">{e.name}</p>
                      <button onClick={() => void remove(e.id, e.name)} aria-label={`Удалить: ${e.name}`} title="Удалить из автопарка" className="p-1 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50"><Trash2 size={12} /></button>
                    </div>
                    <p className="text-xs text-slate-400">{e.dept}{e.phone ? ` · ${e.phone}` : ''}</p>
                    {e.linked === false && <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5"><Clock size={10} />ждёт входа в Voli</span>}
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
                          <span className="text-xs tabular-nums text-slate-600"><span>{money(e.spentMonth, false)}</span> / <span>{money(e.limit)}</span></span>
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

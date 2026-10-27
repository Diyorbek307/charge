import { useState } from 'react';
import { Tag, Moon, Sun, Sunset, Pencil } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { num } from '../../lib/analytics';
import { Page, Card, Kpi, ErrorNote, Pill, Loading } from '../admin/ui';

const BANDS = [
  { id: 'green', label: 'Ночь', hours: '23:00–07:00', mult: 0.7, icon: <Moon size={14} />, tone: 'green' as const },
  { id: 'standard', label: 'Утро и поздний вечер', hours: '07:00–10:00, 22:00–23:00', mult: 1, icon: <Sun size={14} />, tone: 'slate' as const },
  { id: 'day', label: 'День', hours: '10:00–17:00', mult: 0.9, icon: <Sun size={14} />, tone: 'sky' as const },
  { id: 'peak', label: 'Вечерний пик', hours: '17:00–22:00', mult: 1.25, icon: <Sunset size={14} />, tone: 'red' as const },
];

/**
 * Prices are set per connector (base price per kWh); the platform's
 * time-of-day multipliers apply on top and are locked when a charge starts.
 */
export default function OperatorTariffs() {
  const { state, sessions, actions, refresh } = useSync();
  const org = sessions.operator?.orgId;
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!state) return <Page title="Тарифы"><Loading /></Page>;

  const own = state.stations.filter(s => s.operatorId === org);
  const all = own.flatMap(s => s.connectors.map(c => ({ ...c, station: s })));
  const dc = all.filter(c => c.power >= 50);
  const ac = all.filter(c => c.power < 50);
  const avg = (list: typeof all) => (list.length ? list.reduce((n, c) => n + c.price, 0) / list.length : 0);

  const save = async (stationId: string, connectorId: string) => {
    setBusy(true);
    setError('');
    try {
      await actions.setConnectorPrice('operator', stationId, connectorId, Number(value.replace(/\s/g, '')));
      setEditing(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Тарифы" subtitle="Базовая цена за кВт·ч задаётся для каждого разъёма; коэффициенты времени суток общие для сети">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Разъёмов" value={all.length} sub={`${dc.length} DC · ${ac.length} AC`} icon={<Tag size={14} />} tone="sky" />
        <Kpi label="Средняя цена DC" value={num(avg(dc))} sub="сум за кВт·ч" tone="emerald" />
        <Kpi label="Средняя цена AC" value={num(avg(ac))} sub="сум за кВт·ч" tone="violet" />
        <Kpi label="Ночью DC" value={num(avg(dc) * 0.7)} sub="сум за кВт·ч с коэффициентом ×0,7" icon={<Moon size={14} />} tone="amber" />
      </div>

      <Card title="Время суток" right={<span className="text-xs text-slate-400">по Ташкенту, фиксируется в момент старта</span>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {BANDS.map(b => (
            <div key={b.id} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between"><Pill tone={b.tone}>{b.icon}{b.label}</Pill><span className="text-lg font-bold text-slate-900">×{num(b.mult, 2)}</span></div>
              <p className="text-xs text-slate-500 mt-2">{b.hours}</p>
              <p className="text-xs text-slate-400 mt-0.5">DC ≈ {num(avg(dc) * b.mult)} · AC ≈ {num(avg(ac) * b.mult)} сум</p>
            </div>
          ))}
        </div>
      </Card>

      {error && <ErrorNote text={error} />}

      {own.map(s => (
        <Card key={s.id} pad={false} title={<span>{s.name}<span className="ml-2 text-xs font-normal text-slate-400">{s.city}</span></span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                  <th className="px-5 py-2 font-semibold">Разъём</th>
                  <th className="px-5 py-2 font-semibold text-right">Базовая цена</th>
                  <th className="px-5 py-2 font-semibold text-right">Ночью</th>
                  <th className="px-5 py-2 font-semibold text-right">В пик</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {s.connectors.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 text-slate-700">{c.type} · {c.power} кВт <span className="text-[11px] text-slate-400 font-mono">{c.id}</span></td>
                    <td className="px-5 py-2.5 text-right">
                      {editing === `${s.id}:${c.id}` ? (
                        <input autoFocus inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(s.id, c.id); if (e.key === 'Escape') setEditing(null); }} aria-label="Цена, сум за кВт·ч" className="w-24 text-right px-2 py-1 rounded-lg border border-sky-300 outline-none tabular-nums" />
                      ) : (
                        <span className="font-bold text-slate-900 tabular-nums">{num(c.price)} сум</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-emerald-600">{num(c.price * 0.7)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-red-500">{num(c.price * 1.25)}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {editing === `${s.id}:${c.id}` ? (
                        <span className="inline-flex gap-1">
                          <button disabled={busy} onClick={() => save(s.id, c.id)} className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-xs font-semibold disabled:opacity-50">Сохранить</button>
                          <button onClick={() => setEditing(null)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Отмена</button>
                        </span>
                      ) : (
                        <button onClick={() => { setEditing(`${s.id}:${c.id}`); setValue(String(c.price)); setError(''); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:text-sky-600"><Pencil size={11} />Цена</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <p className="text-xs text-slate-400">Новая цена действует для зарядок, начатых после сохранения. Каждое изменение попадает в журнал аудита платформы.</p>
    </Page>
  );
}

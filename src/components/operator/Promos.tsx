import { useEffect, useState } from 'react';
import { Percent, Moon, Sparkles, StopCircle } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { apiClient as api, type Promo } from '../../lib/api';
import { num } from '../../lib/analytics';
import { promoHours } from '../../lib/promos';
import { Card, ErrorNote, Pill } from '../admin/ui';

const field = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-sky-400 bg-white';

/**
 * The network's own promos: it chooses the discount, the hours and the
 * stations, and pays for it — drivers see a % on the map and pay less.
 */
export default function OperatorPromos() {
  const { state, sessions, refresh } = useSync();
  const org = sessions.operator?.orgId;
  const own = (state?.stations ?? []).filter(s => s.operatorId === org);
  const [list, setList] = useState<Promo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState('20');
  const [title, setTitle] = useState('');
  const [timed, setTimed] = useState(false);
  const [fromHour, setFromHour] = useState('23');
  const [toHour, setToHour] = useState('7');
  const [firstOnly, setFirstOnly] = useState(false);
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [until, setUntil] = useState('');

  const load = () => api.networkPromos().then(setList).catch(e => setError((e as Error).message));
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await api.createPromo({
        percent: Number(percent),
        title: title.trim() || undefined,
        fromHour: timed ? Number(fromHour) : null,
        toHour: timed ? Number(toHour) : null,
        firstOnly,
        stationIds: stationIds.length ? stationIds : undefined,
        until: until ? new Date(`${until}T23:59:00+05:00`).toISOString() : null,
      });
      setTitle('');
      setStationIds([]);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    setError('');
    try {
      await api.stopPromo(id);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Percent size={15} className="text-[#8a5b00]" />Скидки и акции</span>} right={<span className="text-xs text-slate-400">скидку оплачивает сеть: водитель платит меньше</span>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Новая акция</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">Скидка, %
              <input inputMode="numeric" value={percent} onChange={e => setPercent(e.target.value.replace(/\D/g, ''))} className={`${field} mt-1`} aria-label="Скидка, %" />
            </label>
            <label className="text-xs text-slate-500">До даты (не обязательно)
              <input type="date" value={until} onChange={e => setUntil(e.target.value)} className={`${field} mt-1`} aria-label="До даты" />
            </label>
          </div>
          <label className="block text-xs text-slate-500">Название для водителей
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Например: Ночью дешевле" className={`${field} mt-1`} />
          </label>
          <div className="flex flex-wrap gap-3 text-sm text-slate-700">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={timed} onChange={e => setTimed(e.target.checked)} />Только в часы</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={firstOnly} onChange={e => setFirstOnly(e.target.checked)} />Только первая зарядка в сети</label>
          </div>
          {timed && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">С какого часа
                <select value={fromHour} onChange={e => setFromHour(e.target.value)} className={`${field} mt-1`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}</select>
              </label>
              <label className="text-xs text-slate-500">До какого часа
                <select value={toHour} onChange={e => setToHour(e.target.value)} className={`${field} mt-1`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}</select>
              </label>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 mb-1">{stationIds.length ? `Станции: ${stationIds.length}` : 'Все станции сети'}</p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {own.map(s => {
                const on = stationIds.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => setStationIds(v => (on ? v.filter(x => x !== s.id) : [...v, s.id]))} aria-pressed={on} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${on ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-slate-600 border-slate-200'}`}>{s.name}</button>
                );
              })}
            </div>
          </div>
          {error && <ErrorNote text={error} />}
          <button onClick={create} disabled={busy || !percent} className="w-full py-2.5 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-bold disabled:opacity-50">Запустить акцию</button>
        </div>

        <div className="space-y-2">
          {list === null && <p className="text-sm text-slate-400">Загружаем…</p>}
          {list?.length === 0 && <p className="text-sm text-slate-500">Акций пока нет. Скидка ночью или на первую зарядку приводит новых водителей.</p>}
          {list?.map(p => (
            <div key={p.id} className={`rounded-2xl border p-3 ${p.active ? 'border-[#FFC83D] bg-amber-50/40' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl font-black text-slate-900 w-14 shrink-0">{`−${p.percent}%`}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{p.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                    <span className="inline-flex items-center gap-1">{p.fromHour != null && <Moon size={11} />}{promoHours(p)}</span>
                    <span>{p.stationIds ? `${p.stationIds.length} ст.` : 'вся сеть'}</span>
                    {p.firstOnly && <span className="inline-flex items-center gap-1"><Sparkles size={11} />первая зарядка</span>}
                    {p.until && <span>{`до ${new Date(p.until).toLocaleDateString('ru-RU')}`}</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{`${p.uses ?? 0} зарядок · скидка ${num(p.discount ?? 0)} сум`}</p>
                </div>
                {p.active ? (
                  <button onClick={() => stop(p.id)} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-red-600"><StopCircle size={12} />Стоп</button>
                ) : (
                  <Pill tone="slate">остановлена</Pill>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

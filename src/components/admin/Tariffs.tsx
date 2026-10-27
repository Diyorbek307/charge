import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Moon, Sun, Sunset, Save, CheckCircle } from 'lucide-react';
import type { TariffBand } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { num } from '../../lib/analytics';
import { Page, Card, Loading, ErrorNote } from './ui';

const META: Record<TariffBand['band'], { label: string; icon: ReactNode; color: string; hint: string }> = {
  green: { label: 'Зелёные часы', icon: <Moon size={15} />, color: '#10B981', hint: 'Ночь: низкая нагрузка на сеть — переносим зарядки сюда' },
  day: { label: 'Дневной тариф', icon: <Sun size={15} />, color: '#FBBF24', hint: 'Солнечные часы, умеренная нагрузка' },
  peak: { label: 'Вечерний пик', icon: <Sunset size={15} />, color: '#EF4444', hint: 'Максимум нагрузки — дороже, чтобы разгрузить вечер' },
};
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const inWindow = (h: number, b: TariffBand) => (b.from <= b.to ? h >= b.from && h < b.to : h >= b.from || h < b.to);

/** Network-wide time-of-day multipliers, and what operators actually charge per connector type. */
export default function AdminTariffs() {
  const { actions, state } = useSync();
  const [bands, setBands] = useState<TariffBand[] | null>(null);
  const [saved, setSaved] = useState<TariffBand[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    actions.tariffBands('admin').then(r => { setBands(r.bands); setSaved(r.bands); }).catch(e => setError((e as Error).message));
  }, [actions]);

  const prices = useMemo(() => {
    const byType = new Map<string, number[]>();
    for (const st of state?.stations ?? []) for (const c of st.connectors) byType.set(c.type, [...(byType.get(c.type) ?? []), c.price]);
    return [...byType.entries()]
      .map(([type, list]) => ({ type, n: list.length, min: Math.min(...list), max: Math.max(...list), avg: list.reduce((a, b) => a + b, 0) / list.length }))
      .sort((a, b) => b.n - a.n);
  }, [state?.stations]);

  if (!bands) return <Page title="Тарифы сети">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const dirty = JSON.stringify(bands) !== JSON.stringify(saved);
  const set = (band: TariffBand['band'], patch: Partial<TariffBand>) => { setBands(bands.map(b => (b.band === band ? { ...b, ...patch } : b))); setOk(false); };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await actions.setTariffBands('admin', bands);
      setBands(r.bands);
      setSaved(r.bands);
      setOk(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Тарифы сети"
      subtitle="Множители цены по времени суток — для всех станций; базовую цену разъёма задаёт оператор"
      actions={
        <button onClick={save} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-40">
          {ok && !dirty ? <CheckCircle size={14} /> : <Save size={14} />}{ok && !dirty ? 'Сохранено' : 'Сохранить'}
        </button>
      }
    >
      {error && <ErrorNote text={error} />}

      <Card title="Сутки по часам (время Ташкента)">
        <div className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => {
            const b = bands.find(x => inWindow(h, x));
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-10 rounded" style={{ background: b ? META[b.band].color : '#CBD5E1' }} title={`${hh(h)} ×${b?.multiplier ?? 1}`} />
                {h % 3 === 0 && <span className="text-[10px] text-slate-400 tabular-nums">{String(h).padStart(2, '0')}</span>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">Серые часы — обычный тариф ×1. Тариф фиксируется в момент старта зарядки; изменения действуют для новых зарядок.</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {bands.map(b => {
          const m = META[b.band];
          return (
            <Card key={b.band}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: m.color }}>{m.icon}</span>
                <p className="font-bold text-slate-900">{m.label}</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">{m.hint}</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">С</span>
                  <select value={b.from} onChange={e => set(b.band, { from: Number(e.target.value) })} className="w-full px-2 py-2 rounded-xl border border-slate-200 bg-white tabular-nums">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">До</span>
                  <select value={b.to} onChange={e => set(b.band, { to: Number(e.target.value) })} className="w-full px-2 py-2 rounded-xl border border-slate-200 bg-white tabular-nums">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Множитель</span>
                  <input type="number" min={0.5} max={2} step={0.05} value={b.multiplier} onChange={e => set(b.band, { multiplier: Number(e.target.value) })} className="w-full px-2 py-2 rounded-xl border border-slate-200 tabular-nums" />
                </label>
              </div>
            </Card>
          );
        })}
      </div>

      <Card pad={false} title="Цены операторов по типам разъёмов" right={<span className="text-xs text-slate-400">базовые, сум/кВт·ч</span>}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
              <th className="px-5 py-3 font-semibold">Разъём</th>
              <th className="px-5 py-3 font-semibold text-right">Разъёмов</th>
              <th className="px-5 py-3 font-semibold text-right">Мин.</th>
              <th className="px-5 py-3 font-semibold text-right">Средняя</th>
              <th className="px-5 py-3 font-semibold text-right">Макс.</th>
            </tr>
          </thead>
          <tbody>
            {prices.map(p => (
              <tr key={p.type} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2.5 font-semibold text-slate-800">{p.type}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{p.n}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{num(p.min)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{num(p.avg)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{num(p.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}

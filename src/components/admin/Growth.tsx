import { useEffect, useState } from 'react';
import { Users, CalendarDays, CalendarRange, Magnet } from 'lucide-react';
import type { Growth as GrowthData } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { num } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Card, Kpi, Loading, ErrorNote } from './ui';

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00+05:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Tashkent' });

/** Yellow by how many came back: a pale cell is a leak, a deep one is a habit. */
const cellStyle = (pct: number) => ({ background: `rgba(255, 200, 61, ${0.08 + (Math.min(pct, 100) / 100) * 0.85})`, color: pct > 55 ? '#111' : '#3f3a2a' });

/**
 * Growth of the driver base: who is active, how far new drivers get from
 * sign-up to a second charge, and how each week's newcomers keep charging.
 */
export default function Growth() {
  const { actions } = useSync();
  const [data, setData] = useState<GrowthData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    actions.adminGrowth().then(setData).catch(e => setError((e as Error).message));
  }, [actions]);

  if (!data) return <Card title="Рост">{error ? <ErrorNote text={error} /> : <Loading />}</Card>;
  const { active, funnel, cohorts } = data;
  const widest = Math.max(1, ...cohorts.map(c => c.retention.length));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="За сутки" value={num(active.dau)} sub="водителей заряжались" icon={<Users size={14} />} tone="amber" />
        <Kpi label="За неделю" value={num(active.wau)} sub="водителей" icon={<CalendarDays size={14} />} tone="sky" />
        <Kpi label="За месяц" value={num(active.mau)} sub="водителей" icon={<CalendarRange size={14} />} tone="violet" />
        <Kpi label="Привычка" value={`${num(active.stickiness, 1)}%`} sub="месячных заряжались за сутки" icon={<Magnet size={14} />} tone={active.stickiness >= 20 ? 'emerald' : 'amber'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card title="Воронка водителя" className="xl:col-span-2" right={<span className="text-xs text-slate-400">от регистрации до повторной зарядки</span>}>
          <ol className="space-y-3">
            {funnel.map((row, i) => (
              <li key={row.step}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700">{row.step}</span>
                  <span className="tabular-nums text-slate-900 font-semibold">{num(row.count)}</span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full pg-bar" style={{ width: `${Math.max(row.ofFirst, 2)}%`, background: 'linear-gradient(90deg, #FFB000, #FFC83D)' }} />
                </div>
                {i > 0 && (
                  <p className={`mt-0.5 text-[11px] tabular-nums ${row.ofPrev < 50 ? 'text-red-600' : 'text-slate-400'}`}>
                    {`${num(row.ofPrev, 1)}% от предыдущего шага · ${num(row.ofFirst, 1)}% от всех`}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="Возвращаются ли водители"
          className="xl:col-span-3"
          right={<ExportButton name="cohorts" title="Удержание по неделям" portal="admin" headers={['Неделя первой зарядки', 'Новых', ...Array.from({ length: widest }, (_, i) => `+${i + 1} нед., %`)]} rows={cohorts.map(c => [c.week, c.size, ...c.retention])} />}
        >
          <p className="text-xs text-slate-500 mb-3">Строка — водители, впервые зарядившиеся в эту неделю. Клетка — доля из них, кто заряжался снова через столько недель.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums border-separate" style={{ borderSpacing: 3 }}>
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left font-medium pr-2">Неделя</th>
                  <th className="text-right font-medium pr-2">Новых</th>
                  {Array.from({ length: widest }, (_, i) => <th key={i} className="font-medium">{`+${i + 1}`}</th>)}
                </tr>
              </thead>
              <tbody>
                {cohorts.map(c => (
                  <tr key={c.week}>
                    <td className="pr-2 text-slate-600 whitespace-nowrap">{weekLabel(c.week)}</td>
                    <td className="pr-2 text-right font-semibold text-slate-800">{c.size}</td>
                    {Array.from({ length: widest }, (_, i) => (
                      <td key={i} className="text-center rounded-md h-8 min-w-[40px]" style={i < c.retention.length && c.size ? cellStyle(c.retention[i]) : undefined}>
                        {i < c.retention.length && c.size ? `${Math.round(c.retention[i])}%` : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

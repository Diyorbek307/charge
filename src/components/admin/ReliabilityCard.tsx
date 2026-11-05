import { useEffect, useState } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Reliability } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { num } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Card, Loading, ErrorNote, Empty } from './ui';

const tone = (score: number) => (score >= 95 ? 'text-emerald-700' : score >= 85 ? 'text-amber-700' : 'text-red-600');
const bar = (score: number) => (score >= 95 ? '#10B981' : score >= 85 ? '#FFB000' : '#EF4444');

/**
 * Networks ranked by how dependable their stations are, and the stations
 * that let drivers down most: the list to raise with a network.
 */
export default function ReliabilityCard() {
  const { actions } = useSync();
  const [data, setData] = useState<Reliability | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    actions.adminReliability().then(setData).catch(e => setError((e as Error).message));
  }, [actions]);

  if (!data) return <Card title="Надёжность">{error ? <ErrorNote text={error} /> : <Loading />}</Card>;
  const weak = data.stations.filter(s => s.score < 95).slice(0, 10);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#E09A00]" />Рейтинг сетей</span>}>
        <p className="text-xs text-slate-500 mb-3">Доля удачных запусков и время в работе за 30 дней. Счёт — меньшее из двух, взвешенное по числу зарядок.</p>
        {data.networks.length ? (
          <ol className="space-y-3">
            {data.networks.map((n, i) => (
              <li key={n.operatorId}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700"><span className="text-slate-400 mr-1.5">{i + 1}</span>{n.name}</span>
                  <span className={`tabular-nums font-bold ${tone(n.score)}`}>{`${num(n.score, 1)}%`}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full pg-bar" style={{ width: `${n.score}%`, background: bar(n.score) }} />
                </div>
                {n.weakest && n.weakest.score < 95 && <p className="mt-0.5 text-[11px] text-slate-400">{`${n.stations} ст. · слабее всех: ${n.weakest.name}, ${num(n.weakest.score, 1)}%`}</p>}
              </li>
            ))}
          </ol>
        ) : <Empty text="Пока мало зарядок для оценки" />}
      </Card>

      <Card
        title={<span className="inline-flex items-center gap-2"><TriangleAlert size={15} className="text-[#E09A00]" />Станции, которые подводят</span>}
        right={<ExportButton name="reliability" title="Надёжность станций" portal="admin" headers={['Станция', 'Город', 'Сеть', 'Надёжность, %', 'Удачных запусков, %', 'В работе, %', 'Зарядок']} rows={data.stations.map(s => [s.name, s.city, s.operator, s.score, s.starts ?? '', s.uptime ?? '', s.charges])} />}
      >
        {weak.length ? (
          <ul className="divide-y divide-slate-100">
            {weak.map(s => (
              <li key={s.id} className="py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                  <span className="block text-xs text-slate-400">{`${s.city} · ${s.operator}${s.starts !== null ? ` · запуски ${num(s.starts, 1)}%` : ''}${s.uptime !== null ? ` · в работе ${num(s.uptime, 1)}%` : ''}`}</span>
                </span>
                <span className={`text-sm tabular-nums font-bold ${tone(s.score)}`}>{`${num(s.score, 1)}%`}</span>
              </li>
            ))}
          </ul>
        ) : <Empty text="Все станции надёжнее 95%" />}
      </Card>
    </div>
  );
}

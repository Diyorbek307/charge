import { useState } from 'react';
import { MapPin, Zap, Activity, WifiOff, X } from 'lucide-react';
import type { Station } from '../../data/mockData';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';
import { useAnalytics, money, num, duration } from '../../lib/analytics';
import DriverMap from '../DriverMap';
import { Page, Card, Kpi, Pill } from './ui';

const CONNECTOR: Record<string, { tone: 'green' | 'red' | 'slate' | 'amber'; label: string }> = {
  available: { tone: 'green', label: 'Свободен' },
  occupied: { tone: 'red', label: 'Занят' },
  unavailable: { tone: 'slate', label: 'Недоступен' },
  reserved: { tone: 'amber', label: 'Бронь' },
};

/** The whole network on a real map, live; pick a station to see its connectors and month. */
export default function AdminNetworkMap() {
  const stations = useLiveStations();
  const { state } = useSync();
  const { data } = useAnalytics('admin', 30);
  const [picked, setPicked] = useState<Station | null>(null);

  const connectors = stations.flatMap(s => s.connectors);
  const count = (st: string) => connectors.filter(c => c.status === st).length;
  const live = picked ? stations.find(s => s.id === picked.id) ?? picked : null;
  const stat = live ? data?.stations.find(s => s.id === live.id) : undefined;
  const running = live ? (state?.sessions ?? []).filter(s => s.status === 'active' && s.stationId === live.id) : [];

  return (
    <Page title="Карта сети" subtitle="Все станции и разъёмы в реальном времени — статусы приходят по OCPP и из приложений">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Станций" value={stations.length} sub={`${new Set(stations.map(s => s.city)).size} городов`} icon={<MapPin size={14} />} tone="violet" />
        <Kpi label="Свободно" value={count('available')} sub={`из ${connectors.length} разъёмов`} icon={<Zap size={14} />} tone="emerald" />
        <Kpi label="Заряжают" value={count('occupied')} sub={`${num((count('occupied') / Math.max(1, connectors.length)) * 100, 0)}% сети`} icon={<Activity size={14} />} tone="sky" />
        <Kpi label="Недоступно" value={count('unavailable')} sub="нужен выезд или связь" icon={<WifiOff size={14} />} tone="red" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 h-[560px] rounded-2xl overflow-hidden border border-slate-100 bg-white">
          <DriverMap onSelectStation={setPicked} />
        </div>
        <Card
          title={live ? live.name : 'Станция'}
          right={live ? <button onClick={() => setPicked(null)} aria-label="Закрыть" className="p-1 text-slate-400 hover:text-slate-600"><X size={15} /></button> : undefined}
        >
          {!live ? (
            <p className="text-sm text-slate-400">Выберите станцию на карте — покажем разъёмы, текущие зарядки и показатели за 30 дней.</p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">{`${live.operator} · ${live.city} · ${live.address}`}</p>
              <ul className="space-y-1.5">
                {live.connectors.map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">{`${c.type} · ${c.power} кВт`}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 tabular-nums">{`${num(c.price)} сум`}</span>
                      <Pill tone={CONNECTOR[c.status]?.tone ?? 'slate'}>{CONNECTOR[c.status]?.label ?? c.status}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
              {running.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Заряжаются сейчас</p>
                  {running.map(s => (
                    <p key={s.id} className="text-xs text-slate-600 flex justify-between gap-2"><span>{`${s.user} · ${s.connector}`}</span><span className="tabular-nums">{duration((Date.now() - Date.parse(s.start)) / 60000)}</span></p>
                  ))}
                </div>
              )}
              {stat && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Сессий за 30 дней', num(stat.sessions)],
                    ['Выручка', money(stat.revenue)],
                    ['Загрузка', `${num(stat.utilization, 1)}%`],
                    ['Неудачных запусков', num(stat.failed)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[11px] text-slate-400">{k}</dt><dd className="font-semibold text-slate-800 tabular-nums">{v}</dd></div>
                  ))}
                </dl>
              )}
              <p className="text-xs text-slate-400">{`Рейтинг ${live.rating.toFixed(1)} · ${live.reviews} оценок`}</p>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

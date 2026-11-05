import { useEffect, useState } from 'react';
import { MapPin, SearchX, PlugZap } from 'lucide-react';
import type { Demand } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { num, plural } from '../../lib/analytics';
import ExportButton from '../ExportButton';
import { Card, Loading, ErrorNote, Empty, BarList } from './ui';

const mapLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}`;

/**
 * Where drivers wanted to charge and could not: stations whose connectors
 * were all taken, and searches that found nothing. The list to bring to a
 * network that is choosing where to put its next charger.
 */
export default function DemandCard() {
  const { actions } = useSync();
  const [data, setData] = useState<Demand | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    actions.adminDemand().then(setData).catch(e => setError((e as Error).message));
  }, [actions]);

  if (!data) return <Card title="Спрос, который сеть не закрывает">{error ? <ErrorNote text={error} /> : <Loading />}</Card>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card
        title={<span className="inline-flex items-center gap-2"><PlugZap size={15} className="text-[#E09A00]" />Не хватает разъёмов</span>}
        className="xl:col-span-2"
        right={<ExportButton name="demand-stations" title="Где не хватает разъёмов" portal="admin" headers={['Станция', 'Город', 'Сеть', 'Разъёмы', 'Часов всё занято', 'Открывали — всё занято']} rows={data.stations.map(s => [s.name, s.city, s.operator, s.connectors, s.fullHours, s.busyViews])} />}
      >
        <p className="text-xs text-slate-500 mb-3">{`Часы за ${data.days} дней, когда все разъёмы были заняты, и сколько раз водители открывали станцию, а свободных не было. Первые в списке — где сети стоит поставить ещё разъёмы.`}</p>
        {data.stations.length ? (
          <BarList
            rows={data.stations.map(s => ({
              key: s.id,
              label: s.name,
              sub: `${s.city} · ${s.operator} · ${s.connectors} ${plural(s.connectors, ['разъём', 'разъёма', 'разъёмов'])}${s.busyViews ? ` · открывали занятой ${s.busyViews} раз` : ''}`,
              value: s.fullHours + s.busyViews,
              display: `${num(s.fullHours, 1)} ч`,
            }))}
          />
        ) : <Empty text="Пока ни одна станция не была занята целиком" />}
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><SearchX size={15} className="text-[#E09A00]" />Искали и не нашли</span>}>
        <p className="text-xs text-slate-500 mb-3">{`${num(data.totals.lostSearches)} поисков без единой станции за ${data.days} дней`}</p>
        {data.searches.length ? (
          <ul className="space-y-1.5 text-sm">
            {data.searches.map(s => (
              <li key={s.q} className="flex items-center justify-between gap-3">
                <span className="truncate text-slate-700">«{s.q}»</span>
                <span className="tabular-nums font-semibold text-slate-900">{s.count}</span>
              </li>
            ))}
          </ul>
        ) : <Empty text="Пока все поиски что-то находили" />}
        {data.areas.length > 0 && (
          <>
            <p className="mt-4 mb-1.5 text-xs font-semibold text-slate-500">Откуда искали</p>
            <ul className="space-y-1.5 text-sm">
              {data.areas.map(a => (
                <li key={`${a.lat},${a.lng}`} className="flex items-center justify-between gap-3">
                  <a href={mapLink(a.lat, a.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-[#8A5B00]">
                    <MapPin size={13} />{`${a.lat.toFixed(2)}, ${a.lng.toFixed(2)}`}
                  </a>
                  <span className="tabular-nums font-semibold text-slate-900">{a.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Flame, Fuel, MapPin, Users, Trash2, LoaderCircle, RefreshCw } from 'lucide-react';
import type { AdminFuel as Data, FuelMark } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { Page, Card, Kpi, Empty, Pill } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
const STATUS: Record<FuelMark['status'], { gas: string; petrol: string; tone: 'green' | 'red' | 'amber' }> = {
  yes: { gas: 'Газ есть', petrol: 'Бензин есть', tone: 'green' },
  no: { gas: 'Газа нет', petrol: 'Бензина нет', tone: 'red' },
  queue: { gas: 'Очередь', petrol: 'Очередь', tone: 'amber' },
};

/**
 * Gas and petrol stations of the driver map's «Газ» and «Бензин» modes:
 * how many there are, what drivers said in the last day, and removing a mark
 * that is plainly false (server/fuel.js).
 */
export default function AdminFuel() {
  const { actions } = useSync();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    actions.adminFuel().then(setD).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load]);

  const remove = async (m: FuelMark) => {
    setBusy(m.id);
    try {
      await actions.removeFuelMark(m.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page
      title="Заправки"
      subtitle="Газовые и бензиновые заправки на карте водителя (режимы «Газ» и «Бензин») и отметки водителей, есть ли топливо"
      actions={<button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"><RefreshCw size={14} />Обновить</button>}
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!d ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={15} className="animate-spin" />Загружаем…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Заправок на карте" value={d.total.toLocaleString('ru-RU')} sub="по всему Узбекистану" icon={<MapPin size={14} />} tone="sky" />
            <Kpi label="С газом" value={d.gas.toLocaleString('ru-RU')} sub="метан и пропан" icon={<Flame size={14} />} tone="violet" />
            <Kpi label="С бензином" value={d.petrol.toLocaleString('ru-RU')} sub="АИ-80…95, дизель" icon={<Fuel size={14} />} tone="amber" />
            <Kpi label="Отметок за сутки" value={d.day.marks} sub={`${d.day.drivers} водит. · есть ${d.day.yes} · нет ${d.day.no} · очередь ${d.day.queue}`} icon={<Users size={14} />} tone="emerald" />
          </div>

          <Card title="Откуда данные">
            <div className="space-y-2 text-sm text-slate-600">
              <p>{`Список заправок — ${d.source || 'OpenStreetMap'}, выгрузка от ${d.at || '—'}. Обновлять раз в месяц-два: node scripts/fuel-osm.mjs, затем выложить.`}</p>
              <p>Есть ли газ или бензин — только по отметкам водителей: отметка держится 3 часа, один водитель — не чаще раза в 20 минут. Точные данные по АГНКС есть у системы uGaz (UZINFOCOM) — им отправлено предложение о партнёрстве.</p>
            </div>
          </Card>

          <Card pad={false} title="Последние отметки водителей" right={<span className="text-xs text-slate-400">{`последние ${d.marks.length}`}</span>}>
            {d.marks.length === 0 ? (
              <Empty text="Отметок пока нет — они появятся, когда водители отметят заправку в режиме «Газ» или «Бензин»" />
            ) : (
              <ul className="divide-y divide-slate-50">
                {d.marks.map(m => (
                  <li key={m.id} className="px-5 py-3 flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${m.fuel === 'gas' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                      {m.fuel === 'gas' ? <Flame size={15} /> : <Fuel size={15} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.station || (m.fuel === 'gas' ? 'Газовая заправка' : 'Заправка')}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[m.user || 'Водитель', when(m.ts), m.address].filter(Boolean).join(' · ')}
                        {m.lat != null && m.lng != null && (
                          <> · <a className="text-sky-600 hover:underline" href={`https://yandex.uz/maps/?pt=${m.lng},${m.lat}&z=17&l=map`} target="_blank" rel="noopener noreferrer">на карте</a></>
                        )}
                      </p>
                    </div>
                    <Pill tone={STATUS[m.status].tone}>{STATUS[m.status][m.fuel]}</Pill>
                    <button onClick={() => remove(m)} disabled={busy === m.id} aria-label="Удалить отметку" title="Удалить ложную отметку"
                      className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 shrink-0">
                      {busy === m.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

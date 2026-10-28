import { useCallback, useEffect, useState } from 'react';
import { Siren, MapPin, Phone, Check, Home, X, Navigation } from 'lucide-react';
import type { SosRequest, HostApplication } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime, num } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty, Segmented } from './ui';

const KIND: Record<SosRequest['kind'], string> = {
  mobile_charge: 'Сел аккумулятор — мобильная зарядка',
  tow: 'Эвакуатор',
  breakdown: 'Поломка машины',
  station: 'Неисправна станция',
  accident: 'ДТП',
  other: 'Другое',
};
const STATUS = { open: { tone: 'red', label: 'Новая' }, taken: { tone: 'amber', label: 'В работе' }, closed: { tone: 'slate', label: 'Закрыта' } } as const;

/** Drivers' SOS requests: the dispatcher takes one, calls the driver, closes it. */
export function AdminSos() {
  const { actions, events } = useSync();
  const [list, setList] = useState<SosRequest[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'active' | 'all'>('active');
  const latest = events.find(e => e.type.startsWith('sos.'))?.id;
  const load = useCallback(() => {
    actions.adminSos('admin').then(setList).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load, latest]);

  const set = async (id: string, status: 'taken' | 'closed') => {
    try {
      await actions.setSosStatus('admin', id, status);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!list) return <Page title="SOS водителей">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const shown = list.filter(s => view === 'all' || s.status !== 'closed');
  return (
    <Page title="SOS водителей" subtitle="Заявки о помощи на дороге: позвоните водителю, примите заявку, закройте, когда помощь оказана">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="Новые" value={list.filter(s => s.status === 'open').length} sub="ждут диспетчера" icon={<Siren size={14} />} tone="red" />
        <Kpi label="В работе" value={list.filter(s => s.status === 'taken').length} icon={<Siren size={14} />} tone="amber" />
        <Kpi label="Всего" value={num(list.length)} sub="последние 200" icon={<Siren size={14} />} tone="slate" />
      </div>
      {error && <ErrorNote text={error} />}
      <Segmented options={[{ id: 'active', label: 'Активные' }, { id: 'all', label: 'Все' }]} value={view} onChange={setView} />
      {shown.length === 0 ? (
        <Card><Empty text="Активных заявок нет" /></Card>
      ) : (
        <div className="space-y-3">
          {shown.map(s => (
            <Card key={s.id} className={s.status === 'open' ? 'border border-red-200' : ''}>
              <div className="flex flex-wrap items-start gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.status === 'open' ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}><Siren size={16} /></span>
                <div className="flex-1 min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill>
                    <span className="text-sm font-bold text-slate-900">{KIND[s.kind]}</span>
                    <span className="text-xs text-slate-400">{dateTime(s.ts)}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{s.user}</p>
                  {s.note && <p className="text-sm text-slate-500 mt-0.5">{s.note}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-sky-600 font-semibold"><Phone size={12} />{s.phone}</a>
                    {s.lat !== null && s.lng !== null ? (
                      <a href={`https://yandex.uz/maps/?pt=${s.lng},${s.lat}&z=16`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-600 font-semibold"><MapPin size={12} />{`${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}</a>
                    ) : (
                      <span className="text-slate-400">местоположение не передано</span>
                    )}
                    {s.takenBy && <span className="text-slate-500">{`Ответственный: ${s.takenBy}`}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {s.status === 'open' && <button onClick={() => set(s.id, 'taken')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold">Принять</button>}
                  {s.status !== 'closed' && <button onClick={() => set(s.id, 'closed')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"><Check size={12} />Закрыть</button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

const HOST_KIND: Record<HostApplication['kind'], string> = { home: 'Дом', hotel: 'Гостиница', business: 'Бизнес-центр', parking: 'Парковка', cafe: 'Кафе / ресторан' };
const HOST_STATUS = { pending: { tone: 'amber', label: 'На проверке' }, approved: { tone: 'green', label: 'Одобрена' }, rejected: { tone: 'red', label: 'Отклонена' } } as const;

/** Private chargers people want to share: check the place and the price, approve or reject. */
export function AdminHosts() {
  const { actions, events } = useSync();
  const [list, setList] = useState<HostApplication[] | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});
  const latest = events.find(e => e.type.startsWith('host.'))?.id;
  const load = useCallback(() => {
    actions.adminHosts('admin').then(setList).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load, latest]);

  const decide = async (id: string, approve: boolean) => {
    try {
      await actions.decideHost('admin', id, approve, reason[id]);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!list) return <Page title="Частные зарядки">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  return (
    <Page title="Частные зарядки" subtitle="Дома, гостиницы, офисы и парковки, которые хотят открыть свою зарядку водителям. После одобрения станция ждёт подключения по OCPP">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="На проверке" value={list.filter(a => a.status === 'pending').length} icon={<Home size={14} />} tone="amber" />
        <Kpi label="Одобрено" value={list.filter(a => a.status === 'approved').length} icon={<Home size={14} />} tone="emerald" />
        <Kpi label="Отклонено" value={list.filter(a => a.status === 'rejected').length} icon={<Home size={14} />} tone="slate" />
      </div>
      {error && <ErrorNote text={error} />}
      {list.length === 0 ? (
        <Card><Empty text="Заявок пока нет — водители подают их в приложении: Профиль → «Моя зарядка для других»" /></Card>
      ) : (
        <div className="space-y-3">
          {list.map(a => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={HOST_STATUS[a.status].tone}>{HOST_STATUS[a.status].label}</Pill>
                    <span className="text-sm font-bold text-slate-900">{a.name}</span>
                    <span className="text-xs text-slate-400">{`${HOST_KIND[a.kind]} · ${dateTime(a.ts)}`}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{`${a.city} · ${a.address} · ${a.hours}`}</p>
                  <p className="text-xs text-slate-500 mt-1">{a.specs.map(c => `${c.type} ${c.power} кВт · ${Number(c.price).toLocaleString('ru-RU')} сум`).join('  ·  ')}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <span className="text-slate-600">{a.user}</span>
                    <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-sky-600 font-semibold"><Phone size={12} />{a.phone}</a>
                    <a href={`https://yandex.uz/maps/?pt=${a.lng},${a.lat}&z=17`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-600 font-semibold"><Navigation size={12} />На карте</a>
                    {a.stationId && <span className="font-mono text-slate-500">{a.stationId}</span>}
                  </div>
                  {a.status === 'rejected' && a.reason && <p className="text-xs text-red-500 mt-1">{a.reason}</p>}
                </div>
                {a.status === 'pending' && (
                  <div className="flex flex-col gap-1.5 w-full sm:w-56">
                    <button onClick={() => decide(a.id, true)} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold"><Check size={12} />Одобрить</button>
                    <input value={reason[a.id] ?? ''} onChange={e => setReason(r => ({ ...r, [a.id]: e.target.value }))} placeholder="Причина отказа" aria-label="Причина отказа" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs" />
                    <button onClick={() => decide(a.id, false)} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold"><X size={12} />Отклонить</button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { PartnerPlace, PlaceKind } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty } from './ui';

const KIND: Record<PlaceKind, string> = { food: 'Еда', prayer: 'Намаз', toilets: 'Туалет', shop: 'Магазин', hotel: 'Ночлег' };

/**
 * Cafés and shops that pay to be shown to drivers at a station, with an
 * offer for them. Billed by shows; taps say whether the offer works.
 */
export default function AdminPartners() {
  const { actions } = useSync();
  const [list, setList] = useState<PartnerPlace[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'food' as PlaceKind, offer: '', lat: '', lng: '', pricePerShow: '50', days: '30' });
  const load = useCallback(() => {
    actions.adminPartners().then(setList).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load]);

  const create = async () => {
    setError('');
    try {
      await actions.createPartner({ ...form, lat: Number(form.lat), lng: Number(form.lng), pricePerShow: Number(form.pricePerShow), days: Number(form.days) });
      setAdding(false);
      setForm({ name: '', kind: 'food', offer: '', lat: '', lng: '', pricePerShow: '50', days: '30' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const stop = async (id: string) => {
    try {
      await actions.stopPartner(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!list) return <Page title="Партнёры у станций">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const live = list.filter(p => p.active && Date.parse(p.until) > Date.now());
  const field = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white';

  return (
    <Page
      title="Партнёры у станций"
      subtitle="Кафе, магазины и другие места рядом со станциями: водители видят их предложение, пока заряжаются; партнёр платит за показы"
      actions={<button onClick={() => setAdding(v => !v)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 text-white text-sm font-semibold"><Plus size={15} />Добавить партнёра</button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Активные" value={live.length} sub={`из ${list.length}`} tone="emerald" />
        <Kpi label="Показы" value={num(list.reduce((n, p) => n + p.shows, 0))} sub="водителям у станций" tone="sky" />
        <Kpi label="Нажатия" value={num(list.reduce((n, p) => n + p.taps, 0))} sub="открыли, как дойти" tone="amber" />
        <Kpi label="К оплате" value={money(list.reduce((n, p) => n + p.bill, 0))} sub="по цене за показ" tone="slate" />
      </div>
      {error && <ErrorNote text={error} />}
      {adding && (
        <Card title="Новый партнёр">
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={field} placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} aria-label="Название" />
            <select className={field} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as PlaceKind })} aria-label="Тип">
              {(Object.keys(KIND) as PlaceKind[]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}
            </select>
            <input className={`${field} sm:col-span-2`} placeholder="Предложение для водителей, например «−15% на кофе»" value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} aria-label="Предложение" />
            <input className={field} placeholder="Широта, 41.31" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} aria-label="Широта" />
            <input className={field} placeholder="Долгота, 69.28" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} aria-label="Долгота" />
            <input className={field} placeholder="Цена за показ, сум" value={form.pricePerShow} onChange={e => setForm({ ...form, pricePerShow: e.target.value })} aria-label="Цена за показ" />
            <input className={field} placeholder="Срок, дней" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} aria-label="Срок, дней" />
          </div>
          <p className="text-xs text-slate-500 mt-2">Показывается у станций в пределах 1,2 км — дальше пешком не дойти.</p>
          <button onClick={() => void create()} className="mt-3 px-4 py-2 rounded-xl bg-[#111] text-white text-sm font-semibold">Подключить</button>
        </Card>
      )}
      <Card pad={false}>
        {list.length === 0 ? <Empty text="Партнёров пока нет" /> : (
          <div className="divide-y divide-slate-50">
            {list.map(p => {
              const on = p.active && Date.parse(p.until) > Date.now();
              return (
                <div key={p.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{`${p.name} · ${KIND[p.kind]}`}</p>
                    <p className="text-xs text-slate-500 truncate">{p.offer}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500 tabular-nums">
                    <p>{`${num(p.shows)} показов · ${num(p.taps)} нажатий`}</p>
                    <p className="font-semibold text-slate-800">{money(p.bill)}</p>
                  </div>
                  {on ? <Pill tone="green">{`до ${new Date(p.until).toLocaleDateString('ru-RU')}`}</Pill> : <Pill tone="slate">Отключён</Pill>}
                  {on && <button onClick={() => void stop(p.id)} aria-label={`Отключить ${p.name}`} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600"><X size={14} /></button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </Page>
  );
}

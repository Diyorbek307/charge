import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Square, LoaderCircle, Bell } from 'lucide-react';
import type { CampaignDraft, Promo } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty, Segmented } from './ui';

type Row = Promo & { voliPaid?: number; createdBy?: string; createdAt?: string };
type Overview = { promos: Row[]; voliPaidMonth: number; driversReachable: number };

const hours = (p: Promo) => (p.fromHour == null || p.toHour == null ? 'весь день' : `${String(p.fromHour).padStart(2, '0')}:00–${String(p.toHour).padStart(2, '0')}:00`);
const blank = { title: '', note: '', percent: '15', funder: 'voli' as CampaignDraft['funder'], all: true, operatorIds: [] as string[], hoursOn: false, fromHour: '23', toHour: '7', firstOnly: false, until: '', announce: true };

/**
 * Promotions: Voli's own campaigns across networks, and every network's own
 * discount in one list. A campaign shows on the map, in the deals and at the
 * station at once, applies at the start of a charge, and can be announced to
 * drivers who agreed to hear about offers.
 */
export default function AdminPromos() {
  const { actions, state, events } = useSync();
  const [data, setData] = useState<Overview | null>(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const latest = events.find(e => e.type === 'promo.update')?.id;

  const load = useCallback(() => {
    actions.adminPromos().then(setData).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load, latest]);

  const networks = state?.operators ?? [];
  const nameOf = (id: string) => networks.find(o => o.id === id)?.name ?? id;
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF(d => ({ ...d, [k]: v }));

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const p = await actions.createCampaign({
        title: f.title.trim(),
        note: f.note.trim(),
        percent: Number(f.percent),
        funder: f.funder,
        operatorIds: f.all ? null : f.operatorIds,
        fromHour: f.hoursOn ? Number(f.fromHour) : null,
        toHour: f.hoursOn ? Number(f.toHour) : null,
        firstOnly: f.firstOnly,
        until: f.until ? new Date(`${f.until}T23:59:00+05:00`).toISOString() : null,
        announce: f.announce,
      });
      setF(blank);
      setNote(`Акция «${p.title}» запущена — водители уже видят её на карте`);
      setTimeout(() => setNote(''), 5000);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stop = async (id: string) => {
    try {
      await actions.stopCampaign(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data) return <Page title="Акции">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const live = data.promos.filter(p => p.active !== false && (!p.until || Date.parse(p.until) > Date.now()));
  const past = data.promos.filter(p => !live.includes(p));
  const field = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm';

  return (
    <Page title="Акции" subtitle="Скидки Voli и сетей: появляются на карте, в «Скидках» и на станции сразу после запуска">
      {error && <ErrorNote text={error} />}
      {note && <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{note}</p>}
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Kpi label="Идут сейчас" value={num(live.length)} sub={`${live.filter(p => !p.operatorId).length} от Voli · ${live.filter(p => p.operatorId).length} от сетей`} tone="amber" />
        <Kpi label="Voli доплатил сетям за месяц" value={money(data.voliPaidMonth)} sub="разница по акциям за счёт Voli" tone="slate" />
        <Kpi label="Получат уведомление" value={num(data.driversReachable)} sub="водители, согласные на предложения" tone="slate" />
      </div>

      <div className="grid xl:grid-cols-[420px_1fr] gap-4">
        <Card title={<span className="inline-flex items-center gap-2"><Megaphone size={16} />Новая акция</span>}>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Название
              <input value={f.title} onChange={e => set('title', e.target.value)} maxLength={60} placeholder="Например, Выходные со скидкой" className={`${field} mt-1`} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Описание для водителей (необязательно)
              <textarea value={f.note} onChange={e => set('note', e.target.value)} maxLength={200} rows={2} placeholder="Коротко: что и где" className={`${field} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-600">Скидка, %
                <input type="number" min={5} max={100} value={f.percent} onChange={e => set('percent', e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-semibold text-slate-600">До (включительно)
                <input type="date" value={f.until} onChange={e => set('until', e.target.value)} className={`${field} mt-1`} />
              </label>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Кто оплачивает скидку</p>
              <Segmented options={[{ id: 'voli', label: 'Voli' }, { id: 'network', label: 'Сети (по договорённости)' }]} value={f.funder} onChange={v => set('funder', v)} />
              <p className="text-[11px] text-slate-500 mt-1">{f.funder === 'voli' ? 'Сеть получит полную цену, разницу доплачивает Voli' : 'Сеть получит цену со скидкой — согласуйте с ней заранее'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Где действует</p>
              <Segmented options={[{ id: 'all', label: 'Все сети' }, { id: 'some', label: 'Выбранные сети' }]} value={f.all ? 'all' : 'some'} onChange={v => set('all', v === 'all')} />
              {!f.all && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {networks.map(o => {
                    const on = f.operatorIds.includes(o.id);
                    return (
                      <button key={o.id} type="button" aria-pressed={on} onClick={() => set('operatorIds', on ? f.operatorIds.filter(x => x !== o.id) : [...f.operatorIds, o.id])}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${on ? 'bg-[#FFC83D] border-[#FFB000] text-[#111]' : 'bg-white border-slate-200 text-slate-600'}`}>
                        {o.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.hoursOn} onChange={e => set('hoursOn', e.target.checked)} />Только в определённые часы
            </label>
            {f.hoursOn && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-600">С (час)
                  <input type="number" min={0} max={23} value={f.fromHour} onChange={e => set('fromHour', e.target.value)} className={`${field} mt-1`} />
                </label>
                <label className="block text-xs font-semibold text-slate-600">До (час)
                  <input type="number" min={0} max={23} value={f.toHour} onChange={e => set('toHour', e.target.value)} className={`${field} mt-1`} />
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.firstOnly} onChange={e => set('firstOnly', e.target.checked)} />Только на первую зарядку в Voli
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.announce} onChange={e => set('announce', e.target.checked)} />
              <Bell size={14} className="text-[#8A5B00]" />{`Сообщить водителям (${num(data.driversReachable)})`}
            </label>
            <button onClick={create} disabled={busy || !f.title.trim() || (!f.all && !f.operatorIds.length)} className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-bold disabled:opacity-50">
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Megaphone size={15} />}Запустить акцию
            </button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Идут сейчас" pad={false}>
            {live.length === 0 ? <Empty text="Сейчас акций нет" /> : (
              <div className="divide-y divide-slate-50">
                {live.map(p => <PromoRow key={p.id} p={p} nameOf={nameOf} onStop={() => stop(p.id)} />)}
              </div>
            )}
          </Card>
          {past.length > 0 && (
            <Card title="Завершённые" pad={false}>
              <div className="divide-y divide-slate-50">
                {past.slice(0, 20).map(p => <PromoRow key={p.id} p={p} nameOf={nameOf} />)}
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function PromoRow({ p, nameOf, onStop }: { p: Row; nameOf: (id: string) => string; onStop?: () => void }) {
  const where = p.operatorId ? nameOf(p.operatorId) : p.operatorIds ? p.operatorIds.map(nameOf).join(', ') : 'Все сети';
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <span className="shrink-0 w-12 h-12 rounded-2xl grid place-items-center text-sm font-black text-[#111]" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFB000)' }}>{`−${p.percent}%`}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
          {p.title}
          <Pill tone={p.operatorId ? 'slate' : 'amber'}>{p.operatorId ? 'от сети' : 'от Voli'}</Pill>
          {(p.funder ?? 'network') === 'voli' && <Pill tone="sky">платит Voli</Pill>}
        </p>
        <p className="text-xs text-slate-500 truncate">{`${where} · ${hours(p)}${p.firstOnly ? ' · первая зарядка' : ''} · ${p.until ? `до ${dateTime(p.until)}` : 'без срока'}`}</p>
        <p className="text-xs text-slate-400">{`${num(p.uses ?? 0)} зар. · скидка ${money(p.discount ?? 0)}${p.voliPaid ? ` · Voli доплатил ${money(p.voliPaid)}` : ''}`}</p>
      </div>
      {onStop && (
        <button onClick={onStop} className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Square size={12} />Остановить</button>
      )}
    </div>
  );
}

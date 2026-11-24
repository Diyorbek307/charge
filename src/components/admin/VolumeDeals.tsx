import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Undo2, Pencil, Plus, AlertTriangle, Package, ArrowRightLeft } from 'lucide-react';
import { apiClient, type VolumeDeal, type VolumePeriod, type VolumeView } from '../../lib/api';
import { money, num, dateShort } from '../../lib/analytics';
import { Card, ErrorNote, Loading, Pill } from './ui';
import { PeriodsTable, UsageBar, kwh, range } from '../operator/Volume';

/**
 * The admin's side of buying networks' volume: the terms per network (price,
 * month or week, start), the volume agreed for each later period, the mark that
 * the rest moves on (when both sides agreed), and the mark that Voli has paid a
 * period (after the bank transfer).
 */

const MIN_KWH = 5000;
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const small = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 whitespace-nowrap';
const input = 'mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white';

function DealForm({ view, onSaved, onCancel }: { view: VolumeView; onSaved: () => void; onCancel: () => void }) {
  const d = view.deal;
  const started = view.periods.length > 0;
  const [price, setPrice] = useState(d ? String(d.price) : '');
  const [period, setPeriod] = useState<'month' | 'week'>(d?.period ?? 'month');
  const [start, setStart] = useState(d?.start ?? today());
  const [on, setOn] = useState(d?.on ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const deal: VolumeDeal = { on, period, price: Number(price.replace(/\s/g, '')), start };
      await apiClient.setVolumeDeal(view.operatorId, deal);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mt-3">
      <p className="text-sm text-slate-500 mb-3">
        {started
          ? 'Изменения начнут действовать со следующего периода. Текущий период остаётся на прежних условиях.'
          : `Условия из Приложения № 1 к договору с сетью. Первый период — стартовый аванс ${num(MIN_KWH)} кВт·ч; объём следующих периодов вводится, когда его согласуют.`}
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-slate-500">Цена 1 кВт·ч для Voli, сум
          <input inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} placeholder="например, 1 500" className={input} />
        </label>
        <label className="text-xs font-semibold text-slate-500">Период
          <select value={period} onChange={e => setPeriod(e.target.value as 'month' | 'week')} className={input}>
            <option value="month">Месяц</option>
            <option value="week">Неделя</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">Начало первого периода
          <input type="date" value={start} disabled={started} onChange={e => setStart(e.target.value)} className={`${input} disabled:opacity-60`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
          <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} className="w-4 h-4 accent-[#111]" />
          Договор действует
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button disabled={busy || !price.trim()} onClick={() => void save()} className="h-10 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">Сохранить условия</button>
        <button onClick={onCancel} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Отмена</button>
      </div>
    </div>
  );
}

/** A volume agreed with the network: for the next period, or late for one already running. */
function VolumeForm({ title, initial, onSave, onCancel }: { title: string; initial: number; onSave: (kwh: number) => Promise<unknown>; onCancel: () => void }) {
  const [value, setValue] = useState(initial ? String(initial) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (n: number) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  const n = Number(value.replace(/\s/g, ''));
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mt-3">
      <p className="text-sm text-slate-500 mb-3">{`${title} Вводите объём, когда сеть подтвердила заявку (Приложение № 4).`}</p>
      <label className="text-xs font-semibold text-slate-500 block max-w-xs">Согласованный объём, кВт·ч
        <input inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} placeholder="например, 8 000" className={input} />
      </label>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        <button disabled={busy || !(n > 0)} onClick={() => void save(n)} className="h-10 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">Сохранить объём</button>
        {initial > 0 && <button disabled={busy} onClick={() => void save(0)} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Объём не согласован</button>}
        <button onClick={onCancel} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Отмена</button>
      </div>
    </div>
  );
}

function MarkPaid({ p, onDone, onCancel }: { p: VolumePeriod; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(p.amount + p.overAmount));
  const [paidAt, setPaidAt] = useState(today());
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.markVolumePaid(p.id, { amount: Number(amount.replace(/\s/g, '')), paidAt, ref });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mt-3">
      <p className="text-sm text-slate-500 mb-3">{`Оплата за ${range(p)}. Сначала переведите деньги из банка, потом отметьте перевод здесь — сеть увидит его в своём кабинете.`}</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-slate-500">Сумма перевода, сум
          <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className={input} />
        </label>
        <label className="text-xs font-semibold text-slate-500">Дата перевода
          <input type="date" value={paidAt} max={today()} onChange={e => setPaidAt(e.target.value)} className={input} />
        </label>
        <label className="text-xs font-semibold text-slate-500">Номер платёжного поручения
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder="например, 1245" className={input} />
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button disabled={busy || !ref.trim()} onClick={() => void save()} className="h-10 px-4 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">Сохранить оплату</button>
        <button onClick={onCancel} className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Отмена</button>
      </div>
    </div>
  );
}

function Network({ v, reload }: { v: VolumeView; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState<VolumePeriod | null>(null);
  const [volumeOf, setVolumeOf] = useState<VolumePeriod | 'next' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = v.periods.find(p => p.current);
  const carry = async (p: VolumePeriod) => {
    setError(null);
    try {
      await apiClient.setVolumeCarry(p.id, !p.carryOut);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    }
  };
  const done = () => {
    setVolumeOf(null);
    reload();
  };
  const undo = async (p: VolumePeriod) => {
    if (!window.confirm(`Снять отметку оплаты за ${range(p)}?`)) return;
    setError(null);
    try {
      await apiClient.undoVolumePaid(p.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    }
  };
  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{v.operator}</p>
          <p className="text-xs text-slate-500">
            {v.deal
              ? `Старт ${kwh(v.deal.kwh ?? MIN_KWH)} · ${money(v.deal.price)} за 1 кВт·ч · период — ${v.deal.period === 'week' ? 'неделя' : 'месяц'} · с ${dateShort(v.deal.start)} · следующий период: ${v.deal.next ? kwh(v.deal.next.kwh) : 'объём не согласован'}`
              : 'Выкуп объёма не настроен'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {v.deal && !v.deal.on && <Pill tone="slate">Договор не действует</Pill>}
          {v.deal?.on && (
            <button onClick={() => setVolumeOf(x => (x === 'next' ? null : 'next'))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <Package size={12} />Объём на следующий период
            </button>
          )}
          <button onClick={() => setEditing(x => !x)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {v.deal ? <Pencil size={12} /> : <Plus size={12} />}
            {v.deal ? 'Изменить условия' : 'Настроить выкуп'}
          </button>
        </div>
      </div>
      {editing && <DealForm view={v} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {cur && (
        <div className="mt-3 max-w-xl">
          <UsageBar p={cur} />
          <p className="text-xs text-slate-500 mt-1">{`Сейчас: израсходовано ${kwh(cur.used)} из ${kwh(cur.total)}${cur.over ? ` · сверх объёма ${kwh(cur.over)}` : ''}`}</p>
        </div>
      )}
      {volumeOf === 'next' && (
        <VolumeForm title="Объём на период, который начнётся следующим." initial={v.deal?.next?.kwh ?? 0} onCancel={() => setVolumeOf(null)} onSave={k => apiClient.setNextVolume(v.operatorId, k).then(done)} />
      )}
      {volumeOf && volumeOf !== 'next' && (
        <VolumeForm title={`Объём за ${range(volumeOf)}, согласованный уже после начала периода.`} initial={volumeOf.kwh} onCancel={() => setVolumeOf(null)} onSave={k => apiClient.setPeriodVolume(volumeOf.id, k).then(done)} />
      )}
      {marking && <MarkPaid p={marking} onCancel={() => setMarking(null)} onDone={() => { setMarking(null); reload(); }} />}
      {error && <ErrorNote text={error} />}
      {v.periods.length > 0 && (
        <div className="mt-3">
          <PeriodsTable
            periods={v.periods}
            action={(p, i) => (
              <div className="flex flex-col items-end gap-1.5">
                {p.status === 'paid'
                  ? <button onClick={() => void undo(p)} className={small}><Undo2 size={12} />Снять</button>
                  : <button onClick={() => setMarking(p)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111] text-white text-xs font-semibold whitespace-nowrap"><CheckCircle2 size={12} />Отметить оплату</button>}
                {!p.start && !p.paidAt && <button onClick={() => setVolumeOf(p)} className={small}><Package size={12} />Объём</button>}
                {i <= 1 && (p.carryOut || p.left > 0) && !v.periods[i - 1]?.paidAt && (
                  <button onClick={() => void carry(p)} className={small}><ArrowRightLeft size={12} />{p.carryOut ? 'Не переносить остаток' : 'Перенести остаток'}</button>
                )}
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

export default function VolumeDeals() {
  const [list, setList] = useState<VolumeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    apiClient.adminVolume().then(setList, e => setError(e instanceof Error ? e.message : 'Не получилось'));
  }, []);
  useEffect(reload, [reload]);
  const [showAll, setShowAll] = useState(false);
  if (!list) return <Card title="Выкуп объёма у сетей">{error ? <ErrorNote text={error} /> : <Loading />}</Card>;
  const withDeal = list.filter(v => v.deal);
  const shown = showAll ? list : withDeal;
  const overdue = withDeal.flatMap(v => v.periods.filter(p => p.status === 'overdue').map(p => ({ ...p, operator: v.operator })));
  const disputed = withDeal.flatMap(v => v.periods.filter(p => p.receipt?.status === 'disputed').map(p => ({ ...p, operator: v.operator })));
  return (
    <Card
      pad={false}
      title="Выкуп объёма у сетей"
      right={<button onClick={() => setShowAll(x => !x)} className="text-xs font-semibold text-sky-600">{showAll ? 'Только с договором' : 'Все сети'}</button>}
    >
      <p className="px-5 pt-1 pb-3 text-sm text-slate-500">На старте Voli оплачивает сети авансом 5 000 кВт·ч, независимо от продаж. Объём следующих периодов согласуется с сетью отдельно; пока он не согласован, зарядки оплачиваются по факту. Остаток переносится, только если обе стороны согласны.</p>
      {overdue.length > 0 && (
        <div className="mx-5 mb-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p><b>{`Не оплачено вовремя: ${overdue.length}`}</b> {overdue.map(p => `${p.operator} (${range(p)})`).join(', ')}</p>
        </div>
      )}
      {disputed.map(p => (
        <div key={p.id} className="mx-5 mb-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p><b>{`${p.operator}: оплату за ${range(p)} не получили`}</b> {`— «${p.receipt?.note ?? ''}». Проверьте перевод в банке. Если отметили по ошибке — снимите отметку и отметьте заново.`}</p>
        </div>
      ))}
      {shown.length ? shown.map(v => <Network key={v.operatorId} v={v} reload={reload} />) : (
        <p className="px-5 pb-4 text-sm text-slate-400">Пока ни с одной сетью не настроен выкуп объёма. Нажмите «Все сети», чтобы настроить.</p>
      )}
    </Card>
  );
}

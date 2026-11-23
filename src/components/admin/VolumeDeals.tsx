import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Undo2, Pencil, Plus, AlertTriangle } from 'lucide-react';
import { apiClient, type VolumeDeal, type VolumePeriod, type VolumeView } from '../../lib/api';
import { money, num, dateShort } from '../../lib/analytics';
import { Card, ErrorNote, Loading, Pill } from './ui';
import { PeriodsTable, UsageBar, kwh, range } from '../operator/Volume';

/**
 * The admin's side of buying networks' volume: the terms per network, and the
 * mark that Voli has paid a period (after the bank transfer).
 */

const MIN_KWH = 5000;
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const input = 'mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white';

function DealForm({ view, onSaved, onCancel }: { view: VolumeView; onSaved: () => void; onCancel: () => void }) {
  const d = view.deal;
  const started = view.periods.length > 0;
  const [kwhV, setKwh] = useState(String(d?.kwh ?? MIN_KWH));
  const [price, setPrice] = useState(d ? String(d.price) : '');
  const [period, setPeriod] = useState<'month' | 'week'>(d?.period ?? 'month');
  const [carry, setCarry] = useState(d?.carry ?? true);
  const [start, setStart] = useState(d?.start ?? today());
  const [on, setOn] = useState(d?.on ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const deal: VolumeDeal = { on, period, kwh: Number(kwhV.replace(/\s/g, '')), price: Number(price.replace(/\s/g, '')), carry, start };
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
        {started ? 'Изменения начнут действовать со следующего периода. Текущий период остаётся на прежних условиях.' : 'Условия из Приложения № 1 к договору с сетью.'}
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-slate-500">Объём за период, кВт·ч
          <input inputMode="numeric" value={kwhV} onChange={e => setKwh(e.target.value)} className={input} />
          <span className="font-normal text-[11px] text-slate-400">{`не меньше ${num(MIN_KWH)}`}</span>
        </label>
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
          <input type="checkbox" checked={carry} onChange={e => setCarry(e.target.checked)} className="w-4 h-4 accent-[#111]" />
          Остаток переносится
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
  const [error, setError] = useState<string | null>(null);
  const cur = v.periods.find(p => p.current);
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
              ? `${kwh(v.deal.kwh)} за ${v.deal.period === 'week' ? 'неделю' : 'месяц'} · ${money(v.deal.price)} за 1 кВт·ч · остаток ${v.deal.carry ? 'переносится' : 'не переносится'} · с ${dateShort(v.deal.start)}`
              : 'Выкуп объёма не настроен'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {v.deal && !v.deal.on && <Pill tone="slate">Договор не действует</Pill>}
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
      {marking && <MarkPaid p={marking} onCancel={() => setMarking(null)} onDone={() => { setMarking(null); reload(); }} />}
      {error && <ErrorNote text={error} />}
      {v.periods.length > 0 && (
        <div className="mt-3">
          <PeriodsTable
            periods={v.periods}
            action={p => p.status === 'paid'
              ? <button onClick={() => void undo(p)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 whitespace-nowrap"><Undo2 size={12} />Снять</button>
              : <button onClick={() => setMarking(p)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111] text-white text-xs font-semibold whitespace-nowrap"><CheckCircle2 size={12} />Отметить оплату</button>}
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
      <p className="px-5 pt-1 pb-3 text-sm text-slate-500">Voli заранее оплачивает сети объём кВт·ч за месяц или неделю — не меньше 5 000 — независимо от продаж.</p>
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

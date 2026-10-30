import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Plus as PlusIcon, Trash2, Gift } from 'lucide-react';
import type { SettingItem, SettingsView } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill } from './ui';

type Tier = { kwh: number; pct: number };
type Programs = {
  rewards: { month: string; budget: number; grantedMonth: number; spentMonth: number; outstanding: number; recent: { id: string; user: string; title: string; amount: number; left: number; at: string; manual?: boolean }[] };
  plus: { active: number; renewing: number; revenueMonth: number; coveredMonth: number; subscribers: { userId: string; user: string; renewsAt: string; autoRenew: boolean; active: boolean }[] };
  fleetCoveredMonth: number;
  autochargeCars: number;
  autochargeCharges: number;
};

const show = (v: unknown, s: SettingItem) =>
  s.type === 'bool' ? (v ? 'вкл' : 'выкл') : s.type === 'tiers' ? (v as Tier[]).map(t => `${num(t.kwh)}→${t.pct}%`).join(', ') : `${Number(v).toLocaleString('ru-RU')}${s.unit ? ` ${s.unit}` : ''}`;

/**
 * Platform control: every number and switch of Voli in one place — what
 * drivers see, what bonuses, Plus and the taxi tariff give and cost, booking
 * and queue rules, top-up limits, partners. Changes apply at once and go to
 * the journal with who made them.
 */
export default function AdminPlatform() {
  const { actions } = useSync();
  const [view, setView] = useState<SettingsView | null>(null);
  const [programs, setPrograms] = useState<Programs | null>(null);
  const [group, setGroup] = useState('features');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [gift, setGift] = useState({ phone: '', amount: '20000', reason: '' });

  const load = useCallback(() => {
    actions.adminSettings().then(setView).catch(e => setError((e as Error).message));
    actions.adminPrograms().then(setPrograms).catch(() => undefined);
  }, [actions]);
  useEffect(load, [load]);

  const items = useMemo(() => (view?.items ?? []).filter(i => i.group === group), [view, group]);
  if (!view) return <Page title="Управление платформой">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const valueOf = (s: SettingItem) => (s.key in draft ? (draft[s.key] === null ? s.def : draft[s.key]) : s.value);
  const set = (key: string, v: unknown) => setDraft(d => ({ ...d, [key]: v }));
  const pending = Object.keys(draft).length;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      setView(await actions.saveSettings(draft));
      setDraft({});
      setNote('Сохранено — уже действует для всех');
      setTimeout(() => setNote(''), 3500);
      actions.adminPrograms().then(setPrograms).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendGift = async () => {
    setError('');
    try {
      const g = await actions.adminBonus(gift.phone, Number(gift.amount), gift.reason);
      setNote(`Начислено ${money(g.amount)} — водитель получит уведомление`);
      setGift({ phone: '', amount: '20000', reason: '' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const field = 'w-36 px-3 py-2 rounded-xl border border-slate-200 text-sm text-right tabular-nums bg-white';
  const row = (s: SettingItem) => {
    const v = valueOf(s);
    const dirty = s.key in draft;
    const isDefault = JSON.stringify(v) === JSON.stringify(s.def);
    return (
      <div key={s.key} className={`px-5 py-3.5 flex flex-wrap items-center gap-4 ${dirty ? 'bg-amber-50/60' : ''}`}>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">{s.label}{!isDefault && <Pill tone="amber">изменено</Pill>}</p>
          {s.hint && <p className="text-xs text-slate-500">{s.hint}</p>}
          <p className="text-[11px] text-slate-400">{`По умолчанию: ${show(s.def, s)}`}</p>
        </div>
        {s.type === 'bool' ? (
          <button role="switch" aria-checked={!!v} aria-label={s.label} onClick={() => set(s.key, !v)}
            className={`relative w-12 h-7 rounded-full transition-colors ${v ? 'bg-emerald-500' : 'bg-slate-200'}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${v ? 'translate-x-5' : ''}`} />
          </button>
        ) : s.type === 'tiers' ? (
          <div className="space-y-1.5">
            {(v as Tier[]).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 w-6">от</span>
                <input aria-label="кВт·ч" className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-right" value={t.kwh} disabled={i === 0}
                  onChange={e => set(s.key, (v as Tier[]).map((x, k) => (k === i ? { ...x, kwh: Number(e.target.value.replace(/\D/g, '')) } : x)))} />
                <span className="text-slate-500">кВт·ч →</span>
                <input aria-label="Скидка, %" className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-right" value={t.pct}
                  onChange={e => set(s.key, (v as Tier[]).map((x, k) => (k === i ? { ...x, pct: Number(e.target.value.replace(/[^\d.]/g, '')) } : x)))} />
                <span className="text-slate-500">%</span>
                {i > 0 && <button onClick={() => set(s.key, (v as Tier[]).filter((_, k) => k !== i))} aria-label="Убрать ступень" className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>}
              </div>
            ))}
            {(v as Tier[]).length < 8 && (
              <button onClick={() => set(s.key, [...(v as Tier[]), { kwh: ((v as Tier[]).at(-1)?.kwh ?? 0) + 1000, pct: ((v as Tier[]).at(-1)?.pct ?? 0) + 2 }])} className="text-xs font-semibold text-sky-600 inline-flex items-center gap-1"><PlusIcon size={12} />Ступень</button>
            )}
          </div>
        ) : (
          <label className="flex items-center gap-2">
            <input inputMode="decimal" aria-label={s.label} className={field} value={String(v)}
              onChange={e => set(s.key, e.target.value === '' ? '' : Number(e.target.value.replace(/[^\d.]/g, '')))} />
            {s.unit && <span className="text-sm text-slate-500 w-28 leading-tight">{s.unit}</span>}
          </label>
        )}
        {!isDefault && (
          <button onClick={() => set(s.key, null)} title="Вернуть значение по умолчанию" aria-label={`Сбросить: ${s.label}`} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RotateCcw size={14} /></button>
        )}
      </div>
    );
  };

  const r = programs?.rewards;
  return (
    <Page title="Управление платформой" subtitle="Каждая цифра и каждая функция Voli — меняются сразу, без новой версии. Все изменения в журнале.">
      {programs && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Награды в этом месяце" value={money(r!.grantedMonth)} sub={`из бюджета ${money(r!.budget)}`} tone={r!.grantedMonth > r!.budget * 0.8 ? 'amber' : 'emerald'} />
          <Kpi label="Бонусов на счетах" value={money(r!.outstanding)} sub={`потрачено в месяце ${money(r!.spentMonth)}`} tone="sky" />
          <Kpi label="Voli Plus" value={num(programs.plus.active)} sub={`продлевают ${programs.plus.renewing} · выручка ${money(programs.plus.revenueMonth)}`} tone="violet" />
          <Kpi label="Доплатили сетям" value={money(programs.plus.coveredMonth + programs.fleetCoveredMonth)} sub={`Plus ${money(programs.plus.coveredMonth)} · такси ${money(programs.fleetCoveredMonth)}`} tone="slate" />
        </div>
      )}
      {error && <ErrorNote text={error} />}
      {note && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">{note}</p>}

      <div className="flex flex-wrap gap-2">
        {Object.entries(view.groups).map(([id, label]) => {
          const n = view.items.filter(i => i.group === id && JSON.stringify(valueOf(i)) !== JSON.stringify(i.def)).length;
          return (
            <button key={id} onClick={() => setGroup(id)} aria-pressed={group === id}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold ${group === id ? 'bg-[#111] text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
              {label}{n > 0 && <span className="ml-1.5 text-[11px] text-amber-500">{n}</span>}
            </button>
          );
        })}
      </div>

      <Card pad={false} title={view.groups[group]}>
        <div className="divide-y divide-slate-50">{items.map(row)}</div>
      </Card>

      {pending > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center gap-3 bg-[#111] text-white rounded-2xl px-5 py-3 shadow-2xl">
          <span className="flex-1 text-sm">{`Изменено настроек: ${pending}`}</span>
          <button onClick={() => setDraft({})} className="px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white">Отменить</button>
          <button onClick={() => void save()} disabled={busy} className="px-4 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-bold disabled:opacity-50">{busy ? 'Сохраняем…' : 'Сохранить и применить'}</button>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Бонус водителю вручную" right={<Gift size={16} className="text-slate-400" />}>
          <p className="text-xs text-slate-500 mb-3">Для поддержки: извиниться за сбой, поблагодарить. Учитывается в бюджете наград, тратится только на зарядку.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input className="px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Телефон, +998…" aria-label="Телефон водителя" value={gift.phone} onChange={e => setGift({ ...gift, phone: e.target.value })} />
            <input className="px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Сумма, сум" aria-label="Сумма бонуса" value={gift.amount} onChange={e => setGift({ ...gift, amount: e.target.value.replace(/\D/g, '') })} />
            <input className="px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="Причина — её увидит водитель" aria-label="Причина" value={gift.reason} onChange={e => setGift({ ...gift, reason: e.target.value })} />
          </div>
          <button onClick={() => void sendGift()} disabled={!gift.phone || !gift.reason} className="mt-3 px-4 py-2 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">Начислить</button>
          {r && r.recent.length > 0 && (
            <div className="mt-4 divide-y divide-slate-50 max-h-64 overflow-y-auto">
              {r.recent.map(g => (
                <div key={g.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0 truncate">{`${g.user} · ${g.title}`}{g.manual && <span className="ml-1 text-[11px] text-amber-600">вручную</span>}</span>
                  <span className="tabular-nums font-semibold">{money(g.amount)}</span>
                  <span className="text-xs text-slate-400 w-28 text-right">{dateTime(g.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Журнал изменений">
          {view.log.length === 0 ? <p className="text-sm text-slate-400">Пока ничего не меняли — всё по умолчанию.</p> : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {view.log.map((l, i) => {
                const s = view.items.find(x => x.key === l.key);
                return (
                  <div key={i} className="py-2 text-sm">
                    <p className="text-slate-800">{l.label}: <span className="text-slate-400 line-through">{s ? show(l.from, s) : String(l.from)}</span> → <b>{s ? show(l.to, s) : String(l.to)}</b></p>
                    <p className="text-[11px] text-slate-400">{`${l.by} · ${dateTime(l.at)}`}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {programs && programs.plus.subscribers.length > 0 && (
        <Card title="Подписчики Voli Plus" pad={false}>
          <div className="divide-y divide-slate-50">
            {programs.plus.subscribers.map(s => (
              <div key={s.userId} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="flex-1">{s.user}</span>
                {s.active ? <Pill tone={s.autoRenew ? 'green' : 'amber'}>{s.autoRenew ? `продлится ${dateTime(s.renewsAt)}` : `до ${dateTime(s.renewsAt)}, без продления`}</Pill> : <Pill tone="slate">закончилась</Pill>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </Page>
  );
}

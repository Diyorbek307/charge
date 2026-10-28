import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Clock, Users, CheckCircle, XCircle, Zap, MapPin, ThumbsUp, ShieldCheck } from 'lucide-react';
import type { StationForecast, StationCommunity, ReportKind } from '../../lib/api';
import { useSync } from '../../lib/sync';

type Connector = { id: string; type: string; power: number; status: string };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)} мин назад` : `${Math.round(m / 60)} ч назад`;
};
const inMin = (m: number) => (m >= 60 ? `~${Math.floor(m / 60)} ч ${m % 60} мин` : `~${m} мин`);

/** When the busy connectors should free up, and how long the queue would wait. */
export function StationForecastBlock({ stationId, connectors }: { stationId: string; connectors: Connector[] }) {
  const { actions, events } = useSync();
  const [f, setF] = useState<StationForecast | null>(null);
  const latest = events[0]?.id;
  useEffect(() => {
    actions.stationForecast(stationId).then(setF).catch(() => setF(null));
  }, [actions, stationId, latest]);
  if (!f) return null;
  const busy = f.connectors.filter(c => c.freeInMin && c.freeInMin > 0);
  if (!busy.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-3">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5"><Clock size={12} />Когда освободится</p>
      <ul className="space-y-1">
        {busy.map(b => {
          const c = connectors.find(x => x.id === b.id);
          return (
            <li key={b.id} className="flex justify-between text-xs text-amber-900">
              <span>{`${c?.type ?? b.id} · ${c?.power ?? '—'} кВт`}</span>
              <span className="font-semibold tabular-nums">{`через ${inMin(b.freeInMin!)}`}</span>
            </li>
          );
        })}
      </ul>
      {f.queue > 0 && f.queueWaitMin !== null && <p className="text-[11px] text-amber-700 mt-1.5">{`В очереди ${f.queue} — ожидание ${inMin(f.queueWaitMin)}`}</p>}
      <p className="text-[10px] text-amber-600/80 mt-1">Оценка по типичной длительности зарядки на таких разъёмах</p>
    </div>
  );
}

const QUICK: { kind: ReportKind; label: string; icon: ReactNode }[] = [
  { kind: 'works', label: 'Работает', icon: <CheckCircle size={12} /> },
  { kind: 'broken', label: 'Не работает', icon: <XCircle size={12} /> },
  { kind: 'queue', label: 'Есть очередь', icon: <Users size={12} /> },
  { kind: 'no_queue', label: 'Без очереди', icon: <Users size={12} /> },
  { kind: 'access', label: 'Удобный подъезд', icon: <MapPin size={12} /> },
];
const LABEL: Record<ReportKind, string> = { works: 'Работает', broken: 'Не работает', queue: 'Есть очередь', no_queue: 'Без очереди', power: 'Мощность', access: 'Удобный подъезд' };

/** What drivers reported here in the last 24 hours, and one-tap reports of your own. */
export function StationCommunityBlock({ stationId }: { stationId: string }) {
  const { actions, sessions } = useSync();
  const me = sessions.driver;
  const [c, setC] = useState<StationCommunity | null>(null);
  const [power, setPower] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    actions.stationCommunity(stationId).then(setC).catch(() => setC(null));
  }, [actions, stationId]);
  useEffect(load, [load]);

  const report = async (kind: ReportKind, value?: number) => {
    setNote(null);
    try {
      const r = await actions.addCommunityReport(stationId, { kind, value });
      setC(r.community);
      setNote({ ok: true, text: 'Спасибо! Отметка видна всем водителям 24 часа' });
      setPower('');
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    }
  };
  const confirm = async (id: string) => {
    try {
      setC((await actions.confirmCommunityReport(id)).community);
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    }
  };

  if (!c) return null;
  const summary = [
    c.works ? { t: `Работает · ${c.works}`, cls: 'bg-emerald-50 text-emerald-700' } : null,
    c.broken ? { t: `Не работает · ${c.broken}`, cls: 'bg-red-50 text-red-600' } : null,
    c.queue ? { t: `Очередь · ${c.queue}`, cls: 'bg-amber-50 text-amber-700' } : null,
    c.noQueue ? { t: `Без очереди · ${c.noQueue}`, cls: 'bg-emerald-50 text-emerald-700' } : null,
    c.power ? { t: `Реальная мощность ~${c.power} кВт`, cls: 'bg-sky-50 text-sky-700' } : null,
    c.access ? { t: `Удобный подъезд · ${c.access}`, cls: 'bg-slate-100 text-slate-600' } : null,
  ].filter(Boolean) as { t: string; cls: string }[];

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-3 mb-3">
      <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><Users size={12} />Водители за 24 часа</p>
      {summary.length ? (
        <div className="flex flex-wrap gap-1.5 mb-2">{summary.map(x => <span key={x.t} className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${x.cls}`}>{x.t}</span>)}</div>
      ) : (
        <p className="text-xs text-slate-400 mb-2">Пока никто не отмечал — будьте первым</p>
      )}
      {c.reports.slice(0, 3).map(r => (
        <div key={r.id} className="flex items-center gap-2 text-xs text-slate-600 py-1 border-t border-slate-50">
          <span className="flex-1 min-w-0 truncate">
            {`${LABEL[r.kind]}${r.kind === 'power' && r.value ? ` ~${r.value} кВт` : ''} · ${r.user} · ${ago(r.ts)}`}
            {r.verified && <ShieldCheck size={11} className="inline ml-1 text-emerald-500" aria-label="Заряжался здесь" />}
          </span>
          {me && r.userId !== me.id && (
            <button onClick={() => confirm(r.id)} className="shrink-0 inline-flex items-center gap-1 text-[11px] text-sky-600 font-semibold" aria-label="Подтвердить">
              <ThumbsUp size={11} />{r.confirms || ''}
            </button>
          )}
        </div>
      ))}
      {me && (
        <>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2">
            {QUICK.map(q => (
              <button key={q.kind} onClick={() => report(q.kind)} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-medium">{q.icon}{q.label}</button>
            ))}
          </div>
          <form className="flex gap-1.5 mt-1.5" onSubmit={e => { e.preventDefault(); if (Number(power) > 0) void report('power', Number(power)); }}>
            <input value={power} onChange={e => setPower(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="Реальная мощность, кВт" aria-label="Реальная мощность, кВт" className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs" />
            <button type="submit" disabled={!power} className="px-3 py-1.5 rounded-xl bg-sky-500 text-white text-[11px] font-semibold disabled:opacity-40 inline-flex items-center gap-1"><Zap size={11} />Отметить</button>
          </form>
          <p className="text-[10px] text-slate-400 mt-1.5">За отметку, которую подтвердят другие, — 5 баллов</p>
        </>
      )}
      {note && <p className={`text-[11px] mt-1.5 ${note.ok ? 'text-emerald-600' : 'text-red-500'}`}>{note.text}</p>}
    </div>
  );
}

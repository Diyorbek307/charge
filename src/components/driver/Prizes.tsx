import { useState } from 'react';
import { Gift, Check, Coins } from 'lucide-react';
import type { Prizes } from '../../lib/api';
import { useSync } from '../../lib/sync';

const kwh = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} кВт·ч`;
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' });
const bar = 'linear-gradient(90deg,#D9F77A,#8FD61A)';

/**
 * Gifts for kWh on the rewards screen: every kWh charged is a coin. A gift
 * the coins cover can be taken; its price is spent and saving starts over.
 * A taken gift shows its code, which the driver names to support.
 */
export function PrizesSection({ prizes }: { prizes: Prizes }) {
  const { actions, refresh } = useSync();
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const claim = async (price: number) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await actions.claimPrize(price);
      await refresh();
      setNote({ ok: true, text: `Подарок ваш! Код ${r.prize.code} — назовите его в поддержке, договоримся о времени` });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 px-1 pt-1">ПОДАРКИ ЗА КИЛОВАТТЫ</p>
      <div className="relative overflow-hidden rounded-3xl p-5 bg-[#111] text-white">
        <span className="absolute -right-10 -top-10 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle,rgba(198,244,50,.35),transparent 70%)' }} aria-hidden="true" />
        <p className="text-xs font-semibold text-[#C6F432] flex items-center gap-1.5"><Coins size={14} />НА СЧЕТУ</p>
        <p key={prizes.balance} className="text-3xl font-black tabular-nums mt-1 pg-pop">{kwh(prizes.balance)}</p>
        <p className="text-xs mt-1 text-white/60 max-w-[85%]">Каждый кВт·ч — монета. Забрали подарок — его кВт·ч списываются, и копите дальше</p>
      </div>

      {note && <p role="status" className={`text-xs rounded-xl px-3 py-2.5 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}

      <div className="space-y-2 pg-stagger">
        {prizes.items.map(p => {
          const pct = Math.min(100, Math.round((prizes.balance / p.kwh) * 100));
          const ready = p.left === 0;
          return (
            <div key={p.kwh} className={`bg-white rounded-2xl border p-4 ${ready ? 'border-[#C6F432] shadow-[0_0_0_3px_rgba(198,244,50,.25)]' : 'border-slate-100'}`}>
              <div className="flex items-start gap-3">
                <span className={`w-11 h-11 rounded-2xl grid place-items-center text-xl shrink-0 ${ready ? 'bg-[#EFFCC9]' : 'bg-slate-50'}`}>{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{p.title}</p>
                    <span className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-extrabold tabular-nums">{kwh(p.kwh)}</span>
                  </div>
                  {ready ? (
                    asking === p.kwh ? (
                      <div className="mt-2.5 flex gap-2">
                        <button onClick={() => setAsking(null)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Отмена</button>
                        <button onClick={() => void claim(p.kwh)} disabled={busy} className="flex-[2] py-2.5 rounded-xl bg-[#111] text-white text-sm font-bold disabled:opacity-50">{busy ? 'Оформляем…' : `Списать ${kwh(p.kwh)}`}</button>
                      </div>
                    ) : (
                      <button onClick={() => setAsking(p.kwh)} className="mt-2.5 w-full py-2.5 rounded-xl text-[#111] text-sm font-bold inline-flex items-center justify-center gap-1.5" style={{ background: 'linear-gradient(90deg,#E2F99A,#C6F432)' }}><Gift size={15} />Забрать подарок</button>
                    )
                  ) : (
                    <div className="mt-2">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full pg-bar" style={{ width: `${pct}%`, background: bar }} /></div>
                      <p className="text-[11px] font-semibold text-slate-500 mt-1 tabular-nums">{`Осталось ${kwh(p.left)}`}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {prizes.taken.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
          {prizes.taken.map(t => (
            <div key={t.id} className="p-3.5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-slate-50 grid place-items-center text-lg shrink-0">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                <p className="text-[11px] text-slate-400">
                  {t.status === 'ready' ? `Назовите код в поддержке · ${day(t.at)}` : t.status === 'issued' ? `Получен · ${day(t.at)}` : 'Отменён — кВт·ч вернулись на счёт'}
                </p>
              </div>
              {t.status === 'ready' ? (
                <span className="px-2.5 py-1 rounded-lg bg-[#111] text-[#C6F432] text-sm font-black tracking-widest tabular-nums">{t.code}</span>
              ) : t.status === 'issued' ? <Check size={18} className="text-emerald-500 shrink-0" /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Under the receipt: how many kWh coins the driver has and how far the
 * nearest gifts are — "to the dry clean, 4 000 kWh more".
 */
export function PrizeProgress({ prizes, onOpen }: { prizes: Prizes; onOpen?: () => void }) {
  if (!prizes.items.length) return null;
  const ready = prizes.items.filter(p => p.left === 0);
  const next = prizes.items.filter(p => p.left > 0).slice(0, 2);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Gift size={16} className="text-[#6EA60D]" />Подарки за киловатты</p>
        <span className="text-xs font-extrabold tabular-nums text-slate-700">{`${kwh(prizes.balance)} на счету`}</span>
      </div>
      {ready.length > 0 && (
        <button onClick={onOpen} className="mt-3 w-full text-left rounded-xl px-3 py-2.5 text-[#111] text-sm font-bold" style={{ background: 'linear-gradient(90deg,#E2F99A,#C6F432)' }}>
          {`${ready[0].icon} Можно забрать: ${ready[0].title}`}
        </button>
      )}
      <div className="mt-3 space-y-2.5">
        {next.map(p => (
          <div key={p.kwh}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 font-semibold">{`${p.icon} До «${p.title}»`}</span>
              <span className="text-slate-500 tabular-nums">{`ещё ${kwh(p.left)}`}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((prizes.balance / p.kwh) * 100))}%`, background: bar }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

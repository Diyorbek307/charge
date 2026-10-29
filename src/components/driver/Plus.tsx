import { useState } from 'react';
import { ArrowLeft, Check, CalendarCheck, Percent, Users, Gift, LoaderCircle } from 'lucide-react';
import { useSync } from '../../lib/sync';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' });

/** PowerGo Plus: what it gives, what it costs, and the driver's own month with it. */
export default function PlusScreen({ onBack, onTopUp }: { onBack: () => void; onTopUp: () => void }) {
  const { state, actions, refresh, sessions } = useSync();
  const plus = state?.plus;
  const me = sessions.driver;
  const balance = (me && state?.wallets[me.id]?.balance) ?? 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = plus?.price ?? 49_000;
  const discount = plus?.discount ?? 5;

  const act = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await (on ? actions.subscribePlus() : actions.cancelPlus());
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const perks = [
    { icon: <Percent size={17} />, title: `−${discount}% на зарядку во всех сетях`, text: 'Скидку оплачивает PowerGo — сеть получает свою цену полностью' },
    { icon: <CalendarCheck size={17} />, title: 'Бронь без платы', text: 'Держим разъём к вашему времени бесплатно' },
    { icon: <Users size={17} />, title: 'Очередь — вперёд', text: 'Встаёте за другими Plus, перед остальными' },
    { icon: <Gift size={17} />, title: 'Баллы ×2', text: 'Вдвое больше баллов за каждый кВт·ч' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">PowerGo Plus</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: 'linear-gradient(150deg,#1F1F1F,#0A0A0A)' }}>
          <span className="absolute -right-10 -top-10 w-44 h-44 rounded-full opacity-30 pg-float" style={{ background: 'radial-gradient(circle,#FFC83D,transparent 65%)' }} aria-hidden="true" />
          <p className="text-2xl font-black tracking-tight">Power<span className="text-[#FFC83D]">Go</span> <span className="px-2 py-0.5 rounded-lg bg-[#FFC83D] text-[#111] text-base align-middle">Plus</span></p>
          {plus?.active ? (
            <>
              <p className="mt-3 text-sm text-white/70">{plus.autoRenew ? `Подключён · продлится ${date(plus.renewsAt!)}` : `Действует до ${date(plus.renewsAt!)} · продление выключено`}</p>
              <p className="mt-1 text-3xl font-black tabular-nums text-[#FFC83D] pg-pop">{sum(plus.savedThisMonth)}</p>
              <p className="text-xs text-white/50">сэкономлено в этом месяце</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-3xl font-black tabular-nums">{sum(price)}<span className="text-sm font-semibold text-white/50"> / 30 дней</span></p>
              <p className="text-xs text-white/60 mt-1">{`Окупается, если заряжаетесь больше чем на ${sum(price / (discount / 100))} в месяц`}</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 pg-stagger">
          {perks.map(p => (
            <div key={p.title} className="px-4 py-3 flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-[#FFF3C4] text-[#8a5b00] grid place-items-center shrink-0">{p.icon}</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{p.title}</p>
                <p className="text-xs text-slate-500">{p.text}</p>
              </div>
              {plus?.active && <Check size={16} className="ml-auto text-emerald-500 shrink-0 mt-1" />}
            </div>
          ))}
        </div>

        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 pg-shake">{error}</p>}
        {!plus?.active || !plus.autoRenew ? (
          <>
            <button onClick={() => void act(true)} disabled={busy || (!plus?.active && balance < price)}
              className="w-full py-4 rounded-2xl font-bold text-base text-[#111] inline-flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_8px_22px_rgba(255,176,0,0.3)]"
              style={{ background: 'linear-gradient(135deg,#FFD66B,#FFB000)' }}>
              {busy && <LoaderCircle size={16} className="animate-spin" />}
              {plus?.active ? 'Включить продление' : `Подключить за ${sum(price)}`}
            </button>
            {!plus?.active && balance < price && (
              <button onClick={onTopUp} className="w-full text-sm font-semibold text-slate-600">{`На кошельке ${sum(balance)} — пополнить`}</button>
            )}
          </>
        ) : (
          <button onClick={() => void act(false)} disabled={busy} className="w-full py-3 rounded-2xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 disabled:opacity-50">
            Отключить продление
          </button>
        )}
        <p className="text-[11px] text-slate-400 px-1">Списывается с кошелька раз в 30 дней. Отключить можно в любой момент — оплаченный месяц остаётся. Скидка не действует на сети-партнёры с их собственным счётом (OCPI).</p>
      </div>
    </div>
  );
}

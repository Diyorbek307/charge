import { useEffect, useState } from 'react';
import { ArrowLeft, Gift, CheckCircle, Info } from 'lucide-react';
import { useSync } from '../../lib/sync';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' });

/**
 * PowerGo's rewards: the bonus on the account, and each milestone with how
 * far along the driver is. The bonus pays for charging only and burns.
 */
export default function RewardsScreen({ onBack, onAddCar }: { onBack: () => void; onAddCar: () => void }) {
  const { state } = useSync();
  const r = state?.rewards;
  const list = r?.achievements ?? [];
  const got = list.filter(a => a.grantedAt);
  const left = list.filter(a => !a.grantedAt).sort((a, b) => b.progress / b.goal - a.progress / a.goal);
  const total = list.reduce((n, a) => n + a.amount, 0);
  const earned = got.reduce((n, a) => n + a.amount, 0);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Награды и бонусы</h1>
          <p className="text-xs text-slate-500">{`Получено ${sum(earned)} из ${sum(total)}`}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* The bonus itself */}
        <div className="relative overflow-hidden rounded-3xl p-5 text-[#111]" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFC83D 55%,#FFB000)' }}>
          <span className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/25 pg-float" aria-hidden="true" />
          <span className="absolute right-6 bottom-4 text-5xl pg-float" style={{ animationDelay: '.8s' }} aria-hidden="true">🎁</span>
          <p className="text-xs font-semibold opacity-70">БОНУС POWERGO</p>
          <p key={r?.bonus.balance} className="text-3xl font-black tabular-nums mt-1 pg-pop">{sum(r?.bonus.balance ?? 0)}</p>
          <p className="text-xs mt-1 opacity-80 max-w-[70%]">
            {r?.bonus.nextExpiry && r.bonus.balance > 0
              ? `Тратится на зарядку раньше кошелька. ${sum(r.bonus.nextExpiryAmount)} сгорят ${date(r.bonus.nextExpiry)}`
              : 'Выполняйте задания ниже — бонус приходит сразу и тратится на зарядку'}
          </p>
        </div>

        {left.length > 0 && <p className="text-xs font-semibold text-slate-500 px-1 pt-1">ЗАДАНИЯ</p>}
        <div className="space-y-2 pg-stagger">
          {left.map(a => {
            const pct = Math.round((a.progress / a.goal) * 100);
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-slate-50 grid place-items-center text-xl shrink-0">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{a.title}</p>
                      <span className="shrink-0 px-2 py-0.5 rounded-lg bg-[#FFF3C4] text-[#8a5b00] text-xs font-extrabold tabular-nums">{`+${sum(a.amount)}`}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{a.desc}</p>
                    {a.goal > 1 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full pg-bar" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FFD66B,#FFB000)' }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{`${a.progress}/${a.goal}`}</span>
                      </div>
                    )}
                    {a.id === 'car' && (
                      <button onClick={onAddCar} className="mt-2.5 w-full py-2.5 rounded-xl bg-[#111] text-white text-sm font-bold">Указать автомобиль</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {got.length > 0 && <p className="text-xs font-semibold text-slate-500 px-1 pt-2">ПОЛУЧЕНО</p>}
        <div className="space-y-2">
          {got.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-emerald-100 p-3.5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-emerald-50 grid place-items-center text-lg shrink-0">{a.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                <p className="text-[11px] text-slate-400">{`${date(a.grantedAt!)} · +${sum(a.amount)}`}</p>
              </div>
              <CheckCircle size={18} className="text-emerald-500 shrink-0" />
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 px-1 flex gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />{`Бонусы дарит PowerGo. Ими можно оплатить только зарядку, вывести нельзя. Каждая награда — один раз на аккаунт, бонус действует ${r?.bonusDays ?? 60} дней.`}</p>
      </div>
    </div>
  );
}

/**
 * The moment a reward lands: the amount pops up big over the screen with a
 * burst of confetti in the brand colours, then leaves by itself.
 */
export function RewardBurst({ amount, title, onDone }: { amount: number; title: string; onDone: () => void }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    navigator.vibrate?.([30, 40, 30]);
    const a = setTimeout(() => setOut(true), 2600);
    const b = setTimeout(onDone, 3000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // onDone is stable for this burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bits = Array.from({ length: 26 }, (_, i) => {
    const angle = (i / 26) * Math.PI * 2;
    const r = 110 + (i % 5) * 22;
    return { dx: Math.round(Math.cos(angle) * r), dy: Math.round(Math.sin(angle) * r) - 40, c: ['#FFC83D', '#FFB000', '#111', '#34D399', '#fff'][i % 5], d: (i % 7) * 25, rot: (i * 47) % 360 };
  });
  return (
    <div className={`absolute inset-0 z-[60] grid place-items-center pointer-events-none ${out ? 'pg-toast-out' : 'pg-fade'}`} role="status" aria-live="polite">
      <div className="absolute inset-0 bg-black/25" />
      <div className="relative grid place-items-center">
        {bits.map((b, i) => (
          <span key={i} className="pg-confetti absolute w-2.5 h-3.5 rounded-sm" style={{ background: b.c, ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg`, animationDelay: `${b.d}ms` }} />
        ))}
        <div className="relative rounded-3xl px-7 py-5 text-center text-[#111] shadow-2xl pg-pop" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFB000)' }}>
          <Gift size={30} className="mx-auto mb-1" />
          <p className="text-3xl font-black tabular-nums">{`+${amount.toLocaleString('ru-RU')} сум`}</p>
          <p className="text-sm font-semibold opacity-80">{`бонусом · ${title}`}</p>
        </div>
      </div>
    </div>
  );
}

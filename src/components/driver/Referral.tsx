import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Check, Share2, UserPlus, Zap, Gift, Users } from 'lucide-react';
import { apiClient, type Referral } from '../../lib/api';
import { BRAND } from '../../brand';
import { APP_URL } from '../../lib/site';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' });

/** The link a friend opens: the app's sign-up with the code already filled in. */
const linkFor = (code: string) => `${APP_URL || window.location.origin}/?portal=driver&ref=${code}`;

/**
 * Bring a friend: the driver's code and link, what the friend and the driver
 * each get, and every friend with what they brought so far.
 */
export default function ReferralScreen({ onBack }: { onBack: () => void }) {
  const [r, setR] = useState<Referral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    apiClient.referral().then(setR).catch(e => setError((e as Error).message));
  }, []);

  const copy = async (what: 'code' | 'link') => {
    if (!r) return;
    try {
      await navigator.clipboard.writeText(what === 'code' ? r.code : linkFor(r.code));
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* no clipboard here: the code stays on screen to type */
    }
  };
  const share = async () => {
    if (!r) return;
    const text = `Заряжаю электромобиль через ${BRAND.name} — все станции в одном приложении. Регистрируйся по моей ссылке и получи ${sum(r.friendBonus)} на первую зарядку:`;
    if (navigator.share) {
      await navigator.share({ title: BRAND.name, text, url: linkFor(r.code) }).catch(() => {});
    } else void copy('link');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Приведи друга</h1>
          <p className="text-xs text-slate-500">Бонусы за каждую зарядку друзей</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        {!r && !error && <div className="h-40 rounded-3xl bg-white animate-pulse" />}

        {r && !r.on && (
          <p className="text-sm text-slate-600 bg-white rounded-2xl border border-slate-100 p-4">Программа сейчас приостановлена. Бонусы, которые уже начислены, действуют до своего срока.</p>
        )}

        {r && r.on && (
          <>
            <div className="relative overflow-hidden rounded-3xl p-5 text-[#111] pg-reveal" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFC83D 55%,#FFB000)' }}>
              <span className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/25" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C3D00]">Вам и другу</p>
              <p className="text-[28px] leading-tight font-extrabold mt-1">{`${r.percent}% с каждой зарядки друга`}</p>
              <p className="text-sm mt-1.5 text-[#2A2A30]">{`Бонусом на ваш кошелёк, ${r.months} мес. А другу — ${sum(r.friendBonus)} на первую зарядку.`}</p>

              <div className="mt-4 bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-500">Ваш код</p>
                  <p className="text-2xl font-extrabold tracking-[0.18em] tabular-nums" data-no-translate>{r.code}</p>
                </div>
                <button onClick={() => void copy('code')} aria-label="Скопировать код" className="w-11 h-11 rounded-xl bg-slate-100 grid place-items-center">
                  {copied === 'code' ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
                </button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button onClick={() => void share()} className="h-12 rounded-2xl bg-[#111] text-[#FFC83D] font-bold text-sm flex items-center justify-center gap-2"><Share2 size={16} />Поделиться</button>
                <button onClick={() => void copy('link')} className="h-12 rounded-2xl bg-white/80 text-[#111] font-bold text-sm flex items-center justify-center gap-2">
                  {copied === 'link' ? <><Check size={16} />Скопировано</> : <><Copy size={16} />Ссылка</>}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <Users size={15} />, v: String(r.friends.length), l: 'друзей' },
                { icon: <Zap size={15} />, v: sum(r.earnedMonth), l: 'в этом месяце' },
                { icon: <Gift size={15} />, v: sum(r.earnedTotal), l: 'всего' },
              ].map(x => (
                <div key={x.l} className="bg-white rounded-2xl border border-slate-100 p-3">
                  <span className="text-[#8A5B00]">{x.icon}</span>
                  <p className="text-sm font-extrabold text-slate-900 mt-1 tabular-nums">{x.v}</p>
                  <p className="text-[11px] text-slate-500">{x.l}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-sm font-bold text-slate-900 mb-3">Как это работает</p>
              <ol className="space-y-3">
                {[
                  'Отправьте другу ссылку или код',
                  `Друг регистрируется в ${BRAND.name} и получает ${sum(r.friendBonus)} на первую зарядку`,
                  `Каждый раз, когда друг оплачивает зарядку, вам приходит ${r.percent}% её стоимости — бонусом на зарядку`,
                ].map((t, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-[#FFC83D] text-[#111] text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                    <span className="text-sm text-slate-700 leading-snug">{t}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <p className="px-4 pt-3.5 pb-2 text-xs font-semibold text-slate-500 tracking-wider">МОИ ДРУЗЬЯ</p>
              {r.friends.length === 0 ? (
                <div className="px-4 pb-4 flex items-center gap-3 text-sm text-slate-500"><UserPlus size={18} className="text-slate-400 shrink-0" />Пока никого — поделитесь ссылкой, и друзья появятся здесь</div>
              ) : (
                r.friends.map(f => (
                  <div key={`${f.name}-${f.since}`} className="px-4 py-3 border-t border-slate-50 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-slate-100 grid place-items-center text-sm font-bold text-slate-600 shrink-0">{f.name[0]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate" data-no-translate>{f.name}</p>
                      <p className="text-xs text-slate-400">{`с ${date(f.since)} · ${f.charges} зар.${f.active ? '' : ' · срок вышел'}`}</p>
                    </div>
                    <span className="text-sm font-bold text-[#0B7A35] tabular-nums">{`+${sum(f.earned)}`}</span>
                  </div>
                ))
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed px-1">
              {`Бонусы оплачивает ${BRAND.name}, а сеть получает полную цену. Бонус тратится только на зарядку и действует ограниченное время. В месяц можно получить до ${sum(r.monthCap)}. Зарядки в долг не засчитываются. Несколько аккаунтов на одного человека — бонусы отменяются.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

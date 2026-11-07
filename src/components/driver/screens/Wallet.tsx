// Moved out of DriverApp.tsx: WalletScreen.
import { useState, useEffect } from 'react';
import { Zap, ChevronRight, ArrowLeft, ArrowDownCircle } from 'lucide-react';
import { useSync } from '../../../lib/sync';
import { NetworkWalletList } from '../NetworkWallets';
import { usePlatform } from '../../../lib/platform';
import type { PaymentOrder } from '../../../lib/api';
import { apiClient } from '../../../lib/api';

export function WalletScreen({ onBack, onRewards }: { onBack: () => void; onRewards: () => void }) {
  const { actions, refresh, state, sessions: portalSessions } = useSync();
  const driverId = portalSessions.driver?.id;
  // Balance is owned by the server so a top-up shows up in every portal.
  const balance = (driverId && state?.wallets?.[driverId]?.balance) ?? 0;
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [provider, setProvider] = useState<'payme' | 'click' | 'uzum' | 'humo'>('payme');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  // Paynet: the driver pays in Paynet's own app or terminal by their Voli account number.
  const [paynet, setPaynet] = useState<{ number: string; on: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (showTopUp && !paynet) apiClient.paynetAccount().then(setPaynet).catch(() => setPaynet(null));
  }, [showTopUp, paynet]);

  const quickAmounts = [10000, 20000, 50000, 100000];
  const providers = [
    { id: 'payme' as const, name: 'Payme', letter: 'P', color: '#00B3B3' },
    { id: 'click' as const, name: 'Click', letter: 'C', color: '#0073FF' },
    { id: 'uzum' as const, name: 'Uzum', letter: 'U', color: '#7000FF' },
    { id: 'humo' as const, name: 'Humo', letter: 'H', color: '#00A651' },
  ];
  // Only the providers the admin has on.
  const platform = usePlatform();
  const shownProviders = providers.filter(p => platform.topup.providers.includes(p.id));
  const providerName = providers.find(p => p.id === provider)?.name ?? 'Payme';
  useEffect(() => {
    if (shownProviders.length && !shownProviders.some(p => p.id === provider)) setProvider(shownProviders[0].id);
  }, [shownProviders, provider]);

  // Money in: paid top-ups. Money out: charges paid from the wallet, refunds back in.
  useEffect(() => {
    actions.listPayments('driver').then(setOrders).catch(() => setOrders([]));
  }, [actions, balance]);
  const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  const transactions = [
    ...orders.filter(o => o.status === 'paid').map(o => {
      const network = o.operatorId ? state?.networkWallets?.find(w => w.operatorId === o.operatorId)?.name ?? o.operatorId : null;
      const via = { payme: 'Payme', click: 'Click', uzum: 'Uzum', humo: 'Humo', paynet: 'Paynet' }[o.provider];
      return { id: o.id, type: 'topup', amount: o.amount, label: network ? `Баланс сети ${network} — ${via}` : `Пополнение — ${via}`, at: o.paidAt ?? o.created };
    }),
    ...(state?.transactions ?? [])
      // A charge that never started bills nothing: no "−0 сум" row for it.
      .filter(t => t.userId === driverId && t.amount > 0 && (t.method === 'Кошелёк' || t.method.startsWith('Баланс сети')))
      .map(t => {
        const ses = state?.sessions.find(x => x.id === t.sessionId);
        const refunded = t.status === 'refunded';
        const viaNetwork = t.method.startsWith('Баланс сети');
        const fromWallet = t.amount - (t.bonus ?? 0);
        return { id: t.id, type: refunded ? 'topup' : 'charge', amount: refunded ? t.amount : -fromWallet, label: `${refunded ? 'Возврат' : 'Зарядка'} — ${ses?.stationName ?? t.sessionId}${viaNetwork ? ' · баланс сети' : ''}${t.bonus ? ` · ${t.bonus.toLocaleString('ru-RU')} бонусом` : ''}`, at: t.time };
      }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30)
    .map(x => ({ ...x, date: fmt(x.at) }));

  /**
   * The wallet is credited only once the provider confirms the payment. With
   * a merchant account that happens on the provider's checkout page; until
   * one exists, the sandbox runs the same confirmation path server-side.
   */
  const doTopUp = async () => {
    const amt = selectedAmount || parseInt(customAmount) || 0;
    if (amt < platform.topup.min || amt > platform.topup.max || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const { order, checkoutUrl, sandbox } = await actions.createTopUpOrder('driver', provider, amt);
      if (!sandbox) {
        window.location.href = checkoutUrl;
        return;
      }
      await actions.sandboxConfirm('driver', order.id);
      await refresh();
      setTopUpSuccess(true);
      setTimeout(() => {
        setShowTopUp(false);
        setTopUpSuccess(false);
        setSelectedAmount(null);
        setCustomAmount('');
      }, 2000);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Оплата не прошла');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-900">Мой кошелёк</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Balance card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-5 text-white shadow-xl">
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-1">БАЛАНС Voli</p>
          <p key={balance} className="text-3xl font-bold tracking-tight mb-3 tabular-nums pg-pop">{balance.toLocaleString('ru-RU')} сум</p>
          <p className="text-xs text-slate-400 mb-4">Пополнение через Payme, Click, Uzum или Humo · списывается за каждую зарядку по счётчику</p>
          <div className="flex gap-2">
            <button onClick={() => setShowTopUp(true)}
              className="flex-1 py-2.5 bg-[#FFC83D] hover:bg-[#FFB000] text-[#111] rounded-2xl text-sm font-semibold transition-colors active:scale-95">
              Пополнить
            </button>

          </div>
        </div>

        {(state?.rewards?.bonus.balance ?? 0) > 0 && (
          <button onClick={onRewards} className="w-full rounded-2xl p-4 flex items-center gap-3 text-left text-[#111]" style={{ background: 'linear-gradient(135deg,#FFF3C4,#FFE08A)' }}>
            <span className="text-2xl" aria-hidden="true">🎁</span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold opacity-70">БОНУС VOLI</span>
              <span className="block text-lg font-black tabular-nums">{`${state!.rewards!.bonus.balance.toLocaleString('ru-RU')} сум`}</span>
              {state!.rewards!.bonus.nextExpiry && <span className="block text-[11px] opacity-70">{`Тратится первым · до ${new Date(state!.rewards!.bonus.nextExpiry).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}</span>}
            </span>
            <ChevronRight size={16} className="opacity-50" />
          </button>
        )}

        <NetworkWalletList />

        {/* Transaction history */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">ИСТОРИЯ ОПЕРАЦИЙ</p>
          </div>
          <div className="divide-y divide-slate-50 pg-stagger">
            {transactions.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Операций пока нет</p>}
            {transactions.map(tx => (
              <div key={tx.id} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.type === 'topup' ? 'bg-green-50' : 'bg-sky-50'}`}>
                  {tx.type === 'topup'
                    ? <ArrowDownCircle size={17} className="text-green-500" />
                    : <Zap size={17} className="text-sky-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{tx.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{tx.date}</p>
                </div>
                <span className={`text-sm font-semibold font-mono shrink-0 ${tx.type === 'topup' ? 'text-emerald-700' : 'text-red-500'}`}>
                  {tx.type === 'topup' ? '+' : ''}{tx.amount.toLocaleString('ru-RU')} сум
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top-up modal */}
      {showTopUp && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end pg-fade" onClick={e => { if (e.target === e.currentTarget && !paying) setShowTopUp(false); }}>
          <div className="bg-white rounded-t-3xl p-6 space-y-5 w-full pg-sheet-in">
            <div className="flex justify-center mb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            {topUpSuccess ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl pg-pop">✅</div>
                <p className="text-lg font-bold text-slate-900">Пополнено успешно!</p>
                <p className="text-sm text-slate-500">Средства зачислены на кошелёк</p>
              </div>
            ) : (
              <>
                <h2 className="text-base font-bold text-slate-900">Пополнить кошелёк</h2>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map(amt => (
                    <button key={amt}
                      onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                      className={`py-2 rounded-xl text-sm font-semibold transition-colors ${selectedAmount === amt ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                      {(amt / 1000).toFixed(0)}K
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Своя сумма"
                  value={customAmount}
                  onChange={e => { setCustomAmount(e.target.value.replace(/\D/g, '').slice(0, 8)); setSelectedAmount(null); }}
                  onKeyDown={e => e.key === 'Enter' && void doTopUp()}
                  placeholder={`Своя сумма, от ${platform.topup.min.toLocaleString('ru-RU')} до ${platform.topup.max.toLocaleString('ru-RU')} сум`}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-400 placeholder:text-slate-300"
                />

                {/* Payment provider */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500">СПОСОБ ОПЛАТЫ</p>
                  <div className="grid grid-cols-2 gap-2">
                    {shownProviders.map(p => (
                      <button key={p.id} onClick={() => setProvider(p.id)} aria-pressed={provider === p.id}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-colors ${provider === p.id ? 'border-sky-400 bg-sky-50 text-slate-900' : 'border-slate-100 bg-white text-slate-500'}`}>
                        <span className="w-6 h-6 rounded-lg grid place-items-center text-white text-xs" style={{ background: p.color }}>{p.letter}</span>
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">{`Кошелёк пополнится после подтверждения платежа от ${providerName}`}</p>
                </div>

                {payError && (
                  <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{payError}</p>
                )}

                <button
                  onClick={doTopUp}
                  disabled={paying || !(selectedAmount || (parseInt(customAmount) >= platform.topup.min && parseInt(customAmount) <= platform.topup.max))}
                  className="w-full py-3.5 bg-sky-500 text-white rounded-2xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-all">
                  {paying ? 'Подтверждаем оплату…' : `Оплатить через ${providerName}`}{!paying && (selectedAmount ? ` ${selectedAmount.toLocaleString('ru-RU')} сум` : customAmount ? ` ${parseInt(customAmount).toLocaleString('ru-RU')} сум` : '')}
                </button>

                {paynet?.on && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                    <p className="text-xs font-semibold text-slate-500">ИЛИ ЧЕРЕЗ PAYNET</p>
                    <p className="text-[13px] text-slate-600 mt-1">В приложении Paynet или в терминале найдите «Voli» и введите номер счёта:</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 font-mono text-lg font-bold tracking-wider text-slate-900" data-no-translate>{paynet.number}</span>
                      <button
                        onClick={() => { void navigator.clipboard?.writeText(paynet.number).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                        {copied ? 'Скопировано' : 'Скопировать'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">Деньги придут на ваш счёт Voli сразу после оплаты.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

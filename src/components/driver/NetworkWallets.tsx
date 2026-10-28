import { useState } from 'react';
import { ArrowRight, CheckCircle, LoaderCircle, X } from 'lucide-react';
import type { NetworkWallet } from '../../lib/api';
import { useSync } from '../../lib/sync';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const PROVIDERS = [
  { id: 'payme' as const, name: 'Payme', letter: 'P', color: '#00B3B3' },
  { id: 'click' as const, name: 'Click', letter: 'C', color: '#0073FF' },
];

/**
 * Top-up of a driver's balance at one network. The money goes straight to
 * the network's own Payme cashbox or Click service; the balance grows once
 * the provider confirms the payment to us.
 */
export function NetworkTopUp({ wallet, onClose, need = 0 }: { wallet: NetworkWallet; onClose: () => void; need?: number }) {
  const { actions, refresh } = useSync();
  const offered = PROVIDERS.filter(p => wallet[p.id]);
  const [provider, setProvider] = useState(offered[0]?.id ?? 'payme');
  const suggested = Math.max(10000, Math.ceil(Math.max(0, need - wallet.balance) / 10000) * 10000);
  const [amount, setAmount] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { order, checkoutUrl, sandbox } = await actions.createTopUpOrder('driver', provider, amount, wallet.operatorId);
      if (!sandbox) {
        window.location.href = checkoutUrl;
        return;
      }
      await actions.sandboxConfirm('driver', order.id);
      await refresh();
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/50 z-[60] flex items-end" onClick={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={`Пополнить баланс сети ${wallet.name}`}>
      <div className="bg-white rounded-t-3xl p-5 space-y-4 w-full">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden="true">{wallet.logo}</span>
          <div className="flex-1">
            <p className="text-base font-bold text-slate-900">{`Баланс сети ${wallet.name}`}</p>
            <p className="text-xs text-slate-500">{`Сейчас ${sum(wallet.balance)} · деньги поступят сети напрямую`}</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="p-2 rounded-xl bg-slate-100"><X size={16} /></button>
        </div>
        {done ? (
          <div className="flex flex-col items-center py-4 gap-2">
            <CheckCircle size={40} className="text-emerald-500" />
            <p className="font-bold text-slate-900">Пополнено</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[...new Set([suggested, 20000, 50000, 100000])].slice(0, 4).map(v => (
                <button key={v} onClick={() => setAmount(v)} aria-pressed={amount === v} className={`py-2 rounded-xl text-sm font-semibold ${amount === v ? 'bg-[#FFC83D] text-[#111]' : 'bg-slate-100 text-slate-700'}`}>
                  {`${Math.round(v / 1000)}K`}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {offered.map(p => (
                <button key={p.id} onClick={() => setProvider(p.id)} aria-pressed={provider === p.id} className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold ${provider === p.id ? 'border-[#FFB000] bg-amber-50 text-slate-900' : 'border-slate-100 text-slate-500'}`}>
                  <span className="w-6 h-6 rounded-lg grid place-items-center text-white text-xs" style={{ background: p.color }}>{p.letter}</span>
                  {p.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">{`Платёж уходит в кассу ${wallet.name}. Этим балансом оплачиваются зарядки только на станциях этой сети.`}</p>
            {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <button onClick={pay} disabled={busy || !offered.length} className="w-full py-3.5 rounded-2xl bg-[#FFC83D] text-[#111] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {`Оплатить ${sum(amount)} через ${provider === 'payme' ? 'Payme' : 'Click'}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The driver's balances at networks paid directly, in the wallet screen. */
export function NetworkWalletList() {
  const { state } = useSync();
  const wallets = state?.networkWallets ?? [];
  const [open, setOpen] = useState<NetworkWallet | null>(null);
  if (!wallets.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-500">БАЛАНСЫ СЕТЕЙ</p>
        <p className="text-[11px] text-slate-500 mt-0.5">Эти сети принимают оплату напрямую: деньги поступают им, а зарядки на их станциях списываются отсюда.</p>
      </div>
      {wallets.map(w => (
        <div key={w.operatorId} className="px-4 py-3 flex items-center gap-3 border-t border-slate-50 first:border-0">
          <span className="text-xl leading-none" aria-hidden="true">{w.logo}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{w.name}</p>
            <p className="text-xs text-slate-500 tabular-nums">{w.direct ? sum(w.balance) : `${sum(w.balance)} · сеть больше не принимает оплату напрямую — остаток вернёт сеть`}</p>
          </div>
          {w.direct && (
            <button onClick={() => setOpen(w)} className="px-3 py-1.5 rounded-xl bg-[#FFC83D] text-[#111] text-xs font-semibold">Пополнить</button>
          )}
        </div>
      ))}
      {open && <NetworkTopUp wallet={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

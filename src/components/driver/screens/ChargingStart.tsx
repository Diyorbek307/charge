// Moved out of DriverApp.tsx: ConnectorTile, readLarge, useLargeMode, ChargeOptions, ChargingStartScreen.
import { useState, useEffect } from 'react';
import { Zap, Scan, ArrowLeft, CheckCircle, Heart, Plus, Wallet, Building2, ScanFace } from 'lucide-react';
import { Station } from '../../../data/mockData';
import { useSync } from '../../../lib/sync';
import { FaceCheck } from '../Credit';
import { NetworkTopUp } from '../NetworkWallets';
import { promoNow, useDriverPromos } from '../../../lib/promos';
import type { Payer, ChargeGoal } from '../../../lib/api';
import { km } from '../../../lib/geo';
import { useTariffForecast, priceNow } from '../../../lib/tariff';

/** A connector as on the charger: a black tile with the socket drawn on it and its letter. */
export function ConnectorTile({ letter, dc }: { letter: string; dc: boolean }) {
  return (
    <span className="relative w-12 h-14 rounded-xl bg-[#111] grid place-items-center shrink-0" aria-hidden="true">
      <svg viewBox="0 0 24 32" width="22" height="30" fill="none" stroke="#FFC83D" strokeWidth="1.8">
        <circle cx="12" cy="11" r="8" />
        <circle cx="9" cy="9" r="1.4" fill="#FFC83D" stroke="none" />
        <circle cx="15" cy="9" r="1.4" fill="#FFC83D" stroke="none" />
        <circle cx="12" cy="14" r="1.6" fill="#FFC83D" stroke="none" />
        {dc ? <><circle cx="12" cy="25" r="5" /><circle cx="10" cy="25" r="1.2" fill="#FFC83D" stroke="none" /><circle cx="14" cy="25" r="1.2" fill="#FFC83D" stroke="none" /></> : <path d="M9 25h6" strokeLinecap="round" />}
      </svg>
      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#FFC83D] text-[#111] text-[10px] font-black grid place-items-center ring-2 ring-white">{letter}</span>
    </span>
  );
}

/** Large mode: a bigger root size scales every rem-sized text, gap and button in the app. */
export const readLarge = () => {
  try {
    return localStorage.getItem('oc-large') === '1';
  } catch {
    return false;
  }
};

export function useLargeMode() {
  const [large, setLarge] = useState(readLarge);
  useEffect(() => {
    const on = (e: Event) => setLarge(!!(e as CustomEvent<{ large: boolean }>).detail?.large);
    window.addEventListener('oc-large-change', on);
    return () => window.removeEventListener('oc-large-change', on);
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = large ? '112.5%' : '';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [large]);
}

/** What the driver wants from a charge, and when it should start. */
export type ChargeOptions = { goal?: ChargeGoal; startAt?: string };

export function ChargingStartScreen({ station, preferConnector, onBack, onConfirm, onOpenQR }: { station: Station | null; preferConnector?: string | null; onBack: () => void; onConfirm: (connectorId: string | null, payer: Payer, faceToken?: string, options?: ChargeOptions) => void | Promise<void>; onOpenQR?: () => void }) {
  const { state, sessions: portalSessions } = useSync();
  const me = portalSessions.driver;
  const balance = (me && state?.wallets[me.id]?.balance) ?? 0;
  const bonus = state?.rewards?.bonus.balance ?? 0;
  const employer = state?.employer ?? null;
  const familyWallets = (state?.family?.payers ?? []).filter(p => p.status === 'active');
  const credit = state?.credit?.enrolled ? state.credit : null;
  const [payer, setPayer] = useState<Payer>(employer && employer.left > 0 ? 'company' : 'self');
  const [faceCheck, setFaceCheck] = useState(false);
  // Networks paid directly take only the driver's balance at that network.
  const netWallet = state?.networkWallets?.find(w => w.direct && w.operatorId === (station as (Station & { operatorId?: string }) | null)?.operatorId) ?? null;
  const [netTopUp, setNetTopUp] = useState(false);
  // The station is already known (picked on the map or scanned), so the app can start it; QR is the other way.
  const [launchMode, setLaunchMode] = useState<'qr' | 'remote'>('remote');
  const [confirming, setConfirming] = useState(false);
  const driverPromos = useDriverPromos();
  const promo = station ? promoNow({ id: station.id, operatorId: (station as Station & { operatorId?: string }).operatorId }, driverPromos) : null;
  // Held by id: the station is live, so the chosen point shows its status as it is now.
  const [selectedId, setSelectedId] = useState(() => (station?.connectors.find(c => c.id === preferConnector && c.status === 'available') ?? station?.connectors.find(c => c.status === 'available') ?? station?.connectors[0])?.id ?? null);
  const selectedConnector = station?.connectors.find(c => c.id === selectedId) ?? null;
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  // The driver's own car when the account has one, otherwise a typical arrival charge.
  const currentBattery = state?.vehicles.find(v => v.driverId === me?.id)?.battery ?? 34;
  const pack = me?.car?.battery ?? 75;
  // The slider moves in steps of 5 from a round number, so 80% is a stop on it.
  const minPct = Math.min(100, Math.ceil((currentBattery + 5) / 5) * 5);
  const [targetPct, setTargetPct] = useState(() => Math.min(100, Math.max(me?.car?.chargeLimit ?? 80, minPct)));
  const [goalKind, setGoalKind] = useState<'percent' | 'sum' | 'km'>('percent');
  const [goalSum, setGoalSum] = useState(30000);
  const [goalKm, setGoalKm] = useState(100);
  const [when, setWhen] = useState<'now' | 'night'>('now');
  // Tashkent is UTC+5: the night tariff runs 23:00–07:00, i.e. 18:00–02:00 UTC.
  const utcHour = new Date().getUTCHours();
  const nightNow = utcHour >= 18 || utcHour < 2;
  const nextNight = () => {
    const d = new Date();
    d.setUTCHours(18, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };
  // What the network charges right now, its discount included.
  // Voli Plus takes its share off what the network charges (not on OCPI partners, who bill themselves).
  const plusOn = !!state?.plus?.active && !(station as Station & { ocpi?: unknown } | null)?.ocpi;
  const forecast = useTariffForecast();
  const tariffK = forecast?.hours[forecast.currentHour]?.multiplier ?? 1;
  const nightK = forecast?.hours[23]?.multiplier ?? 0.7;
  const plusK = plusOn ? 1 - (state?.plus?.discount ?? 5) / 100 : 1;
  const price = Math.round(priceNow(selectedConnector?.price ?? 1800, tariffK, promo?.percent) * plusK);
  const kwNeeded = !selectedConnector ? 0
    : goalKind === 'percent' ? Math.max(0, ((targetPct - currentBattery) / 100) * pack)
    : goalKind === 'km' ? goalKm * 0.18
    : goalSum / price;
  // A night start is billed at the band of 23:00, not of now.
  const estCost = goalKind === 'sum' ? goalSum : Math.round(kwNeeded * price * (when === 'night' ? nightK / tariffK : 1));
  const estMinutes = selectedConnector ? Math.round((kwNeeded / Math.max(3, selectedConnector.power * 0.85)) * 60) : 0;
  const goal = goalKind === 'percent' ? { kind: 'percent' as const, value: targetPct, fromPct: currentBattery } : goalKind === 'sum' ? { kind: 'sum' as const, value: goalSum } : { kind: 'km' as const, value: goalKm };
  const options = { goal, ...(when === 'night' && !nightNow ? { startAt: nextNight() } : {}) };
  // The server asks for 5 kWh up front before a start.
  const netMinimum = selectedConnector ? selectedConnector.price * 5 : 0;
  const netShort = netWallet ? Math.max(0, netMinimum - netWallet.balance) : 0;
  const canStart = !!station && selectedConnector?.status === 'available' && netShort === 0 && !confirming && !(launchMode === 'qr' && !scanned);
  const confirm = async (payerNow: Payer, faceToken?: string, opts: ChargeOptions = options) => {
    setConfirming(true);
    try {
      await onConfirm(selectedConnector?.id ?? null, payerNow, faceToken, opts);
    } finally {
      setConfirming(false);
    }
  };

  const doScan = () => {
    setScanning(true);
    setTimeout(() => { setScanning(false); setScanned(true); }, 1800);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Начало зарядки</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Launch mode */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-2">СПОСОБ ЗАПУСКА</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { mode: 'qr' as const, icon: <Scan size={20} />, label: 'QR-код' },
              { mode: 'remote' as const, icon: <Zap size={20} />, label: 'Из приложения' },
            ].map(m => (
              <button key={m.mode}
                onClick={() => {
                  if (m.mode === 'qr' && onOpenQR) { onOpenQR(); return; }
                  setLaunchMode(m.mode); setScanned(false);
                }}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${launchMode === m.mode ? 'border-sky-500 bg-sky-50 text-sky-600' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                {m.icon}
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* QR scanner */}
        {launchMode === 'qr' && (
          <div onClick={!scanned ? doScan : undefined}
            className={`rounded-2xl overflow-hidden relative cursor-pointer ${scanned ? 'bg-green-500' : 'bg-slate-900'}`}
            style={{ aspectRatio: '4/3' }}>
            {!scanned ? (
              <>
                <div className="absolute inset-5 border-2 border-sky-400/60 rounded-xl" />
                <div className="absolute top-5 left-5 w-5 h-5 border-t-2 border-l-2 border-sky-400" />
                <div className="absolute top-5 right-5 w-5 h-5 border-t-2 border-r-2 border-sky-400" />
                <div className="absolute bottom-12 left-5 w-5 h-5 border-b-2 border-l-2 border-sky-400" />
                <div className="absolute bottom-12 right-5 w-5 h-5 border-b-2 border-r-2 border-sky-400" />
                {scanning ? (
                  <div className="absolute inset-5 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-sky-400 animate-bounce" />
                  </div>
                ) : (
                  <div className="absolute inset-5 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-sky-400/50 animate-pulse" />
                  </div>
                )}
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <p className="text-white/60 text-xs">{scanning ? 'Сканирование…' : 'Нажмите для сканирования QR'}</p>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <CheckCircle size={40} className="text-white" />
                <p className="text-white font-bold">Разъём найден</p>
                <p className="text-green-100 text-xs">{selectedConnector?.type} · {selectedConnector?.power} кВт</p>
              </div>
            )}
          </div>
        )}

        {/* Connector select */}
        {(launchMode === 'remote' || scanned) && station && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2">ВЫБОР РАЗЪЁМА</p>
            <div className="space-y-2">
              {station.connectors.map(c => (
                <button key={c.id} onClick={() => c.status === 'available' && setSelectedId(c.id)}
                  disabled={c.status !== 'available'}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selectedConnector?.id === c.id ? 'border-sky-500 bg-sky-50' : c.status !== 'available' ? 'border-slate-100 opacity-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'available' ? 'bg-green-500' : c.status === 'occupied' ? 'bg-red-500' : 'bg-slate-400'}`} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-slate-800">{c.type}</p>
                    <p className="text-xs text-slate-400">{c.id} · {c.power} кВт</p>
                  </div>
                  <span className="text-right">
                    {(promo || plusOn || tariffK < 1) && <span className="block text-[11px] text-slate-400 line-through tabular-nums">{c.price.toLocaleString('ru-RU')}</span>}
                    <span className="block text-sm font-bold mono text-slate-700">{`${Math.round(priceNow(c.price, tariffK, promo?.percent) * plusK).toLocaleString('ru-RU')} сум/кВт·ч`}</span>
                    {plusOn && <span className="block text-[10px] font-bold text-[#946300]">{`Plus −${state?.plus?.discount ?? 5}%`}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Goal: the charge stops by itself when it gets there */}
        {(launchMode === 'remote' || scanned) && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2">СКОЛЬКО ЗАРЯДИТЬ</p>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl mb-3" role="radiogroup" aria-label="Цель зарядки">
              {([['percent', 'До %'], ['sum', 'На сумму'], ['km', 'На км']] as const).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={goalKind === k} onClick={() => setGoalKind(k)}
                  className={`py-1.5 rounded-lg text-xs font-semibold ${goalKind === k ? 'bg-[#FFC83D] text-[#111] shadow-sm' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
            {goalKind === 'percent' && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{`Сейчас ≈ ${currentBattery}%`}</span>
                  <span className={`text-sm font-bold mono ${targetPct >= 80 ? 'text-emerald-700' : 'text-sky-600'}`}>{targetPct}%</span>
                </div>
                <input type="range" min={minPct} max={100} step={5} value={targetPct} aria-label="Зарядить до, %"
                  onChange={e => setTargetPct(Number(e.target.value))}
                  className="w-full accent-[#FFB000] mb-3" />
              </>
            )}
            {goalKind !== 'percent' && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {(goalKind === 'sum' ? [20000, 30000, 50000, 100000] : [50, 100, 150, 250]).map(v => {
                  const active = goalKind === 'sum' ? goalSum === v : goalKm === v;
                  return (
                    <button key={v} onClick={() => (goalKind === 'sum' ? setGoalSum(v) : setGoalKm(v))} aria-pressed={active}
                      className={`py-2 rounded-xl text-sm font-semibold ${active ? 'bg-[#FFC83D] text-[#111]' : 'bg-slate-100 text-slate-700'}`}>
                      {goalKind === 'sum' ? `${v / 1000}K` : `${v} км`}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'кВт·ч', value: kwNeeded.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
                { label: promo ? `сум · −${promo.percent}%` : 'сум', value: `~${(Math.round(estCost / 100) * 100).toLocaleString('ru-RU')}` },
                { label: 'Время', value: `~${estMinutes} мин` },
              ].map(s => (
                <div key={s.label} className="bg-sky-50 rounded-xl py-2 px-1 transition-all">
                  <p className="text-sm font-bold mono text-sky-700">{s.value}</p>
                  <p className="text-xs text-sky-500">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Зарядка остановится сама, когда дойдёт до цели — пришлём уведомление.</p>

            {/* When to start */}
            {!nightNow && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">КОГДА НАЧАТЬ</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Когда начать">
                  <button role="radio" aria-checked={when === 'now'} onClick={() => setWhen('now')}
                    className={`p-2.5 rounded-xl border-2 text-left ${when === 'now' ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200'}`}>
                    <span className="block text-sm font-semibold text-slate-800">Сейчас</span>
                  </button>
                  <button role="radio" aria-checked={when === 'night'} onClick={() => setWhen('night')} disabled={payer === 'credit'}
                    className={`p-2.5 rounded-xl border-2 text-left disabled:opacity-50 ${when === 'night' ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200'}`}>
                    <span className="block text-sm font-semibold text-slate-800">Ночью в 23:00</span>
                    <span className="block text-[11px] text-emerald-700">на 30% дешевле</span>
                  </button>
                </div>
                {when === 'night' && <p className="text-[11px] text-slate-500 mt-2">Оставьте машину подключённой — зарядка начнётся сама в 23:00 по ночному тарифу. Отменить можно на экране «Зарядка».</p>}
              </div>
            )}
          </div>
        )}

        {/* Payment */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-2">ОПЛАТА</p>
          {netWallet ? (
            // A network paid directly: only the driver's balance at that network pays here.
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#FFB000] bg-amber-50">
                <span className="w-8 h-8 rounded-lg bg-white grid place-items-center text-lg" aria-hidden="true">{netWallet.logo}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{`Баланс сети ${netWallet.name}`}</p>
                  <p className="text-xs text-slate-500">{`${netWallet.balance.toLocaleString('ru-RU')} сум · деньги поступают сети напрямую`}</p>
                </div>
                <button onClick={() => setNetTopUp(true)} className="px-3 py-1.5 rounded-xl bg-[#FFC83D] text-[#111] text-xs font-semibold">Пополнить</button>
              </div>
              {netShort > 0 && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2">{`Для старта нужно ещё ${netShort.toLocaleString('ru-RU')} сум на балансе этой сети`}</p>}
            </div>
          ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Кто платит">
            <button
              role="radio"
              aria-checked={payer === 'self'}
              onClick={() => setPayer('self')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${payer === 'self' ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center"><Wallet size={16} /></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">Мой кошелёк</p>
                <p className="text-xs text-slate-400">{bonus > 0 ? `Баланс ${balance.toLocaleString('ru-RU')} сум · сначала спишется бонус ${bonus.toLocaleString('ru-RU')} сум` : `Баланс ${balance.toLocaleString('ru-RU')} сум · пополнение через Payme или Click`}</p>
              </div>
            </button>
            {employer && (
              <button
                role="radio"
                aria-checked={payer === 'company'}
                onClick={() => setPayer('company')}
                disabled={employer.left <= 0}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50 ${payer === 'company' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><Building2 size={16} /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{`За счёт компании · ${employer.org}`}</p>
                  <p className="text-xs text-slate-400">{employer.left > 0 ? `Осталось ${employer.left.toLocaleString('ru-RU')} из ${employer.limit.toLocaleString('ru-RU')} сум в этом месяце` : 'Лимит на этот месяц исчерпан'}</p>
                </div>
              </button>
            )}
            {familyWallets.map(f => (
              <button
                key={f.ownerId}
                role="radio"
                aria-checked={payer === `family:${f.ownerId}`}
                onClick={() => setPayer(`family:${f.ownerId}`)}
                disabled={f.left <= 0}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50 ${payer === `family:${f.ownerId}` ? 'border-violet-500 bg-violet-50' : 'border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center"><Heart size={16} /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{`Семейный кошелёк · ${f.name}`}</p>
                  <p className="text-xs text-slate-400">{f.left > 0 ? `Осталось ${f.left.toLocaleString('ru-RU')} из ${f.limit.toLocaleString('ru-RU')} сум в этом месяце` : 'Лимит на этот месяц исчерпан'}</p>
                </div>
              </button>
            ))}
            {credit && (
              <button
                role="radio"
                aria-checked={payer === 'credit'}
                onClick={() => { setPayer('credit'); setWhen('now'); }}
                disabled={credit.available <= 0}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50 ${payer === 'credit' ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-[#111] text-[#FFC83D] flex items-center justify-center"><ScanFace size={16} /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">В долг · подтверждение лицом</p>
                  <p className="text-xs text-slate-400">
                    {credit.overdue ? 'Есть просроченный долг — сначала погасите его' : credit.available > 0 ? `Доступно ${credit.available.toLocaleString('ru-RU')} сум · оплатить за ${credit.days} дней` : 'Лимит исчерпан'}
                  </p>
                </div>
              </button>
            )}
          </div>
          )}
        </div>
      </div>
      {netTopUp && netWallet && <NetworkTopUp wallet={netWallet} need={netMinimum} onClose={() => setNetTopUp(false)} />}

      <div className="px-4 pb-6 pt-2">
        {selectedConnector && selectedConnector.status !== 'available' && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mb-2 pg-reveal">Этот разъём уже занят — выберите свободный</p>
        )}
        <button onClick={() => (netWallet ? void confirm('self') : payer === 'credit' ? setFaceCheck(true) : void confirm(payer))}
          disabled={!canStart}
          className={`w-full rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 ${canStart ? 'text-[#111] shadow-[0_8px_22px_rgba(255,176,0,0.35)]' : 'bg-slate-200 text-slate-400'}`}
          style={canStart ? { background: 'linear-gradient(135deg,#FFD66B,#FFB000)' } : undefined}>
          {confirming ? <span className="w-[18px] h-[18px] rounded-full border-2 border-[#111]/30 border-t-[#111] animate-spin" /> : <Zap size={18} />}
          {confirming ? 'Запускаем…' : when === 'night' && !nightNow ? 'Запланировать на 23:00' : 'Подтвердить и начать зарядку'}
        </button>
      </div>
      {faceCheck && (
        <FaceCheck
          onClose={() => setFaceCheck(false)}
          onVerified={token => {
            setFaceCheck(false);
            void confirm('credit', token, { goal });
          }}
        />
      )}
    </div>
  );
}

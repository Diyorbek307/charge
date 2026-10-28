import { useEffect, useState } from 'react';
import { BatteryCharging, Clock, CheckCircle, Download, LoaderCircle, Moon, Building2, Wallet, ScanFace } from 'lucide-react';
import type { Session } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { exportPdf } from '../../lib/export';

/** Mirrors server/history.js: what a car really draws — DC tapers, AC is capped by the onboard charger. */
const effectiveKw = (power: number) => (power >= 50 ? power * 0.6 : Math.min(power, 11) * 0.95);
/** A typical usable battery; the app does not know every car's capacity. */
const PACK_KWH = 75;
const DEFAULT_TARGET = 80;

const BAND: Record<string, string> = { '0.7': 'ночной тариф ×0.7', '0.9': 'дневной тариф ×0.9', '1.25': 'пиковый тариф ×1.25' };
const bandOf = (m?: number) => (m && m !== 1 ? BAND[String(m)] ?? `×${m}` : null);
const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }) : '—');
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tashkent' });
const mmss = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The charge in progress, from the server's session: a charge point reports
 * metered energy over OCPP; otherwise the figures follow the same curve the
 * server bills by when the session stops.
 */
export function ChargingActiveScreen({ session, startBattery, packKwh, limit, onStop }: { session: Session | null; startBattery: number | null; packKwh?: number | null; limit?: number | null; onStop: () => void }) {
  const pack = packKwh || PACK_KWH;
  const goal = session?.goal;
  // A goal set at the start wins over the car's default limit.
  const TARGET = goal?.kind === 'percent' ? goal.value : limit || DEFAULT_TARGET;
  const [now, setNow] = useState(Date.now());
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center" style={{ background: '#111111' }}>
        <LoaderCircle size={28} className="text-emerald-300 animate-spin" />
        <p className="text-white font-semibold">Ждём ответа станции</p>
        <p className="text-white/50 text-sm">Станция подтверждает запуск. Если кабель не подключён — подключите его к машине.</p>
      </div>
    );
  }

  const seconds = Math.max(0, (now - Date.parse(session.start)) / 1000);
  const power = session.power ?? 50;
  const kw = effectiveKw(power);
  const metered = session.energy > 0;
  const energy = metered ? session.energy : Math.min((kw * seconds) / 3600, 80);
  const price = session.price ?? 0;
  const cost = metered && session.cost ? session.cost : energy * price;
  const from = goal?.fromPct ?? startBattery ?? 30;
  const battery = Math.min(100, from + (energy / pack) * 100);
  const etaMin = battery < TARGET ? Math.ceil(((TARGET - battery) / 100) * pack / kw * 60) : 0;
  const band = bandOf(session.multiplier);
  const C = 2 * Math.PI * 60;
  // A goal in km or money: how much is left at the current power.
  const leftKwh = goal && goal.kind !== 'percent' ? (goal.stopKwh ? goal.stopKwh - energy : ((goal.stopCost ?? 0) - cost) / (price || 1800)) : 0;
  const goalLine =
    goal && goal.kind !== 'percent'
      ? leftKwh > 0
        ? `Цель ${goal.kind === 'km' ? `на ${goal.value} км` : `на ${goal.value.toLocaleString('ru-RU')} сум`} · ~${Math.max(1, Math.ceil((leftKwh / kw) * 60))} мин · остановим сами`
        : 'Цель достигнута — останавливаем'
      : battery < TARGET
        ? `до ${TARGET}% · ~${etaMin} мин${goal ? ' · остановим сами' : ''}`
        : `${TARGET}% достигнуто — можно отключаться`;

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(170deg, #1a1a1a 0%, #111111 45%, #0a0a0a 100%)' }}>
      <div className="absolute top-0 inset-x-0 h-64 opacity-40 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(52,211,153,0.18) 0%, transparent 60%)' }} />

      <div className="relative px-4 pt-4 pb-1 flex items-center justify-between z-10">
        <span className="text-white/80 font-semibold text-sm">{session.stationName}</span>
        <span className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-emerald-300 font-semibold text-[10px] tracking-wider">ИДЁТ ЗАРЯДКА</span>
        </span>
      </div>
      <p className="relative px-4 text-white/40 text-[11px] z-10">{`${session.operator} · ${session.connector} · ${power} кВт · ${session.id}`}</p>

      <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
        <div className="relative mb-3" style={{ width: 210, height: 210 }}>
          <svg viewBox="0 0 200 200" className="w-full h-full absolute inset-0">
            <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
            <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(52,211,153,0.12)" strokeWidth="9" strokeDasharray={`${(C * TARGET) / 100} ${C}`} style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }} />
            <circle cx="100" cy="100" r="60" fill="none" stroke="#34D399" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - battery / 100)} style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <BatteryCharging size={20} className="text-emerald-300 mb-1" />
            <span className="text-[48px] font-bold text-white leading-none tabular-nums">{Math.floor(battery)}</span>
            <span className="text-emerald-400/70 text-xs font-semibold">% · оценка</span>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
          <Clock size={11} className="text-sky-400" />
          <p className="text-white/70 text-xs">{goalLine}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full">
          {[
            { label: 'кВт·ч', value: energy.toFixed(1), sub: 'получено' },
            { label: 'кВт', value: kw.toFixed(0), sub: 'мощность' },
            { label: '', value: mmss(seconds), sub: 'прошло' },
          ].map(s => (
            <div key={s.sub} className="rounded-2xl p-3 text-center border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-white/40 text-[10px] mb-0.5">{s.sub}</p>
              <p className="font-bold text-[15px] tabular-nums text-emerald-300">{s.value}</p>
              <p className="text-white/25 text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 rounded-2xl p-3 border w-full flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-white/35 text-[10px] mb-0.5">{`стоимость · ${price.toLocaleString('ru-RU')} сум/кВт·ч`}</p>
            <p className="text-white font-bold tabular-nums">{sum(cost)}</p>
          </div>
          <div className="text-right">
            {band && <p className="text-[10px] text-emerald-300 flex items-center gap-1 justify-end"><Moon size={10} />{band}</p>}
            <p className="text-white/50 text-[11px] flex items-center gap-1 justify-end">{session.corporate ? <><Building2 size={11} />за счёт компании</> : session.credit ? <><ScanFace size={11} />в долг</> : session.familyOwner ? <><Wallet size={11} />из семейного кошелька</> : session.direct ? <><Wallet size={11} />с баланса сети</> : <><Wallet size={11} />из кошелька</>}</p>
          </div>
        </div>
        <p className="mt-2 text-white/30 text-[10px] text-center">{metered ? 'Энергия — по счётчику станции.' : `Процент — оценка для батареи ${pack} кВт·ч; к оплате — по энергии.`}</p>
      </div>

      <div className="relative px-4 pb-6 pt-2 z-10">
        <button
          onClick={() => { setStopping(true); onStop(); }}
          disabled={stopping}
          className="w-full text-white rounded-2xl py-4 font-bold text-[15px] active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
        >
          {stopping && <LoaderCircle size={16} className="animate-spin" />}
          Остановить зарядку
        </button>
      </div>
    </div>
  );
}

/** The receipt of the charge that just ended, with a rating that goes to the station. */
export function ChargingDoneScreen({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const { actions, state } = useSync();
  const [stars, setStars] = useState(session?.rating ?? 0);
  const [sent, setSent] = useState(!!session?.rating);
  const [error, setError] = useState('');

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center bg-white">
        <CheckCircle size={40} className="text-emerald-500" />
        <p className="font-bold text-slate-900">Зарядка завершена</p>
        <button onClick={onClose} className="bg-sky-500 text-white rounded-2xl px-6 py-3 font-semibold text-sm">Готово</button>
      </div>
    );
  }

  const minutes = Math.max(1, Math.round((Date.parse(session.end ?? session.start) - Date.parse(session.start)) / 60000));
  const band = bandOf(session.multiplier);
  const employer = state?.employer;
  const payer = session.corporate ? `Корпоративный счёт${employer ? ` · ${employer.org}` : ''}` : session.credit ? 'В долг — оплатить в течение 14 дней' : session.familyOwner ? 'Семейный кошелёк' : session.direct ? `Баланс сети ${session.operator}` : 'Кошелёк';
  const rows: [string, string][] = [
    ['Станция', session.stationName],
    ['Оператор', session.operator],
    ['Разъём', `${session.connector} · до ${session.power ?? '—'} кВт`],
    ['Дата', day(session.start)],
    ['Начало — конец', `${clock(session.start)} — ${clock(session.end)}`],
    ['Длительность', `${minutes} мин`],
    ['Энергия', `${session.energy} кВт·ч`],
    ['Цена', `${(session.price ?? 0).toLocaleString('ru-RU')} сум/кВт·ч${band ? ` (${band})` : ''}`],
    ['Оплата', payer],
  ];

  const rate = async (n: number) => {
    setStars(n);
    setError('');
    try {
      await actions.rateSession('driver', session.id, n);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 pt-6 pb-6 text-white text-center">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle size={30} /></div>
        <h2 className="text-xl font-bold">Зарядка завершена</h2>
        <p className="text-emerald-100 text-sm mt-0.5">{session.stationName}</p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { value: String(session.energy), unit: ' кВт·ч', label: 'заряжено' },
            { value: Math.round(session.cost).toLocaleString('ru-RU'), unit: ' сум', label: 'списано' },
            { value: String(minutes), unit: ' мин', label: 'время' },
          ].map(s => (
            <div key={s.label} className="bg-white/15 rounded-2xl py-2">
              <p className="text-lg font-bold tabular-nums">{s.value}<span className="text-xs font-normal">{s.unit}</span></p>
              <p className="text-emerald-100 text-xs">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-emerald-100 text-xs mt-3">{`≈ +${Math.round(session.energy / 0.18)} км запаса хода`}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">ЭЛЕКТРОННЫЙ ЧЕК</p>
              <p className="text-xs text-slate-400 font-mono">{session.id}</p>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Оплачено</span>
          </div>
          <div className="p-4 space-y-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <span className="text-slate-400">{k}</span>
                <span className="font-medium text-slate-700 text-right">{v}</span>
              </div>
            ))}
            <div className="flex justify-between items-center border-t border-dashed border-slate-200 pt-2 mt-1">
              <span className="text-sm font-bold text-slate-900">Итого</span>
              <span className="text-base font-bold text-sky-600 tabular-nums">{sum(session.cost)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          {sent ? (
            <p className="text-sm font-semibold text-sky-700">{`Спасибо! Ваша оценка ${stars}/5 учтена в рейтинге станции`}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-700 mb-2">Оцените станцию</p>
              <div className="flex justify-center gap-2" role="radiogroup" aria-label="Оценка станции">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => rate(n)} role="radio" aria-checked={stars === n} aria-label={`${n} из 5`} className={`text-3xl transition-transform active:scale-90 ${n <= stars ? 'text-amber-400' : 'text-slate-200'}`}>★</button>
                ))}
              </div>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </>
          )}
        </div>
      </div>

      <div className="px-4 pb-6 pt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => void exportPdf(`receipt-${session.id}`, `Чек ${session.id}`, ['Параметр', 'Значение'], [...rows, ['Итого', sum(session.cost)]])}
          className="border border-slate-200 bg-white text-slate-700 rounded-2xl py-3 font-medium text-sm flex items-center justify-center gap-1.5"
        >
          <Download size={14} />Чек PDF
        </button>
        <button onClick={onClose} className="bg-sky-500 text-white rounded-2xl py-3 font-semibold text-sm">Готово</button>
      </div>
    </div>
  );
}

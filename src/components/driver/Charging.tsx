import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, CheckCircle, Download, LoaderCircle, Moon, Building2, Wallet, ScanFace, Share2 } from 'lucide-react';
import type { Session } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { exportPdf } from '../../lib/export';
import WhileCharging from './WhileCharging';

/** Mirrors server/history.js: what a car really draws — DC tapers, AC is capped by the onboard charger. */
const effectiveKw = (power: number) => (power >= 50 ? power * 0.6 : Math.min(power, 11) * 0.95);
/** A typical usable battery; the app does not know every car's capacity. */
const PACK_KWH = 75;
const DEFAULT_TARGET = 80;

const BAND: Record<string, string> = { '0.7': 'ночной тариф ×0,7', '0.9': 'дневной тариф ×0,9', '1.25': 'пиковый тариф ×1,25' };
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
export function ChargingActiveScreen({ session, startBattery, packKwh, limit, onStop, onLeave }: { session: Session | null; startBattery: number | null; packKwh?: number | null; limit?: number | null; onStop: () => void; onLeave?: () => void }) {
  const pack = packKwh || PACK_KWH;
  const goal = session?.goal;
  // A goal set at the start wins over the car's default limit.
  const TARGET = goal?.kind === 'percent' ? goal.value : limit || DEFAULT_TARGET;
  const [now, setNow] = useState(Date.now());
  const [stopping, setStopping] = useState(false);
  // A stray tap must not end a charge: the first tap asks, the second stops.
  const [askStop, setAskStop] = useState(false);
  useEffect(() => {
    if (!askStop) return;
    const t = setTimeout(() => setAskStop(false), 5000);
    return () => clearTimeout(t);
  }, [askStop]);
  const [shared, setShared] = useState<string | null>(null);
  const { actions, state } = useSync();
  /** The phone's share sheet where there is one; otherwise the link is copied. */
  const share = async () => {
    if (!session) return;
    try {
      const { token } = await actions.shareSession(session.id);
      const url = `${window.location.origin}/?share=${token}`;
      if (navigator.share) await navigator.share({ title: 'Voli', text: `Машина заряжается · ${session.stationName}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared('Ссылка скопирована — отправьте её близким');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setShared('Не удалось поделиться');
    }
    setTimeout(() => setShared(null), 3000);
  };
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
        {onLeave && (
          <button onClick={onLeave} className="mt-4 px-5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white/85 text-sm font-semibold">
            Свернуть — пришлём уведомление
          </button>
        )}
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

  const payer = session.corporate ? <><Building2 size={11} />за счёт компании</> : session.credit ? <><ScanFace size={11} />в долг</> : session.familyOwner ? <><Wallet size={11} />из семейного кошелька</> : session.direct ? <><Wallet size={11} />с баланса сети</> : <><Wallet size={11} />из кошелька</>;
  const minutes = Math.floor(seconds / 60);

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 18%, #2a2208 0%, #141414 42%, #0a0a0a 100%)' }}>
      <div className="relative px-3 pt-3 flex items-center justify-between z-10">
        <button onClick={onLeave} aria-label="Свернуть" className={`w-10 h-10 rounded-full grid place-items-center text-white/85 hover:bg-white/10 ${onLeave ? '' : 'invisible'}`}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-white font-bold text-[17px]">Идёт зарядка</h1>
        <button onClick={share} aria-label="Поделиться" className="w-10 h-10 rounded-full grid place-items-center text-white/85 hover:bg-white/10">
          <Share2 size={19} />
        </button>
      </div>
      <p className="relative text-center text-white/45 text-[11px] -mt-0.5 z-10 truncate px-12">{`${session.stationName} · ${session.connector} · ${power} кВт`}</p>
      {shared && <p role="status" className="relative text-center text-xs text-[#FFC83D] mt-1 z-10">{shared}</p>}

      <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-4">
        <ChargeHero battery={battery} target={TARGET} />

        <p className="text-center text-white font-extrabold text-[56px] leading-none tabular-nums tracking-tight mt-3">
          {Math.floor(battery)}<span className="text-[34px] align-top ml-0.5">%</span>
        </p>
        <div className="mt-2.5 mx-auto w-fit flex items-center gap-1.5 bg-white/[0.06] border border-white/10 px-3 py-1.5 rounded-full">
          <Clock size={11} className="text-[#FFC83D]" />
          <p className="text-white/70 text-xs">{goalLine}</p>
        </div>

        <div className="mt-6 grid grid-cols-3 text-center">
          {[
            { label: 'Мощность', value: `${kw.toFixed(0)}`, unit: 'кВт' },
            { label: 'Энергия', value: energy.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), unit: 'кВт·ч' },
            { label: 'Время', value: minutes < 60 ? String(minutes) : mmss(seconds).slice(0, 5), unit: minutes < 60 ? 'мин' : 'ч:мин' },
          ].map((s, i) => (
            <div key={s.label} className={i ? 'border-l border-white/10' : ''}>
              <p className="text-white/45 text-[11px]">{s.label}</p>
              <p className="text-white font-bold text-[17px] tabular-nums mt-0.5">{s.value} <span className="text-[12px] font-semibold text-white/60">{s.unit}</span></p>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <p className="text-white/45 text-[12px]">{metered ? 'Стоимость сейчас' : 'Ориентировочная стоимость'}</p>
          <p className="text-white font-extrabold text-[24px] tabular-nums mt-0.5">{sum(cost)}</p>
          <p className="text-white/40 text-[11px] mt-1 flex items-center justify-center gap-1.5 flex-wrap">
            {`${price.toLocaleString('ru-RU')} сум/кВт·ч`}
            {band && <span className="inline-flex items-center gap-1 text-[#FFC83D]"><Moon size={10} />{band}</span>}
            <span className="inline-flex items-center gap-1">· {payer}</span>
          </p>
        </div>

        {state?.platform?.features.places !== false && <div className="mt-5"><WhileCharging stationId={session.stationId} dark minutes={goal?.kind === 'percent' || !goal ? etaMin || undefined : undefined} /></div>}
        <p className="mt-3 mb-2 text-white/30 text-[10px] text-center">{metered ? 'Энергия — по счётчику станции.' : `Процент — оценка для батареи ${pack} кВт·ч; к оплате — по энергии.`}</p>
      </div>

      <div className="relative px-4 pb-6 pt-3 z-10">
        {askStop && !stopping ? (
          <div className="grid grid-cols-2 gap-2 pg-reveal">
            <button onClick={() => setAskStop(false)} className="rounded-2xl py-4 font-semibold text-[15px] text-white/85 bg-white/[0.06] border border-white/10">Продолжить</button>
            <button onClick={() => { setStopping(true); onStop(); }} className="rounded-2xl py-4 font-bold text-[15px] text-white bg-red-500/90">Да, завершить</button>
          </div>
        ) : (
          <button
            onClick={() => setAskStop(true)}
            disabled={stopping}
            className="w-full text-[#111] rounded-2xl py-4 font-bold text-[16px] active:scale-[0.98] transition-transform disabled:opacity-60 inline-flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(90deg, #FFE27A, #FFC83D 55%, #F5B000)', boxShadow: '0 8px 28px rgba(255,200,61,0.28)' }}
          >
            {stopping && <LoaderCircle size={16} className="animate-spin" />}
            {stopping ? 'Завершаем…' : 'Завершить зарядку'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The car in yellow light with the battery over it: the fill is the charge so
 * far, a dashed frame marks where it will stop, and a shine runs through while
 * energy flows.
 */
function ChargeHero({ battery, target }: { battery: number; target: number }) {
  return (
    <div className="relative mt-4 mx-auto max-w-[340px]" aria-hidden="true">
      <svg viewBox="0 0 320 120" className="w-full block" style={{ filter: 'drop-shadow(0 0 10px rgba(255,200,61,.35))' }}>
        <defs>
          <linearGradient id="pg-car-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFC83D" stopOpacity=".05" />
            <stop offset=".5" stopColor="#FFC83D" stopOpacity=".16" />
            <stop offset="1" stopColor="#FFC83D" stopOpacity=".05" />
          </linearGradient>
        </defs>
        <path d="M14 86 C12 76 22 68 44 65 L86 60 C106 42 134 30 172 28 C206 27 232 36 258 54 L292 60 C306 63 312 70 311 80 L310 88 C309 92 306 94 302 94 L284 94 A21 21 0 0 0 242 94 L96 94 A21 21 0 0 0 54 94 L22 94 C17 94 14 91 14 86 Z" fill="url(#pg-car-body)" stroke="#FFD66B" strokeOpacity=".75" strokeWidth="1.6" />
        <path d="M98 60 C116 46 140 38 170 37 C196 37 216 43 238 57 Z" fill="none" stroke="#FFD66B" strokeOpacity=".5" strokeWidth="1.3" />
        <path d="M168 37 L166 60" stroke="#FFD66B" strokeOpacity=".4" strokeWidth="1.2" />
        <path d="M290 66 L306 70" stroke="#FFF3C4" strokeWidth="2.4" strokeLinecap="round" />
        {[75, 263].map(x => (
          <g key={x}>
            <circle cx={x} cy="96" r="17" fill="#0d0d0d" stroke="#FFD66B" strokeOpacity=".7" strokeWidth="1.6" />
            <circle cx={x} cy="96" r="7" fill="none" stroke="#FFD66B" strokeOpacity=".45" strokeWidth="1.2" />
          </g>
        ))}
        <path d="M30 116 H290" stroke="#FFC83D" strokeOpacity=".35" strokeWidth="1" />
      </svg>

      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[62%] flex items-center">
        <div className="relative flex-1 h-[68px] rounded-[18px] border-[3px] border-white/85 bg-black/70 p-[5px] shadow-[0_0_24px_rgba(255,200,61,.25)]">
          <div className="absolute top-[5px] bottom-[5px] rounded-[11px] border border-dashed border-[#FFC83D]/40" style={{ left: 5, width: `calc((100% - 10px) * ${target / 100})` }} />
          <div className="relative h-full rounded-[11px] overflow-hidden transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(4, battery)}%`, background: 'linear-gradient(90deg, #C98A00, #FFC83D 60%, #FFE27A)' }}>
            <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 22%, rgba(0,0,0,.18) 22% 23%)' }} />
            <div className="absolute inset-0 pg-flow" />
          </div>
        </div>
        <span className="w-[7px] h-[24px] rounded-r-md bg-white/85 ml-[2px]" />
      </div>

      <div className="mt-3 mx-auto w-[62%] h-[5px] rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-[#FFC83D] transition-[width] duration-1000 ease-linear" style={{ width: `${battery}%`, boxShadow: '0 0 10px rgba(255,200,61,.7)' }} />
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
  const payer = session.corporate ? `Корпоративный счёт${employer ? ` · ${employer.org}` : ''}` : session.credit ? `В долг — оплатить в течение ${state?.credit?.days ?? 14} дней` : session.familyOwner ? 'Семейный кошелёк' : session.direct ? `Баланс сети ${session.operator}` : 'Кошелёк';
  const rows: [string, string][] = [
    ['Станция', session.stationName],
    ['Оператор', session.operator],
    ['Разъём', `${session.connector} · до ${session.power ?? '—'} кВт`],
    ['Дата', day(session.start)],
    ['Начало — конец', `${clock(session.start)} — ${clock(session.end)}`],
    ['Длительность', `${minutes} мин`],
    ['Энергия', `${session.energy} кВт·ч`],
    ['Цена', `${(session.price ?? 0).toLocaleString('ru-RU')} сум/кВт·ч${band ? ` (${band})` : ''}`],
    ...(session.promo ? [['Скидка сети', `−${session.promo.percent}% · ${session.promo.title}`] as [string, string]] : []),
    ...(session.bonusUsed ? [['Бонусом Voli', `−${sum(session.bonusUsed)}`] as [string, string], ['С кошелька', sum(session.cost - session.bonusUsed)] as [string, string]] : []),
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
      <div className="px-4 pt-6 pb-6 text-white text-center" style={{ background: 'radial-gradient(ellipse at 50% 0%, #2a2208 0%, #141414 60%, #0a0a0a 100%)' }}>
        <div className="w-14 h-14 bg-[#FFC83D] text-[#111] rounded-full flex items-center justify-center mx-auto mb-3 pg-pop" style={{ boxShadow: '0 0 28px rgba(255,200,61,.45)' }}><CheckCircle size={30} /></div>
        <h2 className="text-xl font-bold">Зарядка завершена</h2>
        <p className="text-white/60 text-sm mt-0.5">{session.stationName}</p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { value: String(session.energy), unit: ' кВт·ч', label: 'заряжено' },
            { value: Math.round(session.cost).toLocaleString('ru-RU'), unit: ' сум', label: 'списано' },
            { value: String(minutes), unit: ' мин', label: 'время' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.07] border border-white/10 rounded-2xl py-2">
              <p className="text-lg font-bold tabular-nums">{s.value}<span className="text-xs font-normal">{s.unit}</span></p>
              <p className="text-white/50 text-xs">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[#FFC83D] text-xs mt-3">{`≈ +${Math.round(session.energy / 0.18)} км запаса хода`}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">ЭЛЕКТРОННЫЙ ЧЕК</p>
              <p className="text-xs text-slate-400 font-mono">{session.id}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${session.credit ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{session.credit ? 'К оплате' : session.corporate ? 'Счёт компании' : 'Оплачено'}</span>
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
              <span className="text-base font-extrabold text-slate-900 tabular-nums">{sum(session.cost)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          {sent ? (
            <p className="text-sm font-semibold text-slate-800 pg-reveal">{`Спасибо! Ваша оценка ${stars}/5 учтена в рейтинге станции`}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-700 mb-2">Оцените станцию</p>
              <div className="flex justify-center gap-2" role="radiogroup" aria-label="Оценка станции">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => rate(n)} role="radio" aria-checked={stars === n} aria-label={`${n} из 5`} className={`text-3xl transition-transform active:scale-90 hover:scale-110 ${n <= stars ? 'text-amber-400 pg-pop' : 'text-slate-200'}`} style={n <= stars ? { animationDelay: `${n * 40}ms` } : undefined}>★</button>
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
        <button onClick={onClose} className="text-[#111] rounded-2xl py-3 font-bold text-sm" style={{ background: 'linear-gradient(90deg, #FFE27A, #FFC83D 55%, #F5B000)' }}>Готово</button>
      </div>
    </div>
  );
}

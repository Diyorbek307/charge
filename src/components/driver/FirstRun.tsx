import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, CreditCard, FileText, Globe, MapPin, Navigation, Shield, UserCheck, X, Zap } from 'lucide-react';
import { BRAND } from '../../brand';
import { LANGS, useI18n, type Lang } from '../../lib/i18n';
import { usePlatform } from '../../lib/platform';
import { geoPermission, locate } from '../../lib/geo';
import { readFirstRun, saveFirstRun } from '../../lib/firstRun';
import { LEGAL } from '../../landing/legal';

type Step = 'intro' | 'language' | 'location' | 'notify' | 'consent';

const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

/**
 * The first launch of the driver app, before any account: what the app does,
 * the language (the device's, unless the driver picks another), location and
 * notifications — each asked on its own screen that says why — and the user
 * agreement. A new edition of the agreement brings back only its screen.
 */
export default function FirstRun({ only }: { only?: 'consent' }) {
  const { onboarding } = usePlatform();
  const [steps, setSteps] = useState<Step[]>(() => (only ? ['consent'] : [...(onboarding.intro ? ['intro' as const] : []), 'language', 'location', 'notify', 'consent']));
  const [i, setI] = useState(0);
  const [push, setPush] = useState(false);
  const step = steps[i];

  // A permission already given or refused needs no screen of its own.
  useEffect(() => {
    if (only) return;
    let alive = true;
    void (async () => {
      const geo = onboarding.askLocation && 'geolocation' in navigator ? await geoPermission() : 'denied';
      const canPush = onboarding.askPush && pushSupported() && Notification.permission === 'default';
      if (pushSupported() && Notification.permission === 'granted') setPush(true);
      if (!alive) return;
      setSteps(s => s.filter(x => (x !== 'location' || geo === 'prompt' || geo === 'unknown') && (x !== 'notify' || canPush)));
    })();
    return () => {
      alive = false;
    };
  }, [only, onboarding.askLocation, onboarding.askPush]);

  const next = () => setI(n => Math.min(n + 1, steps.length - 1));
  const back = () => setI(n => Math.max(n - 1, 0));
  const finish = (marketing: boolean) => {
    const prev = readFirstRun();
    saveFirstRun({ version: onboarding.consentVersion, marketing, push: push || !!prev?.push, at: new Date().toISOString() });
  };

  return (
    <div className="absolute inset-0 z-[10000] bg-white flex flex-col pg-fr" role="dialog" aria-modal="true" aria-label={`Добро пожаловать в ${BRAND.name}`} style={{ fontFamily: 'Inter, sans-serif' }}>
      {steps.length > 1 && (
        <div className="px-4 pt-4 pb-1 flex items-center gap-3 shrink-0">
          <button onClick={back} aria-label="Назад" className={`w-9 h-9 rounded-xl grid place-items-center text-slate-500 hover:bg-slate-100 transition-opacity ${i === 0 ? 'opacity-0 pointer-events-none' : ''}`}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 flex gap-1.5" aria-hidden="true">
            {steps.map((s, k) => (
              <span key={s} className="h-1 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full bg-[#FFC83D] rounded-full transition-[width] duration-500 ease-out" style={{ width: k <= i ? '100%' : '0%' }} />
              </span>
            ))}
          </div>
          <span className="w-9 text-right text-[11px] font-semibold text-slate-400 tabular-nums">{`${i + 1}/${steps.length}`}</span>
        </div>
      )}
      <div key={step} className="flex-1 min-h-0 flex flex-col pg-fr-step">
        {step === 'intro' && <Intro onDone={next} />}
        {step === 'language' && <Language onDone={next} />}
        {step === 'location' && <Location onDone={next} />}
        {step === 'notify' && <Notify onDone={yes => { setPush(yes); next(); }} />}
        {step === 'consent' && <Consent renewed={!!only} onAccept={finish} />}
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full h-14 rounded-2xl bg-[#FFC83D] text-[#111] font-bold text-base flex items-center justify-center gap-2 shadow-[0_8px_22px_rgba(255,176,0,0.35)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:shadow-none">
      {children}
    </button>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0 space-y-2">{children}</div>;
}

// ── 1. What the app does ──

const SLIDES = [
  {
    scene: <MapScene />,
    title: 'Все станции — в одном приложении',
    text: 'Сети разных операторов на одной карте: свободные разъёмы, цены и мощность в реальном времени.',
  },
  {
    scene: <QrScene />,
    title: 'QR — и зарядка пошла',
    text: 'Наведите камеру на код на станции. Ход зарядки, кВт·ч и сумма — на экране, даже на заблокированном.',
  },
  {
    scene: <WalletScene />,
    title: 'Честная цена, один кошелёк',
    text: 'Платите только за полученные кВт·ч. Ночью дешевле, бонусы за поездки, пополнение через Payme, Click, Uzum и Humo.',
  },
];

function Intro({ onDone }: { onDone: () => void }) {
  const [k, setK] = useState(0);
  const touch = useRef<number | null>(null);
  const last = k === SLIDES.length - 1;
  const go = (n: number) => setK(Math.max(0, Math.min(SLIDES.length - 1, n)));
  // Slides move on by themselves, until the driver touches them.
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || last) return;
    const t = setTimeout(() => setK(n => n + 1), 5200);
    return () => clearTimeout(t);
  }, [auto, k, last]);

  return (
    <>
      <div className="px-5 flex justify-end shrink-0">
        <button onClick={onDone} className="text-sm text-slate-400 font-medium px-3 py-1.5 rounded-xl hover:bg-slate-100">Пропустить</button>
      </div>
      <div
        className="flex-1 min-h-0 overflow-hidden"
        onPointerDown={e => { touch.current = e.clientX; setAuto(false); }}
        onPointerUp={e => {
          if (touch.current === null) return;
          const dx = e.clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 40) go(k + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="h-full flex transition-transform duration-500 ease-[cubic-bezier(.32,.72,0,1)]" style={{ transform: `translateX(-${k * 100}%)` }}>
          {SLIDES.map((s, n) => (
            <div key={s.title} className="w-full h-full shrink-0 flex flex-col items-center justify-center px-7 text-center" aria-hidden={n !== k}>
              <div className={`mb-8 ${n === k ? 'pg-fr-scene' : ''}`}>{s.scene}</div>
              <h1 className="text-[26px] font-extrabold text-[#111] leading-tight tracking-tight mb-3">{s.title}</h1>
              <p className="text-[15px] text-slate-500 leading-relaxed max-w-[300px]">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
      <Footer>
        <div className="flex justify-center gap-1.5 pb-3" role="tablist" aria-label="Слайды">
          {SLIDES.map((s, n) => (
            <button key={s.title} role="tab" aria-selected={n === k} aria-label={`Слайд ${n + 1}`} onClick={() => { setAuto(false); go(n); }}
              className={`h-2 rounded-full transition-all duration-300 ${n === k ? 'w-6 bg-[#111]' : 'w-2 bg-slate-200'}`} />
          ))}
        </div>
        <PrimaryButton onClick={() => (last ? onDone() : (setAuto(false), go(k + 1)))}>
          {last ? 'Начать' : 'Далее'}<ChevronRight size={18} />
        </PrimaryButton>
      </Footer>
    </>
  );
}

function MapScene() {
  return (
    <svg width="230" height="190" viewBox="0 0 230 190" fill="none" aria-hidden="true">
      <rect x="15" y="10" width="200" height="170" rx="28" fill="#F5F5F0" />
      <path d="M15 120c40-18 70 10 110-6s60-40 90-30" stroke="#E4E4DD" strokeWidth="14" strokeLinecap="round" />
      <path d="M70 10v170M15 70h200" stroke="#ECECE6" strokeWidth="6" />
      {[
        [60, 64, '#16A34A', 0],
        [150, 52, '#16A34A', 0.15],
        [112, 112, '#FFC83D', 0.3],
        [176, 128, '#EF4444', 0.45],
        [44, 136, '#16A34A', 0.6],
      ].map(([x, y, c, d]) => (
        <g key={`${x}`} className="pg-fr-pin" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${Number(y) + 18}px` }}>
          <path d={`M${x} ${Number(y) + 18}c-10-12-14-18-14-25a14 14 0 0 1 28 0c0 7-4 13-14 25z`} fill={String(c)} />
          <circle cx={Number(x)} cy={Number(y) - 7} r="5.5" fill="#fff" />
        </g>
      ))}
      <g className="pg-fr-me">
        <circle cx="100" cy="76" r="22" fill="#2563EB" opacity=".14" className="pg-fr-me-halo" />
        <circle cx="100" cy="76" r="8" fill="#2563EB" stroke="#fff" strokeWidth="3" />
      </g>
    </svg>
  );
}

function QrScene() {
  return (
    <svg width="230" height="190" viewBox="0 0 230 190" fill="none" aria-hidden="true">
      <rect x="24" y="30" width="62" height="130" rx="14" fill="#16161A" />
      <rect x="32" y="40" width="46" height="38" rx="8" fill="#FFC83D" />
      <path d="M57 48l-8 12h6l-2 10 9-13h-6z" fill="#16161A" />
      <rect x="38" y="92" width="34" height="34" rx="4" fill="#fff" />
      {[0, 1, 2].flatMap(r => [0, 1, 2].map(c => ((r + c) % 2 === 0 ? <rect key={`${r}${c}`} x={41 + c * 10} y={95 + r * 10} width="8" height="8" rx="1.5" fill="#16161A" /> : null)))}
      <g className="pg-fr-phone">
        <rect x="118" y="22" width="88" height="150" rx="20" fill="#111" />
        <rect x="124" y="30" width="76" height="134" rx="15" fill="#fff" />
        <rect x="140" y="58" width="44" height="44" rx="8" stroke="#FFC83D" strokeWidth="3" strokeDasharray="10 8" />
        <rect x="140" y="62" width="44" height="3" rx="1.5" fill="#FFB000" className="pg-fr-scan" />
        <circle cx="162" cy="134" r="16" stroke="#F0F0EA" strokeWidth="5" />
        <circle cx="162" cy="134" r="16" stroke="#16A34A" strokeWidth="5" strokeLinecap="round" strokeDasharray="100" className="pg-fr-ring" transform="rotate(-90 162 134)" />
        <path d="M164 126l-6 9h5l-2 7 7-10h-5z" fill="#16A34A" />
      </g>
    </svg>
  );
}

function WalletScene() {
  return (
    <svg width="230" height="190" viewBox="0 0 230 190" fill="none" aria-hidden="true">
      {[0, 1, 2].map(n => (
        <g key={n} className="pg-fr-coin" style={{ animationDelay: `${n * 0.35}s` }}>
          <circle cx={92 + n * 24} cy="52" r="15" fill="#FFC83D" stroke="#E3A400" strokeWidth="3" />
          <path d={`M${94 + n * 24} 44l-6 9h5l-2 7 7-10h-5z`} fill="#8A5B00" />
        </g>
      ))}
      <rect x="40" y="70" width="150" height="96" rx="20" fill="#16161A" />
      <rect x="40" y="70" width="150" height="26" rx="13" fill="#2A2A30" />
      <rect x="146" y="108" width="44" height="30" rx="10" fill="#FFC83D" />
      <circle cx="160" cy="123" r="5" fill="#16161A" />
      <rect x="56" y="112" width="58" height="8" rx="4" fill="#3A3A42" />
      <rect x="56" y="128" width="38" height="8" rx="4" fill="#3A3A42" />
      <g className="pg-fr-moon">
        <circle cx="190" cy="40" r="16" fill="#EDE9FE" />
        <path d="M196 30a12 12 0 1 0 2 20 10 10 0 0 1-2-20z" fill="#7C3AED" />
      </g>
    </svg>
  );
}

// ── 2. Language ──

/** Drawn, not emoji: Windows and many Android skins show flag emoji as two letters. */
const FLAGS: Record<Lang, ReactNode> = {
  uz: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="6.4" fill="#0099B5" />
      <rect y="13.6" width="30" height="6.4" fill="#1EB53A" />
      <rect y="6.4" width="30" height=".6" fill="#CE1126" />
      <rect y="13" width="30" height=".6" fill="#CE1126" />
      <circle cx="5.6" cy="3.2" r="2.2" fill="#fff" />
      <circle cx="6.5" cy="3.2" r="2" fill="#0099B5" />
    </>
  ),
  ru: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0039A6" />
      <rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
    </>
  ),
  en: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#C8102E" strokeWidth="1.4" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.4" />
    </>
  ),
};

function Language({ onDone }: { onDone: () => void }) {
  const { lang, setLang } = useI18n();
  const device = (typeof navigator !== 'undefined' ? navigator.language : 'ru').slice(0, 2).toLowerCase();
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6">
        <div className="w-14 h-14 rounded-2xl bg-[#FFF4D1] text-[#8A5B00] grid place-items-center mb-5 pg-fr-pop"><Globe size={26} /></div>
        <h1 className="text-[26px] font-extrabold text-[#111] leading-tight tracking-tight">Язык приложения</h1>
        <p className="text-[15px] text-slate-500 mt-2 mb-6 leading-relaxed">Мы выбрали язык вашего устройства. Его можно сменить в любой момент в настройках.</p>
        <div className="space-y-2.5 pg-stagger" role="radiogroup" aria-label="Язык">
          {LANGS.map(l => {
            const on = lang === l.id;
            return (
              <button key={l.id} role="radio" aria-checked={on} onClick={() => setLang(l.id)}
                className={`w-full flex items-center gap-4 px-4 h-[68px] rounded-2xl border-2 text-left transition-all active:scale-[0.99] ${on ? 'border-[#111] bg-white shadow-[0_6px_18px_rgba(17,17,17,0.08)]' : 'border-slate-100 bg-slate-50'}`}>
                <svg width="34" height="23" viewBox="0 0 30 20" aria-hidden="true" className="rounded-[5px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] shrink-0">{FLAGS[l.id]}</svg>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-bold text-[#111]" data-no-translate>{l.full}</span>
                  {device === l.id && <span className="block text-xs text-slate-500">Язык устройства</span>}
                </span>
                <span className={`w-6 h-6 rounded-full grid place-items-center transition-all ${on ? 'bg-[#FFC83D] text-[#111] scale-100' : 'border-2 border-slate-200 scale-90'}`}>
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Footer>
        <PrimaryButton onClick={onDone}>Продолжить<ChevronRight size={18} /></PrimaryButton>
      </Footer>
    </>
  );
}

// ── 3. Location ──

function Permission({ icon, title, text, points, allow, onAllow, onLater, note }: {
  icon: ReactNode; title: string; text: string; points: string[]; allow: string; onAllow: () => void; onLater: () => void; note?: string | null;
}) {
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6 flex flex-col">
        <div className="self-center my-6 relative w-36 h-36 grid place-items-center">
          <span className="absolute inset-0 rounded-full bg-[#FFC83D]/25 pg-fr-wave" />
          <span className="absolute inset-0 rounded-full bg-[#FFC83D]/25 pg-fr-wave" style={{ animationDelay: '1.1s' }} />
          <span className="relative w-24 h-24 rounded-[30px] bg-[#FFC83D] text-[#111] grid place-items-center shadow-[0_12px_30px_rgba(255,176,0,0.4)] pg-fr-pop">{icon}</span>
        </div>
        <h1 className="text-[26px] font-extrabold text-[#111] leading-tight tracking-tight text-center">{title}</h1>
        <p className="text-[15px] text-slate-500 mt-2 mb-5 leading-relaxed text-center">{text}</p>
        <ul className="space-y-2 pg-stagger">
          {points.map(p => (
            <li key={p} className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-[#111] text-[#FFC83D] grid place-items-center shrink-0"><Check size={12} strokeWidth={3} /></span>
              <span className="text-sm text-slate-700 leading-snug">{p}</span>
            </li>
          ))}
        </ul>
        {note && <p role="status" className="mt-4 text-xs text-center text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 pg-reveal">{note}</p>}
      </div>
      <Footer>
        <PrimaryButton onClick={onAllow}>{allow}</PrimaryButton>
        <button onClick={onLater} className="w-full h-11 text-sm font-semibold text-slate-500 rounded-2xl hover:bg-slate-50">Не сейчас</button>
      </Footer>
    </>
  );
}

function Location({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const allow = async () => {
    if (busy) return;
    if (note) return onDone();
    setBusy(true);
    const fix = await locate(12_000);
    setBusy(false);
    if (fix) onDone();
    else setNote('Доступ не дан — ничего страшного. Карта откроется на вашем городе, а включить геолокацию можно в настройках устройства.');
  };
  return (
    <Permission
      icon={<Navigation size={40} className="fill-[#111]" />}
      title="Станции рядом с вами"
      text="Разрешите доступ к геолокации — карта откроется там, где вы, а расстояние и время до станции будут точными."
      points={['Ближайшие свободные станции и путь до них по дорогам', 'Навигатор с голосом и предупреждениями о камерах', 'Используется, только пока приложение открыто']}
      allow={busy ? 'Ждём ответ устройства…' : note ? 'Продолжить' : 'Разрешить геолокацию'}
      onAllow={() => void allow()}
      onLater={onDone}
      note={note}
    />
  );
}

// ── 4. Notifications ──

function Notify({ onDone }: { onDone: (yes: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const allow = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
    onDone(answer === 'granted');
  };
  return (
    <Permission
      icon={<Bell size={40} className="pg-fr-bell" />}
      title="Не пропустите главное"
      text="Сообщим, когда машина зарядилась, подошла очередь или бронь скоро закончится — даже если приложение закрыто."
      points={['Зарядка завершена — можно ехать', 'Ваша очередь: разъём свободен и держится за вами', 'Оплата, возвраты и безопасность аккаунта']}
      allow={busy ? 'Ждём ответ устройства…' : 'Включить уведомления'}
      onAllow={() => void allow()}
      onLater={() => onDone(false)}
    />
  );
}

// ── 5. The user agreement ──

const POINTS = [
  { icon: <Zap size={17} />, title: 'Агрегатор сетей', text: 'Станции принадлежат сетям-партнёрам, мы запускаем зарядку и считаем оплату.' },
  { icon: <CreditCard size={17} />, title: 'Оплата по факту', text: 'Только полученные кВт·ч по цене, показанной до старта. Данные карты остаются у платёжной системы.' },
  { icon: <MapPin size={17} />, title: 'Геолокация и камера', text: 'Только когда нужны вам: станции рядом, маршрут, QR-код. Видео не записывается.' },
  { icon: <Shield size={17} />, title: 'Данные под защитой', text: 'Хранятся в Узбекистане, не продаются и не передаются рекламным сетям.' },
  { icon: <UserCheck size={17} />, title: 'Ваши права', text: 'Выгрузить историю, отказаться от рассылки или удалить аккаунт можно в любой момент.' },
];

function Consent({ renewed, onAccept }: { renewed: boolean; onAccept: (marketing: boolean) => void }) {
  const [terms, setTerms] = useState(false);
  const [data, setData] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [reading, setReading] = useState(false);
  const all = terms && data && marketing;
  const toggleAll = () => {
    const v = !all;
    setTerms(v);
    setData(v);
    setMarketing(v);
  };
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6">
        <div className="w-14 h-14 rounded-2xl bg-[#FFF4D1] text-[#8A5B00] grid place-items-center mb-5 pg-fr-pop"><FileText size={26} /></div>
        <h1 className="text-[26px] font-extrabold text-[#111] leading-tight tracking-tight">{renewed ? 'Мы обновили соглашение' : 'Коротко о правилах'}</h1>
        <p className="text-[15px] text-slate-500 mt-2 mb-5 leading-relaxed">
          {renewed ? 'Чтобы продолжить, прочитайте и примите новую редакцию. Главное — ниже.' : 'Главное из пользовательского соглашения. Полный текст — по ссылке ниже.'}
        </p>
        <div className="space-y-2 pg-stagger">
          {POINTS.map(p => (
            <div key={p.title} className="flex items-start gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <span className="w-9 h-9 rounded-xl bg-white text-[#111] grid place-items-center shrink-0 shadow-sm">{p.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#111]">{p.title}</span>
                <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{p.text}</span>
              </span>
            </div>
          ))}
        </div>
        <button onClick={() => setReading(true)} className="mt-4 w-full flex items-center gap-3 px-4 h-14 rounded-2xl border-2 border-[#111] text-left">
          <FileText size={18} className="shrink-0" />
          <span className="flex-1 text-sm font-bold text-[#111]">Читать соглашение полностью</span>
          <ChevronRight size={18} className="text-slate-400" />
        </button>

        <div className="mt-5 rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          <Check3 checked={all} onChange={toggleAll} strong>Принять всё</Check3>
          <Check3 checked={terms} onChange={() => setTerms(v => !v)} required>Мне есть 18 лет, я принимаю Пользовательское соглашение и Публичную оферту</Check3>
          <Check3 checked={data} onChange={() => setData(v => !v)} required>Согласен на обработку моих персональных данных, как описано в соглашении</Check3>
          <Check3 checked={marketing} onChange={() => setMarketing(v => !v)}>Хочу получать акции, скидки сетей и новости (можно отключить в профиле)</Check3>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 mb-2 leading-relaxed">* Обязательные пункты. Принятая редакция и дата сохраняются в вашем аккаунте.</p>
      </div>
      <Footer>
        <PrimaryButton onClick={() => onAccept(marketing)} disabled={!terms || !data}>
          {renewed ? 'Принимаю новую редакцию' : 'Принимаю и продолжаю'}<ChevronRight size={18} />
        </PrimaryButton>
      </Footer>
      {reading && <LegalSheet onClose={() => setReading(false)} />}
    </>
  );
}

function Check3({ checked, onChange, children, required, strong }: { checked: boolean; onChange: () => void; children: ReactNode; required?: boolean; strong?: boolean }) {
  return (
    <button role="checkbox" aria-checked={checked} onClick={onChange} className={`w-full flex items-start gap-3 px-4 py-3.5 text-left ${strong ? 'bg-slate-50' : 'bg-white'}`}>
      <span className={`mt-0.5 w-[22px] h-[22px] rounded-[7px] grid place-items-center shrink-0 transition-all duration-200 ${checked ? 'bg-[#FFC83D] text-[#111] scale-100' : 'border-2 border-slate-300 scale-95'}`}>
        {checked && <Check size={14} strokeWidth={3} className="pg-fr-tick" />}
      </span>
      <span className={`text-sm leading-snug ${strong ? 'font-bold text-[#111]' : 'text-slate-700'}`}>
        {children}{required && <span className="text-[#C2410C]"> *</span>}
      </span>
    </button>
  );
}

/** The whole agreement, readable without leaving the screens. */
function LegalSheet({ onClose }: { onClose: () => void }) {
  const doc = LEGAL.consent;
  const { lang } = useI18n();
  return (
    <div className="absolute inset-0 z-10 bg-white flex flex-col pg-sheet-in" role="dialog" aria-modal="true" aria-label={doc.title}>
      <div className="px-4 h-14 flex items-center gap-2 border-b border-slate-100 shrink-0">
        <span className="flex-1 text-sm font-bold text-[#111] truncate">Пользовательское соглашение</span>
        <button onClick={onClose} aria-label="Закрыть" className="w-9 h-9 rounded-xl grid place-items-center hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {lang !== 'ru' && <p className="text-xs text-[#8A5B00] bg-[#FFF4D1] rounded-xl px-3 py-2.5 mb-4">Юридически значимый текст — на русском языке. Перевод на узбекский и английский готовится.</p>}
        <article lang="ru" data-no-translate className="text-[13px] leading-relaxed text-slate-700">
          <h1 className="text-lg font-extrabold text-[#111] leading-snug">{doc.title}</h1>
          <p className="text-xs text-slate-400 mt-1">Редакция от {doc.updated}</p>
          <p className="mt-3">{doc.intro}</p>
          {doc.sections.map(s => (
            <section key={s.h} className="mt-4">
              <h2 className="text-sm font-bold text-[#111] mb-1.5">{s.h}</h2>
              {s.p.map((t, n) => <p key={n} className="mb-1.5">{t}</p>)}
            </section>
          ))}
        </article>
      </div>
      <Footer>
        <PrimaryButton onClick={onClose}>Понятно</PrimaryButton>
      </Footer>
    </div>
  );
}

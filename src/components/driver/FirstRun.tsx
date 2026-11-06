import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, CreditCard, FileText, MapPin, Navigation, Shield, UserCheck, Zap } from 'lucide-react';
import { BRAND } from '../../brand';
import { usePlatform } from '../../lib/platform';
import { geoPermission, locate } from '../../lib/geo';
import { readFirstRun, saveFirstRun } from '../../lib/firstRun';
import { LegalSheet } from './Agreement';
import { enableNativePush, nativePushAvailable, nativePushGranted } from '../../lib/nativePush';

type Step = 'location' | 'notify' | 'consent';

const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

/**
 * Right after the first sign-in on a device: location and notifications, each
 * on its own screen that says why, and the agreement only if the account
 * accepted an older edition. A new edition later brings back only its screen.
 * The app's tour, language and the agreement for new accounts come before,
 * on the welcome and in sign-up.
 */
export default function FirstRun({ only, agreedVersion = 0, marketing: wasMarketing = false }: { only?: 'consent'; agreedVersion?: number; marketing?: boolean }) {
  const { onboarding } = usePlatform();
  const oldTerms = agreedVersion < onboarding.consentVersion;
  const [steps, setSteps] = useState<Step[]>(() => (only ? ['consent'] : ['location', 'notify', ...(oldTerms ? ['consent' as const] : [])]));
  const [i, setI] = useState(0);
  const [push, setPush] = useState(false);
  const step = steps[i];

  // A permission already given or refused needs no screen of its own.
  useEffect(() => {
    if (only) return;
    let alive = true;
    void (async () => {
      const geo = onboarding.askLocation && 'geolocation' in navigator ? await geoPermission() : 'denied';
      // The store app asks through the phone (Firebase); a browser asks for Web Push.
      const native = nativePushAvailable();
      const granted = native ? await nativePushGranted() : pushSupported() && Notification.permission === 'granted';
      const canPush = onboarding.askPush && !granted && (native || (pushSupported() && Notification.permission === 'default'));
      if (granted) setPush(true);
      if (!alive) return;
      setSteps(s => s.filter(x => (x !== 'location' || geo === 'prompt' || geo === 'unknown') && (x !== 'notify' || canPush)));
    })();
    return () => {
      alive = false;
    };
  }, [only, onboarding.askLocation, onboarding.askPush]);

  const back = () => setI(n => Math.max(n - 1, 0));
  /** Saved once the last screen is through; `marketing` comes from the agreement screen when there is one. */
  const finish = (marketing = wasMarketing, said = push) => {
    const prev = readFirstRun();
    const accepted = steps.includes('consent') ? onboarding.consentVersion : Math.max(agreedVersion, prev?.version ?? 0);
    saveFirstRun({ version: accepted, marketing, push: said || !!prev?.push, at: new Date().toISOString() });
  };
  const next = (said = push) => (i >= steps.length - 1 ? finish(wasMarketing, said) : setI(n => n + 1));

  // Every permission already decided and the agreement current: nothing to show.
  useEffect(() => {
    if (!steps.length) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);
  if (!step) return null;

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
        {step === 'location' && <Location onDone={() => next()} />}
        {step === 'notify' && <Notify onDone={yes => { setPush(yes); next(yes); }} />}
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

// ── Location ──

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

// ── Notifications ──

function Notify({ onDone }: { onDone: (yes: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const allow = async () => {
    if (busy) return;
    setBusy(true);
    if (nativePushAvailable()) return onDone(await enableNativePush().catch(() => false));
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

// ── A new edition of the user agreement ──

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

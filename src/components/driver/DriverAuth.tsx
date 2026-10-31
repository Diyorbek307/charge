import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, KeyRound, LoaderCircle, Mail, Phone, TriangleAlert } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { readFirstRun } from '../../lib/firstRun';
import { inNativeShell } from '../../lib/site';
import type { SignInResult } from '../../lib/api';
import { Logo } from '../../landing/Logo';

type Step = 'welcome' | 'start' | 'code' | 'name' | 'totp';
type Providers = { google: string | null; apple: string | null };

const SLIDES = [
  { a: 'Заряжайся.', b: 'Двигайся.', text: 'Все зарядные станции Узбекистана в одном приложении.' },
  { a: 'Свободно.', b: 'Рядом.', text: 'Свободные разъёмы, мощность и цена — на карте в реальном времени.' },
  { a: 'Одно касание.', b: 'Один кошелёк.', text: 'Payme, Click и бонусы Voli — платите за зарядку в любой сети.' },
];

const YELLOW = 'linear-gradient(90deg, #FFE27A, #FFC83D 55%, #F5B000)';
const readRef = () => {
  try {
    return localStorage.getItem('pg-ref') ?? '';
  } catch {
    return '';
  }
};

/** Loads a third-party script once; resolves when it has run. */
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script'));
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src)!;
}

type GoogleId = { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
type AppleId = { auth: { init: (o: object) => void; signIn: () => Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }> } };

/**
 * The driver's way in: a welcome with what Voli is, then one screen for
 * everyone — Apple, Google, or a phone or email that gets a code. Someone new
 * gives a name after the code and is in; a password stays as a fallback.
 */
export default function DriverAuth({ onPassword }: { onPassword: () => void }) {
  const { actions, adoptSession, verify2fa } = useSync();
  const [step, setStep] = useState<Step>('welcome');
  const [slide, setSlide] = useState(0);
  const [providers, setProviders] = useState<Providers>({ google: null, apple: null });
  const [to, setTo] = useState('');
  const [sentTo, setSentTo] = useState<{ to: string; channel: 'sms' | 'email' } | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [challenge, setChallenge] = useState('');
  const [name, setName] = useState('');
  const [ref, setRef] = useState(readRef);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleBox = useRef<HTMLDivElement>(null);

  // The welcome turns its pages by itself.
  useEffect(() => {
    if (step !== 'welcome') return;
    const t = setInterval(() => setSlide(n => (n + 1) % SLIDES.length), 4200);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Google and Apple only where their keys are set, and not yet inside the store app: their web sign-in does not run there.
  useEffect(() => {
    if (inNativeShell()) return;
    actions.authProviders().then(p => setProviders({ google: p.google, apple: p.apple })).catch(() => {});
  }, [actions]);

  const consent = () => {
    const accepted = readFirstRun();
    return { version: accepted?.version ?? 0, marketing: !!accepted?.marketing };
  };
  const forget = () => {
    try {
      localStorage.removeItem('pg-ref');
    } catch {
      /* nothing kept */
    }
  };

  /** Where a code or a provider leaves us: in, a 2FA code, or a name to give. */
  const land = (r: SignInResult) => {
    if (r.token) {
      forget();
      adoptSession('driver', r.token, r.user);
    } else if (r.requires2fa) {
      setChallenge(r.challenge);
      setCode('');
      setStep('totp');
    } else if (r.newAccount) {
      setTicket(r.ticket);
      setStep('name');
    }
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || 'Не получилось — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const r = await actions.requestSignInCode(to.trim());
      setSentTo({ to: r.to, channel: r.channel });
      setDemoCode(r.demoCode ?? null);
      setCode('');
      setCooldown(60);
      setStep('code');
    });
  };
  const checkCode = (e: FormEvent) => {
    e.preventDefault();
    if (!sentTo) return;
    return run(async () => land(await actions.verifySignInCode(sentTo.to, code)));
  };
  const finish = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => land(await actions.finishSignUp(ticket, name.trim(), consent(), ref.trim() || undefined)));
  };
  const checkTotp = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await verify2fa('driver', challenge, code);
    });
  };

  // Google draws its own button; it calls back with an ID token.
  useEffect(() => {
    if (step !== 'start' || !providers.google || !googleBox.current) return;
    const box = googleBox.current;
    loadScript('https://accounts.google.com/gsi/client').then(() => {
      const g = (window as unknown as { google?: GoogleId }).google;
      if (!g) return;
      g.accounts.id.initialize({
        client_id: providers.google,
        ux_mode: 'popup',
        callback: (r: { credential: string }) => void run(async () => land(await actions.oauthSignIn('google', r.credential, { consent: consent(), ref: ref.trim() || undefined }))),
      });
      g.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(box.offsetWidth, 400), locale: 'ru' });
    }).catch(() => setProviders(p => ({ ...p, google: null })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, providers.google]);

  const apple = () =>
    run(async () => {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ru_RU/appleid.auth.js');
      const a = (window as unknown as { AppleID?: AppleId }).AppleID;
      if (!a || !providers.apple) throw new Error('Вход через Apple сейчас недоступен');
      a.auth.init({ clientId: providers.apple, scope: 'name email', redirectURI: `${window.location.origin}/`, usePopup: true });
      let r;
      try {
        r = await a.auth.signIn();
      } catch {
        return; // closed the window
      }
      const n = r.user?.name;
      land(await actions.oauthSignIn('apple', r.authorization.id_token, { name: [n?.firstName, n?.lastName].filter(Boolean).join(' ') || undefined, consent: consent(), ref: ref.trim() || undefined }));
    });

  if (step === 'welcome') return <Welcome slide={slide} onSlide={setSlide} onStart={() => setStep('start')} onSignIn={() => setStep('start')} />;

  const isEmail = to.includes('@');
  const back = () => {
    setError(null);
    setStep(step === 'start' ? 'welcome' : 'start');
  };

  return (
    <div className="min-h-full w-full bg-white flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="px-3 pt-3">
        <button onClick={back} aria-label="Назад" className="w-10 h-10 rounded-full grid place-items-center text-slate-600 hover:bg-slate-100"><ArrowLeft size={20} /></button>
      </div>
      <div className="flex-1 px-6 pb-8 flex flex-col">
        <div className="mx-auto mt-2"><Logo size={52} /></div>

        {step === 'start' && (
          <>
            <h1 className="mt-7 text-center text-[24px] font-extrabold text-slate-900">Добро пожаловать!</h1>
            <p className="mt-1.5 text-center text-sm text-slate-500">Войдите или создайте аккаунт, чтобы заряжаться с Voli</p>

            <div className="mt-7 space-y-3">
              {providers.apple && (
                <button onClick={() => void apple()} disabled={busy} className="w-full h-[52px] rounded-2xl bg-[#111] text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform disabled:opacity-60">
                  <AppleMark />Продолжить с Apple
                </button>
              )}
              {providers.google && <div ref={googleBox} className="w-full flex justify-center min-h-[44px]" />}
            </div>
            {(providers.apple || providers.google) && (
              <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />или<span className="h-px flex-1 bg-slate-200" /></div>
            )}

            <form onSubmit={sendCode} className={`space-y-3 ${providers.apple || providers.google ? '' : 'mt-7'}`}>
              <label className="relative block">
                <span className="sr-only">Телефон или почта</span>
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{isEmail ? <Mail size={18} /> : <Phone size={18} />}</span>
                <input id="driver-signin-to" value={to} onChange={e => setTo(e.target.value)} autoComplete="username" inputMode={isEmail ? 'email' : 'text'} placeholder="Телефон или почта"
                  className="w-full h-[54px] rounded-2xl bg-slate-50 border border-slate-200 pl-12 pr-4 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#FFC83D] focus:ring-4 focus:ring-[#FFC83D]/25" />
              </label>
              <ErrorBox error={error} />
              <button type="submit" disabled={busy || to.trim().length < 5} className="w-full h-[54px] rounded-2xl text-[#111] font-bold text-[16px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40" style={{ background: YELLOW, boxShadow: '0 8px 24px rgba(255,200,61,.3)' }}>
                {busy && <LoaderCircle size={17} className="animate-spin" />}Получить код
              </button>
            </form>
            <p className="mt-3 text-center text-xs text-slate-400">Номер +998… — код придёт по SMS, почта — письмом. Новый аккаунт создастся сам.</p>
            <button onClick={onPassword} className="mt-auto pt-8 mx-auto inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"><KeyRound size={15} />Войти с паролем</button>
          </>
        )}

        {step === 'code' && sentTo && (
          <form onSubmit={checkCode} className="mt-7">
            <h1 className="text-center text-[22px] font-extrabold text-slate-900">Введите код</h1>
            <p className="mt-1.5 text-center text-sm text-slate-500">{sentTo.channel === 'email' ? 'Отправили письмо на ' : 'Отправили SMS на '}<span className="font-semibold text-slate-800">{sentTo.to}</span></p>
            {demoCode && <p className="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center">Демо-режим: {sentTo.channel === 'email' ? 'письмо' : 'SMS'} не отправляется. Ваш код — <b className="font-mono tracking-widest">{demoCode}</b></p>}
            <CodeInput value={code} onChange={setCode} />
            <ErrorBox error={error} />
            <button type="submit" disabled={busy || code.length !== 6} className="mt-4 w-full h-[54px] rounded-2xl text-[#111] font-bold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: YELLOW }}>
              {busy && <LoaderCircle size={17} className="animate-spin" />}Продолжить
            </button>
            <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="mt-4 w-full text-sm text-slate-500 hover:text-slate-900 disabled:text-slate-300">
              {cooldown > 0 ? `Отправить снова через ${cooldown} с` : 'Отправить код снова'}
            </button>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={finish} className="mt-7 space-y-3">
            <h1 className="text-center text-[22px] font-extrabold text-slate-900">Как вас зовут?</h1>
            <p className="text-center text-sm text-slate-500">Это последний шаг — имя увидит только поддержка и станция в чеке</p>
            <input id="driver-signup-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" autoFocus placeholder="Имя и фамилия"
              className="mt-3 w-full h-[54px] rounded-2xl bg-slate-50 border border-slate-200 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#FFC83D] focus:ring-4 focus:ring-[#FFC83D]/25" />
            <input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" placeholder="Код друга (если есть)"
              className="w-full h-[48px] rounded-2xl bg-slate-50 border border-slate-200 px-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#FFC83D]" />
            <ErrorBox error={error} />
            <button type="submit" disabled={busy || name.trim().length < 2} className="w-full h-[54px] rounded-2xl text-[#111] font-bold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: YELLOW }}>
              {busy && <LoaderCircle size={17} className="animate-spin" />}Создать аккаунт
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={checkTotp} className="mt-7">
            <h1 className="text-center text-[22px] font-extrabold text-slate-900">Код из приложения</h1>
            <p className="mt-1.5 text-center text-sm text-slate-500">У вас включена двухфакторная защита — введите 6 цифр из приложения-аутентификатора</p>
            <CodeInput value={code} onChange={setCode} />
            <ErrorBox error={error} />
            <button type="submit" disabled={busy || code.length !== 6} className="mt-4 w-full h-[54px] rounded-2xl text-[#111] font-bold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: YELLOW }}>
              {busy && <LoaderCircle size={17} className="animate-spin" />}Войти
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Six boxes over one real input, so paste and the phone's code suggestion both work. */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative mt-6 block">
      <span className="sr-only">Код</span>
      <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus
        className="absolute inset-0 w-full h-full opacity-0" aria-label="Код из 6 цифр" />
      <span className="grid grid-cols-6 gap-2 pointer-events-none" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`h-14 rounded-2xl border-2 grid place-items-center text-[22px] font-bold text-slate-900 ${i === value.length ? 'border-[#FFC83D] bg-[#FFF8E1]' : 'border-slate-200 bg-slate-50'}`}>{value[i] ?? ''}</span>
        ))}
      </span>
    </label>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
      <TriangleAlert size={14} className="shrink-0 mt-px" /><span>{error}</span>
    </div>
  );
}

const AppleMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.7 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.2-2.48-.03-.01-2.3-.88-2.31-3.55zM14.18 6.13c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.55 1.31-.56.65-1.05 1.69-.92 2.69.97.08 1.97-.49 2.57-1.22z" />
  </svg>
);

/**
 * The first screen: Tashkent at dusk, the wordmark, three
 * short pages about Voli, and the two ways forward.
 */
function Welcome({ slide, onSlide, onStart, onSignIn }: { slide: number; onSlide: (n: number) => void; onStart: () => void; onSignIn: () => void }) {
  const s = SLIDES[slide];
  return (
    <div className="relative min-h-full w-full overflow-hidden flex flex-col text-white bg-[#0a0a0a]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Tashkent at dusk, fading into the dark where the buttons are */}
      <img src="/welcome/tashkent-dusk.jpg" alt="" aria-hidden="true" className="absolute inset-x-0 top-0 w-full h-[78%] object-cover object-[50%_60%] pg-kenburns" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(8,10,18,.72) 0%, rgba(8,10,18,.25) 26%, rgba(8,10,18,.1) 44%, rgba(10,10,10,.85) 70%, #0a0a0a 80%)' }} />

      <div className="relative pt-14 flex flex-col items-center px-6">
        <Logo size={64} ink="#FFFFFF" />
        <h1 key={slide} className="mt-6 text-center text-[34px] font-extrabold leading-[1.1] tracking-tight pg-reveal" style={{ textShadow: "0 2px 18px rgba(0,0,0,.65)" }}>
          {s.a}<br /><span className="text-[#FFC83D]">{s.b}</span>
        </h1>
      </div>

      <div className="relative mt-auto px-6 pb-8">
        <p key={`t${slide}`} className="text-center text-[15px] text-white/85 leading-snug min-h-[44px] pg-reveal">{s.text}</p>
        <div className="mt-5 flex justify-center gap-2" role="tablist" aria-label="О Voli">
          {SLIDES.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === slide} aria-label={`Страница ${i + 1}`} onClick={() => onSlide(i)} className={`h-2 rounded-full transition-all ${i === slide ? 'w-6 bg-[#FFC83D]' : 'w-2 bg-white/35'}`} />
          ))}
        </div>
        <button onClick={onStart} className="mt-6 w-full h-[56px] rounded-2xl text-[#111] font-bold text-[17px] active:scale-[0.98] transition-transform" style={{ background: YELLOW, boxShadow: '0 10px 30px rgba(255,200,61,.3)' }}>Начать</button>
        <p className="mt-4 text-center text-sm text-white/70">Уже есть аккаунт? <button onClick={onSignIn} className="font-bold text-[#FFC83D]">Войти</button></p>
        <a href="https://commons.wikimedia.org/wiki/File:Tashkent_city_2025y.jpg" target="_blank" rel="noreferrer" className="mt-3 block text-center text-[10px] text-white/30">Фото: Farruh Samadov · CC BY-SA 4.0</a>
      </div>
    </div>
  );
}

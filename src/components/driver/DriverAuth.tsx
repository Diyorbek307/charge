import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, LoaderCircle, Mail, Phone, TriangleAlert } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { readFirstRun } from '../../lib/firstRun';
import { usePlatform } from '../../lib/platform';
import { LANGS, useI18n } from '../../lib/i18n';
import { greetNext } from './Greeting';
import { AgreementChecks, NOTHING_AGREED, agreedEnough, type Agreed } from './Agreement';
import { inNativeShell } from '../../lib/site';
import type { SignInResult } from '../../lib/api';
import { Logo } from '../../landing/Logo';
import ChargeScene from './ChargeScene';
import Splash from './Splash';

type Step = 'welcome' | 'start' | 'code' | 'name' | 'agree' | 'totp' | 'password';
type Providers = { google: string | null; apple: string | null };

const SLIDES = [
  { a: 'Заряжайся.', b: 'Двигайся.', text: 'Все зарядные станции Узбекистана в одном приложении.' },
  { a: 'Свободно.', b: 'Рядом.', text: 'Свободные разъёмы, мощность и цена — на карте в реальном времени.' },
  { a: 'Одно касание.', b: 'Один кошелёк.', text: 'Payme, Click и бонусы Voli — платите за зарядку в любой сети.' },
];

const YELLOW = 'linear-gradient(90deg, #FFE27A, #FFC83D 55%, #F5B000)';
const SPARKS = Array.from({ length: 14 }, (_, i) => ({ x: (i * 37 + 11) % 100, s: 2 + (i % 3), d: (i * 0.53) % 4, t: 3.2 + (i % 4) * 0.7 }));
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
export default function DriverAuth() {
  const { actions, adoptSession, verify2fa, login, credentials } = useSync();
  const demo = credentials.find(c => c.portal === 'driver');
  const [step, setStep] = useState<Step>('welcome');
  const [splash, setSplash] = useState(() => !splashSeen());
  // The welcome's words leave first, then the sign-in takes the photo over; coming back, the photo opens up again.
  const [leaving, setLeaving] = useState(false);
  const [returning, setReturning] = useState(false);
  const goSignIn = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      setStep('start');
    }, 330);
  };
  // Field hints appear only after the first try to go on.
  const [touched, setTouched] = useState(false);
  const [slide, setSlide] = useState(0);
  const [providers, setProviders] = useState<Providers>({ google: null, apple: null });
  const [to, setTo] = useState('');
  const [sentTo, setSentTo] = useState<{ to: string; channel: 'sms' | 'email' } | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [challenge, setChallenge] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ref, setRef] = useState(readRef);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleBox = useRef<HTMLDivElement>(null);
  const { onboarding } = usePlatform();
  // The agreement is accepted where an account is made: on the name step, or before a new Google/Apple account.
  const [agreed, setAgreed] = useState<Agreed>(NOTHING_AGREED);
  const [pendingOauth, setPendingOauth] = useState<{ provider: 'google' | 'apple'; token: string; name?: string } | null>(null);

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
    if (agreedEnough(agreed)) return { version: onboarding.consentVersion, marketing: agreed.marketing };
    const accepted = readFirstRun();
    return { version: accepted?.version ?? 0, marketing: !!accepted?.marketing };
  };
  /**
   * Google or Apple: an existing account is simply in. A new one needs the
   * agreement first, so the server's refusal turns into the agreement step,
   * and the same ID token is sent again once it is accepted.
   */
  const oauth = async (provider: 'google' | 'apple', token: string, name?: string) => {
    try {
      land(await actions.oauthSignIn(provider, token, { name, consent: consent(), ref: ref.trim() || undefined }));
    } catch (e) {
      if (/соглашени/i.test((e as Error).message) && !agreedEnough(agreed)) {
        setPendingOauth({ provider, token, name });
        setStep('agree');
        return;
      }
      throw e;
    }
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
      greetNext();
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
  const signInWithPassword = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      greetNext();
      const r = await login('driver', to.trim(), password);
      if (r.requires2fa) {
        setChallenge(r.challenge);
        setCode('');
        setStep('totp');
      }
    });
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
        callback: (r: { credential: string }) => void run(() => oauth('google', r.credential)),
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
      await oauth('apple', r.authorization.id_token, [n?.firstName, n?.lastName].filter(Boolean).join(' ') || undefined);
    });

  // The splash plays over the welcome, so its wordmark can fly to the welcome's own; lifting it off leaves the welcome as it is.
  if (step === 'welcome') {
    return (
      <div className="relative h-full min-h-full w-full">
        <Welcome slide={slide} onSlide={setSlide} onStart={goSignIn} onSignIn={goSignIn} logoHidden={splash} leaving={leaving} returning={returning} />
        {splash && <Splash onDone={() => setSplash(false)} />}
      </div>
    );
  }

  const isEmail = to.includes('@');
  const back = () => {
    setError(null);
    setTouched(false);
    if (step === 'start' || step === 'password') setReturning(true);
    setStep(step === 'start' || step === 'password' ? 'welcome' : 'start');
  };
  // Shown under the field once the driver has tried: a number or an address, said plainly.
  const toProblem = touched && !validTarget(to) ? 'Введите номер +998 XX XXX XX XX или почту' : null;
  const passwordProblem = touched && step === 'password' && !password ? 'Введите пароль' : null;
  const head: Record<Exclude<Step, 'welcome'>, [string, string]> = {
    start: ['С возвращением', 'Войдите или создайте аккаунт — заряжайтесь во всех сетях'],
    password: ['С возвращением', 'Войдите или создайте аккаунт — заряжайтесь во всех сетях'],
    code: ['Введите код', sentTo ? `${sentTo.channel === 'email' ? 'Отправили письмо на' : 'Отправили SMS на'} ${sentTo.to}` : ''],
    name: ['Как вас зовут?', 'Последний шаг — и аккаунт готов'],
    agree: ['Почти готово', 'Примите соглашение — и аккаунт готов'],
    totp: ['Код из приложения', 'Двухфакторная защита: 6 цифр из приложения-аутентификатора'],
  };
  const [title, sub] = head[step];
  const signingIn = busy && step !== 'start';
  const field = (bad: boolean) =>
    `w-full h-[54px] rounded-2xl border text-[15px] text-white placeholder:text-white/35 outline-none transition-colors ${bad ? 'border-red-400/80 bg-red-500/10 focus:ring-4 focus:ring-red-500/20' : 'border-white/10 bg-white/[0.06] focus:border-[#FFC83D] focus:bg-white/[0.09] focus:ring-4 focus:ring-[#FFC83D]/15'}`;

  return (
    <div className="relative min-h-full w-full flex flex-col bg-[#070707] text-white overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* The car at the charger, fading into the dark, sparks rising over it */}
      <div className="absolute inset-x-0 top-0 h-[330px] overflow-hidden sp5-hero-in" aria-hidden="true">
        <img src="/welcome/welcome.jpg" alt="" className="w-full h-full object-cover object-[50%_74%] sp5-img-in" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,7,7,.55) 0%, rgba(7,7,7,.15) 35%, rgba(7,7,7,.75) 72%, #070707 100%)' }} />
        {SPARKS.map((sp, i) => (
          <span key={i} className="absolute bottom-6 rounded-full sp4-float" style={{ left: `${sp.x}%`, width: sp.s, height: sp.s, background: '#FFE27A', boxShadow: '0 0 8px 2px rgba(255,200,61,.7)', animationDelay: `${sp.d}s`, animationDuration: `${sp.t}s` }} />
        ))}
      </div>

      <div className="relative px-5 pt-3 flex items-center justify-between sp5-in" style={{ animationDelay: '.3s' }}>
        <button onClick={back} aria-label="Назад" className="w-10 h-10 rounded-full grid place-items-center text-white bg-white/10 border border-white/15 backdrop-blur-md hover:bg-white/20"><ArrowLeft size={19} /></button>
        <Logo size={28} ink="#FFFFFF" />
        <span className="w-10" />
      </div>

      {/* The greeting, a shine running through it */}
      <div className="relative px-6 pt-[150px] sp5-in" style={{ animationDelay: '.4s' }}>
        <h1 key={title} className="text-[36px] leading-[1.05] font-extrabold tracking-tight pg-reveal">
          <span className="bg-clip-text text-transparent sp4-shimmer" style={{ backgroundImage: 'linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 40%, #FFE27A 50%, #FFFFFF 60%, #FFFFFF 100%)' }}>{title}</span><span className="text-[#FFC83D]">.</span>
        </h1>
        <p className="mt-2 text-sm text-white/60 max-w-[330px]">{sub}</p>
      </div>

      {/* The glass card with the form */}
      <div className="relative mx-4 mt-6 mb-6 rounded-[28px] p-5 bg-white/[0.06] border border-white/10 backdrop-blur-xl pg-card-up" style={{ boxShadow: '0 24px 60px rgba(0,0,0,.55)', animationDelay: '.48s' }}>
        <span className="absolute inset-x-8 top-0 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,200,61,0), rgba(255,200,61,.7), rgba(255,200,61,0))' }} aria-hidden="true" />
        {(step === 'start' || step === 'password') && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.06] border border-white/[0.08] rounded-2xl mb-5" role="tablist" aria-label="Способ входа">
            {([['start', 'По коду'], ['password', 'По паролю']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={step === k} onClick={() => { setError(null); setTouched(false); setStep(k); }}
                className={`h-11 rounded-xl text-sm font-bold transition-colors ${step === k ? 'bg-[#FFC83D] text-[#111] shadow-[0_6px_20px_rgba(255,200,61,.35)]' : 'text-white/55 hover:text-white'}`}>{label}</button>
            ))}
          </div>
        )}

        {step === 'start' && (
          <form onSubmit={e => { setTouched(true); if (!validTarget(to)) { e.preventDefault(); return; } void sendCode(e); }} noValidate className="space-y-3 sp5-step">
            <TargetField id="driver-signin-to" value={to} onChange={setTo} isEmail={isEmail} className={field(!!toProblem)} />
            <FieldError text={toProblem} />
            <ErrorBox error={error} />
            <YellowButton busy={busy} disabled={busy}>Получить код</YellowButton>
            <p className="text-center text-xs text-white/40">Номер +998… — код придёт по SMS, почта — письмом. Новый аккаунт создастся сам.</p>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={e => { setTouched(true); if (!validTarget(to) || !password) { e.preventDefault(); return; } void signInWithPassword(e); }} noValidate className="space-y-3 sp5-step">
            <TargetField id="driver-login" value={to} onChange={setTo} isEmail={isEmail} className={field(!!toProblem)} />
            <FieldError text={toProblem} />
            <label className="relative block">
              <span className="sr-only">Пароль</span>
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 ${passwordProblem ? 'text-red-400' : 'text-white/40'}`}><Lock size={18} /></span>
              <input id="driver-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Пароль" className={`${field(!!passwordProblem)} pl-12 pr-12`} />
              <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center text-white/40 hover:text-white">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </label>
            <FieldError text={passwordProblem} />
            <ErrorBox error={error} />
            <YellowButton busy={busy} disabled={busy}>Войти</YellowButton>
            <button type="button" onClick={() => { setError(null); setTouched(false); setStep('start'); }} className="w-full text-sm text-white/55 hover:text-white">Забыли пароль? Войдите по коду</button>
            {demo && (
              <div className="rounded-2xl border border-[#FFC83D]/25 bg-[#FFC83D]/10 px-4 py-3 flex items-center justify-between gap-3 text-xs text-[#FFE7A0]">
                <span>Демо-доступ: <b className="font-mono">{demo.login}</b></span>
                <button type="button" onClick={() => { setTo(demo.login); setPassword(demo.password); }} className="font-bold text-[#FFC83D]">Заполнить</button>
              </div>
            )}
          </form>
        )}

        {(step === 'start' || step === 'password') && (providers.apple || providers.google) && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-white/35"><span className="h-px flex-1 bg-white/10" />или продолжить через<span className="h-px flex-1 bg-white/10" /></div>
            <div className="grid grid-cols-2 gap-3">
              {providers.google && <div ref={googleBox} className={`flex justify-center min-h-[44px] ${providers.apple ? '' : 'col-span-2'}`} />}
              {providers.apple && (
                <button onClick={() => void apple()} disabled={busy} className={`h-[44px] rounded-full bg-white text-[#111] font-semibold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 ${providers.google ? '' : 'col-span-2'}`}>
                  <AppleMark />Apple
                </button>
              )}
            </div>
          </>
        )}

        {step === 'code' && sentTo && (
          <form onSubmit={checkCode} className="sp5-step">
            {demoCode && <p className="text-xs text-[#FFE7A0] bg-[#FFC83D]/10 border border-[#FFC83D]/25 rounded-xl px-3 py-2.5 text-center">{sentTo.channel === 'email' ? 'Демо-режим: письмо не отправляется. Ваш код —' : 'Демо-режим: SMS не отправляется. Ваш код —'} <b className="font-mono tracking-widest">{demoCode}</b></p>}
            <CodeInput value={code} onChange={setCode} />
            <ErrorBox error={error} />
            <div className="mt-4"><YellowButton busy={busy} disabled={busy || code.length !== 6}>Продолжить</YellowButton></div>
            <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="mt-4 w-full text-sm text-white/55 hover:text-white disabled:text-white/25">
              {cooldown > 0 ? `Отправить снова через ${cooldown} с` : 'Отправить код снова'}
            </button>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={finish} className="space-y-3 sp5-step">
            <input id="driver-signup-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" autoFocus placeholder="Имя и фамилия" className={`${field(false)} px-4`} />
            <input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" placeholder="Код друга (если есть)" className={`${field(false)} px-4 h-[48px] text-sm`} />
            <p className="text-xs text-white/40">Имя увидят только поддержка и станция в чеке.</p>
            <AgreementChecks value={agreed} onChange={setAgreed} />
            <ErrorBox error={error} />
            <YellowButton busy={busy} disabled={busy || name.trim().length < 2 || !agreedEnough(agreed)}>Создать аккаунт</YellowButton>
          </form>
        )}

        {step === 'agree' && pendingOauth && (
          <form onSubmit={e => { e.preventDefault(); void run(() => oauth(pendingOauth.provider, pendingOauth.token, pendingOauth.name)); }} className="space-y-3 sp5-step">
            <AgreementChecks value={agreed} onChange={setAgreed} />
            <ErrorBox error={error} />
            <YellowButton busy={busy} disabled={busy || !agreedEnough(agreed)}>Создать аккаунт</YellowButton>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={checkTotp} className="sp5-step">
            <CodeInput value={code} onChange={setCode} />
            <ErrorBox error={error} />
            <div className="mt-4"><YellowButton busy={busy} disabled={busy || code.length !== 6}>Войти</YellowButton></div>
          </form>
        )}

      </div>
      {signingIn && <SigningIn />}
    </div>
  );
}

/** "+998 90 123 45 67" or "name@mail.ru": the same check the server makes. */
const validTarget = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw.trim()) || (!raw.includes('@') && (digits.length === 9 || (digits.length === 12 && digits.startsWith('998'))));
};

function TargetField({ id, value, onChange, isEmail, className }: { id: string; value: string; onChange: (v: string) => void; isEmail: boolean; className: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">Телефон или почта</span>
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">{isEmail ? <Mail size={18} /> : <Phone size={18} />}</span>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} autoComplete="username" inputMode={isEmail ? 'email' : 'text'} placeholder="Телефон или почта" className={`${className} pl-12 pr-4`} />
    </label>
  );
}

function FieldError({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="alert" className="-mt-1 pl-1 flex items-center gap-1.5 text-xs font-medium text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{text}</p>;
}

function YellowButton({ busy, disabled, children }: { busy: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={disabled} className="relative overflow-hidden w-full h-[54px] rounded-2xl text-[#111] font-bold text-[16px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50" style={{ background: YELLOW, boxShadow: '0 10px 30px rgba(255,200,61,.35)' }}>
      <span className="absolute inset-0 pg-flow opacity-70" aria-hidden="true" />
      <span className="relative inline-flex items-center gap-2">{busy ? <LoaderCircle size={20} className="animate-spin" /> : children}</span>
    </button>
  );
}

/** While the server checks: the whole screen blurs, energy runs down the cable and the battery fills. */
function SigningIn() {
  return (
    <div className="absolute inset-0 z-20 bg-[#070707]/70 backdrop-blur-xl grid place-items-center pg-reveal" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <ChargeScene dark className="block w-[260px] h-auto" />
        <p className="text-[15px] font-bold text-white">Входим…</p>
        <p className="text-xs text-white/50">Заряжаем ваш аккаунт</p>
      </div>
    </div>
  );
}

const splashSeen = () => {
  try {
    return sessionStorage.getItem('voli-splash') === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
};

/** Six boxes over one real input, so paste and the phone's code suggestion both work. */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative mt-6 block">
      <span className="sr-only">Код</span>
      <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus
        className="absolute inset-0 w-full h-full opacity-0" aria-label="Код из 6 цифр" />
      <span className="grid grid-cols-6 gap-2 pointer-events-none" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`h-14 rounded-2xl border-2 grid place-items-center text-[22px] font-bold text-white transition-colors ${i === value.length ? 'border-[#FFC83D] bg-[#FFC83D]/10 shadow-[0_0_18px_rgba(255,200,61,.35)]' : 'border-white/10 bg-white/[0.06]'}`}>{value[i] ?? ''}</span>
        ))}
      </span>
    </label>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-3 flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5">
      <TriangleAlert size={14} className="shrink-0 mt-px" /><span>{error}</span>
    </div>
  );
}

/** The language, right on the welcome: the device's is already on, one tap changes it. */
function LangChips() {
  const { lang, setLang } = useI18n();
  return (
    <div className="absolute top-3 right-3 z-10 flex gap-1 p-1 rounded-full bg-black/35 border border-white/15 backdrop-blur-md" role="radiogroup" aria-label="Язык приложения">
      {LANGS.map(l => (
        <button key={l.id} role="radio" aria-checked={lang === l.id} aria-label={l.full} onClick={() => setLang(l.id)}
          className={`h-7 min-w-[34px] px-2 rounded-full text-[11px] font-bold transition-colors ${lang === l.id ? 'bg-[#FFC83D] text-[#111]' : 'text-white/75 hover:text-white'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

const AppleMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.7 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.2-2.48-.03-.01-2.3-.88-2.31-3.55zM14.18 6.13c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.55 1.31-.56.65-1.05 1.69-.92 2.69.97.08 1.97-.49 2.57-1.22z" />
  </svg>
);

/**
 * The first screen: an electric car charging in Tashkent at dusk, the wordmark, three
 * short pages about Voli, and the two ways forward.
 */
function Welcome({ slide, onSlide, onStart, onSignIn, logoHidden = false, leaving = false, returning = false }: { slide: number; onSlide: (n: number) => void; onStart: () => void; onSignIn: () => void; logoHidden?: boolean; leaving?: boolean; returning?: boolean }) {
  const s = SLIDES[slide];
  return (
    <div className="relative min-h-full w-full overflow-hidden flex flex-col text-white bg-[#0a0a0a] pg-unblur" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* An electric car charging in Tashkent at dusk, fading into the dark where the buttons are */}
      <img src="/welcome/welcome.jpg" alt="" aria-hidden="true" className="absolute inset-x-0 top-0 w-full h-full object-cover object-[50%_40%] pg-kenburns" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(8,10,18,.55) 0%, rgba(8,10,18,.1) 30%, rgba(8,10,18,0) 50%, rgba(10,10,10,.75) 72%, rgba(10,10,10,.96) 84%)' }} />

      {!logoHidden && <LangChips />}
      <div className={`relative pt-14 flex flex-col items-center px-6 ${leaving ? 'sp5-out' : returning ? 'sp5-in' : ''}`} style={returning && !leaving ? { animationDelay: '.3s' } : undefined}>
        {/* Hidden while the splash's wordmark flies here, so the two never show at once */}
        <div data-welcome-logo style={{ opacity: logoHidden ? 0 : 1 }}><Logo size={64} ink="#FFFFFF" /></div>
        <h1 key={slide} className="mt-6 text-center text-[34px] font-extrabold leading-[1.1] tracking-tight pg-reveal" style={{ textShadow: "0 2px 18px rgba(0,0,0,.65)" }}>
          {s.a}<br /><span className="text-[#FFC83D]">{s.b}</span>
        </h1>
      </div>

      <div className={`relative mt-auto px-6 pb-8 ${leaving ? 'sp5-out' : returning ? 'sp5-in' : ''}`} style={returning && !leaving ? { animationDelay: '.38s' } : undefined}>
        <p key={`t${slide}`} className="text-center text-[15px] text-white/85 leading-snug min-h-[44px] pg-reveal">{s.text}</p>
        <div className="mt-5 flex justify-center gap-2" role="tablist" aria-label="О Voli">
          {SLIDES.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === slide} aria-label={`Страница ${i + 1}`} onClick={() => onSlide(i)} className={`h-2 rounded-full transition-all ${i === slide ? 'w-6 bg-[#FFC83D]' : 'w-2 bg-white/35'}`} />
          ))}
        </div>
        <button onClick={onStart} className="mt-6 w-full h-[56px] rounded-2xl text-[#111] font-bold text-[17px] active:scale-[0.98] transition-transform" style={{ background: YELLOW, boxShadow: '0 10px 30px rgba(255,200,61,.3)' }}>Начать</button>
        <p className="mt-4 text-center text-sm text-white/70">Уже есть аккаунт? <button onClick={onSignIn} className="font-bold text-[#FFC83D]">Войти</button></p>
      </div>
    </div>
  );
}

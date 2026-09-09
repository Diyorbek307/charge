import { useState, useEffect, useRef } from 'react';
import { Zap, Globe, ChevronRight, ArrowLeft, Eye, EyeOff, Check, Fingerprint } from 'lucide-react';

type AuthScreen = 'splash' | 'onboarding' | 'language' | 'phone' | 'otp' | 'pin-set' | 'pin-confirm' | 'biometric' | 'done';

const onboardingSlides = [
  {
    emoji: '🗺️',
    title: 'Единая карта\nУзбекистана',
    sub: 'Все зарядные станции разных операторов в одном приложении. ONE CHARGE работает по всей стране.',
  },
  {
    emoji: '⚡',
    title: 'Зарядка за\nнесколько секунд',
    sub: 'Отсканируйте QR-код — зарядка начнётся автоматически. Никаких лишних шагов.',
  },
  {
    emoji: '💳',
    title: 'Одна карта\nдля всего',
    sub: 'Привяжите карту один раз. Humo, Uzcard, Visa — оплата происходит автоматически после каждой зарядки.',
  },
  {
    emoji: '🤖',
    title: 'AI планировщик\nпоездок',
    sub: 'Задайте маршрут и уровень заряда. AI подберёт оптимальные остановки для зарядки.',
  },
];

const languages = [
  { code: 'uz', label: "O'zbek", flag: '🇺🇿', sub: 'Asosiy til' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', sub: 'Основной язык' },
  { code: 'en', label: 'English', flag: '🇬🇧', sub: 'International' },
];

function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-sky-600 to-sky-800 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
        <div className="absolute bottom-24 right-8 w-56 h-56 bg-white/5 rounded-full blur-3xl" />
      </div>
      {/* Animated rings */}
      <div className="relative mb-8">
        <div className="absolute inset-0 -m-8 rounded-full border-2 border-white/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-0 -m-4 rounded-full border border-white/15" />
        <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl shadow-black/30">
          <Zap size={44} className="text-sky-500" />
        </div>
      </div>
      <h1 className="text-3xl font-bold text-white tracking-tight">ONE CHARGE</h1>
      <p className="text-white/60 text-sm mt-1">Национальная EV-платформа · UZ</p>

      {/* Loading bar */}
      <div className="absolute bottom-16 left-12 right-12">
        <div className="h-0.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white/70 rounded-full animate-[loading_2s_ease-in-out_forwards]"
            style={{ animation: 'loading 2s ease-in-out forwards' }} />
        </div>
      </div>

      <style>{`
        @keyframes loading {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}

function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const slide = onboardingSlides[idx];
  const isLast = idx === onboardingSlides.length - 1;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Skip */}
      <div className="flex justify-end px-4 pt-4">
        <button onClick={onDone} className="text-xs text-slate-400 font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50">
          Пропустить
        </button>
      </div>

      {/* Slide */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-8">{slide.emoji}</div>
        <h2 className="text-2xl font-bold text-slate-900 whitespace-pre-line leading-tight mb-4">{slide.title}</h2>
        <p className="text-slate-500 text-sm leading-relaxed">{slide.sub}</p>
      </div>

      {/* Dots + nav */}
      <div className="px-6 pb-10 space-y-5">
        <div className="flex justify-center gap-1.5">
          {onboardingSlides.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-6 bg-sky-500' : 'w-1.5 bg-slate-200'}`} />
          ))}
        </div>
        <button
          onClick={() => isLast ? onDone() : setIdx(i => i + 1)}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-2xl py-4 font-semibold text-base transition-colors">
          {isLast ? 'Начать' : 'Далее'}
        </button>
      </div>
    </div>
  );
}

function LanguageScreen({ onDone }: { onDone: (lang: string) => void }) {
  const [selected, setSelected] = useState('ru');
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-5 pb-4 border-b border-slate-100 text-center">
        <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-sky-200">
          <Globe size={20} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Выберите язык</h1>
        <p className="text-sm text-slate-400 mt-0.5">Tilni tanlang · Select language</p>
      </div>
      <div className="flex-1 px-4 py-4 space-y-2">
        {languages.map(lang => (
          <button key={lang.code} onClick={() => setSelected(lang.code)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${selected === lang.code ? 'border-sky-500 bg-sky-50' : 'border-transparent bg-white'}`}>
            <span className="text-2xl">{lang.flag}</span>
            <div className="flex-1 text-left">
              <p className="font-semibold text-slate-900">{lang.label}</p>
              <p className="text-xs text-slate-400">{lang.sub}</p>
            </div>
            {selected === lang.code && (
              <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                <Check size={12} className="text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="px-4 pb-8">
        <button onClick={() => onDone(selected)}
          className="w-full bg-sky-500 text-white rounded-2xl py-4 font-semibold text-base">
          Продолжить
        </button>
      </div>
    </div>
  );
}

function PhoneScreen({ onDone }: { onDone: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  const formatted = phone.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-5 pb-4 border-b border-slate-100">
        <h1 className="text-xl font-bold text-slate-900 mb-0.5">Вход</h1>
        <p className="text-sm text-slate-400">Введите номер телефона для получения кода</p>
      </div>
      <div className="flex-1 px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border-2 border-sky-500 p-4">
          <p className="text-xs text-slate-400 mb-1">Номер телефона</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-lg">🇺🇿</span>
              <span className="text-sm font-semibold text-slate-700">+998</span>
            </div>
            <span className="text-xl font-semibold text-slate-900 mono tracking-widest">{formatted || '__ ___ __ __'}</span>
          </div>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button key={i}
              disabled={k === ''}
              onClick={() => {
                if (k === '⌫') setPhone(p => p.slice(0, -1));
                else if (phone.length < 9) setPhone(p => p + k);
              }}
              className={`h-14 rounded-2xl text-xl font-semibold transition-colors ${k === '' ? '' : k === '⌫' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300' : 'bg-white text-slate-900 border border-slate-100 hover:bg-slate-50 active:bg-slate-100 shadow-sm'}`}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-8">
        <button
          disabled={phone.length < 9}
          onClick={() => onDone('+998 ' + formatted)}
          className={`w-full rounded-2xl py-4 font-semibold text-base transition-colors ${phone.length >= 9 ? 'bg-sky-500 text-white hover:bg-sky-600' : 'bg-slate-200 text-slate-400'}`}>
          Получить SMS-код
        </button>
      </div>
    </div>
  );
}

function OTPScreen({ phone, onDone, onBack }: { phone: string; onDone: () => void; onBack: () => void }) {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(59);
  const [error, setError] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setTimer(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const next = [...otp];
    next[i] = v.slice(-1);
    setOtp(next);
    setError(false);
    if (v && i < 3) inputs.current[i + 1]?.focus();
    if (next.every(d => d !== '') && next.join('') !== '1234') {
      setTimeout(() => setError(true), 100);
    }
    if (next.join('') === '1234') setTimeout(onDone, 400);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">SMS-код</h1>
          <p className="text-xs text-slate-400">Отправлен на {phone}</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-4xl mb-6">📱</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">Введите код из SMS</h2>
        <p className="text-sm text-slate-400 text-center mb-8">Код действителен 10 минут<br /><span className="text-sky-500 font-medium">Подсказка: введите 1234</span></p>

        {/* OTP inputs */}
        <div className="flex gap-3 mb-6">
          {otp.map((v, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el; }}
              value={v}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => { if (e.key === 'Backspace' && !v && i > 0) inputs.current[i - 1]?.focus(); }}
              className={`w-14 h-14 text-center text-2xl font-bold rounded-2xl border-2 outline-none transition-colors ${error ? 'border-red-400 bg-red-50 text-red-500' : v ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-900'}`}
              maxLength={1}
              inputMode="numeric"
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-500 mb-4">Неверный код. Попробуйте ещё раз.</p>}

        {timer > 0 ? (
          <p className="text-sm text-slate-400">Повторная отправка через <span className="text-sky-500 font-semibold mono">0:{String(timer).padStart(2, '0')}</span></p>
        ) : (
          <button onClick={() => setTimer(59)} className="text-sm text-sky-500 font-semibold">Отправить снова</button>
        )}
      </div>
    </div>
  );
}

function PinSetScreen({ onDone, step }: { onDone: (pin: string) => void; step: 'set' | 'confirm'; firstPin?: string }) {
  const [pin, setPin] = useState<string[]>([]);

  useEffect(() => {
    if (pin.length === 4) {
      setTimeout(() => onDone(pin.join('')), 300);
    }
  }, [pin]);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-2xl">🔐</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">
          {step === 'set' ? 'Придумайте PIN-код' : 'Подтвердите PIN-код'}
        </h2>
        <p className="text-sm text-slate-400 text-center mb-8">Используется для быстрого входа в приложение</p>

        {/* Dots */}
        <div className="flex gap-4 mb-10">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < pin.length ? 'border-sky-500 bg-sky-500 scale-110' : 'border-slate-300 bg-transparent'}`} />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button key={i}
              disabled={k === ''}
              onClick={() => {
                if (k === '⌫') setPin(p => p.slice(0, -1));
                else if (pin.length < 4) setPin(p => [...p, k]);
              }}
              className={`h-14 rounded-2xl text-xl font-semibold transition-colors ${k === '' ? '' : k === '⌫' ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-white text-slate-900 border border-slate-100 hover:bg-slate-50 active:scale-95 shadow-sm'}`}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BiometricScreen({ onDone }: { onDone: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => { setDone(true); setTimeout(onDone, 700); }, 1500);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div
          onClick={handleScan}
          className={`w-28 h-28 rounded-3xl flex items-center justify-center mb-6 cursor-pointer transition-all duration-300 ${done ? 'bg-green-100 scale-110' : scanning ? 'bg-sky-100 scale-105' : 'bg-white border-2 border-slate-200 hover:border-sky-300 hover:bg-sky-50'}`}>
          {done
            ? <span className="text-5xl">✅</span>
            : <Fingerprint size={48} className={`transition-colors ${scanning ? 'text-sky-500' : 'text-slate-400'}`} />}
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {done ? 'Face ID настроен!' : scanning ? 'Сканирование...' : 'Включить Face ID / Touch ID'}
        </h2>
        <p className="text-sm text-slate-400 mb-8">
          {done ? 'Теперь вы можете входить с помощью биометрии' : 'Нажмите на иконку для настройки быстрого входа'}
        </p>
        {!scanning && !done && (
          <button onClick={onDone} className="text-sm text-slate-400 underline">Пропустить</button>
        )}
      </div>
    </div>
  );
}

export default function AuthFlow({ onComplete }: { onComplete: () => void }) {
  const [screen, setScreen] = useState<AuthScreen>('splash');
  const [phone, setPhone] = useState('');
  const [pin1, setPin1] = useState('');

  const renderScreen = () => {
    switch (screen) {
      case 'splash': return <SplashScreen onDone={() => setScreen('onboarding')} />;
      case 'onboarding': return <OnboardingScreen onDone={() => setScreen('language')} />;
      case 'language': return <LanguageScreen onDone={() => setScreen('phone')} />;
      case 'phone': return <PhoneScreen onDone={(p) => { setPhone(p); setScreen('otp'); }} />;
      case 'otp': return <OTPScreen phone={phone} onDone={() => setScreen('pin-set')} onBack={() => setScreen('phone')} />;
      case 'pin-set': return <PinSetScreen step="set" onDone={(p) => { setPin1(p); setScreen('pin-confirm'); }} />;
      case 'pin-confirm': return <PinSetScreen step="confirm" firstPin={pin1} onDone={(p) => {
        if (p === pin1) setScreen('biometric');
        else setScreen('pin-set');
      }} />;
      case 'biometric': return <BiometricScreen onDone={onComplete} />;
      default: return null;
    }
  };

  return <div className="h-full">{renderScreen()}</div>;
}

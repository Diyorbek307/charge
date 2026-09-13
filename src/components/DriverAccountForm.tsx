import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, MessageSquareText, ShieldCheck, TriangleAlert, UserPlus, KeyRound } from 'lucide-react';
import { useSync } from '../lib/sync';

interface Props {
  mode: 'register' | 'reset';
  ring: string;
  grad: string;
  onCancel: () => void;
  /** Called when a reset succeeded but 2FA still requires a normal sign-in. */
  onNeedsLogin: (phone: string) => void;
}

const inputClass = (ring: string) =>
  `w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:ring-2 ${ring}`;

/**
 * Driver sign-up and password recovery: phone → SMS code → new password.
 * Both flows share the same two steps; only the endpoint at the end differs.
 */
export default function DriverAccountForm({ mode, ring, grad, onCancel, onNeedsLogin }: Props) {
  const { actions, adoptSession } = useSync();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await actions.requestSmsCode(phone, mode);
      setPhone(sent.phone);
      setDemoCode(sent.demoCode ?? null);
      setStep('code');
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        const { token, user } = await actions.register(phone, code.trim(), name, password);
        adoptSession('driver', token, user);
      } else {
        const result = await actions.resetPassword(phone, code.trim(), password);
        if (result.token && result.user) adoptSession('driver', result.token, result.user);
        else onNeedsLogin(phone);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
      setBusy(false);
    }
  };

  const title = mode === 'register' ? 'Создать аккаунт' : 'Восстановить пароль';
  const Icon = mode === 'register' ? UserPlus : KeyRound;

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2 text-white">
        <Icon size={16} className="text-sky-400" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label htmlFor="driver-signup-name" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Имя и фамилия
              </label>
              <input id="driver-signup-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Alisher Tursunov" className={inputClass(ring)} />
            </div>
          )}
          <div>
            <label htmlFor="driver-signup-phone" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Номер телефона
            </label>
            <input
              id="driver-signup-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
              className={inputClass(ring)}
            />
          </div>
          <ErrorBox error={error} />
          <button
            type="submit"
            disabled={busy || phone.replace(/\D/g, '').length < 9 || (mode === 'register' && name.trim().length < 2)}
            className={`w-full bg-gradient-to-r ${grad} text-white font-semibold py-3 rounded-xl text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <MessageSquareText size={15} />}
            Получить SMS-код
          </button>
        </form>
      ) : (
        <form onSubmit={finish} className="space-y-3.5">
          <p className="text-xs text-slate-400">
            Код отправлен на <span className="text-white font-mono">{phone}</span>
          </p>
          {demoCode && (
            <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
              Демо-режим: SMS не отправляется. Ваш код — <span className="font-mono font-bold tracking-widest">{demoCode}</span>
            </p>
          )}
          <div>
            <label htmlFor="driver-signup-code" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Код из SMS
            </label>
            <input
              id="driver-signup-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className={`${inputClass(ring)} text-center text-lg tracking-[0.4em] font-mono`}
            />
          </div>
          <div>
            <label htmlFor="driver-signup-password" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {mode === 'register' ? 'Пароль' : 'Новый пароль'}
            </label>
            <input
              id="driver-signup-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Не короче 8 символов, буквы и цифры"
              className={inputClass(ring)}
            />
          </div>
          <ErrorBox error={error} />
          <button
            type="submit"
            disabled={busy || code.length !== 6 || password.length < 8}
            className={`w-full bg-gradient-to-r ${grad} text-white font-semibold py-3 rounded-xl text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {mode === 'register' ? 'Зарегистрироваться' : 'Сохранить пароль'}
          </button>
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={() => void sendCode()}
            className="w-full text-xs text-slate-400 hover:text-white disabled:text-slate-600 transition-colors"
          >
            {cooldown > 0 ? `Отправить код повторно через ${cooldown} с` : 'Отправить код повторно'}
          </button>
        </form>
      )}

      <button type="button" onClick={onCancel} className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors">
        Назад ко входу
      </button>
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
      <TriangleAlert size={14} className="shrink-0 mt-px" />
      <span>{error}</span>
    </div>
  );
}

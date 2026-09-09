import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Lock, LoaderCircle, ShieldCheck, TriangleAlert, Copy, Check } from 'lucide-react';
import { useSync } from '../lib/sync';
import { useI18n } from '../lib/i18n';
import type { Portal } from '../lib/api';

const THEME: Record<Portal, { grad: string; accent: string; ring: string; glow: string }> = {
  driver: { grad: 'from-sky-500 to-cyan-400', accent: 'text-sky-400', ring: 'focus:border-sky-400/60 focus:ring-sky-400/20', glow: 'rgba(14,165,233,0.35)' },
  operator: { grad: 'from-emerald-500 to-green-400', accent: 'text-emerald-400', ring: 'focus:border-emerald-400/60 focus:ring-emerald-400/20', glow: 'rgba(16,185,129,0.35)' },
  admin: { grad: 'from-violet-500 to-purple-400', accent: 'text-violet-400', ring: 'focus:border-violet-400/60 focus:ring-violet-400/20', glow: 'rgba(139,92,246,0.35)' },
  business: { grad: 'from-indigo-500 to-violet-500', accent: 'text-indigo-400', ring: 'focus:border-indigo-400/60 focus:ring-indigo-400/20', glow: 'rgba(99,102,241,0.35)' },
  api: { grad: 'from-slate-500 to-slate-400', accent: 'text-slate-300', ring: 'focus:border-slate-400/60 focus:ring-slate-400/20', glow: 'rgba(100,116,139,0.3)' },
};

interface Props {
  portal: Portal;
  title: string;
  subtitle: string;
  icon: ReactNode;
  onBack: () => void;
}

export default function PortalLogin({ portal, title, subtitle, icon, onBack }: Props) {
  const { login, credentials } = useSync();
  const { t } = useI18n();
  const theme = THEME[portal];
  const demo = credentials.find(c => c.portal === portal);

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(portal, loginValue.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'));
      setBusy(false);
    }
  };

  const fillDemo = () => {
    if (!demo) return;
    setLoginValue(demo.login);
    setPassword(demo.password);
    setError(null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="min-h-full w-full flex items-center justify-center px-4 py-8 sm:py-12 relative overflow-auto"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0a1424 0%, #04070e 55%, #02040a 100%)' }}
    >
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />

      <div className="relative w-full max-w-[400px]">
        <button
          onClick={onBack}
          className="mb-5 flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowRight size={14} className="rotate-180" />
          {t('nav.portals')}
        </button>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-7">
          <div
            className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${theme.grad} flex items-center justify-center text-white mb-5`}
            style={{ boxShadow: `0 4px 20px ${theme.glow}` }}
          >
            {icon}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-sm text-slate-400 mt-1.5 mb-6">{subtitle}</p>

          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label htmlFor={`${portal}-login`} className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                {portal === 'driver' ? t('auth.phone') : t('auth.login')}
              </label>
              <input
                id={`${portal}-login`}
                value={loginValue}
                onChange={e => setLoginValue(e.target.value)}
                autoComplete="username"
                placeholder={demo?.login ?? ''}
                className={`w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:ring-2 ${theme.ring}`}
              />
            </div>

            <div>
              <label htmlFor={`${portal}-password`} className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id={`${portal}-password`}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-3 pr-10 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:ring-2 ${theme.ring}`}
                />
                <Lock size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5"
              >
                <TriangleAlert size={14} className="shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !loginValue || !password}
              className={`w-full bg-gradient-to-r ${theme.grad} text-white font-semibold py-3 rounded-xl text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
            >
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {busy ? t('auth.checking') : t('auth.signIn')}
            </button>
          </form>

          {demo && (
            <div className="mt-5 pt-5 border-t border-white/8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{t('auth.demoAccess')}</p>
                <button
                  onClick={fillDemo}
                  className={`flex items-center gap-1.5 text-[11px] font-medium ${theme.accent} hover:brightness-125 transition`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? t('auth.filled') : t('auth.fill')}
                </button>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-slate-400">
                <p className="break-all">{demo.login}</p>
                <p>{demo.password}</p>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                {demo.name} · {demo.role}
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-4">
          {t('auth.ownAccount')}
        </p>
      </div>
    </div>
  );
}

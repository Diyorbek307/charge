import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldOff, Copy, Check, LoaderCircle, TriangleAlert, KeyRound } from 'lucide-react';
import { useSync } from '../lib/sync';
import type { Portal } from '../lib/api';

/**
 * TOTP enrolment for one portal's account.
 *
 * Enabling is two-step on purpose: the server hands out a secret but leaves
 * 2FA off until a generated code proves the authenticator app is actually
 * paired, so nobody can lock themselves out of a working account.
 */
export default function TwoFactorPanel({ portal }: { portal: Portal }) {
  const { actions, sessions } = useSync();
  const account = sessions[portal];

  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [disarming, setDisarming] = useState(false);

  const load = useCallback(() => {
    actions
      .get2fa(portal)
      .then(r => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, [actions, portal]);

  useEffect(load, [load]);

  const startSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await actions.setup2fa(portal);
      setSecret(r.secret);
      setUri(r.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать настройку');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.enable2fa(portal, code);
      setEnabled(true);
      setSecret(null);
      setUri(null);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Код не подошёл');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.disable2fa(portal, code);
      setEnabled(false);
      setDisarming(false);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Код не подошёл');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = () => {
    if (!secret) return;
    navigator.clipboard?.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!account) return null;

  const codeInput = (
    <input
      value={code}
      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      className="w-32 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center text-base tracking-[0.3em] font-mono text-slate-800 placeholder:text-slate-300 outline-none focus:border-sky-400"
    />
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${
            enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
          }`}
        >
          {enabled ? <ShieldCheck size={17} /> : <ShieldOff size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Двухфакторная аутентификация</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {enabled
              ? 'Включена — при входе запрашивается код из приложения'
              : 'Одноразовые коды TOTP (Google Authenticator, Authy, 1Password)'}
          </p>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
            enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {enabled ? 'ВКЛ' : 'ВЫКЛ'}
        </span>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <TriangleAlert size={13} className="shrink-0" />
          {error}
        </p>
      )}

      {/* Enrolment */}
      {!enabled && !secret && (
        <button
          onClick={startSetup}
          disabled={busy}
          className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
        >
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <KeyRound size={13} />}
          Настроить
        </button>
      )}

      {!enabled && secret && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              1 · Добавьте ключ в приложение
            </p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <code className="flex-1 text-xs font-mono text-slate-700 break-all">{secret}</code>
              <button
                onClick={copySecret}
                aria-label="Скопировать ключ"
                className="text-slate-400 hover:text-sky-600 shrink-0"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            {uri && (
              <p className="text-[10px] text-slate-400 mt-1.5 font-mono break-all leading-relaxed">{uri}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              2 · Введите код из приложения
            </p>
            <div className="flex items-center gap-2">
              {codeInput}
              <button
                onClick={confirm}
                disabled={busy || code.length !== 6}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                {busy ? '…' : 'Включить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Turning it off also needs a valid code. */}
      {enabled && !disarming && (
        <button
          onClick={() => { setDisarming(true); setError(null); }}
          className="text-xs text-red-500 hover:text-red-600 font-medium"
        >
          Отключить
        </button>
      )}

      {enabled && disarming && (
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-[11px] text-slate-500">Подтвердите кодом из приложения</p>
          <div className="flex items-center gap-2">
            {codeInput}
            <button
              onClick={disable}
              disabled={busy || code.length !== 6}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              {busy ? '…' : 'Отключить'}
            </button>
            <button
              onClick={() => { setDisarming(false); setCode(''); setError(null); }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

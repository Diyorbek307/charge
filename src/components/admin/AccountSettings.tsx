import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Monitor, Smartphone, User, Bell, Languages, RotateCcw, LoaderCircle } from 'lucide-react';
import type { Portal, SignedInDevice } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime } from '../../lib/analytics';
import TwoFactorPanel from '../TwoFactorPanel';
import PushToggle from '../PushToggle';
import LangSwitcher from '../LangSwitcher';
import { Page, Card } from './ui';

/** Settings every staff portal shares — only things the server actually applies. */
export default function AccountSettings({ portal, children }: { portal: Portal; children?: ReactNode }) {
  const { actions, sessions } = useSync();
  const me = sessions[portal];
  const [devices, setDevices] = useState<SignedInDevice[]>([]);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    actions.devices(portal).then(setDevices).catch(() => setDevices([]));
  }, [actions, portal]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await fn() });
      load();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Настройки" subtitle="Профиль, вход и безопасность, уведомления">
      {note && <p className={`text-sm rounded-xl px-4 py-3 ${note.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>{note.text}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title={<span className="flex items-center gap-2"><User size={15} className="text-sky-500" />Профиль</span>}>
          <dl className="space-y-2.5 text-sm">
            {[
              ['Имя', me?.name],
              ['Роль', me?.role],
              ['Организация', me?.org],
              ['Логин', me?.login],
              ['Последний вход', me?.lastLogin ? dateTime(me.lastLogin) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-50 pb-2 last:border-0">
                <dt className="text-slate-400">{k}</dt>
                <dd className="font-semibold text-slate-800 text-right">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title={<span className="flex items-center gap-2"><KeyRound size={15} className="text-sky-500" />Пароль</span>}>
          <div className="space-y-2.5">
            <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Текущий пароль" aria-label="Текущий пароль" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-400" />
            <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} placeholder="Новый пароль — от 8 символов, буквы и цифры" aria-label="Новый пароль" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-400" />
            <button
              disabled={!current || !next || busy}
              onClick={() => run(async () => { await actions.changePassword(portal, current, next); setCurrent(''); setNext(''); return 'Пароль изменён. На других устройствах нужно войти заново.'; })}
              className="w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {busy && <LoaderCircle size={14} className="animate-spin" />}Сохранить пароль
            </button>
          </div>
        </Card>
      </div>

      <TwoFactorPanel portal={portal} />

      <Card pad={false} title="Где выполнен вход" right={<span className="text-xs text-slate-400">{devices.length}</span>}>
        <ul className="divide-y divide-slate-50">
          {devices.map(d => (
            <li key={d.id} className="px-5 py-3 flex items-center gap-3 text-sm">
              <span className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500">{/iOS|Android/.test(d.device) ? <Smartphone size={15} /> : <Monitor size={15} />}</span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800">{d.device}</p>
                <p className="text-xs text-slate-400">{`вход ${dateTime(d.issued)} · активность ${dateTime(d.lastSeen)}`}</p>
              </div>
              {d.current && <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">это устройство</span>}
            </li>
          ))}
        </ul>
        <button
          disabled={busy || devices.length < 2}
          onClick={() => run(async () => { const { revoked } = await actions.signOutOthers(portal); return `Выполнен выход на других устройствах: ${revoked}`; })}
          className="w-full px-5 py-3 text-sm text-red-500 font-medium text-left border-t border-slate-50 disabled:opacity-40"
        >
          Выйти на всех других устройствах
        </button>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title={<span className="flex items-center gap-2"><Bell size={15} className="text-sky-500" />Уведомления</span>}>
          <p className="text-sm text-slate-500 mb-3">Push в этом браузере о событиях вашего кабинета.</p>
          <PushToggle portal={portal} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><Languages size={15} className="text-sky-500" />Язык интерфейса</span>}>
          <p className="text-sm text-slate-500 mb-3">Русский, O‘zbekcha или English.</p>
          <LangSwitcher />
        </Card>
      </div>

      {children}
    </Page>
  );
}

/** Admin-only: put the demo network back to its starting state (leads are kept). */
export function DemoReset() {
  const { actions, refresh } = useSync();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <Card title={<span className="flex items-center gap-2"><RotateCcw size={15} className="text-red-500" />Демо-данные</span>}>
      <p className="text-sm text-slate-500 mb-3">Вернуть демо-сеть к исходному состоянию: история, балансы и статусы пересоздаются, заявки партнёров сохраняются. Работает только в демо-режиме.</p>
      {!confirm ? (
        <button onClick={() => { setConfirm(true); setDone(false); }} className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold">Сбросить демо…</button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">Точно сбросить? Все пользователи будут разлогинены.</span>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await actions.resetDemo('admin'); await refresh(); setDone(true); } finally { setBusy(false); setConfirm(false); } }}
            className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            Да, сбросить
          </button>
          <button onClick={() => setConfirm(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">Отмена</button>
        </div>
      )}
      {done && <p className="text-sm text-emerald-600 mt-2">Демо-данные сброшены</p>}
    </Card>
  );
}

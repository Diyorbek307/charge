import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Car, ChevronRight, Plus, Wallet, Heart, Bell, Lock, Settings, Phone, LogOut, Building2,
  Zap, CheckCircle, LoaderCircle, Smartphone, Monitor, Calendar, Users, AlertTriangle, KeyRound, Send, PieChart, Gift, Home,
  ScanFace,
} from 'lucide-react';
import type { SyncEvent, SignedInDevice } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { plural } from '../../lib/analytics';
import PushToggle from '../PushToggle';
import TwoFactorPanel from '../TwoFactorPanel';
import { useFavorites } from './favorites';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const phone = (p = '') => (/^\+998\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11)}` : p);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  if (m < 24 * 60) return `${Math.round(m / 60)} ч назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Tashkent' });
};

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
      <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
      <h1 className="text-base font-bold text-slate-900">{title}</h1>
    </div>
  );
}

export function ProfileScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const { state, sessions, logout, updateAccount } = useSync();
  const me = sessions.driver;
  const { ids: favorites } = useFavorites();
  const [unread, setUnread] = useState(0);
  const { actions } = useSync();
  useEffect(() => {
    if (!me) return;
    actions.notifications('driver').then(list => {
      const seen = Number(localStorageGet(`oc-notes-seen-${me.id}`) ?? 0);
      setUnread(list.filter(n => Date.parse(n.ts) > seen).length);
    }).catch(() => {});
  }, [actions, me]);

  if (!me) return null;
  const charges = (state?.sessions ?? []).filter(s => s.userId === me.id && s.status === 'completed').length;
  const balance = state?.wallets[me.id]?.balance ?? 0;
  const companyCar = state?.vehicles.find(v => v.driverId === me.id);
  const employer = state?.employer;
  const pendingFamily = (state?.family?.payers ?? []).filter(p => p.status === 'pending').length;
  const car = me.car;
  const on = state?.platform?.features ?? { plus: true, rewards: true, autocharge: true, battery: true, referral: true };

  const menu: { icon: ReactNode; label: string; badge?: string; screen: string }[] = [
    { icon: <Wallet size={16} className="text-emerald-500" />, label: 'Кошелёк', badge: sum(balance), screen: 'wallet' },
    { icon: <PieChart size={16} className="text-sky-500" />, label: 'Расходы и экономия', screen: 'finance' },
    ...(on.plus || state?.plus?.active ? [{ icon: <span className="text-[11px] font-black leading-none px-1 py-0.5 rounded bg-[#FFC83D] text-[#111]" aria-hidden="true">+</span>, label: 'Voli Plus', badge: state?.plus?.active ? 'активен' : `−${state?.plus?.discount ?? 5}%`, screen: 'plus' }] : []),
    ...(on.rewards || (state?.rewards?.bonus.balance ?? 0) > 0 ? [{ icon: <span className="text-[15px] leading-none" aria-hidden="true">🎁</span>, label: 'Награды и бонусы', badge: state?.rewards?.bonus.balance ? sum(state.rewards.bonus.balance) : state?.rewards?.achievements.some(a => !a.grantedAt) ? 'новые' : undefined, screen: 'rewards' }] : []),
    ...(on.referral ? [{ icon: <span className="text-[15px] leading-none" aria-hidden="true">🤝</span>, label: 'Приведи друга', badge: 'бонусы', screen: 'referral' }] : []),
    { icon: <Gift size={16} className="text-violet-500" />, label: 'Баллы', screen: 'loyalty' },
    { icon: <ScanFace size={16} className="text-amber-500" />, label: 'Зарядка в долг', badge: state?.credit?.debt ? sum(state.credit.debt) : undefined, screen: 'credit' },
    { icon: <Users size={16} className="text-indigo-500" />, label: 'Семейный кошелёк', badge: pendingFamily ? String(pendingFamily) : undefined, screen: 'family' },
    { icon: <Home size={16} className="text-emerald-600" />, label: 'Моя зарядка для других', screen: 'host' },
    { icon: <Heart size={16} className="text-red-400" />, label: 'Избранные станции', badge: favorites.length ? String(favorites.length) : undefined, screen: 'favorites' },
    { icon: <Bell size={16} className="text-amber-400" />, label: 'Уведомления', badge: unread ? String(unread) : undefined, screen: 'notifications' },
    { icon: <Lock size={16} className="text-slate-400" />, label: 'Безопасность', screen: 'security' },
    { icon: <Settings size={16} className="text-slate-400" />, label: 'Настройки', screen: 'app-settings' },
    { icon: <Phone size={16} className="text-sky-400" />, label: 'Поддержка', screen: 'support' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white text-xl font-bold shadow">{me.avatar}</div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">{me.name}</h1>
            <p className="text-sm text-slate-500">{phone(me.login)}</p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Zap size={11} />{`${charges} ${plural(charges, ['зарядка', 'зарядки', 'зарядок'])} за последние 60 дней`}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {employer && (
          <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)' }}>
            <p className="text-xs text-white/70 flex items-center gap-1.5"><Building2 size={12} />{`Сотрудник · ${employer.org}`}</p>
            <p className="text-sm font-semibold mt-1">{`Лимит на зарядку: осталось ${sum(employer.left)} из ${sum(employer.limit)}`}</p>
            <div className="h-1.5 rounded-full bg-white/20 mt-2 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (employer.spent / Math.max(1, employer.limit)) * 100)}%` }} /></div>
            <p className="text-[11px] text-white/60 mt-1.5">При старте зарядки выберите «За счёт компании»</p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100"><p className="text-xs font-semibold text-slate-500">МОЙ АВТОМОБИЛЬ</p></div>
          {car ? (
            <button onClick={() => onNavigate('add-car')} className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50">
              <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><Car size={20} className="text-sky-600" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{`${car.brand} ${car.model}`}</p>
                <p className="text-xs text-slate-400">{`${car.year} · ${car.battery} кВт·ч · ${car.port} · до ${car.maxKw} кВт`}</p>
                <p className="text-xs text-sky-600">{`Лимит ${car.chargeLimit ?? 80}% · запас хода ≈ ${Math.round((car.battery * (car.chargeLimit ?? 80)) / 100 / 0.18)} км`}</p>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ) : null}
          {car && on.autocharge ? (
            <button onClick={() => onNavigate('autocharge')} className="w-full px-4 py-3 flex items-center gap-3 text-left border-t border-slate-50 hover:bg-slate-50">
              <span className="w-10 h-10 bg-[#111] rounded-xl flex items-center justify-center text-[#FFC83D] text-lg" aria-hidden="true">⚡</span>
              <span className="flex-1 text-sm font-semibold text-slate-800">Autocharge</span>
              <span className="text-xs text-slate-400">{state?.autocharge?.cars.length ? 'включён' : 'без QR и телефона'}</span>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ) : null}
          {car && on.battery ? (
            <button onClick={() => onNavigate('battery')} className="w-full px-4 py-3 flex items-center gap-3 text-left border-t border-slate-50 hover:bg-slate-50">
              <span className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-lg" aria-hidden="true">🔋</span>
              <span className="flex-1 text-sm font-semibold text-slate-800">Здоровье батареи</span>
              <span className="text-xs text-slate-400">отчёт для продажи</span>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ) : !car && companyCar ? (
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center"><Car size={20} className="text-indigo-600" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{companyCar.model}</p>
                <p className="text-xs text-slate-400">{`Служебный · ${companyCar.plate} · заряд ${companyCar.battery}%`}</p>
              </div>
            </div>
          ) : null}
          {!car && (
            <button onClick={() => onNavigate('add-car')} className="p-4 flex items-center gap-3 w-full border-t border-slate-50 hover:bg-slate-50">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><Plus size={16} className="text-slate-400" /></div>
              <span className="text-sm text-slate-500 text-left">Добавить свой автомобиль — точнее время и стоимость зарядки</span>
            </button>
          )}
        </div>

        <button onClick={() => onNavigate('eco')} className="w-full rounded-2xl p-4 flex items-center gap-3 text-left text-white" style={{ background: 'linear-gradient(135deg,#16A34A,#0D9488)' }}>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">🌱</div>
          <div className="flex-1">
            <p className="text-sm font-bold">Эко-профиль</p>
            <p className="text-xs text-green-100">CO₂, достижения, зелёные часы и лидеры</p>
          </div>
          <ChevronRight size={16} className="text-green-100" />
        </button>

        <PushToggle portal="driver" />

        {me.telegram && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center"><Send size={17} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{`Telegram${me.telegram.username ? ` · @${me.telegram.username}` : ''}`}</p>
              <p className="text-xs text-slate-400">Вход в один тап в Telegram, уведомления приходят от бота</p>
            </div>
            <button onClick={() => void actions.telegramUnlink().then(r => updateAccount('driver', r.user)).catch(() => {})} className="text-xs text-red-500 font-medium">Отвязать</button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {menu.map(item => (
            <button key={item.label} onClick={() => onNavigate(item.screen)} className="p-4 flex items-center gap-3 w-full border-b border-slate-50 last:border-none hover:bg-slate-50">
              <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center">{item.icon}</div>
              <span className="flex-1 text-sm font-medium text-slate-700 text-left">{item.label}</span>
              {item.badge && <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full tabular-nums">{item.badge}</span>}
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>

        <button onClick={() => void logout('driver')} className="w-full py-3 flex items-center justify-center gap-2 text-red-500 text-sm font-medium">
          <LogOut size={16} />Выйти из аккаунта
        </button>
        <DeleteAccount onDeleted={() => void logout('driver')} />
      </div>
    </div>
  );
}

/** Deleting the account for good, as the app stores require: the password, a plain warning, then it is gone. */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const { actions } = useSync();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await actions.deleteAccount(password);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return <button onClick={() => setOpen(true)} className="w-full pb-4 text-xs text-slate-400 underline underline-offset-2">Удалить аккаунт</button>;
  }
  return (
    <div className="bg-white rounded-2xl border border-red-100 p-4 space-y-3" role="group" aria-label="Удаление аккаунта">
      <p className="text-sm font-bold text-slate-900">Удалить аккаунт навсегда?</p>
      <p className="text-xs text-slate-500 leading-relaxed">Удалятся имя, телефон, пароль, автомобиль, фото для зарядки в долг, бонусы, чат поддержки и приглашения. История зарядок и платежей останется без вашего имени — её требуется хранить для бухгалтерии. Восстановить аккаунт будет нельзя.</p>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль" aria-label="Пароль для удаления аккаунта" autoComplete="current-password" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setOpen(false); setPassword(''); setError(''); }} className="h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Отмена</button>
        <button onClick={() => void confirm()} disabled={busy || !password} className="h-11 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          {busy && <LoaderCircle size={14} className="animate-spin" />}Удалить
        </button>
      </div>
    </div>
  );
}

function localStorageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function SecurityScreen({ onBack }: { onBack: () => void }) {
  const { actions } = useSync();
  const [devices, setDevices] = useState<SignedInDevice[]>([]);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState<'pw' | 'devices' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    actions.devices('driver').then(setDevices).catch(() => setDevices([]));
  }, [actions]);
  useEffect(load, [load]);

  const changePassword = async () => {
    setBusy('pw');
    setNote(null);
    try {
      await actions.changePassword('driver', current, next);
      setCurrent('');
      setNext('');
      setNote({ ok: true, text: 'Пароль изменён. На других устройствах нужно войти заново.' });
      load();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const signOutOthers = async () => {
    setBusy('devices');
    try {
      const { revoked } = await actions.signOutOthers('driver');
      setNote({ ok: true, text: revoked ? `Выполнен выход на других устройствах: ${revoked}` : 'Других устройств нет' });
      load();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Header title="Безопасность" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {note && <p className={`text-sm rounded-xl px-3 py-2.5 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><KeyRound size={15} className="text-sky-500" />Сменить пароль</p>
          <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Текущий пароль" aria-label="Текущий пароль" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-400" />
          <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} placeholder="Новый пароль — от 8 символов, буквы и цифры" aria-label="Новый пароль" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-400" />
          <button onClick={changePassword} disabled={!current || !next || busy === 'pw'} className="w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy === 'pw' && <LoaderCircle size={14} className="animate-spin" />}Сохранить пароль
          </button>
        </div>

        <TwoFactorPanel portal="driver" />

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Где выполнен вход</p>
            <span className="text-xs text-slate-400">{devices.length}</span>
          </div>
          {devices.map(d => (
            <div key={d.id} className="px-4 py-3 flex items-center gap-3 border-b border-slate-50 last:border-0">
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center">{/iOS|Android/.test(d.device) ? <Smartphone size={15} className="text-slate-500" /> : <Monitor size={15} className="text-slate-500" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{d.device}</p>
                <p className="text-xs text-slate-400">{`вход ${ago(d.issued)} · активность ${ago(d.lastSeen)}`}</p>
              </div>
              {d.current && <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">это устройство</span>}
            </div>
          ))}
          <button onClick={signOutOthers} disabled={busy === 'devices' || devices.length < 2} className="w-full px-4 py-3 text-sm text-red-500 font-medium text-left disabled:opacity-40">
            Выйти на всех других устройствах
          </button>
        </div>
      </div>
    </div>
  );
}

const NOTE_ICON: Record<string, ReactNode> = {
  'session.start': <Zap size={15} className="text-sky-500" />,
  'session.stop': <CheckCircle size={15} className="text-emerald-500" />,
  'wallet.topup': <Wallet size={15} className="text-emerald-500" />,
  'wallet.refund': <Wallet size={15} className="text-amber-500" />,
  'booking.create': <Calendar size={15} className="text-violet-500" />,
  'booking.cancel': <Calendar size={15} className="text-slate-400" />,
  'booking.expire': <Calendar size={15} className="text-amber-500" />,
  'queue.join': <Users size={15} className="text-sky-500" />,
  'queue.ready': <Users size={15} className="text-emerald-500" />,
  'alert.new': <AlertTriangle size={15} className="text-amber-500" />,
  'auth.password': <Lock size={15} className="text-slate-500" />,
};

/** What happened on this account: charges, payments, bookings, queue — straight from the event log. */
export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const { actions, sessions, events } = useSync();
  const me = sessions.driver;
  const [list, setList] = useState<SyncEvent[] | null>(null);
  const latest = events[0]?.id;
  useEffect(() => {
    actions.notifications('driver').then(setList).catch(() => setList([]));
  }, [actions, latest]);
  useEffect(() => {
    if (me) localStorageSet(`oc-notes-seen-${me.id}`, String(Date.now()));
  }, [me, list]);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Header title="Уведомления" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {list === null ? (
          <p className="flex items-center justify-center gap-2 text-sm text-slate-400 py-10"><LoaderCircle size={15} className="animate-spin" />Загружаем…</p>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">Здесь появятся ваши зарядки, платежи и брони</p>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {list.map(n => (
              <div key={n.id} className="px-4 py-3 flex items-start gap-3 border-b border-slate-50 last:border-0">
                <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">{NOTE_ICON[n.type] ?? <Bell size={15} className="text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{ago(n.ts)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

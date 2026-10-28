import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Fuel, Star, Users, Plus, Trash2, Check, X, Home, Building2, Hotel,
  ParkingCircle, Coffee, LocateFixed, LoaderCircle, Zap, Phone, Truck, BatteryCharging, Wrench, AlertTriangle, Send, Share2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Loyalty, FamilyState, HostOverview, HostKind, SosKind, SosRequest, Session } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { locate } from '../../lib/geo';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const KM_PER_KWH = 1 / 0.18;
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const tk = (iso: string) => new Date(Date.parse(iso) + 5 * 3600_000);
const lsGet = (k: string, d: number) => {
  try {
    const v = Number(localStorage.getItem(k));
    return v > 0 ? v : d;
  } catch {
    return d;
  }
};
const lsSet = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* private mode */
  }
};

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
      <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
      <h1 className="text-base font-bold text-slate-900 flex-1">{title}</h1>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance assistant
// ---------------------------------------------------------------------------

/** What charging costs per month and per km, and what the same driving would cost on petrol. */
export function FinanceScreen({ onBack }: { onBack: () => void }) {
  const { state, sessions } = useSync();
  const me = sessions.driver;
  const now = tk(new Date().toISOString());
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [cursor, setCursor] = useState({ y: now.getUTCFullYear(), m: now.getUTCMonth() });
  const [litres, setLitres] = useState(() => lsGet('oc-petrol-l100', 8));
  const [fuelPrice, setFuelPrice] = useState(() => lsGet('oc-petrol-price', 10000));

  const mine = useMemo(() => (state?.sessions ?? []).filter(s => s.userId === me?.id && s.status === 'completed'), [state?.sessions, me?.id]);
  const inPeriod = mine.filter(s => {
    const d = tk(s.start);
    return d.getUTCFullYear() === cursor.y && (period === 'year' || d.getUTCMonth() === cursor.m);
  });
  const paidByMe = (s: Session) => !s.corporate && !(s as Session & { familyOwner?: string }).familyOwner;
  const energy = inPeriod.reduce((n, s) => n + s.energy, 0);
  const spent = inPeriod.filter(paidByMe).reduce((n, s) => n + s.cost, 0);
  const allCost = inPeriod.reduce((n, s) => n + s.cost, 0);
  const km = energy * KM_PER_KWH;
  const petrol = (km / 100) * litres * fuelPrice;
  const saved = petrol - allCost;
  const night = inPeriod.filter(s => s.multiplier === 0.7).length;

  // Bars by day (month) or by month (year), split fast DC / slow AC.
  const bars = useMemo(() => {
    if (period === 'month') {
      const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
      return Array.from({ length: days }, (_, i) => {
        const list = inPeriod.filter(s => tk(s.start).getUTCDate() === i + 1);
        return { label: String(i + 1), dc: Math.round(list.filter(s => (s.power ?? 50) >= 50).reduce((n, s) => n + s.energy, 0)), ac: Math.round(list.filter(s => (s.power ?? 50) < 50).reduce((n, s) => n + s.energy, 0)) };
      });
    }
    return MONTHS.map((m, i) => {
      const list = inPeriod.filter(s => tk(s.start).getUTCMonth() === i);
      return { label: m.slice(0, 3), dc: Math.round(list.filter(s => (s.power ?? 50) >= 50).reduce((n, s) => n + s.energy, 0)), ac: Math.round(list.filter(s => (s.power ?? 50) < 50).reduce((n, s) => n + s.energy, 0)) };
    });
  }, [inPeriod, period, cursor]);
  const dcShare = energy ? (bars.reduce((n, b) => n + b.dc, 0) / Math.max(1, energy)) * 100 : 0;

  const step = (d: number) => setCursor(c => (period === 'year' ? { ...c, y: c.y + d } : { y: c.m + d < 0 ? c.y - 1 : c.m + d > 11 ? c.y + 1 : c.y, m: (c.m + d + 12) % 12 }));

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Header title="Расходы и экономия" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
          {(['month', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${period === p ? 'bg-sky-500 text-white' : 'text-slate-500'}`}>{p === 'month' ? 'Месяц' : 'Год'}</button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => step(-1)} aria-label="Раньше" className="p-2 rounded-xl bg-white border border-slate-100"><ChevronLeft size={16} /></button>
          <p className="font-bold text-slate-900">{period === 'year' ? String(cursor.y) : `${MONTHS[cursor.m]} ${cursor.y}`}</p>
          <button onClick={() => step(1)} aria-label="Позже" className="p-2 rounded-xl bg-white border border-slate-100"><ChevronRight size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl border border-slate-100 p-3"><p className="text-[11px] text-slate-400">Заряжено</p><p className="text-xl font-bold text-slate-900 tabular-nums">{`${Math.round(energy)} кВт·ч`}</p></div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3"><p className="text-[11px] text-slate-400">Потрачено вами</p><p className="text-xl font-bold text-slate-900 tabular-nums">{sum(spent)}</p></div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3"><p className="text-[11px] text-slate-400">Стоимость 1 км</p><p className="text-xl font-bold text-slate-900 tabular-nums">{km ? `${Math.round(allCost / km)} сум` : '—'}</p></div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3"><p className="text-[11px] text-slate-400">Проехать можно</p><p className="text-xl font-bold text-slate-900 tabular-nums">{`≈ ${Math.round(km)} км`}</p></div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2">{period === 'month' ? 'кВт·ч по дням' : 'кВт·ч по месяцам'}</p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={bars} margin={{ left: -24, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={period === 'month' ? 6 : 1} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v, n) => [`${v} кВт·ч`, n === 'dc' ? 'Быстрая DC' : 'Медленная AC']} />
              <Bar dataKey="ac" stackId="e" fill="#4F6BFF" radius={[0, 0, 0, 0]} />
              <Bar dataKey="dc" stackId="e" fill="#0AAF97" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-[11px] text-slate-500 mt-1">
            <span><span className="inline-block w-2 h-2 rounded-full bg-[#0AAF97] mr-1" />{`Быстрая DC ${Math.round(dcShare)}%`}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-[#4F6BFF] mr-1" />{`Медленная AC ${Math.round(100 - dcShare)}%`}</span>
            <span>{`Ночью: ${night}`}</span>
          </div>
        </div>

        <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#059669,#0AAF97)' }}>
          <p className="text-xs text-white/80 flex items-center gap-1.5"><Fuel size={13} />По сравнению с бензиновой машиной</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{saved > 0 ? `≈ ${sum(saved)} экономии` : '—'}</p>
          <p className="text-xs text-white/80 mt-1">{`Бензин на ${Math.round(km)} км: ≈ ${sum(petrol)} · электричество: ${sum(allCost)}`}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Расход бензина, л/100 км
            <input type="number" min={3} max={25} step={0.5} value={litres} onChange={e => { const v = Number(e.target.value); setLitres(v); lsSet('oc-petrol-l100', v); }} className="mt-1 w-full px-2.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-800" />
          </label>
          <label className="text-xs text-slate-500">
            Цена литра, сум
            <input type="number" min={1000} max={50000} step={100} value={fuelPrice} onChange={e => { const v = Number(e.target.value); setFuelPrice(v); lsSet('oc-petrol-price', v); }} className="mt-1 w-full px-2.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-800" />
          </label>
          <p className="col-span-2 text-[11px] text-slate-400">Укажите свою машину и цену, по которой заправлялись. Пробег оценён по 0,18 кВт·ч на км.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

const TIER: Record<Loyalty['tier'], { label: string; color: string }> = {
  start: { label: 'Старт', color: '#64748B' },
  silver: { label: 'Серебро', color: '#94A3B8' },
  gold: { label: 'Золото', color: '#F59E0B' },
};

export function LoyaltyScreen({ onBack }: { onBack: () => void }) {
  const { actions, refresh } = useSync();
  const [data, setData] = useState<Loyalty | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    actions.loyalty().then(setData).catch(e => setNote({ ok: false, text: (e as Error).message }));
  }, [actions]);
  useEffect(load, [load]);

  const redeem = async (points: number) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await actions.redeemPoints(points);
      setData(r.loyalty);
      await refresh();
      setNote({ ok: true, text: `+${sum(r.amount)} на кошелёк` });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Header title="Баллы" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!data ? (
          <p className="flex justify-center py-10 text-slate-400"><LoaderCircle size={18} className="animate-spin" /></p>
        ) : (
          <>
            <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#2F3DB8,#4F6BFF)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/80">Ваш баланс</p>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 flex items-center gap-1"><Star size={11} style={{ color: TIER[data.tier].color }} fill={TIER[data.tier].color} />{TIER[data.tier].label}</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{`${data.balance.toLocaleString('ru-RU')} баллов`}</p>
              <p className="text-xs text-white/80">{`= ${sum(data.valueUzs)} на кошелёк`}</p>
              {data.next && (
                <>
                  <div className="h-1.5 rounded-full bg-white/20 mt-3 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (data.earned90 / (data.earned90 + data.next.need)) * 100)}%` }} /></div>
                  <p className="text-[11px] text-white/70 mt-1">{`До уровня «${TIER[data.next.tier].label}» — ${data.next.need} баллов за 90 дней`}</p>
                </>
              )}
              {data.trusted && <p className="text-[11px] mt-2 font-semibold">Надёжный участник сообщества</p>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[100, 500, Math.floor(data.balance / 100) * 100].filter((v, i, a) => v >= 100 && a.indexOf(v) === i).map(p => (
                <button key={p} disabled={busy || p > data.balance} onClick={() => redeem(p)} className="py-2.5 rounded-xl bg-white border border-slate-100 text-sm font-semibold text-slate-700 disabled:opacity-40">{`${p} → ${sum(p * 10)}`}</button>
              ))}
            </div>
            {note && <p className={`text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-1.5 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Как получить баллы</p>
              <p>• 1 балл за каждый кВт·ч на любой станции сети</p>
              <p>• 5 баллов, когда другие водители подтверждают вашу отметку о станции</p>
              <p className="text-xs text-slate-400">100 баллов = 1 000 сум на кошелёк. Уровень — по баллам за последние 90 дней.</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <p className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-50">ИСТОРИЯ</p>
              {data.history.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Пока пусто — зарядитесь, и баллы появятся</p>}
              {data.history.map(h => (
                <div key={h.id} className="px-4 py-2.5 flex justify-between gap-3 text-sm border-b border-slate-50 last:border-0">
                  <span className="text-slate-600 truncate">{h.reason}</span>
                  <span className={`font-semibold tabular-nums ${h.delta > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{`${h.delta > 0 ? '+' : ''}${h.delta}`}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Family wallet
// ---------------------------------------------------------------------------

export function FamilyScreen({ onBack }: { onBack: () => void }) {
  const { actions, refresh } = useSync();
  const [data, setData] = useState<FamilyState | null>(null);
  const [phone, setPhone] = useState('+998');
  const [limit, setLimit] = useState('300000');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    actions.family().then(setData).catch(() => {});
  }, [actions]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<FamilyState>, ok: string) => {
    setNote(null);
    try {
      setData(await fn());
      await refresh();
      setNote({ ok: true, text: ok });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Header title="Семейный кошелёк" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <p className="text-sm text-slate-500">Близкие заряжаются с вашего кошелька, каждый в пределах месячного лимита. Вы видите их расходы.</p>
        {note && <p className={`text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}

        {data?.payers.map(p => (
          <div key={p.ownerId} className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3">
            <p className="text-sm font-semibold text-slate-800">{p.status === 'pending' ? `${p.name} приглашает вас` : `Кошелёк ${p.name}`}</p>
            <p className="text-xs text-slate-500">{p.status === 'pending' ? `Лимит ${sum(p.limit)} в месяц` : `Осталось ${sum(p.left)} из ${sum(p.limit)} — выберите при старте зарядки`}</p>
            {p.status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => run(() => actions.answerFamily(p.ownerId, true), 'Приглашение принято')} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1"><Check size={14} />Принять</button>
                <button onClick={() => run(() => actions.answerFamily(p.ownerId, false), 'Приглашение отклонено')} className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-sm inline-flex items-center justify-center gap-1"><X size={14} />Отклонить</button>
              </div>
            )}
          </div>
        ))}

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-50">МОЯ СЕМЬЯ</p>
          {data?.members.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Пока никого — пригласите по номеру телефона</p>}
          {data?.members.map(m => (
            <div key={m.memberId} className="px-4 py-3 border-b border-slate-50 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.status === 'pending' ? 'ждёт подтверждения' : `${sum(m.spent)} из ${sum(m.limit)} в этом месяце`}</p>
                </div>
                <button onClick={() => run(() => actions.updateFamily(m.memberId, { remove: true }), 'Удалён из семьи')} aria-label={`Удалить ${m.name}`} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
              {m.status === 'active' && (
                <div className="flex gap-1.5 mt-2">
                  {[100000, 300000, 500000].map(v => (
                    <button key={v} onClick={() => run(() => actions.updateFamily(m.memberId, { limit: v }), 'Лимит обновлён')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${m.limit === v ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{`${v / 1000}k`}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2" onSubmit={e => { e.preventDefault(); void run(() => actions.inviteFamily(phone.replace(/\s/g, ''), Number(limit)), 'Приглашение отправлено'); }}>
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Users size={15} className="text-sky-500" />Пригласить</p>
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" aria-label="Телефон" placeholder="+998 90 123 45 67" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
          <input value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, ''))} inputMode="numeric" aria-label="Лимит в месяц, сум" placeholder="Лимит в месяц, сум" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
          <button type="submit" className="w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Plus size={14} />Пригласить</button>
          <p className="text-[11px] text-slate-400">Человек должен быть зарегистрирован в приложении. До 5 членов семьи.</p>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Private host
// ---------------------------------------------------------------------------

const HOST_KINDS: { id: HostKind; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Дом', icon: <Home size={16} /> },
  { id: 'hotel', label: 'Гостиница', icon: <Hotel size={16} /> },
  { id: 'business', label: 'Бизнес-центр', icon: <Building2 size={16} /> },
  { id: 'parking', label: 'Парковка', icon: <ParkingCircle size={16} /> },
  { id: 'cafe', label: 'Кафе / ресторан', icon: <Coffee size={16} /> },
];
const PORTS = ['Type2', 'CCS2', 'GB/T DC', 'CHAdeMO'];
const STATUS = { pending: 'На проверке', approved: 'Одобрена', rejected: 'Отклонена' };

export function HostScreen({ onBack }: { onBack: () => void }) {
  const { actions } = useSync();
  const [data, setData] = useState<HostOverview | null>(null);
  const [kind, setKind] = useState<HostKind>('home');
  const [form, setForm] = useState({ name: '', city: '', address: '', lat: '', lng: '', hours: '24/7' });
  const [ports, setPorts] = useState([{ type: 'Type2', power: '7.4', price: '1200' }]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    actions.myHosting().then(setData).catch(() => {});
  }, [actions]);
  useEffect(load, [load]);

  const here = async () => {
    const p = await locate();
    if (p) setForm(f => ({ ...f, lat: p.lat.toFixed(5), lng: p.lng.toFixed(5) }));
    else setNote({ ok: false, text: 'Геолокация недоступна — введите координаты вручную' });
  };
  const submit = async () => {
    setBusy(true);
    setNote(null);
    try {
      await actions.applyHost({ kind, name: form.name, city: form.city, address: form.address, geoLat: Number(form.lat), geoLng: Number(form.lng), hours: form.hours, connectors: ports.map(p => ({ type: p.type, power: Number(p.power), price: Number(p.price) })) });
      setNote({ ok: true, text: 'Заявка отправлена. Мы проверим её и сообщим результат.' });
      load();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const pending = data?.applications.some(a => a.status === 'pending');
  const origin = typeof location !== 'undefined' ? location.origin.replace(/^http/, 'ws') : '';

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Header title="Моя зарядка для других" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#059669,#0AAF97)' }}>
          <p className="text-sm font-bold">Зарабатывайте на своей зарядке</p>
          <p className="text-xs text-white/85 mt-1">{`Дом, гостиница, офис или парковка: подключите зарядку к сети, водители найдут её на карте. Вы задаёте цену, платформа удерживает ${data?.commission ?? 10}%, остальное — на ваш кошелёк после каждой зарядки.`}</p>
        </div>

        {data && data.stations.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-2">Доход</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[11px] text-slate-400">Зарядок</p><p className="font-bold tabular-nums">{data.sessions}</p></div>
              <div><p className="text-[11px] text-slate-400">кВт·ч</p><p className="font-bold tabular-nums">{data.energy}</p></div>
              <div><p className="text-[11px] text-slate-400">Вам</p><p className="font-bold tabular-nums text-emerald-600">{sum(data.net)}</p></div>
            </div>
          </div>
        )}

        {data?.applications.map(a => (
          <div key={a.id} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${a.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : a.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{STATUS[a.status]}</span>
            </div>
            <p className="text-xs text-slate-400">{`${a.city} · ${a.address}`}</p>
            {a.status === 'rejected' && a.reason && <p className="text-xs text-red-500 mt-1">{a.reason}</p>}
            {a.status === 'approved' && a.stationId && (
              <div className="mt-2 text-xs text-slate-600 space-y-1">
                <p>Подключите зарядное устройство к сети по OCPP 1.6-J — после этого станция станет доступна водителям:</p>
                <code className="block bg-slate-900 text-emerald-300 rounded-lg px-2 py-1.5 break-all">{`${origin}/ocpp/${a.stationId}`}</code>
                <p className="text-slate-400">Ключ OCPP пришлёт менеджер платформы. Большинство настенных зарядок с Wi-Fi поддерживают OCPP — проверьте в настройках устройства.</p>
              </div>
            )}
          </div>
        ))}

        {note && <p className={`text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}

        {!pending && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Новая заявка</p>
            <div className="grid grid-cols-3 gap-1.5">
              {HOST_KINDS.map(k => (
                <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={`py-2 rounded-xl text-[11px] font-semibold flex flex-col items-center gap-1 ${kind === k.id ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{k.icon}{k.label}</button>
              ))}
            </div>
            {([['name', 'Название, например «Hotel Registan — парковка»'], ['city', 'Город'], ['address', 'Адрес'], ['hours', 'Часы работы']] as const).map(([k, ph]) => (
              <input key={k} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph} aria-label={ph} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
            ))}
            <div className="flex gap-1.5">
              <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="Широта" aria-label="Широта" inputMode="decimal" className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
              <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="Долгота" aria-label="Долгота" inputMode="decimal" className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
              <button onClick={here} aria-label="Моё местоположение" className="px-3 rounded-xl bg-slate-100 text-slate-600"><LocateFixed size={16} /></button>
            </div>
            {ports.map((p, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <select value={p.type} onChange={e => setPorts(ps => ps.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} aria-label="Разъём" className="flex-1 min-w-0 px-2 py-2.5 rounded-xl border border-slate-200 text-sm bg-white">
                  {PORTS.map(t => <option key={t}>{t}</option>)}
                </select>
                <input value={p.power} onChange={e => setPorts(ps => ps.map((x, j) => (j === i ? { ...x, power: e.target.value } : x)))} inputMode="decimal" aria-label="Мощность, кВт" placeholder="кВт" className="w-16 px-2 py-2.5 rounded-xl border border-slate-200 text-sm" />
                <input value={p.price} onChange={e => setPorts(ps => ps.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} inputMode="numeric" aria-label="Цена, сум/кВт·ч" placeholder="сум" className="w-20 px-2 py-2.5 rounded-xl border border-slate-200 text-sm" />
                {ports.length > 1 && <button onClick={() => setPorts(ps => ps.filter((_, j) => j !== i))} aria-label="Убрать разъём" className="p-2 text-slate-400"><Trash2 size={14} /></button>}
              </div>
            ))}
            {ports.length < 4 && <button onClick={() => setPorts(ps => [...ps, { type: 'Type2', power: '22', price: '1200' }])} className="text-xs text-sky-600 font-semibold inline-flex items-center gap-1"><Plus size={12} />Ещё разъём</button>}
            <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy && <LoaderCircle size={14} className="animate-spin" />}Отправить на проверку</button>
            <p className="text-[11px] text-slate-400">Цена — от 300 до 5 000 сум за кВт·ч. Зарядка должна поддерживать OCPP 1.6-J, чтобы водители могли запускать её из приложения.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SOS
// ---------------------------------------------------------------------------

const SOS: { id: SosKind; label: string; icon: ReactNode }[] = [
  { id: 'mobile_charge', label: 'Сел аккумулятор — нужна мобильная зарядка', icon: <BatteryCharging size={18} /> },
  { id: 'tow', label: 'Нужен эвакуатор', icon: <Truck size={18} /> },
  { id: 'breakdown', label: 'Поломка машины', icon: <Wrench size={18} /> },
  { id: 'station', label: 'Неисправна зарядная станция', icon: <Zap size={18} /> },
  { id: 'accident', label: 'ДТП', icon: <AlertTriangle size={18} /> },
  { id: 'other', label: 'Другое', icon: <Phone size={18} /> },
];
const SOS_STATUS = { open: 'Отправлено диспетчеру', taken: 'Диспетчер занимается', closed: 'Закрыто' };

/** One button for help: the request with your location goes to the platform's dispatcher. */
export function SosSheet({ onClose }: { onClose: () => void }) {
  const { actions } = useSync();
  const [kind, setKind] = useState<SosKind | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<SosRequest | null>(null);
  const [error, setError] = useState('');
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    actions.mySos().then(list => setSent(list.find(s => s.status !== 'closed') ?? null)).catch(() => {});
    void locate().then(setPlace);
  }, [actions]);

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError('');
    try {
      const r = await actions.sendSos({ kind, note: text, ...(place ?? {}) });
      setSent(r.sos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!place) return;
    const url = `https://yandex.uz/maps/?pt=${place.lng},${place.lat}&z=17`;
    try {
      if (navigator.share) await navigator.share({ title: 'Я здесь', text: 'Моё местоположение', url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl max-h-[90%] overflow-y-auto p-4 pb-6 space-y-3" onClick={e => e.stopPropagation()} role="dialog" aria-label="SOS">
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-red-600">SOS — нужна помощь</p>
          <button onClick={onClose} aria-label="Закрыть" className="p-2 rounded-xl bg-slate-100"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href="tel:112" className="py-3 rounded-xl bg-red-600 text-white text-center font-bold">112 · экстренные службы</a>
          <a href="tel:103" className="py-3 rounded-xl bg-red-50 text-red-600 text-center font-semibold">103 · скорая</a>
        </div>
        {sent ? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
            <p className="font-semibold text-emerald-800">{SOS_STATUS[sent.status]}</p>
            <p className="text-sm text-emerald-700 mt-1">{sent.takenBy ? `Ответственный: ${sent.takenBy}. Вам позвонят на ${sent.phone}.` : `Диспетчер видит заявку и ваше местоположение и позвонит на ${sent.phone}.`}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">Заявка уйдёт диспетчеру платформы вместе с вашим местоположением и номером телефона.</p>
            <div className="space-y-1.5">
              {SOS.map(s => (
                <button key={s.id} onClick={() => setKind(s.id)} aria-pressed={kind === s.id} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left text-sm ${kind === s.id ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 text-slate-700'}`}>
                  <span className="shrink-0">{s.icon}</span>{s.label}
                </button>
              ))}
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Что случилось, где вы — ориентир, километр трассы" aria-label="Комментарий" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none" />
            <p className="text-xs text-slate-400">{place ? `Местоположение определено: ${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}` : 'Местоположение не определено — опишите, где вы'}</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={send} disabled={!kind || busy} className="w-full py-3.5 rounded-2xl bg-red-600 text-white font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}Отправить заявку</button>
          </>
        )}
        {place && <button onClick={share} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium inline-flex items-center justify-center gap-2"><Share2 size={14} />Поделиться местоположением</button>}
      </div>
    </div>
  );
}


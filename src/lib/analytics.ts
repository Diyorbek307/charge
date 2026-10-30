import { useCallback, useEffect, useRef, useState } from 'react';
import { useSync } from './sync';
import { tokenStore, type Portal } from './api';
import { API_ORIGIN } from './site';

/** Mirrors server/analytics.js — every dashboard figure comes from here. */
export interface Totals {
  sessions: number;
  completed: number;
  failed: number;
  energy: number;
  revenue: number;
  commission: number;
  payout: number;
  avgKwh: number;
  avgCheck: number;
  avgMinutes: number;
  avgPrice: number;
  uniqueUsers: number;
  repeatShare: number;
  utilization: number;
  successRate: number;
}

export interface StationStat {
  id: string;
  name: string;
  city: string;
  operator: string;
  operatorId: string;
  connectors: number;
  free: number;
  sessions: number;
  failed: number;
  energy: number;
  revenue: number;
  utilization: number;
  rating: number;
}

export interface OperatorStat extends Totals {
  id: string;
  name: string;
  logo: string;
  status: string;
  integration: string;
  /** platform: paid from the Voli wallet; direct: straight to the network’s cashbox. */
  settlement?: 'platform' | 'direct';
  since: string;
  region: string;
  contact: string;
  iban: string;
  commissionRate: number;
  stations: number;
  evse: number;
  online: number;
  revenueDelta: number | null;
  trend: number[];
}

export interface Analytics {
  range: { from: string; to: string; days: number };
  totals: Totals;
  prev: Totals;
  today: Totals;
  deltas: Record<'sessions' | 'energy' | 'revenue' | 'avgCheck' | 'uniqueUsers' | 'avgMinutes', number | null>;
  network: { stations: number; connectors: number; online: number; busy: number; cities: number; active: number };
  daily: { date: string; sessions: number; energy: number; revenue: number; partial?: boolean }[];
  hourly: { hour: number; sessions: number; energy: number }[];
  weekday: { day: number; sessions: number; revenue: number }[];
  connectors: { type: string; sessions: number; energy: number; share: number }[];
  stations: StationStat[];
  cities: { city: string; stations: number; connectors: number; sessions: number; revenue: number; energy: number }[];
  operators: OperatorStat[];
  monthly: { month: string; sessions: number; energy: number; revenue: number; commission: number }[];
  customers?: { id: string; name: string; phone: string; car: string; city: string; sessions: number; spent: number; energy: number; last: string; stations: number }[];
  employees?: { id: string; name: string; dept: string; vehicle: string; limit: number; spentMonth: number; sessions: number; energy: number; spent: number }[];
  departments?: { dept: string; spent: number; sessions: number }[];
  trips?: Trip[];
  account?: { balance: number; threshold: number; autoTopUp: boolean; budget: number; spentMonth: number; runwayDays: number | null };
  invoices?: Invoice[];
  payments?: {
    count: number;
    amount: number;
    payme: { count: number; amount: number };
    click: { count: number; amount: number };
    cancelled: number;
    pending: number;
    recent: { id: string; provider: string; userId: string; user: string; amount: number; status: string; created: string }[];
  };
}

/** A corporate charge, as the fleet portal lists it. */
export interface Trip {
  id: string;
  start: string;
  end: string;
  status: string;
  stationId: string;
  station: string;
  city: string;
  connector: string;
  energy: number;
  cost: number;
  price: number;
  night: boolean;
  employeeId: string | null;
  employee: string;
  dept: string;
  vehicle: string;
  plate: string;
}

export interface Invoice {
  id: string;
  operatorId: string;
  operator: string;
  logo: string;
  month: string;
  sessions: number;
  energy: number;
  revenue: number;
  commissionRate: number;
  commission: number;
  payout: number;
  status: 'paid' | 'processing' | 'accruing';
  payDate: string;
  iban: string;
}

/** Events after which dashboard figures may have changed. */
const RELEVANT = /^(session\.(start|stop)|system\.reset|operator\.|commission\.|user\.|wallet\.|booking\.)/;

/**
 * Fetches /api/analytics for a portal and refetches (debounced) when the live
 * channel reports something that changes the numbers.
 */
export function useAnalytics(portal: Portal, days = 30) {
  const { events } = useSync();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const token = tokenStore.get(portal);
      const res = await fetch(`${API_ORIGIN}/api/analytics?days=${days}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Ошибка ${res.status}`);
      setData(await res.json());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [portal, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = events.find(e => RELEVANT.test(e.type))?.id;
  useEffect(() => {
    if (!latest) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [latest, load]);

  return { data, error, reload: load };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const ru = 'ru-RU';

/** 184 500 000 → "184,5 млн"; under a million stays as grouped digits. */
export function money(n: number, unit = true) {
  const abs = Math.abs(n);
  let out: string;
  if (abs >= 1e9) out = `${(n / 1e9).toLocaleString(ru, { maximumFractionDigits: 2 })} млрд`;
  else if (abs >= 1e6) out = `${(n / 1e6).toLocaleString(ru, { maximumFractionDigits: 1 })} млн`;
  else out = Math.round(n).toLocaleString(ru);
  return unit ? `${out} сум` : out;
}

/** money() with the units of the given language, for text built outside the phrase tables. */
export function moneyIn(lang: 'ru' | 'en' | 'uz', n: number) {
  const out = money(n);
  if (lang === 'en') return out.replace(/ млрд/, ' bn').replace(/ млн/, ' mln').replace(/ сум$/, ' UZS');
  if (lang === 'uz') return out.replace(/ млрд/, ' mlrd').replace(/ млн/, ' mln').replace(/ сум$/, ' so‘m');
  return out;
}

export const num = (n: number, digits = 0) => n.toLocaleString(ru, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** "+12,4%" / "−3,1%" / "" when there is nothing to compare with. */
export function delta(p: number | null | undefined) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '';
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toLocaleString(ru, { maximumFractionDigits: 1 })}%`;
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** "2026-05" → "май" / "Май 2026". */
export const monthShort = (key: string) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
export const monthLong = (key: string) => `${MONTHS_FULL[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
export const weekdayShort = (i: number) => WEEKDAYS[i];

/** "2026-10-13" → "13 окт". */
export const dayShort = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;

/** Today in Tashkent, e.g. "13 октября 2026, понедельник". */
export function todayLong(d = new Date()) {
  const t = new Date(d.getTime() + 5 * 3600_000);
  return `${t.getUTCDate()} ${MONTHS_GEN[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${WEEKDAYS_FULL[t.getUTCDay()]}`;
}

/** Current month name in the nominative, e.g. "Октябрь". */
export const currentMonth = (d = new Date()) => MONTHS_FULL[new Date(d.getTime() + 5 * 3600_000).getUTCMonth()];

/** Russian plural: plural(3, ['станция', 'станции', 'станций']) → "станции". */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** "3 сен 2026" — compact, no trailing "г.". */
export const dateShort = (iso: string) => {
  const d = new Date(Date.parse(iso) + 5 * 3600_000);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(ru, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const time = (iso: string) => new Date(iso).toLocaleTimeString(ru, { hour: '2-digit', minute: '2-digit' });
export const date = (iso: string) => new Date(iso).toLocaleDateString(ru, { day: 'numeric', month: 'short', year: 'numeric' });

/** "45 мин" / "1 ч 20 мин". */
export function duration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
}

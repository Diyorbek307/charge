import { useMemo } from 'react';
import type { Promo } from './api';
import { useSync } from './sync';

/**
 * Promos on the map and how a partner network looks there: a coloured badge
 * with its initials, so drivers tell networks apart at a glance without us
 * shipping anyone's logo before they send it.
 */

const TZ = 5 * 3600_000;
const tashkentHour = (at = Date.now()) => new Date(at + TZ).getUTCHours();

const inHours = (p: Promo, hour: number) =>
  p.fromHour == null || p.toHour == null
    ? true
    : p.fromHour <= p.toHour
      ? hour >= p.fromHour && hour < p.toHour
      : hour >= p.fromHour || hour < p.toHour;

type StationRef = { id: string; operatorId?: string };

/** Every promo of this station's network that covers it, running now or later today. */
export const promosOf = (st: StationRef, promos: Promo[] = []) =>
  promos.filter(p => p.operatorId === st.operatorId && (!p.stationIds || p.stationIds.includes(st.id)));

/** The biggest discount at this station right now (a first-charge promo counts: most drivers are new to a network). */
export function promoNow(st: StationRef, promos: Promo[] = [], at = Date.now()) {
  const h = tashkentHour(at);
  return promosOf(st, promos).filter(p => inHours(p, h)).sort((a, b) => b.percent - a.percent)[0] ?? null;
}

/** "23:00–07:00", or "весь день". */
export const promoHours = (p: Promo) =>
  p.fromHour == null || p.toHour == null ? 'весь день' : `${String(p.fromHour).padStart(2, '0')}:00–${String(p.toHour).padStart(2, '0')}:00`;

/** A night promo gets a moon on the map. */
export const isNight = (p: Promo) => p.fromHour != null && p.toHour != null && (p.fromHour >= 20 || p.toHour <= 7) && p.fromHour > p.toHour;

export const discounted = (price: number, p: Promo | null) => (p ? Math.round(price * (1 - p.percent / 100)) : price);

const PALETTE = ['#16A34A', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#0891B2', '#4F46E5', '#059669', '#B45309', '#0F766E'];

/** A stable colour and initials for a network, from its name. */
export function networkLook(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  // "GreenCharge UZ" → GC, "Nukus Power" → NP, "Tokbor" → TO.
  const caps = (words[0] ?? '').match(/\p{Lu}/gu) ?? [];
  const initials = (caps.length >= 2 ? caps[0] + caps[1] : words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  return { color: PALETTE[h % PALETTE.length], initials };
}

/**
 * Promos this driver can actually get: a first-charge promo drops out once
 * they have charged at that network, so the map never promises what the
 * server will not give.
 */
export function useDriverPromos(): Promo[] {
  const { state, sessions } = useSync();
  const me = sessions.driver?.id;
  return useMemo(() => {
    const charged = new Set((state?.sessions ?? []).filter(s => s.userId === me && s.status === 'completed').map(s => s.operatorId));
    return (state?.promos ?? []).filter(p => !p.firstOnly || !charged.has(p.operatorId));
  }, [state?.promos, state?.sessions, me]);
}

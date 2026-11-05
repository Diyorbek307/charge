import { useEffect, useState } from 'react';
import type { TariffForecast } from './api';
import { apiClient } from './api';

/**
 * The time-of-day tariff the server bills by, shared by every screen that
 * shows a price: fetched once, again on the hour, so a price on the card is
 * the price the charge will start at.
 */
let cached: TariffForecast | null = null;
let loading: Promise<TariffForecast | null> | null = null;
const listeners = new Set<(f: TariffForecast | null) => void>();
const TZ = 5 * 3600_000;
const hourNow = () => new Date(Date.now() + TZ).getUTCHours();

function load() {
  loading ??= apiClient
    .tariffForecast()
    .then(f => {
      cached = f;
      listeners.forEach(l => l(f));
      return f;
    })
    .catch(() => null)
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function useTariffForecast() {
  const [forecast, setForecast] = useState(cached);
  useEffect(() => {
    listeners.add(setForecast);
    if (!cached || cached.currentHour !== hourNow()) void load();
    // Again when the hour turns, since the band may change with it.
    const next = 3600_000 - ((Date.now() + TZ) % 3600_000) + 5_000;
    const t = setTimeout(() => void load(), next);
    return () => {
      listeners.delete(setForecast);
      clearTimeout(t);
    };
  }, []);
  return forecast;
}

/** The multiplier of the hour now; 1 until the forecast arrives. */
export function useTariffNow() {
  const f = useTariffForecast();
  return f?.hours[hourNow()]?.multiplier ?? 1;
}

/** A connector's price at this hour: the time-of-day band, then the promo. */
export const priceNow = (base: number, multiplier: number, promoPercent = 0) => Math.round(base * multiplier * (1 - promoPercent / 100));

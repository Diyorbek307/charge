import { TrendingDown } from 'lucide-react';
import type { Promo } from '../../lib/api';
import { useTariffForecast } from '../../lib/tariff';
import { promosOf } from '../../lib/promos';

const TZ = 5 * 3600_000;
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
const inHours = (p: Promo, h: number) => (p.fromHour == null || p.toHour == null ? true : p.fromHour <= p.toHour ? h >= p.fromHour && h < p.toHour : h >= p.fromHour || h < p.toHour);

/**
 * The price at this station hour by hour today — the time-of-day tariff and
 * the network's discounts together — and when it is cheapest next, so a
 * driver who can wait knows by how much and until when.
 */
export default function PriceToday({ station, basePrice, promos }: { station: { id: string; operatorId?: string }; basePrice: number; promos: Promo[] }) {
  const forecast = useTariffForecast();
  if (!forecast || !basePrice) return null;

  const mine = promosOf(station, promos).filter(p => !p.firstOnly);
  const prices = forecast.hours.map(({ hour, multiplier }) => {
    const off = Math.max(0, ...mine.filter(p => inHours(p, hour)).map(p => p.percent));
    return Math.round(basePrice * multiplier * (1 - off / 100));
  });
  const now = new Date(Date.now() + TZ).getUTCHours();
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Nothing to choose between: no chart, it would only be a flat line.
  if (high === low) return null;

  // The next run of the cheapest hours, from now on.
  let from = now;
  for (let i = 0; i < 24; i++) if (prices[(now + i) % 24] === low) { from = (now + i) % 24; break; }
  let length = 0;
  while (length < 24 && prices[(from + length) % 24] === low) length++;
  const saving = Math.round((1 - low / prices[now]) * 100);
  const cheapNow = prices[now] === low;

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-900">Цена сегодня</h3>
        <span className="text-xs text-slate-400">сум/кВт·ч по часам</span>
      </div>
      <div className="mt-3 flex items-end gap-[3px] h-16" role="img" aria-label={`От ${low} до ${high} сум за кВт·ч`}>
        {prices.map((p, h) => {
          const cheap = p === low;
          return (
            <span key={h} title={`${hh(h)} — ${p.toLocaleString('ru-RU')} сум`} className="flex-1 rounded-t-[3px] relative"
              style={{ height: `${28 + ((p - low) / (high - low)) * 72}%`, background: h === now ? '#111' : cheap ? '#FFC83D' : '#E8E5DC' }}>
              {h === now && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#111]" />}
            </span>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400 tabular-nums"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      <p className={`mt-2.5 text-[13px] flex items-start gap-1.5 ${cheapNow ? 'text-emerald-700' : 'text-slate-700'}`}>
        <TrendingDown size={15} className="shrink-0 mt-px text-[#E09A00]" />
        {cheapNow
          ? `Сейчас самая низкая цена — ${low.toLocaleString('ru-RU')} сум до ${hh(from + length)}`
          : `Дешевле с ${hh(from)} до ${hh(from + length)}: ${low.toLocaleString('ru-RU')} сум, на ${saving}% меньше, чем сейчас`}
      </p>
    </div>
  );
}

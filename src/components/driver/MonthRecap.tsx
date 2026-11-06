import { useState } from 'react';
import { Share2, Zap, Moon, Car, Fuel } from 'lucide-react';
import type { Session } from '../../lib/api';
import { plural } from '../../lib/analytics';
import { translatePhrase } from '../../lib/domTranslate';

const MONTH = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
/** An average EV in town: 18 kWh per 100 km. */
const KM_PER_KWH = 1 / 0.18;
/** A petrol car of the same class: 8 l per 100 km at about 10 000 sum a litre. */
const PETROL_PER_KM = (8 / 100) * 10_000;
const tk = (iso: string) => new Date(Date.parse(iso) + 5 * 3600_000);
const num = (n: number) => Math.round(n).toLocaleString('ru-RU');
/** The picture is drawn, not rendered, so its words are translated here. */
const tr = (ru: string) => translatePhrase(ru) ?? ru;

export interface Recap {
  year: number;
  month: number;
  charges: number;
  kwh: number;
  km: number;
  spent: number;
  /** Paid less thanks to the night and day tariff bands. */
  byTariff: number;
  /** Paid less thanks to promos, Voli Plus and bonus. */
  byDiscounts: number;
  /** What the same kilometres would have cost in petrol, minus what was paid. */
  vsPetrol: number;
}

/** One calendar month (Tashkent time) of a driver's completed charges. */
export function recapOf(sessions: Session[], year: number, month: number): Recap {
  const list = sessions.filter(s => {
    if (s.status !== 'completed') return false;
    const d = tk(s.start);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });
  let kwh = 0, spent = 0, byTariff = 0, byDiscounts = 0;
  for (const s of list) {
    kwh += s.energy;
    spent += s.cost;
    if (!s.basePrice) continue;
    const banded = s.basePrice * (s.multiplier ?? 1);
    byTariff += Math.max(0, (s.basePrice - banded) * s.energy);
    byDiscounts += Math.max(0, (banded - (s.price ?? banded)) * s.energy) + (s.bonusUsed ?? 0);
  }
  const km = kwh * KM_PER_KWH;
  return { year, month, charges: list.length, kwh, km, spent, byTariff, byDiscounts, vsPetrol: Math.max(0, km * PETROL_PER_KM - spent) };
}

/** The month to sum up: the one before during its first five days, while this one has barely begun. */
export function recapMonth(sessions: Session[], now = new Date()) {
  const t = tk(now.toISOString());
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const cur = recapOf(sessions, y, m);
  if (t.getUTCDate() > 5) return cur;
  const prev = recapOf(sessions, m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
  return prev.charges > cur.charges ? prev : cur;
}

/** The same card as a picture, for messengers and stories. */
async function drawCard(r: Recap, name: string): Promise<Blob | null> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  await document.fonts?.ready;
  const font = (w: number, px: number) => `${w} ${px}px Inter, system-ui, sans-serif`;

  g.fillStyle = '#111';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, 120, 0, W * 0.85, 120, 700);
  glow.addColorStop(0, 'rgba(255,200,61,0.35)');
  glow.addColorStop(1, 'rgba(255,200,61,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  g.fillStyle = '#FFC83D';
  g.font = font(800, 64);
  g.fillText('Voli', 80, 140);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = font(500, 36);
  g.fillText(`${name ? `${name} · ` : ''}${tr(MONTH[r.month])} ${r.year}`, 80, 210);

  g.fillStyle = '#fff';
  g.font = font(800, 150);
  g.fillText(num(r.km), 80, 420);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = font(600, 44);
  g.fillText(tr('км на электричестве'), 80, 490);

  const rows: [string, string][] = [
    [tr('Зарядок'), String(r.charges)],
    [tr('Энергия'), tr(`${num(r.kwh)} кВт·ч`)],
    [tr('Потрачено'), tr(`${num(r.spent)} сум`)],
    [tr('Сэкономлено на тарифе и скидках'), tr(`${num(r.byTariff + r.byDiscounts)} сум`)],
  ];
  let y = 620;
  for (const [k, v] of rows) {
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(80, y - 70, W - 160, 2);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = font(500, 36);
    g.fillText(k, 80, y);
    g.fillStyle = '#fff';
    g.font = font(700, 40);
    const w = g.measureText(v).width;
    g.fillText(v, W - 80 - w, y);
    y += 120;
  }

  g.fillStyle = '#FFC83D';
  g.beginPath();
  g.roundRect(80, 1080, W - 160, 150, 36);
  g.fill();
  g.fillStyle = '#111';
  g.font = font(500, 34);
  g.fillText(tr('Меньше, чем на бензине'), 130, 1140);
  g.font = font(800, 52);
  g.fillText(tr(`на ${num(r.vsPetrol)} сум`), 130, 1200);

  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.font = font(500, 30);
  g.fillText(`voli.uz · ${tr('Вся зарядка Узбекистана')}`, 80, 1300);

  return new Promise(res => c.toBlob(res, 'image/png'));
}

/** "Your month": how much you charged, spent and saved, as a card you can share. */
export default function MonthRecap({ sessions, name }: { sessions: Session[]; name?: string }) {
  const r = recapMonth(sessions);
  const [busy, setBusy] = useState(false);
  if (!r.charges) return null;
  const saved = r.byTariff + r.byDiscounts;

  const share = async () => {
    setBusy(true);
    try {
      const blob = await drawCard(r, name ?? '');
      if (!blob) return;
      const file = new File([blob], `voli-${r.year}-${String(r.month + 1).padStart(2, '0')}.png`, { type: 'image/png' });
      const text = tr(`Мой месяц с Voli: ${num(r.km)} км на электричестве`);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Voli', text }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Итоги месяца" className="relative overflow-hidden rounded-3xl bg-[#111] text-white p-5 pg-reveal">
      <div aria-hidden="true" className="absolute -top-24 -right-20 w-64 h-64 rounded-full bg-[#FFC83D]/25 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#FFC83D] tracking-wide uppercase">{`Итоги месяца · ${MONTH[r.month]}`}</p>
            <p className="mt-2 text-4xl font-extrabold tabular-nums leading-none">{num(r.km)}</p>
            <p className="text-sm text-white/70 mt-1">км на электричестве</p>
          </div>
          <button onClick={share} disabled={busy} aria-label="Поделиться итогами месяца"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#FFC83D] text-[#111] text-xs font-bold px-3 py-2 disabled:opacity-60">
            <Share2 size={14} />{busy ? 'Готовим…' : 'Поделиться'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-2xl bg-white/[0.06] p-3">
            <p className="text-[11px] text-white/60 flex items-center gap-1"><Zap size={11} />{`${r.charges} ${plural(r.charges, ['зарядка', 'зарядки', 'зарядок'])}`}</p>
            <p className="text-sm font-bold tabular-nums mt-1">{`${num(r.kwh)} кВт·ч`}</p>
            <p className="text-[11px] text-white/60 tabular-nums">{`${num(r.spent)} сум`}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-3">
            <p className="text-[11px] text-white/60 flex items-center gap-1"><Moon size={11} />Сэкономили</p>
            <p className="text-sm font-bold tabular-nums mt-1">{`${num(saved)} сум`}</p>
            <p className="text-[11px] text-white/60">{r.byDiscounts > 0 && !r.byTariff ? 'на скидках и бонусах' : r.byTariff > 0 && !r.byDiscounts ? 'на ночном и дневном тарифе' : 'на тарифе и скидках'}</p>
          </div>
        </div>
        {r.byTariff > 0 && r.byDiscounts > 0 && (
          <p className="text-[11px] text-white/50 mt-2">{`${num(r.byTariff)} сум на ночном и дневном тарифе, ${num(r.byDiscounts)} сум на скидках и бонусах`}</p>
        )}
        <p className="mt-3 rounded-2xl bg-[#FFC83D] text-[#111] px-3 py-2.5 text-xs font-semibold flex items-center gap-2">
          <Fuel size={14} />{`На бензине те же ${num(r.km)} км обошлись бы дороже на ${num(r.vsPetrol)} сум`}
          <Car size={14} className="ml-auto" aria-hidden="true" />
        </p>
      </div>
    </section>
  );
}

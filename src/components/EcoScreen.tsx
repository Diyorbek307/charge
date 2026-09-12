import { useEffect, useState } from 'react';
import { ArrowLeft, Leaf, TreePine, Trophy, Moon, Zap, MapPin, Award, Car } from 'lucide-react';
import { useSync } from '../lib/sync';
import type { EcoProfile, LeaderRow, TariffForecast } from '../lib/api';

const BAND_STYLE: Record<string, { bar: string; label: string }> = {
  green: { bar: '#22C55E', label: 'Зелёный' },
  day: { bar: '#38BDF8', label: 'Дневной' },
  standard: { bar: '#94A3B8', label: 'Обычный' },
  peak: { bar: '#F97316', label: 'Пик' },
};

const BADGE_ICON: Record<string, typeof Award> = {
  first: Zap,
  night: Moon,
  green: Leaf,
  explorer: MapPin,
  century: Trophy,
};

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Shared hook: the tariff curve changes hourly, so a slow poll is enough. */
export function useTariffForecast() {
  const { actions } = useSync();
  const [forecast, setForecast] = useState<TariffForecast | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      actions
        .tariffForecast()
        .then(f => alive && setForecast(f))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [actions]);
  return forecast;
}

/** Compact banner for a station card: is now a good time to charge? */
export function GreenHourBanner() {
  const f = useTariffForecast();
  if (!f) return null;
  const { current, bestWindow } = f;
  const pct = Math.round((1 - current.multiplier) * 100);

  if (current.band === 'green') {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
        <Leaf size={14} className="shrink-0" />
        <span>
          <b>Зелёный час</b> — заряжайтесь сейчас на {pct}% дешевле
        </span>
      </div>
    );
  }
  const peak = current.band === 'peak';
  return (
    <div
      className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
        peak ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
    >
      <Moon size={14} className="shrink-0" />
      <span>
        {peak ? <b>Пиковый тариф ×{current.multiplier}. </b> : null}
        Дешевле всего через {bestWindow.startsInHours} ч — с {pad(bestWindow.from)} до {pad(bestWindow.to)}
      </span>
    </div>
  );
}

export default function EcoScreen({ onBack }: { onBack: () => void }) {
  const { actions } = useSync();
  const forecast = useTariffForecast();
  const [eco, setEco] = useState<EcoProfile | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions
      .ecoMe('driver')
      .then(setEco)
      .catch(e => setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль'));
    actions
      .ecoLeaderboard('driver')
      .then(setBoard)
      .catch(() => setBoard([]));
  }, [actions]);

  const earned = eco?.badges.filter(b => b.earned).length ?? 0;
  const maxMult = forecast ? Math.max(...forecast.hours.map(h => h.multiplier)) : 1;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onBack} className="p-2 rounded-xl bg-slate-100" aria-label="Назад">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Эко-профиль</h1>
          <p className="text-xs text-slate-500">Что вы сэкономили планете</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Impact */}
        <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#16A34A,#0D9488)' }}>
          <p className="text-xs text-green-100 font-semibold tracking-wide">СЭКОНОМЛЕНО CO₂</p>
          <p className="text-4xl font-bold mono mt-1">
            {eco ? eco.co2Kg.toLocaleString('ru-RU') : '—'}
            <span className="text-lg font-normal"> кг</span>
          </p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: TreePine, value: eco ? eco.trees.toLocaleString('ru-RU') : '—', label: 'деревьев за год' },
              { icon: Car, value: eco ? eco.km.toLocaleString('ru-RU') : '—', label: 'км без бензина' },
              { icon: Zap, value: eco ? eco.kwh.toLocaleString('ru-RU') : '—', label: 'кВт·ч' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="bg-white/15 rounded-xl px-2 py-2">
                <Icon size={14} className="text-green-100" />
                <p className="text-base font-bold mono mt-1 leading-none">{value}</p>
                <p className="text-[10px] text-green-100 mt-1 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Green hours */}
        {forecast && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-500">ЗЕЛЁНЫЕ ЧАСЫ · СЕГОДНЯ</p>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: BAND_STYLE[forecast.current.band].bar }}
              >
                сейчас ×{forecast.current.multiplier}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Выгоднее всего с {pad(forecast.bestWindow.from)} до {pad(forecast.bestWindow.to)} — цена ×
              {forecast.bestWindow.multiplier}. Цена фиксируется в момент старта.
            </p>
            <div className="flex items-end gap-[3px] h-20" role="img" aria-label="Тариф по часам">
              {forecast.hours.map(h => (
                <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full rounded-sm"
                    title={`${pad(h.hour)} · ×${h.multiplier}`}
                    style={{
                      height: `${(h.multiplier / maxMult) * 100}%`,
                      background: BAND_STYLE[h.band].bar,
                      opacity: h.hour === forecast.currentHour ? 1 : 0.55,
                      outline: h.hour === forecast.currentHour ? '2px solid #0F172A' : 'none',
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mono mt-1">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {Object.entries(BAND_STYLE).map(([band, st]) => (
                <span key={band} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="w-2 h-2 rounded-sm" style={{ background: st.bar }} />
                  {st.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Badges */}
        {eco && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">
              ДОСТИЖЕНИЯ · {earned} из {eco.badges.length}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {eco.badges.map(b => {
                const Icon = BADGE_ICON[b.id] ?? Award;
                return (
                  <div
                    key={b.id}
                    className={`rounded-xl border p-3 ${
                      b.earned ? 'border-green-200 bg-green-50' : 'border-slate-100 bg-slate-50 opacity-60'
                    }`}
                  >
                    <Icon size={18} className={b.earned ? 'text-green-600' : 'text-slate-400'} />
                    <p className="text-xs font-semibold text-slate-800 mt-1.5">{b.title}</p>
                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{b.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {board.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <p className="text-xs font-semibold text-slate-500 px-4 pt-4 pb-2 flex items-center gap-1.5">
              <Trophy size={12} /> ЛИДЕРЫ СЕТИ
            </p>
            {board.map(r => (
              <div
                key={r.rank}
                className={`flex items-center gap-3 px-4 py-2.5 border-t border-slate-50 ${r.me ? 'bg-sky-50' : ''}`}
              >
                <span
                  className={`w-6 text-center text-sm font-bold mono ${
                    r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : r.rank === 3 ? 'text-orange-400' : 'text-slate-300'
                  }`}
                >
                  {r.rank}
                </span>
                <span className="flex-1 text-sm text-slate-800">
                  {r.name}
                  {r.me && <span className="ml-1.5 text-[10px] font-bold text-sky-600">вы</span>}
                </span>
                <span className="text-xs text-slate-500 mono">{r.kwh} кВт·ч</span>
                <span className="text-xs text-green-600 mono w-16 text-right">−{r.co2Kg} кг</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

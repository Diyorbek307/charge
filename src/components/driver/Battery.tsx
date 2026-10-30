import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Info, LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react';
import type { BatteryHealth } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { exportPdf } from '../../lib/export';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const GRADE = {
  excellent: { text: 'Отличное состояние', color: '#16A34A' },
  good: { text: 'Хорошее состояние', color: '#CA8A04' },
  attention: { text: 'Стоит проверить в сервисе', color: '#DC2626' },
} as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Tashkent' });

/**
 * How the battery is doing, from the driver's own charges: the capacity it
 * still holds, measured where chargers report the battery's percentage, and
 * how much power it takes on fast chargers month by month. Saved as a PDF
 * for selling the car.
 */
export default function BatteryScreen({ onBack, onAddCar }: { onBack: () => void; onAddCar: () => void }) {
  const { actions, sessions } = useSync();
  const [h, setH] = useState<BatteryHealth | null>(null);
  const [error, setError] = useState(false);
  const car = sessions.driver?.car;
  useEffect(() => {
    actions.batteryHealth().then(setH).catch(() => setError(true));
  }, [actions, car?.battery]);

  const C = 2 * Math.PI * 70;
  const grade = h?.grade ? GRADE[h.grade] : null;

  const pdf = () => {
    if (!h) return;
    const rows: [string, string][] = [
      ['Автомобиль', h.car ? `${h.car.brand} ${h.car.model} ${h.car.year}` : '—'],
      ['Ёмкость по паспорту', h.car ? `${h.car.rated} кВт·ч` : '—'],
      ['Ёмкость сейчас', h.capacity ? `${h.capacity} кВт·ч` : 'не измерена'],
      ['Состояние (SOH)', h.soh !== null ? `${h.soh}%` : '—'],
      ['Изменение за период', h.drift !== null ? `${h.drift > 0 ? '+' : ''}${h.drift}%` : '—'],
      ['Измерений', String(h.measured.length)],
      ['Зарядок всего', String(h.charges)],
      ...h.measured.map(m => [`${day(m.at)} · ${m.station}`, `${m.from}→${m.to}% · ${m.energy} кВт·ч · ≈ ${m.kwh} кВт·ч`] as [string, string]),
      ['Номер отчёта', h.reportId],
    ];
    void exportPdf(`battery-${h.reportId}`, `Здоровье батареи · Voli · ${h.reportId}`, ['Показатель', 'Значение'], rows);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Здоровье батареи</h1>
          <p className="text-xs text-slate-500">{car ? `${car.brand} ${car.model} · ${car.battery} кВт·ч по паспорту` : 'По вашим зарядкам'}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!h && !error && <div className="py-16 grid place-items-center"><LoaderCircle className="animate-spin text-slate-300" /></div>}
        {error && <p className="text-sm text-slate-500 text-center py-10">Не удалось загрузить — нужна связь</p>}
        {h && (
          <>
            {/* The gauge */}
            <div className="bg-white rounded-3xl border border-slate-100 p-5 flex flex-col items-center">
              <div className="relative" style={{ width: 176, height: 176 }}>
                <svg viewBox="0 0 176 176" className="absolute inset-0">
                  <circle cx="88" cy="88" r="70" fill="none" stroke="#F1F1EC" strokeWidth="14" />
                  <circle cx="88" cy="88" r="70" fill="none" stroke={grade?.color ?? '#CBD5E1'} strokeWidth="14" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - (h.soh ?? 0) / 100)}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '88px 88px', transition: 'stroke-dashoffset 1.2s cubic-bezier(.32,.72,0,1)', animation: 'pg-gauge 1.2s cubic-bezier(.32,.72,0,1) both' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[44px] font-black text-slate-900 tabular-nums leading-none pg-pop">{h.soh !== null ? `${h.soh}%` : '—'}</span>
                  <span className="text-[11px] text-slate-500 mt-1 max-w-[104px] text-center leading-tight">{h.soh !== null ? 'от ёмкости по паспорту' : 'ещё не измерено'}</span>
                </div>
              </div>
              {grade && <p className="mt-3 text-sm font-bold" style={{ color: grade.color }}>{grade.text}</p>}
              {h.capacity && h.car && <p className="text-xs text-slate-500 mt-0.5">{`Держит ≈ ${h.capacity.toLocaleString('ru-RU')} из ${h.car.rated} кВт·ч · по ${Math.min(6, h.measured.length)} последним измерениям`}</p>}
              {h.drift !== null && (
                <p className={`mt-2 text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${h.drift < -3 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                  {h.drift < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{`${h.drift > 0 ? '+' : ''}${h.drift.toLocaleString('ru-RU')}% с первых измерений`}
                </p>
              )}
              {!h.car && (
                <button onClick={onAddCar} className="mt-3 px-4 py-2.5 rounded-xl bg-[#111] text-white text-sm font-bold">Указать автомобиль — нужна ёмкость по паспорту</button>
              )}
              {h.car && !h.measured.length && (
                <p className="mt-3 text-xs text-slate-500 text-center">Ёмкость измерим после зарядки на быстрой станции, которая передаёт процент батареи — так делает большинство DC-станций.</p>
              )}
            </div>

            {/* Power taken on fast chargers, by month */}
            {h.acceptance.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold text-slate-500">МОЩНОСТЬ НА БЫСТРЫХ СТАНЦИЯХ</p>
                <p className="text-[11px] text-slate-400 mb-3">Какую долю мощности станции машина берёт в среднем. Стареющая батарея берёт меньше.</p>
                <div className="flex items-end gap-2 h-24">
                  {h.acceptance.slice(-6).map(m => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[11px] font-semibold text-slate-600 tabular-nums">{`${m.share}%`}</span>
                      <div className="w-full rounded-t-lg pg-grow" style={{ height: `${Math.max(4, m.share * 0.6)}px`, background: 'linear-gradient(180deg,#FFD66B,#FFB000)' }} />
                      <span className="text-[10px] text-slate-400">{MONTHS[Number(m.month.slice(5, 7)) - 1]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* The measurements themselves */}
            {h.measured.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-xs font-semibold text-slate-500">ИЗМЕРЕНИЯ</p>
                <div className="divide-y divide-slate-50 pg-stagger">
                  {h.measured.slice(0, 8).map(m => (
                    <div key={m.sessionId} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 truncate">{m.station}</p>
                        <p className="text-[11px] text-slate-400">{`${day(m.at)} · ${m.from}% → ${m.to}% · ${m.energy} кВт·ч`}</p>
                      </div>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{`≈ ${m.kwh.toLocaleString('ru-RU')}`}<span className="text-[10px] font-normal text-slate-400"> кВт·ч</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">СОВЕТ</p>
              {h.tips.map(t => <p key={t} className="text-sm text-slate-700">{t}</p>)}
            </div>

            {h.soh !== null && (
              <button onClick={pdf} className="w-full py-3.5 rounded-2xl bg-[#111] text-white font-bold text-sm inline-flex items-center justify-center gap-2">
                <Download size={16} />Отчёт для продажи машины (PDF)
              </button>
            )}
            <p className="text-[11px] text-slate-400 px-1 flex gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />Ёмкость считается по энергии, вошедшей в батарею, и проценту заряда, который передаёт станция. Это оценка, а не диагностика дилера.</p>
          </>
        )}
      </div>
    </div>
  );
}

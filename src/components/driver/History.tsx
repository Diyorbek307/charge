import { useState } from 'react';
import { ChargerFriend } from './Illustration';
import { Clock, Zap, ChevronDown, Download, Moon, Building2, Wallet, ScanFace, ChevronLeft } from 'lucide-react';
import type { Session } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { exportPdf, exportCsv } from '../../lib/export';
import { plural } from '../../lib/analytics';

type Period = 'week' | 'month' | 'all';
const DAY = 86400_000;
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const tk = (iso: string) => new Date(Date.parse(iso) + 5 * 3600_000);
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
const minutesOf = (s: Session) => Math.max(1, Math.round((Date.parse(s.end ?? s.start) - Date.parse(s.start)) / 60000));
const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
const band = (m?: number) => (m === 0.7 ? 'ночь ×0.7' : m === 0.9 ? 'день ×0.9' : m === 1.25 ? 'пик ×1.25' : null);

/** The driver's own charges, as the server recorded and billed them. */
export default function HistoryScreen({ onBack }: { onBack?: () => void } = {}) {
  const { state, sessions: portals, actions, refresh } = useSync();
  const me = portals.driver;
  const [period, setPeriod] = useState<Period>('month');
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState<string | null>(null);

  const mine = (state?.sessions ?? [])
    .filter(s => s.userId === me?.id && s.status !== 'active')
    .sort((a, b) => b.start.localeCompare(a.start));
  const since = period === 'week' ? Date.now() - 7 * DAY : period === 'month' ? Date.now() - 30 * DAY : 0;
  const list = mine.filter(s => Date.parse(s.start) >= since);
  const done = list.filter(s => s.status === 'completed');
  const energy = done.reduce((n, s) => n + s.energy, 0);
  const cost = done.reduce((n, s) => n + s.cost, 0);
  const night = done.filter(s => s.multiplier === 0.7).length;

  // The last three calendar months, from the same sessions.
  const now = tk(new Date().toISOString());
  const months = [2, 1, 0].map(back => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const inMonth = mine.filter(s => s.status === 'completed' && `${tk(s.start).getUTCFullYear()}-${tk(s.start).getUTCMonth()}` === key);
    return { m: MONTHS[d.getUTCMonth()], kwh: Math.round(inMonth.reduce((n, s) => n + s.energy, 0)), cost: inMonth.reduce((n, s) => n + s.cost, 0) };
  });
  const maxKwh = Math.max(1, ...months.map(b => b.kwh));

  const receiptRows = (s: Session): [string, string][] => [
    ['Станция', s.stationName],
    ['Оператор', s.operator],
    ['Разъём', s.connector],
    ['Начало', when(s.start)],
    ['Длительность', `${minutesOf(s)} мин`],
    ['Энергия', `${s.energy} кВт·ч`],
    ['Цена', `${(s.price ?? 0).toLocaleString('ru-RU')} сум/кВт·ч${band(s.multiplier) ? ` (${band(s.multiplier)})` : ''}`],
    ['Оплата', s.corporate ? 'Корпоративный счёт' : s.credit ? 'В долг' : s.familyOwner ? 'Семейный кошелёк' : s.direct ? `Баланс сети ${s.operator}` : 'Кошелёк'],
    ['Итого', sum(s.cost)],
  ];

  const rate = async (s: Session, stars: number) => {
    setRating(s.id);
    try {
      await actions.rateSession('driver', s.id, stars);
      await refresh();
    } finally {
      setRating(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          {onBack && (
            <button onClick={onBack} aria-label="Назад" className="p-2 -ml-2 rounded-xl hover:bg-slate-100 shrink-0">
              <ChevronLeft size={20} className="text-slate-700" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900">История зарядок</h1>
            <p className="text-xs text-slate-500 mt-0.5">{`${done.length} ${plural(done.length, ['зарядка', 'зарядки', 'зарядок'])} · ${Math.round(energy)} кВт·ч · ${sum(cost)}`}</p>
          </div>
          <button
            onClick={() => exportCsv('charging-history', ['ID', 'Дата', 'Станция', 'Разъём', 'кВт·ч', 'Сумма, сум', 'Оплата', 'Статус'], list.map(s => [s.id, when(s.start), s.stationName, s.connector, s.energy, s.cost, s.corporate ? 'Компания' : s.credit ? 'В долг' : s.familyOwner ? 'Семья' : s.direct ? 'Баланс сети' : 'Кошелёк', s.status === 'failed' ? 'Ошибка' : 'Завершена']))}
            disabled={!list.length}
            aria-label="Скачать историю (CSV)"
            title="Скачать историю (CSV)"
            className="p-2 bg-slate-100 rounded-xl disabled:opacity-40"
          >
            <Download size={15} className="text-slate-600" />
          </button>
        </div>
        <div className="flex gap-1 mt-3">
          {(['week', 'month', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${period === p ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {p === 'week' ? 'Неделя' : p === 'month' ? '30 дней' : 'Всё время'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'кВт·ч', value: String(Math.round(energy)), color: 'text-sky-600' },
            { label: 'потрачено, сум', value: Math.round(cost).toLocaleString('ru-RU'), color: 'text-slate-900' },
            { label: 'ночных зарядок', value: String(night), color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-3 text-center">
              <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">кВт·ч по месяцам</p>
          <div className="flex items-end gap-3 h-20">
            {months.map(b => (
              <div key={b.m} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-slate-500 tabular-nums">{b.kwh}</span>
                <div className="w-full bg-sky-500 rounded-t-md" style={{ height: `${Math.max(2, (b.kwh / maxKwh) * 52)}px` }} />
                <span className="text-xs text-slate-400">{b.m}</span>
              </div>
            ))}
          </div>
        </div>

        {list.length === 0 && (
          <div className="text-center py-6">
            <span className="flex justify-center"><ChargerFriend size={150} /></span>
            <p className="text-sm text-slate-500 mt-1">За этот период зарядок не было</p>
          </div>
        )}

        {list.map(s => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="w-full p-4 text-left">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.stationName}</p>
                    <p className="text-xs text-slate-400">{`${s.operator} · ${when(s.start)}`}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {s.status === 'failed' ? (
                      <p className="text-xs font-semibold text-red-500">Не запустилась</p>
                    ) : (
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{sum(s.cost)}</p>
                    )}
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 justify-end">{s.corporate ? <><Building2 size={10} />компания</> : s.credit ? <><ScanFace size={10} />в долг</> : s.familyOwner ? <><Wallet size={10} />семья</> : s.direct ? <><Wallet size={10} />баланс сети</> : <><Wallet size={10} />кошелёк</>}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock size={11} />{`${minutesOf(s)} мин`}</span>
                  <span className="flex items-center gap-1"><Zap size={11} />{`${s.energy} кВт·ч`}</span>
                  <span className="px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-md">{s.connector}</span>
                  {s.multiplier === 0.7 && <span className="flex items-center gap-1 text-emerald-600"><Moon size={11} />ночь</span>}
                  <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-400 tracking-wider">{`ЧЕК · ${s.id}`}</p>
                    {receiptRows(s).map(([k, v]) => (
                      <div key={k} className={`flex justify-between gap-3 text-xs ${k === 'Итого' ? 'border-t border-slate-200 pt-2 mt-1 font-bold text-slate-900' : ''}`}>
                        <span className={k === 'Итого' ? '' : 'text-slate-500'}>{k}</span>
                        <span className={k === 'Итого' ? '' : 'text-slate-700 font-medium text-right'}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => void exportPdf(`receipt-${s.id}`, `Чек ${s.id}`, ['Параметр', 'Значение'], receiptRows(s))} className="flex-1 text-xs py-2.5 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 font-medium inline-flex items-center justify-center gap-1.5">
                      <Download size={12} />Чек PDF
                    </button>
                    {s.status === 'completed' && (
                      s.rating ? (
                        <span className="text-xs text-amber-500 font-semibold px-2">{`Ваша оценка ${s.rating}/5`}</span>
                      ) : (
                        <span className="flex" role="radiogroup" aria-label="Оценить станцию">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} disabled={rating === s.id} onClick={() => rate(s, n)} role="radio" aria-checked={false} aria-label={`${n} из 5`} className="text-xl text-slate-200 hover:text-amber-400 disabled:opacity-50 px-0.5">★</button>
                          ))}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

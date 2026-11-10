// Moved out of DriverApp.tsx: nextBookableSlot, BookingScreen, addToCalendar, BookingDoneScreen.
import { useState } from 'react';
import { Zap, Clock, ArrowLeft, CheckCircle, Plus, CalendarCheck, Minus } from 'lucide-react';
import { Station } from '../../../data/mockData';
import { useSync } from '../../../lib/sync';
import { BRAND } from '../../../brand';
import { usePlatform } from '../../../lib/platform';
import type { Booking } from '../../../lib/api';

/** Next quarter hour at least 15 minutes out, in the browser's local time. */
export function nextBookableSlot() {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function BookingScreen({ station, onBack, onConfirm }: { station: Station | null; onBack: () => void; onConfirm: (booking: Booking) => void }) {
  const { actions, refresh } = useSync();
  const [slot] = useState(nextBookableSlot);
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [connector, setConnector] = useState(0);

  const freeConnectors = station?.connectors.filter(c => c.status === 'available') || [];
  const plusFree = !!useSync().state?.plus?.active;
  const fee = usePlatform().booking.fee;
  const startsAt = new Date(`${date}T${time}`);
  // A slot that has already begun cannot be held.
  const inPast = !(startsAt.getTime() > Date.now());
  const submit = async () => {
    const chosen = freeConnectors[connector];
    if (!station || !chosen || inPast) return;
    setSubmitting(true);
    setBookError(null);
    try {
      const { booking } = await actions.createBooking('driver', station.id, {
        connectorId: chosen.id,
        startsAt: new Date(`${date}T${time}`).toISOString(),
        minutes: duration,
      });
      await refresh();
      onConfirm(booking);
    } catch (err) {
      setBookError(err instanceof Error ? err.message : 'Не удалось забронировать');
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedCost = freeConnectors[connector]
    ? Math.round((freeConnectors[connector].power * duration / 60) * freeConnectors[connector].price)
    : 0;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Бронирование</h1>
          <p className="text-xs text-slate-500">{station?.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Connector select */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">РАЗЪЁМ</p>
          <div className="space-y-2">
            {freeConnectors.length === 0 && (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-3">Сейчас все разъёмы заняты — забронировать можно, когда освободится хотя бы один. Встаньте в очередь на карточке станции.</p>
            )}
            {freeConnectors.map((c, i) => (
              <button key={c.id} onClick={() => setConnector(i)} aria-pressed={connector === i}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${connector === i ? 'border-sky-500 bg-sky-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <Zap size={14} className="text-sky-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-slate-800">{c.type}</p>
                  <p className="text-xs text-slate-400">{c.power} кВт · {c.price.toLocaleString()} сум/кВт·ч</p>
                </div>
                {connector === i && <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center pg-pop">
                  <CheckCircle size={12} className="text-white" />
                </div>}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500">ДАТА И ВРЕМЯ</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Дата</label>
              <input type="date" value={date} min={slot.date} onChange={e => setDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-sky-400 text-slate-800" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Время начала</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-sky-400 text-slate-800" />
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500">ДЛИТЕЛЬНОСТЬ</p>
            <p className="text-sm font-bold text-slate-900 mono">{duration} мин</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setDuration(d => Math.max(15, d - 15))} aria-label="Меньше на 15 минут" disabled={duration <= 15}
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-40">
              <Minus size={16} />
            </button>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]" style={{ width: `${(duration / 240) * 100}%` }} />
            </div>
            <button onClick={() => setDuration(d => Math.min(240, d + 15))} aria-label="Больше на 15 минут" disabled={duration >= 240}
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-40">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>15 мин</span><span>4 ч</span>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-sky-700 mb-2">ИТОГ БРОНИРОВАНИЯ</p>
          <div className="space-y-1.5 text-sm">
            {[
              ['Станция', station?.name || '—'],
              ['Разъём', freeConnectors[connector] ? `${freeConnectors[connector].type} · ${freeConnectors[connector].power} кВт` : '—'],
              ['Дата', startsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })],
              ['Время', time + ' – ' + (() => { const [h, m] = time.split(':').map(Number); const end = h * 60 + m + duration; return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`; })()],
              ['Стоимость брони', plusFree ? 'Бесплатно с Plus' : `${fee.toLocaleString('ru-RU')} сум`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-sky-700/70">{k}</span>
                <span className="font-medium text-sky-900">{v}</span>
              </div>
            ))}
            <div className="border-t border-sky-200 pt-2 flex justify-between">
              <span className="font-semibold text-sky-800">Прогноз зарядки</span>
              <span className="font-bold text-sky-900 mono">~{estimatedCost.toLocaleString()} сум</span>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-6 pt-2">
        {bookError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{bookError}</p>
        )}
        {inPast && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mb-2 pg-reveal">Это время уже прошло — выберите позже</p>}
        <button onClick={submit} disabled={submitting || !freeConnectors[connector] || inPast}
          className="w-full disabled:opacity-50 text-[#111] rounded-2xl py-4 font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-[0_8px_22px_rgba(143,214,26,0.3)] disabled:shadow-none"
          style={{ background: 'linear-gradient(135deg,#D9F77A,#8FD61A)' }}>
          <CalendarCheck size={18} />{submitting ? 'Бронируем…' : plusFree ? 'Подтвердить бронь · бесплатно с Plus' : `Подтвердить бронь · ${fee.toLocaleString('ru-RU')} сум`}
        </button>
      </div>
    </div>
  );
}

/** The booking as an .ics file: the phone's calendar opens it and reminds before the slot. */
export function addToCalendar(b: Booking) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t: string) => t.replace(/[\\,;]/g, m => `\\${m}`);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${BRAND.name}//Booking//RU`, 'BEGIN:VEVENT',
    `UID:${b.id}@${BRAND.name.toLowerCase()}`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.startsAt)}`, `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${esc(`Зарядка · ${b.stationName ?? ''}`)}`,
    `DESCRIPTION:${esc(`Бронь ${b.code ?? ''} · ${b.connectorType} · ${b.power} кВт. Держим 15 минут после начала.`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Скоро бронь на зарядку', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `booking-${b.code ?? b.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BookingDoneScreen({ station, booking, onClose }: { station: Station | null; booking: Booking | null; onClose: () => void }) {
  const grace = usePlatform().booking.graceMin;
  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mb-5 shadow-lg shadow-amber-100 pg-pop">
          <CalendarCheck size={38} className="text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Бронь подтверждена!</h2>
        <p className="text-slate-500 text-sm mb-6">Разъём забронирован за вами — на карте он отмечен жёлтым.</p>

        <div className="w-full bg-white rounded-2xl border border-slate-100 p-4 mb-4 text-left">
          <p className="text-xs font-semibold text-slate-400 mb-3">ДЕТАЛИ БРОНИ</p>
          {[
            ['Станция', booking?.stationName || station?.name || '—'],
            ['Разъём', booking ? `${booking.connectorType} · ${booking.power} кВт` : '—'],
            ['Дата', booking ? new Date(booking.startsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—'],
            ['Время', booking ? `${fmtTime(booking.startsAt)} – ${fmtTime(booking.endsAt)}` : '—'],
            ['Номер брони', booking?.code ?? '—'],
            ['Статус', '🟡 Забронировано'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5 border-b border-slate-50 last:border-none text-sm">
              <span className="text-slate-500">{k}</span>
              <span className="font-medium text-slate-800">{v}</span>
            </div>
          ))}
        </div>

        <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <Clock size={12} />{`Приедьте в течение ${grace} минут после начала брони, иначе она будет отменена.`}
          </p>
        </div>
      </div>
      <div className="px-4 pb-8 grid grid-cols-2 gap-2">
        <button onClick={() => booking && addToCalendar(booking)} disabled={!booking} className="border border-slate-200 text-slate-700 rounded-2xl py-3 font-medium text-sm disabled:opacity-40">Добавить в календарь</button>
        <button onClick={onClose} className="bg-sky-500 text-white rounded-2xl py-3 font-semibold text-sm">Готово</button>
      </div>
    </div>
  );
}

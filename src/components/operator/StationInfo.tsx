import { useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import type { Station } from '../../data/mockData';
import { useSync } from '../../lib/sync';
import { shrink } from '../driver/SupportChat';
import { API_ORIGIN } from '../../lib/site';

const AMENITIES = ['Wi-Fi', 'Кафе', 'Туалет', 'Парковка', 'Крытая парковка', 'ТЦ', 'Магазин', 'Мойка'];

/**
 * What drivers see on the station card beyond connectors and prices: how to
 * find the charger on site, a real photo, opening hours and amenities.
 */
export default function StationInfo({ station }: { station: Station }) {
  const { actions, refresh } = useSync();
  const [hint, setHint] = useState(station.findHint ?? '');
  const [hours, setHours] = useState(station.hours ?? '24/7');
  const [amen, setAmen] = useState<string[]>(station.amenities ?? []);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      await actions.setStationInfo(station.id, { findHint: hint, hours, amenities: amen, ...(photo !== undefined ? { photo } : {}) });
      await refresh();
      setPhoto(undefined);
      setNote({ ok: true, text: 'Сохранено — водители видят это на карточке станции' });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const current = photo === undefined ? (station.photoAt ? `${API_ORIGIN}/api/stations/${station.id}/photo?v=${encodeURIComponent(station.photoAt)}` : null) : photo;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Для водителей</h3>
        <p className="text-xs text-slate-500">Как найти станцию на месте, фото, часы работы и удобства рядом</p>
      </div>
      {note && <p role="status" className={`text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}
      <label className="block text-xs font-semibold text-slate-500">
        Как найти
        <textarea value={hint} onChange={e => setHint(e.target.value)} maxLength={200} rows={2} placeholder="Например: паркинг −1, у лифта B, зарядки слева от въезда"
          className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-normal text-slate-800" />
      </label>
      <label className="block text-xs font-semibold text-slate-500 max-w-xs">
        Часы работы
        <input value={hours} onChange={e => setHours(e.target.value)} placeholder="24/7 или 08:00–22:00" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-normal text-slate-800" />
      </label>
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1.5">Удобства</p>
        <div className="flex flex-wrap gap-1.5">
          {AMENITIES.map(a => (
            <button key={a} onClick={() => setAmen(v => (v.includes(a) ? v.filter(x => x !== a) : [...v, a]))} aria-pressed={amen.includes(a)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${amen.includes(a) ? 'bg-[#FFC83D] text-[#111] border-[#FFC83D]' : 'bg-white text-slate-600 border-slate-200'}`}>{a}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1.5">Фото станции</p>
        <div className="flex items-center gap-3">
          {current ? <img src={current} alt="Фото станции" className="w-28 h-20 object-cover rounded-xl border border-slate-100" /> : <div className="w-28 h-20 rounded-xl bg-slate-100 grid place-items-center text-xs text-slate-400">нет фото</div>}
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">
            <ImagePlus size={15} />Загрузить
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && shrink(e.target.files[0], 1200).then(setPhoto).catch(() => setNote({ ok: false, text: 'Не удалось прочитать фото' }))} />
          </label>
          {current && (
            <button onClick={() => setPhoto(null)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"><Trash2 size={13} />Убрать</button>
          )}
        </div>
      </div>
      <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
        {busy && <LoaderCircle size={14} className="animate-spin" />}Сохранить
      </button>
    </div>
  );
}

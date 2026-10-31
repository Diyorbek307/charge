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
  const [gallery, setGallery] = useState(station.gallery ?? []);
  const [adding, setAdding] = useState(false);
  const addPhoto = async (file: File) => {
    setAdding(true);
    setNote(null);
    try {
      const data = await shrink(file, 1200);
      setGallery((await actions.addStationPhoto(station.id, data)).gallery);
      void refresh();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message || 'Не удалось прочитать фото' });
    } finally {
      setAdding(false);
    }
  };
  const removePhoto = async (photoId: string) => {
    try {
      setGallery((await actions.removeStationPhoto(station.id, photoId)).gallery);
      void refresh();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
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
      <div>
        <p className="text-xs font-semibold text-slate-500">Ещё фото <span className="font-normal">· до 6, водители листают их на карточке</span></p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {gallery.map(g => (
            <span key={g.id} className="relative">
              <img src={`${API_ORIGIN}/api/stations/${station.id}/gallery/${g.id}?v=${encodeURIComponent(g.at)}`} alt="" className="w-28 h-20 object-cover rounded-xl border border-slate-100" />
              <button onClick={() => void removePhoto(g.id)} aria-label="Убрать фото" className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-slate-200 grid place-items-center text-slate-500 hover:text-red-600 shadow-sm"><Trash2 size={12} /></button>
            </span>
          ))}
          {gallery.length < 6 && (
            <label className="w-28 h-20 rounded-xl border-2 border-dashed border-slate-200 grid place-items-center text-xs font-semibold text-slate-500 cursor-pointer hover:bg-slate-50">
              {adding ? <LoaderCircle size={16} className="animate-spin" /> : <span className="flex flex-col items-center gap-1"><ImagePlus size={16} />Добавить</span>}
              <input type="file" accept="image/*" className="hidden" disabled={adding} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addPhoto(f); }} />
            </label>
          )}
        </div>
      </div>
      <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
        {busy && <LoaderCircle size={14} className="animate-spin" />}Сохранить
      </button>
    </div>
  );
}

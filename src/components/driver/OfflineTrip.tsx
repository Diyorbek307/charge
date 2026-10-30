import { useMemo, useRef, useState } from 'react';
import { CloudDownload, CheckCircle, LoaderCircle, Trash2, WifiOff, X } from 'lucide-react';
import type { Station } from '../../data/mockData';
import { fetchRoute, fetchCameras, project, type LatLng, type Route } from '../../lib/nav';
import { savePack, deletePack, useOfflinePacks, tilesFor, estimateMb, MAX_TILES } from '../../lib/offline';

const when = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1048576))} МБ`;

/** A straight line between two places, when the road service cannot be reached. */
const straight = (a: LatLng, b: LatLng): LatLng[] => Array.from({ length: 41 }, (_, i) => ({ lat: a.lat + ((b.lat - a.lat) * i) / 40, lng: a.lng + ((b.lng - a.lng) * i) / 40 }));

/**
 * "Save for offline" under a planned trip: the road's map, the chargers along
 * it with their prices and codes, and the road itself for the navigator.
 */
export default function OfflineTrip({ id, name, from, to, stations, allStations }: { id: string; name: string; from: LatLng; to: LatLng; stations: Station[]; allStations: Station[] }) {
  const packs = useOfflinePacks();
  const saved = packs.find(p => p.id === id);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Before the road is known, a straight line ×1,25 gives a fair size.
  const guess = useMemo(() => estimateMb(Math.min(MAX_TILES, tilesFor(straight(from, to), stations.map(s => ({ lat: s.geoLat, lng: s.geoLng }))).length * 1.25)), [from, to, stations]);

  const save = async () => {
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      let route: Route | null = null;
      try {
        route = await fetchRoute(from, to);
      } catch {
        /* the road service is down: save the corridor along a straight line */
      }
      const line = route?.line ?? straight(from, to);
      // The chargers within reach of the road, not only the planned stops.
      const along = route ? allStations.filter(s => project(route, { lat: s.geoLat, lng: s.geoLng }).off < 20_000) : stations;
      const cameras = route ? await fetchCameras(route).catch(() => []) : [];
      await savePack({
        id,
        name,
        line,
        stations: along.length ? along : stations,
        cameras,
        allStations,
        signal: abort.current.signal,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(navigator.onLine ? 'Не удалось сохранить — попробуйте ещё раз' : 'Нужен интернет, чтобы сохранить трассу');
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${saved ? 'bg-emerald-50 text-emerald-600' : 'bg-[#111] text-[#FFC83D]'}`}>
          {saved ? <CheckCircle size={19} className="pg-pop" /> : <WifiOff size={18} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{saved ? 'Трасса сохранена для офлайна' : 'Без интернета в дороге'}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {saved
              ? `${when(saved.at)} · ${mb(saved.bytes)} · ${saved.stations.length} станций на пути. Карта, коды станций и маршрут работают без связи.`
              : `Сохраните карту трассы, станции с ценами и кодами и маршрут — на участках без связи всё откроется. ≈ ${guess} МБ`}
          </p>
        </div>
      </div>
      {progress !== null ? (
        <div className="mt-3 pg-reveal">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="inline-flex items-center gap-1.5"><LoaderCircle size={12} className="animate-spin" />Сохраняем трассу…</span>
            <span className="tabular-nums font-semibold text-slate-800">{`${progress}%`}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#FFD66B,#FFB000)' }} />
          </div>
          <button onClick={() => abort.current?.abort()} className="mt-2 text-xs text-slate-500 inline-flex items-center gap-1"><X size={12} />Отменить</button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={() => void save()} className={`flex-1 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 ${saved ? 'bg-slate-100 text-slate-700' : 'text-[#111]'}`} style={saved ? undefined : { background: 'linear-gradient(135deg,#FFD66B,#FFB000)' }}>
            <CloudDownload size={15} />{saved ? 'Обновить' : 'Сохранить для офлайна'}
          </button>
          {saved && (
            <button onClick={() => void deletePack(id)} aria-label="Удалить сохранённую трассу" className="px-3 rounded-xl bg-red-50 text-red-600"><Trash2 size={15} /></button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 pg-shake">{error}</p>}
      {packs.filter(p => p.id !== id).length > 0 && (
        <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400">{`Ещё сохранено: ${packs.filter(p => p.id !== id).map(p => p.name).join(', ')}`}</p>
      )}
    </div>
  );
}

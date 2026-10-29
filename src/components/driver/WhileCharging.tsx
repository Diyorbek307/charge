import { useEffect, useState, type ReactNode } from 'react';
import { Coffee, Moon, Bath, ShoppingBag, Hotel, Percent, LoaderCircle, ChevronRight } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { StationPlaces, PlaceKind } from '../../lib/api';

const KIND: Record<PlaceKind, { label: string; icon: ReactNode }> = {
  food: { label: 'Еда', icon: <Coffee size={13} /> },
  prayer: { label: 'Намаз', icon: <Moon size={13} /> },
  toilets: { label: 'Туалет', icon: <Bath size={13} /> },
  shop: { label: 'Магазин', icon: <ShoppingBag size={13} /> },
  hotel: { label: 'Ночлег', icon: <Hotel size={13} /> },
};
const mapLink = (lat: number, lng: number) => `https://yandex.uz/maps/?pt=${lng},${lat}&z=18&l=map`;
const cache = new Map<string, StationPlaces>();

/**
 * "While you charge": partners' offers first, then what else is a short walk
 * away. On the station card (light) and over the running charge (dark).
 */
export default function WhileCharging({ stationId, dark = false, minutes }: { stationId: string; dark?: boolean; minutes?: number }) {
  const { actions } = useSync();
  const [data, setData] = useState<StationPlaces | null>(() => cache.get(stationId) ?? null);
  const [kind, setKind] = useState<PlaceKind | null>(null);
  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      void actions.places(stationId).then(r => {
        cache.set(stationId, r);
        if (alive) setData(r);
        // The map service was slow: partners are shown now, the rest comes on a second look.
        if (!r.loaded && alive) retry = setTimeout(load, 8000);
      }).catch(() => undefined);
    if (!cache.get(stationId)?.loaded) load();
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [actions, stationId]);

  const tone = dark
    ? { card: 'bg-white/5 border-white/10', title: 'text-white/90', sub: 'text-white/45', chip: 'bg-white/10 text-white/80', chipOn: 'bg-[#FFC83D] text-[#111]', row: 'hover:bg-white/5', name: 'text-white/90' }
    : { card: 'bg-white border-slate-100', title: 'text-slate-800', sub: 'text-slate-500', chip: 'bg-slate-100 text-slate-700', chipOn: 'bg-[#111] text-white', row: 'hover:bg-slate-50', name: 'text-slate-800' };

  if (!data) {
    return (
      <div className={`rounded-2xl border p-3.5 ${tone.card}`}>
        <p className={`text-xs inline-flex items-center gap-1.5 ${tone.sub}`}><LoaderCircle size={12} className="animate-spin" />Ищем, что рядом…</p>
      </div>
    );
  }
  const total = Object.values(data.counts).reduce((n, x) => n + x, 0);
  if (!total && !data.partners.length) return null;
  const list = data.places.filter(p => !kind || p.kind === kind).slice(0, 5);
  const tap = (id: string) => void actions.tapPlace(id).catch(() => undefined);

  return (
    <div className={`rounded-2xl border p-3.5 ${tone.card} pg-reveal`}>
      <p className={`text-sm font-bold ${tone.title}`}>{minutes ? `Пока заряжается · ~${minutes} мин` : 'Пока заряжаетесь'}</p>
      <p className={`text-[11px] mb-2.5 ${tone.sub}`}>Что в нескольких минутах пешком от станции</p>

      {data.partners.map(p => (
        <a key={p.id} href={mapLink(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" onClick={() => tap(p.id)}
          className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#111]" style={{ background: 'linear-gradient(135deg,#FFF3C4,#FFE08A)' }}>
          <span className="w-9 h-9 rounded-xl bg-[#111] text-[#FFC83D] grid place-items-center shrink-0"><Percent size={16} strokeWidth={2.6} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-extrabold truncate">{p.name}</span>
            <span className="block text-xs opacity-80">{p.offer}</span>
            <span className="block text-[10px] opacity-60">{`${p.walkMin} мин пешком · партнёр PowerGo`}</span>
          </span>
          <ChevronRight size={15} className="opacity-50" />
        </a>
      ))}

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Что рядом">
        {(Object.keys(KIND) as PlaceKind[]).filter(k => data.counts[k]).map(k => (
          <button key={k} onClick={() => setKind(v => (v === k ? null : k))} aria-pressed={kind === k}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold ${kind === k ? tone.chipOn : tone.chip}`}>
            {KIND[k].icon}{`${KIND[k].label} · ${data.counts[k]}`}
          </button>
        ))}
      </div>
      {list.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {list.map(p => (
            <a key={p.id} href={mapLink(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${tone.row}`}>
              <span className={tone.sub}>{KIND[p.kind].icon}</span>
              <span className={`flex-1 min-w-0 text-xs truncate ${tone.name}`}>{p.name || KIND[p.kind].label}</span>
              <span className={`text-[11px] tabular-nums ${tone.sub}`}>{`${p.walkMin} мин`}</span>
            </a>
          ))}
        </div>
      )}
      <p className={`text-[10px] mt-2 ${tone.sub}`}>Места — © участники OpenStreetMap</p>
    </div>
  );
}

// Moved out of DriverApp.tsx: FavoritesScreen.
import { useState } from 'react';
import { Search, Star, ArrowLeft, Heart } from 'lucide-react';
import { Station } from '../../../data/mockData';
import { useLiveStations } from '../../../lib/live';
import { plural } from '../../../lib/analytics';
import { useFavorites } from '../favorites';
import { ChargerFriend } from '../Illustration';

export function FavoritesScreen({ onBack, onSelectStation }: { onBack: () => void; onSelectStation: (s: Station) => void }) {
  const stations = useLiveStations();
  const favorites = useFavorites();
  const favs = stations.filter(s => favorites.has(s.id));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'rating' | 'price'>('rating');
  const cheapest = (s: Station) => Math.min(Infinity, ...s.connectors.map(c => c.price));

  const q = query.trim().toLowerCase();
  const filtered = favs
    .filter(s => !q || `${s.name} ${s.operator} ${s.city}`.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
      return cheapest(a) - cheapest(b);
    });

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <button aria-label="Назад" onClick={onBack} className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900">Избранные станции</h1>
        <span className="ml-auto text-xs text-slate-400">{`${favs.length} ${plural(favs.length, ['станция', 'станции', 'станций'])}`}</span>
      </div>

      {favs.length > 0 && (
        <div className="bg-white px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Поиск по избранному"
              placeholder="Поиск станций…"
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-xs text-sky-500 font-medium shrink-0">Сбросить</button>
            )}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'name' | 'rating' | 'price')}
            aria-label="Сортировка"
            className="text-xs text-slate-600 bg-slate-100 rounded-xl px-2 py-2 outline-none border-none"
          >
            <option value="rating">Рейтинг</option>
            <option value="name">Название</option>
            <option value="price">Сначала дешевле</option>
          </select>
        </div>
      )}

      {favs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <ChargerFriend size={150} mood="wait" />
          <p className="text-slate-700 text-sm font-semibold mt-2">Пока пусто</p>
          <p className="text-slate-400 text-sm mt-0.5">Нажмите <Heart size={13} className="inline -mt-0.5 text-red-400" /> на карточке станции — она появится здесь.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <Search size={48} className="text-slate-200 mb-4" />
          <p className="text-slate-400 text-sm">Нет станций по запросу</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pg-stagger">
          {filtered.map(s => {
            const free = s.connectors.filter(c => c.status === 'available').length;
            const statusColors: Record<string, string> = { available: 'text-emerald-700', occupied: 'text-red-500', unavailable: 'text-slate-400', reserved: 'text-amber-500' };
            const statusLabels: Record<string, string> = { available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно', reserved: 'Забронировано' };
            return (
              <div key={s.id} role="button" tabIndex={0} onClick={() => onSelectStation(s)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectStation(s)}
                className="w-full bg-white rounded-2xl border border-slate-100 p-4 text-left hover:border-sky-200 transition-colors cursor-pointer active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img src={s.image} alt={s.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.operator}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); favorites.toggle(s.id); }} aria-label={`Убрать ${s.name} из избранного`}
                        className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
                        <Heart size={14} className="fill-red-500 text-red-500" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className={`font-medium ${statusColors[s.status]}`}>{statusLabels[s.status]}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{free}/{s.connectors.length} разъёмов</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{s.totalPower} кВт</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-0.5">
                        <Star size={10} className="text-amber-400 fill-amber-400" />{s.rating.toFixed(1)}
                      </span>
                      <span>{`от ${cheapest(s).toLocaleString('ru-RU')} сум/кВт·ч`}</span>
                      <span>{s.city}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

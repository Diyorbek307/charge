import { useEffect, useRef, useState } from 'react';
import { Search, User, MapPin, Building2, Activity, Inbox, CornerDownLeft, X } from 'lucide-react';
import type { SearchHit } from '../../lib/api';
import { useSync } from '../../lib/sync';

const ICON: Record<SearchHit['kind'], React.ReactNode> = {
  user: <User size={15} />,
  station: <MapPin size={15} />,
  operator: <Building2 size={15} />,
  session: <Activity size={15} />,
  lead: <Inbox size={15} />,
};
const KIND: Record<SearchHit['kind'], string> = { user: 'Водитель', station: 'Станция', operator: 'Сеть', session: 'Зарядка', lead: 'Заявка' };

/** Opens the search from anywhere: the menu's button, the phone's top bar. */
let opener: (() => void) | null = null;
export const openAdminSearch = () => opener?.();

/** The button that opens the search, wherever it is placed. */
export function SearchButton({ className = '', label = true }: { className?: string; label?: boolean }) {
  return (
    <button onClick={openAdminSearch} aria-label="Поиск по админке (Ctrl+K)" title="Поиск (Ctrl+K)" className={`inline-flex items-center gap-2 ${className}`}>
      <Search size={15} />
      {label && <span className="flex-1 text-left text-[13px]">Поиск</span>}
      {label && <kbd className="text-[10px] font-semibold opacity-60 border border-current/20 rounded px-1.5 py-0.5">Ctrl K</kbd>}
    </button>
  );
}

/** What the next admin page should search for when it opens; it takes it once. */
let pending = '';
export const takeSearch = () => {
  const q = pending;
  pending = '';
  return q;
};

/**
 * One box for the whole admin panel, on Ctrl+K or the magnifier: drivers,
 * stations, networks, charges and applications. Picking a hit opens its page
 * with the search already filled in.
 */
export default function AdminSearch({ onOpen }: { onOpen: (page: string) => void }) {
  const { actions } = useSync();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ahead of the app-wide palette: inside the admin, Ctrl+K searches the admin.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(o => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    opener = () => setOpen(true);
    return () => {
      opener = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setHits([]);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      actions.adminSearch(q.trim()).then(r => { setHits(r.hits); setCursor(0); }).catch(() => setHits([]));
    }, 160);
    return () => clearTimeout(t);
  }, [q, actions]);

  const pick = (h: SearchHit) => {
    pending = h.query;
    setOpen(false);
    onOpen(h.page);
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[450] flex items-start justify-center pt-[10vh] px-3 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Поиск" className="w-full max-w-[560px] rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
              <Search size={18} className="text-slate-400" />
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Водитель, телефон, станция, сеть, номер зарядки или заявки"
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, hits.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
                  else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); pick(hits[cursor]); }
                }}
                className="flex-1 bg-transparent outline-none focus-visible:outline-none text-[15px] text-slate-900 placeholder:text-slate-400" style={{ outline: "none" }} />
              <button onClick={() => setOpen(false)} aria-label="Закрыть" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {q.trim().length < 2 && <p className="px-4 py-6 text-center text-sm text-slate-400">Начните вводить — ищем по всей платформе</p>}
              {q.trim().length >= 2 && hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Ничего не нашлось</p>}
              {hits.map((h, i) => (
                <button key={`${h.kind}-${h.id}`} onClick={() => pick(h)} onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-[#FFF4D2]' : ''}`}>
                  <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 grid place-items-center shrink-0">{ICON[h.kind]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{h.title}</span>
                    <span className="block text-xs text-slate-500 truncate">{h.sub}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">{KIND[h.kind]}</span>
                  {i === cursor && <CornerDownLeft size={14} className="text-slate-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, CornerDownLeft, Car, Building2, Shield, Briefcase, BookOpen, Network, Home, Columns2, Activity, LogOut } from 'lucide-react';
import { useSync } from '../lib/sync';
import type { Portal as AuthPortal } from '../lib/api';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Case-insensitive subsequence match, so "adm cen" finds "Admin Control Center". */
function matches(query: string, text: string) {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export default function CommandPalette({
  onNavigate,
  onSplitView,
}: {
  onNavigate: (portal: string) => void;
  onSplitView: () => void;
}) {
  const { sessions, logout, connection, state } = useSync();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // Focus after the dialog paints, otherwise the caret lands nowhere.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (portal: string) => () => {
      onNavigate(portal);
      setOpen(false);
    };

    const list: Command[] = [
      { id: 'selector', label: 'Все порталы', group: 'Навигация', icon: <Home size={15} />, run: go('selector') },
      { id: 'driver', label: 'Driver App', hint: 'Мобильное приложение', group: 'Порталы', icon: <Car size={15} />, run: go('driver') },
      { id: 'operator', label: 'Operator Portal', hint: 'Кабинет оператора', group: 'Порталы', icon: <Building2 size={15} />, run: go('operator') },
      { id: 'admin', label: 'Admin Control Center', hint: 'Национальный мониторинг', group: 'Порталы', icon: <Shield size={15} />, run: go('admin') },
      { id: 'business', label: 'Business Portal', hint: 'Корпоративный кабинет', group: 'Порталы', icon: <Briefcase size={15} />, run: go('business') },
      { id: 'api', label: 'Partner API', hint: 'Документация', group: 'Порталы', icon: <BookOpen size={15} />, run: go('api') },
      { id: 'architecture', label: 'Архитектура платформы', group: 'Порталы', icon: <Network size={15} />, run: go('architecture') },
      {
        id: 'split',
        label: 'Сравнить порталы',
        hint: 'Два портала рядом',
        group: 'Действия',
        icon: <Columns2 size={15} />,
        run: () => {
          onSplitView();
          setOpen(false);
        },
      },
      {
        id: 'status',
        label: `Синхронизация: ${connection === 'live' ? 'активна' : connection === 'connecting' ? 'подключение' : 'нет связи'}`,
        hint: state ? `${state.stats.activeSessions} активных · ${state.stats.evseOnline}/${state.stats.evseTotal} EVSE` : undefined,
        group: 'Статус',
        icon: <Activity size={15} />,
        run: () => setOpen(false),
      },
    ];

    (Object.entries(sessions) as [AuthPortal, unknown][])
      .filter(([, account]) => account)
      .forEach(([portal, account]) => {
        list.push({
          id: `logout-${portal}`,
          label: `Выйти из ${portal}`,
          hint: (account as { name: string }).name,
          group: 'Сессии',
          icon: <LogOut size={15} />,
          run: () => {
            void logout(portal);
            setOpen(false);
          },
        });
      });

    return list;
  }, [onNavigate, onSplitView, sessions, logout, connection, state]);

  const filtered = useMemo(
    () => commands.filter(c => matches(query, c.label + ' ' + (c.hint ?? ''))),
    [commands, query],
  );

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(0);
  }, [filtered.length, cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => (c + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => (c - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[cursor]?.run();
    }
  };

  if (!open) return null;

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      style={{ animation: 'fade-in 0.15s ease both' }}
    >
      <div
        role="dialog"
        aria-label="Командная палитра"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-2xl border border-white/12 bg-slate-950/95 shadow-2xl overflow-hidden"
        style={{ animation: 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10">
          <Search size={15} className="text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Куда перейти?"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
          />
          <kbd className="text-[10px] text-slate-600 border border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-slate-500">Ничего не найдено</p>
          )}
          {filtered.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {showGroup && (
                  <p className="px-4 pt-2.5 pb-1 text-[9px] font-bold tracking-widest text-slate-600 uppercase">
                    {c.group}
                  </p>
                )}
                <button
                  onClick={c.run}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === cursor ? 'bg-white/8' : 'hover:bg-white/5'
                  }`}
                >
                  <span className={i === cursor ? 'text-sky-400' : 'text-slate-500'}>{c.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-white truncate">{c.label}</span>
                    {c.hint && <span className="block text-[11px] text-slate-500 truncate">{c.hint}</span>}
                  </span>
                  {i === cursor && <CornerDownLeft size={13} className="text-slate-600 shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-white/10 text-[10px] text-slate-600">
          <span>↑↓ выбор</span>
          <span>↵ открыть</span>
          <span className="ml-auto">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, LoaderCircle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { delta } from '../../lib/analytics';

/**
 * Shared building blocks for the console pages, so every page has the same
 * header, cards and states. Plain Tailwind classes, which the dark theme in
 * index.css already restyles.
 */

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="p-4 md:p-6 pb-28 space-y-5 overflow-y-auto h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 pl-10 md:pl-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, right, children, className = '', pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-100 ${pad ? 'p-5' : ''} ${className}`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {(title || right) && (
        <div className={`flex items-center justify-between gap-3 ${pad ? 'mb-4' : 'px-5 pt-4 pb-3'}`}>
          {title && <h3 className="text-sm font-semibold text-slate-700">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  change,
  goodWhenUp = true,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  change?: number | null;
  goodWhenUp?: boolean;
  icon?: ReactNode;
  tone?: 'slate' | 'sky' | 'emerald' | 'amber' | 'violet' | 'red';
}) {
  const toneCls = {
    slate: 'bg-slate-50 text-slate-500',
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    red: 'bg-red-50 text-red-500',
  }[tone];
  const shown = delta(change);
  const good = change !== null && change !== undefined && (change >= 0) === goodWhenUp;
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        {icon && <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${toneCls}`}>{icon}</div>}
      </div>
      <p className="text-[26px] font-bold text-slate-900 leading-none tracking-tight tabular-nums">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs">
        {shown && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
            {(change ?? 0) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {shown}
          </span>
        )}
        {sub && <span className="text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

export function Loading({ label = 'Загружаем данные…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
      <LoaderCircle size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{text}</p>;
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 text-sm">
      <Inbox size={26} />
      {text}
    </div>
  );
}

const PILL = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
};
export function Pill({ tone = 'slate', children }: { tone?: keyof typeof PILL; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-slate-100" role="group">
      {options.map(o => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${value === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal bars with labels — for rankings. */
export function BarList({ rows, color = '#0AAF97' }: { rows: { key: string; label: ReactNode; value: number; display: ReactNode; sub?: ReactNode }[]; color?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
            <span className="min-w-0 truncate text-slate-700">
              <span className="text-slate-400 mr-2 tabular-nums">{i + 1}</span>
              {r.label}
              {r.sub && <span className="text-xs text-slate-400 ml-2">{r.sub}</span>}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums shrink-0">{r.display}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Pagination({ page, pages, onPage, total, label = 'записей' }: { page: number; pages: number; onPage: (p: number) => void; total: number; label?: string }) {
  if (pages <= 1) return <p className="px-5 py-3 text-xs text-slate-400">{total} {label}</p>;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-50 text-xs text-slate-500">
      <span>{total} {label} · страница {page} из {pages}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Назад" className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Вперёд" className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full sm:w-72 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-sky-400"
    />
  );
}

/** Colour series shared by the charts. */
export const CHART = {
  primary: '#0AAF97',
  secondary: '#4F6BFF',
  accent: '#F59E0B',
  muted: '#CBD5E1',
  grid: '#F1F5F9',
  axis: '#94A3B8',
  palette: ['#0AAF97', '#4F6BFF', '#F59E0B', '#EF4444', '#8B5CF6', '#94A3B8'],
};

export const STATUS_PILL: Record<string, { tone: keyof typeof PILL; label: string }> = {
  completed: { tone: 'slate', label: 'Завершена' },
  active: { tone: 'green', label: 'Идёт' },
  failed: { tone: 'red', label: 'Ошибка' },
  paid: { tone: 'green', label: 'Оплачен' },
  pending: { tone: 'amber', label: 'Ожидает' },
  cancelled: { tone: 'slate', label: 'Отменён' },
  expired: { tone: 'slate', label: 'Истёк' },
  accruing: { tone: 'sky', label: 'Начисляется' },
  processing: { tone: 'amber', label: 'В обработке' },
  blocked: { tone: 'red', label: 'Заблокирован' },
  suspended: { tone: 'red', label: 'Приостановлен' },
};

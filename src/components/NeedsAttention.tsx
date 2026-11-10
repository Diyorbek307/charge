import { ArrowRight, CheckCircle2 } from 'lucide-react';

/**
 * Everything waiting for someone, one tap from the page that deals with it:
 * urgent ones (SOS, chats, critical faults) first and in red.
 */
export default function NeedsAttention({ items, onNavigate, allClear = 'Всё разобрано: ни заявок, ни чатов, ни SOS не ждут' }: { items: { key: string; page: string; count: number; label: string; urgent: boolean }[] | null; onNavigate: (page: string) => void; allClear?: string }) {
  if (!items) return null;
  const waiting = items.filter(i => i.count > 0).sort((a, b) => Number(b.urgent) - Number(a.urgent));
  if (!waiting.length) {
    return <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3"><CheckCircle2 size={16} />{allClear}</p>;
  }
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Требует внимания</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {waiting.map(i => (
          <button key={i.key} onClick={() => onNavigate(i.page)}
            className={`shrink-0 inline-flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-2xl border text-sm font-semibold transition-colors ${i.urgent ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            <span className={`min-w-[26px] h-[26px] px-1.5 rounded-full grid place-items-center text-xs font-bold tabular-nums ${i.urgent ? 'bg-red-600 text-white' : 'bg-[#C6F432] text-[#111]'}`}>{i.count}</span>
            {i.label}
            <ArrowRight size={14} className="opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
}

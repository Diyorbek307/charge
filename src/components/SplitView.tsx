import { useState, useRef } from 'react';
import { X, ArrowLeftRight, RefreshCw, Columns2, Rows2, Zap } from 'lucide-react';
import { useSync } from '../lib/sync';

type PaneId = 'driver' | 'operator' | 'admin' | 'business' | 'api' | 'architecture';

const PANES: { id: PaneId; label: string; color: string }[] = [
  { id: 'driver', label: 'Driver App', color: '#38BDF8' },
  { id: 'operator', label: 'Operator Portal', color: '#34D399' },
  { id: 'admin', label: 'Admin Center', color: '#A78BFA' },
  { id: 'business', label: 'Business Portal', color: '#818CF8' },
  { id: 'api', label: 'Partner API', color: '#94A3B8' },
  { id: 'architecture', label: 'Архитектура', color: '#2DD4BF' },
];

function Pane({
  value,
  onChange,
  side,
}: {
  value: PaneId;
  onChange: (v: PaneId) => void;
  side: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const meta = PANES.find(p => p.id === value)!;

  const reload = () => {
    if (frame.current) frame.current.src = `/?portal=${value}`;
  };

  return (
    <div className="flex flex-col min-w-0 min-h-0 flex-1 border border-white/10 rounded-xl overflow-hidden bg-slate-950">
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/10 bg-white/[0.03] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase hidden sm:inline">{side}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value as PaneId)}
          aria-label={`Портал в панели ${side}`}
          className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-white outline-none cursor-pointer [&>option]:bg-slate-900"
        >
          {PANES.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          onClick={reload}
          aria-label="Перезагрузить панель"
          className="w-6 h-6 grid place-items-center rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <iframe
        ref={frame}
        title={`${meta.label} — панель ${side}`}
        src={`/?portal=${value}`}
        className="flex-1 w-full min-h-0 border-0 bg-slate-950"
      />
    </div>
  );
}

export default function SplitView({ onClose }: { onClose: () => void }) {
  const [left, setLeft] = useState<PaneId>('driver');
  const [right, setRight] = useState<PaneId>('operator');
  const [stacked, setStacked] = useState(false);
  const { eventCount, connection } = useSync();

  const swap = () => {
    setLeft(right);
    setRight(left);
  };

  const dot = connection === 'live' ? '#34D399' : connection === 'connecting' ? '#FBBF24' : '#F87171';

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#38BDF8,#0284C7)' }}
          >
            <Zap size={14} className="text-white" />
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-xs font-bold text-white leading-none">Демо синхронизации</p>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">Два портала · одна база данных</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-white/[0.04] border border-white/10 rounded-full px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot, boxShadow: `0 0 6px ${dot}` }} />
            <span className="mono">{eventCount}</span>
            <span className="hidden sm:inline">событий</span>
          </span>

          <button
            onClick={swap}
            aria-label="Поменять панели местами"
            className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ArrowLeftRight size={14} />
          </button>
          <button
            onClick={() => setStacked(s => !s)}
            aria-label={stacked ? 'Расположить рядом' : 'Расположить друг под другом'}
            className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            {stacked ? <Columns2 size={14} /> : <Rows2 size={14} />}
          </button>
          <button
            onClick={onClose}
            aria-label="Закрыть режим сравнения"
            className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Hint */}
      <p className="px-3 py-1.5 text-[11px] text-slate-500 border-b border-white/[0.06] shrink-0 leading-snug">
        Войдите в оба портала и начните зарядку слева — справа всё обновится само, без перезагрузки.
      </p>

      {/* Panes */}
      <div className={`flex-1 min-h-0 p-2 gap-2 flex ${stacked ? 'flex-col' : 'flex-col md:flex-row'}`}>
        <Pane value={left} onChange={setLeft} side="A" />
        <Pane value={right} onChange={setRight} side="B" />
      </div>
    </div>
  );
}

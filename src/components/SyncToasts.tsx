import { useEffect, useRef, useState } from 'react';
import { Zap, Plug, Radio, TriangleAlert, Wallet, LogIn, Activity } from 'lucide-react';
import { useSync } from '../lib/sync';
import type { SyncEvent } from '../lib/api';

const STYLE: Record<string, { color: string; label: string }> = {
  driver: { color: '#FFC83D', label: 'DRIVER' },
  operator: { color: '#34D399', label: 'OPERATOR' },
  admin: { color: '#8DA2FF', label: 'ADMIN' },
  business: { color: '#818CF8', label: 'BUSINESS' },
  api: { color: '#94A3B8', label: 'API' },
  system: { color: '#FBBF24', label: 'OCPP' },
};

const ICONS: Record<string, typeof Zap> = {
  'session.start': Zap,
  'session.stop': Plug,
  'evse.status': Radio,
  'alert.new': TriangleAlert,
  'alert.ack': TriangleAlert,
  'wallet.topup': Wallet,
  'auth.login': LogIn,
};

/** Meter ticks fire constantly and would drown out anything meaningful. */
const MUTED = new Set(['session.tick']);

export default function SyncToasts() {
  const { events, sessions } = useSync();
  const [visible, setVisible] = useState<SyncEvent[]>([]);
  // A demo showcase of cross-portal sync: on a phone it would cover the page header.
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const mine = new Set(Object.values(sessions).filter(Boolean).map(a => a!.name));
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Skip the backlog that arrives with the first snapshot.
    if (seen.current === null) {
      seen.current = new Set(events.map(e => e.id));
      return;
    }

    // Your own sign-in is not news to you.
    const fresh = events.filter(e => !seen.current!.has(e.id) && !MUTED.has(e.type) && !(e.type === 'auth.login' && mine.has(e.actor)));
    if (fresh.length === 0) return;
    fresh.forEach(e => seen.current!.add(e.id));

    setVisible(prev => [...fresh, ...prev].slice(0, 3));

    const timer = setTimeout(() => {
      setVisible(prev => prev.filter(v => !fresh.some(f => f.id === v.id)));
    }, 4500);
    return () => clearTimeout(timer);
  }, [events]);

  if (visible.length === 0 || !wide) return null;

  return (
    <div className="fixed z-[160] top-3 left-1/2 -translate-x-1/2 w-[min(340px,calc(100vw-24px))] space-y-2 pointer-events-none">
      {visible.map(e => {
        const style = STYLE[e.portal] ?? STYLE.system;
        const Icon = ICONS[e.type] ?? Activity;
        return (
          <div
            key={e.id}
            className="flex items-start gap-2.5 rounded-xl border border-white/12 bg-slate-950/92 backdrop-blur-md px-3 py-2.5 shadow-2xl"
            style={{ animation: 'slide-up 0.32s cubic-bezier(0.16,1,0.3,1) both' }}
          >
            <div
              className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
              style={{ backgroundColor: `${style.color}1f`, color: style.color }}
            >
              <Icon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${style.color}1f`, color: style.color }}
              >
                {style.label}
              </span>
              <p className="text-[12px] text-slate-100 leading-snug mt-1 break-words">{e.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

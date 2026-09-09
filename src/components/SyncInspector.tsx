import { useEffect, useState } from 'react';
import { Activity, X, Radio, Zap, TriangleAlert, Wallet, Users, Building2, LogIn, RotateCcw, Plug } from 'lucide-react';
import { useSync } from '../lib/sync';
import type { SyncEvent } from '../lib/api';

const PORTAL_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  driver: { label: 'DRIVER', color: '#38BDF8', bg: 'rgba(56,189,248,0.12)' },
  operator: { label: 'OPERATOR', color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
  admin: { label: 'ADMIN', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  business: { label: 'BUSINESS', color: '#818CF8', bg: 'rgba(129,140,248,0.12)' },
  api: { label: 'API', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  system: { label: 'OCPP', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
};

const EVENT_ICON: Record<string, typeof Zap> = {
  'session.start': Zap,
  'session.stop': Plug,
  'session.tick': Activity,
  'evse.status': Radio,
  'alert.new': TriangleAlert,
  'alert.ack': TriangleAlert,
  'wallet.topup': Wallet,
  'employee.limit': Users,
  'operator.status': Building2,
  'auth.login': LogIn,
  'system.reset': RotateCcw,
};

function relativeTime(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'сейчас';
  if (s < 60) return `${s} с назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  return `${h} ч назад`;
}

function EventRow({ event }: { event: SyncEvent }) {
  const style = PORTAL_STYLE[event.portal] ?? PORTAL_STYLE.system;
  const Icon = EVENT_ICON[event.type] ?? Activity;

  return (
    <div className="flex gap-2.5 px-3 py-2.5 border-b border-white/[0.06] last:border-b-0">
      <div
        className="w-7 h-7 rounded-lg grid place-items-center shrink-0 mt-0.5"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
            style={{ backgroundColor: style.bg, color: style.color }}
          >
            {style.label}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{event.type}</span>
        </div>
        <p className="text-[12px] text-slate-200 leading-snug mt-1 break-words">{event.message}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">
          {event.actor} · {relativeTime(event.ts)}
        </p>
      </div>
    </div>
  );
}

export default function SyncInspector() {
  const { connection, events, eventCount, state, sessions } = useSync();
  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);

  // Keeps the relative timestamps honest while the panel stays open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => forceTick(n => n + 1), 10000);
    return () => clearInterval(t);
  }, [open]);

  const dot = connection === 'live' ? '#34D399' : connection === 'connecting' ? '#FBBF24' : '#F87171';
  const label = connection === 'live' ? 'LIVE' : connection === 'connecting' ? 'СВЯЗЬ…' : 'ОФФЛАЙН';
  const signedIn = (Object.entries(sessions) as [string, unknown][]).filter(([, v]) => v);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть монитор синхронизации"
          className="fixed z-[150] bottom-4 right-4 flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/85 backdrop-blur px-3.5 py-2.5 shadow-2xl hover:border-white/25 transition-colors"
        >
          <span className="relative flex items-center justify-center">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot, boxShadow: `0 0 8px ${dot}` }} />
            {connection === 'live' && (
              <span
                className="absolute w-2 h-2 rounded-full animate-ping"
                style={{ backgroundColor: dot, opacity: 0.65 }}
              />
            )}
          </span>
          <span className="text-[11px] font-semibold text-white tracking-wide hidden sm:inline">Sync</span>
          {eventCount > 0 && (
            <span className="text-[10px] font-bold text-slate-950 bg-sky-400 rounded-full min-w-[18px] h-[18px] px-1 grid place-items-center">
              {eventCount > 99 ? '99+' : eventCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed z-[150] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]">
          <div
            className="rounded-t-2xl sm:rounded-2xl border border-white/12 bg-slate-950/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: 'min(70vh, 560px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-white/8 shrink-0">
              <span className="relative flex items-center justify-center">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot, boxShadow: `0 0 8px ${dot}` }} />
                {connection === 'live' && (
                  <span className="absolute w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: dot, opacity: 0.65 }} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white leading-none">Синхронизация</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {label} · {eventCount} событий за сессию
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="w-7 h-7 grid place-items-center rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Live stats */}
            {state && (
              <div className="grid grid-cols-3 gap-px bg-white/8 shrink-0">
                {[
                  { label: 'активных', value: state.stats.activeSessions },
                  { label: 'EVSE онлайн', value: `${state.stats.evseOnline}/${state.stats.evseTotal}` },
                  { label: 'алертов', value: state.stats.openAlerts },
                ].map(s => (
                  <div key={s.label} className="bg-slate-950 px-2 py-2.5 text-center">
                    <p className="text-sm font-bold text-white mono leading-none">{s.value}</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Signed-in portals */}
            <div className="px-3.5 py-2 border-b border-white/8 shrink-0 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">Вошли:</span>
              {signedIn.length === 0 ? (
                <span className="text-[10px] text-slate-600">никто</span>
              ) : (
                signedIn.map(([portal]) => {
                  const st = PORTAL_STYLE[portal] ?? PORTAL_STYLE.system;
                  return (
                    <span
                      key={portal}
                      className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                  );
                })
              )}
            </div>

            {/* Event stream */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {events.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Activity size={22} className="mx-auto text-slate-700 mb-2.5" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Пока тихо. Начните зарядку в Driver App или измените статус EVSE в кабинете оператора —
                    событие появится здесь мгновенно во всех порталах.
                  </p>
                </div>
              ) : (
                events.map(e => <EventRow key={e.id + e.ts} event={e} />)
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

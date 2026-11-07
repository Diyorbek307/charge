import { authHeaders, type Session } from './api';
import { API_ORIGIN, inNativeShell } from './site';

/**
 * The charge's Live Activity on iPhone (lock screen and Dynamic Island).
 * The native side is ios/VoliLiveActivity (LiveActivityPlugin); until it is
 * added to the iOS build (docs/ios-live-activity.md) the plugin is absent
 * and all of this quietly does nothing. The server then keeps the card moving
 * through Apple (server/apns.js).
 */
type Cap = { getPlatform?: () => string; isPluginAvailable?: (n: string) => boolean; Plugins?: Record<string, LivePlugin | undefined> };
type LivePlugin = {
  available: () => Promise<{ available: boolean }>;
  start: (o: { sessionId: string; station: string; sub: string; state: Record<string, unknown> }) => Promise<{ pushToken?: string }>;
  end: (o: { sessionId?: string }) => Promise<void>;
};
const cap = () => (window as { Capacitor?: Cap }).Capacitor;
const plugin = (): LivePlugin | null => {
  const c = cap();
  if (!inNativeShell() || c?.getPlatform?.() !== 'ios' || !c.isPluginAvailable?.('LiveActivity')) return null;
  return c.Plugins?.LiveActivity ?? null;
};

const started = new Set<string>();

/** Starts the card for a running charge, once, and tells the server where to send its updates. */
export async function startLiveActivity(session: Session) {
  const p = plugin();
  if (!p || started.has(session.id) || session.status !== 'active') return;
  started.add(session.id);
  try {
    if (!(await p.available()).available) return;
    const { pushToken } = await p.start({
      sessionId: session.id,
      station: session.stationName,
      sub: session.connector ?? '',
      state: { stage: 'live', pct: -1, energy: String(session.energy ?? 0), cost: String(session.cost ?? 0), power: '', status: 'Идёт зарядка', left: '', lEnergy: 'Энергия', lCost: 'Стоимость', lPower: 'Мощность', uKwh: 'кВт·ч', uSum: 'сум', uKw: 'кВт' },
    });
    if (pushToken) {
      await fetch(`${API_ORIGIN}/api/push/live-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders('driver') },
        body: JSON.stringify({ sessionId: session.id, token: pushToken }),
      });
    }
  } catch {
    started.delete(session.id);
  }
}

/** Ends the card when the charge screen sees the charge finished (the server ends it too). */
export function endLiveActivity(sessionId: string) {
  void plugin()?.end({ sessionId }).catch(() => {});
}

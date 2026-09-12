import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  apiClient,
  tokenStore,
  type Account,
  type DemoCredential,
  type PlatformState,
  type Portal,
  type SyncEvent,
} from './api';

type ConnectionState = 'connecting' | 'live' | 'offline';

interface SyncContextValue {
  state: PlatformState | null;
  connection: ConnectionState;
  events: SyncEvent[];
  eventCount: number;
  credentials: DemoCredential[];
  sessions: Record<Portal, Account | null>;
  refresh: () => Promise<void>;
  login: (
    portal: Portal,
    login: string,
    password: string,
  ) => Promise<{ requires2fa: true; challenge: string } | { requires2fa: false; user: Account }>;
  verify2fa: (portal: Portal, challenge: string, code: string) => Promise<Account>;
  loginWithOtp: (phone: string, code: string) => Promise<Account>;
  requestOtp: (phone: string) => Promise<string>;
  logout: (portal: Portal) => Promise<void>;
  actions: typeof apiClient;
  lastError: string | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const EMPTY_SESSIONS: Record<Portal, Account | null> = {
  driver: null,
  operator: null,
  admin: null,
  business: null,
  api: null,
};

/** Union of per-portal state slices, keyed by id. */
function mergeStates(parts: PlatformState[]): PlatformState {
  const byId = <T extends { id: string }>(pick: (p: PlatformState) => T[] | undefined) => {
    const map = new Map<string, T>();
    parts.forEach(p => (pick(p) ?? []).forEach(item => map.set(item.id, { ...map.get(item.id), ...item })));
    return [...map.values()];
  };
  const richest = parts.find(p => p.stats.revenueToday !== null) ?? parts[0];
  return {
    ...parts[0],
    operators: richest.operators,
    sessions: byId(p => p.sessions),
    transactions: byId(p => p.transactions),
    alerts: byId(p => p.alerts),
    vehicles: byId(p => p.vehicles),
    employees: byId(p => p.employees),
    // A named entry beats the anonymous copy of the same place in line.
    queues: byId(p => p.queues),
    events: byId(p => p.events).sort((a, b) => b.ts.localeCompare(a.ts)),
    wallets: Object.assign({}, ...parts.map(p => p.wallets)),
    stats: richest.stats,
  };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [credentials, setCredentials] = useState<DemoCredential[]>([]);
  const [sessions, setSessions] = useState<Record<Portal, Account | null>>(EMPTY_SESSIONS);
  const [lastError, setLastError] = useState<string | null>(null);

  // refresh() is stable, so it reads the signed-in portals through a ref.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const signedInPortals = (Object.keys(sessions) as Portal[]).filter(p => sessions[p]);
  const portalKey = [...signedInPortals].sort().join(',');

  // Coalesces the refetches triggered by bursts of incoming events.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The server scopes state to each token, so a browser signed into several
   * portals fetches each slice and merges them — it never sees more than its
   * own credentials allow.
   */
  const refresh = useCallback(async () => {
    try {
      const portals = (Object.keys(sessionsRef.current) as Portal[]).filter(p => sessionsRef.current[p]);
      const settled = portals.length
        ? await Promise.allSettled(portals.map(p => apiClient.getState(p)))
        : [];
      const snapshots = settled.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
      setState(snapshots.length ? mergeStates(snapshots) : await apiClient.getState());
      setLastError(null);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, []);

  // Signing in or out changes what this browser may see.
  useEffect(() => {
    void refresh();
  }, [portalKey, refresh]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 180);
  }, [refresh]);

  // Initial load: shared state, demo credentials, and any still-valid sessions.
  useEffect(() => {
    void refresh();

    apiClient
      .getDemoCredentials()
      .then(setCredentials)
      .catch(() => setCredentials([]));

    const portals: Portal[] = ['driver', 'operator', 'admin', 'business', 'api'];
    portals.forEach(portal => {
      if (!tokenStore.get(portal)) return;
      apiClient
        .me(portal)
        .then(({ user }) => setSessions(s => ({ ...s, [portal]: user })))
        .catch(() => {
          tokenStore.clear(portal);
          setSessions(s => ({ ...s, [portal]: null }));
        });
    });
  }, [refresh]);

  // Live channel. One stream per signed-in portal (or one anonymous stream),
  // each opened with a single-use ticket because EventSource cannot send an
  // Authorization header. Streams overlap, so events are de-duplicated by id.
  const seenEventIds = useRef(new Set<string>());
  useEffect(() => {
    let closed = false;
    const sources = new Set<EventSource>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const portals: (Portal | null)[] = portalKey ? (portalKey.split(',') as Portal[]) : [null];

    const retry = (portal: Portal | null) => {
      const t = setTimeout(() => {
        timers.delete(t);
        void open(portal);
      }, 3000);
      timers.add(t);
    };

    const open = async (portal: Portal | null) => {
      if (closed) return;
      setConnection('connecting');
      let url = '/api/stream';
      if (portal) {
        try {
          const { ticket } = await apiClient.streamTicket(portal);
          url += `?ticket=${ticket}`;
        } catch {
          retry(portal);
          return;
        }
      }
      if (closed) return;

      const source = new EventSource(url);
      sources.add(source);
      source.onopen = () => setConnection('live');
      source.onmessage = e => {
        let event: SyncEvent | { type: string; id?: string };
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        if (event.type === 'connected') {
          setConnection('live');
          return;
        }
        const full = event as SyncEvent;
        if (seenEventIds.current.has(full.id)) return;
        seenEventIds.current.add(full.id);
        setEvents(prev => [full, ...prev].slice(0, 80));
        setEventCount(n => n + 1);
        scheduleRefresh();
      };
      // A used ticket cannot reconnect, so reopen with a fresh one.
      source.onerror = () => {
        source.close();
        sources.delete(source);
        setConnection('offline');
        retry(portal);
      };
    };

    portals.forEach(p => void open(p));

    return () => {
      closed = true;
      sources.forEach(src => src.close());
      timers.forEach(t => clearTimeout(t));
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [portalKey, scheduleRefresh]);

  // Drives the server-side meter for whichever session is running, so every
  // portal watching it sees energy and cost climb. One ticker per browser is
  // plenty — the server is the single source of truth for the numbers.
  const activeSessionId = state?.sessions.find(s => s.status === 'active')?.id ?? null;
  // Ticks are authenticated, so borrow whichever portal this browser is signed into.
  const tickPortal = (Object.keys(sessions) as Portal[]).find(p => sessions[p]) ?? null;
  useEffect(() => {
    if (!activeSessionId || !tickPortal) return;
    const t = setInterval(() => {
      apiClient.tickSession(tickPortal, activeSessionId).catch(() => {
        /* session ended between ticks */
      });
    }, 5000);
    return () => clearInterval(t);
  }, [activeSessionId, tickPortal]);

  /** Resolves to the account, or to a challenge the caller must answer with a code. */
  const login = useCallback(async (portal: Portal, loginValue: string, password: string) => {
    const result = await apiClient.login(portal, loginValue, password);
    if (result.requires2fa) return { requires2fa: true as const, challenge: result.challenge };

    tokenStore.set(portal, result.token);
    setSessions(s => ({ ...s, [portal]: result.user }));
    return { requires2fa: false as const, user: result.user };
  }, []);

  const verify2fa = useCallback(async (portal: Portal, challenge: string, code: string) => {
    const { token, user } = await apiClient.verify2fa(challenge, code);
    tokenStore.set(portal, token);
    setSessions(s => ({ ...s, [portal]: user }));
    return user;
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    const { hint } = await apiClient.requestOtp(phone);
    return hint;
  }, []);

  const loginWithOtp = useCallback(async (phone: string, code: string) => {
    const { token, user } = await apiClient.verifyOtp(phone, code);
    tokenStore.set('driver', token);
    setSessions(s => ({ ...s, driver: user }));
    return user;
  }, []);

  const logout = useCallback(async (portal: Portal) => {
    try {
      await apiClient.logout(portal);
    } catch {
      /* token may already be gone server-side */
    }
    tokenStore.clear(portal);
    setSessions(s => ({ ...s, [portal]: null }));
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      state,
      connection,
      events,
      eventCount,
      credentials,
      sessions,
      refresh,
      login,
      verify2fa,
      loginWithOtp,
      requestOtp,
      logout,
      actions: apiClient,
      lastError,
    }),
    [state, connection, events, eventCount, credentials, sessions, refresh, login, verify2fa, loginWithOtp, requestOtp, logout, lastError],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}

/** Convenience: the signed-in account for one portal. */
export function usePortalSession(portal: Portal) {
  const { sessions } = useSync();
  return sessions[portal];
}

/** The caller's currently running charging session, if any. */
export function useActiveSession(accountId?: string | null) {
  const { state } = useSync();
  return useMemo(() => {
    if (!state) return null;
    return (
      state.sessions.find(s => s.status === 'active' && (!accountId || s.userId === accountId)) ?? null
    );
  }, [state, accountId]);
}

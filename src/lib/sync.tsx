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
  login: (portal: Portal, login: string, password: string) => Promise<Account>;
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

export function SyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [credentials, setCredentials] = useState<DemoCredential[]>([]);
  const [sessions, setSessions] = useState<Record<Portal, Account | null>>(EMPTY_SESSIONS);
  const [lastError, setLastError] = useState<string | null>(null);

  // Coalesces the refetches triggered by bursts of incoming events.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiClient.getState();
      setState(next);
      setLastError(null);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, []);

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

  // Live channel. EventSource reconnects on its own; we only mirror the status.
  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      setConnection('connecting');
      source = new EventSource('/api/stream');

      source.onopen = () => setConnection('live');

      source.onmessage = e => {
        let event: SyncEvent | { type: string };
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
        setEvents(prev => [full, ...prev].slice(0, 80));
        setEventCount(n => n + 1);
        scheduleRefresh();
      };

      source.onerror = () => {
        setConnection('offline');
        // Let the browser's own retry (server sends `retry: 3000`) handle it.
      };
    };

    connect();

    return () => {
      closed = true;
      source?.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh]);

  const login = useCallback(async (portal: Portal, loginValue: string, password: string) => {
    const { token, user } = await apiClient.login(portal, loginValue, password);
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
      loginWithOtp,
      requestOtp,
      logout,
      actions: apiClient,
      lastError,
    }),
    [state, connection, events, eventCount, credentials, sessions, refresh, login, loginWithOtp, requestOtp, logout, lastError],
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

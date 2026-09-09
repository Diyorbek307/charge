import { useMemo } from 'react';
import { useSync } from './sync';
import {
  stations as staticStations,
  sessions as staticDriverSessions,
  operators as staticOperators,
  adminSessions as staticAdminSessions,
  payments as staticPayments,
  type Station as LegacyStation,
  type ChargingSession,
  type StationStatus,
} from '../data/mockData';
import type { Session, Station as LiveStation } from './api';

/**
 * Bridges the live database into the shapes the existing screens already
 * render, so dashboards become live without being rewritten. Each hook falls
 * back to the bundled demo data until the first snapshot arrives.
 */

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

const money = (n: number) => `${n.toLocaleString('ru-RU')} сум`;

/** A station is only as available as its connectors. */
function deriveStatus(station: LiveStation): StationStatus {
  const s = station.connectors.map(c => c.status);
  if (s.length === 0) return 'unavailable';
  if (s.some(x => x === 'available')) return 'available';
  if (s.some(x => x === 'reserved')) return 'reserved';
  if (s.every(x => x === 'unavailable')) return 'unavailable';
  return 'occupied';
}

export function useLiveStations(): LegacyStation[] {
  const { state } = useSync();
  return useMemo(() => {
    if (!state) return staticStations;
    return state.stations.map(st => {
      const fallback = staticStations.find(s => s.id === st.id);
      return {
        ...st,
        status: deriveStatus(st),
        distance: fallback?.distance ?? 0,
      } as LegacyStation;
    });
  }, [state]);
}

export interface LegacyAdminSession {
  id: string;
  user: string;
  station: string;
  operator: string;
  start: string;
  end: string;
  energy: string;
  cost: string;
  status: 'completed' | 'active' | 'failed';
}

function toAdminRow(s: Session): LegacyAdminSession {
  return {
    id: s.id,
    user: s.user,
    station: s.stationName,
    operator: s.operator,
    start: timeOf(s.start),
    end: s.end ? timeOf(s.end) : '—',
    energy: `${s.energy} кВт·ч`,
    cost: money(s.cost),
    status: s.status,
  };
}

/** Active sessions first — that is what an operator or admin scans for. */
export function useLiveAdminSessions(): LegacyAdminSession[] {
  const { state } = useSync();
  return useMemo(() => {
    if (!state) return staticAdminSessions as LegacyAdminSession[];
    const rows = [...state.sessions].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.start).getTime() - new Date(a.start).getTime();
    });
    return rows.map(toAdminRow);
  }, [state]);
}

/** Sessions belonging to the signed-in driver, in the driver-history shape. */
export function useLiveDriverSessions(): ChargingSession[] {
  const { state, sessions: portalSessions } = useSync();
  const accountId = portalSessions.driver?.id;

  return useMemo(() => {
    if (!state) return staticDriverSessions;
    const mine = state.sessions.filter(s => !accountId || s.userId === accountId);
    const source = mine.length ? mine : state.sessions;

    return source.map(s => {
      const minutes = s.end
        ? Math.max(1, Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000))
        : Math.max(1, Math.round((Date.now() - new Date(s.start).getTime()) / 60000));
      const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;

      return {
        id: s.id,
        stationName: s.stationName,
        operator: s.operator,
        date: new Date(s.start).toLocaleString('ru-RU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        duration,
        energy: s.energy,
        cost: s.cost,
        connector: s.connector,
        status: s.status,
      } as ChargingSession;
    });
  }, [state, accountId]);
}

export function useLiveOperators() {
  const { state } = useSync();
  return useMemo(() => (state ? state.operators : staticOperators), [state]);
}

export function useLivePayments() {
  const { state } = useSync();
  return useMemo(() => {
    if (!state) return staticPayments;
    return state.transactions.map(t => ({
      id: t.id,
      user: t.user,
      amount: t.amount,
      method: t.method,
      status: t.status,
      time: timeOf(t.time),
      session: t.sessionId,
    }));
  }, [state]);
}

export function useLiveAlerts() {
  const { state } = useSync();
  return useMemo(() => state?.alerts ?? [], [state]);
}

export function useLiveStats() {
  const { state } = useSync();
  return state?.stats ?? null;
}

export function useLiveVehicles() {
  const { state } = useSync();
  return useMemo(() => state?.vehicles ?? [], [state]);
}

export function useLiveEmployees() {
  const { state } = useSync();
  return useMemo(() => state?.employees ?? [], [state]);
}

import { useEffect, useState } from 'react';
import type { AdminInbox } from './api';
import { useSync } from './sync';

/**
 * What waits for the admin, or for a network about its own stations:
 * fetched on load, again whenever something happens on the platform (a new
 * event), and every minute as a fallback.
 */
export function useAdminInbox(portal: 'admin' | 'operator' = 'admin') {
  const { actions, events } = useSync();
  const [inbox, setInbox] = useState<AdminInbox | null>(null);
  const latest = events[0]?.id;
  useEffect(() => {
    let alive = true;
    const load = () => (portal === 'admin' ? actions.adminInbox() : actions.networkInbox()).then(r => alive && setInbox(r)).catch(() => {});
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [actions, latest, portal]);
  return inbox;
}

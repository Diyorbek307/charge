import { useCallback, useEffect, useState } from 'react';
import { useSync } from '../../lib/sync';

const EVENT = 'oc-favorites';
const keyFor = (id?: string) => `oc-favorites-${id ?? 'guest'}`;

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The driver's favourite stations, kept on this device per account. */
export function useFavorites() {
  const { sessions } = useSync();
  const key = keyFor(sessions.driver?.id);
  const [ids, setIds] = useState<string[]>(() => read(key));

  useEffect(() => {
    setIds(read(key));
    const sync = () => setIds(read(key));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      const next = read(key).includes(id) ? read(key).filter(x => x !== id) : [...read(key), id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode: the list lives for this visit only */
      }
      setIds(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return { ids, has: (id: string) => ids.includes(id), toggle };
}

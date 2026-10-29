/**
 * What this device went through on the first launch: which edition of the
 * user agreement was accepted, whether promotions are welcome and whether
 * notifications were allowed. Kept on the device so the welcome screens come
 * before any account exists; the agreement is then recorded on the account
 * (POST /me/consent), which is what counts legally.
 */
import { useEffect, useState } from 'react';
import { usePlatform } from './platform';

const KEY = 'pg-first-run';

export interface FirstRunRecord {
  /** The agreement edition accepted on this device. */
  version: number;
  marketing: boolean;
  /** The driver said yes to notifications; they are subscribed after sign-in. */
  push: boolean;
  at: string;
}

export function readFirstRun(): FirstRunRecord | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && Number.isInteger(v.version) ? v : null;
  } catch {
    return null;
  }
}

export function saveFirstRun(r: FirstRunRecord) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private mode: the screens come back next time, nothing worse */
  }
  window.dispatchEvent(new Event('pg-first-run'));
}

/**
 * Whether this device still has to go through the welcome screens: never
 * did, or accepted an agreement edition older than the one in force.
 */
export function useFirstRunNeeded() {
  const { onboarding } = usePlatform();
  const [record, setRecord] = useState(readFirstRun);
  useEffect(() => {
    const on = () => setRecord(readFirstRun());
    window.addEventListener('pg-first-run', on);
    return () => window.removeEventListener('pg-first-run', on);
  }, []);
  if (!record) return 'full' as const;
  return record.version < onboarding.consentVersion ? ('consent' as const) : null;
}

/** The one-time tour over the map, per account on this device. */
const tourKey = (accountId: string) => `pg-tour-${accountId}`;

export function tourSeen(accountId: string) {
  try {
    return !!localStorage.getItem(tourKey(accountId));
  } catch {
    return true;
  }
}

export function markTour(accountId: string, seen = true) {
  try {
    if (seen) localStorage.setItem(tourKey(accountId), '1');
    else localStorage.removeItem(tourKey(accountId));
  } catch {
    /* private mode */
  }
}

/**
 * What this device went through after the first sign-in: which edition of
 * the user agreement was accepted, whether promotions are welcome and whether
 * notifications were allowed. The agreement itself is accepted where the
 * account is made and recorded on it (that is what counts legally); a newer
 * edition is accepted here and sent to the account (POST /me/consent).
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
 * What a signed-in driver still has to go through on this device: the
 * permission screens once ('after', with the agreement too if the account's
 * edition is old), or only a newer edition of the agreement ('consent').
 * Nothing before sign-in: the app opens on the splash and the welcome.
 */
export function useFirstRunNeeded(account: { consent?: { version: number } | null } | null) {
  const { onboarding } = usePlatform();
  const [record, setRecord] = useState(readFirstRun);
  useEffect(() => {
    const on = () => setRecord(readFirstRun());
    window.addEventListener('pg-first-run', on);
    return () => window.removeEventListener('pg-first-run', on);
  }, []);
  if (!account) return null;
  const agreed = Math.max(account.consent?.version ?? 0, record?.version ?? 0);
  if (!record) return 'after' as const;
  return agreed < onboarding.consentVersion ? ('consent' as const) : null;
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

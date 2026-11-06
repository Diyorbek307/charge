/**
 * The greeting after sign-in is due once: the sign-in marks it, the app
 * shows it (components/driver/Greeting.tsx) and clears the mark.
 */
const KEY = 'voli-greet';

/** Set right after a driver signs in, so the next screen greets them once. */
export function greetNext() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* no greeting, nothing worse */
  }
}

export function greetingDue() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function greeted() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

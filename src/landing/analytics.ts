/**
 * Cookieless analytics — Plausible or Umami, whichever is configured at build
 * time. With neither set this module does nothing: no script, no requests.
 *
 *   VITE_PLAUSIBLE_DOMAIN=ipakvolt.uz          (+ VITE_PLAUSIBLE_SRC for self-hosted)
 *   VITE_UMAMI_WEBSITE_ID=<uuid>               (+ VITE_UMAMI_SRC for self-hosted)
 *
 * Neither tool sets cookies or stores personal data, so no consent banner is
 * needed. Never pass names, phones or other personal data to track().
 */

type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: ((event: string, opts?: { props?: Props }) => void) & { q?: unknown[] };
    umami?: { track: (event: string, data?: Props) => void };
  }
}

const env = import.meta.env;
const PLAUSIBLE = env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
const UMAMI = env.VITE_UMAMI_WEBSITE_ID as string | undefined;

let started = false;

export function initAnalytics() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const s = document.createElement('script');
  s.defer = true;
  if (PLAUSIBLE) {
    s.src = (env.VITE_PLAUSIBLE_SRC as string | undefined) ?? 'https://plausible.io/js/script.js';
    s.dataset.domain = PLAUSIBLE;
    // Queue events fired before the script loads.
    window.plausible ??= Object.assign((...args: unknown[]) => { (window.plausible!.q ??= []).push(args); }, {});
  } else if (UMAMI) {
    s.src = (env.VITE_UMAMI_SRC as string | undefined) ?? 'https://cloud.umami.is/script.js';
    s.dataset.websiteId = UMAMI;
  } else {
    return;
  }
  document.head.appendChild(s);
}

/** Records a named event, e.g. track('demo', { from: 'hero' }). */
export function track(event: string, props?: Props) {
  try {
    if (PLAUSIBLE) window.plausible?.(event, props ? { props } : undefined);
    else if (UMAMI) window.umami?.track(event, props);
  } catch {
    /* analytics must never break the page */
  }
}

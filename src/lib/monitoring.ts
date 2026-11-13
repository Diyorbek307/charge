import { API_ORIGIN } from './site';
import { isMissingBuildFile, reloadingForNewBuild } from './reloadForNewBuild';
/**
 * Error reports from drivers' phones and browsers to Sentry, when the build
 * has VITE_SENTRY_DSN. The library is loaded only then, after the first
 * paint, and the reports carry no names, numbers, tokens or addresses.
 */
export function initMonitoring() {
  reportToTeam();
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  window.addEventListener('load', () => {
    void import('@sentry/browser').then(Sentry => {
      // A blocked or half-loaded library (ad blockers, page-checking robots) must not throw.
      if (typeof Sentry?.init !== 'function') return;
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        // Fetches and page changes: the path only, never ?ticket= or a code in the link.
        beforeBreadcrumb(b) {
          for (const k of ['url', 'from', 'to'] as const) {
            const v = b.data?.[k];
            if (typeof v === 'string') b.data![k] = v.split(/[?#]/)[0];
          }
          return b;
        },
        beforeSend(event) {
          delete event.user;
          if (event.request) {
            delete event.request.headers;
            delete event.request.cookies;
            // Links can carry a station or a sign-in code; the page path is enough.
            if (event.request.url) event.request.url = event.request.url.split('?')[0];
          }
          return event;
        },
      });
    });
  });
}

/**
 * The app's own errors go to our server as well (POST /api/client-errors),
 * which tells the team: the message, the file and line, the screen's path.
 * A few per page at most, and none from the developer's machine.
 */
function reportToTeam() {
  if (import.meta.env.DEV) return;
  let left = 5;
  const send = (message: string, source = '') => {
    // A page reloading onto a new build, or a file of a build that a deploy just replaced: not a bug.
    if (!message || reloadingForNewBuild() || isMissingBuildFile(message)) return;
    if (left-- <= 0) return;
    try {
      void fetch(`${API_ORIGIN}/api/client-errors`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.slice(0, 300), source, page: window.location.pathname }),
      }).catch(() => {});
    } catch {
      /* reporting must never break the page */
    }
  };
  window.addEventListener('error', e => send(e.message, e.filename ? `${e.filename}:${e.lineno}` : ''));
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason as { message?: string } | string | undefined;
    send(typeof r === 'string' ? r : r?.message ?? '');
  });
}

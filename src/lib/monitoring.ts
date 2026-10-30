/**
 * Error reports from drivers' phones and browsers to Sentry, when the build
 * has VITE_SENTRY_DSN. The library is loaded only then, after the first
 * paint, and the reports carry no names, numbers, tokens or addresses.
 */
export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  window.addEventListener('load', () => {
    void import('@sentry/browser').then(Sentry => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
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

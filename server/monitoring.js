/**
 * Error reports to Sentry, when SENTRY_DSN is set; without it nothing is sent
 * and nothing is loaded. Reports carry the error and where it happened — no
 * phone numbers, names, tokens or request bodies.
 */
import * as Sentry from '@sentry/node';

const DSN = process.env.SENTRY_DSN || '';
export const monitoring = !!DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.DEMO_MODE === 'false' ? 'production' : 'demo',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
}

/** Sends an error that was caught and handled, so it is still seen. */
export function report(err, where) {
  if (DSN) Sentry.captureException(err, { tags: { where } });
}

/** Reports what the routes throw, then lets Express answer as before; added after every route. */
export function errorHandler(app) {
  if (!DSN) return;
  app.use((err, req, _res, next) => {
    Sentry.captureException(err, { tags: { where: `${req.method} ${req.route?.path ?? 'route'}` } });
    next(err);
  });
}

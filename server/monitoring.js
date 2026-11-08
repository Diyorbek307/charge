/**
 * Error reports to Sentry, when SENTRY_DSN is set; without it nothing is sent
 * and nothing is loaded. Reports carry the error and where it happened — no
 * phone numbers, names, tokens or request bodies.
 */
import * as Sentry from '@sentry/node';
import { alertTeam, describe } from './alerts.js';

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

/** Sends an error that was caught and handled, so it is still seen, and tells the team. */
export function report(err, where) {
  if (DSN) Sentry.captureException(err, { tags: { where } });
  const d = describe(err);
  void alertTeam(`report:${where}:${d.message}`, WHAT[where] ?? `Ошибка: ${where}`, [['Ошибка', d.message], ...(d.at ? [['Где', d.at]] : [])]);
}
const WHAT = { db: 'База данных не сохраняется', mail: 'Почта не отправляется' };

/** Reports what the routes throw, then lets Express answer as before; added after every route. */
export function errorHandler(app) {
  app.use((err, req, _res, next) => {
    const route = `${req.method} ${req.baseUrl ?? ''}${req.route?.path ?? ''}`;
    // A client's malformed request (a bot's broken %-escape, bad JSON) is not a breakdown.
    if (!(err.status >= 400 && err.status < 500)) {
      if (DSN) Sentry.captureException(err, { tags: { where: route } });
      const d = describe(err);
      void alertTeam(`route:${route}:${d.message}`, 'Сервер ответил ошибкой 500', [['Запрос', route], ['Ошибка', d.message], ...(d.at ? [['Где', d.at]] : [])]);
    }
    next(err);
  });
}

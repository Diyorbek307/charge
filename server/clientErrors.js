import { api } from './api.js';
import { alertTeam } from './alerts.js';

/**
 * Errors the app throws on drivers' phones and in browsers. The page sends
 * the message, the file and line, and the screen's path — nothing about the
 * driver. Each address may send a few a minute; the team hears about each
 * kind of error once per half hour (server/alerts.js).
 */
const perIp = new Map(); // ip -> [times]

api.post('/client-errors', (req, res) => {
  const ip = String(req.ip ?? '');
  const now = Date.now();
  const times = (perIp.get(ip) ?? []).filter(t => now - t < 60_000);
  if (times.length >= 5) return res.status(429).end();
  times.push(now);
  perIp.set(ip, times);
  if (perIp.size > 5000) perIp.clear();

  const b = req.body ?? {};
  const message = String(b.message ?? '').replace(/\s+/g, ' ').slice(0, 200);
  if (!message) return res.status(400).end();
  // Script-blocking extensions and dropped connections are not our bugs.
  if (/ResizeObserver loop|Script error\.?$|Failed to fetch|Load failed|NetworkError|chrome-extension:/i.test(message)) return res.status(204).end();
  const source = String(b.source ?? '').split('?')[0].slice(-120);
  const page = String(b.page ?? '').split('?')[0].slice(0, 80);
  void alertTeam(`client:${message}`, 'Ошибка в приложении у пользователя', [['Ошибка', message], ['Файл', source || '—'], ['Экран', page || '/'], ['Устройство', String(req.get('user-agent') ?? '').slice(0, 90)]]);
  res.status(204).end();
});

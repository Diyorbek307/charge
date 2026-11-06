/**
 * Telling the team at once when something breaks: the server failing a
 * request, crashing, losing its database, a payment callback with a wrong
 * signature, or the app throwing errors on drivers' phones.
 *
 * Where it goes:
 *   ALERT_TELEGRAM_CHAT   a Telegram chat or group id;
 *   ALERT_TELEGRAM_TOKEN  the bot that writes there (a bot of its own, so
 *                         the team's alerts stay apart from the drivers'
 *                         bot); without it the Voli bot (TELEGRAM_BOT_TOKEN)
 *                         writes;
 *   the team mailbox      info@, through the same mail settings as the
 *                         rest of the letters.
 * Without either, alerts are only written to the log and kept for the
 * admin's "Состояние системы" page.
 *
 * The same problem is told once per half hour, and no more than 20 alerts an
 * hour in all, so a failing server does not flood the chat. Alerts carry what
 * failed and where, never a driver's name, phone, token or card.
 */

const QUIET_MS = 30 * 60_000;
const PER_HOUR = 20;
const lastSent = new Map(); // key -> time
const sentTimes = [];
const recent = []; // the last 50, for the admin

const chat = () => process.env.ALERT_TELEGRAM_CHAT || '';
const botToken = () => process.env.ALERT_TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';

/** One message to the team's chat, from the alerts bot. Resolves to 'ok' or Telegram's own words why not. */
async function toTelegram(text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat(), text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return 'ok';
    const why = (await res.json().catch(() => null))?.description ?? `HTTP ${res.status}`;
    console.warn('[alert] telegram:', why);
    return why;
  } catch (err) {
    console.warn('[alert] telegram:', err.message);
    return err.message;
  }
}

export function alertsStatus() {
  return {
    telegram: Boolean(chat() && botToken()),
    recent: recent.slice(0, 20),
  };
}

/**
 * One alert. `key` decides what counts as "the same problem"; `lines` are
 * short facts, each [label, value].
 */
export async function alertTeam(key, title, lines = []) {
  const now = Date.now();
  const entry = { at: new Date(now).toISOString(), title, lines, sent: false };
  recent.unshift(entry);
  if (recent.length > 50) recent.length = 50;
  console.warn(`[alert] ${title}${lines.length ? ' · ' + lines.map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}`);

  if (now - (lastSent.get(key) ?? 0) < QUIET_MS) return false;
  while (sentTimes.length && now - sentTimes[0] > 3600_000) sentTimes.shift();
  if (sentTimes.length >= PER_HOUR) return false;
  lastSent.set(key, now);
  sentTimes.push(now);
  if (lastSent.size > 500) lastSent.delete(lastSent.keys().next().value);
  entry.sent = true;

  const text = [`⚠️ Voli: ${title}`, ...lines.map(([k, v]) => `${k}: ${v}`), `Время: ${new Date(now).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`].join('\n');
  // Loaded here, not at the top: telegram.js and mail.js load the database, which reports through this file.
  const jobs = [];
  if (chat() && botToken()) jobs.push(toTelegram(text).then(r => { entry.telegram = r; }));
  jobs.push(import('./mail.js').then(m => m.notifyTeam(`Сбой: ${title}`, lines, '/?portal=admin&page=system_health', 'info')).catch(() => false));
  await Promise.all(jobs);
  return true;
}

/** A test from the admin: sent at once, whatever was sent lately, with Telegram's answer. */
export async function testAlert(by) {
  if (!chat() || !botToken()) return { telegram: 'не настроен: нужны ALERT_TELEGRAM_CHAT и ALERT_TELEGRAM_TOKEN', chat: chat() || null };
  const r = await toTelegram(`✅ Voli: проверка сигналов о сбоях
Отправил: ${by}
Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`);
  return { telegram: r, chat: chat() };
}

/** Short and safe to send: the first line of the message and where it was thrown. */
export function describe(err) {
  const e = err instanceof Error ? err : new Error(String(err));
  const at = (e.stack ?? '').split('\n').slice(1).find(l => l.includes('/server') || l.includes('\\server')) ?? '';
  return { message: e.message.slice(0, 200), at: at.trim().replace(/^at /, '').slice(0, 160) };
}

let watching = false;
/** Crashes and forgotten promise errors: told before the process goes down. */
export function watchProcess() {
  if (watching) return;
  watching = true;
  process.on('unhandledRejection', err => {
    const d = describe(err);
    void alertTeam(`rejection:${d.message}`, 'Необработанная ошибка на сервере', [['Ошибка', d.message], ['Где', d.at || '—']]);
  });
  process.on('uncaughtException', err => {
    const d = describe(err);
    console.error(err);
    // Give the message a moment to leave; Render then starts the server again.
    void alertTeam(`crash:${d.message}`, 'Сервер упал и перезапускается', [['Ошибка', d.message], ['Где', d.at || '—']]).finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 4000).unref();
  });
}

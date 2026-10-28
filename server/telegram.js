import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * Telegram Mini App and bot notifications.
 *
 * Inside Telegram the app receives signed `initData`; the server checks the
 * signature with the bot token, so a Telegram user can sign in with one tap
 * once their account is linked. Linked accounts also get their notifications
 * as messages from the bot. Everything here is off until TELEGRAM_BOT_TOKEN is set.
 */

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';
/** initData older than this is refused: a leaked link stops working quickly. */
const MAX_AGE_SEC = 24 * 3600;

export const telegramConfigured = () => Boolean(TOKEN());

/** Checks Telegram's signature over initData; returns the Telegram user or an error. */
export function verifyInitData(initData, token = TOKEN(), now = Date.now()) {
  if (!token) return { error: 'Telegram не настроен' };
  if (typeof initData !== 'string' || initData.length > 4096) return { error: 'Нет данных Telegram' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { error: 'Нет подписи Telegram' };
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'Подпись Telegram не сходится' };
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > MAX_AGE_SEC) return { error: 'Данные Telegram устарели — откройте приложение заново' };
  let user = null;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    /* malformed */
  }
  if (!user?.id) return { error: 'Нет пользователя Telegram' };
  return { user: { id: String(user.id), username: user.username ?? null, firstName: user.first_name ?? '', lang: user.language_code ?? null } };
}

export const accountByTelegram = id => db.data.accounts.find(a => a.telegram?.id === String(id)) ?? null;

/** Sends a message from the bot; failures are logged, never thrown. */
export async function sendTelegram(chatId, text) {
  if (!TOKEN()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn('[telegram] send failed:', res.status);
    return res.ok;
  } catch (err) {
    console.warn('[telegram] send failed:', err.message);
    return false;
  }
}

/** The same notification a push would carry, to every linked account among `ids`. */
export async function notifyTelegram(ids, title, body) {
  if (!TOKEN()) return 0;
  const targets = db.data.accounts.filter(a => ids.has(a.id) && a.telegram?.id && a.telegram.notify !== false);
  const sent = await Promise.all(targets.map(a => sendTelegram(a.telegram.id, `${title}\n${body}`)));
  return sent.filter(Boolean).length;
}

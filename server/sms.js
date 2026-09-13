import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * One-time SMS codes for driver sign-up and password recovery.
 *
 * Codes are stored hashed, expire, allow a handful of guesses and are rate
 * limited per phone and per client. Delivery goes through Eskiz.uz — the
 * common SMS gateway in Uzbekistan — once its credentials are configured.
 * Until then the demo returns the code in the response so the flow stays
 * explorable; outside the demo an unconfigured gateway refuses to pretend.
 */

const DEMO_MODE = process.env.DEMO_MODE !== 'false';

const ESKIZ = {
  email: process.env.ESKIZ_EMAIL || '',
  password: process.env.ESKIZ_PASSWORD || '',
  from: process.env.ESKIZ_FROM || '4546',
  base: 'https://notify.eskiz.uz/api',
};
export const smsConfigured = () => Boolean(ESKIZ.email && ESKIZ.password);

const CODE_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_PER_PHONE_PER_HOUR = 5;
const MAX_PER_CLIENT_PER_HOUR = 20;
const MAX_ATTEMPTS = 5;
export const PURPOSES = ['register', 'reset'];

/** "+998 90 123-45-67", "901234567" and "998901234567" all become "+998901234567". */
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 9) digits = `998${digits}`;
  return /^998\d{9}$/.test(digits) ? `+${digits}` : null;
}

const codes = () => (db.data.smsCodes ??= []);
const hashCode = (phone, purpose, code) =>
  crypto.createHash('sha256').update(`${phone}:${purpose}:${code}`).digest('hex');

// Per-client limits live in memory: they only need to survive the burst.
const clientHits = new Map();
function clientAllowed(client) {
  const now = Date.now();
  const hits = (clientHits.get(client) ?? []).filter(t => now - t < 3_600_000);
  if (hits.length >= MAX_PER_CLIENT_PER_HOUR) return false;
  hits.push(now);
  clientHits.set(client, hits);
  return true;
}

let eskizToken = null;
async function eskizLogin() {
  const form = new FormData();
  form.set('email', ESKIZ.email);
  form.set('password', ESKIZ.password);
  const res = await fetch(`${ESKIZ.base}/auth/login`, { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.data?.token) throw new Error(`Eskiz login failed (${res.status})`);
  eskizToken = data.data.token;
}

async function eskizSend(phone, text, retried = false) {
  if (!eskizToken) await eskizLogin();
  const form = new FormData();
  form.set('mobile_phone', phone.slice(1));
  form.set('message', text);
  form.set('from', ESKIZ.from);
  const res = await fetch(`${ESKIZ.base}/message/sms/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${eskizToken}` },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 && !retried) {
    eskizToken = null;
    return eskizSend(phone, text, true);
  }
  if (!res.ok) throw new Error(`Eskiz send failed (${res.status})`);
}

/**
 * Issues a code. Resolves to { ok, demoCode? } or { status, error }.
 * The caller decides whether the phone may receive one for this purpose.
 */
export async function issueCode(phone, purpose, client) {
  const now = Date.now();
  db.data.smsCodes = codes().filter(c => c.expires > now - 3_600_000);

  const recent = codes().filter(c => c.phone === phone && now - c.created < 3_600_000);
  // The resend pause is per purpose: signing up and then resetting is legitimate.
  const last = recent.filter(c => c.purpose === purpose).reduce((m, c) => Math.max(m, c.created), 0);
  if (now - last < RESEND_AFTER_MS) {
    return { status: 429, error: 'Код уже отправлен — повторить можно через минуту', retryAfter: Math.ceil((RESEND_AFTER_MS - (now - last)) / 1000) };
  }
  if (recent.length >= MAX_PER_PHONE_PER_HOUR) return { status: 429, error: 'Слишком много кодов на этот номер — попробуйте через час' };
  if (!clientAllowed(client)) return { status: 429, error: 'Слишком много запросов — попробуйте позже' };
  if (!smsConfigured() && !DEMO_MODE) return { status: 503, error: 'SMS-сервис не настроен' };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // A new code replaces any earlier one for the same purpose.
  db.data.smsCodes = codes().filter(c => !(c.phone === phone && c.purpose === purpose && !c.used));
  codes().push({ phone, purpose, hash: hashCode(phone, purpose, code), created: now, expires: now + CODE_TTL_MS, attempts: 0, used: false });
  db.save();

  if (smsConfigured()) {
    try {
      await eskizSend(phone, `ONE CHARGE: kod ${code}. Hech kimga aytmang. / Код ${code}. Никому не сообщайте.`);
    } catch (err) {
      console.warn('[sms]', err.message);
      return { status: 502, error: 'Не удалось отправить SMS — попробуйте позже' };
    }
    return { ok: true };
  }
  return { ok: true, demoCode: code };
}

/** Checks and consumes a code. Resolves to true only once per issued code. */
export function consumeCode(phone, purpose, code) {
  const now = Date.now();
  const entry = codes().find(c => c.phone === phone && c.purpose === purpose && !c.used && c.expires > now);
  if (!entry) return { error: 'Код истёк — запросите новый' };
  entry.attempts++;
  const given = Buffer.from(hashCode(phone, purpose, String(code ?? '').trim()), 'hex');
  const expected = Buffer.from(entry.hash, 'hex');
  if (!crypto.timingSafeEqual(given, expected)) {
    if (entry.attempts >= MAX_ATTEMPTS) entry.used = true;
    db.save();
    return { error: entry.used ? 'Слишком много попыток — запросите новый код' : 'Неверный код' };
  }
  entry.used = true;
  db.save();
  return { ok: true };
}

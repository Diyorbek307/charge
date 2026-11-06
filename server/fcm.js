import crypto from 'node:crypto';

/**
 * Notifications to the store app through Firebase Cloud Messaging (HTTP v1).
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service account's JSON, as Firebase
 * gives it (Project settings → Service accounts → Generate new private key);
 * it is set in Render and never kept in the code. With it the server signs a
 * short JWT, swaps it for an access token (kept until a few minutes before it
 * expires) and sends each message to the device tokens the app registered.
 * Without it the store app simply gets no push; the web keeps its own.
 */

let account = null;
let parsed = false;
function serviceAccount() {
  if (parsed) return account;
  parsed = true;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    const a = raw ? JSON.parse(raw) : null;
    account = a?.private_key && a?.client_email && a?.project_id ? a : null;
    if (raw && !account) console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT is not a service account JSON');
  } catch {
    console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  return account;
}

export const fcmConfigured = () => Boolean(serviceAccount());

const b64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

let cached = null; // { token, until }
async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const a = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'RS256', typ: 'JWT' });
  const body = b64url({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: a.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(a.private_key).toString('base64url');
  const res = await fetch(a.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google не выдал токен для уведомлений: ${res.status}`);
  const j = await res.json();
  cached = { token: j.access_token, until: Date.now() + (Number(j.expires_in) - 300) * 1000 };
  return cached.token;
}

/**
 * Sends one notification to one device. Resolves to 'sent', 'gone' (the app
 * was removed or the token replaced: forget it) or 'failed'.
 */
export async function sendFcm(token, { title, body, url, tag }) {
  if (!fcmConfigured()) return 'failed';
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount().project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { url: url ?? '/?portal=driver', ...(tag ? { tag } : {}) },
          android: { priority: 'high', notification: { ...(tag ? { tag } : {}), color: '#FFC83D', channel_id: 'voli' } },
          apns: { payload: { aps: { sound: 'default', ...(tag ? { 'thread-id': tag } : {}) } } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return 'sent';
    const err = await res.json().catch(() => ({}));
    const code = err?.error?.details?.find?.(d => d.errorCode)?.errorCode ?? err?.error?.status;
    if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'gone';
    console.warn('[fcm] send failed:', res.status, code ?? '');
    return 'failed';
  } catch (e) {
    console.warn('[fcm] send failed:', e.message);
    return 'failed';
  }
}

/**
 * A message the app draws itself (the charge's live card): data only, so
 * Android hands it to the app even in the background, at high priority.
 */
export async function sendFcmData(token, data) {
  if (!fcmConfigured()) return 'failed';
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount().project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])), android: { priority: 'high', ttl: '600s' } } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return 'sent';
    const err = await res.json().catch(() => ({}));
    const code = err?.error?.details?.find?.(d => d.errorCode)?.errorCode ?? err?.error?.status;
    if (res.status === 404 || code === 'UNREGISTERED') return 'gone';
    console.warn('[fcm] data send failed:', res.status, code ?? '');
    return 'failed';
  } catch (e) {
    console.warn('[fcm] data send failed:', e.message);
    return 'failed';
  }
}

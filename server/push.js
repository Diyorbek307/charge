import express from 'express';
import webpush from 'web-push';
import { db } from './db.js';
import { setPushHook } from './api.js';

/**
 * Web Push notifications, so a driver hears "your turn" with the app closed.
 *
 * Every platform event already carries a visibility scope; push reuses it, so
 * a notification can only ever reach someone who is allowed to see the event.
 */

const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@onecharge.uz';
const MAX_SUBS_PER_ACCOUNT = 5;

// The subscription endpoint is a URL the client supplies and the server then
// POSTs to. Without an allowlist that is a request-forgery primitive, so only
// the push services browsers actually use are accepted.
const ALLOWED_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const ALLOWED_SUFFIXES = ['.notify.windows.com', '.push.apple.com'];
// Test hooks only: extra host:port pairs, optionally over plain http.
const EXTRA_HOSTS = (process.env.PUSH_ALLOW_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOW_HTTP = process.env.PUSH_ALLOW_HTTP === 'true';

export function endpointAllowed(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return false;
  }
  if (EXTRA_HOSTS.includes(url.host)) return url.protocol === 'https:' || (ALLOW_HTTP && url.protocol === 'http:');
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return false;
  return ALLOWED_HOSTS.includes(url.hostname) || ALLOWED_SUFFIXES.some(s => url.hostname.endsWith(s));
}

function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  // Demo: generate once and keep it with the data, so subscriptions made
  // against this key stay valid across restarts on durable storage.
  if (!db.data.vapid) {
    db.data.vapid = webpush.generateVAPIDKeys();
    db.save();
  }
  return db.data.vapid;
}

const subs = () => (db.data.pushSubs ??= []);

function removeSub(endpoint) {
  const before = subs().length;
  db.data.pushSubs = subs().filter(s => s.endpoint !== endpoint);
  if (subs().length !== before) db.save();
}

/** Which events notify, and when. */
const KINDS = {
  'queue.ready': { title: 'Ваша очередь подошла', url: '/?portal=driver' },
  'booking.expire': { title: 'Бронь истекла', url: '/?portal=driver' },
  // Only when someone else ended it — a driver who pressed stop already knows.
  'session.stop': { title: 'Зарядка завершена', url: '/?portal=driver', when: e => !['driver', 'business'].includes(e.portal) },
  'alert.new': { title: 'Новое оповещение', url: '/?portal=operator' },
  // Only provider-confirmed top-ups, not the demo's direct button.
  'wallet.topup': { title: 'Кошелёк пополнен', url: '/?portal=driver', when: e => e.portal === 'system' },
};

function recipients(event) {
  const scope = event.scope ?? {};
  const ids = new Set();
  if (scope.userId) ids.add(scope.userId);
  if (event.type === 'alert.new' && scope.operatorId) {
    for (const a of db.data.accounts) if (a.portal === 'operator' && a.orgId === scope.operatorId) ids.add(a.id);
  }
  if (event.type === 'wallet.topup' && scope.fleet) {
    for (const a of db.data.accounts) if (a.portal === 'business') ids.add(a.id);
  }
  return ids;
}

/**
 * web-push does the RFC 8291 encryption and VAPID signing; the request itself
 * is sent here. That keeps the transport ours: redirects are refused, so an
 * allowlisted host cannot bounce the request somewhere it was never allowed.
 */
async function sendTo(targets, payload) {
  const keys = vapidKeys();
  let sent = 0;
  await Promise.all(
    targets.map(async sub => {
      if (!endpointAllowed(sub.endpoint)) return removeSub(sub.endpoint);
      try {
        const details = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
          TTL: 3600,
          vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
        });
        const res = await fetch(details.endpoint, {
          method: details.method,
          headers: details.headers,
          body: details.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        // 404/410 mean the browser dropped the subscription for good.
        if (res.status === 404 || res.status === 410) return removeSub(sub.endpoint);
        if (!res.ok) return console.warn('[push] delivery failed:', res.status);
        sub.lastSentAt = new Date().toISOString();
        sent++;
      } catch (err) {
        console.warn('[push] delivery failed:', err.message);
      }
    }),
  );
  db.save();
  return sent;
}

async function deliver(event) {
  const kind = KINDS[event.type];
  if (!kind || (kind.when && !kind.when(event))) return;
  const ids = recipients(event);
  if (ids.size === 0) return;
  const targets = subs().filter(s => ids.has(s.accountId));
  if (targets.length === 0) return;
  await sendTo(targets, { title: kind.title, body: event.message, tag: event.type, url: kind.url });
}

function viewerOf(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? (db.resolveToken(header.slice(7))?.account ?? null) : null;
}

function requireViewer(req, res, next) {
  req.account = viewerOf(req);
  if (!req.account) return res.status(401).json({ error: 'Не авторизован' });
  next();
}

export const pushApi = express.Router();
pushApi.use(express.json());

pushApi.get('/vapid-key', (_req, res) => res.json({ publicKey: vapidKeys().publicKey }));

pushApi.get('/status', requireViewer, (req, res) => {
  res.json({ subscriptions: subs().filter(s => s.accountId === req.account.id).length });
});

pushApi.post('/subscribe', requireViewer, (req, res) => {
  const { endpoint, keys } = req.body ?? {};
  if (!endpointAllowed(endpoint)) return res.status(400).json({ error: 'Неподдерживаемый push-сервис' });
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return res.status(400).json({ error: 'Некорректная подписка' });
  }
  removeSub(endpoint);
  subs().push({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    accountId: req.account.id,
    portal: req.account.portal,
    created: new Date().toISOString(),
    lastSentAt: null,
  });
  // Keep only the newest few devices per account.
  const mine = subs().filter(s => s.accountId === req.account.id);
  for (const old of mine.slice(0, Math.max(0, mine.length - MAX_SUBS_PER_ACCOUNT))) removeSub(old.endpoint);
  db.save();
  res.json({ subscribed: true });
});

pushApi.post('/unsubscribe', requireViewer, (req, res) => {
  const endpoint = req.body?.endpoint;
  const own = subs().find(s => s.endpoint === endpoint && s.accountId === req.account.id);
  if (own) removeSub(endpoint);
  res.json({ subscribed: false });
});

pushApi.post('/test', requireViewer, async (req, res) => {
  const targets = subs().filter(s => s.accountId === req.account.id);
  if (targets.length === 0) return res.status(404).json({ error: 'Уведомления не включены на этом устройстве' });
  const sent = await sendTo(targets, {
    title: 'ONE CHARGE UZ',
    body: 'Уведомления работают — сообщим, когда подойдёт очередь или закончится зарядка.',
    tag: 'test',
    url: '/',
  });
  res.json({ sent });
});

/** Hooks delivery into every platform event. Call once at startup. */
export function attachPush() {
  setPushHook(event => {
    deliver(event).catch(err => console.warn('[push]', err.message));
  });
}

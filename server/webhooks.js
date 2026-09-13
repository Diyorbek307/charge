import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { db } from './db.js';

/**
 * Outbound webhook delivery.
 *
 * Partners give us a URL and we POST to it, which on a public service is a
 * request-forgery primitive unless the destination is pinned down. So every
 * attempt resolves the host itself, refuses anything that is not a public
 * unicast address, and connects to exactly the address it checked — a DNS
 * answer that changes between the check and the connection cannot redirect
 * it inward. Redirects are never followed and responses are not read beyond
 * their status. Failures retry with backoff, and every attempt is re-signed so
 * a receiver's timestamp tolerance still holds on the last try.
 */

const ENABLED = process.env.WEBHOOK_DELIVERY !== 'false';
// Test hooks only: extra host:port pairs, optionally over plain http.
const EXTRA_HOSTS = (process.env.WEBHOOK_ALLOW_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOW_HTTP = process.env.WEBHOOK_ALLOW_HTTP === 'true';
const BACKOFF_SCALE = Number(process.env.WEBHOOK_BACKOFF_SCALE || 1);

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 6 * 3_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
const TIMEOUT_MS = 10_000;
const DISABLE_AFTER_FAILURES = 25;

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(net4, prefix, 'ipv4');
for (const [net6, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) blocked.addSubnet(net6, prefix, 'ipv6');

/** True only for addresses a partner server can legitimately live on. */
export function isPublicAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family !== 6) return false;
  // IPv4-mapped and -compatible forms smuggle a v4 address through v6.
  const mapped = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPublicAddress(mapped[1]);
  if (/^::ffff:/i.test(ip)) return false;
  return !blocked.check(ip, 'ipv6');
}

/** Static checks at registration time. Resolution is re-checked on every send. */
export function validateEndpoint(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return { error: 'Некорректный URL' };
  }
  if (url.username || url.password) return { error: 'URL не должен содержать логин и пароль' };
  if (EXTRA_HOSTS.includes(url.host)) {
    if (url.protocol === 'https:' || (ALLOW_HTTP && url.protocol === 'http:')) return { url };
  }
  if (url.protocol !== 'https:') return { error: 'Endpoint должен использовать HTTPS' };
  if (url.port && url.port !== '443') return { error: 'Endpoint должен использовать стандартный порт 443' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) ? !isPublicAddress(host) : /(^|\.)(localhost|local|internal|localdomain)$/i.test(host) || !host.includes('.')) {
    return { error: 'Endpoint должен быть публичным адресом' };
  }
  return { url };
}

async function resolvePublic(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (EXTRA_HOSTS.includes(url.host)) {
    const { address, family } = await dns.lookup(host);
    return { address, family };
  }
  const answers = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true, verbatim: true });
  // If any answer points inward the host is suspect as a whole.
  if (answers.length === 0 || answers.some(a => !isPublicAddress(a.address))) {
    throw Object.assign(new Error('адрес указывает во внутреннюю сеть'), { permanent: true });
  }
  return answers[0];
}

function sign(secret, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { timestamp, signature };
}

export function signedHeaders(secret, event, body) {
  const { timestamp, signature } = sign(secret, body);
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'OneCharge-Webhooks/1.0',
    'X-OneCharge-Event': event,
    'X-OneCharge-Timestamp': String(timestamp),
    'X-OneCharge-Signature': `t=${timestamp},v1=${signature}`,
  };
}

async function post(url, headers, body) {
  const pinned = await resolvePublic(url);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        timeout: TIMEOUT_MS,
        agent: false,
        // Connect to the address that passed the check, whatever DNS says now.
        lookup: (_host, options, cb) =>
          options?.all ? cb(null, [{ address: pinned.address, family: pinned.family }]) : cb(null, pinned.address, pinned.family),
      },
      res => {
        // Only the status matters; do not let a partner stream us a large body.
        res.destroy();
        resolve(res.statusCode);
      },
    );
    req.on('timeout', () => req.destroy(new Error('таймаут 10 с')));
    req.on('error', reject);
    req.end(body);
  });
}

const inFlight = new Set();

async function attempt(delivery) {
  const hook = db.byId('webhooks', delivery.webhookId);
  if (!hook || !hook.active) {
    Object.assign(delivery, { status: 'cancelled', nextAttemptAt: null, lastError: hook ? 'webhook отключён' : 'webhook удалён' });
    return;
  }

  delivery.headers = signedHeaders(hook.secret, delivery.event, delivery.body);
  delivery.attempts = (delivery.attempts ?? 0) + 1;
  delivery.lastAttemptAt = new Date().toISOString();

  let status = null;
  let error = null;
  let permanent = false;
  try {
    status = await post(new URL(hook.url), delivery.headers, delivery.body);
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (err) {
    error = err.message;
    permanent = !!err.permanent;
  }

  delivery.responseStatus = status;
  if (!error) {
    Object.assign(delivery, { status: 'delivered', lastError: null, nextAttemptAt: null, deliveredAt: new Date().toISOString() });
    hook.consecutiveFailures = 0;
    hook.lastDeliveryAt = delivery.deliveredAt;
    return;
  }

  delivery.lastError = error;
  hook.consecutiveFailures = (hook.consecutiveFailures ?? 0) + 1;
  // A 4xx other than 408/429 means the receiver rejected this payload; retrying will not change that.
  const rejected = status && status >= 400 && status < 500 && status !== 408 && status !== 429;
  if (permanent || rejected || delivery.attempts >= MAX_ATTEMPTS) {
    Object.assign(delivery, { status: 'failed', nextAttemptAt: null });
  } else {
    delivery.status = 'retrying';
    delivery.nextAttemptAt = Date.now() + BACKOFF_MS[delivery.attempts - 1] * BACKOFF_SCALE;
  }
  if (hook.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
    hook.active = false;
    hook.disabledReason = `Отключён после ${DISABLE_AFTER_FAILURES} неудачных доставок подряд`;
  }
}

/** Sends everything that is due. Safe to call often; each delivery runs once at a time. */
export async function processDue() {
  if (!ENABLED) return;
  const now = Date.now();
  const due = (db.data.deliveries ?? [])
    .filter(d => (d.status === 'pending' || d.status === 'retrying') && (d.nextAttemptAt ?? 0) <= now && !inFlight.has(d.id))
    .slice(0, 10);
  if (due.length === 0) return;
  await Promise.all(
    due.map(async d => {
      inFlight.add(d.id);
      try {
        await attempt(d);
      } catch (err) {
        console.warn('[webhooks]', err.message);
      } finally {
        inFlight.delete(d.id);
      }
    }),
  );
  db.save();
}

let timer = null;
export function startWebhookWorker() {
  if (!ENABLED || timer) return;
  // Tests shrink the backoff; poll proportionally faster so retries stay quick.
  timer = setInterval(() => void processDue(), BACKOFF_SCALE < 1 ? 200 : 2000);
  timer.unref?.();
}

/** Nudges the worker right after new deliveries are queued. */
export function kick() {
  if (ENABLED) setImmediate(() => void processDue());
}

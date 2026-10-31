import crypto from 'node:crypto';
import { db, publicAccount } from './db.js';
import { api, emit, consentFrom } from './api.js';
import { hashPasswordAsync } from './guard.js';
import { isBlocked } from './analytics.js';
import { joinByCode } from './referrals.js';
import { mailConfigured } from './mail.js';
import { issueCode, consumeCode, normalizePhone, normalizeEmail, smsConfigured } from './sms.js';

/**
 * Driver sign-in without a password: a code to the phone or to the email,
 * or one tap with Google or Apple. The same door lets a new driver in: after
 * the code, or with the provider's verified name and email, the account is
 * made on the spot.
 *
 *   GOOGLE_CLIENT_ID   the web client id from Google Cloud (OAuth). More ids
 *                      the app's Android and iOS builds sign in with go in
 *                      GOOGLE_CLIENT_IDS, comma-separated.
 *   APPLE_CLIENT_ID    the Services ID for Sign in with Apple on the web.
 *                      The iOS app signs in as its bundle id (APPLE_BUNDLE_ID,
 *                      default uz.voli.app).
 *
 * Without them the buttons are not shown; codes work as long as SMS or mail
 * is set up (or in the demo, where the code comes back on screen).
 */

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const list = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const GOOGLE_WEB = process.env.GOOGLE_CLIENT_ID || '';
const APPLE_WEB = process.env.APPLE_CLIENT_ID || '';
const PROVIDERS = {
  google: {
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    audiences: [GOOGLE_WEB, ...list(process.env.GOOGLE_CLIENT_IDS)].filter(Boolean),
  },
  apple: {
    jwks: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences: [APPLE_WEB, process.env.APPLE_BUNDLE_ID || 'uz.voli.app'].filter(Boolean),
  },
};
const providerOn = name => (name === 'google' ? !!GOOGLE_WEB : !!APPLE_WEB);

const clientKey = req => req.ip || req.socket?.remoteAddress || 'unknown';
const drivers = () => db.data.accounts.filter(a => a.portal === 'driver');
const byPhone = phone => drivers().find(a => a.login === phone || a.phone === phone);
const byEmail = email => drivers().find(a => a.login === email || a.email === email);

// ---------------------------------------------------------------------------
// ID tokens from Google and Apple: RS256 JWTs checked against their keys.
// ---------------------------------------------------------------------------

const keyCache = new Map();
async function keysOf(provider) {
  const hit = keyCache.get(provider);
  if (hit && hit.until > Date.now()) return hit.keys;
  const res = await fetch(PROVIDERS[provider].jwks, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`keys ${res.status}`);
  const { keys } = await res.json();
  keyCache.set(provider, { keys, until: Date.now() + 3_600_000 });
  return keys;
}

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** The person in a provider's ID token, or an error in plain words. */
export async function verifyIdToken(provider, token) {
  const conf = PROVIDERS[provider];
  if (!conf || !providerOn(provider)) return { error: 'Этот способ входа не настроен' };
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return { error: 'Некорректный ответ входа' };
  let header, claims;
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    return { error: 'Некорректный ответ входа' };
  }
  if (header.alg !== 'RS256') return { error: 'Некорректный ответ входа' };
  let jwk = (await keysOf(provider)).find(k => k.kid === header.kid);
  // Keys rotate: one we have not seen yet means a fresh list.
  if (!jwk) {
    keyCache.delete(provider);
    jwk = (await keysOf(provider)).find(k => k.kid === header.kid);
  }
  if (!jwk) return { error: 'Не удалось проверить вход — попробуйте ещё раз' };
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) return { error: 'Не удалось проверить вход' };
  const now = Date.now() / 1000;
  if (!conf.issuers.includes(claims.iss) || !conf.audiences.includes(claims.aud) || !(claims.exp > now) || (claims.iat && claims.iat > now + 300)) {
    return { error: 'Вход устарел или выдан не для Voli — попробуйте ещё раз' };
  }
  return {
    sub: String(claims.sub),
    email: normalizeEmail(claims.email),
    // Apple sends "true" as a string.
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const cleanName = raw => String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);

/** A new driver: no password (a random one nobody knows), signed in by code or provider. */
async function createDriver(req, { login, phone = null, email = null, name, consent, ref, oauth = null }) {
  const { salt, hash } = await hashPasswordAsync(crypto.randomBytes(24).toString('base64url'));
  const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'EV';
  const account = {
    id: `acc-${crypto.randomBytes(6).toString('hex')}`,
    portal: 'driver',
    login,
    phone,
    email,
    oauth,
    salt,
    hash,
    noPassword: true,
    otp: null,
    name,
    role: 'Водитель',
    org: null,
    orgId: null,
    avatar: initials,
    lastLogin: new Date().toISOString(),
    created: new Date().toISOString(),
    twoFactor: { enabled: false, secret: null, pending: null },
    consent,
  };
  db.data.accounts.push(account);
  db.data.wallets[account.id] = { balance: 0, currency: 'UZS', autoTopUp: false, threshold: 0, card: null };
  joinByCode(account, ref);
  db.save();
  emit({ type: 'auth.register', portal: 'driver', actor: account.name, message: `${account.name} зарегистрировался в Driver App`, entity: account.id });
  return account;
}

/** Signs an existing driver in, asking for the 2FA code first where it is on. */
function signIn(req, res, account, how) {
  if (isBlocked(account.id)) return res.status(403).json({ error: 'Аккаунт заблокирован — обратитесь в поддержку' });
  if (account.twoFactor?.enabled) {
    const challenge = crypto.randomBytes(18).toString('hex');
    db.data.challenges.unshift({ challenge, accountId: account.id, expires: Date.now() + 5 * 60_000 });
    if (db.data.challenges.length > 50) db.data.challenges.length = 50;
    db.save();
    return res.json({ requires2fa: true, challenge });
  }
  const token = db.issueToken(account, req);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  emit({ type: 'auth.login', portal: 'driver', actor: account.name, message: `${account.name} вошёл в Driver App · ${how}`, entity: account.id });
  res.json({ token, user: publicAccount(db.byId('accounts', account.id)) });
}

const created = (req, res, account) => res.status(201).json({ token: db.issueToken(account, req), user: publicAccount(account), created: true });

// A proven phone or email waiting for its owner's name: one use, fifteen minutes.
const tickets = new Map();
function ticketFor(target) {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.expires < now) tickets.delete(k);
  const id = crypto.randomBytes(18).toString('hex');
  tickets.set(id, { target, expires: now + 15 * 60_000 });
  return id;
}

/** "+998 90 …" or "name@mail.ru" — whichever it is. */
function targetOf(raw) {
  const phone = normalizePhone(raw);
  if (phone) return { target: phone, channel: 'sms' };
  const email = normalizeEmail(raw);
  return email ? { target: email, channel: 'email' } : null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

api.get('/auth/providers', (_req, res) => {
  res.json({
    google: GOOGLE_WEB || null,
    apple: APPLE_WEB || null,
    sms: smsConfigured() || DEMO_MODE,
    email: mailConfigured() || DEMO_MODE,
  });
});

api.post('/auth/code/request', async (req, res) => {
  const t = targetOf(req.body?.to);
  if (!t) return res.status(400).json({ error: 'Введите номер +998 XX XXX XX XX или адрес почты' });
  const result = await issueCode(t.target, 'signin', clientKey(req));
  if (!result.ok) {
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    return res.status(result.status).json({ error: result.error });
  }
  res.json({ sent: true, to: t.target, channel: t.channel, ...(result.demoCode ? { demoCode: result.demoCode } : {}) });
});

api.post('/auth/code/verify', (req, res) => {
  const t = targetOf(req.body?.to);
  if (!t) return res.status(400).json({ error: 'Введите номер или почту' });
  const check = consumeCode(t.target, 'signin', req.body?.code);
  if (!check.ok) return res.status(401).json({ error: check.error });
  const account = t.channel === 'sms' ? byPhone(t.target) : byEmail(t.target);
  if (account) return signIn(req, res, account, t.channel === 'sms' ? 'код по SMS' : 'код на почту');
  // Someone new: the address is theirs; the name comes next.
  res.json({ newAccount: true, ticket: ticketFor(t.target), channel: t.channel });
});

api.post('/auth/code/finish', async (req, res) => {
  const ticket = tickets.get(String(req.body?.ticket ?? ''));
  if (!ticket || ticket.expires < Date.now()) return res.status(401).json({ error: 'Код устарел — запросите новый' });
  const name = cleanName(req.body?.name);
  if (name.length < 2) return res.status(400).json({ error: 'Укажите имя (2–60 символов)' });
  const consent = consentFrom(req.body?.consent);
  if (!consent) return res.status(400).json({ error: 'Примите пользовательское соглашение' });
  tickets.delete(String(req.body.ticket));
  const { target } = ticket;
  const phone = target.includes('@') ? null : target;
  // The same address may have signed up in another tab meanwhile.
  const existing = phone ? byPhone(phone) : byEmail(target);
  if (existing) return signIn(req, res, existing, 'код');
  const account = await createDriver(req, { login: target, phone, email: phone ? null : target, name, consent, ref: req.body?.ref });
  created(req, res, account);
});

api.post('/auth/oauth', async (req, res) => {
  const provider = req.body?.provider;
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Неизвестный способ входа' });
  let who;
  try {
    who = await verifyIdToken(provider, req.body?.idToken);
  } catch (err) {
    console.warn('[oauth]', provider, err.message);
    return res.status(502).json({ error: 'Не удалось связаться с сервером входа — попробуйте позже' });
  }
  if (who.error) return res.status(401).json({ error: who.error });
  const label = provider === 'google' ? 'Google' : 'Apple';

  let account = drivers().find(a => a.oauth?.[provider] === who.sub);
  // The same verified email already has an account: that account gains the provider.
  if (!account && who.email && who.emailVerified) {
    account = byEmail(who.email);
    if (account) db.update('accounts', account.id, { oauth: { ...(account.oauth ?? {}), [provider]: who.sub }, email: account.email ?? who.email });
  }
  if (account) return signIn(req, res, db.byId('accounts', account.id), label);

  const consent = consentFrom(req.body?.consent);
  if (!consent) return res.status(400).json({ error: 'Примите пользовательское соглашение' });
  // Apple gives the name only to the app, and only the first time.
  const name = cleanName(who.name || req.body?.name) || 'Водитель Voli';
  const email = who.email && who.emailVerified ? who.email : null;
  account = await createDriver(req, { login: email ?? `${provider}:${who.sub}`, email, name, consent, ref: req.body?.ref, oauth: { [provider]: who.sub } });
  created(req, res, account);
});

import { db } from './db.js';

/**
 * Where a browser keeps its sign-in.
 *
 * The token lives in an HttpOnly cookie, one per portal, that no script on
 * the page can read, so a piece of injected script cannot carry a session
 * away. A request names its portal in the X-Voli-Portal header; only then is
 * the cookie used. A form or link from another site cannot set that header,
 * and SameSite=Lax keeps the cookie off cross-site posts, so the cookie alone
 * never acts for the driver (no CSRF).
 *
 * Integrations and the API portal keep sending "Authorization: Bearer", and
 * the token is still in the sign-in answer for them. A browser that signed
 * in before the cookie existed sends its old Bearer token once; it gets the
 * cookie in return and drops the stored copy.
 */

const PORTALS = new Set(['driver', 'operator', 'admin', 'business']);
const cookieName = portal => `voli_${portal}`;
/** The server decides when a sign-in expires (IDLE_MS in db.js); the cookie only has to outlive it. */
const COOKIE_DAYS = 90;

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const portalOf = req => {
  const p = String(req.get('x-voli-portal') ?? '');
  return PORTALS.has(p) ? p : null;
};

function bearerHeader(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** The sign-in token of this request: the Bearer header, or the portal's cookie. */
export function tokenOf(req) {
  const fromHeader = bearerHeader(req);
  if (fromHeader) return fromHeader;
  const portal = portalOf(req);
  return portal ? cookies(req)[cookieName(portal)] ?? null : null;
}

function setCookie(req, res, portal, token, maxAgeSec) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  const parts = [`${cookieName(portal)}=${encodeURIComponent(token)}`, 'Path=/api', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export const clearSessionCookie = (req, res) => {
  const portal = portalOf(req);
  if (portal) setCookie(req, res, portal, '', 0);
};

/**
 * Mounted on /api before the routers: every answer that hands out a sign-in
 * also sets its cookie, and an old Bearer sign-in moves into the cookie.
 */
export function sessionCookies(req, res, next) {
  const json = res.json.bind(res);
  res.json = body => {
    const portal = body?.user?.portal;
    if (body?.token && PORTALS.has(portal) && res.statusCode < 300) setCookie(req, res, portal, body.token, COOKIE_DAYS * 86400);
    return json(body);
  };

  const portal = portalOf(req);
  const old = bearerHeader(req);
  if (portal && old && !cookies(req)[cookieName(portal)] && db.resolveToken(old)?.account.portal === portal) {
    setCookie(req, res, portal, old, COOKIE_DAYS * 86400);
  }
  next();
}

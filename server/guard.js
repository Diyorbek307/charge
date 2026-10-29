/**
 * Brakes on guessing: how many tries a key (a login, a phone, an address, a
 * 2FA challenge) gets in a window. Kept in memory — a restart forgives, and
 * that is fine for slowing a password guesser down from thousands of tries
 * an hour to a handful.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const hits = new Map();

/** Counts one try; answers whether it is allowed and, if not, when it will be. */
export function attempt(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  hits.set(key, list);
  // An occasional sweep keeps the map from growing without bound.
  if (hits.size > 50_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return { ok: true };
}

/** Whether a key is over its limit, without counting this look as a try. */
export function blocked(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  return list.length >= max ? { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) } : null;
}

/** A successful sign-in clears the failures counted for that login. */
export const forgive = key => hits.delete(key);

/**
 * Password hashing off the main thread: scrypt runs on libuv's pool, so a
 * crowd signing in does not freeze the server for everyone else.
 */
export async function hashPasswordAsync(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: (await scrypt(password, salt, 32)).toString('hex') };
}

// Checked against when the login does not exist, so a wrong login takes as
// long as a wrong password and cannot be told apart by timing.
const DUMMY = { salt: crypto.randomBytes(16).toString('hex'), hash: crypto.randomBytes(32).toString('hex') };

export async function verifyPasswordAsync(account, password) {
  const a = account ?? DUMMY;
  const expected = Buffer.from(a.hash, 'hex');
  const actual = await scrypt(String(password), a.salt, 32);
  return !!account && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

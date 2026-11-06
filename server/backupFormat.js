import crypto from 'node:crypto';
import zlib from 'node:zlib';

/**
 * What a Voli backup is, with nothing else loaded: the restore script uses
 * this without starting a server or touching a database.
 */

export const COLLECTIONS = ['accounts', 'stations', 'sessions', 'transactions', 'operators', 'payments', 'leads'];

export const countsOf = data => Object.fromEntries(COLLECTIONS.map(k => [k, Array.isArray(data?.[k]) ? data[k].length : 0]));

/** Encrypts for the trip off the server: salt, IV and tag travel with the data. */
export function seal(buf, secret) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(secret, salt, 32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('VOLIBK1'), salt, iv, c.getAuthTag(), body]);
}

export function unseal(buf, secret) {
  if (buf.subarray(0, 7).toString() !== 'VOLIBK1') throw new Error('Это не зашифрованная копия Voli');
  const salt = buf.subarray(7, 23);
  const iv = buf.subarray(23, 35);
  const tag = buf.subarray(35, 51);
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(secret, salt, 32), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(51)), d.final()]);
}

/** Unpacks a copy and says whether it holds what the live data holds; the restore check. */
export function verify(gz, expected) {
  const data = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  const got = countsOf(data);
  const missing = Object.entries(expected).filter(([k, n]) => k !== '__v' && got[k] !== n).map(([k, n]) => `${k}: ${got[k]} из ${n}`);
  return { ok: missing.length === 0 && data.__v === expected.__v, counts: got, missing };
}

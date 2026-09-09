import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seed, SCHEMA_VERSION } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/**
 * Tiny persistent document store.
 *
 * Everything lives in memory and is flushed to a single JSON file on a short
 * debounce, written to a temp file and renamed so a crash mid-write can never
 * leave a truncated database behind. Deliberately dependency-free: Render's
 * free tier gives us an ephemeral disk anyway, so a native engine would add
 * deploy risk without buying real durability.
 */
class Database {
  constructor() {
    this.data = this.#load();
    this.flushTimer = null;
    this.listeners = new Set();
  }

  #load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (parsed && parsed.__v === SCHEMA_VERSION) return parsed;
        console.log(`[db] schema ${parsed?.__v} != ${SCHEMA_VERSION}, reseeding`);
      }
    } catch (err) {
      console.warn('[db] load failed, reseeding:', err.message);
    }
    const fresh = seed();
    this.#write(fresh);
    return fresh;
  }

  #write(data) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${DB_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.warn('[db] persist failed:', err.message);
    }
  }

  /** Debounced flush — callers mutate `db.data` then call this. */
  save() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.#write(this.data);
    }, 250);
  }

  reset() {
    this.data = seed();
    this.#write(this.data);
    return this.data;
  }

  nextId(counter, prefix) {
    const n = this.data.counters[counter]++;
    this.save();
    return `${prefix}${n}`;
  }

  // ---- collection helpers -------------------------------------------------

  all(collection) {
    return this.data[collection] ?? [];
  }

  find(collection, predicate) {
    return this.all(collection).find(predicate) ?? null;
  }

  byId(collection, id) {
    return this.find(collection, item => item.id === id);
  }

  insert(collection, doc) {
    this.data[collection].unshift(doc);
    this.save();
    return doc;
  }

  update(collection, id, patch) {
    const item = this.byId(collection, id);
    if (!item) return null;
    Object.assign(item, patch);
    this.save();
    return item;
  }

  // ---- auth ---------------------------------------------------------------

  verifyPassword(account, password) {
    const expected = Buffer.from(account.hash, 'hex');
    const actual = crypto.scryptSync(password, account.salt, 32);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  issueToken(account) {
    const token = crypto.randomBytes(24).toString('hex');
    this.data.tokens.unshift({
      token,
      accountId: account.id,
      portal: account.portal,
      issued: new Date().toISOString(),
    });
    // Keep the token table from growing without bound in a long-lived process.
    if (this.data.tokens.length > 200) this.data.tokens.length = 200;
    this.save();
    return token;
  }

  resolveToken(token) {
    if (!token) return null;
    const entry = this.data.tokens.find(t => t.token === token);
    if (!entry) return null;
    const account = this.byId('accounts', entry.accountId);
    return account ? { account, entry } : null;
  }

  revokeToken(token) {
    const i = this.data.tokens.findIndex(t => t.token === token);
    if (i >= 0) {
      this.data.tokens.splice(i, 1);
      this.save();
    }
  }
}

export const db = new Database();

/** Strips secrets before an account is sent to a client. */
export function publicAccount(account) {
  if (!account) return null;
  const { salt, hash, otp, twoFactor, ...safe } = account;
  // Never ship the TOTP secret; the client only needs to know it is on.
  return { ...safe, twoFactorEnabled: !!twoFactor?.enabled };
}

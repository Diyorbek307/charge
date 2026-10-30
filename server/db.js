import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seed, SCHEMA_VERSION } from './seed.js';
import { report } from './monitoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/**
 * Collections holding real people's data rather than demo fixtures. A demo
 * reset or a schema reseed replaces everything else but carries these over.
 */
const KEEP = ['leads'];
const carry = (from, into) => {
  for (const key of KEEP) if (Array.isArray(from?.[key])) into[key] = from[key];
  into.counters.lead = Math.max(into.counters.lead ?? 1, from?.counters?.lead ?? 1);
  return into;
};

/**
 * JSON file on local disk. Written to a temp file and renamed, so a crash
 * mid-write never leaves a truncated database. Fine for local development;
 * on Render's free tier the disk is wiped on every restart.
 */
class FileStore {
  describe() {
    return `file ${DB_FILE}`;
  }

  async load() {
    if (!fs.existsSync(DB_FILE)) return null;
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }

  async write(json) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, DB_FILE);
  }

  async close() {}
}

/**
 * Postgres. The whole document lives in one JSONB row: the app already works
 * on an in-memory document with debounced saves, so this buys real durability
 * without rewriting every handler around queries.
 *
 * DATABASE_URL=postgres://… uses node-postgres (Neon, Supabase, Render PG).
 * DATABASE_URL=pglite://<dir> uses PGlite, an embedded Postgres, for tests.
 */
class PostgresStore {
  constructor(url) {
    this.url = url;
    this.client = null;
  }

  describe() {
    return this.url.startsWith('pglite:') ? 'pglite (embedded postgres)' : `postgres ${this.url.replace(/\/\/[^@]*@/, '//***@')}`;
  }

  async #connect() {
    if (this.client) return this.client;
    if (this.url.startsWith('pglite:')) {
      const { PGlite } = await import('@electric-sql/pglite');
      const dir = this.url.slice('pglite://'.length);
      this.pglite = dir ? new PGlite(dir) : new PGlite();
      this.client = { query: (text, params) => this.pglite.query(text, params) };
    } else {
      const { default: pg } = await import('pg');
      // A host without a dot is a private-network name (Render's internal URL,
      // a Docker service): no TLS there. Public hosts are always encrypted.
      const host = new URL(this.url).hostname;
      const local = /^(localhost|127\.0\.0\.1)$/.test(host) || !host.includes('.') || /sslmode=disable/.test(this.url);
      this.pool = new pg.Pool({
        connectionString: this.url,
        max: 3,
        ssl: local ? false : { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== 'true' },
      });
      this.client = { query: (text, params) => this.pool.query(text, params) };
    }
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS onecharge_state (
         id integer PRIMARY KEY,
         doc jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    return this.client;
  }

  async load() {
    const client = await this.#connect();
    const { rows } = await client.query('SELECT doc FROM onecharge_state WHERE id = 1');
    return rows[0]?.doc ?? null;
  }

  async write(json) {
    const client = await this.#connect();
    await client.query(
      `INSERT INTO onecharge_state (id, doc, updated_at) VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [json],
    );
  }

  async close() {
    await this.pool?.end();
    await this.pglite?.close();
  }
}

/**
 * In-memory document store with pluggable persistence.
 *
 * Handlers mutate `db.data` synchronously and call save(); writes are
 * debounced, serialised through a promise chain so they never overlap, and
 * snapshotted at flush time so later mutations cannot tear a write.
 */
/** A sign-in unused for this long expires. */
const TOKEN_DAYS = 60;
/** Devices one account may stay signed in on. */
const TOKENS_PER_ACCOUNT = 20;

class Database {
  constructor() {
    const url = process.env.DATABASE_URL || '';
    this.store = url ? new PostgresStore(url) : new FileStore();
    this.data = null;
    this.flushTimer = null;
    this.writing = Promise.resolve();
    this.listeners = new Set();
    this.ready = this.#init();
  }

  async #init() {
    let loaded = null;
    try {
      loaded = await this.store.load();
    } catch (err) {
      // A database we cannot reach must not be silently replaced with seed data.
      if (this.store instanceof PostgresStore) throw err;
      console.warn('[db] load failed, reseeding:', err.message);
    }
    if (loaded && loaded.__v === SCHEMA_VERSION) {
      this.data = loaded;
    } else {
      if (loaded) console.log(`[db] schema ${loaded.__v} != ${SCHEMA_VERSION}, reseeding`);
      this.data = carry(loaded, seed());
      await this.store.write(JSON.stringify(this.data));
    }
    console.log(`[db] ready · ${this.store.describe()}`);
  }

  #queueWrite() {
    const json = JSON.stringify(this.data);
    this.writing = this.writing
      .then(() => this.store.write(json))
      .then(() => {
        this.saveError = null;
      })
      .catch(err => {
        // Reported once per failing streak, not on every write.
        if (!this.saveError) report(err, 'db.save');
        this.saveError = err;
        console.warn('[db] persist failed:', err.message);
      });
    return this.writing;
  }

  /** Where the data lives and whether the last write reached it. */
  health() {
    return { storage: this.store instanceof PostgresStore ? 'postgres' : 'file', saving: !this.saveError };
  }

  /** Debounced flush — callers mutate `db.data` then call this. */
  save() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.#queueWrite();
    }, 250);
  }

  /** Writes anything pending right now; awaited on shutdown. */
  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      await this.#queueWrite();
    }
    await this.writing;
  }

  async close() {
    await this.flush();
    await this.store.close();
  }

  reset() {
    this.data = carry(this.data, seed());
    void this.#queueWrite();
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

  issueToken(account, req = null) {
    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();
    this.data.tokens.unshift({
      token,
      accountId: account.id,
      portal: account.portal,
      issued: now,
      lastSeen: now,
      // Shown in the account's device list, nothing else.
      agent: String(req?.get?.('user-agent') ?? '').slice(0, 200),
    });
    // Sign-ins expire after TOKEN_DAYS idle; the cap only guards memory, per account.
    const mine = this.data.tokens.filter(t => t.accountId === account.id);
    if (mine.length > TOKENS_PER_ACCOUNT) {
      const drop = new Set(mine.slice(TOKENS_PER_ACCOUNT).map(t => t.token));
      this.data.tokens = this.data.tokens.filter(t => !drop.has(t.token));
    }
    this.save();
    return token;
  }

  resolveToken(token) {
    if (!token) return null;
    const entry = this.data.tokens.find(t => t.token === token);
    if (!entry) return null;
    const seen = Date.parse(entry.lastSeen ?? entry.issued);
    if (Date.now() - seen > TOKEN_DAYS * 86400_000) {
      this.revokeToken(token);
      return null;
    }
    // Recorded at most every few minutes, so reads do not turn into writes.
    if (Date.now() - seen > 5 * 60_000) {
      entry.lastSeen = new Date().toISOString();
      this.save();
    }
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

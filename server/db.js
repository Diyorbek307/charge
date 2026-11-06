import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seed, SCHEMA_VERSION, freshDemoPhotos, DEMO_ACCOUNTS } from './seed.js';
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

  // Backups (server/backup.js): gzipped copies in DATA_DIR/backups.
  #backupDir() {
    return path.join(DATA_DIR, 'backups');
  }
  async saveBackup(name, gz, meta) {
    fs.mkdirSync(this.#backupDir(), { recursive: true });
    fs.writeFileSync(path.join(this.#backupDir(), name), gz);
    fs.writeFileSync(path.join(this.#backupDir(), `${name}.meta.json`), JSON.stringify(meta));
  }
  async listBackups() {
    if (!fs.existsSync(this.#backupDir())) return [];
    return fs.readdirSync(this.#backupDir())
      .filter(f => f.endsWith('.meta.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(this.#backupDir(), f), 'utf8')))
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }
  async readBackup(name) {
    const file = path.join(this.#backupDir(), path.basename(name));
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }
  async pruneBackups(keep) {
    for (const old of (await this.listBackups()).slice(keep)) {
      for (const f of [old.name, `${old.name}.meta.json`]) fs.rmSync(path.join(this.#backupDir(), f), { force: true });
    }
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

  // Backups (server/backup.js): gzipped copies in their own table.
  async #backups() {
    const client = await this.#connect();
    await client.query(
      `CREATE TABLE IF NOT EXISTS onecharge_backups (
         name text PRIMARY KEY,
         taken_at timestamptz NOT NULL,
         meta jsonb NOT NULL,
         gz bytea NOT NULL
       )`,
    );
    return client;
  }
  async saveBackup(name, gz, meta) {
    const client = await this.#backups();
    await client.query('INSERT INTO onecharge_backups (name, taken_at, meta, gz) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (name) DO UPDATE SET meta = EXCLUDED.meta, gz = EXCLUDED.gz', [name, meta.takenAt, JSON.stringify(meta), gz]);
  }
  async listBackups() {
    const client = await this.#backups();
    const { rows } = await client.query('SELECT meta FROM onecharge_backups ORDER BY taken_at DESC');
    return rows.map(r => r.meta);
  }
  async readBackup(name) {
    const client = await this.#backups();
    const { rows } = await client.query('SELECT gz FROM onecharge_backups WHERE name = $1', [name]);
    return rows[0] ? Buffer.from(rows[0].gz) : null;
  }
  async pruneBackups(keep) {
    const client = await this.#backups();
    await client.query('DELETE FROM onecharge_backups WHERE name NOT IN (SELECT name FROM onecharge_backups ORDER BY taken_at DESC LIMIT $1)', [keep]);
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
/**
 * A sign-in unused for this long expires. Staff portals hold money and other
 * people's data, so theirs go quickly; the admin's also end after a working
 * day however busy.
 */
const HOUR = 3_600_000;
const IDLE_MS = { driver: 60 * 24 * HOUR, operator: 12 * HOUR, business: 12 * HOUR, api: 12 * HOUR, admin: Number(process.env.ADMIN_IDLE_MINUTES || 30) * 60_000 };
const MAX_AGE_MS = { admin: 12 * HOUR };
/** Only a hash of each sign-in token is stored: a copied database opens no session. */
export const hashToken = raw => crypto.createHash('sha256').update(String(raw)).digest('hex');
/** A real server: Render, or NODE_ENV=production. */
export const REAL_SERVER = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const staff2fa = process.env.STAFF_REQUIRE_2FA ?? process.env.ADMIN_REQUIRE_2FA ?? '';
const STAFF_2FA = staff2fa === 'true' || (staff2fa !== 'false' && REAL_SERVER);
/** DEMO_STAFF=true keeps the demo network, fleet and partner logins for showing the portals; never the admin. */
export const DEMO_STAFF = process.env.DEMO_STAFF === 'true';
const DEMO_STAFF_LOGINS = new Set(DEMO_ACCOUNTS.filter(a => a.portal !== 'driver').map(a => `${a.portal}:${a.login}`));
export const isDemoStaff = account => DEMO_STAFF_LOGINS.has(`${account?.portal}:${account?.login}`);

/**
 * Everyone but drivers holds money or other people's data, so on a real
 * server they work only with a second factor. The demo staff kept for showing
 * the portals are spared: they could not share one phone.
 */
export function twoFactorRequired(account) {
  if (!account || account.portal === 'driver' || !STAFF_2FA) return false;
  return account.portal === 'admin' || !(DEMO_STAFF && isDemoStaff(account));
}
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
      freshDemoPhotos(this.data);
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
      token: hashToken(token),
      accountId: account.id,
      portal: account.portal,
      issued: now,
      lastSeen: now,
      // Shown in the account's device list, nothing else.
      agent: String(req?.get?.('user-agent') ?? '').slice(0, 200),
    });
    // Sign-ins expire when idle (IDLE_MS); the cap only guards memory, per account.
    const mine = this.data.tokens.filter(t => t.accountId === account.id);
    if (mine.length > TOKENS_PER_ACCOUNT) {
      const drop = new Set(mine.slice(TOKENS_PER_ACCOUNT).map(t => t.token));
      this.data.tokens = this.data.tokens.filter(t => !drop.has(t.token));
    }
    this.save();
    return token;
  }

  /** The stored sign-in for a raw token; one kept in plain text from before is hashed on the way. */
  #entryOf(raw) {
    const hash = hashToken(raw);
    const entry = this.data.tokens.find(t => t.token === hash) ?? this.data.tokens.find(t => t.token === raw);
    if (entry && entry.token !== hash) {
      entry.token = hash;
      this.save();
    }
    return entry ?? null;
  }

  resolveToken(token) {
    if (!token) return null;
    const entry = this.#entryOf(token);
    if (!entry) return null;
    const seen = Date.parse(entry.lastSeen ?? entry.issued);
    const idle = IDLE_MS[entry.portal] ?? IDLE_MS.driver;
    const maxAge = MAX_AGE_MS[entry.portal];
    if (Date.now() - seen > idle || (maxAge && Date.now() - Date.parse(entry.issued) > maxAge)) {
      this.revokeToken(token);
      return null;
    }
    // Recorded at most every minute, so reads do not turn into writes.
    if (Date.now() - seen > 60_000) {
      entry.lastSeen = new Date().toISOString();
      this.save();
    }
    const account = this.byId('accounts', entry.accountId);
    return account ? { account, entry } : null;
  }

  revokeToken(token) {
    const hash = hashToken(token);
    const i = this.data.tokens.findIndex(t => t.token === hash || t.token === token);
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
  const { salt, hash, otp, twoFactor, oauth, ...safe } = account;
  // Never ship the TOTP secret; the client only needs to know it is on. Of
  // Google and Apple only which are linked, not the ids they gave.
  return { ...safe, twoFactorEnabled: !!twoFactor?.enabled, twoFactorRequired: twoFactorRequired(account), linked: Object.keys(oauth ?? {}) };
}

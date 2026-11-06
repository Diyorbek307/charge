/**
 * Puts a backup copy back as the live database.
 *
 *   node scripts/restore-backup.mjs <file> [--yes]
 *
 * <file> is a copy from the admin's "Состояние системы" page (.json.gz) or
 * one from the backup mailbox (.voli, encrypted; needs BACKUP_KEY set to the
 * same key the server had). The copy is checked first and its contents shown;
 * only with --yes is it written, to DATABASE_URL when that is set, otherwise
 * to the local file in DATA_DIR. Stop the server before writing: a running
 * server would save its own data over the restored one.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { unseal, COLLECTIONS } from '../server/backupFormat.js';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node scripts/restore-backup.mjs <copy.json.gz | copy.voli> [--yes]');
  process.exit(1);
}

let buf = fs.readFileSync(file);
if (buf.subarray(0, 7).toString() === 'VOLIBK1') {
  if (!process.env.BACKUP_KEY) {
    console.error('This copy is encrypted: set BACKUP_KEY to the key the server used.');
    process.exit(1);
  }
  buf = unseal(buf, process.env.BACKUP_KEY);
}
const data = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
const count = k => (Array.isArray(data[k]) ? data[k].length : 0);
console.log(`Schema version: ${data.__v}`);
for (const k of COLLECTIONS) console.log(`  ${k.padEnd(13)} ${count(k)}`);

if (flag !== '--yes') {
  console.log('\nNothing written. Run again with --yes to make this the live database (stop the server first).');
  process.exit(0);
}

const json = JSON.stringify(data);
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const host = new URL(process.env.DATABASE_URL).hostname;
  const local = /^(localhost|127\.0\.0\.1)$/.test(host) || !host.includes('.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== 'true' } });
  await pool.query(`INSERT INTO onecharge_state (id, doc, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`, [json]);
  await pool.end();
  console.log('Written to the Postgres database.');
} else {
  const dir = process.env.DATA_DIR || new URL('../.data', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/db.json`, json);
  console.log(`Written to ${dir}/db.json.`);
}
process.exit(0);

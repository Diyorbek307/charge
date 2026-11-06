import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { alertTeam } from './alerts.js';
import { seal, verify, countsOf } from './backupFormat.js';

/**
 * A copy of the whole database every night, checked as soon as it is made.
 *
 * Between 03:00 and 06:00 Tashkent time the server gzips the database,
 * unpacks the copy again and compares it with the live data (every
 * collection, record for record), and keeps the last 14 copies next to the
 * database: in their own table on Postgres, in DATA_DIR/backups on disk.
 *
 * Off-site: with BACKUP_KEY set and mail configured, the copy is encrypted
 * (AES-256-GCM, the key derived from BACKUP_KEY) and mailed to BACKUP_EMAIL
 * (by default info@). Without the key nothing leaves the server: the copy
 * holds drivers' phones and names. scripts/restore-backup.mjs puts a copy
 * back.
 *
 * A failure at any step reaches the team (server/alerts.js).
 */

const KEEP = 14;

let running = null;

/** Takes one copy now. Resolves to its record; a failure is alerted and thrown. */
export function takeBackup(by = 'расписание') {
  if (running) return running;
  running = (async () => {
    const takenAt = new Date().toISOString();
    const name = `voli-${takenAt.slice(0, 19).replace(/[:T]/g, '-')}.json.gz`;
    try {
      const json = JSON.stringify(db.data);
      const gz = zlib.gzipSync(json, { level: 9 });
      const expected = { ...countsOf(db.data), __v: db.data.__v };
      const check = verify(gz, expected);
      if (!check.ok) throw new Error(`копия не совпала с базой (${check.missing.join(', ') || 'другая версия схемы'})`);
      const meta = {
        name,
        takenAt,
        by,
        bytes: gz.length,
        sha256: crypto.createHash('sha256').update(gz).digest('hex'),
        counts: check.counts,
        verified: true,
        offsite: null,
      };

      // Off the server, encrypted, when there is a key to encrypt with.
      const secret = process.env.BACKUP_KEY || '';
      if (secret) {
        const { mailConfigured, mailbox, sendBackupLetter } = await import('./mail.js');
        if (mailConfigured()) {
          const to = process.env.BACKUP_EMAIL || mailbox('info');
          try {
            await sendBackupLetter(to, `Резервная копия ${takenAt.slice(0, 10)}`, [['Размер', `${Math.round(gz.length / 1024)} КБ`], ['Водителей и сотрудников', String(check.counts.accounts)], ['Зарядок', String(check.counts.sessions)], ['Как открыть', 'node scripts/restore-backup.mjs <файл> (нужен BACKUP_KEY)']], name.replace('.json.gz', '.voli'), seal(gz, secret));
            meta.offsite = { to, at: new Date().toISOString() };
          } catch (err) {
            void alertTeam('backup-mail', 'Резервная копия не ушла на почту', [['Ошибка', String(err.message).slice(0, 200)], ['Копия', 'сохранена на сервере']]);
          }
        }
      }

      await db.store.saveBackup(name, gz, meta);
      await db.store.pruneBackups(KEEP);
      return meta;
    } catch (err) {
      void alertTeam('backup', 'Резервная копия базы не сделана', [['Ошибка', String(err.message).slice(0, 200)]]);
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

const tashkentHour = () => new Date(Date.now() + 5 * 3600_000).getUTCHours();

/** Checks every quarter of an hour; the night copy is taken once a day. */
export function startBackups() {
  if (process.env.BACKUPS === 'off') return;
  const due = async () => {
    try {
      const last = (await db.store.listBackups())[0];
      const age = last ? Date.now() - Date.parse(last.takenAt) : Infinity;
      // The night window, or a day and a half without any copy (the server slept through the night).
      if ((tashkentHour() >= 3 && tashkentHour() < 6 && age > 20 * 3600_000) || age > 36 * 3600_000) await takeBackup();
    } catch {
      /* alerted inside */
    }
  };
  setTimeout(due, 2 * 60_000).unref();
  setInterval(due, 15 * 60_000).unref();
}

// ── The admin's view ──

api.get('/admin/backups', requireAuth('admin'), async (_req, res) => {
  res.json({ backups: await db.store.listBackups(), offsite: Boolean(process.env.BACKUP_KEY), keep: KEEP });
});

api.post('/admin/backups', requireAuth('admin'), async (req, res) => {
  try {
    const meta = await takeBackup(req.account.name);
    emit({ type: 'system.backup', portal: 'admin', actor: req.account.name, message: `Резервная копия базы: ${meta.name}` });
    res.status(201).json({ backup: meta });
  } catch (err) {
    res.status(500).json({ error: `Копия не сделана: ${err.message}` });
  }
});

api.get('/admin/backups/:name', requireAuth('admin'), async (req, res) => {
  const gz = await db.store.readBackup(String(req.params.name));
  if (!gz) return res.status(404).json({ error: 'Копия не найдена' });
  emit({ type: 'system.backup.download', portal: 'admin', actor: req.account.name, message: `Скачана резервная копия ${req.params.name}` });
  res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${String(req.params.name).replace(/[^\w.-]/g, '')}"` });
  res.send(gz);
});

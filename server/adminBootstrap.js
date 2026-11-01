import crypto from 'node:crypto';
import { db, REAL_SERVER, DEMO_STAFF, isDemoStaff } from './db.js';
import { hashPasswordAsync, verifyPasswordAsync } from './guard.js';

/**
 * The real admin of a real server, from its environment:
 *
 *   ADMIN_EMAIL     the sign-in address (e.g. owner@voli.uz)
 *   ADMIN_PASSWORD  at least 12 characters, letters and digits
 *   ADMIN_NAME      shown in the panel and the audit log (optional)
 *
 * On start the account is made, or its password brought in line with the
 * variable, so changing ADMIN_PASSWORD in Render changes the password and
 * signs the old sessions out. The seeded demo admin cannot sign in on a real
 * server (api.js), so this is the way into the panel there.
 */

const EMAIL = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const PASSWORD = String(process.env.ADMIN_PASSWORD ?? '');
const NAME = String(process.env.ADMIN_NAME ?? '').trim() || 'Администратор Voli';

const strong = p => p.length >= 12 && /\d/.test(p) && /\p{L}/u.test(p);

/** Sessions the demo staff opened before their logins were closed end now. */
function closeDemoStaffSessions() {
  if (!REAL_SERVER) return;
  const closed = new Set(db.data.accounts.filter(a => isDemoStaff(a) && (a.portal === 'admin' || !DEMO_STAFF)).map(a => a.id));
  const before = db.data.tokens.length;
  db.data.tokens = db.data.tokens.filter(t => !closed.has(t.accountId));
  if (db.data.tokens.length !== before) {
    db.save();
    console.log(`[admin] signed out ${before - db.data.tokens.length} demo staff session(s)`);
  }
}

async function bootstrap() {
  await db.ready;
  closeDemoStaffSessions();
  if (!EMAIL) return;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(EMAIL)) return console.warn('[admin] ADMIN_EMAIL is not an email address — skipped');
  if (!strong(PASSWORD)) return console.warn('[admin] ADMIN_PASSWORD must be 12+ characters with letters and digits — skipped');

  let account = db.find('accounts', a => a.portal === 'admin' && a.login === EMAIL);
  if (!account) {
    account = {
      id: `acc-${crypto.randomBytes(6).toString('hex')}`,
      portal: 'admin',
      login: EMAIL,
      ...(await hashPasswordAsync(PASSWORD)),
      otp: null,
      name: NAME,
      role: 'Владелец',
      org: 'Voli',
      orgId: null,
      avatar: NAME.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'VA',
      lastLogin: null,
      created: new Date().toISOString(),
      twoFactor: { enabled: false, secret: null, pending: null },
    };
    db.data.accounts.push(account);
    db.save();
    console.log(`[admin] created ${EMAIL}`);
  } else if (!(await verifyPasswordAsync(account, PASSWORD))) {
    Object.assign(account, await hashPasswordAsync(PASSWORD));
    // A new password ends every session the old one opened.
    db.data.tokens = db.data.tokens.filter(t => t.accountId !== account.id);
    db.save();
    console.log(`[admin] password of ${EMAIL} updated from ADMIN_PASSWORD`);
  }
}

bootstrap().catch(err => console.warn('[admin]', err.message));

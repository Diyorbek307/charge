import crypto from 'node:crypto';
import { db } from './db.js';
import { hashPasswordAsync, verifyPasswordAsync } from './guard.js';
import { playMoney } from './money.js';

/**
 * The one driver account that may sign in before the launch (invite-only
 * mode, server/inviteOnly.js): the account the store reviewers and the owner
 * use. From the server's environment, never from the code:
 *
 *   REVIEW_EMAIL     its sign-in address
 *   REVIEW_PASSWORD  its password, 8 characters or more
 *
 * On start the account is made, or its password brought in line with the
 * variable. While money is play money it is given a balance to charge with.
 */

export const REVIEW_EMAIL = String(process.env.REVIEW_EMAIL ?? '').trim().toLowerCase();
const PASSWORD = String(process.env.REVIEW_PASSWORD ?? '');
const START_BALANCE = 300_000;

async function bootstrap() {
  await db.ready;
  if (!REVIEW_EMAIL) return;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(REVIEW_EMAIL)) return console.warn('[review] REVIEW_EMAIL is not an email address — skipped');
  if (PASSWORD.length < 8) return console.warn('[review] REVIEW_PASSWORD must be 8+ characters — skipped');

  let account = db.find('accounts', a => a.portal === 'driver' && (a.login === REVIEW_EMAIL || a.email === REVIEW_EMAIL));
  if (!account) {
    account = {
      id: `acc-${crypto.randomBytes(6).toString('hex')}`,
      portal: 'driver',
      login: REVIEW_EMAIL,
      phone: null,
      email: REVIEW_EMAIL,
      ...(await hashPasswordAsync(PASSWORD)),
      otp: null,
      name: 'Демо-водитель Voli',
      role: 'Водитель',
      org: null,
      orgId: null,
      avatar: 'DV',
      lastLogin: null,
      created: new Date().toISOString(),
      twoFactor: { enabled: false, secret: null, pending: null },
      consent: { version: 1, at: new Date().toISOString(), via: 'review-account' },
    };
    db.data.accounts.push(account);
    console.log(`[review] created ${REVIEW_EMAIL}`);
  } else if (!(await verifyPasswordAsync(account, PASSWORD))) {
    Object.assign(account, await hashPasswordAsync(PASSWORD), { noPassword: false });
    db.data.tokens = db.data.tokens.filter(t => t.accountId !== account.id);
    console.log(`[review] password of ${REVIEW_EMAIL} updated from REVIEW_PASSWORD`);
  }
  // Something to charge with, as long as the money is not real.
  const wallet = (db.data.wallets[account.id] ??= { balance: 0, currency: 'UZS', autoTopUp: false, threshold: 0, card: null });
  if (playMoney() && wallet.balance < 50_000) wallet.balance = START_BALANCE;
  db.save();
}

bootstrap().catch(err => console.warn('[review]', err.message));

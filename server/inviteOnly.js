import { setting } from './settings.js';
import { normalizePhone } from './sms.js';
import { REVIEW_EMAIL } from './reviewerBootstrap.js';

/**
 * Invite-only mode, before the launch: the store app is public, but only
 * invited drivers may sign in, and nobody new may sign up.
 *
 * Switched by the platform setting `access.inviteOnly` (Admin → Platform
 * control). On a real server it is on by default until someone turns it off;
 * locally and in tests it is off unless INVITE_ONLY=true.
 *
 * Invited: the review account (REVIEW_EMAIL, server/reviewerBootstrap.js) and every
 * phone or email in INVITE_LOGINS, comma separated, e.g. "+998901112233, me@voli.uz".
 * The public demo driver is not: its password is in the code.
 */

export const INVITE_MESSAGE = 'Voli скоро запустится. Сейчас вход только по приглашению — оставьте номер на voli.uz, и мы сообщим о запуске.';

const key = value => {
  const s = String(value ?? '').trim();
  return normalizePhone(s) ?? s.toLowerCase();
};

const invitedLogins = () => {
  const list = new Set(String(process.env.INVITE_LOGINS ?? '').split(',').map(key).filter(Boolean));
  if (REVIEW_EMAIL) list.add(REVIEW_EMAIL);
  return list;
};

export const inviteOnly = () => setting('access.inviteOnly') === true;

/** May this phone or email sign in or sign up now? */
export function invitedLogin(login) {
  return !inviteOnly() || invitedLogins().has(key(login));
}

/** May this driver account sign in now? Any of its phone, email or login counts. */
export function invitedAccount(account) {
  if (!inviteOnly() || account?.portal !== 'driver') return true;
  const list = invitedLogins();
  return [account.login, account.phone, account.email].some(v => v && list.has(key(v)));
}

/** Refuses with the launch message; returns true when it did. */
export function refuseUninvited(res, allowed) {
  if (allowed) return false;
  res.status(403).json({ error: INVITE_MESSAGE, inviteOnly: true });
  return true;
}

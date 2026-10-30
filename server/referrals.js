/**
 * Bring a friend. Every driver has a code; a friend who signs up with it
 * gets a welcome bonus on the first charge, and the one who invited them
 * earns a share of each charge the friend pays for, for a number of months.
 *
 * Both are bonuses paid by Voli (the networks get their full price), drawn
 * from the same monthly rewards budget, and an inviter's earnings are capped
 * per month. A charge on credit does not count: it is not paid when it ends.
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { setting, feature } from './settings.js';
import { grantBonus } from './rewards.js';

const MONTH = 30 * 86_400_000;
const box = () => (db.data.referrals ??= { codes: {}, links: {} });

/** The driver's own code, made once: six letters and digits that do not look alike. */
export function codeOf(account) {
  const r = box();
  if (r.codes[account.id]) return r.codes[account.id];
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), b => alphabet[b % alphabet.length]).join('');
  } while (Object.values(r.codes).includes(code));
  r.codes[account.id] = code;
  db.save();
  return code;
}

const ownerOf = code => {
  const c = String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c ? Object.keys(box().codes).find(id => box().codes[id] === c) ?? null : null;
};

/** At sign-up: ties the new driver to whoever invited them. Unknown codes are ignored, not refused. */
export function joinByCode(account, code) {
  if (!feature('referral')) return null;
  const by = ownerOf(code);
  if (!by || by === account.id || box().links[account.id]) return null;
  box().links[account.id] = { by, at: new Date().toISOString() };
  db.save();
  return by;
}

const earnedThisMonth = userId => {
  const month = new Date().toISOString().slice(0, 7);
  return (db.data.bonuses?.[userId]?.grants ?? []).filter(g => g.kind.startsWith('ref-') && g.kind !== 'ref-welcome' && g.at.startsWith(month)).reduce((n, g) => n + g.amount, 0);
};

/**
 * A friend's charge is paid: the inviter earns their share, and on the
 * first one the friend gets the welcome bonus. Returns the grants made.
 */
export function onFriendPaid(session) {
  if (!feature('referral') || !(session.cost > 0)) return [];
  const link = box().links[session.userId];
  if (!link) return [];
  const made = [];
  const friend = db.byId('accounts', session.userId);
  // The welcome bonus: once, on the first paid charge.
  const welcome = setting('referral.friendBonus');
  if (welcome > 0) {
    const g = grantBonus(session.userId, 'ref-welcome', 'Бонус за приглашение друга', welcome);
    if (g) made.push(g);
  }
  // The inviter's share, while the friendship is young and under the month's cap.
  if (Date.now() - Date.parse(link.at) > setting('referral.months') * MONTH) return made;
  const share = Math.round((session.cost * setting('referral.percent')) / 100);
  const room = setting('referral.monthCap') - earnedThisMonth(link.by);
  const amount = Math.min(share, room);
  if (amount > 0) {
    const g = grantBonus(link.by, `ref-${session.id}`, `Друг ${firstName(friend?.name)} зарядился`, amount);
    if (g) made.push({ ...g, userId: link.by });
  }
  return made;
}

const firstName = name => String(name ?? 'друг').split(' ')[0];
/** A friend's name as the inviter sees it: first name and the initial of the second. */
const shown = name => {
  const [a, b] = String(name ?? '').split(' ');
  return b ? `${a} ${b[0]}.` : a || 'Друг';
};

/** The inviter's screen: the code, the rules in force, each friend and what they brought. */
export function referralFor(account) {
  const links = Object.entries(box().links).filter(([, l]) => l.by === account.id);
  const grants = db.data.bonuses?.[account.id]?.grants ?? [];
  const friends = links.map(([id, l]) => {
    const f = db.byId('accounts', id);
    const charges = db.data.sessions.filter(s => s.userId === id && s.status === 'completed' && s.cost > 0);
    const earned = grants.filter(g => g.kind.startsWith('ref-') && charges.some(s => g.kind === `ref-${s.id}`)).reduce((n, g) => n + g.amount, 0);
    return { name: shown(f?.name), since: l.at, charges: charges.length, earned, active: Date.now() - Date.parse(l.at) <= setting('referral.months') * MONTH };
  });
  return {
    on: feature('referral'),
    code: codeOf(account),
    percent: setting('referral.percent'),
    months: setting('referral.months'),
    friendBonus: setting('referral.friendBonus'),
    monthCap: setting('referral.monthCap'),
    earnedMonth: earnedThisMonth(account.id),
    earnedTotal: friends.reduce((n, f) => n + f.earned, 0),
    friends: friends.sort((a, b) => b.since.localeCompare(a.since)),
    invitedBy: box().links[account.id] ? true : false,
  };
}

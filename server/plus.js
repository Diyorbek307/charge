/**
 * PowerGo Plus: a monthly subscription for drivers who charge often.
 *
 *   −5% on every charge in every network (PowerGo pays the difference: the
 *   network still earns its full price), free bookings, a place in a queue
 *   ahead of drivers without Plus, double points.
 *
 * Paid from the wallet for 30 days at a time; it renews itself while the
 * wallet can pay, and cancelling stops the renewal, not the paid month.
 */
import { db } from './db.js';
import { setting, feature } from './settings.js';

const DAY = 86_400_000;
/** Price, discount and period are the admin's to set (server/settings.js); read when used. */
export const PLUS = {
  get price() {
    return setting('plus.price');
  },
  get discount() {
    return setting('plus.discount');
  },
  get days() {
    return setting('plus.days');
  },
};
const subs = () => (db.data.subscriptions ??= {});
const ledger = () => (db.data.plusLedger ??= []);

/** Renews a lapsed month when it should and can; returns the subscription or null. */
function current(userId) {
  const s = subs()[userId];
  if (!s) return null;
  if (Date.parse(s.renewsAt) > Date.now()) return s;
  const wallet = db.data.wallets[userId];
  // Switched off by the admin: paid months run out, nothing renews.
  if (s.autoRenew && feature('plus') && wallet && wallet.balance >= PLUS.price) {
    wallet.balance -= PLUS.price;
    s.periodStart = s.renewsAt;
    s.renewsAt = new Date(Date.parse(s.renewsAt) + PLUS.days * DAY).toISOString();
    ledger().unshift({ userId, amount: PLUS.price, ts: new Date().toISOString(), kind: 'renew' });
    db.save();
    return s;
  }
  return null;
}

export const plusActive = userId => !!current(userId);

export function plusFor(userId) {
  const s = current(userId);
  const saved = s
    ? db.data.sessions.filter(x => x.userId === userId && x.plusCovered && x.start >= s.periodStart).reduce((n, x) => n + x.plusCovered, 0)
    : 0;
  return {
    active: !!s,
    since: subs()[userId]?.since ?? null,
    renewsAt: s?.renewsAt ?? null,
    autoRenew: s?.autoRenew ?? false,
    savedThisMonth: saved,
    price: PLUS.price,
    discount: PLUS.discount,
    days: PLUS.days,
  };
}

export function subscribePlus(account) {
  if (current(account.id)?.autoRenew) return { status: 409, error: 'Plus уже подключён' };
  const s = subs()[account.id];
  // Cancelled but still paid: turning renewal back on costs nothing now.
  if (s && Date.parse(s.renewsAt) > Date.now()) {
    s.autoRenew = true;
    db.save();
    return { plus: plusFor(account.id) };
  }
  const wallet = db.data.wallets[account.id];
  if (!wallet || wallet.balance < PLUS.price) return { status: 402, error: `Нужно ${PLUS.price.toLocaleString('ru-RU')} сум на кошельке` };
  wallet.balance -= PLUS.price;
  const now = new Date().toISOString();
  subs()[account.id] = { since: s?.since ?? now, periodStart: now, renewsAt: new Date(Date.now() + PLUS.days * DAY).toISOString(), autoRenew: true };
  ledger().unshift({ userId: account.id, amount: PLUS.price, ts: now, kind: 'start' });
  db.save();
  return { plus: plusFor(account.id) };
}

export function cancelPlus(account) {
  const s = subs()[account.id];
  if (!s) return { status: 404, error: 'Plus не подключён' };
  s.autoRenew = false;
  db.save();
  return { plus: plusFor(account.id) };
}

/** For the admin: who has Plus, what it brought and what PowerGo paid the networks for it. */
export function plusOverview() {
  const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
  const list = Object.entries(subs()).map(([userId, s]) => ({ userId, user: db.byId('accounts', userId)?.name ?? userId, ...s, active: Date.parse(s.renewsAt) > Date.now() }));
  return {
    active: list.filter(s => s.active).length,
    renewing: list.filter(s => s.active && s.autoRenew).length,
    revenueMonth: ledger().filter(l => l.ts.startsWith(month)).reduce((n, l) => n + l.amount, 0),
    coveredMonth: db.data.sessions.filter(s => s.plusCovered && s.start.startsWith(month)).reduce((n, s) => n + s.plusCovered, 0),
    subscribers: list.sort((a, b) => b.renewsAt.localeCompare(a.renewsAt)).slice(0, 50),
  };
}

/**
 * Voli's own rewards: bonus money for telling us about the car and for
 * milestones along the way. Paid by Voli, not by the networks — a charge
 * paid with a bonus still earns the network its full price.
 *
 * A bonus is not money in the wallet: it pays for charging only, cannot be
 * withdrawn, and burns after BONUS_DAYS. Each reward is granted once per
 * account, and a monthly budget caps what the promotion can cost.
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { setting, feature } from './settings.js';

const DAY = 86_400_000;
// Amounts, goals, the budget and the bonus's life are the admin's to set (server/settings.js).
const BONUS_DAYS = () => setting('rewards.bonusDays');
const MONTH_BUDGET = () => setting('rewards.monthBudget');
const amountOf = a => (a.id === 'car' ? setting('rewards.carBonus') : a.id === 'passport' ? setting('rewards.passportBonus') : setting(`rewards.${a.id}.amount`));
const goalOf = a => (a.goal > 1 ? setting(`rewards.${a.id}.goal`) : a.goal);
// The car and passport gifts are off while their amount is 0.
const enabled = a => (a.id === 'car' || a.id === 'passport' ? amountOf(a) > 0 : setting(`rewards.${a.id}.on`));

const store = () => (db.data.bonuses ??= {});
const ledger = () => (db.data.bonusLedger ??= []);
const nowIso = () => new Date().toISOString();

const done = account => db.data.sessions.filter(s => s.userId === account.id && s.status === 'completed');
const cityOf = s => db.byId('stations', s.stationId)?.city ?? null;

/** What can be earned, and how far along the driver is. */
export const ACHIEVEMENTS = [
  { id: 'car', icon: '🚗', title: 'Мой автомобиль', desc: 'Укажите марку, модель, батарею и разъём своей машины', goal: 1, progress: a => (a.car?.brand && a.car?.model && a.car?.battery && a.car?.port ? 1 : 0) },
  // Paid once per passport, not per account (server/passport.js refuses a passport already in use).
  { id: 'passport', icon: '🪪', title: 'Паспорт водителя', desc: 'Укажите серию и номер паспорта, ПИНФЛ и дату рождения', goal: 1, progress: a => (a.passport?.at ? 1 : 0) },
  { id: 'first', icon: '⚡', title: 'Первая зарядка', desc: 'Зарядитесь хотя бы на 5 кВт·ч', goal: 1, progress: (a, s) => (s.some(x => x.energy >= 5) ? 1 : 0) },
  { id: 'night', icon: '🌙', title: 'Ночная сова', desc: n => `${n} зарядок по ночному тарифу, 23:00–07:00`, goal: 5, progress: (a, s) => s.filter(x => x.multiplier === 0.7).length },
  { id: 'networks', icon: '🔀', title: 'Без границ', desc: n => `Зарядитесь в ${n} разных сетях`, goal: 3, progress: (a, s) => new Set(s.map(x => x.operatorId)).size },
  { id: 'cities', icon: '🧭', title: 'Путешественник', desc: n => `Зарядки в ${n} разных городах`, goal: 3, progress: (a, s) => new Set(s.map(cityOf).filter(Boolean)).size },
  { id: 'rater', icon: '⭐', title: 'Честный отзыв', desc: n => `Оцените ${n} зарядок`, goal: 5, progress: (a, s) => s.filter(x => x.rating).length },
  { id: 'ten', icon: '🏅', title: 'Свой человек', desc: n => `${n} зарядок`, goal: 10, progress: (a, s) => s.length },
  { id: 'kwh500', icon: '🔋', title: 'Много кВт·ч', desc: n => `Наберите ${n.toLocaleString('ru-RU')} кВт·ч — это около ${Math.round(n * 5.5).toLocaleString('ru-RU')} км`, goal: 500, progress: (a, s) => Math.floor(s.reduce((n, x) => n + (x.energy ?? 0), 0)) },
];

const live = g => g.left > 0 && Date.parse(g.expiresAt) > Date.now();

/** Bonus money still to spend, and when the next part of it burns. */
export function bonusFor(userId) {
  const grants = store()[userId]?.grants ?? [];
  const open = grants.filter(live).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return { balance: open.reduce((n, g) => n + g.left, 0), nextExpiry: open[0]?.expiresAt ?? null, nextExpiryAmount: open[0]?.left ?? 0 };
}

/** Granted this calendar month across everyone, for the budget cap. */
const monthSpend = () => {
  const month = nowIso().slice(0, 7);
  return Object.values(store()).flatMap(b => b.grants).filter(g => g.at.startsWith(month)).reduce((n, g) => n + g.amount, 0);
};

/**
 * Grants every reward the driver has reached and not yet received.
 * Idempotent: safe to call on every read. Returns the new grants.
 */
export function syncRewards(account) {
  if (!account || account.portal !== 'driver' || !feature('rewards')) return [];
  const mine = (store()[account.id] ??= { grants: [] });
  const sessions = done(account);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!enabled(a) || mine.grants.some(g => g.kind === a.id)) continue;
    if (a.progress(account, sessions) < goalOf(a)) continue;
    const amount = amountOf(a);
    if (amount <= 0 || monthSpend() + amount > MONTH_BUDGET()) continue;
    const at = nowIso();
    const grant = { id: `BN-${Date.now().toString(36)}-${a.id}`, kind: a.id, title: a.title, amount, left: amount, at, expiresAt: new Date(Date.now() + BONUS_DAYS() * DAY).toISOString() };
    mine.grants.push(grant);
    ledger().unshift({ id: grant.id, userId: account.id, kind: a.id, amount, ts: at, type: 'grant' });
    fresh.push(grant);
  }
  if (fresh.length) db.save();
  return fresh;
}

// ---------------------------------------------------------------------------
// Gifts for kWh: every kWh charged is a coin. The admin lists gifts with
// their price in kWh (an oil change, a dry clean, tyres). The driver takes a
// gift when the coins are enough; its price is spent and saving starts over.
// The driver gets a code and names it to support; the admin hands it over.
// ---------------------------------------------------------------------------

const prizesStore = () => (db.data.prizes ??= []);
const chargedKwh = sessions => sessions.reduce((n, x) => n + (x.energy ?? 0), 0);
// A gift the admin cancelled gives its kWh back.
const spentKwh = userId => prizesStore().filter(p => p.userId === userId && p.status !== 'cancelled').reduce((n, p) => n + p.kwh, 0);
const prizeCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

/** kWh coins the driver can spend now. */
export function kwhBalance(account) {
  return Math.max(0, Math.floor(chargedKwh(done(account)) - spentKwh(account.id)));
}

/** The driver's side: the coins, each gift with what is left to save, and the gifts taken. */
function prizesFor(account) {
  const balance = kwhBalance(account);
  const items = setting('rewards.prizes').map(m => ({ kwh: m.kwh, icon: m.icon, title: m.title, left: Math.max(0, m.kwh - balance) }));
  const taken = prizesStore().filter(p => p.userId === account.id).slice(0, 30).map(p => ({ id: p.id, kwh: p.kwh, icon: p.icon, title: p.title, code: p.code, at: p.at, status: p.status }));
  return { balance, items, taken };
}

/** The driver takes a gift: its kWh are spent, a code comes back. */
export function claimPrize(account, kwh) {
  if (!feature('rewards')) return { status: 403, error: 'Награды сейчас выключены' };
  const gift = setting('rewards.prizes').find(m => m.kwh === Number(kwh));
  if (!gift) return { status: 404, error: 'Такого подарка больше нет — обновите экран' };
  const balance = kwhBalance(account);
  if (balance < gift.kwh) return { status: 400, error: `Не хватает ${(gift.kwh - balance).toLocaleString('ru-RU')} кВт·ч` };
  const prize = { id: `PR-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`, userId: account.id, kwh: gift.kwh, icon: gift.icon, title: gift.title, code: prizeCode(), at: nowIso(), status: 'ready', issuedAt: null, issuedBy: null };
  prizesStore().unshift(prize);
  db.save();
  return { prize, balance: balance - gift.kwh };
}

/** After a charge: the gifts this charge made affordable, for one notice each. */
export function newlyAffordable(account, energy) {
  if (!feature('rewards') || !(energy > 0)) return [];
  const after = kwhBalance(account);
  const before = after - energy;
  return setting('rewards.prizes').filter(m => before < m.kwh && after >= m.kwh);
}

/** For the admin: who took what, newest first, and which are still to hand over. */
export function prizesOverview() {
  return prizesStore().slice(0, 200).map(p => {
    const a = db.byId('accounts', p.userId);
    return { ...p, user: a?.name ?? p.userId, phone: a?.login ?? null };
  });
}

/** The admin hands a gift over, takes the mark back, or cancels it (the kWh go back to the driver). */
export function setPrizeStatus(id, status, actor) {
  const p = prizesStore().find(x => x.id === id);
  if (!p) return { status: 404, error: 'Подарок не найден' };
  if (!['issued', 'ready', 'cancelled'].includes(status)) return { status: 400, error: 'Статус: issued, ready или cancelled' };
  p.status = status;
  p.issuedAt = status === 'issued' ? nowIso() : null;
  p.issuedBy = status === 'ready' ? null : (actor?.name ?? 'Администратор');
  db.save();
  return { prize: p };
}

const hasTopUp = userId => (db.data.payments ?? []).some(o => o.userId === userId && o.status === 'paid');
const topupUsed = userId => (store()[userId]?.grants ?? []).filter(g => g.kind.startsWith('topup-')).length;

/**
 * The welcome bonus: a little back per kWh on a driver's first charges, and
 * only once real money has come in.
 * The driver's own charges only; not a company's, a relative's or one on credit.
 */
export function topupBonus(session) {
  const perKwh = setting('rewards.topupPerKwh');
  if (!feature('rewards') || perKwh <= 0 || session.corporate || session.familyOwner || session.credit || !(session.cost > 0)) return null;
  if (topupUsed(session.userId) >= setting('rewards.topupCharges') || !hasTopUp(session.userId)) return null;
  return grantBonus(session.userId, `topup-${session.id}`, 'Бонус за зарядку после пополнения', (session.energy ?? 0) * perKwh);
}

/** The rewards screen: the bonus and each milestone's progress. */
export function rewardsFor(account) {
  const sessions = done(account);
  const grants = store()[account.id]?.grants ?? [];
  return {
    bonus: bonusFor(account.id),
    bonusDays: BONUS_DAYS(),
    prizes: feature('rewards') || prizesStore().some(p => p.userId === account.id) ? prizesFor(account) : null,
    topup: feature('rewards') && setting('rewards.topupPerKwh') > 0 ? { perKwh: setting('rewards.topupPerKwh'), left: Math.max(0, setting('rewards.topupCharges') - topupUsed(account.id)), charges: setting('rewards.topupCharges'), toppedUp: hasTopUp(account.id) } : null,
    // A milestone switched off is hidden unless the driver already got it.
    achievements: ACHIEVEMENTS.filter(a => feature('rewards') && (enabled(a) || grants.some(g => g.kind === a.id))).map(a => {
      const g = grants.find(x => x.kind === a.id);
      const goal = goalOf(a);
      return { id: a.id, icon: a.icon, title: a.title, desc: typeof a.desc === 'function' ? a.desc(goal) : a.desc, amount: g?.amount ?? amountOf(a), goal, progress: Math.min(goal, a.progress(account, sessions)), grantedAt: g?.at ?? null };
    }),
  };
}

/** Pays up to `amount` of a charge from the bonus, soonest-to-burn first. Returns what it covered. */
export function spendBonus(userId, amount, sessionId) {
  const grants = (store()[userId]?.grants ?? []).filter(live).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  let need = Math.max(0, Math.round(amount));
  let used = 0;
  for (const g of grants) {
    if (!need) break;
    const take = Math.min(g.left, need);
    g.left -= take;
    need -= take;
    used += take;
  }
  if (used) ledger().unshift({ id: `BS-${Date.now().toString(36)}`, userId, sessionId, amount: -used, ts: nowIso(), type: 'spend' });
  return used;
}

/** For the admin: what the rewards cost this month against the budget, and the latest grants. */
export function rewardsOverview() {
  const month = nowIso().slice(0, 7);
  const all = Object.entries(store()).flatMap(([userId, b]) => b.grants.map(g => ({ ...g, userId })));
  const thisMonth = all.filter(g => g.at.startsWith(month));
  const spent = ledger().filter(l => l.type === 'spend' && l.ts.startsWith(month)).reduce((n, l) => n - l.amount, 0);
  return {
    month,
    budget: MONTH_BUDGET(),
    grantedMonth: thisMonth.reduce((n, g) => n + g.amount, 0),
    spentMonth: spent,
    outstanding: all.filter(live).reduce((n, g) => n + g.left, 0),
    byKind: Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, thisMonth.filter(g => g.kind === a.id).length])),
    recent: all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map(g => ({ ...g, user: db.byId('accounts', g.userId)?.name ?? g.userId })),
  };
}

/**
 * A bonus earned outside the milestones (the bring-a-friend programme): once
 * per kind, within the month's budget. Returns the grant, or null.
 */
export function grantBonus(userId, kind, title, amount) {
  const sum = Math.round(amount);
  const mine = (store()[userId] ??= { grants: [] });
  if (sum <= 0 || mine.grants.some(g => g.kind === kind) || monthSpend() + sum > MONTH_BUDGET()) return null;
  const at = nowIso();
  const grant = { id: `BN-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`, kind, title, amount: sum, left: sum, at, expiresAt: new Date(Date.now() + BONUS_DAYS() * DAY).toISOString() };
  mine.grants.push(grant);
  ledger().unshift({ id: grant.id, userId, kind, amount: sum, ts: at, type: 'grant' });
  db.save();
  return grant;
}

/** Support gives a driver a bonus by hand (an apology, a goodwill gesture); it counts towards the budget. */
export function grantManual(account, amount, reason) {
  const sum = Math.round(Number(amount));
  if (!account || account.portal !== 'driver') return { status: 404, error: 'Водитель не найден' };
  if (!(sum >= 1000 && sum <= 1_000_000)) return { status: 400, error: 'Сумма — от 1 000 до 1 000 000 сум' };
  const why = String(reason ?? '').trim().slice(0, 80);
  if (!why) return { status: 400, error: 'Укажите причину — её увидит водитель' };
  const at = nowIso();
  const grant = { id: `BN-${Date.now().toString(36)}-manual`, kind: `manual-${Date.now().toString(36)}`, title: why, amount: sum, left: sum, at, expiresAt: new Date(Date.now() + BONUS_DAYS() * DAY).toISOString(), manual: true };
  (store()[account.id] ??= { grants: [] }).grants.push(grant);
  ledger().unshift({ id: grant.id, userId: account.id, kind: grant.kind, amount: sum, ts: at, type: 'grant' });
  db.save();
  return { grant };
}

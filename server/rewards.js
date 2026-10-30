/**
 * Voli's own rewards: bonus money for telling us about the car and for
 * milestones along the way. Paid by Voli, not by the networks — a charge
 * paid with a bonus still earns the network its full price.
 *
 * A bonus is not money in the wallet: it pays for charging only, cannot be
 * withdrawn, and burns after BONUS_DAYS. Each reward is granted once per
 * account, and a monthly budget caps what the promotion can cost.
 */
import { db } from './db.js';
import { setting, feature } from './settings.js';

const DAY = 86_400_000;
// Amounts, goals, the budget and the bonus's life are the admin's to set (server/settings.js).
const BONUS_DAYS = () => setting('rewards.bonusDays');
const MONTH_BUDGET = () => setting('rewards.monthBudget');
const amountOf = a => (a.id === 'car' ? setting('rewards.carBonus') : setting(`rewards.${a.id}.amount`));
const goalOf = a => (a.goal > 1 ? setting(`rewards.${a.id}.goal`) : a.goal);
const enabled = a => a.id === 'car' || setting(`rewards.${a.id}.on`);

const store = () => (db.data.bonuses ??= {});
const ledger = () => (db.data.bonusLedger ??= []);
const nowIso = () => new Date().toISOString();

const done = account => db.data.sessions.filter(s => s.userId === account.id && s.status === 'completed');
const cityOf = s => db.byId('stations', s.stationId)?.city ?? null;

/** What can be earned, and how far along the driver is. */
export const ACHIEVEMENTS = [
  { id: 'car', icon: '🚗', title: 'Мой автомобиль', desc: 'Укажите марку, модель, батарею и разъём своей машины', goal: 1, progress: a => (a.car?.brand && a.car?.model && a.car?.battery && a.car?.port ? 1 : 0) },
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

/** The rewards screen: the bonus and each milestone's progress. */
export function rewardsFor(account) {
  const sessions = done(account);
  const grants = store()[account.id]?.grants ?? [];
  return {
    bonus: bonusFor(account.id),
    bonusDays: BONUS_DAYS(),
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

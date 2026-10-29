/**
 * PowerGo's own rewards: bonus money for telling us about the car and for
 * milestones along the way. Paid by PowerGo, not by the networks — a charge
 * paid with a bonus still earns the network its full price.
 *
 * A bonus is not money in the wallet: it pays for charging only, cannot be
 * withdrawn, and burns after BONUS_DAYS. Each reward is granted once per
 * account, and a monthly budget caps what the promotion can cost.
 */
import { db } from './db.js';

const DAY = 86_400_000;
export const BONUS_DAYS = Number(process.env.BONUS_DAYS ?? 60);
export const CAR_BONUS = Number(process.env.CAR_BONUS_UZS ?? 100_000);
const MONTH_BUDGET = Number(process.env.REWARDS_MONTH_BUDGET_UZS ?? 50_000_000);

const store = () => (db.data.bonuses ??= {});
const ledger = () => (db.data.bonusLedger ??= []);
const nowIso = () => new Date().toISOString();

const done = account => db.data.sessions.filter(s => s.userId === account.id && s.status === 'completed');
const cityOf = s => db.byId('stations', s.stationId)?.city ?? null;

/** What can be earned, and how far along the driver is. */
export const ACHIEVEMENTS = [
  { id: 'car', icon: '🚗', title: 'Мой автомобиль', desc: 'Укажите марку, модель, батарею и разъём своей машины', amount: CAR_BONUS, goal: 1, progress: a => (a.car?.brand && a.car?.model && a.car?.battery && a.car?.port ? 1 : 0) },
  { id: 'first', icon: '⚡', title: 'Первая зарядка', desc: 'Зарядитесь хотя бы на 5 кВт·ч', amount: 20_000, goal: 1, progress: (a, s) => (s.some(x => x.energy >= 5) ? 1 : 0) },
  { id: 'night', icon: '🌙', title: 'Ночная сова', desc: '5 зарядок по ночному тарифу, 23:00–07:00', amount: 15_000, goal: 5, progress: (a, s) => s.filter(x => x.multiplier === 0.7).length },
  { id: 'networks', icon: '🔀', title: 'Без границ', desc: 'Зарядитесь в 3 разных сетях', amount: 25_000, goal: 3, progress: (a, s) => new Set(s.map(x => x.operatorId)).size },
  { id: 'cities', icon: '🧭', title: 'Путешественник', desc: 'Зарядки в 3 разных городах', amount: 30_000, goal: 3, progress: (a, s) => new Set(s.map(cityOf).filter(Boolean)).size },
  { id: 'rater', icon: '⭐', title: 'Честный отзыв', desc: 'Оцените 5 зарядок', amount: 10_000, goal: 5, progress: (a, s) => s.filter(x => x.rating).length },
  { id: 'ten', icon: '🏅', title: 'Свой человек', desc: '10 зарядок', amount: 30_000, goal: 10, progress: (a, s) => s.length },
  { id: 'kwh500', icon: '🔋', title: '500 кВт·ч', desc: 'Наберите 500 кВт·ч — это около 2 800 км', amount: 50_000, goal: 500, progress: (a, s) => Math.floor(s.reduce((n, x) => n + (x.energy ?? 0), 0)) },
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
  if (!account || account.portal !== 'driver') return [];
  const mine = (store()[account.id] ??= { grants: [] });
  const sessions = done(account);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (mine.grants.some(g => g.kind === a.id)) continue;
    if (a.progress(account, sessions) < a.goal) continue;
    if (monthSpend() + a.amount > MONTH_BUDGET) continue;
    const at = nowIso();
    const grant = { id: `BN-${Date.now().toString(36)}-${a.id}`, kind: a.id, title: a.title, amount: a.amount, left: a.amount, at, expiresAt: new Date(Date.now() + BONUS_DAYS * DAY).toISOString() };
    mine.grants.push(grant);
    ledger().unshift({ id: grant.id, userId: account.id, kind: a.id, amount: a.amount, ts: at, type: 'grant' });
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
    bonusDays: BONUS_DAYS,
    achievements: ACHIEVEMENTS.map(a => {
      const g = grants.find(x => x.kind === a.id);
      return { id: a.id, icon: a.icon, title: a.title, desc: a.desc, amount: a.amount, goal: a.goal, progress: Math.min(a.goal, a.progress(account, sessions)), grantedAt: g?.at ?? null };
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

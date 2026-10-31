import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { verifyPasswordAsync, attempt } from './guard.js';
import { creditFor } from './credit.js';

/**
 * A driver deletes their account from the app, as Google Play and the App
 * Store require. Asked for the password, refused while something is still
 * open (a charge running, a debt, money in the wallet, which support refunds
 * first); then everything that is the person goes: name, phone, password,
 * car, face photo, push subscriptions, support chat, family and Autocharge
 * links, the referral code. What the law asks to keep for accounting —
 * charges and payments — stays, without a name on it.
 */

const DELETED = 'Удалённый пользователь';

function blockers(account) {
  const id = account.id;
  if (db.data.sessions.some(s => s.userId === id && s.status === 'active')) return 'Сначала завершите зарядку';
  if (creditFor(id).debt > 0) return 'Сначала оплатите зарядки в долг — Профиль → Зарядка в долг';
  const balance = db.data.wallets?.[id]?.balance ?? 0;
  if (balance > 0) return `На кошельке ${balance.toLocaleString('ru-RU')} сум. Напишите в поддержку — вернём деньги и удалим аккаунт`;
  return null;
}

export function deleteAccount(signedIn) {
  const id = signedIn.id;
  // The stored account, not the copy the request carries.
  const account = db.byId('accounts', id) ?? signedIn;
  const tail = crypto.randomBytes(4).toString('hex');
  Object.assign(account, {
    name: DELETED,
    login: `deleted-${tail}`,
    phone: null,
    email: null,
    avatar: '—',
    salt: crypto.randomBytes(16).toString('hex'),
    hash: crypto.randomBytes(32).toString('hex'),
    otp: null,
    twoFactor: { enabled: false, secret: null, pending: null },
    consent: null,
    status: 'deleted',
    deletedAt: new Date().toISOString(),
  });
  const d = db.data;
  d.tokens = d.tokens.filter(t => t.accountId !== id);
  d.pushSubs = (d.pushSubs ?? []).filter(s => s.accountId !== id);
  d.supportThreads = (d.supportThreads ?? []).filter(t => t.userId !== id);
  d.creditProfiles = (d.creditProfiles ?? []).filter(p => p.userId !== id);
  d.vehicles = (d.vehicles ?? []).filter(v => v.driverId !== id);
  d.families = (d.families ?? []).filter(f => f.ownerId !== id && f.memberId !== id);
  d.autocharge = (d.autocharge ?? []).filter(l => l.userId !== id);
  d.scheduledStarts = (d.scheduledStarts ?? []).filter(s => s.userId !== id);
  d.queues = (d.queues ?? []).filter(q => q.userId !== id);
  if (d.referrals) {
    delete d.referrals.codes?.[id];
    delete d.referrals.links?.[id];
  }
  if (d.wallets?.[id]) d.wallets[id].card = null;
  if (d.customers) d.customers = d.customers.filter(c => c.id !== id && c.accountId !== id);
  // Charges and payments stay for the accounts, without the person's name.
  for (const s of d.sessions) if (s.userId === id) s.user = DELETED;
  for (const t of d.transactions ?? []) if (t.userId === id && 'user' in t) t.user = DELETED;
  db.save();
}

api.post('/me/delete', requireAuth('driver'), async (req, res) => {
  const tries = attempt(`delete:${req.account.id}`, 5, 15 * 60_000);
  if (!tries.ok) return res.status(429).json({ error: 'Слишком много попыток — попробуйте через 15 минут' });
  if (!(await verifyPasswordAsync(req.account, String(req.body?.password ?? '')))) return res.status(401).json({ error: 'Пароль указан неверно' });
  const why = blockers(req.account);
  if (why) return res.status(409).json({ error: why });
  const id = req.account.id;
  deleteAccount(req.account);
  emit({ type: 'account.deleted', portal: 'driver', actor: DELETED, message: 'Водитель удалил аккаунт', entity: id });
  res.json({ ok: true });
});

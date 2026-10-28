import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * Charging on credit ("Зарядка в долг"): a driver who has enrolled their face
 * and accepted the terms may start a charge without money in the wallet; the
 * cost becomes a debt to repay within CREDIT_DAYS. Every credit start needs a
 * fresh face check, so a borrowed phone cannot run up someone else's debt.
 *
 * Face verification goes through a provider. In production that is MyID (the
 * national biometric identification service banks and nasiya services use);
 * until its contract and keys are in place the sandbox provider runs, which
 * checks that a real camera frame was taken but does not compare faces — the
 * API says so in `provider` and the app shows it.
 */

export const CREDIT_LIMIT = 300_000;
export const CREDIT_DAYS = 14;
export const CREDIT_TERMS_VERSION = '2026-10';
const FACE_TOKEN_MS = 5 * 60_000;
const MAX_IMAGE_BYTES = 400_000;
const DAY = 86400_000;

export const faceProvider = () => (process.env.FACE_PROVIDER === 'myid' ? 'myid' : 'sandbox');

const profiles = () => (db.data.creditProfiles ??= []);
const debts = () => (db.data.creditDebts ??= []);
/** One-time proofs that the account's owner just showed their face. In memory: they live five minutes. */
const faceTokens = new Map();

const profileOf = userId => profiles().find(p => p.userId === userId) ?? null;

/** A camera frame as a JPEG or PNG data URL of sensible size, or null. */
function frame(image) {
  const m = typeof image === 'string' && image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes < 2_000 || bytes > MAX_IMAGE_BYTES) return null;
  return { image, hash: crypto.createHash('sha256').update(m[2]).digest('hex') };
}

/** Asks the provider whether this frame is the enrolled person. */
function checkFace(profile, shot) {
  if (faceProvider() === 'myid') {
    // MyID needs a signed contract and client keys; refusing is honest, approving would not be.
    return { status: 503, error: 'Проверка лица через MyID ещё не подключена' };
  }
  // Sandbox: a fresh frame is required (the same picture twice is a replay), faces are not compared.
  if (shot.hash === profile.face.hash || profile.recentHashes?.includes(shot.hash)) {
    return { status: 409, error: 'Это тот же снимок — сделайте новое фото' };
  }
  return { ok: true };
}

export function creditFor(userId) {
  const p = profileOf(userId);
  const open = debts().filter(d => d.userId === userId && !d.paidAt);
  const debt = open.reduce((s, d) => s + d.amount - (d.repaid ?? 0), 0);
  const overdue = open.filter(d => Date.parse(d.dueAt) < Date.now());
  return {
    enrolled: !!p,
    status: p?.status ?? null,
    provider: faceProvider(),
    limit: p?.limit ?? CREDIT_LIMIT,
    days: CREDIT_DAYS,
    termsVersion: CREDIT_TERMS_VERSION,
    acceptedAt: p?.acceptedAt ?? null,
    faceSavedAt: p?.face.at ?? null,
    debt,
    available: p && p.status === 'active' && !overdue.length ? Math.max(0, (p.limit ?? CREDIT_LIMIT) - debt) : 0,
    overdue: overdue.length > 0,
    nextDue: open.map(d => d.dueAt).sort()[0] ?? null,
    debts: debts()
      .filter(d => d.userId === userId)
      .slice(-20)
      .reverse()
      .map(({ userId: _u, ...d }) => ({ ...d, left: d.amount - (d.repaid ?? 0) })),
  };
}

/** Saves the face and the consent. The terms version must be the current one, so the driver agreed to what they were shown. */
export function enrollCredit(account, { image, accept }) {
  if (accept !== CREDIT_TERMS_VERSION) return { status: 400, error: 'Примите условия зарядки в долг' };
  const shot = frame(image);
  if (!shot) return { status: 400, error: 'Не удалось получить фото с камеры — попробуйте ещё раз при хорошем свете' };
  if (profileOf(account.id)) return { status: 409, error: 'Лицо уже сохранено' };
  if (faceProvider() === 'myid') return { status: 503, error: 'Проверка лица через MyID ещё не подключена' };
  profiles().push({
    userId: account.id,
    user: account.name,
    phone: account.phone ?? null,
    status: 'active',
    limit: CREDIT_LIMIT,
    acceptedAt: new Date().toISOString(),
    termsVersion: CREDIT_TERMS_VERSION,
    face: { image: shot.image, hash: shot.hash, at: new Date().toISOString(), provider: faceProvider() },
    recentHashes: [],
  });
  db.save();
  return { credit: creditFor(account.id) };
}

/** Checks the face right before a credit charge and hands back a single-use token for /sessions/start. */
export function verifyFace(account, { image }) {
  const p = profileOf(account.id);
  if (!p) return { status: 404, error: 'Сначала подключите зарядку в долг' };
  const shot = frame(image);
  if (!shot) return { status: 400, error: 'Не удалось получить фото с камеры' };
  const r = checkFace(p, shot);
  if (r.error) return r;
  p.recentHashes = [...(p.recentHashes ?? []), shot.hash].slice(-20);
  p.lastVerifiedAt = new Date().toISOString();
  db.save();
  const token = crypto.randomBytes(16).toString('hex');
  faceTokens.set(token, { userId: account.id, exp: Date.now() + FACE_TOKEN_MS });
  return { faceToken: token, provider: faceProvider() };
}

/** Spends a face token; true when it belongs to this driver and is still fresh. */
export function consumeFaceToken(userId, token) {
  const t = typeof token === 'string' ? faceTokens.get(token) : null;
  if (!t) return false;
  faceTokens.delete(token);
  return t.userId === userId && t.exp > Date.now();
}

/** Can this driver start a charge on credit worth at least `minimum`? Returns an error or null. */
export function creditRefusal(userId, minimum) {
  const p = profileOf(userId);
  if (!p) return { status: 403, error: 'Зарядка в долг не подключена' };
  if (p.status !== 'active') return { status: 403, error: 'Зарядка в долг приостановлена — обратитесь в поддержку' };
  const c = creditFor(userId);
  if (c.overdue) return { status: 402, error: 'Есть просроченный долг — погасите его, чтобы снова заряжаться в долг' };
  if (c.available < minimum) return { status: 402, error: `Лимит в долг исчерпан: доступно ${c.available.toLocaleString('ru-RU')} сум` };
  return null;
}

/** The finished charge becomes a debt due in CREDIT_DAYS. */
export function recordDebt(session) {
  if (!session.cost) return null;
  const d = {
    id: `CR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId: session.userId,
    sessionId: session.id,
    station: session.stationName,
    amount: session.cost,
    repaid: 0,
    createdAt: session.end,
    dueAt: new Date(Date.parse(session.end) + CREDIT_DAYS * DAY).toISOString(),
    paidAt: null,
  };
  debts().push(d);
  return d;
}

/** Pays debts from the wallet, oldest first. Without an amount, as much as the wallet covers. */
export function repayCredit(userId, amount) {
  const wallet = db.data.wallets[userId];
  const open = debts().filter(d => d.userId === userId && !d.paidAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const owed = open.reduce((s, d) => s + d.amount - d.repaid, 0);
  if (!owed) return { status: 409, error: 'Долга нет' };
  const want = amount === undefined || amount === null ? owed : Math.round(Number(amount));
  if (!Number.isFinite(want) || want <= 0) return { status: 400, error: 'Неверная сумма' };
  let pay = Math.min(want, owed, wallet?.balance ?? 0);
  if (pay <= 0) return { status: 402, error: 'В кошельке нет денег — пополните его через Payme или Click' };
  const paid = pay;
  for (const d of open) {
    if (!pay) break;
    const part = Math.min(pay, d.amount - d.repaid);
    d.repaid += part;
    pay -= part;
    if (d.repaid >= d.amount) d.paidAt = new Date().toISOString();
  }
  wallet.balance -= paid;
  db.save();
  return { paid, credit: creditFor(userId), wallet };
}

/**
 * A refunded credit charge: what is still owed is written off, and what was
 * already repaid goes back to the wallet. Returns the amount sent to the wallet.
 */
export function refundDebt(sessionId) {
  const d = debts().find(x => x.sessionId === sessionId);
  if (!d) return null;
  const back = d.repaid;
  d.amount = d.repaid;
  d.paidAt ??= new Date().toISOString();
  d.refunded = true;
  if (back > 0) (db.data.wallets[d.userId] ??= { balance: 0, currency: 'UZS', autoTopUp: false, threshold: 0, card: null }).balance += back;
  return back;
}

/** Removes the face and the consent. Only with nothing owed: the face is what the debt was taken on. */
export function deleteCredit(userId) {
  const c = creditFor(userId);
  if (!c.enrolled) return { status: 404, error: 'Данных нет' };
  if (c.debt > 0) return { status: 409, error: 'Сначала погасите долг — после этого фото удалится' };
  db.data.creditProfiles = profiles().filter(p => p.userId !== userId);
  db.save();
  return { credit: creditFor(userId) };
}

/** For the admin: who borrows, how much, what is overdue. Never the photo itself. */
export function creditOverview() {
  const rows = profiles().map(p => {
    const c = creditFor(p.userId);
    return {
      userId: p.userId, user: p.user, phone: p.phone, status: p.status, limit: p.limit,
      acceptedAt: p.acceptedAt, faceSavedAt: p.face.at, provider: p.face.provider, lastVerifiedAt: p.lastVerifiedAt ?? null,
      debt: c.debt, overdue: c.overdue, nextDue: c.nextDue, charges: debts().filter(d => d.userId === p.userId).length,
    };
  });
  return {
    rows,
    totals: {
      drivers: rows.length,
      debt: rows.reduce((s, r) => s + r.debt, 0),
      overdue: rows.filter(r => r.overdue).reduce((s, r) => s + r.debt, 0),
      overdueDrivers: rows.filter(r => r.overdue).length,
    },
    limit: CREDIT_LIMIT,
    days: CREDIT_DAYS,
    provider: faceProvider(),
  };
}

/** Admin: pause or resume a driver's credit, or change their limit. */
export function updateCreditProfile(userId, { status, limit }) {
  const p = profileOf(userId);
  if (!p) return { status: 404, error: 'Профиль не найден' };
  if (status !== undefined) {
    if (!['active', 'paused'].includes(status)) return { status: 400, error: 'Неверный статус' };
    p.status = status;
  }
  if (limit !== undefined) {
    const n = Math.round(Number(limit));
    if (!Number.isFinite(n) || n < 0 || n > 5_000_000) return { status: 400, error: 'Лимит от 0 до 5 000 000 сум' };
    p.limit = n;
  }
  db.save();
  return { ok: true };
}

import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { tokenOf } from './session.js';
import { emit } from './api.js';
import { setting } from './settings.js';
import { alertTeam } from './alerts.js';

/**
 * Top-ups through Paynet: the driver opens the Paynet app or a Paynet
 * terminal, picks Voli and types the number of their Voli account; Paynet
 * then calls us. Voli is a "service provider" to Paynet: there is no order
 * made in our app beforehand, the driver's account number is the whole link.
 *
 * The protocol is Paynet's provider API as open-source integrations describe
 * it: JSON-RPC 2.0 over HTTPS with HTTP Basic auth (a login and a password we
 * give Paynet), amounts in tiyin, the methods GetInformation (does this
 * account exist), PerformTransaction (credit it), CheckTransaction,
 * CancelTransaction and GetStatement (the day's list, for reconciliation).
 * The error codes below follow the same descriptions; when Paynet sends its
 * own document, check them against it before going live.
 *
 * Settings (Render → Environment): PAYNET_LOGIN, PAYNET_PASSWORD, and
 * PAYNET_SERVICE_ID once Paynet assigns one. Without them Paynet is off.
 */

const LOGIN = () => process.env.PAYNET_LOGIN || '';
const PASSWORD = () => process.env.PAYNET_PASSWORD || '';
const SERVICE_ID = () => process.env.PAYNET_SERVICE_ID || '';
export const paynetConfigured = () => Boolean(LOGIN() && PASSWORD());

const ERR = {
  system: [-32603, 'Системная ошибка'],
  method: [-32601, 'Метод не найден'],
  params: [411, 'Не заданы один или несколько обязательных параметров'],
  login: [412, 'Неверный логин'],
  amount: [413, 'Неверная сумма'],
  client: [302, 'Клиент не найден'],
  exists: [201, 'Транзакция уже существует'],
  cancelled: [202, 'Транзакция уже отменена'],
  notFound: [203, 'Транзакция не найдена'],
  service: [305, 'Услуга не найдена'],
  noFunds: [77, 'Недостаточно средств на счету клиента для отмены платежа'],
};

const orders = () => (db.data.payments ??= []);
const stamp = (ms = Date.now()) => new Date(ms + 5 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);

/** Each driver's account number for Paynet: eight digits, made once. */
export function accountNumber(account) {
  if (account.payNo) return account.payNo;
  const taken = new Set(db.data.accounts.map(a => a.payNo).filter(Boolean));
  let n;
  do n = String(10_000_000 + crypto.randomInt(89_999_999)); while (taken.has(n));
  account.payNo = n;
  db.save();
  return n;
}

/** The account a Paynet payment is for: its Voli number, or the driver's phone. */
function accountFor(raw) {
  const v = String(raw ?? '').replace(/\D/g, '');
  if (!v) return null;
  const phone = v.length === 9 ? `998${v}` : v;
  return db.data.accounts.find(a => a.portal === 'driver' && (a.payNo === v || String(a.login ?? '').replace(/\D/g, '') === phone)) ?? null;
}

function authorized(req) {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? '');
  if (!m || !paynetConfigured()) return false;
  const [user, ...rest] = Buffer.from(m[1], 'base64').toString('utf8').split(':');
  const a = Buffer.from(`${user}:${rest.join(':')}`);
  const b = Buffer.from(`${LOGIN()}:${PASSWORD()}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const fail = (id, [code, message]) => ({ jsonrpc: '2.0', id, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const nextTrnId = () => (db.data.paynetSeq = (db.data.paynetSeq ?? 100000) + 1);
const byPaynetId = id => orders().find(o => o.provider === 'paynet' && o.paynet?.transactionId === String(id)) ?? null;

const METHODS = {
  GetInformation(p) {
    const account = accountFor(p.fields?.client_id ?? p.fields?.clientid ?? p.fields?.account);
    if (!account) return ERR.client;
    const wallet = db.data.wallets[account.id];
    // A name the payer can recognise, but not the whole of it.
    const [first = '', last = ''] = String(account.name ?? '').split(' ');
    return { status: '0', timestamp: stamp(), fields: { name: `${first} ${last ? last[0] + '.' : ''}`.trim(), balance: Math.round((wallet?.balance ?? 0) * 100) } };
  },

  PerformTransaction(p) {
    if (!p.transactionId || !p.amount) return ERR.params;
    if (byPaynetId(p.transactionId)) return ERR.exists;
    const account = accountFor(p.fields?.client_id ?? p.fields?.clientid ?? p.fields?.account);
    if (!account) return ERR.client;
    const amount = Number(p.amount) / 100;
    if (!Number.isInteger(amount) || amount < setting('topup.min') || amount > setting('topup.max')) return ERR.amount;
    const wallet = db.data.wallets[account.id];
    if (!wallet) return ERR.client;
    const providerTrnId = nextTrnId();
    wallet.balance += amount;
    const order = {
      id: `PAY-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      provider: 'paynet',
      userId: account.id,
      walletId: account.id,
      amount,
      status: 'paid',
      created: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      paynet: { transactionId: String(p.transactionId), providerTrnId, time: p.transactionTime ?? null },
    };
    orders().unshift(order);
    db.save();
    emit({
      type: 'wallet.topup',
      portal: 'system',
      actor: 'Paynet',
      message: `Пополнение через Paynet · +${amount.toLocaleString('ru-RU')} сум`,
      entity: account.id,
      payload: { amount, balance: wallet.balance, provider: 'paynet', orderId: order.id },
    });
    return { timestamp: stamp(), providerTrnId, fields: { client_id: accountNumber(account) } };
  },

  CheckTransaction(p) {
    const o = byPaynetId(p.transactionId);
    if (!o) return { transactionState: 3, timestamp: stamp(), providerTrnId: 0 };
    return { transactionState: o.status === 'cancelled' ? 2 : 1, timestamp: stamp(Date.parse(o.paidAt)), providerTrnId: o.paynet.providerTrnId };
  },

  CancelTransaction(p) {
    const o = byPaynetId(p.transactionId);
    if (!o) return ERR.notFound;
    if (o.status === 'cancelled') return ERR.cancelled;
    const wallet = db.data.wallets[o.walletId];
    // Money already spent on charging cannot be taken back from the balance.
    if (!wallet || wallet.balance < o.amount) return ERR.noFunds;
    wallet.balance -= o.amount;
    o.status = 'cancelled';
    o.cancelledAt = new Date().toISOString();
    db.save();
    emit({ type: 'wallet.refund', portal: 'system', actor: 'Paynet', message: `Paynet отменил пополнение · −${o.amount.toLocaleString('ru-RU')} сум`, entity: o.walletId, payload: { userId: o.userId } });
    return { providerTrnId: o.paynet.providerTrnId, timestamp: stamp(), transactionState: 2 };
  },

  GetStatement(p) {
    const from = Date.parse(String(p.dateFrom ?? '').replace(' ', 'T') + '+05:00');
    const to = Date.parse(String(p.dateTo ?? '').replace(' ', 'T') + '+05:00');
    if (!Number.isFinite(from) || !Number.isFinite(to)) return ERR.params;
    const statements = orders()
      .filter(o => o.provider === 'paynet' && o.status === 'paid' && Date.parse(o.paidAt) >= from && Date.parse(o.paidAt) <= to)
      .map(o => ({ amount: o.amount * 100, providerTrnId: o.paynet.providerTrnId, transactionId: o.paynet.transactionId, timestamp: stamp(Date.parse(o.paidAt)) }));
    return { statements };
  },
};

export const paynetApi = express.Router();
paynetApi.use(express.json());

/** Paynet's calls. */
paynetApi.post('/', (req, res) => {
  const { id = null, method, params = {} } = req.body ?? {};
  if (!authorized(req)) {
    if (paynetConfigured()) void alertTeam('pay-sign:paynet', 'Платёж: запрос с неверной подписью', [['Система', 'Paynet']]);
    return res.json(fail(id, ERR.login));
  }
  if (!setting('payments.paynet')) return res.json(fail(id, ERR.service));
  if (SERVICE_ID() && params.serviceId != null && String(params.serviceId) !== SERVICE_ID()) return res.json(fail(id, ERR.service));
  const run = METHODS[method];
  if (!run) return res.json(fail(id, ERR.method));
  try {
    const out = run(params);
    res.json(Array.isArray(out) ? fail(id, out) : ok(id, out));
  } catch (err) {
    console.warn('[paynet]', err.message);
    res.json(fail(id, ERR.system));
  }
});

/** The driver's own number to type in Paynet, for the wallet screen. */
paynetApi.get('/account', (req, res) => {
  const account = db.resolveToken(tokenOf(req))?.account;
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  if (account.portal !== 'driver') return res.status(403).json({ error: 'Нет доступа к этому порталу' });
  res.json({ number: accountNumber(account), on: paynetConfigured() && setting('payments.paynet') });
});

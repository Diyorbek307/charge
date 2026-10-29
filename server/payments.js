import crypto from 'node:crypto';
import { setting } from './settings.js';
import express from 'express';
import { db } from './db.js';
import { emit } from './api.js';
import { isDirect, creditNetwork, reverseTopUp, netBalance } from './direct.js';

/**
 * Wallet top-ups through Payme and Click, Uzbekistan's two main payment rails.
 *
 * Both implementations follow the providers' merchant protocols as published:
 *   - Payme Merchant API: JSON-RPC 2.0, HTTP Basic "Paycom:<key>", amounts in
 *     tiyin, transaction states 1 / 2 / -1 / -2, 12-hour creation timeout.
 *   - Click SHOP API: Prepare (action 0) then Complete (action 1), each signed
 *     with an MD5 of the request fields and the merchant secret.
 *
 * A partner network paid directly has its own Payme cashbox / Click service:
 * its callbacks come to /payme/<operatorId> and /click/<operatorId>/…, are
 * checked with that network's key, and credit the driver's balance at that
 * network — the money itself goes to the network (server/direct.js).
 *
 * A wallet is credited only when the provider confirms the payment in a signed
 * callback. With no merchant keys configured, demo sandbox credentials are
 * used and a sandbox endpoint drives the very same callback logic, so the
 * integration is exercised end to end before a merchant account exists.
 */

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://charge-qogf.onrender.com').replace(/\/$/, '');

const PAYME = {
  merchantId: process.env.PAYME_MERCHANT_ID || (DEMO_MODE ? 'demo-merchant' : ''),
  key: process.env.PAYME_KEY || (DEMO_MODE ? 'demo-payme-key' : ''),
  checkout: process.env.PAYME_TEST === 'false' ? 'https://checkout.paycom.uz' : 'https://checkout.test.paycom.uz',
  live: Boolean(process.env.PAYME_KEY),
};

const CLICK = {
  serviceId: process.env.CLICK_SERVICE_ID || (DEMO_MODE ? '10001' : ''),
  merchantId: process.env.CLICK_MERCHANT_ID || (DEMO_MODE ? '20001' : ''),
  secret: process.env.CLICK_SECRET_KEY || (DEMO_MODE ? 'demo-click-secret' : ''),
  live: Boolean(process.env.CLICK_SECRET_KEY),
};

/**
 * Uzum Bank and Humo: card acquiring with a signed notification of payment.
 * The checkout link and the callback follow one scheme — HMAC-SHA256 over
 * "order|amount|status|transaction" with the merchant's secret; once a
 * contract is signed, the fields are matched to the acquirer's spec here.
 * Without keys the sandbox drives the same signed callback.
 */
const ACQUIRERS = {
  uzum: {
    name: 'Uzum',
    merchantId: process.env.UZUM_MERCHANT_ID || (DEMO_MODE ? 'demo-uzum' : ''),
    secret: process.env.UZUM_SECRET || (DEMO_MODE ? 'demo-uzum-secret' : ''),
    checkout: process.env.UZUM_CHECKOUT_URL || 'https://www.uzumbank.uz/open-service',
    live: Boolean(process.env.UZUM_SECRET),
  },
  humo: {
    name: 'Humo',
    merchantId: process.env.HUMO_MERCHANT_ID || (DEMO_MODE ? 'demo-humo' : ''),
    secret: process.env.HUMO_SECRET || (DEMO_MODE ? 'demo-humo-secret' : ''),
    checkout: process.env.HUMO_CHECKOUT_URL || 'https://pay.humo.uz/checkout',
    live: Boolean(process.env.HUMO_SECRET),
  },
};
const PROVIDER_NAME = { payme: 'Payme', click: 'Click', uzum: 'Uzum', humo: 'Humo' };
export function acquirerSign(provider, f) {
  return crypto.createHmac('sha256', ACQUIRERS[provider].secret).update(`${f.order_id}|${f.amount}|${f.status}|${f.transaction_id}`).digest('hex');
}

/** Whose cashbox takes the money: ours, or a partner network's. */
function merchantFor(operatorId) {
  if (!operatorId) return { payme: PAYME, click: CLICK, sandbox: !PAYME.live && !CLICK.live };
  const op = db.byId('operators', operatorId);
  if (!isDirect(op)) return null;
  const sandbox = !!op.payout.sandbox;
  return {
    operator: op,
    sandbox,
    payme: op.payout.payme ? { merchantId: op.payout.payme.merchantId, key: op.payout.payme.key, checkout: PAYME.checkout, live: !sandbox } : { key: '' },
    click: op.payout.click ? { serviceId: op.payout.click.serviceId, merchantId: op.payout.click.merchantId, secret: op.payout.click.secret, live: !sandbox } : { secret: '' },
  };
}
const sameMerchant = (order, operatorId) => (order.operatorId ?? null) === (operatorId ?? null);

// Limits and which providers are on: the admin's (server/settings.js).
const MIN_TOPUP_NOW = () => setting('topup.min');
const MAX_TOPUP_NOW = () => setting('topup.max');
const MAX_PENDING_PER_USER = 5;
const ORDER_TTL_MS = 24 * 60 * 60_000;
const PAYME_TIMEOUT_MS = 12 * 60 * 60_000;

export const paymentsApi = express.Router();
paymentsApi.use(express.json());
// Click posts its callbacks as a classic HTML form.
paymentsApi.use(express.urlencoded({ extended: false }));

const orders = () => (db.data.payments ??= []);
const findOrder = id => orders().find(o => o.id === id) ?? null;

function viewerOf(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? (db.resolveToken(header.slice(7))?.account ?? null) : null;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Pending orders nobody paid for within a day stop being payable. */
function expireStale() {
  const now = Date.now();
  for (const o of orders()) {
    if (o.status === 'pending' && !o.payme?.id && !o.click && now - new Date(o.created).getTime() > ORDER_TTL_MS) {
      o.status = 'expired';
    }
  }
}

function credit(order, provider) {
  if (order.operatorId) {
    // Paid into the network's own cashbox: the driver's balance at that network grows.
    const balance = creditNetwork(order, provider);
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    db.save();
    const name = db.byId('operators', order.operatorId)?.name ?? order.operatorId;
    emit({
      type: 'wallet.topup',
      portal: 'system',
      actor: PROVIDER_NAME[provider],
      message: `Пополнение баланса сети ${name} через ${PROVIDER_NAME[provider]} · +${order.amount.toLocaleString('ru-RU')} сум — деньги поступили сети`,
      entity: order.userId,
      payload: { amount: order.amount, balance, provider, orderId: order.id, operatorId: order.operatorId, userId: order.userId },
    });
    return;
  }
  const wallet = db.data.wallets[order.walletId];
  if (!wallet) throw new Error('wallet missing');
  wallet.balance += order.amount;
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  db.save();
  emit({
    type: 'wallet.topup',
    portal: 'system',
    actor: PROVIDER_NAME[provider],
    message: `Пополнение через ${PROVIDER_NAME[provider]} · +${order.amount.toLocaleString('ru-RU')} сум`,
    entity: order.walletId,
    payload: { amount: order.amount, balance: wallet.balance, provider, orderId: order.id },
  });
}

function checkoutUrl(order) {
  const back = `${PUBLIC_URL}/?portal=driver`;
  const m = merchantFor(order.operatorId);
  if (ACQUIRERS[order.provider]) {
    const a = ACQUIRERS[order.provider];
    const sign = crypto.createHmac('sha256', a.secret).update(`${a.merchantId}|${order.id}|${order.amount}`).digest('hex');
    const q = new URLSearchParams({ merchant: a.merchantId, order_id: order.id, amount: String(order.amount), return_url: back, sign });
    return `${a.checkout}?${q}`;
  }
  if (order.provider === 'payme') {
    const params = `m=${m.payme.merchantId};ac.order_id=${order.id};a=${order.amount * 100};c=${back}`;
    return `${PAYME.checkout}/${Buffer.from(params).toString('base64')}`;
  }
  const q = new URLSearchParams({
    service_id: m.click.serviceId,
    merchant_id: m.click.merchantId,
    amount: String(order.amount),
    transaction_param: order.id,
    return_url: back,
  });
  return `https://my.click.uz/services/pay?${q}`;
}

const publicOrder = o => ({
  id: o.id,
  provider: o.provider,
  amount: o.amount,
  status: o.status,
  created: o.created,
  paidAt: o.paidAt ?? null,
  operatorId: o.operatorId ?? null,
});

// ---------------------------------------------------------------------------
// App-facing endpoints
// ---------------------------------------------------------------------------

paymentsApi.get('/providers', (_req, res) => {
  res.json([
    { id: 'payme', name: 'Payme', configured: Boolean(PAYME.key), live: PAYME.live },
    { id: 'click', name: 'Click', configured: Boolean(CLICK.secret), live: CLICK.live },
    ...Object.entries(ACQUIRERS).map(([id, a]) => ({ id, name: a.name, configured: Boolean(a.secret), live: a.live })),
  ].map(p => ({ ...p, enabled: setting(`payments.${p.id}`) })));
});

paymentsApi.post('/topup', (req, res) => {
  const account = viewerOf(req);
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  if (!['driver', 'business'].includes(account.portal)) return res.status(403).json({ error: 'Нет доступа к этому порталу' });

  const provider = req.body?.provider;
  if (!['payme', 'click', 'uzum', 'humo'].includes(provider)) return res.status(400).json({ error: 'Выберите Payme, Click, Uzum или Humo' });
  if (!setting(`payments.${provider}`)) return res.status(503).json({ error: `${PROVIDER_NAME[provider]} сейчас отключён — выберите другой способ` });
  const MIN_TOPUP = MIN_TOPUP_NOW();
  const MAX_TOPUP = MAX_TOPUP_NOW();
  // A network paid directly: the money goes to its own cashbox.
  const operatorId = req.body?.operatorId ? String(req.body.operatorId) : null;
  if (operatorId && ACQUIRERS[provider]) return res.status(400).json({ error: 'Баланс сети пополняется через Payme или Click' });
  if (operatorId && account.portal !== 'driver') return res.status(403).json({ error: 'Баланс сети пополняет водитель' });
  const merchant = merchantFor(operatorId);
  if (!merchant) return res.status(404).json({ error: 'Эта сеть не принимает оплату напрямую' });
  if (!(ACQUIRERS[provider] ? ACQUIRERS[provider].secret : provider === 'payme' ? merchant.payme.key : merchant.click.secret)) {
    return res.status(503).json({ error: operatorId ? `${merchant.operator.name} не подключила ${provider === 'payme' ? 'Payme' : 'Click'} — выберите другой способ` : 'Платёжный провайдер не настроен' });
  }
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return res.status(400).json({ error: `Сумма — целое число от ${MIN_TOPUP.toLocaleString('ru-RU')} до ${MAX_TOPUP.toLocaleString('ru-RU')} сум` });
  }

  expireStale();
  const walletId = account.portal === 'business' ? 'biz-001' : account.id;
  if (!db.data.wallets[walletId]) return res.status(404).json({ error: 'Кошелёк не найден' });
  if (orders().filter(o => o.userId === account.id && o.status === 'pending').length >= MAX_PENDING_PER_USER) {
    return res.status(429).json({ error: 'Слишком много неоплаченных счетов — оплатите или подождите' });
  }

  const order = {
    id: `PAY-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
    provider,
    userId: account.id,
    walletId,
    ...(operatorId ? { operatorId } : {}),
    amount,
    status: 'pending',
    created: new Date().toISOString(),
    paidAt: null,
    payme: null,
    click: null,
  };
  orders().unshift(order);
  if (orders().length > 3000) orders().length = 3000;
  db.save();

  const live = ACQUIRERS[provider] ? ACQUIRERS[provider].live : provider === 'payme' ? merchant.payme.live : merchant.click.live;
  res.json({ order: publicOrder(order), checkoutUrl: checkoutUrl(order), sandbox: !live });
});

paymentsApi.get('/', (req, res) => {
  const account = viewerOf(req);
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  expireStale();
  res.json(orders().filter(o => o.userId === account.id).slice(0, 20).map(publicOrder));
});

paymentsApi.get('/order/:id', (req, res) => {
  const account = viewerOf(req);
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  const order = findOrder(req.params.id);
  // Someone else's order is indistinguishable from a missing one.
  if (!order || (order.userId !== account.id && account.portal !== 'admin')) {
    return res.status(404).json({ error: 'Счёт не найден' });
  }
  res.json(publicOrder(order));
});

// ---------------------------------------------------------------------------
// Payme Merchant API
// ---------------------------------------------------------------------------

class PaymeError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const paymeMessage = (ru, en = ru, uz = ru) => ({ ru, uz, en });

function paymeOrderFor(account, operatorId) {
  const order = findOrder(String(account?.order_id ?? ''));
  if (!order || order.provider !== 'payme' || !sameMerchant(order, operatorId)) {
    throw new PaymeError(-31050, paymeMessage('Заказ не найден', 'Order not found', 'Buyurtma topilmadi'), 'order_id');
  }
  return order;
}

function paymeTransaction(id, operatorId) {
  const order = orders().find(o => o.payme?.id === id && sameMerchant(o, operatorId));
  if (!order) throw new PaymeError(-31003, paymeMessage('Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi'));
  return order;
}

function paymeTimedOut(order) {
  return Date.now() - order.payme.createTime > PAYME_TIMEOUT_MS;
}

function paymeCancel(order, state, reason) {
  order.payme.state = state;
  order.payme.cancelTime = Date.now();
  order.payme.reason = reason;
  order.status = 'cancelled';
  db.save();
}

const paymeView = order => ({
  create_time: order.payme.createTime,
  perform_time: order.payme.performTime,
  cancel_time: order.payme.cancelTime,
  transaction: order.payme.id,
  state: order.payme.state,
  reason: order.payme.reason,
});

export function paymeRpc(method, params = {}, operatorId = null) {
  switch (method) {
    case 'CheckPerformTransaction': {
      const order = paymeOrderFor(params.account, operatorId);
      if (order.status !== 'pending') {
        throw new PaymeError(-31051, paymeMessage('Заказ уже оплачен или отменён', 'Order is not payable'), 'order_id');
      }
      if (Number(params.amount) !== order.amount * 100) {
        throw new PaymeError(-31001, paymeMessage('Неверная сумма', 'Incorrect amount', 'Noto‘g‘ri summa'));
      }
      return { allow: true };
    }

    case 'CreateTransaction': {
      const existing = orders().find(o => o.payme?.id === params.id && sameMerchant(o, operatorId));
      if (existing) {
        if (existing.payme.state !== 1) {
          throw new PaymeError(-31008, paymeMessage('Невозможно выполнить операцию', 'Unable to perform operation'));
        }
        if (paymeTimedOut(existing)) {
          paymeCancel(existing, -1, 4);
          throw new PaymeError(-31008, paymeMessage('Транзакция просрочена', 'Transaction timed out'));
        }
        return { create_time: existing.payme.createTime, transaction: existing.payme.id, state: 1 };
      }

      paymeRpc('CheckPerformTransaction', params, operatorId);
      const order = paymeOrderFor(params.account, operatorId);
      // One order, one Payme transaction: a second attempt means the order is busy.
      if (order.payme?.id) {
        throw new PaymeError(-31050, paymeMessage('По заказу уже есть транзакция', 'Order already has a transaction'), 'order_id');
      }
      order.payme = { id: String(params.id), time: Number(params.time), createTime: Date.now(), performTime: 0, cancelTime: 0, state: 1, reason: null };
      db.save();
      return { create_time: order.payme.createTime, transaction: order.payme.id, state: 1 };
    }

    case 'PerformTransaction': {
      const order = paymeTransaction(String(params.id), operatorId);
      if (order.payme.state === 2) {
        return { transaction: order.payme.id, perform_time: order.payme.performTime, state: 2 };
      }
      if (order.payme.state !== 1) {
        throw new PaymeError(-31008, paymeMessage('Транзакция отменена', 'Transaction cancelled'));
      }
      if (paymeTimedOut(order)) {
        paymeCancel(order, -1, 4);
        throw new PaymeError(-31008, paymeMessage('Транзакция просрочена', 'Transaction timed out'));
      }
      order.payme.state = 2;
      order.payme.performTime = Date.now();
      credit(order, 'payme');
      return { transaction: order.payme.id, perform_time: order.payme.performTime, state: 2 };
    }

    case 'CancelTransaction': {
      const order = paymeTransaction(String(params.id), operatorId);
      if (order.payme.state === 1) {
        paymeCancel(order, -1, Number(params.reason) || null);
      } else if (order.payme.state === 2 && order.operatorId) {
        // A network's top-up comes back only while it is unspent.
        if (!reverseTopUp(order)) throw new PaymeError(-31007, paymeMessage('Средства уже израсходованы', 'Funds already spent'));
        paymeCancel(order, -2, Number(params.reason) || null);
      } else if (order.payme.state === 2) {
        // Refund only what is still in the wallet; money already spent on
        // charging cannot be clawed back automatically.
        const wallet = db.data.wallets[order.walletId];
        if (!wallet || wallet.balance < order.amount) {
          throw new PaymeError(-31007, paymeMessage('Средства уже израсходованы', 'Funds already spent'));
        }
        wallet.balance -= order.amount;
        paymeCancel(order, -2, Number(params.reason) || null);
        emit({
          type: 'wallet.adjust',
          portal: 'system',
          actor: 'Payme',
          message: `Возврат платежа Payme · −${order.amount.toLocaleString('ru-RU')} сум`,
          entity: order.walletId,
          payload: { amount: -order.amount, balance: wallet.balance, orderId: order.id },
        });
      }
      return { transaction: order.payme.id, cancel_time: order.payme.cancelTime, state: order.payme.state };
    }

    case 'CheckTransaction':
      return paymeView(paymeTransaction(String(params.id), operatorId));

    case 'GetStatement': {
      const from = Number(params.from);
      const to = Number(params.to);
      return {
        transactions: orders()
          .filter(o => o.payme && sameMerchant(o, operatorId) && o.payme.createTime >= from && o.payme.createTime <= to)
          .map(o => ({ id: o.payme.id, time: o.payme.time, amount: o.amount * 100, account: { order_id: o.id }, ...paymeView(o) })),
      };
    }

    default:
      throw new PaymeError(-32601, paymeMessage('Метод не найден', 'Method not found'), method);
  }
}

/** Our cashbox at /payme; a partner network's cashbox at /payme/<operatorId>, checked with its own key. */
function paymeEndpoint(req, res) {
  const id = req.body?.id ?? null;
  const reply = body => res.json({ jsonrpc: '2.0', id, ...body });

  const operatorId = req.params.operatorId ?? null;
  const key = merchantFor(operatorId)?.payme.key ?? '';
  const header = req.get('authorization') || '';
  const expected = `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`;
  if (!key || !safeEqual(header, expected)) {
    return reply({ error: { code: -32504, message: paymeMessage('Недостаточно прав', 'Insufficient privileges') } });
  }
  try {
    reply({ result: paymeRpc(req.body?.method, req.body?.params, operatorId) });
  } catch (err) {
    if (!(err instanceof PaymeError)) {
      console.error('[payme]', err);
      return reply({ error: { code: -32400, message: paymeMessage('Системная ошибка', 'System error') } });
    }
    reply({ error: { code: err.code, message: err.message && typeof err.message === 'object' ? err.message : err.message, data: err.data } });
  }
}
paymentsApi.post('/payme', paymeEndpoint);
paymentsApi.post('/payme/:operatorId', paymeEndpoint);

// PaymeError carries a localized message object; keep it intact on the wire.
PaymeError.prototype.toJSON = function toJSON() {
  return { code: this.code, message: this.message, data: this.data };
};

// ---------------------------------------------------------------------------
// Click SHOP API
// ---------------------------------------------------------------------------

export function clickSign(f, withPrepare, secret = CLICK.secret) {
  const parts = [f.click_trans_id, f.service_id, secret, f.merchant_trans_id];
  if (withPrepare) parts.push(f.merchant_prepare_id);
  parts.push(f.amount, f.action, f.sign_time);
  return crypto.createHash('md5').update(parts.map(v => String(v ?? '')).join('')).digest('hex');
}

const clickReply = (f, error, note, extra = {}) => ({
  click_trans_id: f.click_trans_id,
  merchant_trans_id: f.merchant_trans_id,
  ...extra,
  error,
  error_note: note,
});

function clickCommon(f, action, withPrepare, operatorId) {
  const click = merchantFor(operatorId)?.click ?? { secret: '' };
  if (!click.secret || !safeEqual(String(f.sign_string ?? ''), clickSign(f, withPrepare, click.secret))) {
    return { fail: clickReply(f, -1, 'SIGN CHECK FAILED') };
  }
  if (String(f.service_id) !== String(click.serviceId)) return { fail: clickReply(f, -8, 'Error in request from click') };
  if (String(f.action) !== action) return { fail: clickReply(f, -3, 'Action not found') };
  const order = findOrder(String(f.merchant_trans_id ?? ''));
  if (!order || order.provider !== 'click' || !sameMerchant(order, operatorId)) return { fail: clickReply(f, -5, 'User does not exist') };
  if (order.status === 'paid') return { fail: clickReply(f, -4, 'Already paid') };
  if (order.status !== 'pending') return { fail: clickReply(f, -9, 'Transaction cancelled') };
  if (Math.abs(Number(f.amount) - order.amount) > 0.001) return { fail: clickReply(f, -2, 'Incorrect parameter amount') };
  return { order };
}

export function clickPrepare(f, operatorId = null) {
  const { fail, order } = clickCommon(f, '0', false, operatorId);
  if (fail) return fail;
  if (!order.click) {
    db.data.counters.clickPrepare = (db.data.counters.clickPrepare ?? 0) + 1;
    order.click = { prepareId: db.data.counters.clickPrepare, clickTransId: String(f.click_trans_id) };
    db.save();
  }
  return clickReply(f, 0, 'Success', { merchant_prepare_id: order.click.prepareId });
}

export function clickComplete(f, operatorId = null) {
  const { fail, order } = clickCommon(f, '1', true, operatorId);
  if (fail) return fail;
  if (!order.click || String(order.click.prepareId) !== String(f.merchant_prepare_id)) {
    return clickReply(f, -6, 'Transaction does not exist');
  }
  // Click reports its own failure in `error`; the order is then void.
  if (Number(f.error) < 0) {
    order.status = 'cancelled';
    db.save();
    return clickReply(f, -9, 'Transaction cancelled');
  }
  credit(order, 'click');
  return clickReply(f, 0, 'Success', { merchant_confirm_id: order.click.prepareId });
}

paymentsApi.post('/click/prepare', (req, res) => res.json(clickPrepare(req.body ?? {})));
paymentsApi.post('/click/complete', (req, res) => res.json(clickComplete(req.body ?? {})));
paymentsApi.post('/click/:operatorId/prepare', (req, res) => res.json(clickPrepare(req.body ?? {}, req.params.operatorId)));
paymentsApi.post('/click/:operatorId/complete', (req, res) => res.json(clickComplete(req.body ?? {}, req.params.operatorId)));

// ---------------------------------------------------------------------------
// Uzum and Humo: the acquirer tells us a payment went through, signed.
// ---------------------------------------------------------------------------

export function acquirerNotify(provider, f) {
  const a = ACQUIRERS[provider];
  if (!a?.secret || !safeEqual(String(f.sign ?? ''), acquirerSign(provider, f))) return { status: 401, body: { ok: false, error: 'SIGN CHECK FAILED' } };
  const order = findOrder(String(f.order_id ?? ''));
  if (!order || order.provider !== provider) return { status: 404, body: { ok: false, error: 'ORDER NOT FOUND' } };
  if (Math.abs(Number(f.amount) - order.amount) > 0.001) return { status: 400, body: { ok: false, error: 'AMOUNT MISMATCH' } };
  // Notifications repeat: the second "paid" is answered, not credited again.
  if (order.status === 'paid') return { status: 200, body: { ok: true, already: true } };
  if (order.status !== 'pending') return { status: 409, body: { ok: false, error: 'ORDER CLOSED' } };
  order.acquirer = { transactionId: String(f.transaction_id ?? ''), at: new Date().toISOString() };
  if (f.status !== 'paid') {
    order.status = 'cancelled';
    db.save();
    return { status: 200, body: { ok: true, cancelled: true } };
  }
  credit(order, provider);
  return { status: 200, body: { ok: true } };
}
paymentsApi.post('/:provider(uzum|humo)/notify', (req, res) => {
  const r = acquirerNotify(req.params.provider, req.body ?? {});
  res.status(r.status).json(r.body);
});

// ---------------------------------------------------------------------------
// Sandbox: drives the real callback logic when no merchant account exists.
// ---------------------------------------------------------------------------

paymentsApi.post('/order/:id/sandbox-confirm', (req, res) => {
  const account = viewerOf(req);
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  const order = findOrder(req.params.id);
  if (!order || order.userId !== account.id) return res.status(404).json({ error: 'Счёт не найден' });
  const merchant = merchantFor(order.operatorId);
  const live = ACQUIRERS[order.provider] ? ACQUIRERS[order.provider].live : !merchant || (order.provider === 'payme' ? merchant.payme.live : merchant.click.live);
  if (!DEMO_MODE || live) return res.status(404).json({ error: 'Песочница отключена' });
  const op = order.operatorId ?? null;

  try {
    if (ACQUIRERS[order.provider]) {
      const f = { order_id: order.id, amount: String(order.amount), status: 'paid', transaction_id: crypto.randomBytes(8).toString('hex') };
      const r = acquirerNotify(order.provider, { ...f, sign: acquirerSign(order.provider, f) });
      if (!r.body.ok) throw new Error(r.body.error);
    } else if (order.provider === 'payme') {
      const txId = crypto.randomBytes(12).toString('hex');
      const base = { amount: order.amount * 100, account: { order_id: order.id } };
      paymeRpc('CheckPerformTransaction', base, op);
      paymeRpc('CreateTransaction', { ...base, id: txId, time: Date.now() }, op);
      paymeRpc('PerformTransaction', { id: txId }, op);
    } else {
      const f = {
        click_trans_id: String(Date.now()),
        service_id: merchant.click.serviceId,
        click_paydoc_id: String(Date.now()),
        merchant_trans_id: order.id,
        amount: String(order.amount),
        action: '0',
        error: '0',
        error_note: 'Success',
        sign_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      const prepared = clickPrepare({ ...f, sign_string: clickSign(f, false, merchant.click.secret) }, op);
      if (prepared.error !== 0) throw new Error(prepared.error_note);
      const done = { ...f, action: '1', merchant_prepare_id: String(prepared.merchant_prepare_id) };
      const completed = clickComplete({ ...done, sign_string: clickSign(done, true, merchant.click.secret) }, op);
      if (completed.error !== 0) throw new Error(completed.error_note);
    }
  } catch (err) {
    return res.status(409).json({ error: err.message?.ru ?? err.message ?? 'Оплата не прошла' });
  }
  res.json({ order: publicOrder(order), balance: order.operatorId ? netBalance(order.userId, order.operatorId) : db.data.wallets[order.walletId]?.balance ?? null });
});

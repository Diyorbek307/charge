import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { emit } from './api.js';

/**
 * Wallet top-ups through Payme and Click, Uzbekistan's two main payment rails.
 *
 * Both implementations follow the providers' merchant protocols as published:
 *   - Payme Merchant API: JSON-RPC 2.0, HTTP Basic "Paycom:<key>", amounts in
 *     tiyin, transaction states 1 / 2 / -1 / -2, 12-hour creation timeout.
 *   - Click SHOP API: Prepare (action 0) then Complete (action 1), each signed
 *     with an MD5 of the request fields and the merchant secret.
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

const MIN_TOPUP = 1_000;
const MAX_TOPUP = 10_000_000;
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
  const wallet = db.data.wallets[order.walletId];
  if (!wallet) throw new Error('wallet missing');
  wallet.balance += order.amount;
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  db.save();
  emit({
    type: 'wallet.topup',
    portal: 'system',
    actor: provider === 'payme' ? 'Payme' : 'Click',
    message: `Пополнение через ${provider === 'payme' ? 'Payme' : 'Click'} · +${order.amount.toLocaleString('ru-RU')} сум`,
    entity: order.walletId,
    payload: { amount: order.amount, balance: wallet.balance, provider, orderId: order.id },
  });
}

function checkoutUrl(order) {
  const back = `${PUBLIC_URL}/?portal=driver`;
  if (order.provider === 'payme') {
    const params = `m=${PAYME.merchantId};ac.order_id=${order.id};a=${order.amount * 100};c=${back}`;
    return `${PAYME.checkout}/${Buffer.from(params).toString('base64')}`;
  }
  const q = new URLSearchParams({
    service_id: CLICK.serviceId,
    merchant_id: CLICK.merchantId,
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
});

// ---------------------------------------------------------------------------
// App-facing endpoints
// ---------------------------------------------------------------------------

paymentsApi.get('/providers', (_req, res) => {
  res.json([
    { id: 'payme', name: 'Payme', configured: Boolean(PAYME.key), live: PAYME.live },
    { id: 'click', name: 'Click', configured: Boolean(CLICK.secret), live: CLICK.live },
  ]);
});

paymentsApi.post('/topup', (req, res) => {
  const account = viewerOf(req);
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  if (!['driver', 'business'].includes(account.portal)) return res.status(403).json({ error: 'Нет доступа к этому порталу' });

  const provider = req.body?.provider;
  if (!['payme', 'click'].includes(provider)) return res.status(400).json({ error: 'Выберите Payme или Click' });
  if (!(provider === 'payme' ? PAYME.key : CLICK.secret)) {
    return res.status(503).json({ error: 'Платёжный провайдер не настроен' });
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
    amount,
    status: 'pending',
    created: new Date().toISOString(),
    paidAt: null,
    payme: null,
    click: null,
  };
  orders().unshift(order);
  if (orders().length > 500) orders().length = 500;
  db.save();

  const live = provider === 'payme' ? PAYME.live : CLICK.live;
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

function paymeOrderFor(account) {
  const order = findOrder(String(account?.order_id ?? ''));
  if (!order || order.provider !== 'payme') {
    throw new PaymeError(-31050, paymeMessage('Заказ не найден', 'Order not found', 'Buyurtma topilmadi'), 'order_id');
  }
  return order;
}

function paymeTransaction(id) {
  const order = orders().find(o => o.payme?.id === id);
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

export function paymeRpc(method, params = {}) {
  switch (method) {
    case 'CheckPerformTransaction': {
      const order = paymeOrderFor(params.account);
      if (order.status !== 'pending') {
        throw new PaymeError(-31051, paymeMessage('Заказ уже оплачен или отменён', 'Order is not payable'), 'order_id');
      }
      if (Number(params.amount) !== order.amount * 100) {
        throw new PaymeError(-31001, paymeMessage('Неверная сумма', 'Incorrect amount', 'Noto‘g‘ri summa'));
      }
      return { allow: true };
    }

    case 'CreateTransaction': {
      const existing = orders().find(o => o.payme?.id === params.id);
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

      paymeRpc('CheckPerformTransaction', params);
      const order = paymeOrderFor(params.account);
      // One order, one Payme transaction: a second attempt means the order is busy.
      if (order.payme?.id) {
        throw new PaymeError(-31050, paymeMessage('По заказу уже есть транзакция', 'Order already has a transaction'), 'order_id');
      }
      order.payme = { id: String(params.id), time: Number(params.time), createTime: Date.now(), performTime: 0, cancelTime: 0, state: 1, reason: null };
      db.save();
      return { create_time: order.payme.createTime, transaction: order.payme.id, state: 1 };
    }

    case 'PerformTransaction': {
      const order = paymeTransaction(String(params.id));
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
      const order = paymeTransaction(String(params.id));
      if (order.payme.state === 1) {
        paymeCancel(order, -1, Number(params.reason) || null);
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
      return paymeView(paymeTransaction(String(params.id)));

    case 'GetStatement': {
      const from = Number(params.from);
      const to = Number(params.to);
      return {
        transactions: orders()
          .filter(o => o.payme && o.payme.createTime >= from && o.payme.createTime <= to)
          .map(o => ({ id: o.payme.id, time: o.payme.time, amount: o.amount * 100, account: { order_id: o.id }, ...paymeView(o) })),
      };
    }

    default:
      throw new PaymeError(-32601, paymeMessage('Метод не найден', 'Method not found'), method);
  }
}

paymentsApi.post('/payme', (req, res) => {
  const id = req.body?.id ?? null;
  const reply = body => res.json({ jsonrpc: '2.0', id, ...body });

  const header = req.get('authorization') || '';
  const expected = `Basic ${Buffer.from(`Paycom:${PAYME.key}`).toString('base64')}`;
  if (!PAYME.key || !safeEqual(header, expected)) {
    return reply({ error: { code: -32504, message: paymeMessage('Недостаточно прав', 'Insufficient privileges') } });
  }
  try {
    reply({ result: paymeRpc(req.body?.method, req.body?.params) });
  } catch (err) {
    if (!(err instanceof PaymeError)) {
      console.error('[payme]', err);
      return reply({ error: { code: -32400, message: paymeMessage('Системная ошибка', 'System error') } });
    }
    reply({ error: { code: err.code, message: err.message && typeof err.message === 'object' ? err.message : err.message, data: err.data } });
  }
});

// PaymeError carries a localized message object; keep it intact on the wire.
PaymeError.prototype.toJSON = function toJSON() {
  return { code: this.code, message: this.message, data: this.data };
};

// ---------------------------------------------------------------------------
// Click SHOP API
// ---------------------------------------------------------------------------

export function clickSign(f, withPrepare) {
  const parts = [f.click_trans_id, f.service_id, CLICK.secret, f.merchant_trans_id];
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

function clickCommon(f, action, withPrepare) {
  if (!CLICK.secret || !safeEqual(String(f.sign_string ?? ''), clickSign(f, withPrepare))) {
    return { fail: clickReply(f, -1, 'SIGN CHECK FAILED') };
  }
  if (String(f.service_id) !== String(CLICK.serviceId)) return { fail: clickReply(f, -8, 'Error in request from click') };
  if (String(f.action) !== action) return { fail: clickReply(f, -3, 'Action not found') };
  const order = findOrder(String(f.merchant_trans_id ?? ''));
  if (!order || order.provider !== 'click') return { fail: clickReply(f, -5, 'User does not exist') };
  if (order.status === 'paid') return { fail: clickReply(f, -4, 'Already paid') };
  if (order.status !== 'pending') return { fail: clickReply(f, -9, 'Transaction cancelled') };
  if (Math.abs(Number(f.amount) - order.amount) > 0.001) return { fail: clickReply(f, -2, 'Incorrect parameter amount') };
  return { order };
}

export function clickPrepare(f) {
  const { fail, order } = clickCommon(f, '0', false);
  if (fail) return fail;
  if (!order.click) {
    db.data.counters.clickPrepare = (db.data.counters.clickPrepare ?? 0) + 1;
    order.click = { prepareId: db.data.counters.clickPrepare, clickTransId: String(f.click_trans_id) };
    db.save();
  }
  return clickReply(f, 0, 'Success', { merchant_prepare_id: order.click.prepareId });
}

export function clickComplete(f) {
  const { fail, order } = clickCommon(f, '1', true);
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

// ---------------------------------------------------------------------------
// Sandbox: drives the real callback logic when no merchant account exists.
// ---------------------------------------------------------------------------

paymentsApi.post('/order/:id/sandbox-confirm', (req, res) => {
  const account = viewerOf(req);
  if (!account) return res.status(401).json({ error: 'Не авторизован' });
  const order = findOrder(req.params.id);
  if (!order || order.userId !== account.id) return res.status(404).json({ error: 'Счёт не найден' });
  const live = order.provider === 'payme' ? PAYME.live : CLICK.live;
  if (!DEMO_MODE || live) return res.status(404).json({ error: 'Песочница отключена' });

  try {
    if (order.provider === 'payme') {
      const txId = crypto.randomBytes(12).toString('hex');
      const base = { amount: order.amount * 100, account: { order_id: order.id } };
      paymeRpc('CheckPerformTransaction', base);
      paymeRpc('CreateTransaction', { ...base, id: txId, time: Date.now() });
      paymeRpc('PerformTransaction', { id: txId });
    } else {
      const f = {
        click_trans_id: String(Date.now()),
        service_id: CLICK.serviceId,
        click_paydoc_id: String(Date.now()),
        merchant_trans_id: order.id,
        amount: String(order.amount),
        action: '0',
        error: '0',
        error_note: 'Success',
        sign_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      const prepared = clickPrepare({ ...f, sign_string: clickSign(f, false) });
      if (prepared.error !== 0) throw new Error(prepared.error_note);
      const done = { ...f, action: '1', merchant_prepare_id: String(prepared.merchant_prepare_id) };
      const completed = clickComplete({ ...done, sign_string: clickSign(done, true) });
      if (completed.error !== 0) throw new Error(completed.error_note);
    }
  } catch (err) {
    return res.status(409).json({ error: err.message?.ru ?? err.message ?? 'Оплата не прошла' });
  }
  res.json({ order: publicOrder(order), balance: db.data.wallets[order.walletId]?.balance ?? null });
});

import crypto from 'node:crypto';
import { db } from './db.js';

/**
 * Direct settlement: money for a partner network goes straight to that
 * network, never through Zaryad24.
 *
 * A driver holds a separate balance per such network. It is topped up through
 * the network's own Payme cashbox or Click service — the network points the
 * cashbox's callback URL at us and gives us its key, so the money lands in the
 * network's bank account while every payment is confirmed to us in a signed
 * callback. Charges at the network's stations are taken from that balance.
 *
 * Because the money never passes through us, the ledger is the record: every
 * top-up, charge and refund per network, and the commission the network owes
 * us for the charges (invoiced separately).
 */

const DAY = 86400_000;
const now = () => new Date().toISOString();

const balances = () => (db.data.networkWallets ??= {});
export const ledger = () => (db.data.directLedger ??= []);

export const isDirect = operator => operator?.payout?.mode === 'direct';
export const directOperatorOf = station => {
  const op = station ? db.byId('operators', station.operatorId) : null;
  return isDirect(op) ? op : null;
};

export function netBalance(userId, operatorId) {
  return balances()[userId]?.[operatorId] ?? 0;
}
function setNet(userId, operatorId, value) {
  (balances()[userId] ??= {})[operatorId] = Math.max(0, Math.round(value));
}

/** One line of the money trail; amounts are positive, `kind` says the direction. */
export function record(entry) {
  const line = { id: `DL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, at: now(), ...entry };
  ledger().unshift(line);
  if (ledger().length > 20_000) ledger().length = 20_000;
  return line;
}

/** A confirmed payment into the network's cashbox. */
export function creditNetwork(order, provider) {
  setNet(order.userId, order.operatorId, netBalance(order.userId, order.operatorId) + order.amount);
  record({ kind: 'topup', operatorId: order.operatorId, userId: order.userId, amount: order.amount, provider, ref: order.id });
  return netBalance(order.userId, order.operatorId);
}

/** A provider reversed a top-up: only what is still unspent can go back. */
export function reverseTopUp(order) {
  const left = netBalance(order.userId, order.operatorId);
  if (left < order.amount) return false;
  setNet(order.userId, order.operatorId, left - order.amount);
  record({ kind: 'topup-reversed', operatorId: order.operatorId, userId: order.userId, amount: order.amount, ref: order.id });
  return true;
}

/** A finished charge at the network: paid from the driver's balance there, our commission accrues. */
export function chargeNetwork(session) {
  const before = netBalance(session.userId, session.direct);
  const paid = Math.min(before, session.cost);
  setNet(session.userId, session.direct, before - session.cost);
  const commission = Math.round((session.cost * (session.commissionRate ?? 3)) / 100);
  record({ kind: 'charge', operatorId: session.direct, userId: session.userId, amount: session.cost, paid, commission, ref: session.id });
  return paid;
}

export function refundNetwork(session, amount) {
  setNet(session.userId, session.direct, netBalance(session.userId, session.direct) + amount);
  const commission = Math.round((amount * (session.commissionRate ?? 3)) / 100);
  record({ kind: 'refund', operatorId: session.direct, userId: session.userId, amount, commission, ref: session.id });
}

/** What a driver sees: a balance for every network that is paid directly. */
export function networkWalletsFor(userId) {
  return db.data.operators
    // A network that left direct payment still shows the money the driver holds there.
    .filter(o => (isDirect(o) && o.status !== 'suspended') || netBalance(userId, o.id) > 0)
    .map(o => ({ operatorId: o.id, name: o.name, logo: o.logo, balance: netBalance(userId, o.id), direct: isDirect(o), payme: !!o.payout?.payme && isDirect(o), click: !!o.payout?.click && isDirect(o) }));
}

// ---------------------------------------------------------------------------
// Merchant settings of a network
// ---------------------------------------------------------------------------

/** Payout settings without secrets, plus the callback URLs to give the network. */
export function publicPayout(operator, base) {
  const p = operator.payout ?? { mode: 'platform' };
  const root = `${String(base).replace(/\/$/, '')}/api/payments`;
  return {
    mode: p.mode,
    sandbox: !!p.sandbox,
    payme: p.payme ? { merchantId: p.payme.merchantId, configured: true } : null,
    click: p.click ? { serviceId: p.click.serviceId, merchantId: p.click.merchantId, configured: true } : null,
    updatedAt: p.updatedAt ?? null,
    callbacks: {
      payme: `${root}/payme/${operator.id}`,
      clickPrepare: `${root}/click/${operator.id}/prepare`,
      clickComplete: `${root}/click/${operator.id}/complete`,
    },
  };
}

/**
 * Switches a network between settlement through the platform and direct
 * payment, and stores its cashbox keys. A key left empty keeps the stored one.
 */
export function setPayout(operator, b = {}, { sandbox = false } = {}) {
  const mode = b.mode === 'direct' ? 'direct' : 'platform';
  const prev = operator.payout ?? {};
  const text = (v, max = 120) => String(v ?? '').trim().slice(0, max);
  let payme = prev.payme ?? null;
  let click = prev.click ?? null;
  if (b.payme) {
    const merchantId = text(b.payme.merchantId);
    const key = text(b.payme.key) || prev.payme?.key || '';
    payme = merchantId ? { merchantId, key } : null;
    if (payme && !payme.key) return { status: 400, error: 'Укажите ключ кассы Payme' };
  }
  if (b.click) {
    const serviceId = text(b.click.serviceId, 20);
    const merchantId = text(b.click.merchantId, 20);
    const secret = text(b.click.secret) || prev.click?.secret || '';
    click = serviceId ? { serviceId, merchantId, secret } : null;
    if (click && (!click.secret || !/^\d+$/.test(serviceId) || !/^\d+$/.test(merchantId))) return { status: 400, error: 'Для Click нужны service_id, merchant_id (числа) и секретный ключ' };
  }
  if (mode === 'direct' && !payme && !click) return { status: 400, error: 'Для прямой оплаты нужна касса Payme или сервис Click сети' };
  operator.payout = { mode, payme, click, sandbox: sandbox || (mode === prev.mode && !!prev.sandbox && !b.payme && !b.click), updatedAt: now() };
  db.save();
  return { ok: true };
}

/** Sandbox cashbox for the demo: the full callback protocol runs, nothing is charged. */
export function sandboxPayout(operator) {
  return setPayout(
    operator,
    {
      mode: 'direct',
      payme: { merchantId: `demo-${operator.id}`, key: crypto.randomBytes(12).toString('hex') },
      click: { serviceId: String(30000 + (Number(operator.id.slice(3)) || 1)), merchantId: String(40000 + (Number(operator.id.slice(3)) || 1)), secret: crypto.randomBytes(12).toString('hex') },
    },
    { sandbox: true },
  );
}

// ---------------------------------------------------------------------------
// Report: what went to each network, what it owes us
// ---------------------------------------------------------------------------

export function directReport({ operatorId = null, days = 30 } = {}) {
  const since = Date.now() - Math.min(366, Math.max(1, Number(days) || 30)) * DAY;
  const ops = db.data.operators.filter(o => (operatorId ? o.id === operatorId : isDirect(o) || ledger().some(l => l.operatorId === o.id)));
  const rows = ops.map(o => {
    const lines = ledger().filter(l => l.operatorId === o.id);
    const recent = lines.filter(l => Date.parse(l.at) >= since);
    const sum = (list, kind, field = 'amount') => list.filter(l => l.kind === kind).reduce((s, l) => s + (l[field] ?? 0), 0);
    const held = Object.values(balances()).reduce((s, w) => s + (w[o.id] ?? 0), 0);
    return {
      operatorId: o.id,
      name: o.name,
      mode: o.payout?.mode ?? 'platform',
      sandbox: !!o.payout?.sandbox,
      // Period
      received: sum(recent, 'topup') - sum(recent, 'topup-reversed'),
      payments: recent.filter(l => l.kind === 'topup').length,
      charged: sum(recent, 'charge') - sum(recent, 'refund'),
      charges: recent.filter(l => l.kind === 'charge').length,
      commission: sum(recent, 'charge', 'commission') - sum(recent, 'refund', 'commission'),
      // All time
      totalReceived: sum(lines, 'topup') - sum(lines, 'topup-reversed'),
      totalCommission: sum(lines, 'charge', 'commission') - sum(lines, 'refund', 'commission'),
      // Drivers' money the network holds and has not yet earned.
      held,
      byDay: Array.from({ length: Math.min(31, Number(days) || 30) }, (_, i) => {
        const end = Date.now() - i * DAY;
        const start = end - DAY;
        const dayLines = recent.filter(l => Date.parse(l.at) > start && Date.parse(l.at) <= end);
        return { date: new Date(end + 5 * 3600_000).toISOString().slice(0, 10), received: sum(dayLines, 'topup'), charged: sum(dayLines, 'charge') };
      }).reverse(),
    };
  });
  const recentLines = ledger()
    .filter(l => (operatorId ? l.operatorId === operatorId : ops.some(o => o.id === l.operatorId)) && Date.parse(l.at) >= since)
    .slice(0, 100)
    .map(l => ({ ...l, user: db.byId('accounts', l.userId)?.name ?? l.userId, network: db.byId('operators', l.operatorId)?.name ?? l.operatorId }));
  return {
    days: Number(days) || 30,
    rows,
    totals: {
      received: rows.reduce((s, r) => s + r.received, 0),
      charged: rows.reduce((s, r) => s + r.charged, 0),
      commission: rows.reduce((s, r) => s + r.commission, 0),
      held: rows.reduce((s, r) => s + r.held, 0),
    },
    lines: recentLines,
  };
}

import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';

/**
 * Checking our top-ups against the provider's own statement, as an
 * accountant does at the end of each day:
 *
 *   our side     every order we marked paid, and orders that look stuck
 *                (the provider confirmed but we never credited, or a
 *                pending one far older than any checkout);
 *   their side   a statement exported from the Payme or Click business
 *                cabinet as CSV, pasted or uploaded by the admin.
 *
 * Lines are matched by the provider's transaction id when the statement has
 * one, else by our order id; then by amount. What comes back is only the
 * differences — the lines someone has to look at.
 */

const DAY = 86400_000;
const orders = () => db.data.payments ?? [];

/** Their id for one of our orders: Payme's transaction, Click's, or the acquirer's. */
const theirId = o => o.payme?.id ?? o.click?.clickTransId ?? o.acquirer?.transactionId ?? null;

/** Orders that are wrong with no statement needed. */
function ownProblems(now = Date.now()) {
  const found = [];
  for (const o of orders()) {
    if (o.payme?.state === 2 && o.status !== 'paid') found.push({ kind: 'confirmed-not-credited', order: o, note: 'Payme подтвердил оплату, а кошелёк не пополнен' });
    if (o.status === 'paid' && o.provider === 'payme' && o.payme && o.payme.state !== 2) found.push({ kind: 'credited-not-confirmed', order: o, note: 'Кошелёк пополнен, а Payme оплату не подтвердил' });
    if (o.status === 'pending' && now - Date.parse(o.created) > DAY) found.push({ kind: 'stuck', order: o, note: 'Заказ висит больше суток' });
  }
  return found;
}

/** Splits one CSV line on `;` or `,`, honouring quotes. */
function cells(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADS = {
  id: ['transaction', 'транзакц', 'id', 'click_trans_id', 'номер'],
  order: ['order', 'заказ', 'account', 'merchant_trans_id', 'счёт', 'счет'],
  amount: ['amount', 'сумма', 'summa'],
  status: ['status', 'state', 'статус', 'состояние'],
};

/**
 * The statement as rows of {id, order, amount, paid}. Columns are found by
 * their headings in Russian or English; amounts in tiyin (Payme's own unit)
 * are told apart from sums by the heading.
 */
export function parseStatement(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: 'В выписке нет строк' };
  const sep = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ';' : ',';
  const head = cells(lines[0], sep).map(h => h.toLowerCase());
  const col = names => head.findIndex(h => names.some(n => h.includes(n)));
  const at = { id: col(HEADS.id), order: col(HEADS.order), amount: col(HEADS.amount), status: col(HEADS.status) };
  if (at.amount < 0 || (at.id < 0 && at.order < 0)) return { error: 'Не нашли столбцы с суммой и номером транзакции или заказа' };
  const tiyin = /тийин|tiyin/.test(head[at.amount] ?? '');
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = cells(line, sep);
    const raw = Number(String(c[at.amount] ?? '').replace(/[\s ]/g, '').replace(',', '.'));
    if (!Number.isFinite(raw)) continue;
    const status = at.status >= 0 ? String(c[at.status] ?? '').toLowerCase() : '';
    rows.push({
      id: at.id >= 0 ? c[at.id] || null : null,
      order: at.order >= 0 ? c[at.order] || null : null,
      amount: Math.round(tiyin ? raw / 100 : raw),
      // No status column means the statement lists only completed payments.
      paid: !status || /^(2|paid|success|успеш|оплач|выполн|completed|done)/.test(status),
    });
  }
  return { rows };
}

const brief = o => ({ id: o.id, provider: o.provider, amount: o.amount, status: o.status, created: o.created, paidAt: o.paidAt ?? null, userId: o.userId, theirs: theirId(o) });

/** The differences between our paid orders and the statement, for a provider and period. */
export function reconcile({ provider, statement, from, to }) {
  const parsed = parseStatement(statement);
  if (parsed.error) return parsed;
  const start = from ? Date.parse(from) : 0;
  const end = to ? Date.parse(to) + DAY : Date.now() + DAY;
  const ours = orders().filter(o => o.provider === provider && !o.seeded && Date.parse(o.paidAt ?? o.created) >= start && Date.parse(o.paidAt ?? o.created) < end);
  const byTheirs = new Map(ours.filter(theirId).map(o => [String(theirId(o)), o]));
  const byOurs = new Map(ours.map(o => [o.id, o]));
  const matched = new Set();
  const diffs = [];
  let theirPaid = 0;

  for (const r of parsed.rows) {
    if (!r.paid) continue;
    theirPaid += r.amount;
    const o = (r.id && byTheirs.get(String(r.id))) || (r.order && byOurs.get(r.order)) || null;
    if (!o) {
      diffs.push({ kind: 'theirs-only', line: r, note: 'Оплачено у провайдера, у нас такого заказа нет' });
      continue;
    }
    matched.add(o.id);
    if (o.status !== 'paid') diffs.push({ kind: 'not-credited', order: brief(o), line: r, note: 'Провайдер получил деньги, а кошелёк не пополнен' });
    else if (o.amount !== r.amount) diffs.push({ kind: 'amount', order: brief(o), line: r, note: `Сумма у нас ${o.amount.toLocaleString('ru-RU')}, у провайдера ${r.amount.toLocaleString('ru-RU')}` });
  }
  for (const o of ours) {
    if (o.status === 'paid' && !matched.has(o.id)) diffs.push({ kind: 'ours-only', order: brief(o), note: 'У нас зачислено, в выписке провайдера нет' });
  }
  const ourPaid = ours.filter(o => o.status === 'paid').reduce((n, o) => n + o.amount, 0);
  return { provider, lines: parsed.rows.length, ourPaid, theirPaid, difference: theirPaid - ourPaid, diffs };
}

api.get('/admin/reconcile', requireAuth('admin'), (_req, res) => {
  res.json({ problems: ownProblems().map(p => ({ kind: p.kind, note: p.note, order: brief(p.order) })) });
});

api.post('/admin/reconcile', requireAuth('admin'), (req, res) => {
  const b = req.body ?? {};
  if (!['payme', 'click', 'uzum', 'humo'].includes(b.provider)) return res.status(400).json({ error: 'Выберите провайдера' });
  if (typeof b.statement !== 'string' || b.statement.length > 2_000_000) return res.status(400).json({ error: 'Вставьте выписку CSV (до 2 МБ)' });
  const result = reconcile(b);
  if (result.error) return res.status(400).json({ error: result.error });
  emit({ type: 'payments.reconcile', portal: 'admin', actor: req.account.name, message: `Сверка ${b.provider}: строк ${result.lines}, расхождений ${result.diffs.length}`, entity: b.provider });
  res.json(result);
});

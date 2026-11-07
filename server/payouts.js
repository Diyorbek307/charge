import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { allInvoices } from './analytics.js';
import { alertTeam } from './alerts.js';

/**
 * Paying the networks their share. Drivers' money lands on Voli's account;
 * once a month the admin sends each network its part by bank transfer and
 * marks it here — the date, the amount and the payment order's number. Only
 * then does the statement read "paid", for the admin and in the network's own
 * cabinet. A month left unpaid three days past the 2nd is overdue, and the
 * team hears about it once a day until it is paid.
 */

const payouts = () => (db.data.payouts ??= []);
const REF = /^[\p{L}\d\s№#/.,-]{1,60}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

api.post('/admin/payouts', requireAuth('admin'), (req, res) => {
  const b = req.body ?? {};
  const inv = allInvoices().find(i => i.id === b.invoiceId && i.operatorId === b.operatorId);
  if (!inv) return res.status(404).json({ error: 'Инвойс не найден' });
  if (inv.status === 'accruing') return res.status(400).json({ error: 'Месяц ещё не закрыт — выплачивать рано' });
  if (inv.mode === 'direct') return res.status(400).json({ error: 'Эта сеть получает оплату напрямую — переводить ей нечего' });
  if (payouts().some(r => r.invoiceId === inv.id && r.operatorId === inv.operatorId)) return res.status(409).json({ error: 'Выплата уже отмечена' });
  const amount = Math.round(Number(b.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > inv.payout * 2) return res.status(400).json({ error: 'Проверьте сумму перевода' });
  const paidAt = String(b.paidAt ?? '');
  if (!DATE.test(paidAt) || Date.parse(paidAt) > Date.now() + 86400_000) return res.status(400).json({ error: 'Укажите дату перевода' });
  const ref = String(b.ref ?? '').trim();
  if (!REF.test(ref)) return res.status(400).json({ error: 'Укажите номер платёжного поручения' });

  const record = { invoiceId: inv.id, operatorId: inv.operatorId, month: inv.month, amount, paidAt, ref, by: req.account.name ?? req.account.login, at: new Date().toISOString() };
  payouts().push(record);
  db.save();
  emit({
    type: 'operator.payout.paid',
    portal: 'admin',
    actor: record.by,
    message: `${inv.operator}: выплата за ${inv.month} — ${amount.toLocaleString('ru-RU')} сум, п/п ${ref}`,
    entity: inv.id,
    scope: { operatorId: inv.operatorId },
  });
  res.json(record);
});

/** A wrong mark can be taken back. */
api.delete('/admin/payouts/:invoiceId/:operatorId', requireAuth('admin'), (req, res) => {
  const before = payouts().length;
  db.data.payouts = payouts().filter(r => !(r.invoiceId === req.params.invoiceId && r.operatorId === req.params.operatorId));
  if (db.data.payouts.length === before) return res.status(404).json({ error: 'Отметки нет' });
  db.save();
  emit({ type: 'operator.payout.undo', portal: 'admin', actor: req.account.name ?? req.account.login, message: `Отметка выплаты ${req.params.invoiceId} снята`, entity: req.params.invoiceId, scope: { operatorId: req.params.operatorId } });
  res.json({ removed: true });
});

/** Once a day per overdue statement: a reminder to the team. */
export function remindOverdue(now = Date.now()) {
  const told = (db.data.payoutReminded ??= {});
  const today = new Date(now + 5 * 3600_000).toISOString().slice(0, 10);
  let sent = 0;
  for (const inv of allInvoices(now)) {
    if (inv.status !== 'overdue' || inv.mode === 'direct' || told[inv.id + inv.operatorId] === today) continue;
    told[inv.id + inv.operatorId] = today;
    sent++;
    void alertTeam(`payout:${inv.id}:${today}`, 'Просрочена выплата сети', [
      ['Сеть', inv.operator],
      ['Месяц', inv.month],
      ['К выплате', `${inv.payout.toLocaleString('ru-RU')} сум`],
      ['Срок был', inv.payDate.slice(0, 10)],
    ]);
  }
  if (sent) db.save();
  return sent;
}

export function startPayoutWatch() {
  const t = setInterval(() => {
    try {
      remindOverdue();
    } catch (e) {
      console.warn('[payouts]', e.message);
    }
  }, 60 * 60_000);
  t.unref?.();
}

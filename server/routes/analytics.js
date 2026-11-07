// Analytics — every dashboard figure, computed from sessions, scoped by role.
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db } from '../db.js';
import { analyticsFor, growthFor, investorFor } from '../analytics.js';
import { refundDebt } from '../credit.js';
import { refundNetwork } from '../direct.js';
import { api, emit, requireAuth } from '../api.js';

// ---------------------------------------------------------------------------
// Analytics — every dashboard figure, computed from sessions, scoped by role.
// ---------------------------------------------------------------------------

api.get('/analytics', requireAuth('admin', 'operator', 'business', 'driver'), (req, res) => {
  res.json(analyticsFor(req.account, { days: req.query.days }));
});

api.get('/admin/growth', requireAuth('admin'), (_req, res) => {
  res.json(growthFor());
});

api.get('/admin/investor', requireAuth('admin'), (_req, res) => {
  res.json(investorFor());
});

/** Refunds a charge to the wallet it was paid from. Once per transaction. */
api.post('/transactions/:id/refund', requireAuth('admin'), (req, res) => {
  const txn = db.byId('transactions', req.params.id);
  if (!txn) return res.status(404).json({ error: 'Транзакция не найдена' });
  if (txn.status !== 'completed' || !txn.amount) return res.status(409).json({ error: 'Вернуть можно только оплаченную зарядку' });
  const session = db.byId('sessions', txn.sessionId);
  if (session?.credit) {
    // The debt is written off; only what was already repaid comes back.
    refundDebt(session.id);
  } else if (session?.direct) {
    // Back to the driver's balance at that network.
    refundNetwork(session, txn.amount);
  } else {
    const walletId = session?.corporate ? 'biz-001' : session?.familyOwner ?? txn.userId;
    const wallet = (db.data.wallets[walletId] ??= { balance: 0, currency: 'UZS', autoTopUp: false, threshold: 0, card: null });
    wallet.balance += txn.amount;
  }
  txn.status = 'refunded';
  txn.refundedAt = new Date().toISOString();
  txn.refundedBy = req.account.name;
  db.save();
  emit({
    type: 'wallet.refund',
    portal: 'admin',
    actor: req.account.name,
    message: `Возврат ${txn.amount.toLocaleString('ru-RU')} сум · ${txn.id} · ${txn.user}`,
    entity: txn.id,
    payload: { amount: txn.amount, userId: txn.userId },
  });
  res.json({ transaction: txn });
});

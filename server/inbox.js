import { db } from './db.js';
import { api, requireAuth } from './api.js';

/**
 * What waits for the admin, counted in one place: the red marks in the menu
 * and the "needs attention" row on the overview. Each count names the page
 * that deals with it, so a tap leads straight there.
 */
export function inboxFor(now = Date.now()) {
  const d = db.data;
  const sos = (d.sos ?? []).filter(s => s.status === 'open').length;
  const support = (d.supportThreads ?? []).filter(t => t.status !== 'closed' && (t.needsHuman || (t.unreadAdmin ?? 0) > 0)).length;
  const leads = (d.leads ?? []).filter(l => l.status === 'new').length;
  const alerts = (d.alerts ?? []).filter(a => !a.ack).length;
  const critical = (d.alerts ?? []).filter(a => !a.ack && a.severity === 'critical').length;
  const overdue = new Set((d.creditDebts ?? []).filter(x => !x.paidAt && Date.parse(x.dueAt) < now).map(x => x.userId)).size;
  const stuckPayments = (d.payments ?? []).filter(p => p.status === 'pending' && now - Date.parse(p.created) > 86400_000).length;
  const operators = (d.operators ?? []).filter(o => o.status === 'pending').length;
  return {
    items: [
      { key: 'sos', page: 'sos', count: sos, label: 'SOS водителей', urgent: true },
      { key: 'support', page: 'support', count: support, label: 'Чаты ждут ответа', urgent: true },
      { key: 'alerts', page: 'map', count: alerts, label: critical ? `Сбои станций, ${critical} критич.` : 'Сбои станций', urgent: critical > 0 },
      { key: 'leads', page: 'leads', count: leads, label: 'Новые заявки', urgent: false },
      { key: 'operators', page: 'operators', count: operators, label: 'Сети на проверке', urgent: false },
      { key: 'credit', page: 'credit', count: overdue, label: 'Просрочены долги', urgent: false },
      { key: 'payments', page: 'payments', count: stuckPayments, label: 'Зависшие платежи', urgent: false },
    ],
  };
}

api.get('/admin/inbox', requireAuth('admin'), (_req, res) => {
  res.json(inboxFor());
});

// Promos: a network runs discounts at its own stations and pays for them
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db } from '../db.js';
import { publicPromos, createPromo, createCampaign, stopPromo, promosOf } from '../promos.js';
import { api, emit, requireAuth } from '../api.js';

// ---------------------------------------------------------------------------
// Promos: a network runs discounts at its own stations and pays for them
// ---------------------------------------------------------------------------

api.get('/promos', (_req, res) => res.json(publicPromos()));

api.get('/operator/promos', requireAuth('operator', 'admin'), (req, res) => {
  res.json(promosOf(req.account.portal === 'admin' ? null : req.account.orgId));
});

api.post('/operator/promos', requireAuth('operator'), (req, res) => {
  const r = createPromo(req.account.orgId, req.body ?? {}, req.account.name);
  if (r.error) return res.status(400).json({ error: r.error });
  emit({ type: 'promo.update', portal: 'operator', actor: req.account.name, message: `Новая скидка: ${r.promo.title}`, entity: r.promo.id, payload: { operatorId: r.promo.operatorId } });
  res.status(201).json(r.promo);
});

// Voli's own campaigns: the admin runs them across networks, paid by Voli or by the networks.
api.get('/admin/promos', requireAuth('admin'), (_req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  res.json({
    promos: promosOf(null),
    voliPaidMonth: db.data.sessions.filter(s => s.promoCovered && s.start.startsWith(month)).reduce((n, s) => n + s.promoCovered, 0),
    driversReachable: db.data.accounts.filter(a => a.portal === 'driver' && a.consent?.marketing).length,
  });
});

api.post('/admin/promos', requireAuth('admin'), (req, res) => {
  const r = createCampaign(req.body ?? {}, req.account.name);
  if (r.error) return res.status(400).json({ error: r.error });
  const p = r.promo;
  emit({ type: 'promo.update', portal: 'admin', actor: req.account.name, message: `Новая акция: ${p.title}`, entity: p.id, payload: { operatorIds: p.operatorIds } });
  // Told to drivers who agreed to hear about offers: in the app, and by push where they allowed it.
  if (req.body?.announce) {
    const where = p.operatorIds ? p.operatorIds.map(id => db.byId('operators', id)?.name).filter(Boolean).join(', ') : 'все станции Voli';
    emit({ type: 'promo.campaign', portal: 'admin', actor: req.account.name, message: `−${p.percent}% · ${p.title} · ${where}`, entity: p.id, payload: { promoId: p.id } });
  }
  res.status(201).json(p);
});

api.delete('/operator/promos/:id', requireAuth('operator', 'admin'), (req, res) => {
  const p = stopPromo(req.account.portal === 'admin' ? null : req.account.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'Скидка не найдена' });
  emit({ type: 'promo.update', portal: req.account.portal, actor: req.account.name, message: `Скидка остановлена: ${p.title}`, entity: p.id, payload: { operatorId: p.operatorId } });
  res.json(p);
});

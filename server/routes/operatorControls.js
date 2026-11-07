// Operator / admin controls
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { playMoney } from '../money.js';
import { db } from '../db.js';
import { api, emit, findConnector, requireAuth, statsFor } from '../api.js';

// ---------------------------------------------------------------------------
// Operator / admin controls
// ---------------------------------------------------------------------------

api.post('/stations/:id/connectors/:cid', requireAuth('operator', 'admin'), (req, res) => {
  const status = req.body?.status;
  // "occupied" is set by a real session only; forcing it strands the connector.
  if (!['available', 'unavailable', 'reserved'].includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }
  const { station, connector } = findConnector(req.params.id, req.params.cid);
  if (!station || !connector) return res.status(404).json({ error: 'Коннектор не найден' });
  if (req.account.portal === 'operator' && station.operatorId !== req.account.orgId) {
    return res.status(403).json({ error: 'Станция принадлежит другому оператору' });
  }
  if (connector.status === 'occupied' && status !== 'available') {
    return res.status(409).json({ error: 'Идёт зарядка — нельзя изменить статус' });
  }

  connector.status = status;
  db.save();

  emit({
    type: 'evse.status',
    portal: req.account.portal,
    actor: req.account.name,
    message: `EVSE ${connector.id} · ${station.name} → ${status}`,
    entity: `${station.id}:${connector.id}`,
    payload: { stationId: station.id, connectorId: connector.id, status },
  });

  res.json({ station, stats: statsFor(req.account) });
});

api.post('/alerts/:id/ack', requireAuth('operator', 'admin'), (req, res) => {
  const alert = db.byId('alerts', req.params.id);
  // Another network's alert is as good as missing.
  if (!alert || (req.account.portal === 'operator' && alert.operatorId !== req.account.orgId)) return res.status(404).json({ error: 'Оповещение не найдено' });

  alert.ack = true;
  alert.ackBy = req.account.name;
  db.save();

  emit({
    type: 'alert.ack',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Оповещение ${alert.id} обработано`,
    entity: alert.id,
  });

  res.json({ alert, stats: statsFor(req.account) });
});

api.post('/alerts', requireAuth('operator', 'admin'), (req, res) => {
  const { severity = 'info', stationId, message, code = 'MANUAL' } = req.body ?? {};
  const station = db.byId('stations', stationId);
  const alert = {
    id: db.nextId('alert', 'AL-'),
    severity,
    stationId: station?.id ?? null,
    station: station?.name ?? 'Платформа',
    operatorId: station?.operatorId ?? null,
    code,
    message: message || 'Ручное оповещение',
    time: new Date().toISOString(),
    ack: false,
  };
  db.insert('alerts', alert);

  emit({
    type: 'alert.new',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Новое оповещение · ${alert.message}`,
    entity: alert.id,
    payload: { severity },
  });

  res.json({ alert, stats: statsFor(req.account) });
});

api.post('/wallet/topup', requireAuth('driver', 'business'), (req, res) => {
  // Free top-ups are the demo's; once any real payment key is set they stop (server/money.js).
  if (!playMoney()) return res.status(403).json({ error: 'Пополнение только через Payme или Click' });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Некорректная сумма' });

  const walletId = req.account.portal === 'business' ? 'biz-001' : req.account.id;
  const wallet = db.data.wallets[walletId];
  if (!wallet) return res.status(404).json({ error: 'Кошелёк не найден' });

  wallet.balance += amount;
  db.save();

  emit({
    type: 'wallet.topup',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Пополнение баланса · +${amount.toLocaleString('ru-RU')} сум`,
    entity: walletId,
    payload: { amount, balance: wallet.balance },
  });

  res.json({ wallet });
});

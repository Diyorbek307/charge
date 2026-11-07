// Station queue — wait for a busy station instead of circling the car park.
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db } from '../db.js';
import { plusActive } from '../plus.js';
import { fleetPriority } from '../fleet.js';
import { api, emit, featureOn, pruneQueues, requireAuth, unheldFree } from '../api.js';

// ---------------------------------------------------------------------------
// Station queue — wait for a busy station instead of circling the car park.
// ---------------------------------------------------------------------------

api.post('/stations/:id/queue', requireAuth('driver', 'business'), featureOn('queue'), (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });

  const account = req.account;
  pruneQueues();
  if (db.data.queues.some(q => q.userId === account.id)) {
    return res.status(409).json({ error: 'Вы уже стоите в очереди' });
  }
  if (db.data.sessions.some(s => s.status === 'active' && s.userId === account.id)) {
    return res.status(409).json({ error: 'У вас уже идёт зарядка' });
  }
  if (unheldFree(station) > 0) {
    return res.status(409).json({ error: 'Есть свободный коннектор — можно заряжаться сразу' });
  }

  const entry = {
    id: db.nextId('queue', 'Q-'),
    stationId: station.id,
    userId: account.id,
    user: account.name,
    joined: new Date().toISOString(),
    notified: false,
    notifiedAt: null,
    connectorId: null,
  };
  // Plus stands behind other Plus members, ahead of everyone else.
  // Plus members and taxi-tariff drivers stand behind each other, ahead of everyone else.
  const plus = plusActive(account.id) || fleetPriority(account.id);
  if (plus) entry.plus = true;
  const behind = plus ? db.data.queues.findIndex(q => q.stationId === station.id && !q.plus) : -1;
  if (behind >= 0) db.data.queues.splice(behind, 0, entry);
  else db.data.queues.push(entry);
  const position = db.data.queues.filter(q => q.stationId === station.id).findIndex(q => q.id === entry.id) + 1;
  db.save();

  emit({
    type: 'queue.join',
    portal: account.portal,
    actor: account.name,
    message: `${account.name} встал в очередь · ${station.name} · №${position}`,
    entity: entry.id,
    payload: { stationId: station.id, position },
  });
  res.json({ entry, position });
});

api.delete('/stations/:id/queue', requireAuth('driver', 'business'), (req, res) => {
  const before = db.data.queues.length;
  db.data.queues = db.data.queues.filter(
    q => !(q.stationId === req.params.id && q.userId === req.account.id),
  );
  if (db.data.queues.length === before) return res.status(404).json({ error: 'Вы не в очереди' });
  db.save();
  emit({
    type: 'queue.leave',
    portal: req.account.portal,
    actor: req.account.name,
    message: `${req.account.name} покинул очередь`,
    entity: req.params.id,
  });
  res.json({ ok: true });
});

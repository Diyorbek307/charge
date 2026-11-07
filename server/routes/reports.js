// Driver issue reports — land as an alert on the owning operator's console.
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db } from '../db.js';
import { setting } from '../settings.js';
import { api, emit, requireAuth } from '../api.js';

// ---------------------------------------------------------------------------
// Driver issue reports — land as an alert on the owning operator's console.
// ---------------------------------------------------------------------------

const ISSUE_COOLDOWN_MS = () => setting('issue.cooldownMin') * 60_000;

api.post('/stations/:id/issues', requireAuth('driver', 'business'), (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });

  const category = String(req.body?.category ?? '').trim().slice(0, 60);
  if (!category) return res.status(400).json({ error: 'Выберите категорию проблемы' });
  const details = String(req.body?.details ?? '').trim().slice(0, 500);

  // One report per driver per station per cooldown keeps an angry driver from
  // burying the operator's queue.
  const recent = db.data.alerts.find(
    a =>
      a.reporterId === req.account.id &&
      a.stationId === station.id &&
      Date.now() - new Date(a.time).getTime() < ISSUE_COOLDOWN_MS(),
  );
  if (recent) {
    return res.status(429).json({ error: 'Вы уже сообщили об этой станции — оператор разбирается' });
  }

  const critical = /безопас|огон|пожар|дым|искр/i.test(`${category} ${details}`);
  const alert = {
    id: db.nextId('alert', 'AL-'),
    severity: critical ? 'critical' : 'warning',
    stationId: station.id,
    station: station.name,
    operatorId: station.operatorId,
    code: 'DRIVER_REPORT',
    message: details ? `${category}: ${details}` : category,
    time: new Date().toISOString(),
    ack: false,
    reporterId: req.account.id,
    reporter: req.account.name,
  };
  db.insert('alerts', alert);

  emit({
    type: 'alert.new',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Жалоба водителя · ${station.name} · ${category}`,
    entity: alert.id,
    payload: { severity: alert.severity, operatorId: station.operatorId, stationId: station.id },
  });

  res.json({ alert });
});

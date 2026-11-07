// Export history — who pulled which report, and when.
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db } from '../db.js';
import { api, emit, requireAuth, viewerOf, visibleEvents } from '../api.js';

// ---------------------------------------------------------------------------
// Export history — who pulled which report, and when.
// ---------------------------------------------------------------------------

api.get('/reports', requireAuth(), (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : null;
  const list = (db.data.reports ?? []).filter(r => !name || r.name === name);
  res.json(list.slice(0, Math.min(Number(req.query.limit) || 20, 100)));
});

api.post('/reports', requireAuth(), (req, res) => {
  const { name, title, format, rows } = req.body ?? {};
  if (!name || !['csv', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'Некорректный отчёт' });
  }

  const report = {
    id: db.nextId('report', 'RPT-'),
    name: String(name).slice(0, 80),
    title: String(title ?? name).slice(0, 120),
    format,
    rows: Number.isFinite(Number(rows)) ? Number(rows) : 0,
    actor: req.account.name,
    portal: req.account.portal,
    ts: new Date().toISOString(),
  };
  db.data.reports.unshift(report);
  if (db.data.reports.length > 150) db.data.reports.length = 150;
  db.save();

  emit({
    type: 'report.export',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Выгружен отчёт · ${report.title} · ${format.toUpperCase()} · ${report.rows} строк`,
    entity: report.id,
  });

  res.json({ report });
});

api.get('/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 300);
  res.json(visibleEvents(viewerOf(req), limit));
});

// Admin tools: risk signals, charge-record checks, tariff windows, health
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { realPaymentKeys, mixedMode } from '../money.js';
import { db } from '../db.js';
import { alertsStatus, testAlert } from '../alerts.js';
import { fcmConfigured } from '../fcm.js';
import { smsConfigured } from '../sms.js';
import { mailConfigured, mailbox, mailStatus, sendTestLetter } from '../mail.js';
import { adminUsers, setUserStatus } from '../analytics.js';
import { riskReport, reviewFinding, cdrReport, tariffBands, setTariffBands } from '../admin.js';
import { blocked } from '../guard.js';
import { api, DEMO_MODE, clients, emit, gateway, requireAuth, statsFor } from '../api.js';

// ---------------------------------------------------------------------------
// Admin tools: risk signals, charge-record checks, tariff windows, health
// ---------------------------------------------------------------------------

api.get('/admin/risk', requireAuth('admin'), (_req, res) => res.json(riskReport()));

api.post('/admin/risk/:id/review', requireAuth('admin'), (req, res) => {
  const decision = req.body?.decision;
  if (!['confirmed', 'dismissed'].includes(decision)) return res.status(400).json({ error: 'Решение: confirmed или dismissed' });
  const finding = riskReport().findings.find(f => f.id === req.params.id);
  if (!finding) return res.status(404).json({ error: 'Сигнал не найден' });
  const review = reviewFinding(finding.id, decision, req.account, req.body?.note);
  if (decision === 'confirmed' && req.body?.block && finding.userId) setUserStatus(finding.userId, 'blocked');
  emit({
    type: 'risk.review',
    portal: 'admin',
    actor: req.account.name,
    message: `${decision === 'confirmed' ? 'Подтверждён' : 'Отклонён'} сигнал риска · ${finding.user}${decision === 'confirmed' && req.body?.block ? ' · аккаунт заблокирован' : ''}`,
    entity: finding.id,
  });
  res.json({ review });
});

api.get('/admin/cdr', requireAuth('admin'), (req, res) => res.json(cdrReport(Date.now(), Math.min(Math.max(Number(req.query.days) || 30, 1), 60))));

api.get('/admin/tariff-bands', requireAuth('admin'), (_req, res) => res.json({ bands: tariffBands() }));

api.put('/admin/tariff-bands', requireAuth('admin'), (req, res) => {
  const result = setTariffBands(req.body?.bands);
  if (result.error) return res.status(400).json({ error: result.error });
  emit({
    type: 'tariff.bands',
    portal: 'admin',
    actor: req.account.name,
    message: `Тарифные окна: ${result.bands.map(b => `${b.band} ${b.from}–${b.to} ×${b.multiplier}`).join(', ')}`,
    entity: 'tariff-bands',
  });
  res.json(result);
});

/** Staff accounts of every portal — drivers are under /admin/users. */
api.get('/admin/accounts', requireAuth('admin'), (_req, res) => {
  res.json(
    db.data.accounts
      .filter(a => a.portal !== 'driver')
      .map(a => ({
        id: a.id,
        portal: a.portal,
        name: a.name,
        login: a.login,
        role: a.role,
        org: a.org,
        lastLogin: a.lastLogin ?? null,
        twoFactor: !!a.twoFactor?.enabled,
        devices: db.data.tokens.filter(t => t.accountId === a.id).length,
      })),
  );
});

const startedAt = Date.now();

api.get('/admin/health', requireAuth('admin'), (_req, res) => {
  const mem = process.memoryUsage();
  const hourAgo = Date.now() - 3600_000;
  const deliveries = db.data.deliveries ?? [];
  const lastFailed = deliveries.find(d => d.status === 'failed');
  res.json({
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    node: process.version,
    memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
    storage: process.env.DATABASE_URL ? 'postgres' : 'file',
    demo: { mode: DEMO_MODE, simulation: DEMO_MODE && process.env.DEMO_SIMULATION !== 'false', realMoney: realPaymentKeys(), mixed: mixedMode() },
    records: {
      stations: db.data.stations.length,
      sessions: db.data.sessions.length,
      transactions: db.data.transactions.length,
      events: db.data.events.length,
      accounts: db.data.accounts.length,
      customers: (db.data.customers ?? []).length,
    },
    live: {
      sseClients: clients.size,
      activeSessions: db.data.sessions.filter(s => s.status === 'active').length,
      eventsLastHour: db.data.events.filter(e => Date.parse(e.ts) >= hourAgo).length,
      tokens: db.data.tokens.length,
    },
    ocpp: { connected: gateway?.list?.().length ?? 0 },
    webhooks: {
      endpoints: (db.data.webhooks ?? []).length,
      active: (db.data.webhooks ?? []).filter(w => w.active).length,
      pending: deliveries.filter(d => d.status === 'pending' || d.status === 'retrying').length,
      failed: deliveries.filter(d => d.status === 'failed').length,
      delivered: deliveries.filter(d => d.status === 'delivered').length,
      lastError: lastFailed ? { url: lastFailed.url, error: lastFailed.lastError, at: lastFailed.ts } : null,
    },
    sms: smsConfigured(),
    alerts: alertsStatus(),
    appPush: { firebase: fcmConfigured(), devices: (db.data.nativePush ?? []).length },
    mail: { configured: mailConfigured(), to: ['info', 'hello', 'partners', 'business', 'support'].map(mailbox).join(', '), ...mailStatus() },
    time: new Date().toISOString(),
  });
});

// A test alert to the team's Telegram chat, with Telegram's own answer.
api.post('/admin/alerts/test', requireAuth('admin'), async (req, res) => {
  res.json(await testAlert(req.account.name));
});

// A test letter to the general mailbox: the answer says whether it left and, if not, why.
api.post('/admin/mail/test', requireAuth('admin'), async (req, res) => {
  res.json(await sendTestLetter(mailbox('info'), req.account.name));
});

api.get('/admin/users', requireAuth('admin'), (_req, res) => {
  res.json(adminUsers());
});

api.post('/admin/users/:id/status', requireAuth('admin'), (req, res) => {
  const status = req.body?.status;
  if (!['active', 'blocked'].includes(status)) return res.status(400).json({ error: 'Некорректный статус' });
  const user = setUserStatus(req.params.id, status);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  emit({
    type: 'user.status',
    portal: 'admin',
    actor: req.account.name,
    message: `${status === 'blocked' ? 'Заблокирован' : 'Разблокирован'} пользователь ${user.name ?? req.params.id}`,
    entity: req.params.id,
  });
  res.json({ id: req.params.id, status });
});

api.post('/admin/reset', requireAuth('admin'), (req, res) => {
  // Wiping every account and charge is a demo tool, never a production button.
  if (!DEMO_MODE) return res.status(404).json({ error: 'Not found' });
  db.reset();
  emit({
    type: 'system.reset',
    portal: 'admin',
    actor: req.account.name,
    message: 'Демо-данные сброшены к исходным',
  });
  res.json({ ok: true, stats: statsFor(req.account) });
});

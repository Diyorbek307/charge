import express from 'express';
import { db, publicAccount } from './db.js';
import { DEMO_ACCOUNTS } from './seed.js';

export const api = express.Router();
api.use(express.json());

// ---------------------------------------------------------------------------
// Live sync: every mutation is broadcast to all connected portals over SSE.
// ---------------------------------------------------------------------------

const clients = new Set();

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

/** Records an event in the activity log and pushes it to every live portal. */
function emit({ type, portal, actor, message, entity = null, payload = {} }) {
  const event = {
    id: db.nextId('event', 'EV-'),
    type,
    portal,
    actor,
    message,
    entity,
    payload,
    ts: new Date().toISOString(),
  };
  db.data.events.unshift(event);
  if (db.data.events.length > 300) db.data.events.length = 300;
  db.save();
  broadcast(event);
  return event;
}

api.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`retry: 3000\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`);

  clients.add(res);

  // Render's proxy drops idle connections; a periodic comment keeps it warm.
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* cleaned up on close */
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

// ---------------------------------------------------------------------------
// Auth — every portal has its own account and its own password.
// ---------------------------------------------------------------------------

function bearer(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(...portals) {
  return (req, res, next) => {
    const resolved = db.resolveToken(bearer(req));
    if (!resolved) return res.status(401).json({ error: 'Не авторизован' });
    if (portals.length && !portals.includes(resolved.account.portal)) {
      return res.status(403).json({ error: 'Нет доступа к этому порталу' });
    }
    req.account = resolved.account;
    next();
  };
}

/** Demo credentials are shown in the UI so the prototype stays explorable. */
api.get('/auth/demo-credentials', (_req, res) => {
  res.json(
    DEMO_ACCOUNTS.map(a => ({
      portal: a.portal,
      login: a.login,
      password: a.password,
      otp: a.otp ?? null,
      name: a.name,
      role: a.role,
      org: a.org,
    })),
  );
});

api.post('/auth/login', (req, res) => {
  const { portal, login, password } = req.body ?? {};
  if (!portal || !login || !password) {
    return res.status(400).json({ error: 'Укажите портал, логин и пароль' });
  }

  const account = db.find(
    'accounts',
    a => a.portal === portal && a.login === String(login).trim().toLowerCase(),
  );
  if (!account || !db.verifyPassword(account, String(password))) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const token = db.issueToken(account);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  emit({
    type: 'auth.login',
    portal,
    actor: account.name,
    message: `${account.name} вошёл в ${portalLabel(portal)}`,
    entity: account.id,
  });

  res.json({ token, user: publicAccount(account) });
});

/** Driver portal keeps its phone + OTP flow; the code is fixed in demo mode. */
api.post('/auth/otp/request', (req, res) => {
  const phone = String(req.body?.phone ?? '').replace(/[^\d+]/g, '');
  const account = db.find('accounts', a => a.portal === 'driver' && a.login === phone.toLowerCase());
  if (!account) return res.status(404).json({ error: 'Номер не найден. Используйте демо-номер.' });
  res.json({ sent: true, hint: account.otp });
});

api.post('/auth/otp/verify', (req, res) => {
  const phone = String(req.body?.phone ?? '').replace(/[^\d+]/g, '');
  const code = String(req.body?.code ?? '');
  const account = db.find('accounts', a => a.portal === 'driver' && a.login === phone.toLowerCase());
  if (!account || account.otp !== code) return res.status(401).json({ error: 'Неверный код' });

  const token = db.issueToken(account);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  emit({
    type: 'auth.login',
    portal: 'driver',
    actor: account.name,
    message: `${account.name} вошёл в Driver App`,
    entity: account.id,
  });
  res.json({ token, user: publicAccount(account) });
});

api.get('/auth/me', requireAuth(), (req, res) => {
  res.json({ user: publicAccount(req.account) });
});

api.post('/auth/logout', (req, res) => {
  db.revokeToken(bearer(req));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Shared state — one snapshot every portal reads from.
// ---------------------------------------------------------------------------

api.get('/state', (_req, res) => {
  const d = db.data;
  res.json({
    stations: d.stations,
    operators: d.operators,
    sessions: d.sessions,
    transactions: d.transactions,
    alerts: d.alerts,
    vehicles: d.vehicles,
    employees: d.employees,
    wallets: d.wallets,
    events: d.events.slice(0, 60),
    stats: computeStats(),
    serverTime: new Date().toISOString(),
  });
});

function computeStats() {
  const d = db.data;
  const active = d.sessions.filter(s => s.status === 'active');
  const completed = d.sessions.filter(s => s.status === 'completed');
  const evseTotal = d.stations.reduce((n, s) => n + s.connectors.length, 0);
  const evseOnline = d.stations.reduce(
    (n, s) => n + s.connectors.filter(c => c.status !== 'unavailable').length,
    0,
  );
  return {
    activeSessions: active.length,
    totalSessions: d.sessions.length,
    energyToday: round(completed.reduce((n, s) => n + s.energy, 0) + active.reduce((n, s) => n + s.energy, 0)),
    revenueToday: completed.reduce((n, s) => n + s.cost, 0),
    evseTotal,
    evseOnline,
    stations: d.stations.length,
    operators: d.operators.length,
    openAlerts: d.alerts.filter(a => !a.ack).length,
    availability: evseTotal ? round((evseOnline / evseTotal) * 100, 2) : 100,
  };
}

const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

const portalLabel = p =>
  ({ driver: 'Driver App', operator: 'Operator Portal', admin: 'Admin Center', business: 'Business Portal', api: 'Partner API' }[p] ?? p);

function findConnector(stationId, connectorId) {
  const station = db.byId('stations', stationId);
  if (!station) return {};
  return { station, connector: station.connectors.find(c => c.id === connectorId) };
}

// ---------------------------------------------------------------------------
// Charging sessions — the flow that ties all portals together.
// ---------------------------------------------------------------------------

api.post('/sessions/start', requireAuth('driver', 'business', 'admin'), (req, res) => {
  const { stationId, connectorId } = req.body ?? {};
  const { station, connector } = findConnector(stationId, connectorId);
  if (!station || !connector) return res.status(404).json({ error: 'Коннектор не найден' });
  if (connector.status === 'occupied') return res.status(409).json({ error: 'Коннектор уже занят' });
  if (connector.status === 'unavailable') return res.status(409).json({ error: 'Коннектор недоступен' });

  const account = req.account;
  const session = {
    id: db.nextId('session', 'S-'),
    userId: account.id,
    user: account.name,
    stationId: station.id,
    stationName: station.name,
    operator: station.operator,
    operatorId: station.operatorId,
    connectorId: connector.id,
    connector: connector.type,
    start: new Date().toISOString(),
    end: null,
    energy: 0,
    cost: 0,
    power: connector.power,
    price: connector.price,
    status: 'active',
    corporate: account.portal === 'business',
  };

  connector.status = 'occupied';
  db.insert('sessions', session);

  const vehicle = db.find('vehicles', v => v.driverId === account.id);
  if (vehicle) vehicle.status = 'charging';
  db.save();

  emit({
    type: 'session.start',
    portal: account.portal,
    actor: account.name,
    message: `Старт зарядки · ${station.name} · ${connector.type} ${connector.power} кВт`,
    entity: session.id,
    payload: { stationId: station.id, connectorId: connector.id, operatorId: station.operatorId },
  });

  res.json({ session, stats: computeStats() });
});

api.post('/sessions/:id/stop', requireAuth('driver', 'business', 'admin', 'operator'), (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  if (session.status !== 'active') return res.status(409).json({ error: 'Сессия уже завершена' });

  const minutes = Math.max(1, (Date.now() - new Date(session.start).getTime()) / 60000);
  // Demo charging curve: ~85% of rated power, capped so short demos stay readable.
  const energy = round(Math.min((session.power ?? 50) * 0.85 * (minutes / 60), 80), 1);
  const cost = Math.round(energy * (session.price ?? 1800));

  session.status = 'completed';
  session.end = new Date().toISOString();
  session.energy = energy;
  session.cost = cost;

  const { connector } = findConnector(session.stationId, session.connectorId);
  if (connector) connector.status = 'available';

  const vehicle = db.find('vehicles', v => v.driverId === session.userId);
  if (vehicle) {
    vehicle.status = 'idle';
    vehicle.battery = Math.min(100, vehicle.battery + Math.round(energy / 1.2));
  }

  const transaction = {
    id: db.nextId('txn', 'TXN-'),
    sessionId: session.id,
    userId: session.userId,
    user: session.user,
    amount: cost,
    method: session.corporate ? 'Корпоративный счёт' : 'Humo',
    status: 'completed',
    time: session.end,
  };
  db.insert('transactions', transaction);

  const walletId = session.corporate ? 'biz-001' : session.userId;
  const wallet = db.data.wallets[walletId];
  if (wallet) wallet.balance = Math.max(0, wallet.balance - cost);

  const operator = db.byId('operators', session.operatorId);
  if (operator) {
    operator.revenue += cost;
    operator.sessions += 1;
  }

  db.save();

  emit({
    type: 'session.stop',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Зарядка завершена · ${session.stationName} · ${energy} кВт·ч · ${cost.toLocaleString('ru-RU')} сум`,
    entity: session.id,
    payload: { transactionId: transaction.id, operatorId: session.operatorId, energy, cost },
  });

  res.json({ session, transaction, stats: computeStats() });
});

/** Live meter tick so an in-progress session grows for every watching portal. */
api.post('/sessions/:id/tick', (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.status !== 'active') return res.status(404).json({ error: 'Нет активной сессии' });

  const minutes = Math.max(0, (Date.now() - new Date(session.start).getTime()) / 60000);
  session.energy = round(Math.min((session.power ?? 50) * 0.85 * (minutes / 60), 80), 1);
  session.cost = Math.round(session.energy * (session.price ?? 1800));
  db.save();

  broadcast({
    id: `tick-${session.id}`,
    type: 'session.tick',
    portal: 'system',
    actor: 'OCPP',
    message: `MeterValues · ${session.energy} кВт·ч`,
    entity: session.id,
    payload: { energy: session.energy, cost: session.cost },
    ts: new Date().toISOString(),
  });

  res.json({ session });
});

// ---------------------------------------------------------------------------
// Operator / admin controls
// ---------------------------------------------------------------------------

api.post('/stations/:id/connectors/:cid', requireAuth('operator', 'admin'), (req, res) => {
  const status = req.body?.status;
  if (!['available', 'unavailable', 'reserved', 'occupied'].includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }
  const { station, connector } = findConnector(req.params.id, req.params.cid);
  if (!station || !connector) return res.status(404).json({ error: 'Коннектор не найден' });
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

  res.json({ station, stats: computeStats() });
});

api.post('/alerts/:id/ack', requireAuth('operator', 'admin'), (req, res) => {
  const alert = db.byId('alerts', req.params.id);
  if (!alert) return res.status(404).json({ error: 'Оповещение не найдено' });

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

  res.json({ alert, stats: computeStats() });
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

  res.json({ alert, stats: computeStats() });
});

api.post('/wallet/topup', requireAuth('driver', 'business'), (req, res) => {
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

api.post('/employees/:id/limit', requireAuth('business', 'admin'), (req, res) => {
  const limit = Number(req.body?.limit);
  if (!Number.isFinite(limit) || limit < 0) return res.status(400).json({ error: 'Некорректный лимит' });
  const employee = db.byId('employees', req.params.id);
  if (!employee) return res.status(404).json({ error: 'Сотрудник не найден' });

  employee.limit = limit;
  employee.status = employee.spent > limit ? 'warning' : 'active';
  db.save();

  emit({
    type: 'employee.limit',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Лимит ${employee.name} → ${limit.toLocaleString('ru-RU')} сум`,
    entity: employee.id,
  });

  res.json({ employee });
});

api.post('/operators/:id/status', requireAuth('admin'), (req, res) => {
  const status = req.body?.status;
  if (!['active', 'pending', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }
  const operator = db.byId('operators', req.params.id);
  if (!operator) return res.status(404).json({ error: 'Оператор не найден' });

  operator.status = status;
  db.save();

  emit({
    type: 'operator.status',
    portal: 'admin',
    actor: req.account.name,
    message: `Оператор ${operator.name} → ${status}`,
    entity: operator.id,
    payload: { status },
  });

  res.json({ operator });
});

api.get('/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 300);
  res.json(db.data.events.slice(0, limit));
});

api.post('/admin/reset', requireAuth('admin'), (req, res) => {
  db.reset();
  emit({
    type: 'system.reset',
    portal: 'admin',
    actor: req.account.name,
    message: 'Демо-данные сброшены к исходным',
  });
  res.json({ ok: true, stats: computeStats() });
});

export { emit, computeStats };

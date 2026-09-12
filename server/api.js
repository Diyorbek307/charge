import express from 'express';
import crypto from 'node:crypto';
import { db, publicAccount } from './db.js';
import { DEMO_ACCOUNTS } from './seed.js';
import { generateSecret, verifyTotp, otpauthUri } from './totp.js';

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
  recordDeliveries(event);
  db.save();
  broadcast(event);
  return event;
}

/**
 * Signs the event for every webhook subscribed to it and records the delivery.
 *
 * Deliberately does not perform the outbound HTTP request: this service is
 * publicly reachable, and POSTing to an arbitrary user-supplied URL would make
 * it an SSRF gadget. Partners get the exact signed payload and headers they
 * would have received, which is what a sandbox needs.
 */
function recordDeliveries(event) {
  const hooks = (db.data.webhooks ?? []).filter(
    w => w.active && w.events.includes(event.type),
  );
  if (hooks.length === 0) return;

  for (const hook of hooks) {
    const body = JSON.stringify({
      id: event.id,
      type: event.type,
      created: event.ts,
      data: { actor: event.actor, portal: event.portal, message: event.message, entity: event.entity, ...event.payload },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', hook.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    db.data.deliveries.unshift({
      id: db.nextId('delivery', 'DLV-'),
      webhookId: hook.id,
      event: event.type,
      url: hook.url,
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-OneCharge-Event': event.type,
        'X-OneCharge-Timestamp': String(timestamp),
        'X-OneCharge-Signature': `t=${timestamp},v1=${signature}`,
      },
      status: 'signed',
      ts: new Date().toISOString(),
    });
  }
  if (db.data.deliveries.length > 200) db.data.deliveries.length = 200;
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

  // With 2FA on, the password only earns a short-lived challenge.
  if (account.twoFactor?.enabled) {
    const challenge = crypto.randomBytes(18).toString('hex');
    db.data.challenges.unshift({
      challenge,
      accountId: account.id,
      expires: Date.now() + 5 * 60_000,
    });
    if (db.data.challenges.length > 50) db.data.challenges.length = 50;
    db.save();
    return res.json({ requires2fa: true, challenge });
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

// ---------------------------------------------------------------------------
// Two-factor authentication (TOTP, RFC 6238)
// ---------------------------------------------------------------------------

api.post('/auth/2fa/verify', (req, res) => {
  const { challenge, code } = req.body ?? {};
  const idx = db.data.challenges.findIndex(c => c.challenge === challenge);
  if (idx < 0) return res.status(401).json({ error: 'Сессия входа истекла' });

  const entry = db.data.challenges[idx];
  if (entry.expires < Date.now()) {
    db.data.challenges.splice(idx, 1);
    db.save();
    return res.status(401).json({ error: 'Сессия входа истекла' });
  }

  const account = db.byId('accounts', entry.accountId);
  if (!account || !verifyTotp(account.twoFactor.secret, code)) {
    return res.status(401).json({ error: 'Неверный код подтверждения' });
  }

  // One challenge, one login.
  db.data.challenges.splice(idx, 1);
  const token = db.issueToken(account);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  emit({
    type: 'auth.login',
    portal: account.portal,
    actor: account.name,
    message: `${account.name} вошёл в ${portalLabel(account.portal)} (2FA)`,
    entity: account.id,
  });

  res.json({ token, user: publicAccount(account) });
});

api.get('/auth/2fa', requireAuth(), (req, res) => {
  res.json({ enabled: !!req.account.twoFactor?.enabled });
});

/** Issues a secret but leaves 2FA off until a code proves the app is paired. */
api.post('/auth/2fa/setup', requireAuth(), (req, res) => {
  const secret = generateSecret();
  req.account.twoFactor = { ...(req.account.twoFactor ?? {}), pending: secret };
  db.save();
  res.json({ secret, uri: otpauthUri(secret, req.account.login) });
});

api.post('/auth/2fa/enable', requireAuth(), (req, res) => {
  const pending = req.account.twoFactor?.pending;
  if (!pending) return res.status(400).json({ error: 'Сначала запросите секрет' });
  if (!verifyTotp(pending, req.body?.code)) {
    return res.status(401).json({ error: 'Код не совпал — проверьте время на телефоне' });
  }

  req.account.twoFactor = { enabled: true, secret: pending, pending: null };
  db.save();
  emit({
    type: 'auth.2fa',
    portal: req.account.portal,
    actor: req.account.name,
    message: `${req.account.name} включил двухфакторную аутентификацию`,
    entity: req.account.id,
  });
  res.json({ enabled: true });
});

api.post('/auth/2fa/disable', requireAuth(), (req, res) => {
  if (!req.account.twoFactor?.enabled) return res.json({ enabled: false });
  // Disabling is privileged too — require a current code.
  if (!verifyTotp(req.account.twoFactor.secret, req.body?.code)) {
    return res.status(401).json({ error: 'Неверный код подтверждения' });
  }
  req.account.twoFactor = { enabled: false, secret: null, pending: null };
  db.save();
  emit({
    type: 'auth.2fa',
    portal: req.account.portal,
    actor: req.account.name,
    message: `${req.account.name} отключил двухфакторную аутентификацию`,
    entity: req.account.id,
  });
  res.json({ enabled: false });
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
    queues: pruneQueues(),
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

/** How long a freed connector is held for the driver at the head of the queue. */
const QUEUE_HOLD_MS = 5 * 60_000;

/** Drops holds nobody claimed in time and returns the live queue. */
function pruneQueues() {
  const now = Date.now();
  const before = db.data.queues.length;
  db.data.queues = db.data.queues.filter(q => !q.notified || now - q.notifiedAt < QUEUE_HOLD_MS);
  if (db.data.queues.length !== before) db.save();
  return db.data.queues;
}

/** Connectors a station has free right now that are not held for the queue. */
function unheldFree(station) {
  const free = station.connectors.filter(c => c.status === 'available').length;
  const held = db.data.queues.filter(q => q.stationId === station.id && q.notified).length;
  return free - held;
}

/** A connector just freed up: hand it to whoever has waited longest. */
function promoteQueue(stationId, connectorId) {
  pruneQueues();
  const next = db.data.queues.find(q => q.stationId === stationId && !q.notified);
  if (!next) return;
  next.notified = true;
  next.notifiedAt = Date.now();
  next.connectorId = connectorId;
  emit({
    type: 'queue.ready',
    portal: 'system',
    actor: 'ONE CHARGE',
    message: `Коннектор ${connectorId} освободился — очередь подошла для ${next.user}`,
    entity: next.id,
    payload: { userId: next.userId, stationId, connectorId },
  });
}

/** Minimum prepaid energy a wallet must cover before a session may start. */
const MIN_PREPAID_KWH = 5;

/** Owner, the operator running that station's network, or an admin. */
function canControlSession(account, session) {
  if (account.portal === 'admin') return true;
  if (account.portal === 'operator') return session.operatorId === account.orgId;
  return session.userId === account.id;
}

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

  // One car, one plug: without this a single account could occupy the network.
  if (db.data.sessions.some(s => s.status === 'active' && s.userId === account.id)) {
    return res.status(409).json({ error: 'У вас уже идёт зарядка' });
  }

  // A connector freed for the queue belongs to that driver until the hold lapses.
  pruneQueues();
  const holdsMine = db.data.queues.some(
    q => q.stationId === station.id && q.userId === account.id && q.notified,
  );
  if (!holdsMine && unheldFree(station) <= 0) {
    return res.status(409).json({ error: 'Коннектор удерживается для водителя из очереди' });
  }

  // Refuse to start what the wallet cannot pay for; otherwise stop() clamps
  // the balance at zero and the charge is effectively free.
  const walletId = account.portal === 'business' ? 'biz-001' : account.id;
  const wallet = db.data.wallets[walletId];
  const minimum = connector.price * MIN_PREPAID_KWH;
  if (wallet && wallet.balance < minimum) {
    return res.status(402).json({
      error: `Недостаточно средств: нужно минимум ${minimum.toLocaleString('ru-RU')} сум`,
    });
  }
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
    // Price is locked at start with the tariff band in effect right now.
    basePrice: connector.price,
    multiplier: tariffBand(tashkentHour()).multiplier,
    price: Math.round(connector.price * tariffBand(tashkentHour()).multiplier),
    status: 'active',
    corporate: account.portal === 'business',
  };

  connector.status = 'occupied';
  // Starting here settles this driver's place in the station's queue.
  db.data.queues = db.data.queues.filter(q => !(q.stationId === station.id && q.userId === account.id));
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
  if (!canControlSession(req.account, session)) {
    return res.status(403).json({ error: 'Нет прав на эту сессию' });
  }
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
    vehicle.status = 'available';
    vehicle.battery = Math.min(100, vehicle.battery + Math.round(energy / 1.2));
    vehicle.charged += 1;
    vehicle.cost += cost;
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

  promoteQueue(session.stationId, session.connectorId);

  res.json({ session, transaction, stats: computeStats() });
});

/** Live meter tick so an in-progress session grows for every watching portal. */
api.post('/sessions/:id/tick', requireAuth(), (req, res) => {
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

// ---------------------------------------------------------------------------
// Station queue — wait for a busy station instead of circling the car park.
// ---------------------------------------------------------------------------

api.post('/stations/:id/queue', requireAuth('driver', 'business'), (req, res) => {
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
  db.data.queues.push(entry);
  const position = db.data.queues.filter(q => q.stationId === station.id).length;
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

// ---------------------------------------------------------------------------
// Green hours — cheaper when the grid is quiet, dearer in the evening peak.
// ---------------------------------------------------------------------------

const TASHKENT_UTC_OFFSET = 5;

function tashkentHour(date = new Date()) {
  return (date.getUTCHours() + TASHKENT_UTC_OFFSET) % 24;
}

function tariffBand(hour) {
  if (hour >= 23 || hour < 7) return { band: 'green', multiplier: 0.7 };
  if (hour >= 17 && hour < 22) return { band: 'peak', multiplier: 1.25 };
  if (hour >= 10 && hour < 17) return { band: 'day', multiplier: 0.9 };
  return { band: 'standard', multiplier: 1 };
}

api.get('/tariffs/forecast', (_req, res) => {
  const now = tashkentHour();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ...tariffBand(hour) }));
  const cheapest = Math.min(...hours.map(h => h.multiplier));

  // The next run of cheapest hours, starting from now.
  let from = now;
  for (let i = 0; i < 24; i++) {
    const h = (now + i) % 24;
    if (hours[h].multiplier === cheapest) {
      from = h;
      break;
    }
  }
  let length = 0;
  while (length < 24 && hours[(from + length) % 24].multiplier === cheapest) length++;

  res.json({
    timezone: 'Asia/Tashkent',
    currentHour: now,
    current: hours[now],
    hours,
    bestWindow: { from, to: (from + length) % 24, multiplier: cheapest, startsInHours: (from - now + 24) % 24 },
  });
});

// ---------------------------------------------------------------------------
// Driver issue reports — land as an alert on the owning operator's console.
// ---------------------------------------------------------------------------

const ISSUE_COOLDOWN_MS = 10 * 60_000;

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
      Date.now() - new Date(a.time).getTime() < ISSUE_COOLDOWN_MS,
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

// ---------------------------------------------------------------------------
// Eco profile — what driving electric actually saved, plus a little glory.
// ---------------------------------------------------------------------------

// Petrol displaced per kWh minus grid emissions for Uzbekistan's mix; rough
// on purpose — this is motivation, not an emissions audit.
const CO2_KG_PER_KWH = 0.6;
const KM_PER_KWH = 5.5;
const CO2_KG_PER_TREE_YEAR = 21;

function ecoFor(userId) {
  const done = db.data.sessions.filter(s => s.userId === userId && s.status === 'completed');
  const kwh = round(done.reduce((n, s) => n + s.energy, 0), 1);
  const co2Kg = round(kwh * CO2_KG_PER_KWH, 1);
  const stationsVisited = new Set(done.map(s => s.stationId)).size;
  const greenHour = s => {
    const h = tashkentHour(new Date(s.start));
    return h >= 23 || h < 7;
  };

  return {
    sessions: done.length,
    kwh,
    co2Kg,
    trees: round(co2Kg / CO2_KG_PER_TREE_YEAR, 2),
    km: Math.round(kwh * KM_PER_KWH),
    stationsVisited,
    badges: [
      { id: 'first', title: 'Первая зарядка', description: 'Завершить первую сессию', earned: done.length >= 1 },
      { id: 'night', title: 'Ночная птица', description: 'Зарядиться в зелёные часы 23:00–07:00', earned: done.some(greenHour) },
      { id: 'green', title: 'Зелёный тариф', description: 'Сессия по сниженной цене', earned: done.some(s => (s.multiplier ?? 1) < 1) },
      { id: 'explorer', title: 'Исследователь', description: 'Зарядиться на 3 разных станциях', earned: stationsVisited >= 3 },
      { id: 'century', title: '100 кВт·ч', description: 'Накопить 100 кВт·ч', earned: kwh >= 100 },
    ],
  };
}

api.get('/eco/me', requireAuth('driver', 'business'), (req, res) => {
  res.json(ecoFor(req.account.id));
});

api.get('/eco/leaderboard', (req, res) => {
  const me = db.resolveToken(bearer(req))?.account?.id ?? null;
  const totals = new Map();
  for (const s of db.data.sessions) {
    if (s.status !== 'completed') continue;
    const row = totals.get(s.userId) ?? { userId: s.userId, name: s.user, kwh: 0 };
    row.kwh += s.energy;
    totals.set(s.userId, row);
  }
  // Public board: first name and an initial only.
  const shortName = n => {
    const [first, last] = String(n).split(' ');
    return last ? `${first} ${last[0]}.` : first;
  };
  res.json(
    [...totals.values()]
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        name: shortName(r.name),
        kwh: round(r.kwh, 1),
        co2Kg: round(r.kwh * CO2_KG_PER_KWH, 1),
        me: r.userId === me,
      })),
  );
});

api.post('/wallets/:id/balance', requireAuth('admin'), (req, res) => {
  const balance = Number(req.body?.balance);
  if (!Number.isFinite(balance) || balance < 0) return res.status(400).json({ error: 'Некорректный баланс' });
  const wallet = db.data.wallets[req.params.id];
  if (!wallet) return res.status(404).json({ error: 'Кошелёк не найден' });

  wallet.balance = balance;
  db.save();
  emit({
    type: 'wallet.adjust',
    portal: 'admin',
    actor: req.account.name,
    message: `Баланс ${req.params.id} скорректирован → ${balance.toLocaleString('ru-RU')} сум`,
    entity: req.params.id,
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

// ---------------------------------------------------------------------------
// Partner webhooks
// ---------------------------------------------------------------------------

const WEBHOOK_EVENTS = [
  'session.start',
  'session.stop',
  'evse.status',
  'alert.new',
  'alert.ack',
  'wallet.topup',
  'operator.status',
];

api.get('/webhooks/events', (_req, res) => res.json(WEBHOOK_EVENTS));

api.get('/webhooks', requireAuth('api', 'admin'), (_req, res) => {
  res.json(
    (db.data.webhooks ?? []).map(w => ({
      ...w,
      // Show only a prefix; the full secret is returned once, at creation.
      secret: `${w.secret.slice(0, 11)}…${w.secret.slice(-4)}`,
    })),
  );
});

api.post('/webhooks', requireAuth('api', 'admin'), (req, res) => {
  const { url, events } = req.body ?? {};
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return res.status(400).json({ error: 'Некорректный URL' });
  }
  if (parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Endpoint должен использовать HTTPS' });
  }
  const chosen = Array.isArray(events) ? events.filter(e => WEBHOOK_EVENTS.includes(e)) : [];
  if (chosen.length === 0) {
    return res.status(400).json({ error: 'Выберите хотя бы одно событие' });
  }

  const hook = {
    id: db.nextId('webhook', 'wh-'),
    url: parsed.toString(),
    events: chosen,
    secret: 'whsec_' + crypto.randomBytes(16).toString('hex'),
    active: true,
    created: new Date().toISOString(),
    owner: req.account.id,
  };
  db.insert('webhooks', hook);

  emit({
    type: 'webhook.created',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Webhook зарегистрирован · ${chosen.length} событий`,
    entity: hook.id,
  });

  // The only time the full secret is revealed.
  res.json({ webhook: hook });
});

api.post('/webhooks/:id/toggle', requireAuth('api', 'admin'), (req, res) => {
  const hook = db.byId('webhooks', req.params.id);
  if (!hook) return res.status(404).json({ error: 'Webhook не найден' });
  hook.active = !hook.active;
  db.save();
  res.json({ webhook: { ...hook, secret: `${hook.secret.slice(0, 11)}…${hook.secret.slice(-4)}` } });
});

api.delete('/webhooks/:id', requireAuth('api', 'admin'), (req, res) => {
  const i = (db.data.webhooks ?? []).findIndex(w => w.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Webhook не найден' });
  db.data.webhooks.splice(i, 1);
  db.save();
  res.json({ ok: true });
});

api.post('/webhooks/:id/test', requireAuth('api', 'admin'), (req, res) => {
  const hook = db.byId('webhooks', req.params.id);
  if (!hook) return res.status(404).json({ error: 'Webhook не найден' });
  emit({
    type: hook.events[0],
    portal: req.account.portal,
    actor: req.account.name,
    message: 'Тестовое событие для проверки подписи',
    entity: hook.id,
    payload: { test: true },
  });
  res.json({ ok: true });
});

api.get('/webhooks/deliveries', requireAuth('api', 'admin'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  res.json((db.data.deliveries ?? []).slice(0, limit));
});

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

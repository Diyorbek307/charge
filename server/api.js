import express from 'express';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { db, publicAccount } from './db.js';
import { DEMO_ACCOUNTS } from './seed.js';
import { generateSecret, verifyTotp, otpauthUri } from './totp.js';

export const api = express.Router();
api.use(express.json());

// Carries the current request through synchronous handler code so emit() can
// scope an event to whoever caused it.
const requestContext = new AsyncLocalStorage();
api.use((req, _res, next) => requestContext.run({ req }, next));
const actingAccount = () => requestContext.getStore()?.req?.account ?? null;

/** Demo credentials endpoint is for the public prototype only. */
const DEMO_MODE = process.env.DEMO_MODE !== 'false';

// ---------------------------------------------------------------------------
// Live sync: every mutation is broadcast to all connected portals over SSE.
// ---------------------------------------------------------------------------

/** Live subscribers: { res, viewer } where viewer is null for anonymous. */
const clients = new Set();

function broadcast(event) {
  for (const client of clients) {
    if (!canSee(client.viewer, event)) continue;
    try {
      client.res.write(`data: ${JSON.stringify(viewFor(client.viewer, event))}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// Visibility. Every event carries a scope; state and events are filtered by it.
// ---------------------------------------------------------------------------

const withScope = event => ((event.scope = scopeOf(event)), event);

const stationOperator = id => db.byId('stations', id)?.operatorId ?? null;

function sessionScope(id) {
  const s = db.byId('sessions', id);
  return s ? { userId: s.userId, operatorId: s.operatorId, fleet: !!s.corporate, stationName: s.stationName } : {};
}

/** Who may see an event. Unknown types are admin-only by default. */
function scopeOf({ type, entity, payload = {} }) {
  const actor = actingAccount();
  if (payload?.test) return { userId: actor?.id };

  switch (type) {
    case 'auth.login':
    case 'auth.2fa':
      return { userId: entity };
    case 'webhook.created':
      return { userId: actor?.id };
    case 'report.export':
      return {
        userId: actor?.id,
        operatorId: actor?.portal === 'operator' ? actor.orgId : null,
        fleet: actor?.portal === 'business',
      };
    case 'session.start':
    case 'session.stop':
      return { ...sessionScope(entity), public: true };
    case 'session.tick':
      return { ...sessionScope(entity), public: false };
    case 'evse.status':
      return { operatorId: stationOperator(payload.stationId), public: true };
    case 'alert.new':
    case 'alert.ack': {
      const alert = db.byId('alerts', entity);
      return { operatorId: alert?.operatorId ?? null, userId: alert?.reporterId ?? null };
    }
    case 'queue.join':
      return { userId: actor?.id, operatorId: stationOperator(payload.stationId) };
    case 'queue.leave':
      return { userId: actor?.id, operatorId: stationOperator(entity) };
    case 'queue.ready':
      return { userId: payload.userId, operatorId: stationOperator(payload.stationId) };
    case 'wallet.topup':
    case 'wallet.adjust':
      return entity === 'biz-001' ? { fleet: true } : { userId: entity };
    case 'booking.create':
    case 'booking.cancel':
    case 'booking.expire': {
      const b = db.byId('bookings', entity);
      return { userId: b?.userId, operatorId: b?.operatorId, fleet: b?.walletId === 'biz-001' };
    }
    case 'ocpp.online':
    case 'ocpp.offline':
      return { operatorId: stationOperator(entity), public: true };
    case 'employee.limit':
      return { fleet: true };
    case 'operator.status':
      return { operatorId: entity };
    case 'system.reset':
      return { public: true };
    default:
      return {};
  }
}

/** Full access to an event, as opposed to its public, anonymised form. */
function entitled(viewer, event) {
  if (!viewer) return false;
  const sc = event.scope ?? {};
  if (viewer.portal === 'admin') return true;
  if (viewer.portal === 'operator') return !!sc.operatorId && sc.operatorId === viewer.orgId;
  if (sc.userId && sc.userId === viewer.id) return true;
  return viewer.portal === 'business' && !!sc.fleet;
}

function canSee(viewer, event) {
  return entitled(viewer, event) || !!event.scope?.public;
}

const PUBLIC_MESSAGE = {
  'session.start': e => `Старт зарядки · ${e.scope?.stationName ?? 'станция'}`,
  'session.stop': e => `Зарядка завершена · ${e.scope?.stationName ?? 'станция'}`,
};

/** The anonymised form: no person, no money, only network facts. */
function publicView(event) {
  const pick = ['stationId', 'connectorId', 'status'];
  const payload = Object.fromEntries(Object.entries(event.payload ?? {}).filter(([k]) => pick.includes(k)));
  return {
    id: event.id,
    type: event.type,
    portal: 'system',
    actor: 'ONE CHARGE',
    message: PUBLIC_MESSAGE[event.type]?.(event) ?? event.message,
    entity: null,
    payload,
    ts: event.ts,
  };
}

function viewFor(viewer, event) {
  if (entitled(viewer, event)) {
    const { scope, ...rest } = event;
    return rest;
  }
  return publicView(event);
}

function visibleEvents(viewer, limit = 60) {
  return db.data.events.filter(e => canSee(viewer, e)).slice(0, limit).map(e => viewFor(viewer, e));
}

/** Partner webhooks get the anonymised form: they integrate with the network, not with people. */
function webhookData(event) {
  const pv = publicView(event);
  return { message: pv.message, ...pv.payload };
}

const viewerOf = req => db.resolveToken(bearer(req))?.account ?? null;

function statsFor(viewer) {
  const full = computeStats();
  if (viewer?.portal === 'admin') return full;
  if (viewer?.portal === 'operator') {
    const mine = db.data.sessions.filter(s => s.operatorId === viewer.orgId && s.status === 'completed');
    return {
      ...full,
      revenueToday: mine.reduce((n, s) => n + s.cost, 0),
      openAlerts: db.data.alerts.filter(a => !a.ack && (!a.operatorId || a.operatorId === viewer.orgId)).length,
    };
  }
  return { ...full, revenueToday: null, openAlerts: 0 };
}

const anonBooking = b => ({
  id: b.id,
  stationId: b.stationId,
  connectorId: b.connectorId,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  graceUntil: b.graceUntil,
  status: b.status,
});

const anonQueue = q => ({
  id: q.id,
  stationId: q.stationId,
  joined: q.joined,
  notified: q.notified,
  notifiedAt: q.notifiedAt,
  connectorId: null,
});

/** The slice of shared state a given viewer is allowed to hold. */
function stateFor(viewer) {
  const d = db.data;
  const queues = pruneQueues();
  const activeBookings = pruneBookings().filter(b => b.status === 'active');
  const bookingsFor = v => [
    ...d.bookings.filter(b => b.userId === v.id),
    ...activeBookings.filter(b => b.userId !== v.id).map(anonBooking),
  ];
  const publicOperators = d.operators.map(({ id, name, logo, stations, evse, status, integration, since, region }) => ({
    id, name, logo, stations, evse, status, integration, since, region,
  }));
  const txFor = sessions => {
    const ids = new Set(sessions.map(s => s.id));
    return d.transactions.filter(t => ids.has(t.sessionId));
  };
  const base = {
    stations: d.stations,
    operators: publicOperators,
    sessions: [],
    transactions: [],
    alerts: [],
    vehicles: [],
    employees: [],
    wallets: {},
    queues: queues.map(anonQueue),
    bookings: activeBookings.map(anonBooking),
    events: visibleEvents(viewer),
    stats: statsFor(viewer),
    serverTime: new Date().toISOString(),
  };
  if (!viewer || viewer.portal === 'api') return base;

  if (viewer.portal === 'admin') {
    return {
      ...base,
      operators: d.operators,
      sessions: d.sessions,
      transactions: d.transactions,
      alerts: d.alerts,
      vehicles: d.vehicles,
      employees: d.employees,
      wallets: d.wallets,
      queues,
      bookings: d.bookings,
    };
  }

  const ownQueue = q => (q.userId === viewer.id ? q : anonQueue(q));

  if (viewer.portal === 'operator') {
    const sessions = d.sessions.filter(s => s.operatorId === viewer.orgId);
    const ownStations = new Set(d.stations.filter(st => st.operatorId === viewer.orgId).map(st => st.id));
    return {
      ...base,
      sessions,
      transactions: txFor(sessions),
      alerts: d.alerts.filter(a => !a.operatorId || a.operatorId === viewer.orgId),
      queues: queues.map(q => (ownStations.has(q.stationId) ? q : anonQueue(q))),
      bookings: activeBookings.map(b => (ownStations.has(b.stationId) ? b : anonBooking(b))),
    };
  }

  if (viewer.portal === 'business') {
    const sessions = d.sessions.filter(s => s.corporate || s.userId === viewer.id);
    return {
      ...base,
      sessions,
      transactions: txFor(sessions),
      vehicles: d.vehicles,
      employees: d.employees,
      wallets: d.wallets[viewer.orgId] ? { [viewer.orgId]: d.wallets[viewer.orgId] } : {},
      queues: queues.map(ownQueue),
      bookings: bookingsFor(viewer),
    };
  }

  // driver
  const sessions = d.sessions.filter(s => s.userId === viewer.id);
  return {
    ...base,
    sessions,
    transactions: txFor(sessions),
    vehicles: d.vehicles.filter(v => v.driverId === viewer.id),
    wallets: d.wallets[viewer.id] ? { [viewer.id]: d.wallets[viewer.id] } : {},
    queues: queues.map(ownQueue),
    bookings: bookingsFor(viewer),
  };
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
  event.scope = scopeOf(event);
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
      data: webhookData(event),
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

const streamTickets = new Map();

/** Swaps a bearer token for a short-lived, single-use stream ticket. */
api.post('/stream/ticket', requireAuth(), (req, res) => {
  const now = Date.now();
  for (const [k, v] of streamTickets) if (v.expires < now) streamTickets.delete(k);
  const ticket = crypto.randomBytes(18).toString('hex');
  streamTickets.set(ticket, { accountId: req.account.id, expires: now + 60_000 });
  res.json({ ticket });
});

api.get('/stream', (req, res) => {
  let viewer = null;
  if (req.query.ticket) {
    const entry = streamTickets.get(String(req.query.ticket));
    streamTickets.delete(String(req.query.ticket));
    viewer = entry && entry.expires >= Date.now() ? db.byId('accounts', entry.accountId) : null;
    if (!viewer) return res.status(401).json({ error: 'Недействительный тикет' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`retry: 3000\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`);

  const client = { res, viewer };
  clients.add(client);

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
    clients.delete(client);
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
  if (!DEMO_MODE) return res.status(404).json({ error: 'Not found' });
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

api.get('/state', (req, res) => {
  res.json(stateFor(viewerOf(req)));
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

/**
 * Charge-point gateway (OCPP). Registered by server/ocpp.js at startup and
 * injected here, so this module never imports the WebSocket layer.
 */
let gateway = null;
export function setGateway(g) {
  gateway = g;
}

/**
 * Opens a charging session after every business rule the API enforces. The
 * REST API and the OCPP central system both go through here, so a charge
 * point cannot bypass a rule a driver in the app would hit.
 *
 * Returns { session }, { ok: true } for a dry run, or { status, error }.
 */
export function beginSession(account, stationId, connectorId, opts = {}) {
  const { source = 'app', ocppTransactionId = null, meterStartWh = null, dryRun = false } = opts;
  const { station, connector } = findConnector(stationId, connectorId);
  if (!station || !connector) return { status: 404, error: 'Коннектор не найден' };
  if (connector.status === 'occupied') return { status: 409, error: 'Коннектор уже занят' };
  if (connector.status === 'unavailable') return { status: 409, error: 'Коннектор недоступен' };

  // One car, one plug: without this a single account could occupy the network.
  if (db.data.sessions.some(s => s.status === 'active' && s.userId === account.id)) {
    return { status: 409, error: 'У вас уже идёт зарядка' };
  }

  // A booking holds its connector for its owner around the booked window.
  const booked = bookingHolding(station.id, connector.id);
  if (booked && booked.userId !== account.id) return { status: 409, error: 'Коннектор забронирован' };

  // A connector freed for the queue belongs to that driver until the hold lapses.
  pruneQueues();
  const holdsMine = db.data.queues.some(
    q => q.stationId === station.id && q.userId === account.id && q.notified,
  );
  if (!holdsMine && unheldFree(station) <= 0) {
    return { status: 409, error: 'Коннектор удерживается для водителя из очереди' };
  }

  // Refuse to start what the wallet cannot pay for; otherwise settlement clamps
  // the balance at zero and the charge is effectively free.
  const walletId = account.portal === 'business' ? 'biz-001' : account.id;
  const wallet = db.data.wallets[walletId];
  const minimum = connector.price * MIN_PREPAID_KWH;
  if (wallet && wallet.balance < minimum) {
    return { status: 402, error: `Недостаточно средств: нужно минимум ${minimum.toLocaleString('ru-RU')} сум` };
  }
  if (dryRun) return { ok: true };

  const band = tariffBand(tashkentHour());
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
    multiplier: band.multiplier,
    price: Math.round(connector.price * band.multiplier),
    status: 'active',
    corporate: account.portal === 'business',
    source,
    ocppTransactionId,
    meterStartWh,
  };

  connector.status = 'occupied';
  if (booked) booked.status = 'used';
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

  return { session };
}

api.post('/sessions/start', requireAuth('driver', 'business', 'admin'), async (req, res) => {
  const { stationId, connectorId } = req.body ?? {};

  // A station connected over OCPP is the source of truth: ask it to start, and
  // the session opens when it reports StartTransaction.
  if (gateway?.isConnected(stationId)) {
    const check = beginSession(req.account, stationId, connectorId, { dryRun: true });
    if (check.error) return res.status(check.status).json({ error: check.error });
    const accepted = await gateway.remoteStart(stationId, connectorId, req.account.id);
    if (!accepted) return res.status(502).json({ error: 'Станция не приняла команду запуска' });
    return res.status(202).json({ pending: true, stats: statsFor(req.account) });
  }

  const result = beginSession(req.account, stationId, connectorId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ session: result.session, stats: statsFor(req.account) });
});

/**
 * Closes a session and settles it. Energy comes from the charge point's meter
 * when it reports one, otherwise from the demo charging curve.
 */
export function completeSession(session, actor, { energyKwh = null } = {}) {
  const minutes = Math.max(1, (Date.now() - new Date(session.start).getTime()) / 60000);
  // Demo charging curve: ~85% of rated power, capped so short demos stay readable.
  const energy =
    energyKwh === null
      ? round(Math.min((session.power ?? 50) * 0.85 * (minutes / 60), 80), 1)
      : round(Math.max(0, energyKwh), 1);
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
    portal: actor.portal,
    actor: actor.name,
    message: `Зарядка завершена · ${session.stationName} · ${energy} кВт·ч · ${cost.toLocaleString('ru-RU')} сум`,
    entity: session.id,
    payload: { transactionId: transaction.id, operatorId: session.operatorId, energy, cost },
  });

  promoteQueue(session.stationId, session.connectorId);
  return { session, transaction };
}

api.post('/sessions/:id/stop', requireAuth('driver', 'business', 'admin', 'operator'), async (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  if (!canControlSession(req.account, session)) {
    return res.status(403).json({ error: 'Нет прав на эту сессию' });
  }
  if (session.status !== 'active') return res.status(409).json({ error: 'Сессия уже завершена' });

  // A charge under OCPP control is stopped by the charge point, which then
  // reports the final meter reading.
  if (session.source === 'ocpp' && gateway?.isConnected(session.stationId)) {
    const accepted = await gateway.remoteStop(session.stationId, session.ocppTransactionId);
    if (!accepted) return res.status(502).json({ error: 'Станция не приняла команду остановки' });
    return res.status(202).json({ pending: true, session, stats: statsFor(req.account) });
  }

  const { transaction } = completeSession(session, req.account);
  res.json({ session, transaction, stats: statsFor(req.account) });
});

/** Live meter tick so an in-progress session grows for every watching portal. */
api.post('/sessions/:id/tick', requireAuth(), (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.status !== 'active') return res.status(404).json({ error: 'Нет активной сессии' });
  // A charge point connected over OCPP owns the meter for its sessions.
  if (session.source === 'ocpp') return res.json({ session });

  const minutes = Math.max(0, (Date.now() - new Date(session.start).getTime()) / 60000);
  session.energy = round(Math.min((session.power ?? 50) * 0.85 * (minutes / 60), 80), 1);
  session.cost = Math.round(session.energy * (session.price ?? 1800));
  db.save();

  broadcast(withScope({
    id: `tick-${session.id}-${Date.now()}`,
    type: 'session.tick',
    portal: 'system',
    actor: 'OCPP',
    message: `MeterValues · ${session.energy} кВт·ч`,
    entity: session.id,
    payload: { energy: session.energy, cost: session.cost },
    ts: new Date().toISOString(),
  }));

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

  res.json({ station, stats: statsFor(req.account) });
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

// ---------------------------------------------------------------------------
// Bookings — reserve a connector for a time window.
// ---------------------------------------------------------------------------

const BOOKING_FEE = 2000;
const BOOKING_GRACE_MS = 15 * 60_000;
const BOOKING_LEAD_MS = 10 * 60_000;
const BOOKING_HORIZON_MS = 24 * 60 * 60_000;

const ms = iso => new Date(iso).getTime();
const bookingEnd = b => Math.max(ms(b.endsAt), ms(b.graceUntil));

/** No-shows lose their booking once the grace period passes. */
function pruneBookings() {
  const now = Date.now();
  for (const b of db.data.bookings) {
    if (b.status !== 'active' || now <= ms(b.graceUntil)) continue;
    b.status = 'expired';
    db.save();
    emit({
      type: 'booking.expire',
      portal: 'system',
      actor: 'ONE CHARGE',
      message: `Бронь ${b.code} истекла — водитель не приехал`,
      entity: b.id,
      payload: { stationId: b.stationId, connectorId: b.connectorId },
    });
  }
  return db.data.bookings;
}

/** The active booking holding a connector right now, if any. */
function bookingHolding(stationId, connectorId, at = Date.now()) {
  pruneBookings();
  return (
    db.data.bookings.find(
      b =>
        b.status === 'active' &&
        b.stationId === stationId &&
        b.connectorId === connectorId &&
        ms(b.startsAt) - BOOKING_LEAD_MS <= at &&
        at <= ms(b.graceUntil),
    ) ?? null
  );
}

api.post('/stations/:id/bookings', requireAuth('driver', 'business'), (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });
  const connector = station.connectors.find(c => c.id === req.body?.connectorId);
  if (!connector) return res.status(404).json({ error: 'Коннектор не найден' });
  if (connector.status === 'unavailable') return res.status(409).json({ error: 'Коннектор недоступен' });

  const minutes = Number(req.body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) {
    return res.status(400).json({ error: 'Длительность — от 15 минут до 4 часов' });
  }
  const startMs = ms(req.body?.startsAt);
  const now = Date.now();
  if (Number.isNaN(startMs)) return res.status(400).json({ error: 'Некорректное время начала' });
  if (startMs < now - 60_000) return res.status(400).json({ error: 'Время начала уже прошло' });
  if (startMs > now + BOOKING_HORIZON_MS) {
    return res.status(400).json({ error: 'Бронировать можно не больше чем на сутки вперёд' });
  }

  pruneBookings();
  const account = req.account;
  if (db.data.bookings.some(b => b.status === 'active' && b.userId === account.id)) {
    return res.status(409).json({ error: 'У вас уже есть активная бронь' });
  }

  const endMs = startMs + minutes * 60_000;
  const graceMs = startMs + BOOKING_GRACE_MS;
  const windowEnd = Math.max(endMs, graceMs);
  const clash = db.data.bookings.some(
    b =>
      b.status === 'active' &&
      b.stationId === station.id &&
      b.connectorId === connector.id &&
      ms(b.startsAt) < windowEnd &&
      startMs < bookingEnd(b),
  );
  if (clash) return res.status(409).json({ error: 'Это время уже забронировано' });

  const walletId = account.portal === 'business' ? 'biz-001' : account.id;
  const wallet = db.data.wallets[walletId];
  if (!wallet || wallet.balance < BOOKING_FEE) {
    return res.status(402).json({ error: `Недостаточно средств для брони: ${BOOKING_FEE.toLocaleString('ru-RU')} сум` });
  }
  wallet.balance -= BOOKING_FEE;

  const booking = {
    id: db.nextId('booking', 'BK-'),
    code: `BK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId: account.id,
    user: account.name,
    walletId,
    stationId: station.id,
    stationName: station.name,
    operatorId: station.operatorId,
    connectorId: connector.id,
    connectorType: connector.type,
    power: connector.power,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    graceUntil: new Date(graceMs).toISOString(),
    minutes,
    fee: BOOKING_FEE,
    status: 'active',
    created: new Date(now).toISOString(),
  };
  db.data.bookings.unshift(booking);
  db.save();

  emit({
    type: 'booking.create',
    portal: account.portal,
    actor: account.name,
    message: `Бронь ${booking.code} · ${station.name} · ${connector.type} · ${minutes} мин`,
    entity: booking.id,
    payload: { stationId: station.id, connectorId: connector.id },
  });
  res.json({ booking, wallet });
});

api.delete('/bookings/:id', requireAuth('driver', 'business', 'admin'), (req, res) => {
  pruneBookings();
  const booking = db.byId('bookings', req.params.id);
  if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });
  if (req.account.portal !== 'admin' && booking.userId !== req.account.id) {
    return res.status(403).json({ error: 'Нет прав на эту бронь' });
  }
  if (booking.status !== 'active') return res.status(409).json({ error: 'Бронь уже не активна' });

  booking.status = 'cancelled';
  // Cancelling before the window opens gets the fee back.
  const refunded = Date.now() < ms(booking.startsAt);
  if (refunded && db.data.wallets[booking.walletId]) db.data.wallets[booking.walletId].balance += booking.fee;
  db.save();

  emit({
    type: 'booking.cancel',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Бронь ${booking.code} отменена${refunded ? ' · плата возвращена' : ''}`,
    entity: booking.id,
    payload: { stationId: booking.stationId, connectorId: booking.connectorId, refunded },
  });
  res.json({ booking, refunded });
});

// ---------------------------------------------------------------------------
// OCPP charge points
// ---------------------------------------------------------------------------

api.get('/ocpp/chargepoints', requireAuth('operator', 'admin'), (req, res) => {
  const all = gateway ? gateway.list() : [];
  res.json(req.account.portal === 'admin' ? all : all.filter(cp => cp.operatorId === req.account.orgId));
});

/** Applies a charge point's meter reading to a running session and fans it out. */
export function meterSession(session, energyKwh) {
  session.energy = round(Math.max(0, energyKwh), 1);
  session.cost = Math.round(session.energy * (session.price ?? 1800));
  db.save();
  broadcast(
    withScope({
      id: `tick-${session.id}-${Date.now()}`,
      type: 'session.tick',
      portal: 'system',
      actor: 'OCPP',
      message: `MeterValues · ${session.energy} кВт·ч`,
      entity: session.id,
      payload: { energy: session.energy, cost: session.cost },
      ts: new Date().toISOString(),
    }),
  );
}

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
  res.json(visibleEvents(viewerOf(req), limit));
});

api.post('/admin/reset', requireAuth('admin'), (req, res) => {
  db.reset();
  emit({
    type: 'system.reset',
    portal: 'admin',
    actor: req.account.name,
    message: 'Демо-данные сброшены к исходным',
  });
  res.json({ ok: true, stats: statsFor(req.account) });
});

export { emit, computeStats };

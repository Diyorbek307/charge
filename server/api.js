import { playMoney, realPaymentKeys, mixedMode } from './money.js';
import { DEFAULT_COMMISSION } from './commission.js';
import express from 'express';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { db, publicAccount, twoFactorRequired, REAL_SERVER as PRODUCTION, DEMO_STAFF } from './db.js';
import { tokenOf, clearSessionCookie } from './session.js';
import { alertsStatus, testAlert } from './alerts.js';
import { fcmConfigured } from './fcm.js';
import { DEMO_ACCOUNTS } from './seed.js';
import { generateSecret, verifyTotp, totpStep, otpauthUri } from './totp.js';
import { hashPassword } from './seed.js';
import { normalizePhone, issueCode, consumeCode, PURPOSES, smsConfigured } from './sms.js';
import { submitLead, listLeads, updateLead, LEAD_KINDS } from './leads.js';
import { notifyTeam, mailConfigured, mailbox, mailStatus, sendTestLetter } from './mail.js';
import { joinByCode, onFriendPaid, referralFor } from './referrals.js';
import { analyticsFor, adminUsers, setUserStatus, isBlocked, monthSpend, monthSpendAll, growthFor, investorFor } from './analytics.js';
import { demoEnergy, OPERATORS as DEMO_OPERATORS } from './history.js';
import { riskReport, reviewFinding, cdrReport, bandFor, tariffBands, setTariffBands } from './admin.js';
import { verifyInitData, accountByTelegram, telegramConfigured } from './telegram.js';
import {
  stationForecast, arrivalChance, addReport, confirmReport, stationCommunity, loyaltyFor, redeemPoints, addPoints,
  createSos, setSosStatus, sosFor, allSos, inviteFamily, answerFamily, updateFamily, familyFor, familyAllowance,
  applyHost, decideHost, hostApplicationsFor, allHostApplications, hostEarnings, HOST_COMMISSION,
} from './driverFeatures.js';
import { validateEndpoint, signedHeaders, kick as kickWebhooks } from './webhooks.js';
import {
  creditFor, enrollCredit, verifyFace, consumeFaceToken, creditRefusal, recordDebt, repayCredit, refundDebt,
  deleteCredit, creditOverview, updateCreditProfile, CREDIT_LIMIT, CREDIT_DAYS, CREDIT_TERMS_VERSION,
} from './credit.js';
import {
  directOperatorOf, netBalance, chargeNetwork, refundNetwork, networkWalletsFor, publicPayout, setPayout, directReport,
} from './direct.js';
import { promoFor, publicPromos, createPromo, createCampaign, stopPromo, promosOf } from './promos.js';
import { syncRewards, rewardsFor, bonusFor, spendBonus, rewardsOverview, grantManual } from './rewards.js';
import { batteryHealthFor } from './battery.js';
import { setting, feature, updateSettings, settingsView, publicSettings } from './settings.js';
import { attempt, blocked, forgive, hashPasswordAsync, verifyPasswordAsync } from './guard.js';

/** Answers a refused try with when to try again. */
const tooMany = (res, r, text = 'Слишком много попыток — попробуйте позже') => {
  res.set('Retry-After', String(r.retryAfter));
  return res.status(429).json({ error: `${text} (через ${Math.max(1, Math.ceil(r.retryAfter / 60))} мин)` });
};
import { PLUS, plusActive, plusFor, subscribePlus, cancelPlus, plusOverview } from './plus.js';
import { fleetPlanFor, setFleetPlan, fleetDiscount, fleetPriority, fleetDriverReport } from './fleet.js';
import { openWindow, autochargeFor, unlink as unlinkAutocharge } from './autocharge.js';

export const api = express.Router();
// Photos (a face for credit, a station, a support message) are larger than an ordinary request.
api.use(/^\/(credit\/|stations\/[^/]+\/info$|support\/messages$|admin\/support\/)/, express.json({ limit: '700kb' }));
// A provider's statement for the reconciliation can run to a couple of megabytes.
api.use('/admin/reconcile', express.json({ limit: '2.5mb' }));
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
    case 'auth.register':
    case 'auth.reset':
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
    case 'session.progress':
    case 'session.goal':
    case 'session.idle.warn':
    case 'session.idle':
      return { ...sessionScope(entity), public: false };
    case 'photo.new':
      return { admin: true };
    case 'photo.decision':
      return { userId: payload.userId };
    case 'support.message':
    case 'session.failed':
    case 'schedule.started':
    case 'schedule.failed':
    case 'reward.granted':
    case 'plus.start':
    case 'autocharge.linked':
    case 'autocharge.start':
      return { userId: payload.userId };
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
    case 'wallet.refund':
      // The driver who was refunded sees it; nobody else but the admin.
      return { userId: payload.userId };
    case 'booking.create':
    case 'booking.cancel':
    case 'booking.expire': {
      const b = db.byId('bookings', entity);
      return { userId: b?.userId, operatorId: b?.operatorId, fleet: b?.walletId === 'biz-001' };
    }
    case 'ocpp.command':
    case 'tariff.update':
    case 'station.added':
    case 'station.info':
    case 'station.rated':
      return { operatorId: stationOperator(entity) };
    case 'ocpp.online':
    case 'ocpp.offline':
      return { operatorId: stationOperator(entity), public: true };
    case 'sos.update':
    case 'host.decision':
    case 'family.invite':
      return { userId: payload.userId };
    case 'community.broken':
      return { operatorId: stationOperator(entity) };
    case 'wallet.points':
      return { userId: entity };
    case 'operator.payout.paid':
    case 'operator.payout.undo':
      return { operatorId: payload.operatorId ?? null };
    case 'employee.added':
      return { fleet: true, userId: payload.userId ?? null };
    case 'employee.removed':
    case 'employee.limit':
    case 'fleet.limit':
    case 'fleet.balance':
    case 'fleet.plan':
      return { fleet: true };
    case 'operator.status':
    case 'commission.update':
      return { operatorId: entity };
    case 'system.reset':
      return { public: true };
    // Promos are for everyone to see: the map refreshes, a new campaign is announced.
    case 'promo.update':
    case 'promo.campaign':
      return { operatorId: payload.operatorId ?? null, public: true };
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
    actor: 'Voli',
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
    const since = todayStart();
    const mine = db.data.sessions.filter(s => s.operatorId === viewer.orgId && s.status === 'completed' && Date.parse(s.start) >= since);
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
/**
 * The demo network (its five made-up operators and their stations) is for
 * showing the product. Once real money is taken (server/money.js) it leaves
 * the drivers' map and takes no charges — nobody pays real money for a
 * station that does not exist. The admin still sees it.
 */
const DEMO_OPERATOR_IDS = new Set(DEMO_OPERATORS.map(o => o.id));
export const demoStationHidden = st => !playMoney() && DEMO_OPERATOR_IDS.has(st?.operatorId);
const visibleStations = viewer => (viewer?.portal === 'admin' ? db.data.stations : db.data.stations.filter(st => !demoStationHidden(st)));

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
  // Every running session plus the most recent ones; the full history is
  // served by /analytics so the live snapshot stays small.
  const recent = (list, n = 150) => {
    const running = list.filter(s => s.status === 'active');
    return [...running, ...list.filter(s => s.status !== 'active').slice(0, n)];
  };
  const base = {
    stations: visibleStations(viewer),
    operators: publicOperators,
    sessions: [],
    transactions: [],
    alerts: [],
    vehicles: [],
    employees: [],
    wallets: {},
    queues: queues.map(anonQueue),
    bookings: activeBookings.map(anonBooking),
    promos: publicPromos(),
    platform: publicSettings(),
    events: visibleEvents(viewer),
    stats: statsFor(viewer),
    serverTime: new Date().toISOString(),
  };
  if (!viewer || viewer.portal === 'api') return base;

  if (viewer.portal === 'admin') {
    return {
      ...base,
      operators: d.operators,
      sessions: recent(d.sessions),
      transactions: d.transactions.slice(0, 150),
      alerts: d.alerts,
      vehicles: d.vehicles,
      employees: employeesNow(),
      wallets: d.wallets,
      queues,
      bookings: d.bookings,
    };
  }

  const ownQueue = q => (q.userId === viewer.id ? q : anonQueue(q));

  if (viewer.portal === 'operator') {
    const sessions = recent(d.sessions.filter(s => s.operatorId === viewer.orgId));
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
    const sessions = recent(d.sessions.filter(s => s.corporate || s.userId === viewer.id));
    return {
      ...base,
      sessions,
      transactions: txFor(sessions),
      vehicles: d.vehicles,
      employees: employeesNow(),
      fleetPlan: fleetPlanFor(viewer.orgId),
      wallets: d.wallets[viewer.orgId] ? { [viewer.orgId]: d.wallets[viewer.orgId] } : {},
      queues: queues.map(ownQueue),
      bookings: bookingsFor(viewer),
    };
  }

  // driver
  const sessions = recent(d.sessions.filter(s => s.userId === viewer.id));
  return {
    ...base,
    sessions,
    transactions: txFor(sessions),
    vehicles: d.vehicles.filter(v => v.driverId === viewer.id),
    employer: employerOf(viewer.id),
    family: familyFor(viewer.id),
    credit: creditFor(viewer.id),
    rewards: (syncRewards(viewer), rewardsFor(viewer)),
    plus: plusFor(viewer.id),
    autocharge: autochargeFor(viewer.id),
    networkWallets: networkWalletsFor(viewer.id),
    scheduled: (d.scheduledStarts ?? []).filter(x => x.userId === viewer.id && x.status === 'pending'),
    wallets: d.wallets[viewer.id] ? { [viewer.id]: d.wallets[viewer.id] } : {},
    queues: queues.map(ownQueue),
    bookings: bookingsFor(viewer),
  };
}

/** Employees with this month's spending, which resets on the 1st. */
function employeesNow() {
  const spentOf = monthSpendAll();
  return db.data.employees.map(e => {
    const spent = spentOf.get(e.driverId) ?? 0;
    return { ...e, spent, status: spent > e.limit ? 'warning' : 'active' };
  });
}

/** For a driver who is a fleet employee: whose account they may charge to, and what is left. */
function employerOf(driverId) {
  let e = db.find('employees', x => x.driverId === driverId);
  // Added by phone before they used Voli (server/employees.js): linked now, on their first look.
  if (!e) {
    const login = db.byId('accounts', driverId)?.login;
    e = login ? db.find('employees', x => !x.driverId && x.phone === login) : null;
    if (e) {
      e.driverId = driverId;
      db.save();
    }
  }
  if (!e) return null;
  const company = db.find('accounts', a => a.portal === 'business' && a.orgId === 'biz-001');
  const spent = monthSpend(driverId);
  return {
    org: company?.org ?? 'Компания',
    employeeId: e.id,
    limit: e.limit,
    spent,
    left: Math.max(0, e.limit - spent),
    vehicle: e.vehicle,
  };
}

/** Drivers who asked for a company-paid charge on a station that starts over OCPP. */
const companyIntent = new Map();

/** Records an event in the activity log and pushes it to every live portal. */
function emit({ type, portal, actor, message, entity = null, payload = {} }) {
  if (payload?.simulated) {
    const live = withScope({ id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, portal, actor, message, entity, payload, ts: new Date().toISOString() });
    broadcast(live);
    return live;
  }
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
  recordAudit(event);
  recordDeliveries(event);
  db.save();
  broadcast(event);
  pushHook?.(event);
  for (const fn of eventListeners) {
    try {
      fn(event);
    } catch (err) {
      console.warn('[events]', err.message);
    }
  }
  return event;
}

/**
 * The staff audit trail: what the team, networks and fleets did, under whose
 * name and from where. The activity feed keeps only the last 300 events of all
 * kinds; this keeps staff actions much longer, apart from the drivers' traffic.
 */
const STAFF_PORTALS = new Set(['admin', 'operator', 'business', 'api']);
const AUDIT_KEEP = 3000;
function recordAudit(event) {
  const who = actingAccount();
  if (!STAFF_PORTALS.has(event.portal) && !STAFF_PORTALS.has(who?.portal)) return;
  const req = requestContext.getStore()?.req;
  const list = (db.data.audit ??= []);
  list.unshift({
    ts: event.ts,
    type: event.type,
    portal: event.portal,
    actor: event.actor,
    accountId: who?.id ?? null,
    ip: req ? String(req.ip ?? '').replace(/^::ffff:/, '') : null,
    message: String(event.message ?? '').slice(0, 300),
    entity: event.entity,
  });
  if (list.length > AUDIT_KEEP) list.length = AUDIT_KEEP;
}

/** Other parts of the server that act on what happens (server/idle.js). */
const eventListeners = new Set();
export function onEvent(fn) {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

/**
 * Queues a signed delivery for every webhook subscribed to the event. The
 * worker in webhooks.js sends it, with address pinning and retries.
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
    db.data.deliveries.unshift({
      id: db.nextId('delivery', 'DLV-'),
      webhookId: hook.id,
      // Kept on the delivery so its history stays the partner's after the webhook is deleted.
      owner: hook.owner,
      event: event.type,
      url: hook.url,
      body,
      headers: signedHeaders(hook.secret, event.type, body),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: Date.now(),
      responseStatus: null,
      lastError: null,
      ts: new Date().toISOString(),
    });
  }
  // Trim settled history first; anything still in flight stays queued.
  const list = db.data.deliveries;
  for (let i = list.length - 1; list.length > 200 && i >= 0; i--) {
    if (!['pending', 'retrying'].includes(list[i].status)) list.splice(i, 1);
  }
  kickWebhooks();
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

/** The request's sign-in: the Bearer header, or the portal's HttpOnly cookie (server/session.js). */
const bearer = tokenOf;

/** Where the admin may work from: ADMIN_ALLOWED_IPS, comma-separated; empty = anywhere. */
const ADMIN_IPS = new Set((process.env.ADMIN_ALLOWED_IPS ?? '').split(/[\s,]+/).filter(Boolean));
const adminIpRefused = req => ADMIN_IPS.size > 0 && !ADMIN_IPS.has(String(req.ip ?? '').replace(/^::ffff:/, ''));

function requireAuth(...portals) {
  return (req, res, next) => {
    const resolved = db.resolveToken(bearer(req));
    if (!resolved) return res.status(401).json({ error: 'Не авторизован' });
    if (portals.length && !portals.includes(resolved.account.portal)) {
      return res.status(403).json({ error: 'Нет доступа к этому порталу' });
    }
    if (resolved.account.portal === 'admin' && adminIpRefused(req)) return res.status(403).json({ error: 'Вход в админ-панель с этого адреса закрыт' });
    // Until the second factor is on, staff can only switch it on.
    if (twoFactorRequired(resolved.account) && !resolved.account.twoFactor?.enabled && !req.path.startsWith('/auth/')) {
      return res.status(403).json({ error: 'Включите двухфакторную защиту, чтобы работать в кабинете', needs2fa: true });
    }
    req.account = resolved.account;
    req.tokenEntry = resolved.entry;
    next();
  };
}

/** Demo credentials are shown in the UI so the prototype stays explorable. */
api.get('/auth/demo-credentials', (_req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'Not found' });
  // Only the driver's: staff portals are never handed out on a page anyone can open.
  res.json(
    DEMO_ACCOUNTS.filter(a => a.portal === 'driver' || !PRODUCTION || (DEMO_STAFF && a.portal !== 'admin')).map(a => ({
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

api.post('/auth/login', async (req, res) => {
  const { portal, login, password } = req.body ?? {};
  if (!portal || !login || !password || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Укажите портал, логин и пароль' });
  }

  // Drivers sign in by phone, typed any which way, or by email.
  const loginKey = portal === 'driver' ? (normalizePhone(login) ?? String(login).trim().toLowerCase()) : String(login).trim().toLowerCase();
  // Guessing is slowed by counting wrong passwords: 8 on one login in 15 minutes, 100 from one
  // address in 10 (many drivers share a mobile operator's address, so right ones are never counted).
  const failKey = `login-fail:${portal}:${loginKey}`;
  const ipKey = `login-fail-ip:${clientKey(req)}`;
  const stop = blocked(failKey, 8, 15 * 60_000) ?? blocked(ipKey, 100, 10 * 60_000);
  if (stop) return tooMany(res, stop, 'Слишком много неверных попыток входа');
  if (portal === 'admin' && adminIpRefused(req)) return res.status(403).json({ error: 'Вход в админ-панель с этого адреса закрыт' });
  const account = db.find('accounts', a => a.portal === portal && a.login === loginKey);
  // The demo driver's password is public too: once real money is taken, it opens nothing.
  if (portal === 'driver' && !playMoney() && DEMO_ACCOUNTS.some(d => d.portal === 'driver' && d.login === loginKey && d.password === password)) {
    attempt(ipKey, 100, 10 * 60_000);
    return res.status(403).json({ error: 'Демо-аккаунт на рабочем сервере выключен — войдите по коду из SMS' });
  }
  // The seeded staff passwords are in the source code: on a real server they open
  // nothing — the admin's never, the others unless DEMO_STAFF=true keeps them for showing.
  const demoStaffClosed = portal === 'admin' || !DEMO_STAFF;
  if (PRODUCTION && portal !== 'driver' && demoStaffClosed && DEMO_ACCOUNTS.some(d => d.portal === portal && d.login === loginKey && d.password === password)) {
    attempt(ipKey, 100, 10 * 60_000);
    return res.status(403).json({ error: portal === 'admin' ? 'Демо-вход в админ-панель на рабочем сервере закрыт. Войдите учётной записью из ADMIN_EMAIL и ADMIN_PASSWORD' : 'Демо-кабинеты на рабочем сервере выключены' });
  }
  if (!(await verifyPasswordAsync(account, password))) {
    attempt(failKey, 8, 15 * 60_000);
    attempt(ipKey, 100, 10 * 60_000);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  forgive(failKey);
  if (isBlocked(account.id)) return res.status(403).json({ error: 'Аккаунт заблокирован — обратитесь в поддержку' });

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

  const token = db.issueToken(account, req);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  emit({
    type: 'auth.login',
    portal,
    actor: account.name,
    message: `${account.name} вошёл в ${portalLabel(portal)}`,
    entity: account.id,
  });
  announceStaffLogin(account, req);

  res.json({ token, user: publicAccount(account) });
});

// ---------------------------------------------------------------------------
// Two-factor authentication (TOTP, RFC 6238)
// ---------------------------------------------------------------------------

/** Every sign-in to the admin panel is mailed to the team, so a stranger's is noticed at once. */
function announceStaffLogin(account, req) {
  if (account.portal !== 'admin') return;
  notifyTeam(`Вход в админ-панель: ${account.name}`, [
    ['Кто', `${account.name} · ${account.login}`],
    ['Когда', new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })],
    ['IP-адрес', String(req.ip ?? '').replace(/^::ffff:/, '')],
    ['Устройство', String(req.get('user-agent') ?? '').slice(0, 160)],
    ['Второй фактор', account.twoFactor?.enabled ? 'да' : 'нет'],
  ], '/?portal=admin&page=system_health', 'info');
}

api.post('/auth/2fa/verify', (req, res) => {
  const { challenge, code } = req.body ?? {};
  const idx = db.data.challenges.findIndex(c => c.challenge === challenge);
  if (idx < 0) return res.status(401).json({ error: 'Сессия входа истекла' });
  // A six-digit code is a million guesses: five per sign-in, then the password again.
  const tries = attempt(`2fa:${challenge}`, 5, 10 * 60_000);
  if (!tries.ok) {
    db.data.challenges.splice(idx, 1);
    db.save();
    return res.status(429).json({ error: 'Слишком много неверных кодов — войдите заново' });
  }

  const entry = db.data.challenges[idx];
  if (entry.expires < Date.now()) {
    db.data.challenges.splice(idx, 1);
    db.save();
    return res.status(401).json({ error: 'Сессия входа истекла' });
  }

  const account = db.byId('accounts', entry.accountId);
  // Each challenge allows five guesses, but whoever knows the password can ask for
  // more challenges: the account itself gets 10 wrong codes per 15 minutes in all.
  const accountKey = `2fa-account:${entry.accountId}`;
  const stop = blocked(accountKey, 10, 15 * 60_000);
  if (stop) {
    db.data.challenges.splice(idx, 1);
    db.save();
    return tooMany(res, stop, 'Слишком много неверных кодов');
  }
  const step = account ? totpStep(account.twoFactor?.secret, code) : null;
  // A code seen once is spent: someone who watched it typed cannot use it again.
  if (step === null || step <= (account.twoFactor.lastStep ?? -1)) {
    attempt(accountKey, 10, 15 * 60_000);
    return res.status(401).json({ error: 'Неверный код подтверждения' });
  }
  account.twoFactor.lastStep = step;
  forgive(accountKey);

  // One challenge, one login.
  db.data.challenges.splice(idx, 1);
  const token = db.issueToken(account, req);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  emit({
    type: 'auth.login',
    portal: account.portal,
    actor: account.name,
    message: `${account.name} вошёл в ${portalLabel(account.portal)} (2FA)`,
    entity: account.id,
  });
  announceStaffLogin(account, req);

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
  const tries = attempt(`2fa-enable:${req.account.id}`, 10, 15 * 60_000);
  if (!tries.ok) return tooMany(res, tries);
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
  // Disabling is privileged too — require a current code, with few guesses: a stolen
  // sign-in must not be able to try codes until the second factor falls away.
  const tries = attempt(`2fa-disable:${req.account.id}`, 5, 15 * 60_000);
  if (!tries.ok) return tooMany(res, tries);
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

// ---------------------------------------------------------------------------
// Driver sign-up and password recovery by SMS code
// ---------------------------------------------------------------------------

const PASSWORD_MIN = 8;
const clientKey = req => req.ip || req.socket?.remoteAddress || 'unknown';

function passwordProblem(password) {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) return `Пароль — не короче ${PASSWORD_MIN} символов`;
  if (p.length > 128) return 'Слишком длинный пароль';
  if (!/\d/.test(p) || !/\p{L}/u.test(p)) return 'Пароль должен содержать буквы и цифры';
  return null;
}

const findDriver = phone => db.find('accounts', a => a.portal === 'driver' && a.login === phone);

api.get('/auth/sms/status', (_req, res) => {
  res.json({ configured: smsConfigured(), demo: DEMO_MODE && !smsConfigured() });
});

api.post('/auth/sms/request', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const purpose = req.body?.purpose;
  if (!phone) return res.status(400).json({ error: 'Введите номер в формате +998 XX XXX XX XX' });
  if (!PURPOSES.includes(purpose)) return res.status(400).json({ error: 'Некорректный запрос' });

  const exists = !!findDriver(phone);
  if (purpose === 'register' && exists) {
    return res.status(409).json({ error: 'Номер уже зарегистрирован — войдите или восстановите пароль' });
  }
  if (purpose === 'reset' && !exists) {
    return res.status(404).json({ error: 'Аккаунт с таким номером не найден' });
  }

  const result = await issueCode(phone, purpose, clientKey(req));
  if (!result.ok) {
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    return res.status(result.status).json({ error: result.error });
  }
  res.json({ sent: true, phone, ...(result.demoCode ? { demoCode: result.demoCode } : {}) });
});

api.post('/auth/register', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
  const password = req.body?.password;
  if (!phone) return res.status(400).json({ error: 'Введите номер в формате +998 XX XXX XX XX' });
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Укажите имя (2–60 символов)' });
  const weak = passwordProblem(password);
  if (weak) return res.status(400).json({ error: weak });
  const consent = consentFrom(req.body?.consent);
  if (!consent) return res.status(400).json({ error: 'Примите пользовательское соглашение' });
  if (findDriver(phone)) return res.status(409).json({ error: 'Номер уже зарегистрирован' });

  const check = consumeCode(phone, 'register', req.body?.code);
  if (!check.ok) return res.status(401).json({ error: check.error });

  const { salt, hash } = await hashPasswordAsync(String(password));
  // Another request may have taken the number while the hash was computed.
  if (findDriver(phone)) return res.status(409).json({ error: 'Номер уже зарегистрирован' });
  const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'EV';
  const account = {
    id: `acc-${crypto.randomBytes(6).toString('hex')}`,
    portal: 'driver',
    login: phone,
    salt,
    hash,
    otp: null,
    name,
    role: 'Водитель',
    org: null,
    orgId: null,
    avatar: initials,
    lastLogin: new Date().toISOString(),
    created: new Date().toISOString(),
    twoFactor: { enabled: false, secret: null, pending: null },
    consent,
  };
  db.data.accounts.push(account);
  db.data.wallets[account.id] = { balance: 0, currency: 'UZS', autoTopUp: false, threshold: 0, card: null };
  // Came by a friend's link: the friend's code ties them together.
  joinByCode(account, req.body?.ref);
  const token = db.issueToken(account, req);
  emit({
    type: 'auth.register',
    portal: 'driver',
    actor: account.name,
    message: `${account.name} зарегистрировался в Driver App`,
    entity: account.id,
  });
  res.status(201).json({ token, user: publicAccount(account) });
});

api.post('/auth/password/reset', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const password = req.body?.password;
  if (!phone) return res.status(400).json({ error: 'Введите номер в формате +998 XX XXX XX XX' });
  const weak = passwordProblem(password);
  if (weak) return res.status(400).json({ error: weak });
  const account = findDriver(phone);
  if (!account) return res.status(401).json({ error: 'Код истёк — запросите новый' });

  const check = consumeCode(phone, 'reset', req.body?.code);
  if (!check.ok) return res.status(401).json({ error: check.error });

  Object.assign(account, await hashPasswordAsync(String(password)));
  // Whoever held the old password is signed out everywhere.
  db.data.tokens = db.data.tokens.filter(t => t.accountId !== account.id);
  db.save();
  emit({
    type: 'auth.reset',
    portal: 'driver',
    actor: account.name,
    message: `${account.name} сменил пароль по SMS`,
    entity: account.id,
  });

  // An SMS code proves the phone, not the authenticator: 2FA still applies.
  if (account.twoFactor?.enabled) return res.json({ reset: true, requires2fa: true });
  const token = db.issueToken(account, req);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  res.json({ reset: true, token, user: publicAccount(account) });
});

/** Legacy demo-only OTP sign-in with the fixed code from the seed. */
api.post('/auth/otp/request', (req, res) => {
  if (!playMoney()) return res.status(404).json({ error: 'Not found' });
  const phone = String(req.body?.phone ?? '').replace(/[^\d+]/g, '');
  const account = db.find('accounts', a => a.portal === 'driver' && a.login === phone.toLowerCase());
  if (!account) return res.status(404).json({ error: 'Номер не найден. Используйте демо-номер.' });
  res.json({ sent: true, hint: account.otp });
});

api.post('/auth/otp/verify', (req, res) => {
  if (!playMoney()) return res.status(404).json({ error: 'Not found' });
  const phone = String(req.body?.phone ?? '').replace(/[^\d+]/g, '');
  const code = String(req.body?.code ?? '');
  const tries = attempt(`otp:${phone}`, 5, 15 * 60_000);
  if (!tries.ok) return tooMany(res, tries);
  const account = db.find('accounts', a => a.portal === 'driver' && a.login === phone.toLowerCase());
  if (!account || !account.otp || account.otp !== code) return res.status(401).json({ error: 'Неверный код' });
  if (isBlocked(account.id)) return res.status(403).json({ error: 'Аккаунт заблокирован — обратитесь в поддержку' });

  const token = db.issueToken(account, req);
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

// ---------------------------------------------------------------------------
// Account self-service: signed-in devices, password, notifications, car
// ---------------------------------------------------------------------------

/** "Chrome · Windows" from a user-agent string — enough to recognise a device. */
function deviceName(agent = '') {
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Приложение';
  const os = /iPhone|iPad/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows' : /Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

api.get('/auth/sessions', requireAuth(), (req, res) => {
  res.json(
    db.data.tokens
      .filter(t => t.accountId === req.account.id)
      .map(t => ({
        // A short fingerprint, never the token itself.
        id: crypto.createHash('sha256').update(t.token).digest('hex').slice(0, 12),
        device: deviceName(t.agent),
        issued: t.issued,
        lastSeen: t.lastSeen ?? t.issued,
        current: t.token === req.tokenEntry.token,
      })),
  );
});

api.post('/auth/sessions/revoke-others', requireAuth(), (req, res) => {
  const before = db.data.tokens.length;
  db.data.tokens = db.data.tokens.filter(t => t.accountId !== req.account.id || t.token === req.tokenEntry.token);
  db.save();
  res.json({ revoked: before - db.data.tokens.length });
});

api.post('/auth/password', requireAuth(), async (req, res) => {
  const { current, next } = req.body ?? {};
  const tries = attempt(`pw-change:${req.account.id}`, 5, 15 * 60_000);
  if (!tries.ok) return tooMany(res, tries);
  if (!(await verifyPasswordAsync(req.account, String(current ?? '')))) return res.status(401).json({ error: 'Текущий пароль указан неверно' });
  const weak = passwordProblem(next);
  if (weak) return res.status(400).json({ error: weak });
  if (String(next) === String(current)) return res.status(400).json({ error: 'Новый пароль совпадает с текущим' });
  const { salt, hash } = await hashPasswordAsync(String(next));
  db.update('accounts', req.account.id, { salt, hash });
  // Everyone else signed in as this account is signed out.
  db.data.tokens = db.data.tokens.filter(t => t.accountId !== req.account.id || t.token === req.tokenEntry.token);
  db.save();
  emit({
    type: 'auth.password',
    portal: req.account.portal,
    actor: req.account.name,
    message: 'Пароль изменён',
    entity: req.account.id,
  });
  res.json({ ok: true });
});

/** What happened to me: the events addressed to this account, without the network's public feed. */
api.get('/notifications', requireAuth(), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  res.json(db.data.events.filter(e => entitled(req.account, e) && e.scope?.userId === req.account.id).slice(0, limit).map(e => viewFor(req.account, e)));
});

/**
 * What the driver agreed to, as the record a regulator or a court would ask
 * for: which version, when, and whether promotions are welcome. Only the
 * version in force counts — an older one means the document changed since.
 */
function consentFrom(body) {
  const version = Number(body?.version);
  if (!Number.isInteger(version) || version < setting('legal.consentVersion')) return null;
  return { version, marketing: body?.marketing === true, at: new Date().toISOString() };
}

api.post('/me/consent', requireAuth('driver'), (req, res) => {
  const consent = consentFrom(req.body);
  if (!consent) return res.status(400).json({ error: 'Это не действующая версия соглашения' });
  // The first acceptance is kept: it is when the person became a user on these terms.
  const prev = req.account.consent;
  db.update('accounts', req.account.id, { consent: prev?.version === consent.version ? { ...prev, marketing: consent.marketing } : consent });
  res.json({ user: publicAccount(db.byId('accounts', req.account.id)) });
});

const CAR_PORTS = ['CCS2', 'CCS1', 'CHAdeMO', 'Type 2', 'Type 1', 'GB/T DC', 'GB/T AC', 'NACS'];

/** The driver's own car: used for charge estimates and connector filters. */
api.put('/me/car', requireAuth('driver'), (req, res) => {
  const b = req.body ?? {};
  const brand = String(b.brand ?? '').trim().slice(0, 30);
  const model = String(b.model ?? '').trim().slice(0, 40);
  const year = Number(b.year);
  const battery = Number(b.battery);
  const maxKw = Number(b.maxKw);
  if (!brand || !model) return res.status(400).json({ error: 'Укажите марку и модель' });
  if (!Number.isInteger(year) || year < 2010 || year > new Date().getFullYear() + 1) return res.status(400).json({ error: 'Некорректный год выпуска' });
  if (!Number.isFinite(battery) || battery < 10 || battery > 250) return res.status(400).json({ error: 'Ёмкость батареи — от 10 до 250 кВт·ч' });
  if (!CAR_PORTS.includes(b.port)) return res.status(400).json({ error: 'Выберите разъём из списка' });
  if (!Number.isFinite(maxKw) || maxKw < 3 || maxKw > 400) return res.status(400).json({ error: 'Мощность зарядки — от 3 до 400 кВт' });
  // Where the driver likes to stop charging; 80% is kinder to the battery and the queue.
  const chargeLimit = b.chargeLimit === undefined ? 80 : Number(b.chargeLimit);
  if (!Number.isInteger(chargeLimit) || chargeLimit < 50 || chargeLimit > 100) return res.status(400).json({ error: 'Лимит заряда — от 50 до 100%' });
  // The plate from the registration certificate (техпаспорт): optional, letters and digits only.
  const plate = String(b.plate ?? '').toUpperCase().replace(/[^A-Z0-9А-Я]/g, '').slice(0, 10);
  if (plate && plate.length < 6) return res.status(400).json({ error: 'Госномер — как в техпаспорте, например 01A123BC' });
  const car = { brand, model, year, battery: Math.round(battery), port: b.port, maxKw: Math.round(maxKw), chargeLimit, ...(plate ? { plate } : {}) };
  db.update('accounts', req.account.id, { car });
  const account = db.byId('accounts', req.account.id);
  const granted = syncRewards(account);
  announceRewards(account, granted);
  res.json({ user: publicAccount(account), granted });
});

/**
 * The driver's passport, for a one-time bonus and so one person cannot collect
 * welcome bonuses on many accounts. Only what is needed is kept: the series, the
 * last three digits and the birth date on the account, and a salted hash of the
 * ПИНФЛ in an index that says which account already used it. The full number
 * and the ПИНФЛ itself are not stored.
 */
// The default salt is in the source code; a real server needs its own, or the hashes can be reversed.
if (PRODUCTION && !process.env.PINFL_SALT) console.warn('[security] PINFL_SALT is not set — set a long random value in Render');
const pinflKey = pinfl =>crypto.createHash('sha256').update(`${process.env.PINFL_SALT ?? 'voli-pinfl-v1'}:${pinfl}`).digest('hex');

api.put('/me/passport', requireAuth('driver'), (req, res) => {
  // Few tries a day: the answer "already linked to another account" must not become
  // a way to check whose passport numbers are on Voli.
  const tries = attempt(`passport:${req.account.id}`, 5, 24 * 3600_000);
  if (!tries.ok) return tooMany(res, tries);
  const b = req.body ?? {};
  const series = String(b.series ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const number = String(b.number ?? '').replace(/\D/g, '');
  const pinfl = String(b.pinfl ?? '').replace(/\D/g, '');
  const birth = String(b.birth ?? '');
  if (!/^[A-Z]{2}$/.test(series)) return res.status(400).json({ error: 'Серия — две латинские буквы, например AA или AD' });
  if (!/^\d{7}$/.test(number)) return res.status(400).json({ error: 'Номер паспорта — 7 цифр' });
  if (!/^\d{14}$/.test(pinfl)) return res.status(400).json({ error: 'ПИНФЛ — 14 цифр, он есть в паспорте или ID-карте' });
  const born = Date.parse(`${birth}T00:00:00Z`);
  const age = (Date.now() - born) / (365.25 * 86400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !Number.isFinite(born) || age < 16 || age > 100) return res.status(400).json({ error: 'Проверьте дату рождения' });
  const account = db.byId('accounts', req.account.id);
  if (account.passport?.at) return res.status(409).json({ error: 'Паспорт уже указан. Чтобы изменить, напишите в поддержку' });
  const index = (db.data.passportIndex ??= {});
  const key = pinflKey(pinfl);
  if (index[key] && index[key] !== account.id) return res.status(409).json({ error: 'Этот паспорт уже привязан к другому аккаунту Voli' });
  index[key] = account.id;
  db.update('accounts', account.id, { passport: { series, last: number.slice(-3), birth, at: new Date().toISOString() } });
  const fresh = db.byId('accounts', account.id);
  const granted = syncRewards(fresh);
  announceRewards(fresh, granted);
  res.json({ user: publicAccount(fresh), granted });
});

// ---------------------------------------------------------------------------
// Driver features: forecast, community, loyalty, SOS, family, private hosts
// ---------------------------------------------------------------------------

api.get('/stations/:id/forecast', (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });
  res.json(stationForecast(station));
});

/** The chance of a free point on arrival, and nearby stations with a better one. */
/** A feature the admin switched off: the route answers so, and the app hides its button. */
const featureOn = name => (_req, res, next) => (feature(name) ? next() : res.status(403).json({ error: 'Эта функция сейчас выключена', feature: name }));

api.get('/stations/:id/arrival', featureOn('arrival'), (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });
  const eta = Number(req.query.eta);
  if (!Number.isFinite(eta) || eta < 0) return res.status(400).json({ error: 'Укажите время в пути, мин' });
  const here = arrivalChance(station, eta);
  const km = (a, b) => {
    const r = d => (d * Math.PI) / 180;
    const h = Math.sin(r(b.geoLat - a.geoLat) / 2) ** 2 + Math.cos(r(a.geoLat)) * Math.cos(r(b.geoLat)) * Math.sin(r(b.geoLng - a.geoLng) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  const alternatives = here.verdict === 'likely' ? [] : db.data.stations
    .filter(s => s.id !== station.id && !s.private && s.connectors.some(c => c.status !== 'unavailable'))
    .map(s => ({ s, d: km(station, s) }))
    .filter(x => x.d <= 8)
    // A little further means a little later.
    .map(x => ({ ...arrivalChance(x.s, eta + (x.d * 1.3 / 30) * 60), name: x.s.name, operator: x.s.operator, km: Math.round(x.d * 10) / 10 }))
    .filter(a => a.chance > here.chance + 15)
    .sort((a, b) => b.chance - a.chance || a.km - b.km)
    .slice(0, 2);
  res.json({ ...here, alternatives });
});

api.get('/stations/:id/community', (req, res) => {
  if (!db.byId('stations', req.params.id)) return res.status(404).json({ error: 'Станция не найдена' });
  res.json(stationCommunity(req.params.id));
});

api.post('/stations/:id/community', requireAuth('driver'), (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });
  const r = addReport(req.account, station, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  // A driver saying the station is down is something its operator should see.
  if (r.report.kind === 'broken') {
    emit({ type: 'community.broken', portal: 'driver', actor: req.account.name, message: `Водитель отметил: не работает · ${station.name}`, entity: station.id, payload: { stationId: station.id } });
  }
  res.status(201).json({ report: r.report, community: stationCommunity(station.id) });
});

api.post('/community/:id/confirm', requireAuth('driver'), (req, res) => {
  const r = confirmReport(req.account, req.params.id);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json({ report: { ...r.report, confirms: r.report.confirms.length }, community: stationCommunity(r.report.stationId) });
});

api.get('/loyalty', requireAuth('driver'), (req, res) => res.json(loyaltyFor(req.account.id)));
api.put('/fleet/plan', requireAuth('business'), (req, res) => {
  const r = setFleetPlan(req.account.orgId, req.body?.plan);
  if (r.error) return res.status(r.status).json({ error: r.error });
  emit({ type: 'fleet.plan', portal: 'business', actor: req.account.name, message: r.plan.plan === 'taxi' ? `Тариф для такси подключён · скидка ${r.plan.discount}%` : 'Обычный тариф автопарка', entity: req.account.orgId });
  res.json(r.plan);
});
api.get('/fleet/report', requireAuth('business'), (req, res) => {
  const month = String(req.query.month ?? new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Месяц в виде ГГГГ-ММ' });
  res.json({ month, drivers: fleetDriverReport(month) });
});

// Autocharge: link the car once at a charger, then plug in and it starts.
api.post('/autocharge/link', requireAuth('driver'), featureOn('autocharge'), (req, res) => {
  const r = openWindow(req.account, String(req.body?.stationId ?? ''));
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json(autochargeFor(req.account.id));
});
api.delete('/autocharge', requireAuth('driver'), (req, res) => {
  unlinkAutocharge(req.account.id);
  res.json(autochargeFor(req.account.id));
});

api.get('/plus', requireAuth('driver'), (req, res) => res.json(plusFor(req.account.id)));
api.post('/plus', requireAuth('driver'), featureOn('plus'), (req, res) => {
  const r = subscribePlus(req.account);
  if (r.error) return res.status(r.status).json({ error: r.error });
  emit({ type: 'plus.start', portal: 'driver', actor: req.account.name, message: 'Voli Plus подключён', entity: req.account.id, payload: { userId: req.account.id } });
  res.json(r.plus);
});
api.delete('/plus', requireAuth('driver'), (req, res) => {
  const r = cancelPlus(req.account);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json(r.plus);
});

api.get('/battery', requireAuth('driver'), featureOn('battery'), (req, res) => res.json(batteryHealthFor(db.byId('accounts', req.account.id) ?? req.account)));

api.get('/rewards', requireAuth('driver'), (req, res) => {
  syncRewards(req.account);
  res.json(rewardsFor(req.account));
});

api.post('/loyalty/redeem', requireAuth('driver'), (req, res) => {
  const r = redeemPoints(req.account.id, req.body?.points);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'wallet.points', portal: 'driver', actor: req.account.name, message: `Баллы обменяны на баланс · +${r.amount.toLocaleString('ru-RU')} сум`, entity: req.account.id });
  res.json({ ...r, loyalty: loyaltyFor(req.account.id) });
});

api.post('/sos', requireAuth('driver'), featureOn('sos'), (req, res) => {
  const r = createSos(req.account, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'sos.new', portal: 'driver', actor: req.account.name, message: `SOS · ${req.account.name} · ${req.account.login}`, entity: r.sos.id, payload: { kind: r.sos.kind } });
  notifyTeam(`SOS от водителя ${req.account.name}`, [
    ['Водитель', req.account.name],
    ['Телефон', req.account.login],
    ['Что случилось', r.sos.kind],
    ['Комментарий', r.sos.note ?? r.sos.text],
    ['Где', r.sos.lat != null ? `https://maps.google.com/?q=${r.sos.lat},${r.sos.lng}` : undefined],
  ], '/?portal=admin&page=sos', 'support');
  res.status(201).json(r);
});

api.get('/sos/mine', requireAuth('driver'), (req, res) => res.json(sosFor(req.account.id)));

// Platform control: every number and switch, changed at run time and logged.
api.get('/admin/settings', requireAuth('admin'), (_req, res) => res.json(settingsView()));
// The staff audit trail (recordAudit), newest first; ?portal= and ?q= narrow it.
api.get('/admin/audit', requireAuth('admin'), (req, res) => {
  const portal = typeof req.query.portal === 'string' ? req.query.portal : null;
  const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase().slice(0, 60) : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
  const list = (db.data.audit ?? []).filter(a => (!portal || a.portal === portal) && (!q || `${a.actor} ${a.message} ${a.type}`.toLowerCase().includes(q)));
  res.json(list.slice(0, limit));
});
api.put('/admin/settings', requireAuth('admin'), (req, res) => {
  const r = updateSettings(req.body?.changes, req.account);
  if (r.error) return res.status(400).json({ error: r.error });
  if (r.changed.length) {
    const show = v => (typeof v === 'boolean' ? (v ? 'вкл' : 'выкл') : Array.isArray(v) ? v.map(t => `${t.kwh}→${t.pct}%`).join(', ') : Number(v).toLocaleString('ru-RU'));
    emit({
      type: 'settings.update',
      portal: 'admin',
      actor: req.account.name,
      message: `Настройки платформы: ${r.changed.map(c => `${c.label} ${show(c.from)} → ${show(c.to)}`).join('; ')}`,
      entity: 'platform',
      payload: { keys: r.changed.map(c => c.key) },
    });
  }
  res.json(settingsView());
});

// What Voli's own programmes cost and bring: rewards, Plus, the taxi tariff, Autocharge.
api.get('/admin/programs', requireAuth('admin'), (_req, res) => {
  const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
  res.json({
    rewards: rewardsOverview(),
    plus: plusOverview(),
    fleetCoveredMonth: db.data.sessions.filter(s => s.fleetCovered && s.start.startsWith(month)).reduce((n, s) => n + s.fleetCovered, 0),
    autochargeCars: (db.data.autocharge ?? []).filter(l => l.enabled).length,
    autochargeCharges: db.data.sessions.filter(s => s.autocharge && s.start.startsWith(month)).length,
  });
});
api.post('/admin/bonus', requireAuth('admin'), (req, res) => {
  const login = String(req.body?.phone ?? '').replace(/[^\d+]/g, '');
  const account = db.find('accounts', a => a.portal === 'driver' && (a.login === login || a.id === req.body?.userId));
  const r = grantManual(account, req.body?.amount, req.body?.reason);
  if (r.error) return res.status(r.status).json({ error: r.error });
  emit({ type: 'reward.granted', portal: 'admin', actor: req.account.name, message: `+${r.grant.amount.toLocaleString('ru-RU')} сум бонусом · ${r.grant.title}`, entity: r.grant.id, payload: { userId: account.id, amount: r.grant.amount, kind: r.grant.kind, title: r.grant.title, manual: true } });
  res.json(r.grant);
});

api.get('/admin/sos', requireAuth('admin'), (_req, res) => res.json(allSos()));

api.post('/admin/sos/:id/status', requireAuth('admin'), (req, res) => {
  const r = setSosStatus(req.params.id, req.body?.status, req.account);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({
    type: 'sos.update',
    portal: 'admin',
    actor: req.account.name,
    message: r.sos.status === 'taken' ? `Диспетчер принял вашу заявку SOS — ${req.account.name}` : 'Заявка SOS закрыта',
    entity: r.sos.id,
    payload: { userId: r.sos.userId },
  });
  res.json(r);
});

// Charging on credit, behind a face check.
api.get('/credit', requireAuth('driver'), (req, res) => res.json(creditFor(req.account.id)));

api.get('/credit/terms', (_req, res) => res.json({ version: CREDIT_TERMS_VERSION, limit: CREDIT_LIMIT, days: CREDIT_DAYS }));

api.post('/credit/enroll', requireAuth('driver'), (req, res) => {
  const r = enrollCredit(req.account, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'credit.enrolled', portal: 'driver', actor: req.account.name, message: `${req.account.name} подключил зарядку в долг`, entity: req.account.id });
  res.status(201).json(r.credit);
});

api.post('/credit/verify', requireAuth('driver'), (req, res) => {
  const r = verifyFace(req.account, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json(r);
});

api.post('/credit/repay', requireAuth('driver'), (req, res) => {
  const r = repayCredit(req.account.id, req.body?.amount);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'credit.repaid', portal: 'driver', actor: req.account.name, message: `Погашен долг · ${r.paid.toLocaleString('ru-RU')} сум`, entity: req.account.id, payload: { userId: req.account.id } });
  res.json(r);
});

api.post('/credit/delete', requireAuth('driver'), (req, res) => {
  const r = deleteCredit(req.account.id);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json(r.credit);
});

api.get('/admin/credit', requireAuth('admin'), (_req, res) => res.json(creditOverview()));

// Direct settlement: a network's cashbox, and the money trail per network.
const callbackBase = req => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

api.get('/admin/operators/:id/payout', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Оператор не найден' });
  res.json(publicPayout(op, callbackBase(req)));
});

api.put('/admin/operators/:id/payout', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Оператор не найден' });
  const r = setPayout(op, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({
    type: 'operator.payout',
    portal: 'admin',
    actor: req.account.name,
    message: op.payout.mode === 'direct' ? `${op.name}: оплата напрямую сети` : `${op.name}: расчёты через платформу`,
    entity: op.id,
  });
  res.json(publicPayout(op, callbackBase(req)));
});

api.get('/admin/direct-settlement', requireAuth('admin'), (req, res) => res.json(directReport({ days: req.query.days })));

api.get('/operator/direct-settlement', requireAuth('operator'), (req, res) => {
  const op = db.byId('operators', req.account.orgId);
  res.json({ ...directReport({ operatorId: req.account.orgId, days: req.query.days }), payout: op ? publicPayout(op, callbackBase(req)) : null });
});

api.post('/admin/credit/:userId', requireAuth('admin'), (req, res) => {
  const r = updateCreditProfile(req.params.userId, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json(creditOverview());
});

api.get('/family', requireAuth('driver'), (req, res) => res.json(familyFor(req.account.id)));

api.post('/family/invite', requireAuth('driver'), (req, res) => {
  const r = inviteFamily(req.account, { phone: normalizePhone(req.body?.phone), limit: req.body?.limit });
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'family.invite', portal: 'driver', actor: req.account.name, message: `${req.account.name} приглашает вас в семейный кошелёк`, entity: r.member.id, payload: { userId: r.member.id } });
  res.status(201).json(familyFor(req.account.id));
});

api.post('/family/answer', requireAuth('driver'), (req, res) => {
  const r = answerFamily(req.account, req.body?.ownerId, !!req.body?.accept);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json(familyFor(req.account.id));
});

api.post('/family/:memberId', requireAuth('driver'), (req, res) => {
  const r = updateFamily(req.account, req.params.memberId, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json(familyFor(req.account.id));
});

api.post('/hosts/apply', requireAuth('driver'), (req, res) => {
  const r = applyHost(req.account, req.body ?? {}, stationInput);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'host.applied', portal: 'driver', actor: req.account.name, message: `Заявка на частную зарядку · ${r.application.name} · ${r.application.city}`, entity: r.application.id });
  res.status(201).json(r);
});

api.get('/hosts/mine', requireAuth('driver'), (req, res) => {
  const earnings = hostEarnings(req.account.id);
  res.json({ applications: hostApplicationsFor(req.account.id), ...earnings, commission: HOST_COMMISSION });
});

api.get('/admin/hosts', requireAuth('admin'), (_req, res) => res.json(allHostApplications()));

api.post('/admin/hosts/:id/decision', requireAuth('admin'), (req, res) => {
  const r = decideHost(req.params.id, !!req.body?.approve, req.body?.reason, createStation);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({
    type: 'host.decision',
    portal: 'admin',
    actor: req.account.name,
    message: r.application.status === 'approved' ? `Частная зарядка одобрена · ${r.application.name}` : `Заявка на частную зарядку отклонена · ${r.application.name}`,
    entity: r.application.id,
    payload: { userId: r.application.userId },
  });
  res.json(r);
});

api.post('/auth/logout', (req, res) => {
  db.revokeToken(bearer(req));
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Shared state — one snapshot every portal reads from.
// ---------------------------------------------------------------------------

api.get('/state', (req, res) => {
  res.json(stateFor(viewerOf(req)));
});

/** Midnight in Tashkent (UTC+5, no DST) for "today" figures. */
const todayStart = () => Math.floor((Date.now() + 5 * 3600_000) / 86400_000) * 86400_000 - 5 * 3600_000;

function computeStats() {
  const d = db.data;
  const since = todayStart();
  const active = d.sessions.filter(s => s.status === 'active');
  const today = d.sessions.filter(s => Date.parse(s.start) >= since);
  const completed = today.filter(s => s.status === 'completed');
  const evseTotal = d.stations.reduce((n, s) => n + s.connectors.length, 0);
  const evseOnline = d.stations.reduce(
    (n, s) => n + s.connectors.filter(c => c.status !== 'unavailable').length,
    0,
  );
  return {
    activeSessions: active.length,
    totalSessions: today.length,
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
// Read at use: the admin changes them in Platform control (server/settings.js).
const QUEUE_HOLD_MS = () => setting('queue.holdMin') * 60_000;

/** Drops holds nobody claimed in time and returns the live queue. */
function pruneQueues() {
  const now = Date.now();
  const before = db.data.queues.length;
  db.data.queues = db.data.queues.filter(q => !q.notified || now - q.notifiedAt < QUEUE_HOLD_MS());
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
    actor: 'Voli',
    message: `Коннектор ${connectorId} освободился — очередь подошла для ${next.user}`,
    entity: next.id,
    payload: { userId: next.userId, stationId, connectorId },
  });
}

/** Minimum prepaid energy a wallet must cover before a session may start. */
const MIN_PREPAID_KWH = () => setting('charge.minPrepaidKwh');

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
/**
 * Partner networks over OCPI (server/ocpi.js): their stations are started and
 * stopped through the partner's own system, not by us.
 */
const roamers = [];
export function setRoaming(r) {
  roamers.push(r);
}
const roamerFor = station => roamers.find(r => r.isRoaming(station)) ?? null;
export function setGateway(g) {
  gateway = g;
}

/** Push delivery hook, registered by server/push.js. */
let pushHook = null;
export function setPushHook(fn) {
  pushHook = fn;
}

/**
 * Opens a charging session after every business rule the API enforces. The
 * REST API and the OCPP central system both go through here, so a charge
 * point cannot bypass a rule a driver in the app would hit.
 *
 * Returns { session }, { ok: true } for a dry run, or { status, error }.
 */
export function beginSession(account, stationId, connectorId, opts = {}) {
  const { source = 'app', ocppTransactionId = null, meterStartWh = null, dryRun = false, simulated = false } = opts;
  const intent = companyIntent.get(account.id);
  const wantsCompany = opts.corporate ?? intent?.corporate ?? false;
  const familyOwner = opts.family ?? intent?.family ?? null;
  const onCredit = !!(opts.credit ?? intent?.credit);
  const goal = opts.goal ?? intent?.goal ?? null;
  const { station, connector } = findConnector(stationId, connectorId);
  if (!station || !connector) return { status: 404, error: 'Коннектор не найден' };
  if (demoStationHidden(station)) return { status: 409, error: 'Это демо-станция — зарядка на ней недоступна' };
  if (connector.status === 'occupied') return { status: 409, error: 'Коннектор уже занят' };
  if (connector.status === 'unavailable') return { status: 409, error: 'Коннектор недоступен' };
  if (db.byId('operators', station.operatorId)?.status === 'suspended') {
    return { status: 409, error: 'Сеть оператора временно приостановлена' };
  }
  // A network with no integration is on the map only; its own app runs the charge.
  if (db.byId('operators', station.operatorId)?.integration === 'Только карта') {
    return { status: 409, error: `Зарядка на станциях сети ${station.operator} — в её приложении. Здесь вы видите станцию, цены и статус` };
  }

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
  // A fleet employee may charge to the company, within their monthly limit.
  const employee = account.portal === 'driver' ? db.find('employees', e => e.driverId === account.id) : null;
  if (wantsCompany && !employee) return { status: 403, error: 'Зарядка за счёт компании доступна только сотрудникам автопарка' };
  const corporate = account.portal === 'business' || (wantsCompany && !!employee);
  const minimum = connector.price * MIN_PREPAID_KWH();
  if (corporate && employee) {
    const left = employee.limit - monthSpend(account.id);
    if (left < minimum) {
      return { status: 402, error: `Лимит компании на этот месяц исчерпан: осталось ${Math.max(0, left).toLocaleString('ru-RU')} сум. Оплатите из своего кошелька или попросите менеджера увеличить лимит` };
    }
  }

  // A relative's wallet, within the monthly limit they set.
  if (familyOwner && !corporate) {
    const allowance = familyAllowance(account.id, familyOwner);
    if (!allowance) return { status: 403, error: 'Этот семейный кошелёк вам недоступен' };
    if (allowance.left < minimum) return { status: 402, error: `Семейный лимит на этот месяц исчерпан: осталось ${Math.max(0, allowance.left).toLocaleString('ru-RU')} сум` };
  }

  // A network paid directly: its stations are paid from the driver's balance
  // at that network, which went straight to the network's own cashbox.
  const directOp = directOperatorOf(station);
  if (directOp) {
    if (corporate || familyOwner || onCredit) {
      return { status: 409, error: `На станциях сети ${directOp.name} оплата только с баланса этой сети — деньги поступают ей напрямую` };
    }
    const have = netBalance(account.id, directOp.id);
    if (have < minimum) {
      return { status: 402, error: `На балансе сети ${directOp.name} ${have.toLocaleString('ru-RU')} сум, нужно минимум ${minimum.toLocaleString('ru-RU')} сум. Пополните баланс сети — деньги поступят ей напрямую` };
    }
  }

  // On credit: the face was checked at the door; the limit and overdue debts decide.
  if (onCredit) {
    if (corporate || familyOwner) return { status: 400, error: 'Выберите один способ оплаты' };
    const refusal = creditRefusal(account.id, minimum);
    if (refusal) return refusal;
  }

  // Refuse to start what the wallet cannot pay for; otherwise settlement clamps
  // the balance at zero and the charge is effectively free.
  const walletId = corporate ? 'biz-001' : familyOwner ?? account.id;
  const wallet = db.data.wallets[walletId];
  // The driver's own bonus pays for charging too, so it counts towards the minimum.
  const bonus = walletId === account.id ? bonusFor(account.id).balance : 0;
  if (!onCredit && !directOp && wallet && wallet.balance + bonus < minimum) {
    return {
      status: 402,
      error: corporate && employee ? 'На счёте компании недостаточно средств — сообщите менеджеру автопарка' : `Недостаточно средств: нужно минимум ${minimum.toLocaleString('ru-RU')} сум`,
    };
  }
  if (dryRun) return { ok: true };
  companyIntent.delete(account.id);

  const band = station.ocpi ? { multiplier: 1 } : tariffBand(tashkentHour());
  // A network's own promo, paid by the network: the driver pays less, it earns less.
  // A campaign Voli pays for leaves the network its full price.
  const promo = station.ocpi ? null : promoFor(station, account);
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
    // The network's own promo first; Voli Plus takes its share off what is left, and Voli pays it.
    networkPrice: Math.round(connector.price * band.multiplier * (1 - (promo && promo.funder !== 'voli' ? promo.percent : 0) / 100)),
    // A company charge on the taxi tariff takes the park's volume discount; a private one, Plus.
    price: Math.round(connector.price * band.multiplier * (1 - (promo?.percent ?? 0) / 100) * (station.ocpi ? 1 : 1 - (corporate ? fleetDiscount() : plusActive(account.id) ? PLUS.discount : 0) / 100)),
    ...(!station.ocpi && !corporate && plusActive(account.id) ? { plus: true } : {}),
    ...(!station.ocpi && corporate && fleetDiscount() ? { fleetDiscount: fleetDiscount() } : {}),
    ...(promo ? { promo: { id: promo.id, title: promo.title, percent: promo.percent, funder: promo.funder ?? 'network' } } : {}),
    // Platform commission is locked at start too, so a rate change is not retroactive.
    commissionRate: db.byId('operators', station.operatorId)?.commission ?? DEFAULT_COMMISSION,
    status: 'active',
    corporate,
    ...(familyOwner && !corporate ? { familyOwner } : {}),
    ...(onCredit ? { credit: true } : {}),
    ...(directOp ? { direct: directOp.id } : {}),
    ...(goal ? { goal } : {}),
    source: simulated ? 'demo' : source,
    ocppTransactionId,
    // Started by the charger recognising the car (Autocharge), not by a tap.
    ...(opts.autocharge ? { autocharge: true } : {}),
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
    payload: { stationId: station.id, connectorId: connector.id, operatorId: station.operatorId, ...(simulated ? { simulated: true } : {}) },
  });

  return { session };
}

/**
 * What a driver wants from this charge: up to a battery level, for a sum, or
 * for a distance. Turned into an energy or money threshold the session
 * watcher stops at (server/sessionWatch.js).
 */
export function chargeGoal(account, raw) {
  if (!raw || typeof raw !== 'object') return { goal: null };
  const value = Math.round(Number(raw.value));
  const kind = raw.kind;
  if (kind === 'percent') {
    if (!(value >= 10 && value <= 100)) return { error: 'Цель — от 10 до 100%' };
    const pack = Number(account.car?.battery) || 75;
    const soc = db.find('vehicles', v => v.driverId === account.id)?.battery ?? Math.min(95, Math.max(0, Number(raw.fromPct) || 30));
    if (value <= soc) return { error: `Машина уже заряжена до ${soc}% — выберите цель выше` };
    return { goal: { kind, value, fromPct: soc, stopKwh: Math.round(((value - soc) / 100) * pack * 10) / 10 } };
  }
  if (kind === 'km') {
    if (!(value >= 10 && value <= 1000)) return { error: 'Цель — от 10 до 1 000 км' };
    return { goal: { kind, value, stopKwh: Math.round(value * KWH_PER_KM * 10) / 10 } };
  }
  if (kind === 'sum') {
    if (!(value >= 5_000 && value <= 5_000_000)) return { error: 'Сумма — от 5 000 до 5 000 000 сум' };
    return { goal: { kind, value, stopCost: value } };
  }
  return { error: 'Неизвестная цель зарядки' };
}
const KWH_PER_KM = 0.18;

/**
 * Starts a charge for a driver, by whatever path the station needs: a
 * partner network's system, the charge point over OCPP, or directly.
 * Returns { status, body } for the route, the scheduler and the watcher.
 */
export async function startCharge(account, b = {}) {
  const { stationId, connectorId, payer } = b;
  const corporate = payer === 'company';
  // "family:<ownerId>" charges a relative's wallet.
  const family = typeof payer === 'string' && payer.startsWith('family:') ? payer.slice(7) : null;
  // On credit only with a face check made in the last few minutes, by this driver.
  const credit = payer === 'credit';
  if (credit && (account.portal !== 'driver' || !consumeFaceToken(account.id, b.faceToken))) {
    return { status: 403, body: { error: 'Подтвердите лицо, чтобы зарядиться в долг' } };
  }
  const g = chargeGoal(account, b.goal);
  if (g.error) return { status: 400, body: { error: g.error } };
  const goal = g.goal;
  const remember = () => {
    if (corporate || family || credit || goal) companyIntent.set(account.id, { corporate, family, credit, goal });
    else companyIntent.delete(account.id);
  };

  // A partner network's station is started by the partner's system; the
  // session opens when the partner reports it.
  const roamingStation = db.byId('stations', stationId);
  const roaming = roamerFor(roamingStation);
  if (roaming) {
    const check = beginSession(account, stationId, connectorId, { dryRun: true, corporate, family, credit });
    if (check.error) return { status: check.status, body: { error: check.error } };
    remember();
    const connector = roamingStation.connectors.find(c => c.id === connectorId);
    const accepted = await roaming.startRemote(roamingStation, connector, account);
    if (!accepted) return { status: 502, body: { error: 'Сеть партнёра не приняла команду запуска' } };
    return { status: 202, body: { pending: true, stats: statsFor(account) } };
  }

  // A station connected over OCPP is the source of truth: ask it to start, and
  // the session opens when it reports StartTransaction.
  if (gateway?.isConnected(stationId)) {
    const check = beginSession(account, stationId, connectorId, { dryRun: true, corporate, family, credit });
    if (check.error) return { status: check.status, body: { error: check.error } };
    remember();
    const accepted = await gateway.remoteStart(stationId, connectorId, account.id);
    if (!accepted) return { status: 502, body: { error: 'Станция не приняла команду запуска' } };
    return { status: 202, body: { pending: true, stats: statsFor(account) } };
  }

  const result = beginSession(account, stationId, connectorId, { corporate, family, credit, goal });
  if (result.error) return { status: result.status, body: { error: result.error } };
  return { status: 200, body: { session: result.session, stats: statsFor(account) } };
}

api.post('/sessions/start', requireAuth('driver', 'business', 'admin'), async (req, res) => {
  const r = await startCharge(req.account, req.body ?? {});
  res.status(r.status).json(r.body);
});

/**
 * Closes a session and settles it. Energy comes from the charge point's meter
 * when it reports one, otherwise from the demo charging curve.
 */
export function completeSession(session, actor, { energyKwh = null, simulated = false, cost: billed = null } = {}) {
  const minutes = Math.max(1, (Date.now() - new Date(session.start).getTime()) / 60000);
  // Demo charging curve: what a car really draws (DC tapers, AC is capped by
  // the onboard charger), capped at 80 kWh so short demos stay readable.
  const energy =
    energyKwh === null
      ? demoEnergy(session.power ?? 50, minutes)
      : round(Math.max(0, energyKwh), 1);
  // A partner network's charge record states the price; otherwise our locked price applies.
  const cost = billed ?? Math.round(energy * (session.price ?? 1800));
  // What Plus took off this charge: Voli owes it to the network.
  // What Plus or the taxi tariff took off this charge: Voli owes it to the network.
  // And what a campaign Voli pays for took off: the network still gets its full price.
  const voliPromo = session.promo?.funder === 'voli';
  const plusCovered = (session.plus || session.fleetDiscount || voliPromo) && billed === null && session.networkPrice ? Math.max(0, Math.round(energy * session.networkPrice) - cost) : 0;
  const promoCovered = voliPromo ? Math.min(plusCovered, Math.round((energy * session.networkPrice * session.promo.percent) / 100)) : 0;
  if (promoCovered) session.promoCovered = promoCovered;
  if (plusCovered - promoCovered) session[session.plus ? 'plusCovered' : 'fleetCovered'] = plusCovered - promoCovered;

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
    // Only charges on the company account count towards the car's costs.
    if (session.corporate) {
      vehicle.charged += 1;
      vehicle.cost += cost;
    }
  }

  const transaction = {
    id: db.nextId('txn', 'TXN-'),
    sessionId: session.id,
    userId: session.userId,
    user: session.user,
    amount: cost,
    method: session.corporate ? 'Корпоративный счёт' : session.familyOwner ? 'Семейный кошелёк' : session.credit ? 'В долг' : session.direct ? `Баланс сети ${session.operator}` : 'Кошелёк',
    status: 'completed',
    time: session.end,
  };
  db.insert('transactions', transaction);

  const walletId = session.corporate ? 'biz-001' : session.familyOwner ?? session.userId;
  const wallet = db.data.wallets[walletId];
  const balanceBefore = wallet?.balance ?? 0;
  // A credit charge is owed, not taken from the wallet.
  if (session.credit) recordDebt(session);
  // Paid from the driver's balance at the network; the money is already the network's.
  else if (session.direct) chargeNetwork(session);
  else if (wallet) {
    // Voli's bonus pays first; the network is paid its full price either way.
    const fromBonus = walletId === session.userId ? spendBonus(session.userId, cost, session.id) : 0;
    if (fromBonus) {
      session.bonusUsed = fromBonus;
      transaction.bonus = fromBonus;
    }
    wallet.balance = Math.max(0, wallet.balance - (cost - fromBonus));
  }

  const operator = db.byId('operators', session.operatorId);
  if (operator) {
    operator.revenue += cost + plusCovered;
    operator.sessions += 1;
  }

  const employee = session.corporate ? db.find('employees', e => e.driverId === session.userId) : null;
  const spentBefore = employee ? monthSpend(employee.driverId) - cost : 0;
  if (employee) {
    // Recounted from sessions, so the figure starts from zero each month.
    employee.spent = monthSpend(employee.driverId);
    employee.sessions += 1;
    employee.status = employee.spent > employee.limit ? 'warning' : 'active';
  }

  db.save();

  emit({
    type: 'session.stop',
    portal: actor.portal,
    actor: actor.name,
    message: `Зарядка завершена · ${session.stationName} · ${energy} кВт·ч · ${cost.toLocaleString('ru-RU')} сум`,
    entity: session.id,
    payload: { transactionId: transaction.id, operatorId: session.operatorId, energy, cost, ...(simulated ? { simulated: true } : {}) },
  });

  // Tell the fleet manager once per threshold, at the charge that crosses it.
  if (employee && employee.limit > 0) {
    const crossed = [1, 0.8].find(k => spentBefore < employee.limit * k && employee.spent >= employee.limit * k);
    if (crossed) {
      emit({
        type: 'fleet.limit',
        portal: 'system',
        actor: 'Платформа',
        message: crossed === 1
          ? `${employee.name}: лимит исчерпан — ${employee.spent.toLocaleString('ru-RU')} из ${employee.limit.toLocaleString('ru-RU')} сум`
          : `${employee.name}: израсходовано 80% лимита — ${employee.spent.toLocaleString('ru-RU')} из ${employee.limit.toLocaleString('ru-RU')} сум`,
        entity: employee.id,
        payload: { share: crossed, spent: employee.spent, limit: employee.limit },
      });
    }
  }
  if (session.corporate && wallet && wallet.threshold && balanceBefore >= wallet.threshold && wallet.balance < wallet.threshold) {
    emit({
      type: 'fleet.balance',
      portal: 'system',
      actor: 'Платформа',
      message: `Баланс корпоративного счёта ниже порога: ${wallet.balance.toLocaleString('ru-RU')} сум`,
      entity: walletId,
      payload: { balance: wallet.balance, threshold: wallet.threshold },
    });
  }

  // A point per kWh for the driver; the demo's simulated traffic earns nothing.
  // Plus earns double.
  if (!simulated && energy > 0) addPoints(session.userId, Math.round(energy) * (session.plus ? 2 : 1), `Зарядка · ${session.stationName}${session.plus ? ' · ×2 с Plus' : ''}`);
  // A private host gets their share straight into their wallet.
  const host = db.byId('stations', session.stationId)?.private;
  if (host && cost > 0 && db.data.wallets[host.ownerId]) {
    const net = Math.round(cost * (1 - (session.commissionRate ?? HOST_COMMISSION) / 100));
    db.data.wallets[host.ownerId].balance += net;
    db.save();
  }

  promoteQueue(session.stationId, session.connectorId);
  const driver = db.byId('accounts', session.userId);
  if (driver && !simulated) announceRewards(driver, syncRewards(driver));
  // Brought by a friend: the welcome bonus, and the friend's share. A charge on credit is not paid yet.
  if (driver && !simulated && !session.credit) {
    for (const g of onFriendPaid(session)) announceRewards(db.byId('accounts', g.userId ?? driver.id), [g]);
  }
  return { session, transaction };
}

/** Bring a friend: the driver's code, the rules in force, the friends and what they brought. */
api.get('/me/referral', requireAuth('driver'), (req, res) => res.json(referralFor(req.account)));

/** Tells the driver about each reward just reached. */
function announceRewards(account, grants) {
  for (const g of grants) {
    emit({
      type: 'reward.granted',
      portal: 'system',
      actor: 'Voli',
      message: `+${g.amount.toLocaleString('ru-RU')} сум бонусом · ${g.title}`,
      entity: g.id,
      payload: { userId: account.id, amount: g.amount, kind: g.kind, title: g.title, expiresAt: g.expiresAt },
    });
  }
}

/** One rating per completed charge, from the driver who charged; the station's average follows. */
api.post('/sessions/:id/rating', requireAuth('driver', 'business'), (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.userId !== req.account.id) return res.status(404).json({ error: 'Сессия не найдена' });
  if (session.status !== 'completed') return res.status(409).json({ error: 'Оценить можно только завершённую зарядку' });
  if (session.rating) return res.status(409).json({ error: 'Эта зарядка уже оценена' });
  const stars = Number(req.body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: 'Оценка — от 1 до 5' });

  const station = db.byId('stations', session.stationId);
  session.rating = stars;
  if (station) {
    const n = station.reviews ?? 0;
    // Two decimals, so a single vote still moves a well-reviewed station.
    station.rating = Math.round((((station.rating ?? 0) * n + stars) / (n + 1)) * 100) / 100;
    station.reviews = n + 1;
  }
  db.save();

  emit({
    type: 'station.rated',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Оценка ${stars}/5 · ${session.stationName}`,
    entity: session.stationId,
    payload: { stars, sessionId: session.id },
  });
  announceRewards(req.account, syncRewards(db.byId('accounts', req.account.id)));
  res.json({ station, session });
});

/** Stops a charge by whatever path started it. Returns { status, body }. */
export async function stopCharge(session, actor) {
  if (session.status !== 'active') return { status: 409, body: { error: 'Сессия уже завершена' } };
  // On a partner network the partner stops it and sends the final record.
  const roaming = roamers.find(r => r.source === session.source);
  if (roaming) {
    const accepted = await roaming.stopRemote(session);
    if (!accepted) return { status: 502, body: { error: 'Сеть партнёра не приняла команду остановки' } };
    return { status: 202, body: { pending: true, session, stats: statsFor(actor) } };
  }

  // A charge under OCPP control is stopped by the charge point, which then
  // reports the final meter reading.
  if (session.source === 'ocpp' && gateway?.isConnected(session.stationId)) {
    const accepted = await gateway.remoteStop(session.stationId, session.ocppTransactionId);
    if (!accepted) return { status: 502, body: { error: 'Станция не приняла команду остановки' } };
    return { status: 202, body: { pending: true, session, stats: statsFor(actor) } };
  }

  const { transaction } = completeSession(session, actor);
  return { status: 200, body: { session, transaction, stats: statsFor(actor) } };
}

api.post('/sessions/:id/stop', requireAuth('driver', 'business', 'admin', 'operator'), async (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  if (!canControlSession(req.account, session)) {
    return res.status(403).json({ error: 'Нет прав на эту сессию' });
  }
  const r = await stopCharge(session, req.account);
  res.status(r.status).json(r.body);
});

/** Live meter tick so an in-progress session grows for every watching portal. */
api.post('/sessions/:id/tick', requireAuth(), (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.status !== 'active') return res.status(404).json({ error: 'Нет активной сессии' });
  // The driver, their fleet, the station's network or the platform — nobody else moves this meter.
  const a = req.account;
  const mayTick = a.portal === 'admin' || session.userId === a.id || (a.portal === 'business' && session.corporate) || (a.portal === 'operator' && session.operatorId === a.orgId);
  if (!mayTick) return res.status(404).json({ error: 'Нет активной сессии' });
  // A charge point connected over OCPP owns the meter for its sessions.
  if (['ocpp', 'ocpi', 'network'].includes(session.source)) return res.json({ session });

  const minutes = Math.max(0, (Date.now() - new Date(session.start).getTime()) / 60000);
  session.energy = demoEnergy(session.power ?? 50, minutes);
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
// Green hours — cheaper when the grid is quiet, dearer in the evening peak.
// ---------------------------------------------------------------------------

const TASHKENT_UTC_OFFSET = 5;

function tashkentHour(date = new Date()) {
  return (date.getUTCHours() + TASHKENT_UTC_OFFSET) % 24;
}

/** The admin sets the windows (server/admin.js); hours outside them are standard. */
const tariffBand = hour => bandFor(hour);

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
// Bookings — reserve a connector for a time window.
// ---------------------------------------------------------------------------

const BOOKING_FEE = () => setting('booking.fee');
const BOOKING_GRACE_MS = () => setting('booking.graceMin') * 60_000;
const BOOKING_LEAD_MS = () => setting('booking.leadMin') * 60_000;
const BOOKING_HORIZON_MS = () => setting('booking.horizonHours') * 3_600_000;

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
      actor: 'Voli',
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
        ms(b.startsAt) - BOOKING_LEAD_MS() <= at &&
        at <= ms(b.graceUntil),
    ) ?? null
  );
}

api.post('/stations/:id/bookings', requireAuth('driver', 'business'), featureOn('bookings'), (req, res) => {
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
  if (startMs > now + BOOKING_HORIZON_MS()) {
    return res.status(400).json({ error: `Бронировать можно не больше чем на ${setting('booking.horizonHours')} ч вперёд` });
  }

  pruneBookings();
  const account = req.account;
  if (db.data.bookings.some(b => b.status === 'active' && b.userId === account.id)) {
    return res.status(409).json({ error: 'У вас уже есть активная бронь' });
  }

  const endMs = startMs + minutes * 60_000;
  const graceMs = startMs + BOOKING_GRACE_MS();
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
  // Booking is free with Plus.
  const fee = account.portal === 'driver' && plusActive(account.id) ? 0 : BOOKING_FEE();
  if (!wallet || wallet.balance < fee) {
    return res.status(402).json({ error: `Недостаточно средств для брони: ${fee.toLocaleString('ru-RU')} сум` });
  }
  wallet.balance -= fee;

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
    fee,
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

/** An operator may manage only its own stations; the admin manages all. */
function ownStation(req, res) {
  const station = db.byId('stations', req.params.id);
  if (!station) {
    res.status(404).json({ error: 'Станция не найдена' });
    return null;
  }
  if (req.account.portal === 'operator' && station.operatorId !== req.account.orgId) {
    res.status(403).json({ error: 'Это станция другого оператора' });
    return null;
  }
  return station;
}

/** Base price per kWh for one connector. Running sessions keep their locked price. */
api.post('/stations/:id/connectors/:cid/price', requireAuth('operator', 'admin'), (req, res) => {
  const station = ownStation(req, res);
  if (!station) return;
  const connector = station.connectors.find(c => c.id === req.params.cid);
  if (!connector) return res.status(404).json({ error: 'Разъём не найден' });
  const price = Math.round(Number(req.body?.price));
  if (!Number.isFinite(price) || price < 300 || price > 5000) return res.status(400).json({ error: 'Цена от 300 до 5 000 сум за кВт·ч' });
  const before = connector.price;
  connector.price = price;
  db.save();
  emit({
    type: 'tariff.update',
    portal: req.account.portal,
    actor: req.account.name,
    message: `${station.name} · ${connector.type} ${connector.power} кВт: ${before.toLocaleString('ru-RU')} → ${price.toLocaleString('ru-RU')} сум/кВт·ч`,
    entity: station.id,
    payload: { connectorId: connector.id, before, price },
  });
  res.json({ station });
});

const CONNECTOR_TYPES = ['CCS2', 'Type2', 'GB/T DC', 'CHAdeMO'];

/**
 * Registers a new station for the caller's network. It stays unavailable to
 * drivers until the charger itself connects over OCPP and reports in.
 */
/** Checks a new station's fields; the same rules for operators and private hosts. */
export function stationInput(b = {}) {
  const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const name = text(b.name, 60);
  const city = text(b.city, 40);
  const address = text(b.address, 120);
  const lat = Number(b.geoLat);
  const lng = Number(b.geoLng);
  if (name.length < 3) return { error: 'Название — от 3 символов' };
  if (city.length < 2) return { error: 'Укажите город' };
  if (address.length < 5) return { error: 'Укажите адрес' };
  if (!(lat > 37 && lat < 46 && lng > 55.9 && lng < 73.2)) return { error: 'Координаты должны быть в пределах Узбекистана' };
  if (db.data.stations.some(st => st.name.toLowerCase() === name.toLowerCase())) return { error: 'Станция с таким названием уже есть', status: 409 };
  const specs = Array.isArray(b.connectors) ? b.connectors.slice(0, 8) : [];
  if (!specs.length) return { error: 'Добавьте хотя бы один разъём' };
  for (const c of specs) {
    if (!CONNECTOR_TYPES.includes(c.type)) return { error: 'Неизвестный тип разъёма' };
    if (!(Number(c.power) >= 3.7 && Number(c.power) <= 400)) return { error: 'Мощность от 3,7 до 400 кВт' };
    if (!(Number(c.price) >= 300 && Number(c.price) <= 5000)) return { error: 'Цена от 300 до 5 000 сум за кВт·ч' };
  }
  return { data: { name, city, address, lat, lng, specs, hours: text(b.hours, 20) || '24/7', amenities: Array.isArray(b.amenities) ? b.amenities.map(x => text(x, 20)).filter(Boolean).slice(0, 6) : [] } };
}

/** Adds a station for an operator; it waits for its charger to connect over OCPP. */
export function createStation(operator, d) {
  const nextStation = Math.max(...db.data.stations.map(st => Number(st.id.slice(3)) || 0)) + 1;
  let nextConnector = Math.max(...db.data.stations.flatMap(st => st.connectors.map(c => Number(c.id.slice(1)) || 0))) + 1;
  const connectors = d.specs.map(c => ({ id: `c${nextConnector++}`, type: c.type, power: Number(c.power), status: 'unavailable', price: Math.round(Number(c.price)) }));
  const station = {
    id: `st-${String(nextStation).padStart(3, '0')}`,
    name: d.name,
    operator: operator.name,
    operatorId: operator.id,
    address: d.address,
    city: d.city,
    lat: Math.round(((45.6 - d.lat) / 8.4) * 100),
    lng: Math.round(((d.lng - 56) / 17.2) * 100),
    geoLat: d.lat,
    geoLng: d.lng,
    connectors,
    rating: 0,
    reviews: 0,
    totalPower: Math.max(...connectors.map(c => c.power)),
    hours: d.hours,
    amenities: d.amenities ?? [],
    image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
    ocpp: { online: false, awaiting: true },
  };
  db.data.stations.push(station);
  operator.stations = db.data.stations.filter(st => st.operatorId === operator.id).length;
  operator.evse = (operator.evse ?? 0) + connectors.length;
  db.save();
  return station;
}

api.post('/stations', requireAuth('operator'), (req, res) => {
  const checked = stationInput(req.body);
  if (checked.error) return res.status(checked.status ?? 400).json({ error: checked.error });
  const operator = db.byId('operators', req.account.orgId);
  const station = createStation(operator, checked.data);
  emit({
    type: 'station.added',
    portal: 'operator',
    actor: req.account.name,
    message: `Добавлена станция ${station.name} · ${station.connectors.length} разъём(а) · ожидает подключения OCPP`,
    entity: station.id,
    payload: { stationId: station.id },
  });
  res.status(201).json({ station, ocpp: { url: `/ocpp/${station.id}`, login: station.id } });
});

/**
 * A whole network at once, from a spreadsheet: each station checked like a
 * single one, the good ones added, the rest explained by name. (A network on
 * OCPI arrives with all its stations by itself — this is for the rest.)
 */
api.post('/stations/import', requireAuth('operator'), (req, res) => {
  const list = Array.isArray(req.body?.stations) ? req.body.stations : null;
  if (!list?.length) return res.status(400).json({ error: 'Список пуст' });
  if (list.length > 200) return res.status(400).json({ error: 'Не больше 200 станций за раз' });
  const operator = db.byId('operators', req.account.orgId);
  const result = { added: [], skipped: [] };
  for (const item of list) {
    const checked = stationInput(item);
    if (checked.error) {
      result.skipped.push({ name: String(item?.name ?? '').slice(0, 60) || '—', reason: checked.error });
      continue;
    }
    const station = createStation(operator, checked.data);
    result.added.push({ id: station.id, name: station.name, ocpp: `/ocpp/${station.id}` });
  }
  if (result.added.length) {
    emit({
      type: 'station.added',
      portal: 'operator',
      actor: req.account.name,
      message: `Загружено станций: ${result.added.length} · ожидают подключения OCPP`,
      entity: result.added[0].id,
      payload: { stationId: result.added[0].id, count: result.added.length },
    });
  }
  res.json(result);
});

/** Recent OCPP frames for the caller's stations. */
api.get('/ocpp/log', requireAuth('operator', 'admin'), (req, res) => {
  const own = req.account.portal === 'admin' ? null : db.data.stations.filter(s => s.operatorId === req.account.orgId).map(s => s.id);
  res.json(gateway ? gateway.log(own) : []);
});

/** Maintenance command to a connected charge point: Reset, TriggerMessage, UnlockConnector. */
api.post('/ocpp/chargepoints/:id/command', requireAuth('operator', 'admin'), async (req, res) => {
  const station = db.byId('stations', req.params.id);
  if (!station) return res.status(404).json({ error: 'Станция не найдена' });
  if (req.account.portal === 'operator' && station.operatorId !== req.account.orgId) {
    return res.status(403).json({ error: 'Это станция другого оператора' });
  }
  const { action, ...params } = req.body ?? {};
  if (!gateway) return res.status(503).json({ error: 'OCPP недоступен' });
  const out = await gateway.command(station.id, action, params);
  if (out.error === 'unknown') return res.status(400).json({ error: 'Неизвестная команда' });
  if (out.error === 'offline') return res.status(409).json({ error: 'Станция не подключена по OCPP' });
  if (out.error === 'timeout') return res.status(504).json({ error: 'Станция не ответила' });
  emit({
    type: 'ocpp.command',
    portal: req.account.portal,
    actor: req.account.name,
    message: `${action}${params.type ? ` (${params.type})` : ''} → ${station.name}: ${out.result.status ?? 'OK'}`,
    entity: station.id,
    payload: { action, status: out.result.status ?? null },
  });
  res.json({ status: out.result.status ?? 'Accepted', result: out.result });
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
  // Own keys only: "__proto__" is not a wallet.
  const wallet = Object.hasOwn(db.data.wallets, req.params.id) ? db.data.wallets[req.params.id] : null;
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
  employee.spent = monthSpend(employee.driverId);
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
    message: `Оператор ${operator.name}: ${{ active: 'активен', pending: 'на ревью', suspended: 'приостановлен' }[status]}`,
    entity: operator.id,
    payload: { status },
  });

  res.json({ operator });
});

/** Platform commission for one operator, in percent of each paid charge. */
api.post('/operators/:id/commission', requireAuth('admin'), (req, res) => {
  const rate = Math.round(Number(req.body?.rate) * 10) / 10;
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 10) return res.status(400).json({ error: 'Ставка от 0,5 до 10%' });
  const operator = db.byId('operators', req.params.id);
  if (!operator) return res.status(404).json({ error: 'Оператор не найден' });
  const before = operator.commission;
  operator.commission = rate;
  operator.commissionChanged = new Date().toISOString();
  db.save();
  emit({
    type: 'commission.update',
    portal: 'admin',
    actor: req.account.name,
    message: `Комиссия ${operator.name}: ${String(before).replace('.', ',')}% → ${String(rate).replace('.', ',')}%`,
    entity: operator.id,
    payload: { before, rate },
  });
  res.json({ operator });
});

export { emit, computeStats, requireAuth, consentFrom, tooMany, DEMO_MODE, bearer, clientKey, clients, featureOn, findConnector, gateway, pruneQueues, round, scopeOf, statsFor, tashkentHour, unheldFree, viewerOf, visibleEvents };

import crypto from 'node:crypto';
import { DEFAULT_COMMISSION } from './commission.js';
import { db } from './db.js';
import { api, beginSession, completeSession, meterSession, emit, setRoaming, requireAuth } from './api.js';
import { STANDARD, STATUS } from './ocpi.js';

/**
 * UZGRID Vendor API v1 — the hub that brings networks such as Pulse into Voli.
 * (Guide: UZGRID-VDA-001. Other networks connect to Voli directly, over OCPI.)
 *
 *   stations   GET /stations (and /tariffs for each connector's price):
 *              on start, every hour, and after a tariff.updated event.
 *   events     GET /events polled every few seconds from a saved cursor:
 *              connector statuses, command results, the session as it runs,
 *              and cdr.created, whose CDR settles the session.
 *   commands   POST /commands/start-session and stop-session, each with its
 *              own Idempotency-Key; the answer comes later as events.
 *   tokens     a driver is the token VOLI-<account id> (type APP_USER).
 *
 * Settings (Render → Environment):
 *   UZGRID_API_KEY  the key from the UZGRID cabinet, "API kalitlari" (uzk_live_…).
 *   UZGRID_API_URL  https://api-sandbox.uzgrid.uz/api/v1 by default;
 *                   https://api.uzgrid.uz/api/v1 once UZGRID opens production.
 * Without a key the module stays off and the rest of Voli is unaffected.
 */

const KEY = String(process.env.UZGRID_API_KEY ?? '').trim();
const BASE = String(process.env.UZGRID_API_URL ?? 'https://api-sandbox.uzgrid.uz/api/v1').trim().replace(/\/+$/, '');
const SANDBOX = /sandbox/.test(BASE);
const NAME = 'UZGRID';
const POLL_MS = Number(process.env.UZGRID_POLL_MS) || 4000;
const SYNC_MS = 60 * 60_000;
const CDR_WAIT_MS = Number(process.env.UZGRID_CDR_WAIT_MS) || 15 * 60_000;
const ACTOR = { portal: 'system', name: NAME };

export const uzgridEnabled = () => !!KEY;
const state = () => (db.data.uzgrid ??= { cursor: null, lastSync: null, error: null, tokens: [] });
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Calling UZGRID
// ---------------------------------------------------------------------------

class UzgridError extends Error {
  constructor(status, code, message, requestId = null) {
    super(message);
    this.status = status;
    this.code = code;
    // UZGRID support asks for it with every question about a request.
    this.requestId = requestId;
  }
}

/**
 * One request. A change carries an Idempotency-Key; a network error is retried once with the same key.
 * `meta` (optional) gets the answer's X-Request-Id, which UZGRID support asks for.
 */
async function call(path, { method = 'GET', body, idempotencyKey, meta } = {}) {
  const key = method === 'POST' ? (idempotencyKey ?? crypto.randomUUID()) : null;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${KEY}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      if (attempt < 1) continue;
      throw new UzgridError(0, 'network', e.cause?.message ?? e.message);
    }
    const requestId = res.headers.get('x-request-id');
    if (meta) meta.requestId = requestId;
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (res.ok) return data;
    if ((res.status >= 500 || res.status === 429) && attempt < 1) {
      await new Promise(r => setTimeout(r, Math.min(10, Number(res.headers.get('retry-after')) || 2) * 1000));
      continue;
    }
    throw new UzgridError(res.status, data?.error?.code ?? 'http_' + res.status, data?.error?.message ?? `HTTP ${res.status}`, data?.error?.request_id ?? requestId);
  }
}

/** Every page of a list. */
async function pullAll(path, field) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await call(`${path}${sep}limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    out.push(...(data?.[field] ?? []));
    cursor = data?.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

function operatorRecord() {
  const existing = db.data.operators.find(o => o.uzgrid);
  if (existing) return existing;
  const n = Math.max(0, ...db.data.operators.map(o => Number(o.id.slice(3)) || 0)) + 1;
  const op = {
    id: `op-${String(n).padStart(3, '0')}`,
    name: NAME,
    logo: '🔌',
    status: 'active',
    integration: 'UZGRID Vendor API',
    since: now().slice(0, 10),
    region: '',
    contact: '',
    commission: DEFAULT_COMMISSION,
    iban: '—',
    stations: 0,
    evse: 0,
    revenue: 0,
    sessions: 0,
    uzgrid: true,
  };
  db.data.operators.push(op);
  return op;
}

const tariffCache = new Map(); // tariff_id -> price per kWh in sum

async function priceOf(tariffId) {
  if (!tariffId) return null;
  if (!tariffCache.has(tariffId)) {
    const t = await call(`/tariffs/${encodeURIComponent(tariffId)}`);
    const p = t && (!t.currency || t.currency === 'UZS') ? Math.round(Number(t.price_per_kwh)) : NaN;
    tariffCache.set(tariffId, Number.isFinite(p) && p > 0 ? p : null);
  }
  return tariffCache.get(tariffId);
}

/** A station's connector status. A running Voli session keeps its connector busy until the CDR settles it. */
function applyStatus(station, connector, uzStatus, announce) {
  // No price of ours here: UZGRID refuses the start, so drivers should not be offered it.
  const next = connector.uzgrid.tariffId && !connector.uzgrid.noPrice ? STATUS[uzStatus] : 'unavailable';
  if (!next || connector.status === next) return;
  const running = db.data.sessions.some(s => s.status === 'active' && s.stationId === station.id && s.connectorId === connector.id);
  if (running && next === 'available') return;
  connector.status = next;
  if (announce) {
    emit({
      type: 'evse.status',
      portal: 'system',
      actor: NAME,
      message: `EVSE ${connector.id} · ${station.name} → ${next} (UZGRID)`,
      entity: `${station.id}:${connector.id}`,
      payload: { stationId: station.id, connectorId: connector.id, status: next, operatorId: station.operatorId },
    });
  }
}

async function upsertStation(s) {
  const lat = Number(s.location?.lat);
  const lng = Number(s.location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const operator = operatorRecord();
  let station = db.data.stations.find(st => st.uzgrid?.stationId === s.station_id);
  const name = String(s.name ?? s.location?.address ?? 'UZGRID').slice(0, 60);
  if (!station) {
    const n = Math.max(0, ...db.data.stations.map(st => Number(st.id.slice(3)) || 0)) + 1;
    station = {
      id: `st-${String(n).padStart(3, '0')}`,
      name,
      operator: operator.name,
      operatorId: operator.id,
      address: String(s.location?.address ?? '').slice(0, 120),
      city: String(s.location?.address ?? '').split(',')[0].trim().slice(0, 40),
      lat: Math.round(((45.6 - lat) / 8.4) * 100),
      lng: Math.round(((lng - 56) / 17.2) * 100),
      geoLat: lat,
      geoLng: lng,
      connectors: [],
      rating: 0,
      reviews: 0,
      totalPower: 0,
      hours: '24/7',
      amenities: [],
      image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
      uzgrid: { stationId: s.station_id },
    };
    db.data.stations.push(station);
  } else {
    station.name = name;
    station.address = String(s.location?.address ?? station.address).slice(0, 120);
    station.geoLat = lat;
    station.geoLng = lng;
  }

  let nextC = Math.max(0, ...db.data.stations.flatMap(st => st.connectors.map(c => Number(c.id.slice(1)) || 0))) + 1;
  const seen = new Set();
  for (const uc of s.connectors ?? []) {
    let c = station.connectors.find(x => x.uzgrid?.evseUid === uc.evse_uid && x.uzgrid.connectorId === uc.connector_id);
    const price = (await priceOf(uc.tariff_id)) ?? c?.price ?? 2000;
    const power = Number(uc.max_power_w) > 0 ? Math.round(Number(uc.max_power_w) / 100) / 10 : (c?.power ?? 22);
    if (!c) {
      c = { id: `c${nextC++}`, type: STANDARD[uc.standard] ?? 'Type2', power, status: 'unavailable', price, uzgrid: { evseUid: uc.evse_uid, connectorId: uc.connector_id, evseId: uc.evse_id ?? null, tariffId: uc.tariff_id ?? null } };
      station.connectors.push(c);
    } else {
      c.type = STANDARD[uc.standard] ?? c.type;
      c.power = power;
      c.price = price;
      c.uzgrid.tariffId = uc.tariff_id ?? null;
      // A fresh list is the moment to offer a connector UZGRID refused for "no price" again.
      delete c.uzgrid.noPrice;
    }
    seen.add(c.id);
    applyStatus(station, c, uc.status, false);
  }
  // A connector UZGRID no longer lists: kept for history, never offered.
  for (const c of station.connectors) if (!seen.has(c.id)) c.status = 'unavailable';
  station.totalPower = Math.max(0, ...station.connectors.map(c => c.power));
  return station;
}

let syncing = null;
/** Pulls every station of the network with its prices. */
export function syncStations() {
  if (!KEY) return Promise.resolve({ status: 409, error: 'UZGRID не подключён: в Render нет UZGRID_API_KEY' });
  syncing ??= (async () => {
    const st = state();
    try {
      tariffCache.clear();
      const list = await pullAll('/stations', 'stations');
      const listed = new Set();
      let n = 0;
      for (const s of list) {
        const station = await upsertStation(s);
        if (station) {
          listed.add(station.id);
          n++;
        }
      }
      // Gone from UZGRID (or its location hidden): off the map for now.
      for (const station of db.data.stations) if (station.uzgrid && !listed.has(station.id)) station.connectors.forEach(c => (c.status = 'unavailable'));
      const op = operatorRecord();
      op.stations = db.data.stations.filter(x => x.operatorId === op.id).length;
      op.evse = db.data.stations.filter(x => x.operatorId === op.id).reduce((k, x) => k + x.connectors.length, 0);
      st.lastSync = now();
      st.error = null;
      db.save();
      emit({ type: 'uzgrid.synced', portal: 'admin', actor: NAME, message: `UZGRID: обновлено станций — ${n}`, entity: op.id, payload: { stations: n } });
      return { stations: n };
    } catch (e) {
      st.error = describe(e);
      db.save();
      return { status: 502, error: `Не удалось получить станции UZGRID: ${st.error}` };
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Why a start was refused, in words for the driver (codes: UZGRID-VDA-001, section 8 and 12). */
function driverReason(e) {
  if (e.code === 'no_price' || e.code === 'no_plate') return 'на этом разъёме сейчас нет цены — выберите другой';
  if (e.code === 'station_offline') return 'станция сейчас не на связи — попробуйте позже';
  if (e.code === 'conflict' || e.code === 'connector_busy') return 'разъём занят или зарядка у этого владельца временно недоступна';
  if (e.code === 'not_found') return 'разъём не найден — обновите карту';
  return 'зарядка здесь временно недоступна, мы уже разбираемся';
}

function describe(e) {
  if (e instanceof UzgridError) {
    if (e.status === 401) return 'ключ не подходит (401): проверьте UZGRID_API_KEY и что он от той же среды, что UZGRID_API_URL';
    if (e.status === 403) return `у ключа нет нужного права (${e.message})`;
    return `${e.code}: ${e.message}`;
  }
  return e.message;
}

// ---------------------------------------------------------------------------
// Drivers and commands
// ---------------------------------------------------------------------------

/** The driver's token at UZGRID: 1–36 of A–Z a–z 0–9 . _ : - */
export const tokenUid = account => `VOLI-${String(account.id).replace(/[^A-Za-z0-9._:-]/g, '')}`.slice(0, 36);
const accountByToken = uid => db.data.accounts.find(a => a.portal === 'driver' && tokenUid(a) === uid) ?? null;

async function ensureToken(account) {
  const st = state();
  const uid = tokenUid(account);
  if (st.tokens.includes(uid)) return uid;
  await call(`/tokens/${encodeURIComponent(uid)}`, { method: 'PUT', body: { valid: true, type: 'APP_USER', contract_id: uid, visual_number: String(account.name ?? '').slice(0, 64) || undefined } });
  st.tokens.push(uid);
  db.save();
  return uid;
}

const pending = new Map(); // command_id -> { kind, accountId, stationId, connectorId, at }

/** The last start for the admin card: when, where, how it went and the ids UZGRID support asks for. */
function noteStart(fields) {
  const st = state();
  st.lastStart = { ...(fields.at ? {} : st.lastStart), ...fields };
  db.save();
}

async function startRemote(station, connector, account) {
  if (!KEY || !connector?.uzgrid) return false;
  const meta = {};
  const where = `${station.name} · ${connector.type ?? ''} ${connector.uzgrid.evseId ?? connector.uzgrid.evseUid}`.replace(/\s+/g, ' ').trim();
  try {
    const token_uid = await ensureToken(account);
    const cmd = await call('/commands/start-session', {
      method: 'POST',
      body: { station_id: station.uzgrid.stationId, evse_uid: connector.uzgrid.evseUid, connector_id: connector.uzgrid.connectorId, token_uid },
      meta,
    });
    pending.set(cmd.command_id, { kind: 'start', accountId: account.id, stationId: station.id, connectorId: connector.id, at: Date.now() });
    noteStart({ at: now(), where, result: 'sent', code: null, detail: null, commandId: cmd.command_id ?? null, requestId: meta.requestId ?? null });
    return true;
  } catch (e) {
    noteStart({ at: now(), where, result: 'refused', code: e.code ?? 'error', detail: e.message ?? null, commandId: null, requestId: e.requestId ?? meta.requestId ?? null });
    // The driver gets a plain reason; a setup problem (key, rights) goes to the admin card.
    if (e.status === 401 || e.status === 403) {
      state().error = `запуск: ${describe(e)}`;
      db.save();
    }
    console.warn('[uzgrid] start refused:', describe(e));
    // No price of ours here yet: not offered again until the next station list.
    if (e.code === 'no_price' || e.code === 'no_plate') {
      connector.uzgrid.noPrice = true;
      applyStatus(station, connector, null, true);
      db.save();
    }
    // Refused at once: the driver reads the reason in the answer to the start itself.
    return { error: `${station.name}: ${driverReason(e)}` };
  }
}

async function stopRemote(session) {
  if (!KEY || !session.uzgridSessionId) return false;
  try {
    const cmd = await call('/commands/stop-session', { method: 'POST', body: { session_id: session.uzgridSessionId } });
    pending.set(cmd.command_id, { kind: 'stop', accountId: session.userId, stationId: session.stationId, at: Date.now() });
    return true;
  } catch (e) {
    // Already over at UZGRID: the stop and the CDR events will settle it.
    return e.code === 'conflict';
  }
}

const stationOf = id => db.data.stations.find(st => st.uzgrid?.stationId === id) ?? null;
const sessionOf = id => db.data.sessions.find(s => s.uzgridSessionId === id) ?? null;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const handlers = {
  'connector.status'(e) {
    const station = stationOf(e.station_id);
    if (!station) return;
    for (const c of station.connectors) if (c.uzgrid?.evseUid === e.evse_uid) applyStatus(station, c, e.data?.status, true);
  },

  'command.result'(e) {
    const p = pending.get(e.data?.command_id);
    if (!p) return;
    if (e.data.status === 'pending') return;
    pending.delete(e.data.command_id);
    if (p.kind === 'start' && state().lastStart?.commandId === e.data.command_id && state().lastStart.result === 'sent') {
      noteStart({ result: e.data.status === 'accepted' ? 'accepted' : 'rejected', code: e.data.status === 'accepted' ? null : e.data.status, detail: e.data.detail ?? null });
    }
    if (e.data.status !== 'accepted') {
      const station = db.byId('stations', p.stationId);
      emit({
        type: 'session.failed',
        portal: 'system',
        actor: NAME,
        message: p.kind === 'start' ? `Станция ${station?.name ?? ''} не начала зарядку (${e.data.status}${e.data.detail ? `: ${e.data.detail}` : ''})` : `Станция ${station?.name ?? ''} не остановила зарядку (${e.data.status})`,
        entity: p.stationId,
        payload: { userId: p.accountId, result: e.data.status },
      });
    }
  },

  'transaction.started'(e) {
    const d = e.data ?? {};
    if (sessionOf(d.session_id)) return;
    const station = stationOf(e.station_id);
    const connector = station?.connectors.find(c => c.uzgrid?.evseUid === e.evse_uid && (!e.connector_id || c.uzgrid.connectorId === e.connector_id));
    const account = (d.token_uid && accountByToken(d.token_uid)) || db.byId('accounts', pending.get(d.command_id)?.accountId ?? '');
    if (!station || !connector || !account) return;
    // UZGRID may already have reported the EVSE as charging — that is this very session.
    if (connector.status === 'occupied' && !db.data.sessions.some(x => x.status === 'active' && x.stationId === station.id && x.connectorId === connector.id)) connector.status = 'available';
    const r = beginSession(account, station.id, connector.id, { source: 'uzgrid' });
    if (r.error) {
      emit({ type: 'session.failed', portal: 'system', actor: NAME, message: `Зарядка не началась: ${r.error}`, entity: station.id, payload: { userId: account.id } });
      // Charging at UZGRID that Voli refused: stop it there, so nobody pays for it.
      call('/commands/stop-session', { method: 'POST', body: { session_id: d.session_id } }).catch(() => {});
      return;
    }
    r.session.uzgridSessionId = d.session_id;
    if (d.command_id && state().lastStart?.commandId === d.command_id) noteStart({ result: 'started' });
    r.session.uzgridTariff = d.tariff_id ? { id: d.tariff_id, version: d.price_version ?? null } : null;
    if (d.command_id) pending.delete(d.command_id);
  },

  'transaction.metered'(e) {
    const session = sessionOf(e.data?.session_id);
    const wh = Number(e.data?.energy_wh);
    if (session?.status === 'active' && Number.isFinite(wh)) meterSession(session, wh / 1000);
  },

  'transaction.stopped'(e) {
    const session = sessionOf(e.data?.session_id);
    if (!session || session.status !== 'active') return;
    session.uzgridStoppedAt = e.data.stopped_at ?? now();
    const kwh = Number(e.data.energy_kwh);
    if (Number.isFinite(kwh)) meterSession(session, kwh);
    // The bill waits for the CDR (cdr.created), which carries the network's own total.
  },

  async 'cdr.created'(e) {
    const session = sessionOf(e.data?.session_id);
    if (!session || session.status !== 'active') return;
    const cdr = await call(`/cdrs/${encodeURIComponent(e.data.cdr_id)}`);
    settle(session, cdr);
  },

  'tariff.updated'() {
    scheduleSync(5_000);
  },
};

/** Closes the session at the CDR's own total: tiyin → sum. A total UZGRID could not price falls back to our locked price. */
function settle(session, cdr) {
  const total = cdr?.currency && cdr.currency !== 'UZS' ? null : Number.isFinite(Number(cdr?.total_cost)) && cdr.total_cost !== null ? Math.round(Number(cdr.total_cost) / 100) : null;
  const energy = Number(cdr?.energy_kwh);
  completeSession(session, ACTOR, { energyKwh: Number.isFinite(energy) ? energy : (session.energy ?? 0), cost: total });
  session.uzgridCdrId = cdr?.cdr_id ?? null;
  if (cdr?.pricing === 'as_known') session.uzgridUnpriced = cdr.missing ?? true;
  db.save();
}

let polling = false;
async function poll() {
  if (polling || !KEY) return;
  polling = true;
  const st = state();
  try {
    // First run: start from now, not from the network's history.
    if (st.cursor === null) {
      const head = await call('/events?limit=1');
      st.cursor = head?.head_seq ?? 0;
      db.save();
    }
    for (let page = 0; page < 10; page++) {
      let data;
      try {
        data = await call(`/events?after=${st.cursor}&limit=500`);
      } catch (e) {
        if (e.status !== 410) throw e;
        // Our cursor fell behind the journal's horizon: catch up from the head, re-read stations.
        const head = await call('/events?limit=1');
        st.cursor = head?.head_seq ?? 0;
        db.save();
        scheduleSync(0);
        break;
      }
      for (const e of data?.events ?? []) {
        try {
          await handlers[e.type]?.(e);
        } catch (err) {
          console.warn('[uzgrid] event', e.type, err.message);
        }
      }
      // The whole state is one document: write only when the journal moved.
      const next = data?.next_after ?? st.cursor;
      if (next !== st.cursor) {
        st.cursor = next;
        db.save();
      }
      if (!data?.has_more) break;
    }
    if (st.error?.startsWith('events')) st.error = null;
    // A CDR UZGRID holds for its operator can take long: the driver is not kept "charging" meanwhile.
    for (const s of db.data.sessions) {
      if (s.status === 'active' && s.source === 'uzgrid' && s.uzgridStoppedAt && Date.now() - new Date(s.uzgridStoppedAt).getTime() > CDR_WAIT_MS) {
        settle(s, { pricing: 'as_known', missing: ['cdr'], energy_kwh: s.energy ?? 0, total_cost: null });
      }
    }
  } catch (e) {
    st.error = `events: ${describe(e)}`;
  } finally {
    polling = false;
  }
}

let syncTimer = null;
function scheduleSync(ms) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncStations().catch(() => {}), ms);
}

/** Starts polling when a key is set. */
export async function startUzgrid() {
  if (!KEY) return;
  await db.ready;
  console.log(`[uzgrid] connected to ${BASE}${SANDBOX ? ' (sandbox)' : ''}`);
  await syncStations();
  setInterval(() => syncStations().catch(() => {}), SYNC_MS).unref();
  setInterval(() => poll(), POLL_MS).unref();
  poll();
}

setRoaming({ source: 'uzgrid', isRoaming: station => !!(KEY && station?.uzgrid), startRemote, stopRemote });

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function uzgridStatus() {
  const st = state();
  const op = db.data.operators.find(o => o.uzgrid);
  return {
    enabled: !!KEY,
    sandbox: SANDBOX,
    base: BASE,
    stations: op ? db.data.stations.filter(x => x.operatorId === op.id).length : 0,
    lastSync: st.lastSync,
    error: st.error,
    lastStart: st.lastStart ?? null,
  };
}

api.get('/admin/uzgrid', requireAuth('admin'), (_req, res) => res.json(uzgridStatus()));

api.post('/admin/uzgrid/sync', requireAuth('admin'), async (_req, res) => {
  const r = await syncStations();
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json({ ...r, ...uzgridStatus() });
});

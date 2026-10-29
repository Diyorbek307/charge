import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { api, beginSession, completeSession, meterSession, emit, setRoaming, requireAuth } from './api.js';
import { isBlocked } from './analytics.js';

/**
 * OCPI 2.2.1 — how PowerGo brings partner networks into one app.
 *
 * PowerGo owns no chargers. A partner network (a CPO in OCPI terms) keeps
 * its own back office and its own app; we connect as an eMSP:
 *
 *   registration  we call the partner's versions URL with the token A they
 *                 gave us, exchange credentials, and keep their token C;
 *                 they call us with the token B we issued.
 *   locations     we pull their stations, tariffs and connector statuses;
 *                 they push status changes to us as they happen.
 *   commands      a driver's start and stop go to the partner as
 *                 START_SESSION / STOP_SESSION; the partner answers later at
 *                 our response_url.
 *   sessions      the partner pushes the running session (energy so far);
 *   cdrs          and the final charge detail record, which settles it.
 *   tokens        the partner may ask whether a driver may charge.
 *
 * Wire format: every response is { data, status_code, status_message,
 * timestamp }; tokens travel as "Authorization: Token <base64>".
 */

export const OCPI_VERSION = '2.2.1';
export const OUR_PARTY = { country_code: 'UZ', party_id: 'Z24' };
const ACTOR = { portal: 'system', name: 'OCPI' };

const partners = () => (db.data.ocpiPartners ??= []);
const newToken = () => crypto.randomBytes(24).toString('hex');
const now = () => new Date().toISOString();

const envelope = (data, status_code = 1000, status_message = 'Success') => ({ data, status_code, status_message, timestamp: now() });
const auth = token => `Token ${Buffer.from(token).toString('base64')}`;

/** Reads "Token <base64>" (2.2.1) or "Token <raw>" (2.1.1 and lenient partners). */
function tokenFrom(req) {
  const m = String(req.headers.authorization ?? '').match(/^Token\s+(\S+)$/i);
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  return /^[\x21-\x7e]+$/.test(decoded) && Buffer.from(decoded).toString('base64') === m[1] ? decoded : m[1];
}

/** Public view of a partner for the admin: never the tokens. */
export function publicPartner(p) {
  const { tokenB: _b, tokenC: _c, tokenA: _a, ...rest } = p;
  return { ...rest, stations: db.data.stations.filter(st => st.ocpi?.partnerId === p.id).length };
}

// ---------------------------------------------------------------------------
// Calling the partner
// ---------------------------------------------------------------------------

async function call(url, token, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth(token), 'Content-Type': 'application/json', 'OCPI-from-country-code': OUR_PARTY.country_code, 'OCPI-from-party-id': OUR_PARTY.party_id },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: reported below */
  }
  if (!res.ok || !json || json.status_code >= 2000) {
    const why = json?.status_message ?? `HTTP ${res.status}`;
    throw new Error(`${method} ${url}: ${why}`);
  }
  return { data: json.data, headers: res.headers };
}

/** All pages of a paginated list module (Link: <…>; rel="next"). */
async function pullAll(url, token) {
  const out = [];
  let next = url;
  for (let guard = 0; next && guard < 200; guard++) {
    const { data, headers } = await call(next, token);
    out.push(...(Array.isArray(data) ? data : []));
    next = headers.get('link')?.match(/<([^>]+)>\s*;\s*rel="?next"?/)?.[1] ?? null;
  }
  return out;
}

const endpointUrl = (p, module) => p.endpoints?.[module] ?? null;

/** Our own entry points, as the partner should call them. */
export function ourUrls(base) {
  const root = `${base.replace(/\/$/, '')}/ocpi`;
  return {
    versions: `${root}/versions`,
    details: `${root}/${OCPI_VERSION}`,
    credentials: `${root}/${OCPI_VERSION}/credentials`,
    locations: `${root}/emsp/${OCPI_VERSION}/locations`,
    sessions: `${root}/emsp/${OCPI_VERSION}/sessions`,
    cdrs: `${root}/emsp/${OCPI_VERSION}/cdrs`,
    commands: `${root}/emsp/${OCPI_VERSION}/commands`,
    tokens: `${root}/emsp/${OCPI_VERSION}/tokens`,
  };
}

/**
 * Connects a partner: versions → endpoints → credentials exchange → first
 * pull of stations. The partner becomes an operator in the network.
 */
export async function registerPartner({ versionsUrl, token, base }) {
  if (!/^https?:\/\/\S+$/.test(String(versionsUrl ?? ''))) return { status: 400, error: 'Укажите адрес versions партнёра (http или https)' };
  if (!token || String(token).length < 8) return { status: 400, error: 'Укажите токен, который выдал партнёр (token A)' };
  if (partners().some(p => p.versionsUrl === versionsUrl && p.status === 'connected')) return { status: 409, error: 'Эта сеть уже подключена' };

  const partner = {
    id: `ocpi-${crypto.randomBytes(3).toString('hex')}`,
    versionsUrl,
    base,
    status: 'connecting',
    tokenB: newToken(),
    tokenC: null,
    endpoints: {},
    createdAt: now(),
    lastSync: null,
    error: null,
  };
  try {
    const versions = (await call(versionsUrl, token)).data ?? [];
    const v = versions.find(x => x.version === OCPI_VERSION);
    if (!v) throw new Error(`Партнёр не поддерживает OCPI ${OCPI_VERSION}`);
    const details = (await call(v.url, token)).data;
    for (const e of details?.endpoints ?? []) {
      // We are the eMSP: we talk to the partner's SENDER modules and its commands RECEIVER.
      if (e.identifier === 'credentials' || e.role === 'SENDER' || (e.identifier === 'commands' && e.role === 'RECEIVER')) {
        partner.endpoints[e.identifier] ??= e.url;
      }
    }
    if (!partner.endpoints.credentials) throw new Error('У партнёра нет модуля credentials');
    const theirs = (
      await call(partner.endpoints.credentials, token, {
        method: 'POST',
        body: {
          token: partner.tokenB,
          url: ourUrls(base).versions,
          roles: [{ role: 'EMSP', ...OUR_PARTY, business_details: { name: 'PowerGo', website: 'https://powergo.uz' } }],
        },
      })
    ).data;
    const cpo = (theirs?.roles ?? []).find(r => r.role === 'CPO') ?? theirs?.roles?.[0];
    if (!theirs?.token || !cpo) throw new Error('Партнёр не прислал свои учётные данные');
    partner.tokenC = theirs.token;
    partner.country_code = cpo.country_code;
    partner.party_id = cpo.party_id;
    partner.name = cpo.business_details?.name ?? `${cpo.country_code}*${cpo.party_id}`;
    partner.operatorId = operatorFor(partner).id;
    partner.status = 'connected';
    partners().push(partner);
    db.save();
  } catch (e) {
    return { status: 502, error: `Не удалось подключить сеть: ${e.message}` };
  }
  emit({ type: 'ocpi.connected', portal: 'admin', actor: 'OCPI', message: `Подключена сеть ${partner.name} по OCPI ${OCPI_VERSION}`, entity: partner.id });
  const synced = await syncPartner(partner.id);
  return { partner: publicPartner(partner), synced: synced.error ? 0 : synced.stations };
}

/** The operator record a partner network appears as on the map and in the admin. */
function operatorFor(partner) {
  const existing = db.data.operators.find(o => o.ocpiPartnerId === partner.id);
  if (existing) return existing;
  const n = Math.max(0, ...db.data.operators.map(o => Number(o.id.slice(3)) || 0)) + 1;
  const op = {
    id: `op-${String(n).padStart(3, '0')}`,
    name: partner.name,
    logo: '🔌',
    status: 'active',
    integration: `OCPI ${OCPI_VERSION}`,
    since: now().slice(0, 10),
    region: '',
    contact: '',
    commission: 3.0,
    iban: '—',
    stations: 0,
    evse: 0,
    revenue: 0,
    sessions: 0,
    ocpiPartnerId: partner.id,
  };
  db.data.operators.push(op);
  return op;
}

// ---------------------------------------------------------------------------
// Locations → stations
// ---------------------------------------------------------------------------

const STANDARD = {
  IEC_62196_T2: 'Type2',
  IEC_62196_T2_COMBO: 'CCS2',
  CHADEMO: 'CHAdeMO',
  GBT_DC: 'GB/T DC',
  GBT_AC: 'Type2',
  IEC_62196_T1_COMBO: 'CCS2',
};
const STATUS = {
  AVAILABLE: 'available',
  CHARGING: 'occupied',
  BLOCKED: 'occupied',
  RESERVED: 'reserved',
  OUTOFORDER: 'unavailable',
  INOPERATIVE: 'unavailable',
  PLANNED: 'unavailable',
  REMOVED: 'unavailable',
  UNKNOWN: 'unavailable',
};

/** Price per kWh in UZS from an OCPI tariff, when it has an ENERGY component in UZS. */
function energyPrice(tariff) {
  if (!tariff || (tariff.currency && tariff.currency !== 'UZS')) return null;
  for (const el of tariff.elements ?? []) {
    const c = (el.price_components ?? []).find(x => x.type === 'ENERGY');
    if (c && Number(c.price) > 0) return Math.round(Number(c.price));
  }
  return null;
}

const powerKw = c => {
  if (Number(c.max_electric_power) > 0) return Math.round(Number(c.max_electric_power) / 100) / 10;
  const v = Number(c.max_voltage) || 0;
  const a = Number(c.max_amperage) || 0;
  const phases = c.power_type === 'AC_3_PHASE' ? 3 : 1;
  return Math.round((v * a * phases) / 100) / 10 || 22;
};

/** Creates or updates our station for one partner location. */
function upsertLocation(partner, loc, tariffs = new Map()) {
  const lat = Number(loc.coordinates?.latitude);
  const lng = Number(loc.coordinates?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const operator = operatorFor(partner);
  let station = db.data.stations.find(st => st.ocpi?.partnerId === partner.id && st.ocpi.locationId === loc.id);

  if (loc.publish === false || (loc.evses ?? []).every(e => e.status === 'REMOVED')) {
    // Gone from the partner's network: hide everything, keep history intact.
    if (station) station.connectors.forEach(c => (c.status = 'unavailable'));
    return station;
  }

  if (!station) {
    const n = Math.max(0, ...db.data.stations.map(st => Number(st.id.slice(3)) || 0)) + 1;
    station = {
      id: `st-${String(n).padStart(3, '0')}`,
      name: String(loc.name ?? loc.address ?? loc.id).slice(0, 60),
      operator: operator.name,
      operatorId: operator.id,
      address: String(loc.address ?? '').slice(0, 120),
      city: String(loc.city ?? '').slice(0, 40),
      lat: Math.round(((45.6 - lat) / 8.4) * 100),
      lng: Math.round(((lng - 56) / 17.2) * 100),
      geoLat: lat,
      geoLng: lng,
      connectors: [],
      rating: 0,
      reviews: 0,
      totalPower: 0,
      hours: loc.opening_times?.twentyfourseven === false ? 'по расписанию' : '24/7',
      amenities: [],
      image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
      ocpi: { partnerId: partner.id, locationId: loc.id, country_code: loc.country_code ?? partner.country_code, party_id: loc.party_id ?? partner.party_id },
    };
    db.data.stations.push(station);
  } else {
    station.name = String(loc.name ?? station.name).slice(0, 60);
    station.address = String(loc.address ?? station.address).slice(0, 120);
    station.city = String(loc.city ?? station.city).slice(0, 40);
    station.geoLat = lat;
    station.geoLng = lng;
  }

  let nextC = Math.max(0, ...db.data.stations.flatMap(st => st.connectors.map(c => Number(c.id.slice(1)) || 0))) + 1;
  for (const evse of loc.evses ?? []) {
    for (const oc of evse.connectors ?? []) {
      let c = station.connectors.find(x => x.ocpi?.evseUid === evse.uid && x.ocpi.connectorId === oc.id);
      const price = energyPrice(tariffs.get(oc.tariff_ids?.[0])) ?? c?.price ?? 1500;
      if (!c) {
        c = { id: `c${nextC++}`, type: STANDARD[oc.standard] ?? 'Type2', power: powerKw(oc), status: 'unavailable', price, ocpi: { evseUid: evse.uid, connectorId: oc.id, evseId: evse.evse_id ?? null } };
        station.connectors.push(c);
      } else {
        c.type = STANDARD[oc.standard] ?? c.type;
        c.power = powerKw(oc);
        c.price = price;
      }
      applyEvseStatus(station, c, evse.status, false);
    }
  }
  station.totalPower = Math.max(0, ...station.connectors.map(c => c.power));
  operator.stations = db.data.stations.filter(st => st.operatorId === operator.id).length;
  operator.evse = db.data.stations.filter(st => st.operatorId === operator.id).reduce((n, st) => n + st.connectors.length, 0);
  return station;
}

/** A connector's status from the partner. A running PowerGo session keeps its connector busy until the CDR settles it. */
function applyEvseStatus(station, connector, ocpiStatus, announce = true) {
  const next = STATUS[ocpiStatus];
  if (!next || connector.status === next) return;
  const running = db.data.sessions.some(s => s.status === 'active' && s.stationId === station.id && s.connectorId === connector.id);
  if (running && next === 'available') return;
  connector.status = next;
  if (announce) {
    emit({
      type: 'evse.status',
      portal: 'system',
      actor: 'OCPI',
      message: `EVSE ${connector.id} · ${station.name} → ${next} (OCPI)`,
      entity: `${station.id}:${connector.id}`,
      payload: { stationId: station.id, connectorId: connector.id, status: next, operatorId: station.operatorId },
    });
  }
}

/** Pulls every location (and tariffs, when offered) from the partner. */
export async function syncPartner(partnerId) {
  const partner = partners().find(p => p.id === partnerId);
  if (!partner) return { status: 404, error: 'Сеть не найдена' };
  if (partner.status !== 'connected') return { status: 409, error: 'Сеть не подключена' };
  const url = endpointUrl(partner, 'locations');
  if (!url) return { status: 409, error: 'Партнёр не отдаёт станции (нет модуля locations)' };
  try {
    const tariffs = new Map();
    if (endpointUrl(partner, 'tariffs')) {
      for (const t of await pullAll(endpointUrl(partner, 'tariffs'), partner.tokenC)) tariffs.set(t.id, t);
    }
    const locations = await pullAll(url, partner.tokenC);
    let n = 0;
    for (const loc of locations) if (upsertLocation(partner, loc, tariffs)) n++;
    partner.lastSync = now();
    partner.error = null;
    db.save();
    emit({ type: 'ocpi.synced', portal: 'admin', actor: 'OCPI', message: `${partner.name}: обновлено станций — ${n}`, entity: partner.id, payload: { stations: n } });
    return { stations: n, partner: publicPartner(partner) };
  } catch (e) {
    partner.error = e.message;
    db.save();
    return { status: 502, error: `Не удалось получить станции: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Commands: start and stop on a partner network
// ---------------------------------------------------------------------------

const pendingCommands = new Map(); // uid -> { kind, accountId, stationId, at }

const partnerOf = station => (station?.ocpi ? partners().find(p => p.id === station.ocpi.partnerId && p.status === 'connected') ?? null : null);

/** The driver as an OCPI token: the account id is the uid the partner sends back in the session. */
function tokenFor(account) {
  return {
    ...OUR_PARTY,
    uid: account.id,
    type: 'APP_USER',
    contract_id: `UZ-Z24-${account.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)}`,
    issuer: 'PowerGo',
    valid: true,
    whitelist: 'NEVER',
    last_updated: now(),
  };
}

/** Asks the partner to start; the session opens when they report it. Returns true when the partner accepted the command. */
async function startRemote(station, connector, account) {
  const partner = partnerOf(station);
  if (!partner || !endpointUrl(partner, 'commands')) return false;
  const uid = crypto.randomBytes(8).toString('hex');
  pendingCommands.set(uid, { kind: 'START_SESSION', accountId: account.id, stationId: station.id, at: Date.now() });
  try {
    const { data } = await call(`${endpointUrl(partner, 'commands')}/START_SESSION`, partner.tokenC, {
      method: 'POST',
      body: {
        response_url: `${ourUrls(partner.base).commands}/START_SESSION/${uid}`,
        token: tokenFor(account),
        location_id: station.ocpi.locationId,
        evse_uid: connector.ocpi.evseUid,
        connector_id: connector.ocpi.connectorId,
      },
    });
    return data?.result === 'ACCEPTED';
  } catch {
    pendingCommands.delete(uid);
    return false;
  }
}

async function stopRemote(session) {
  const station = db.byId('stations', session.stationId);
  const partner = partnerOf(station);
  if (!partner || !session.ocpiSessionId) return false;
  const uid = crypto.randomBytes(8).toString('hex');
  pendingCommands.set(uid, { kind: 'STOP_SESSION', accountId: session.userId, stationId: station.id, at: Date.now() });
  try {
    const { data } = await call(`${endpointUrl(partner, 'commands')}/STOP_SESSION`, partner.tokenC, {
      method: 'POST',
      body: { response_url: `${ourUrls(partner.base).commands}/STOP_SESSION/${uid}`, session_id: session.ocpiSessionId },
    });
    return data?.result === 'ACCEPTED';
  } catch {
    pendingCommands.delete(uid);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Our eMSP endpoints, called by partners
// ---------------------------------------------------------------------------

export const ocpiApi = express.Router();
ocpiApi.use(express.json({ limit: '2mb' }));

/** Identifies the calling partner by the token B we issued them. */
function partnerAuth(req, res, next) {
  const token = tokenFrom(req);
  const partner = token && partners().find(p => p.tokenB === token && p.status === 'connected');
  if (!partner) return res.status(401).json(envelope(null, 2000, 'Unknown or missing token'));
  req.partner = partner;
  next();
}
const ok = (res, data = null) => res.json(envelope(data));
const clientError = (res, message, code = 2001) => res.status(400).json(envelope(null, code, message));

const baseOf = req => req.partner?.base ?? `${req.protocol}://${req.get('host')}`;

ocpiApi.get('/versions', partnerAuth, (req, res) => ok(res, [{ version: OCPI_VERSION, url: ourUrls(baseOf(req)).details }]));

ocpiApi.get(`/${OCPI_VERSION}`, partnerAuth, (req, res) => {
  const u = ourUrls(baseOf(req));
  ok(res, {
    version: OCPI_VERSION,
    endpoints: [
      { identifier: 'credentials', role: 'SENDER', url: u.credentials },
      { identifier: 'credentials', role: 'RECEIVER', url: u.credentials },
      { identifier: 'locations', role: 'RECEIVER', url: u.locations },
      { identifier: 'sessions', role: 'RECEIVER', url: u.sessions },
      { identifier: 'cdrs', role: 'RECEIVER', url: u.cdrs },
      { identifier: 'commands', role: 'SENDER', url: u.commands },
      { identifier: 'tokens', role: 'SENDER', url: u.tokens },
    ],
  });
});

ocpiApi.get(`/${OCPI_VERSION}/credentials`, partnerAuth, (req, res) =>
  ok(res, { token: req.partner.tokenB, url: ourUrls(baseOf(req)).versions, roles: [{ role: 'EMSP', ...OUR_PARTY, business_details: { name: 'PowerGo' } }] }),
);

ocpiApi.delete(`/${OCPI_VERSION}/credentials`, partnerAuth, (req, res) => {
  req.partner.status = 'disconnected';
  db.save();
  emit({ type: 'ocpi.disconnected', portal: 'admin', actor: 'OCPI', message: `Сеть ${req.partner.name} отключилась от OCPI`, entity: req.partner.id });
  ok(res);
});

const loc = `/emsp/${OCPI_VERSION}/locations/:cc/:pid/:locationId`;
const stationOf = (partner, locationId) => db.data.stations.find(st => st.ocpi?.partnerId === partner.id && st.ocpi.locationId === locationId);

ocpiApi.put(loc, partnerAuth, (req, res) => {
  const body = { ...req.body, id: req.params.locationId, country_code: req.params.cc, party_id: req.params.pid };
  if (!upsertLocation(req.partner, body)) return clientError(res, 'Location needs coordinates');
  db.save();
  ok(res);
});

ocpiApi.patch(loc, partnerAuth, (req, res) => {
  const st = stationOf(req.partner, req.params.locationId);
  if (!st) return res.status(404).json(envelope(null, 2003, 'Unknown location'));
  if (req.body?.name) st.name = String(req.body.name).slice(0, 60);
  db.save();
  ok(res);
});

/** An EVSE (and its connectors) changed: usually just its status. */
function evseUpdate(req, res) {
  const st = stationOf(req.partner, req.params.locationId);
  if (!st) return res.status(404).json(envelope(null, 2003, 'Unknown location'));
  const mine = st.connectors.filter(c => c.ocpi?.evseUid === req.params.evseUid && (!req.params.connectorId || c.ocpi.connectorId === req.params.connectorId));
  if (!mine.length && req.method === 'PUT' && !req.params.connectorId) {
    upsertLocation(req.partner, { id: st.ocpi.locationId, name: st.name, address: st.address, city: st.city, coordinates: { latitude: st.geoLat, longitude: st.geoLng }, evses: [{ ...req.body, uid: req.params.evseUid }] });
  } else if (!mine.length) {
    return res.status(404).json(envelope(null, 2003, 'Unknown EVSE'));
  }
  if (req.body?.status) for (const c of mine) applyEvseStatus(st, c, req.body.status);
  db.save();
  ok(res);
}
ocpiApi.put(`${loc}/:evseUid`, partnerAuth, evseUpdate);
ocpiApi.patch(`${loc}/:evseUid`, partnerAuth, evseUpdate);
ocpiApi.patch(`${loc}/:evseUid/:connectorId`, partnerAuth, evseUpdate);

/** The partner reports a session: it opens ours when it starts, meters it while it runs. */
function sessionUpdate(req, res) {
  const s = { ...req.body, id: req.params.sessionId };
  let session = db.data.sessions.find(x => x.ocpiSessionId === s.id && x.ocpiPartnerId === req.partner.id);

  if (!session && req.method === 'PUT' && ['PENDING', 'ACTIVE'].includes(s.status)) {
    const account = db.byId('accounts', String(s.cdr_token?.uid ?? ''));
    const station = stationOf(req.partner, s.location_id);
    const connector = station?.connectors.find(c => c.ocpi?.evseUid === s.evse_uid && (!s.connector_id || c.ocpi.connectorId === s.connector_id));
    if (!account || !station || !connector) return res.status(404).json(envelope(null, 2003, 'Unknown token, location or EVSE'));
    // The partner may already have reported the EVSE as charging — that is this very session.
    if (connector.status === 'occupied' && !db.data.sessions.some(x => x.status === 'active' && x.stationId === station.id && x.connectorId === connector.id)) {
      connector.status = 'available';
    }
    const r = beginSession(account, station.id, connector.id, { source: 'ocpi' });
    if (r.error) {
      emit({ type: 'session.failed', portal: 'system', actor: 'OCPI', message: `Зарядка не началась: ${r.error}`, entity: station.id, payload: { userId: account.id } });
      return res.status(400).json(envelope(null, 2001, r.error));
    }
    session = r.session;
    session.ocpiSessionId = s.id;
    session.ocpiPartnerId = req.partner.id;
    db.save();
  }
  if (!session) return res.status(404).json(envelope(null, 2003, 'Unknown session'));
  if (session.status === 'active' && Number.isFinite(Number(s.kwh))) meterSession(session, Number(s.kwh));
  // Completed without a CDR yet: wait for the CDR, which carries the final price.
  ok(res);
}
ocpiApi.put(`/emsp/${OCPI_VERSION}/sessions/:cc/:pid/:sessionId`, partnerAuth, sessionUpdate);
ocpiApi.patch(`/emsp/${OCPI_VERSION}/sessions/:cc/:pid/:sessionId`, partnerAuth, sessionUpdate);

/** The final record of a charge: energy and price as the partner billed it. */
ocpiApi.post(`/emsp/${OCPI_VERSION}/cdrs`, partnerAuth, (req, res) => {
  const cdr = req.body ?? {};
  const session = db.data.sessions.find(x => x.ocpiSessionId === cdr.session_id && x.ocpiPartnerId === req.partner.id);
  if (!session) return res.status(404).json(envelope(null, 2003, 'Unknown session'));
  if (session.status === 'active') {
    const total = Number(cdr.total_cost?.incl_vat ?? cdr.total_cost?.excl_vat);
    const cost = cdr.currency && cdr.currency !== 'UZS' ? null : Number.isFinite(total) ? Math.round(total) : null;
    completeSession(session, ACTOR, { energyKwh: Number(cdr.total_energy) || 0, cost });
    session.ocpiCdrId = cdr.id ?? null;
    db.save();
  }
  res.status(201).json(envelope(null));
});

/** The partner's late answer to a command we sent. */
ocpiApi.post(`/emsp/${OCPI_VERSION}/commands/:command/:uid`, partnerAuth, (req, res) => {
  const pending = pendingCommands.get(req.params.uid);
  if (!pending) return res.status(404).json(envelope(null, 2003, 'Unknown command'));
  pendingCommands.delete(req.params.uid);
  const result = req.body?.result;
  if (result !== 'ACCEPTED') {
    const station = db.byId('stations', pending.stationId);
    emit({
      type: 'session.failed',
      portal: 'system',
      actor: 'OCPI',
      message: pending.kind === 'START_SESSION' ? `Станция ${station?.name ?? ''} не начала зарядку (${result ?? 'нет ответа'})` : `Станция ${station?.name ?? ''} не остановила зарядку (${result ?? 'нет ответа'})`,
      entity: pending.stationId,
      payload: { userId: pending.accountId, result },
    });
  }
  ok(res);
});

/** Real-time authorization: may this driver charge? */
ocpiApi.post(`/emsp/${OCPI_VERSION}/tokens/:uid/authorize`, partnerAuth, (req, res) => {
  const account = db.byId('accounts', req.params.uid);
  if (!account || account.portal !== 'driver') return res.status(404).json(envelope(null, 2004, 'Unknown token'));
  const blocked = isBlocked(account.id);
  ok(res, { allowed: blocked ? 'BLOCKED' : 'ALLOWED', token: tokenFor(account) });
});

ocpiApi.get(`/emsp/${OCPI_VERSION}/tokens`, partnerAuth, (_req, res) => ok(res, []));

// Hand the API what it needs to start and stop on partner networks.
setRoaming({ source: 'ocpi', isRoaming: station => !!partnerOf(station), startRemote, stopRemote });

export const ocpiPartners = () => partners().map(publicPartner);

// ---------------------------------------------------------------------------
// Admin: connect a partner network, refresh its stations
// ---------------------------------------------------------------------------

/** Where partners should call us: PUBLIC_URL in production, else the address the admin used. */
const publicBase = req => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

api.get('/admin/ocpi', requireAuth('admin'), (req, res) => res.json({ partners: ocpiPartners(), version: OCPI_VERSION, ourVersionsUrl: ourUrls(publicBase(req)).versions, party: OUR_PARTY }));

api.post('/admin/ocpi', requireAuth('admin'), async (req, res) => {
  const r = await registerPartner({ versionsUrl: String(req.body?.versionsUrl ?? '').trim(), token: String(req.body?.token ?? '').trim(), base: publicBase(req) });
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.status(201).json(r);
});

api.post('/admin/ocpi/:id/sync', requireAuth('admin'), async (req, res) => {
  const r = await syncPartner(req.params.id);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json(r);
});

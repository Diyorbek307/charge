import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { api, beginSession, completeSession, meterSession, emit, setRoaming, requireAuth } from './api.js';

/**
 * How a network connects, whatever it runs:
 *
 *   OCPP 1.6-J    its chargers talk to us directly (server/ocpp.js);
 *   OCPI 2.2.1    its back office speaks the roaming standard (server/ocpi.js);
 *   Network API   its own system, no OCPI: it pushes stations, statuses and
 *                 charges to the small API below, and takes start/stop
 *                 commands we post, signed, to its webhook;
 *   Только карта  no integration at all: its stations are on our map with
 *                 prices, and charging happens in the network's own app.
 *
 * Network API, for the network's developers — Bearer key from the admin:
 *   PUT   /api/network/v1/stations/:ref                     a station and its connectors
 *   PATCH /api/network/v1/stations/:ref/connectors/:cref    { status }
 *   GET   /api/network/v1/stations                          what we hold
 *   POST  /api/network/v1/sessions/:ref                     { event: started | meter | stopped, … }
 * Commands to the network: POST <webhook> { type: start | stop, … } with
 * X-Zaryad24-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">.
 */

export const INTEGRATIONS = ['OCPP 1.6-J', 'OCPI 2.2.1', 'Network API', 'Только карта'];
export const MAP_ONLY = 'Только карта';
const STATUSES = ['available', 'occupied', 'reserved', 'unavailable'];
const TYPES = ['CCS2', 'Type2', 'GB/T DC', 'CHAdeMO'];
const ACTOR = { portal: 'system', name: 'Network API' };

const hash = key => crypto.createHash('sha256').update(key).digest('hex');
const now = () => new Date().toISOString();
const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** Sets how a network connects. For the Network API a fresh key is returned once and only its hash is kept. */
export function setIntegration(operator, { type, webhookUrl } = {}) {
  if (!INTEGRATIONS.includes(type)) return { status: 400, error: 'Выберите способ подключения' };
  if (type === 'OCPI 2.2.1' && !operator.ocpiPartnerId) return { status: 400, error: 'Сеть по OCPI подключается в блоке «Сети-партнёры по OCPI»' };
  let key = null;
  if (type === 'Network API') {
    let url;
    try {
      url = new URL(String(webhookUrl ?? ''));
    } catch {
      return { status: 400, error: 'Укажите адрес вебхука сети (https://…) — туда придут команды старта и остановки' };
    }
    if (!['http:', 'https:'].includes(url.protocol)) return { status: 400, error: 'Вебхук — только http или https' };
    // Already on the Network API: keep its key, only the webhook changes.
    const keep = operator.integration === 'Network API' && operator.networkApi ? operator.networkApi : null;
    key = keep ? null : `znk_${crypto.randomBytes(24).toString('hex')}`;
    operator.networkApi = keep
      ? { ...keep, webhookUrl: url.toString() }
      : { keyHash: hash(key), keyPrefix: key.slice(0, 8), secret: crypto.randomBytes(24).toString('hex'), webhookUrl: url.toString(), createdAt: now() };
  }
  operator.integration = type;
  db.save();
  return { ok: true, key, secret: key ? operator.networkApi.secret : null };
}

/** Issues a new key (the old one stops working at once). */
export function rotateKey(operator) {
  if (operator.integration !== 'Network API' || !operator.networkApi) return { status: 409, error: 'Сеть подключена не через Network API' };
  const key = `znk_${crypto.randomBytes(24).toString('hex')}`;
  operator.networkApi = { ...operator.networkApi, keyHash: hash(key), keyPrefix: key.slice(0, 8), secret: crypto.randomBytes(24).toString('hex'), createdAt: now() };
  db.save();
  return { key, secret: operator.networkApi.secret };
}

export const publicIntegration = op => ({
  type: op.integration,
  networkApi: op.networkApi ? { keyPrefix: op.networkApi.keyPrefix, webhookUrl: op.networkApi.webhookUrl, createdAt: op.networkApi.createdAt } : null,
});

// ---------------------------------------------------------------------------
// The API a network calls
// ---------------------------------------------------------------------------

export const networkApi = express.Router();
networkApi.use(express.json({ limit: '1mb' }));

function networkAuth(req, res, next) {
  const m = String(req.headers.authorization ?? '').match(/^Bearer\s+(znk_[a-f0-9]{48})$/);
  const h = m ? hash(m[1]) : null;
  const op = h && db.data.operators.find(o => o.integration === 'Network API' && o.networkApi?.keyHash === h);
  if (!op) return res.status(401).json({ error: 'Неверный или отозванный ключ' });
  if (op.status === 'suspended') return res.status(403).json({ error: 'Сеть приостановлена' });
  req.operator = op;
  next();
}

const ref = v => text(v, 64);
const stationByRef = (op, r) => db.data.stations.find(st => st.ext?.operatorId === op.id && st.ext.ref === r);

/** Station as we show it to the network: its references, not our ids. */
const view = st => ({
  ref: st.ext.ref,
  id: st.id,
  name: st.name,
  address: st.address,
  city: st.city,
  lat: st.geoLat,
  lng: st.geoLng,
  connectors: st.connectors.map(c => ({ ref: c.ext.ref, id: c.id, type: c.type, power: c.power, price: c.price, status: c.status })),
});

function announce(st, c) {
  emit({
    type: 'evse.status',
    portal: 'system',
    actor: 'Network API',
    message: `EVSE ${c.id} · ${st.name} → ${c.status} (Network API)`,
    entity: `${st.id}:${c.id}`,
    payload: { stationId: st.id, connectorId: c.id, status: c.status, operatorId: st.operatorId },
  });
}

networkApi.put('/stations/:ref', networkAuth, (req, res) => {
  const op = req.operator;
  const b = req.body ?? {};
  const r = ref(req.params.ref);
  const name = text(b.name, 60);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!r) return res.status(400).json({ error: 'Нужен ref станции' });
  if (name.length < 3) return res.status(400).json({ error: 'name — от 3 символов' });
  if (!(lat > 37 && lat < 46 && lng > 55.9 && lng < 73.2)) return res.status(400).json({ error: 'lat/lng — в пределах Узбекистана' });
  const specs = Array.isArray(b.connectors) ? b.connectors.slice(0, 16) : [];
  if (!specs.length) return res.status(400).json({ error: 'Нужен хотя бы один разъём в connectors' });
  for (const c of specs) {
    if (!ref(c.ref)) return res.status(400).json({ error: 'У каждого разъёма нужен ref' });
    if (!TYPES.includes(c.type)) return res.status(400).json({ error: `type — один из: ${TYPES.join(', ')}` });
    if (!(Number(c.power) >= 3.7 && Number(c.power) <= 400)) return res.status(400).json({ error: 'power — от 3,7 до 400 кВт' });
    if (!(Number(c.price) >= 300 && Number(c.price) <= 10000)) return res.status(400).json({ error: 'price — от 300 до 10 000 сум за кВт·ч' });
    if (c.status && !STATUSES.includes(c.status)) return res.status(400).json({ error: `status — один из: ${STATUSES.join(', ')}` });
  }

  let st = stationByRef(op, r);
  const created = !st;
  if (!st) {
    const n = Math.max(0, ...db.data.stations.map(s => Number(s.id.slice(3)) || 0)) + 1;
    st = {
      id: `st-${String(n).padStart(3, '0')}`,
      operator: op.name,
      operatorId: op.id,
      connectors: [],
      rating: 0,
      reviews: 0,
      amenities: [],
      image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
      ext: { operatorId: op.id, ref: r },
    };
    db.data.stations.push(st);
  }
  Object.assign(st, {
    name,
    address: text(b.address, 120),
    city: text(b.city, 40),
    geoLat: lat,
    geoLng: lng,
    lat: Math.round(((45.6 - lat) / 8.4) * 100),
    lng: Math.round(((lng - 56) / 17.2) * 100),
    hours: text(b.hours, 20) || '24/7',
  });
  let nextC = Math.max(0, ...db.data.stations.flatMap(s => s.connectors.map(c => Number(c.id.slice(1)) || 0))) + 1;
  for (const spec of specs) {
    let c = st.connectors.find(x => x.ext?.ref === ref(spec.ref));
    if (!c) {
      c = { id: `c${nextC++}`, status: 'unavailable', ext: { ref: ref(spec.ref) } };
      st.connectors.push(c);
    }
    c.type = spec.type;
    c.power = Number(spec.power);
    c.price = Math.round(Number(spec.price));
    const busy = db.data.sessions.some(s => s.status === 'active' && s.stationId === st.id && s.connectorId === c.id);
    if (spec.status && !(busy && spec.status === 'available')) c.status = spec.status;
  }
  st.totalPower = Math.max(...st.connectors.map(c => c.power));
  op.stations = db.data.stations.filter(s => s.operatorId === op.id).length;
  op.evse = db.data.stations.filter(s => s.operatorId === op.id).reduce((n, s) => n + s.connectors.length, 0);
  db.save();
  if (created) emit({ type: 'station.added', portal: 'operator', actor: op.name, message: `${op.name}: новая станция ${st.name} (Network API)`, entity: st.id, payload: { operatorId: op.id } });
  res.status(created ? 201 : 200).json(view(st));
});

networkApi.patch('/stations/:ref/connectors/:cref', networkAuth, (req, res) => {
  const st = stationByRef(req.operator, ref(req.params.ref));
  const c = st?.connectors.find(x => x.ext?.ref === ref(req.params.cref));
  if (!c) return res.status(404).json({ error: 'Станция или разъём не найдены' });
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status — один из: ${STATUSES.join(', ')}` });
  const busy = db.data.sessions.some(s => s.status === 'active' && s.stationId === st.id && s.connectorId === c.id);
  if (c.status !== status && !(busy && status === 'available')) {
    c.status = status;
    db.save();
    announce(st, c);
  }
  res.json({ ref: c.ext.ref, status: c.status });
});

networkApi.get('/stations', networkAuth, (req, res) => {
  res.json(db.data.stations.filter(st => st.ext?.operatorId === req.operator.id).map(view));
});

/**
 * The network reports a charge: `started` opens ours (after a start command,
 * or a driver who began in front of the charger with their Zaryad24 id),
 * `meter` updates the energy, `stopped` settles it at the network's price.
 */
networkApi.post('/sessions/:ref', networkAuth, (req, res) => {
  const op = req.operator;
  const r = ref(req.params.ref);
  const b = req.body ?? {};
  let session = db.data.sessions.find(s => s.networkRef === r && s.networkOperatorId === op.id);

  if (b.event === 'started') {
    if (session) return res.json({ id: session.id, status: session.status });
    const account = db.byId('accounts', String(b.driverId ?? ''));
    const st = stationByRef(op, ref(b.station));
    const c = st?.connectors.find(x => x.ext?.ref === ref(b.connector));
    if (!account || account.portal !== 'driver') return res.status(404).json({ error: 'Водитель не найден (driverId)' });
    if (!c) return res.status(404).json({ error: 'Станция или разъём не найдены (station, connector)' });
    // The network may already have marked the connector busy — for this very charge.
    if (c.status === 'occupied' && !db.data.sessions.some(s => s.status === 'active' && s.stationId === st.id && s.connectorId === c.id)) c.status = 'available';
    const out = beginSession(account, st.id, c.id, { source: 'network' });
    if (out.error) return res.status(out.status).json({ error: out.error });
    out.session.networkRef = r;
    out.session.networkOperatorId = op.id;
    db.save();
    return res.status(201).json({ id: out.session.id, status: 'active' });
  }
  if (!session) return res.status(404).json({ error: 'Сессия не найдена — сначала event: started' });
  if (b.event === 'meter') {
    if (session.status === 'active' && Number(b.kwh) >= 0) meterSession(session, Number(b.kwh));
    return res.json({ id: session.id, status: session.status, energy: session.energy });
  }
  if (b.event === 'stopped') {
    if (session.status === 'active') {
      const cost = Number(b.cost);
      completeSession(session, ACTOR, { energyKwh: Number(b.kwh) || 0, cost: Number.isFinite(cost) && cost >= 0 ? Math.round(cost) : null });
    }
    return res.json({ id: session.id, status: session.status, energy: session.energy, cost: session.cost });
  }
  res.status(400).json({ error: 'event — started, meter или stopped' });
});

// ---------------------------------------------------------------------------
// Commands to the network
// ---------------------------------------------------------------------------

const operatorOf = station => {
  const op = station?.ext ? db.byId('operators', station.ext.operatorId) : null;
  return op?.integration === 'Network API' && op.networkApi ? op : null;
};

async function command(op, payload) {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', op.networkApi.secret).update(`${t}.${body}`).digest('hex');
  try {
    const res = await fetch(op.networkApi.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Zaryad24-Network/1.0', 'X-Zaryad24-Event': `command.${payload.type}`, 'X-Zaryad24-Signature': `t=${t},v1=${sig}` },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json.accepted !== false;
  } catch {
    return false;
  }
}

setRoaming({
  source: 'network',
  isRoaming: station => !!operatorOf(station),
  startRemote: async (station, connector, account) => {
    const op = operatorOf(station);
    return command(op, { type: 'start', commandId: crypto.randomBytes(8).toString('hex'), station: station.ext.ref, connector: connector.ext.ref, driver: { id: account.id, name: account.name } });
  },
  stopRemote: async session => {
    const op = db.byId('operators', session.networkOperatorId);
    if (!op?.networkApi) return false;
    return command(op, { type: 'stop', commandId: crypto.randomBytes(8).toString('hex'), session: session.networkRef });
  },
});

// ---------------------------------------------------------------------------
// Admin: choose how a network connects
// ---------------------------------------------------------------------------

api.get('/admin/operators/:id/integration', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Оператор не найден' });
  res.json(publicIntegration(op));
});

api.put('/admin/operators/:id/integration', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Оператор не найден' });
  const r = setIntegration(op, req.body ?? {});
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  emit({ type: 'operator.integration', portal: 'admin', actor: req.account.name, message: `${op.name}: подключение — ${op.integration}`, entity: op.id });
  res.json({ ...publicIntegration(op), key: r.key, secret: r.secret });
});

api.post('/admin/operators/:id/integration/rotate', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Оператор не найден' });
  const r = rotateKey(op);
  if (r.error) return res.status(r.status ?? 400).json({ error: r.error });
  res.json({ ...publicIntegration(op), ...r });
});

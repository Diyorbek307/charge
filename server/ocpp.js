import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { db } from './db.js';
import { beginSession, completeSession, meterSession, emit, setGateway } from './api.js';

/**
 * OCPP 1.6-J central system.
 *
 * Charge points connect to wss://<host>/ocpp/<stationId> with the "ocpp1.6"
 * subprotocol and HTTP Basic auth (OCPP Security Profile 1: the username is
 * the station id). Everything a charge point reports goes through the same
 * beginSession/completeSession the app uses, so a wallet, booking, queue or
 * one-session-per-account rule applies no matter which side starts a charge.
 *
 * For a connected station the charge point is the source of truth: the app
 * asks it to start or stop, and the session changes when the station reports
 * StartTransaction / StopTransaction.
 */

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
// Outside the demo there is no default password: an unset key refuses everyone.
const PASSWORD = process.env.OCPP_PASSWORD || (DEMO_MODE ? 'ocpp-demo-key' : '');

const CALL = 2;
const RESULT = 3;
const ERROR = 4;
const CALL_TIMEOUT_MS = 10_000;
const OCPP_ACTOR = { portal: 'system', name: 'OCPP' };

/** stationId -> { ws, pending: Map<uid, { resolve }> } */
const chargePoints = new Map();

/** OCPP connector status -> the status the rest of the platform uses. */
const STATUS_MAP = {
  Available: 'available',
  Preparing: 'available',
  Charging: 'occupied',
  SuspendedEV: 'occupied',
  SuspendedEVSE: 'occupied',
  Finishing: 'occupied',
  Reserved: 'reserved',
  Unavailable: 'unavailable',
  Faulted: 'unavailable',
};

const ocppError = (code, description) => Object.assign(new Error(description), { ocppCode: code });

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function authenticate(req, stationId) {
  if (!PASSWORD) return false;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return false;
  // Compare both halves so a wrong station id and a wrong key cost the same.
  const userOk = safeEqual(decoded.slice(0, colon), stationId);
  const passOk = safeEqual(decoded.slice(colon + 1), PASSWORD);
  return userOk && passOk;
}

const connectorByIndex = (station, n) => station.connectors[Number(n) - 1] ?? null;
const indexOfConnector = (station, id) => station.connectors.findIndex(c => c.id === id) + 1;

const activeByTransaction = (stationId, transactionId) =>
  db.data.sessions.find(
    s =>
      s.status === 'active' &&
      s.source === 'ocpp' &&
      s.stationId === stationId &&
      s.ocppTransactionId === transactionId,
  ) ?? null;

function nextTransactionId() {
  const id = db.data.counters.ocppTx ?? 1;
  db.data.counters.ocppTx = id + 1;
  db.save();
  return id;
}

function touch(station) {
  station.ocpp = { ...(station.ocpp ?? {}), online: true, lastSeen: new Date().toISOString() };
  db.save();
}

function send(cp, frame) {
  if (cp.ws.readyState === cp.ws.OPEN) cp.ws.send(JSON.stringify(frame));
}

/** Central system -> charge point call. Resolves with the result payload, or null. */
function call(stationId, action, payload) {
  const cp = chargePoints.get(stationId);
  if (!cp) return Promise.resolve(null);
  const uid = crypto.randomUUID();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      cp.pending.delete(uid);
      resolve(null);
    }, CALL_TIMEOUT_MS);
    cp.pending.set(uid, {
      resolve: value => {
        clearTimeout(timer);
        resolve(value);
      },
    });
    send(cp, [CALL, uid, action, payload]);
  });
}

/** Energy.Active.Import.Register in Wh, from an OCPP meterValue array. */
function energyWh(meterValue = []) {
  for (const mv of meterValue) {
    for (const sv of mv.sampledValue ?? []) {
      if ((sv.measurand ?? 'Energy.Active.Import.Register') !== 'Energy.Active.Import.Register') continue;
      const value = Number(sv.value);
      if (!Number.isFinite(value)) continue;
      return sv.unit === 'kWh' ? value * 1000 : value;
    }
  }
  return null;
}

function setConnectorStatus(station, connector, next) {
  if (connector.status === next) return;
  connector.status = next;
  db.save();
  emit({
    type: 'evse.status',
    portal: 'system',
    actor: 'OCPP',
    message: `EVSE ${connector.id} · ${station.name} → ${next} (OCPP)`,
    entity: `${station.id}:${connector.id}`,
    payload: { stationId: station.id, connectorId: connector.id, status: next },
  });
}

function raiseFault(station, connector, errorCode, info) {
  const code = `OCPP_${errorCode}`;
  const alreadyOpen = db.data.alerts.some(
    a => !a.ack && a.stationId === station.id && a.code === code && a.connectorId === connector.id,
  );
  if (alreadyOpen) return;

  const alert = {
    id: db.nextId('alert', 'AL-'),
    severity: 'critical',
    stationId: station.id,
    station: station.name,
    operatorId: station.operatorId,
    connectorId: connector.id,
    code,
    message: `Станция сообщила об ошибке ${errorCode} на ${connector.id}${info ? ` · ${info}` : ''}`,
    time: new Date().toISOString(),
    ack: false,
  };
  db.insert('alerts', alert);
  emit({
    type: 'alert.new',
    portal: 'system',
    actor: 'OCPP',
    message: `Ошибка станции · ${station.name} · ${errorCode}`,
    entity: alert.id,
    payload: { severity: 'critical', stationId: station.id },
  });
}

const handlers = {
  BootNotification(station, p) {
    station.ocpp = {
      ...(station.ocpp ?? {}),
      online: true,
      vendor: String(p.chargePointVendor ?? '').slice(0, 20),
      model: String(p.chargePointModel ?? '').slice(0, 20),
      firmware: p.firmwareVersion ? String(p.firmwareVersion).slice(0, 50) : null,
      lastSeen: new Date().toISOString(),
    };
    db.save();
    return { status: 'Accepted', currentTime: new Date().toISOString(), interval: 60 };
  },

  Heartbeat(station) {
    touch(station);
    return { currentTime: new Date().toISOString() };
  },

  Authorize(station, p) {
    touch(station);
    const account = db.byId('accounts', String(p.idTag ?? ''));
    return { idTagInfo: { status: account ? 'Accepted' : 'Invalid' } };
  },

  StatusNotification(station, p) {
    touch(station);
    // connectorId 0 describes the charge point as a whole.
    if (Number(p.connectorId) === 0) return {};
    const connector = connectorByIndex(station, p.connectorId);
    if (!connector) throw ocppError('PropertyConstraintViolation', 'Unknown connectorId');
    const next = STATUS_MAP[p.status];
    if (!next) throw ocppError('PropertyConstraintViolation', `Unknown status ${p.status}`);

    // A running session keeps its connector until StopTransaction settles it.
    const running = db.data.sessions.some(
      s => s.status === 'active' && s.stationId === station.id && s.connectorId === connector.id,
    );
    if (!(running && next === 'available')) setConnectorStatus(station, connector, next);
    if (p.status === 'Faulted' && p.errorCode && p.errorCode !== 'NoError') {
      raiseFault(station, connector, p.errorCode, p.info);
    }
    return {};
  },

  StartTransaction(station, p) {
    touch(station);
    const connector = connectorByIndex(station, p.connectorId);
    if (!connector) throw ocppError('PropertyConstraintViolation', 'Unknown connectorId');

    // OCPP requires a transactionId even when the start is refused.
    const transactionId = nextTransactionId();
    const account = db.byId('accounts', String(p.idTag ?? ''));
    if (!account) return { transactionId, idTagInfo: { status: 'Invalid' } };

    const result = beginSession(account, station.id, connector.id, {
      source: 'ocpp',
      ocppTransactionId: transactionId,
      meterStartWh: Number(p.meterStart) || 0,
    });
    if (result.error) {
      return { transactionId, idTagInfo: { status: result.status === 402 ? 'Blocked' : 'Invalid' } };
    }
    return { transactionId, idTagInfo: { status: 'Accepted' } };
  },

  MeterValues(station, p) {
    touch(station);
    const session = p.transactionId == null ? null : activeByTransaction(station.id, Number(p.transactionId));
    const wh = energyWh(p.meterValue);
    if (session && wh !== null) meterSession(session, (wh - (session.meterStartWh ?? 0)) / 1000);
    return {};
  },

  StopTransaction(station, p) {
    touch(station);
    const session = activeByTransaction(station.id, Number(p.transactionId));
    if (session) {
      completeSession(session, OCPP_ACTOR, {
        energyKwh: (Number(p.meterStop) - (session.meterStartWh ?? 0)) / 1000,
      });
    }
    return { idTagInfo: { status: 'Accepted' } };
  },
};

function onConnect(stationId, ws) {
  const previous = chargePoints.get(stationId);
  if (previous) previous.ws.close(4000, 'Replaced by a new connection');

  const cp = { ws, pending: new Map() };
  chargePoints.set(stationId, cp);

  const station = db.byId('stations', stationId);
  station.ocpp = { ...(station.ocpp ?? {}), online: true, connectedAt: new Date().toISOString(), lastSeen: new Date().toISOString() };
  db.save();
  emit({
    type: 'ocpp.online',
    portal: 'system',
    actor: 'OCPP',
    message: `Станция на связи по OCPP · ${station.name}`,
    entity: stationId,
  });

  ws.on('message', raw => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return; // unparseable frame has no uid to answer
    }
    if (!Array.isArray(frame)) return;
    const [type, uid] = frame;

    if (type === CALL) {
      const [, , action, payload] = frame;
      const handler = handlers[action];
      if (!handler) {
        send(cp, [ERROR, uid, 'NotImplemented', `Unsupported action ${action}`, {}]);
        return;
      }
      try {
        // Re-read: an admin reset replaces the station objects.
        const current = db.byId('stations', stationId);
        send(cp, [RESULT, uid, handler(current, payload ?? {}) ?? {}]);
      } catch (err) {
        send(cp, [ERROR, uid, err.ocppCode ?? 'InternalError', err.message, {}]);
      }
      return;
    }

    if (type === RESULT || type === ERROR) {
      const pending = cp.pending.get(uid);
      if (!pending) return;
      cp.pending.delete(uid);
      pending.resolve(type === RESULT ? (frame[2] ?? {}) : null);
    }
  });

  ws.on('close', () => {
    if (chargePoints.get(stationId) !== cp) return;
    chargePoints.delete(stationId);
    for (const pending of cp.pending.values()) pending.resolve(null);
    const current = db.byId('stations', stationId);
    if (current?.ocpp) {
      current.ocpp.online = false;
      db.save();
    }
    emit({
      type: 'ocpp.offline',
      portal: 'system',
      actor: 'OCPP',
      message: `Станция потеряла связь по OCPP · ${current?.name ?? stationId}`,
      entity: stationId,
    });
  });
}

const isConnected = stationId => chargePoints.has(stationId);

async function remoteStart(stationId, connectorId, idTag) {
  const station = db.byId('stations', stationId);
  const n = station ? indexOfConnector(station, connectorId) : 0;
  if (!n) return false;
  const result = await call(stationId, 'RemoteStartTransaction', { connectorId: n, idTag });
  return result?.status === 'Accepted';
}

async function remoteStop(stationId, transactionId) {
  const result = await call(stationId, 'RemoteStopTransaction', { transactionId });
  return result?.status === 'Accepted';
}

function list() {
  return [...chargePoints.keys()].map(id => {
    const s = db.byId('stations', id);
    return {
      stationId: id,
      name: s?.name ?? id,
      operatorId: s?.operatorId ?? null,
      ...(s?.ocpp ?? {}),
      connectors: (s?.connectors ?? []).map((c, i) => ({ ocppConnectorId: i + 1, id: c.id, status: c.status })),
    };
  });
}

/** Mounts the OCPP endpoint on the HTTP server and registers the gateway with the API. */
export function attachOcpp(server) {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: protocols => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
  });

  server.on('upgrade', (req, socket, head) => {
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/ocpp\/([\w.-]+)$/);
    if (!match) return reject(404, 'Not Found');
    const stationId = decodeURIComponent(match[1]);
    if (!db.byId('stations', stationId)) return reject(404, 'Not Found');
    if (!authenticate(req, stationId)) return reject(401, 'Unauthorized');

    wss.handleUpgrade(req, socket, head, ws => {
      if (ws.protocol !== 'ocpp1.6') {
        ws.close(1002, 'ocpp1.6 subprotocol required');
        return;
      }
      onConnect(stationId, ws);
    });
  });

  setGateway({ isConnected, remoteStart, remoteStop, list });
  return wss;
}

#!/usr/bin/env node
/**
 * OCPP 1.6-J charge point simulator.
 *
 *   node scripts/ocpp-simulator.mjs --station st-003
 *        [--url ws://localhost:3000] [--password ocpp-demo-key]
 *        [--connectors 2] [--power 50] [--speed 60]
 *
 * Boots, reports every connector Available, then obeys RemoteStartTransaction
 * and RemoteStopTransaction from the central system while streaming
 * MeterValues. --speed compresses time: 60 means each real second is metered
 * as a minute of charging, so a demo shows real numbers quickly.
 *
 * Against the live demo:
 *   node scripts/ocpp-simulator.mjs --url wss://charge-qogf.onrender.com --station st-003
 */
import WebSocket from 'ws';
import crypto from 'node:crypto';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);

const URL_BASE = (args.url ?? 'ws://localhost:3000').replace(/\/$/, '');
const STATION = args.station ?? 'st-003';
const PASSWORD = args.password ?? 'ocpp-demo-key';
const CONNECTORS = Number(args.connectors ?? 2);
const POWER_KW = Number(args.power ?? 50);
const SPEED = Number(args.speed ?? 60);
const METER_EVERY_MS = 5000;

const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

let ws;
let heartbeat = null;
const pending = new Map();
/** connector index -> { transactionId, idTag, energyWh, timer } */
const active = new Map();
let meterWh = 1_000_000; // lifetime register; a real meter never starts at zero

function call(action, payload) {
  const uid = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(uid, { resolve, reject, action });
    ws.send(JSON.stringify([2, uid, action, payload]));
  });
}

const status = (connectorId, s, errorCode = 'NoError') =>
  call('StatusNotification', { connectorId, errorCode, status: s, timestamp: new Date().toISOString() });

async function startTransaction(connectorId, idTag) {
  await status(connectorId, 'Preparing');
  const res = await call('StartTransaction', { connectorId, idTag, meterStart: meterWh, timestamp: new Date().toISOString() });
  if (res.idTagInfo?.status !== 'Accepted') {
    log(`connector ${connectorId}: start refused (${res.idTagInfo?.status})`);
    await status(connectorId, 'Available');
    return;
  }
  const tx = { transactionId: res.transactionId, idTag, startWh: meterWh };
  tx.timer = setInterval(async () => {
    meterWh += Math.round((POWER_KW * 1000 * (METER_EVERY_MS / 1000) * SPEED) / 3600);
    const kwh = ((meterWh - tx.startWh) / 1000).toFixed(1);
    await call('MeterValues', {
      connectorId,
      transactionId: tx.transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [{ value: String(meterWh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }],
        },
      ],
    });
    log(`connector ${connectorId}: tx ${tx.transactionId} · ${kwh} kWh`);
  }, METER_EVERY_MS);
  active.set(connectorId, tx);
  await status(connectorId, 'Charging');
  log(`connector ${connectorId}: charging, tx ${tx.transactionId} for ${idTag}`);
}

async function stopTransaction(connectorId, reason = 'Remote') {
  const tx = active.get(connectorId);
  if (!tx) return;
  clearInterval(tx.timer);
  active.delete(connectorId);
  await status(connectorId, 'Finishing');
  await call('StopTransaction', {
    transactionId: tx.transactionId,
    meterStop: meterWh,
    timestamp: new Date().toISOString(),
    reason,
  });
  await status(connectorId, 'Available');
  log(`connector ${connectorId}: stopped tx ${tx.transactionId} · ${((meterWh - tx.startWh) / 1000).toFixed(1)} kWh`);
}

const inbound = {
  RemoteStartTransaction(p) {
    const connectorId = Number(p.connectorId ?? 1);
    if (connectorId < 1 || connectorId > CONNECTORS || active.has(connectorId)) return { status: 'Rejected' };
    setImmediate(() => startTransaction(connectorId, p.idTag).catch(e => log('start failed:', e.message)));
    return { status: 'Accepted' };
  },
  RemoteStopTransaction(p) {
    const entry = [...active.entries()].find(([, tx]) => tx.transactionId === p.transactionId);
    if (!entry) return { status: 'Rejected' };
    setImmediate(() => stopTransaction(entry[0]).catch(e => log('stop failed:', e.message)));
    return { status: 'Accepted' };
  },
};

function connect() {
  const auth = Buffer.from(`${STATION}:${PASSWORD}`).toString('base64');
  ws = new WebSocket(`${URL_BASE}/ocpp/${STATION}`, ['ocpp1.6'], { headers: { Authorization: `Basic ${auth}` } });

  ws.on('unexpected-response', (_req, res) => {
    log(`connection refused: HTTP ${res.statusCode}`);
    if (res.statusCode === 401 || res.statusCode === 404) process.exit(1);
  });

  ws.on('open', async () => {
    log(`connected to ${URL_BASE} as ${STATION}`);
    const boot = await call('BootNotification', { chargePointVendor: 'OneCharge', chargePointModel: 'Simulator' });
    log(`boot ${boot.status}, heartbeat every ${boot.interval}s`);
    for (let c = 1; c <= CONNECTORS; c++) await status(c, 'Available');
    heartbeat = setInterval(() => call('Heartbeat', {}).catch(() => {}), (boot.interval ?? 60) * 1000);
    log('ready — start a charge on this station in the Driver App');
  });

  ws.on('message', raw => {
    const frame = JSON.parse(raw.toString());
    const [type, uid] = frame;
    if (type === 2) {
      const [, , action, payload] = frame;
      const handler = inbound[action];
      if (!handler) return ws.send(JSON.stringify([4, uid, 'NotImplemented', action, {}]));
      log(`← ${action} ${JSON.stringify(payload)}`);
      ws.send(JSON.stringify([3, uid, handler(payload)]));
    } else if (type === 3 || type === 4) {
      const p = pending.get(uid);
      if (!p) return;
      pending.delete(uid);
      type === 3 ? p.resolve(frame[2]) : p.reject(new Error(`${p.action}: ${frame[2]} ${frame[3]}`));
    }
  });

  ws.on('close', code => {
    clearInterval(heartbeat);
    for (const tx of active.values()) clearInterval(tx.timer);
    active.clear();
    log(`disconnected (${code}), reconnecting in 5s`);
    setTimeout(connect, 5000);
  });

  ws.on('error', err => log('socket error:', err.message));
}

process.on('SIGINT', async () => {
  log('stopping open transactions…');
  for (const c of [...active.keys()]) await stopTransaction(c, 'Local').catch(() => {});
  process.exit(0);
});

connect();

/**
 * Load test: a thousand drivers sign up, sign in, open the map and charge,
 * against a fresh server with its own data. Prints how long each step takes
 * (median and the slowest 5%), errors, the size of the state a driver loads
 * and the server's memory.
 *
 *   node scripts/load-test.mjs [drivers=1000] [parallel=25]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const N = Number(process.argv[2] ?? 1000);
const PAR = Number(process.argv[3] ?? 25);
const PORT = 11000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}/api`;
const dir = mkdtempSync(join(tmpdir(), 'pg-load-'));

const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEMO_SIMULATION: 'false', DATABASE_URL: '', OSM_PLACES: 'false', OSM_CAMERAS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverErrors = '';
server.stderr.on('data', d => (serverErrors += d));

async function call(path, { method = 'GET', token, body, ip } = {}) {
  const t = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null, ms: performance.now() - t, bytes: text.length };
}

const stats = {};
const record = (step, r, ok = r.status < 400) => {
  const s = (stats[step] ??= { ms: [], errors: 0, statuses: {}, bytes: 0 });
  s.ms.push(r.ms);
  s.bytes = Math.max(s.bytes, r.bytes ?? 0);
  if (!ok) {
    s.errors++;
    s.statuses[r.status] = (s.statuses[r.status] ?? 0) + 1;
  }
};
async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
};

for (let i = 0; i < 200; i++) {
  try {
    if ((await fetch(`${BASE}/state`)).ok) break;
  } catch {
    /* starting */
  }
  await new Promise(r => setTimeout(r, 100));
}

const drivers = Array.from({ length: N }, (_, i) => ({ phone: `+99893${String(1000000 + i).slice(-7)}`, ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, token: null }));
const t0 = Date.now();

// 1. Sign up: a code by SMS (the demo returns it), then the account.
await pool(drivers, async d => {
  const code = await call('/auth/sms/request', { method: 'POST', ip: d.ip, body: { phone: d.phone, purpose: 'register' } });
  record('sms code', code);
  if (!code.data?.demoCode) return;
  const reg = await call('/auth/register', { method: 'POST', ip: d.ip, body: { phone: d.phone, name: `Водитель ${d.phone.slice(-4)}`, password: 'Driver2026!x', code: code.data.demoCode } });
  record('register', reg, reg.status === 201);
});
// 2. Sign in again, as a returning driver would.
await pool(drivers, async d => {
  const r = await call('/auth/login', { method: 'POST', ip: d.ip, body: { portal: 'driver', login: d.phone, password: 'Driver2026!x' } });
  record('login', r);
  d.token = r.data?.token ?? null;
});
// 3. Open the app: the state a driver's map loads.
await pool(drivers.filter(d => d.token), async d => record('state', await call('/state', { token: d.token })));
// 4. Charge: a few hundred start and stop.
const stations = (await call('/state')).data.stations.filter(s => !s.ocpi && !s.private);
let k = 0;
await pool(drivers.filter(d => d.token).slice(0, Math.min(300, N)), async d => {
  const st = stations[k++ % stations.length];
  const c = st.connectors[k % st.connectors.length];
  await call('/payments/topup', { method: 'POST', token: d.token, ip: d.ip, body: { provider: 'payme', amount: 100000 } }).then(async t => {
    if (t.data?.order) await call(`/payments/order/${t.data.order.id}/sandbox-confirm`, { method: 'POST', token: d.token });
  });
  const s = await call('/sessions/start', { method: 'POST', token: d.token, body: { stationId: st.id, connectorId: c.id } });
  record('charge start', s, s.status < 300 || s.status === 409);
  if (s.data?.session) record('charge stop', await call(`/sessions/${s.data.session.id}/stop`, { method: 'POST', token: d.token }));
});

const mem = await call('/health').catch(() => null);
const dbFile = join(dir, 'db.json');
console.log(`\n${N} drivers, ${PAR} at a time, ${Math.round((Date.now() - t0) / 1000)} s in all\n`);
console.log('step            count  errors  median ms  p95 ms  max ms  largest reply');
for (const [step, s] of Object.entries(stats)) {
  console.log(`${step.padEnd(15)} ${String(s.ms.length).padStart(5)}  ${String(s.errors).padStart(6)}  ${pct(s.ms, 50).toFixed(0).padStart(9)}  ${pct(s.ms, 95).toFixed(0).padStart(6)}  ${Math.max(...s.ms).toFixed(0).padStart(6)}  ${(s.bytes / 1024).toFixed(0)} KB${s.errors ? `  ${JSON.stringify(s.statuses)}` : ''}`);
}
await new Promise(r => setTimeout(r, 1500));
if (existsSync(dbFile)) console.log(`\ndatabase file ${(statSync(dbFile).size / 1048576).toFixed(1)} MB`);
if (mem) console.log(`health ${mem.status} in ${mem.ms.toFixed(0)} ms`);
if (serverErrors.trim()) console.log(`\nserver stderr:\n${serverErrors.slice(0, 2000)}`);
server.kill();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* Windows may hold the file */
}

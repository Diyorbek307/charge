import { db } from './db.js';
import { api, requireAuth } from './api.js';

/**
 * How dependable each station is, the number a driver checks before a long
 * drive and a network is ranked by:
 *
 *   starts   the share of charges in the last 30 days that started and ran
 *            (a failed start is a charge the driver came for and did not get);
 *   uptime   the share of time its connectors were in working order, sampled
 *            every 10 minutes over the last 30 days.
 *
 * The score is the lower of the two, so a station cannot hide frequent
 * failed starts behind being switched on. It is written onto the station as
 * `reliability`, which every portal already loads.
 */

const DAY = 86400_000;
const WINDOW = 30 * DAY;
const SAMPLE_EVERY = 10 * 60_000;
// Fewer starts than this say nothing yet about a station.
const MIN_STARTS = 5;

const samples = () => (db.data.uptime ??= {});
const round = n => Math.round(n * 10) / 10;

/** One reading per station: the share of its connectors not out of order. */
function sample(now = Date.now()) {
  const all = samples();
  for (const st of db.data.stations) {
    if (!st.connectors.length) continue;
    const up = st.connectors.filter(c => c.status !== 'unavailable').length / st.connectors.length;
    const list = (all[st.id] ??= []);
    list.push([now, Math.round(up * 1000) / 1000]);
    while (list.length && list[0][0] < now - WINDOW) list.shift();
  }
}

/** The score of every station, from the history of charges and the uptime readings. */
export function refreshReliability(now = Date.now()) {
  const starts = new Map();
  for (const s of db.data.sessions) {
    if (Date.parse(s.start) < now - WINDOW || (s.status !== 'completed' && s.status !== 'failed')) continue;
    const row = starts.get(s.stationId) ?? { ok: 0, failed: 0 };
    row[s.status === 'failed' ? 'failed' : 'ok'] += 1;
    starts.set(s.stationId, row);
  }
  const all = samples();
  for (const st of db.data.stations) {
    const run = starts.get(st.id) ?? { ok: 0, failed: 0 };
    const total = run.ok + run.failed;
    const readings = all[st.id] ?? [];
    // A day of readings before uptime counts; until then only the starts speak.
    const uptime = readings.length >= 144 ? round((readings.reduce((n, [, up]) => n + up, 0) / readings.length) * 100) : null;
    const startRate = total >= MIN_STARTS ? round((run.ok / total) * 100) : null;
    const parts = [startRate, uptime].filter(v => v !== null);
    st.reliability = parts.length ? { score: Math.min(...parts), starts: startRate, uptime, charges: total } : null;
  }
}

export function startReliability() {
  sample();
  refreshReliability();
  db.save();
  const timer = setInterval(() => {
    sample();
    refreshReliability();
    db.save();
  }, SAMPLE_EVERY);
  timer.unref?.();
}

/** Networks ranked by their stations' reliability, weighted by how much each is used. */
export function networkReliability() {
  const byNetwork = new Map();
  for (const st of db.data.stations) {
    if (!st.reliability) continue;
    const row = byNetwork.get(st.operatorId) ?? { operatorId: st.operatorId, name: st.operator, weight: 0, sum: 0, stations: 0, weakest: null };
    const w = Math.max(st.reliability.charges, 1);
    row.weight += w;
    row.sum += st.reliability.score * w;
    row.stations += 1;
    if (!row.weakest || st.reliability.score < row.weakest.score) row.weakest = { id: st.id, name: st.name, score: st.reliability.score };
    byNetwork.set(st.operatorId, row);
  }
  return [...byNetwork.values()]
    .map(({ weight, sum, ...rest }) => ({ ...rest, score: round(sum / weight) }))
    .sort((a, b) => b.score - a.score);
}

api.get('/admin/reliability', requireAuth('admin'), (_req, res) => {
  const stations = db.data.stations
    .filter(s => s.reliability)
    .map(s => ({ id: s.id, name: s.name, city: s.city, operator: s.operator, ...s.reliability }))
    .sort((a, b) => a.score - b.score);
  res.json({ networks: networkReliability(), stations });
});

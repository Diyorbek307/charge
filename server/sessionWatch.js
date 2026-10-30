import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit, startCharge, stopCharge, chargeGoal } from './api.js';
import { demoEnergy } from './history.js';
import { pushLiveCharge } from './push.js';
import { setting, feature } from './settings.js';

/**
 * Watches running charges and the clock, so the driver does not have to:
 *
 *   goals       a charge "up to 80%", "for 30 000 сум" or "for 150 km" is
 *               stopped automatically when it gets there;
 *   progress    the driver hears when it is nearly done, and when it is done
 *               — with a reminder to free the spot;
 *   scheduled   "start at 23:00" runs the start at that minute, through the
 *               same path as a tap in the app (the night price applies).
 */

const EVERY_MS = Number(process.env.SESSION_WATCH_MS) || 5000;
const SYSTEM = { portal: 'system', name: 'Voli', id: 'system' };
const schedules = () => (db.data.scheduledStarts ??= []);
// Tests shorten the minimum lead time; in the app a start is at least a minute ahead.
const MIN_LEAD_MS = process.env.SCHEDULE_MIN_LEAD_MS === undefined ? 60_000 : Number(process.env.SCHEDULE_MIN_LEAD_MS);
const sum = n => `${Math.round(n).toLocaleString('ru-RU')} сум`;

const GOAL_TEXT = {
  percent: g => `до ${g.value}%`,
  km: g => `на ${g.value} км`,
  sum: g => `на ${sum(g.value)}`,
};
export const goalText = g => (g ? GOAL_TEXT[g.kind]?.(g) ?? '' : '');

/** Energy and cost right now: the meter for real chargers, the demo curve otherwise. */
function current(session) {
  if (['ocpp', 'ocpi', 'network'].includes(session.source)) return { energy: session.energy ?? 0, cost: session.cost ?? 0 };
  const minutes = Math.max(0, (Date.now() - Date.parse(session.start)) / 60000);
  const energy = demoEnergy(session.power ?? 50, minutes);
  return { energy, cost: Math.round(energy * (session.price ?? 1800)) };
}

/** 0…1 of the way to the goal. */
function progress(session, now) {
  const g = session.goal;
  if (g.stopCost) return now.cost / g.stopCost;
  if (g.stopKwh) return now.energy / g.stopKwh;
  return 0;
}

/** Minutes left at the current power, for the "nearly done" notice. */
function minutesLeft(session, now) {
  const g = session.goal;
  const kwhLeft = g.stopKwh ? g.stopKwh - now.energy : (g.stopCost - now.cost) / (session.price || 1800);
  return Math.max(1, Math.round((kwhLeft / Math.max(3, (session.power ?? 50) * 0.85)) * 60));
}

async function watchGoals() {
  for (const session of db.data.sessions.filter(s => s.status === 'active' && s.goal && !s.goalReached)) {
    const now = current(session);
    const p = progress(session, now);
    if (p >= 1) {
      session.goalReached = true;
      session.stopReason = 'goal';
      db.save();
      const r = await stopCharge(session, SYSTEM);
      if (r.status >= 400) {
        // The charger did not take the stop: let the driver know and try again next round.
        session.goalReached = false;
        session.stopReason = null;
        continue;
      }
      emit({
        type: 'session.goal',
        portal: 'system',
        actor: 'Voli',
        message: `Зарядка ${goalText(session.goal)} завершена · ${session.stationName}. Освободите место для следующего водителя`,
        entity: session.id,
        payload: { goal: session.goal },
      });
    } else if (p >= 0.85 && !session.goalNearNotified) {
      session.goalNearNotified = true;
      db.save();
      emit({
        type: 'session.progress',
        portal: 'system',
        actor: 'Voli',
        message: `Почти готово: осталось около ${minutesLeft(session, now)} мин до цели ${goalText(session.goal)} · ${session.stationName}`,
        entity: session.id,
        payload: { progress: Math.round(p * 100) },
      });
    }
  }
}

async function runSchedules() {
  const due = schedules().filter(x => x.status === 'pending' && Date.parse(x.at) <= Date.now());
  for (const x of due) {
    x.status = 'starting';
    db.save();
    const account = db.byId('accounts', x.userId);
    const station = db.byId('stations', x.stationId);
    // The connector the driver chose, or another free one of the same type at the station.
    const connector =
      station?.connectors.find(c => c.id === x.connectorId && c.status === 'available') ??
      station?.connectors.find(c => c.status === 'available' && c.type === station.connectors.find(k => k.id === x.connectorId)?.type);
    const r = account && connector ? await startCharge(account, { stationId: x.stationId, connectorId: connector.id, payer: x.payer, goal: x.goal }) : { status: 409, body: { error: 'Все подходящие разъёмы заняты' } };
    x.status = r.status < 300 ? 'started' : 'failed';
    x.result = r.status < 300 ? null : r.body.error;
    x.ranAt = new Date().toISOString();
    db.save();
    emit({
      type: r.status < 300 ? 'schedule.started' : 'schedule.failed',
      portal: 'system',
      actor: 'Voli',
      message: r.status < 300 ? `Отложенная зарядка началась · ${x.stationName}` : `Отложенная зарядка не началась · ${x.stationName}: ${x.result}`,
      entity: x.id,
      payload: { userId: x.userId, stationId: x.stationId },
    });
  }
}

/**
 * The lock-screen notice of a running charge: at the start, then at every
 * 5% (or 3 minutes when the percentage is unknown), always quietly.
 */
async function watchLive() {
  if (!feature('liveNotice')) return;
  const stepPct = setting('live.stepPct');
  for (const session of db.data.sessions.filter(s => s.status === 'active' && s.userId && !s.simulated)) {
    const account = db.byId('accounts', session.userId);
    if (!account) continue;
    const now = current(session);
    const pack = account.car?.battery || 75;
    const from = session.goal?.fromPct ?? session.socStart ?? null;
    const pct = session.socEnd ?? (from !== null ? Math.min(100, Math.round(from + (now.energy / pack) * 100)) : null);
    const step = pct !== null ? Math.floor(pct / stepPct) : Math.floor((Date.now() - Date.parse(session.start)) / 180_000);
    if (session.liveStep === step) continue;
    const first = session.liveStep === undefined;
    session.liveStep = step;
    db.save();
    const left = session.goal && (session.goal.stopKwh || session.goal.stopCost) ? minutesLeft(session, now) : null;
    const title = pct !== null ? `⚡ ${pct}%${left ? ` · ещё ~${left} мин` : ''}` : `⚡ Идёт зарядка${left ? ` · ещё ~${left} мин` : ''}`;
    const body = `${session.stationName} · ${now.energy.toFixed(1)} кВт·ч · ${sum(now.cost)}`;
    await pushLiveCharge(session, { title, body, first }).catch(() => 0);
  }
  // A charge that ended, however it ended, leaves a closing notice in place of the live one —
  // never a stale "62%" stuck on the lock screen.
  for (const session of db.data.sessions.filter(s => s.status !== 'active' && s.liveStep !== undefined && !s.liveClosed)) {
    session.liveClosed = true;
    db.save();
    const done = session.status === 'completed';
    await pushLiveCharge(session, {
      title: done ? '✅ Зарядка завершена' : 'Зарядка остановлена',
      body: done ? `${session.stationName} · ${(session.energy ?? 0).toFixed(1)} кВт·ч · ${sum(session.cost ?? 0)}` : session.stationName,
      first: false,
      final: true,
    }).catch(() => 0);
  }
}

let busy = false;
export function startSessionWatch() {
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await watchGoals();
      await runSchedules();
      await watchLive();
    } catch (e) {
      console.error('[watch]', e);
    } finally {
      busy = false;
    }
  }, EVERY_MS);
  timer.unref?.();
}

// ---------------------------------------------------------------------------
// Scheduled starts
// ---------------------------------------------------------------------------

api.post('/sessions/schedule', requireAuth('driver'), (req, res) => {
  const b = req.body ?? {};
  const at = Date.parse(b.at);
  if (!Number.isFinite(at) || at < Date.now() + MIN_LEAD_MS || at > Date.now() + 24 * 3600_000) {
    return res.status(400).json({ error: 'Время старта — от минуты до суток вперёд' });
  }
  const station = db.byId('stations', b.stationId);
  const connector = station?.connectors.find(c => c.id === b.connectorId);
  if (!connector) return res.status(404).json({ error: 'Разъём не найден' });
  // A face check is fresh for minutes, not hours.
  if (b.payer === 'credit') return res.status(400).json({ error: 'Зарядку в долг нельзя отложить — она начинается после проверки лица' });
  const g = chargeGoal(req.account, b.goal);
  if (g.error) return res.status(400).json({ error: g.error });
  const mine = schedules().filter(x => x.userId === req.account.id && x.status === 'pending');
  if (mine.length >= 3) return res.status(429).json({ error: 'Не больше трёх отложенных зарядок' });
  const item = {
    id: `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    userId: req.account.id,
    stationId: station.id,
    stationName: station.name,
    connectorId: connector.id,
    connector: `${connector.type} · ${connector.power} кВт`,
    payer: typeof b.payer === 'string' ? b.payer : 'self',
    goal: b.goal ?? null,
    at: new Date(at).toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  schedules().push(item);
  db.save();
  res.status(201).json(item);
});

api.delete('/sessions/schedule/:id', requireAuth('driver'), (req, res) => {
  const item = schedules().find(x => x.id === req.params.id && x.userId === req.account.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  if (item.status !== 'pending') return res.status(409).json({ error: 'Уже не отменить' });
  item.status = 'cancelled';
  db.save();
  res.json(item);
});

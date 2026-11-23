import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { alertTeam } from './alerts.js';

/**
 * Voli buys a network's charging ahead (since 17.11.2026): every period —
 * a month, or a week once demand grows — Voli prepays a volume of kWh, at
 * least 5 000, at the network's price, whether drivers use it or not. The
 * network's cabinet shows the volume, what Voli drivers have used of it (live,
 * from the station's own meter readings), what is left, and whether Voli has
 * paid. The admin sets the terms per network and marks each prepayment.
 *
 * A change of terms (volume, price, month or week, carry-over) applies from
 * the next period: the current one keeps what it was bought with.
 */

export const MIN_KWH = 5000;
const DAY = 86400_000;
const TZ = 5 * 3600_000; // Asia/Tashkent
const PAY_DAYS = 5; // 3 banking days after the start, with a weekend in between
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[\p{L}\d\s№#/.,-]{1,60}$/u;

const periods = () => (db.data.volumePeriods ??= []);
const startOfDay = date => Date.parse(`${date}T00:00:00Z`) - TZ;
const localDate = ms => new Date(ms + TZ).toISOString().slice(0, 10);

/** The end of a period that starts at `from`: the same day next month, or seven days on. */
function endOf(from, kind) {
  if (kind === 'week') return from + 7 * DAY;
  const d = new Date(from + TZ);
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), Math.min(day, last)) - TZ;
}

/** kWh Voli drivers took at the network's stations in [from, to), the running charges included. */
function usedIn(operatorId, from, to) {
  let kwh = 0;
  let sessions = 0;
  for (const s of db.data.sessions) {
    if (s.operatorId !== operatorId || (s.status !== 'completed' && s.status !== 'active')) continue;
    const t = Date.parse(s.start);
    if (t < from || t >= to) continue;
    kwh += s.energy || 0;
    sessions++;
  }
  return { used: Math.round(kwh * 10) / 10, sessions };
}

/** Makes the periods up to now from the network's terms; true when one was added. */
function ensurePeriods(op, now = Date.now()) {
  const deal = op.volume;
  if (!deal?.start) return false;
  const own = periods().filter(p => p.operatorId === op.id).sort((a, b) => a.from - b.from);
  let last = own.at(-1);
  let added = false;
  if (!last) {
    if (!deal.on) return false;
    const from = startOfDay(deal.start);
    if (from > now) return false;
    last = { id: `VOL-${op.id}-1`, operatorId: op.id, n: 1, kind: deal.period, from, to: endOf(from, deal.period), kwh: deal.kwh, price: deal.price, carriedIn: 0 };
    periods().push(last);
    added = true;
  }
  // Catch up period by period; a long gap (server off) still produces each one.
  for (let guard = 0; guard < 400 && last.to <= now && deal.on; guard++) {
    const { used } = usedIn(op.id, last.from, last.to);
    const left = Math.max(0, last.kwh + last.carriedIn - used);
    const next = {
      id: `VOL-${op.id}-${last.n + 1}`,
      operatorId: op.id,
      n: last.n + 1,
      kind: deal.period,
      from: last.to,
      to: endOf(last.to, deal.period),
      kwh: deal.kwh,
      price: deal.price,
      carriedIn: deal.carry ? Math.round(left * 10) / 10 : 0,
    };
    periods().push(next);
    last = next;
    added = true;
  }
  return added;
}

function ensureAll(now = Date.now()) {
  let added = false;
  for (const op of db.data.operators) if (op.volume) added = ensurePeriods(op, now) || added;
  if (added) db.save();
}

/** One period as the cabinet and the admin read it. */
function view(p, now = Date.now()) {
  const { used, sessions } = usedIn(p.operatorId, p.from, p.to);
  const total = p.kwh + p.carriedIn;
  const due = p.from + PAY_DAYS * DAY;
  const status = p.paidAt ? 'paid' : now >= due ? 'overdue' : 'due';
  return {
    id: p.id,
    n: p.n,
    kind: p.kind,
    from: localDate(p.from),
    to: localDate(p.to - 1),
    current: now >= p.from && now < p.to,
    kwh: p.kwh,
    carriedIn: p.carriedIn,
    total,
    used,
    sessions,
    left: Math.max(0, Math.round((total - used) * 10) / 10),
    over: Math.max(0, Math.round((used - total) * 10) / 10),
    price: p.price,
    amount: Math.round(p.kwh * p.price),
    overAmount: Math.round(Math.max(0, used - total) * p.price),
    payBy: localDate(due),
    status,
    ...(p.paidAt ? { paidAt: p.paidAt, paidRef: p.paidRef, paidAmount: p.paidAmount } : {}),
  };
}

export function volumeFor(operatorId, now = Date.now()) {
  const op = db.byId('operators', operatorId);
  if (!op?.volume) return null;
  const list = periods().filter(p => p.operatorId === operatorId && p.from <= now).sort((a, b) => b.from - a.from).slice(0, 24);
  return {
    operatorId,
    operator: op.name,
    deal: { ...op.volume },
    periods: list.map(p => view(p, now)),
  };
}

/** Every network's unpaid prepayments past their date, for the daily reminder. */
export function overdueVolume(now = Date.now()) {
  ensureAll(now);
  return periods().filter(p => !p.paidAt && p.from <= now && now >= p.from + PAY_DAYS * DAY).map(p => ({ ...view(p, now), operator: db.byId('operators', p.operatorId)?.name ?? p.operatorId }));
}

export function remindVolumeOverdue(now = Date.now()) {
  const told = (db.data.volumeReminded ??= {});
  const today = localDate(now);
  let sent = 0;
  for (const p of overdueVolume(now)) {
    if (told[p.id] === today) continue;
    told[p.id] = today;
    sent++;
    void alertTeam(`volume:${p.id}:${today}`, 'Не оплачен выкуп объёма у сети', [
      ['Сеть', p.operator],
      ['Период', `${p.from} — ${p.to}`],
      ['К оплате', `${p.amount.toLocaleString('ru-RU')} сум`],
      ['Срок был', p.payBy],
    ]);
  }
  if (sent) db.save();
  return sent;
}

/** The network's own cabinet. */
api.get('/operator/volume', requireAuth('operator'), (req, res) => {
  ensureAll();
  res.json(volumeFor(req.account.orgId) ?? { deal: null, periods: [] });
});

/** The admin: every network, with its terms and periods if it has any. */
api.get('/admin/volume', requireAuth('admin'), (_req, res) => {
  ensureAll();
  res.json(db.data.operators.filter(o => o.status === 'active' || o.volume).map(o => volumeFor(o.id) ?? { operatorId: o.id, operator: o.name, deal: null, periods: [] }));
});

/** Sets or changes a network's terms. The current period keeps its own; the change applies from the next. */
api.post('/admin/operators/:id/volume', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Сеть не найдена' });
  const b = req.body ?? {};
  const kwh = Math.round(Number(b.kwh));
  const price = Math.round(Number(b.price));
  if (!Number.isFinite(kwh) || kwh < MIN_KWH || kwh > 10_000_000) return res.status(400).json({ error: `Объём — не меньше ${MIN_KWH.toLocaleString('ru-RU')} кВт·ч` });
  if (!Number.isFinite(price) || price < 1 || price > 100_000) return res.status(400).json({ error: 'Укажите цену за 1 кВт·ч' });
  if (b.period !== 'month' && b.period !== 'week') return res.status(400).json({ error: 'Период — месяц или неделя' });
  const started = periods().some(p => p.operatorId === op.id);
  const start = started ? op.volume.start : String(b.start ?? '');
  if (!DATE.test(start) || Number.isNaN(Date.parse(start))) return res.status(400).json({ error: 'Укажите дату начала первого периода' });
  op.volume = { on: b.on !== false, period: b.period, kwh, price, carry: !!b.carry, start };
  ensurePeriods(op);
  db.save();
  emit({
    type: 'operator.volume.update',
    portal: 'admin',
    actor: req.account.name ?? req.account.login,
    message: `${op.name}: выкуп ${kwh.toLocaleString('ru-RU')} кВт·ч за ${b.period === 'week' ? 'неделю' : 'месяц'} по ${price.toLocaleString('ru-RU')} сум`,
    entity: op.id,
    payload: { operatorId: op.id },
  });
  res.json(volumeFor(op.id));
});

/** The admin marks Voli's prepayment for a period, after the bank transfer. */
api.post('/admin/volume/:id/paid', requireAuth('admin'), (req, res) => {
  const p = periods().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Период не найден' });
  if (p.paidAt) return res.status(409).json({ error: 'Оплата уже отмечена' });
  const b = req.body ?? {};
  const amount = Math.round(Number(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Проверьте сумму перевода' });
  const paidAt = String(b.paidAt ?? '');
  if (!DATE.test(paidAt) || Date.parse(paidAt) > Date.now() + DAY) return res.status(400).json({ error: 'Укажите дату перевода' });
  const ref = String(b.ref ?? '').trim();
  if (!REF.test(ref)) return res.status(400).json({ error: 'Укажите номер платёжного поручения' });
  Object.assign(p, { paidAt, paidRef: ref, paidAmount: amount, paidBy: req.account.name ?? req.account.login });
  db.save();
  const op = db.byId('operators', p.operatorId);
  emit({
    type: 'operator.volume.paid',
    portal: 'admin',
    actor: p.paidBy,
    message: `${op?.name ?? p.operatorId}: оплачен выкуп за ${localDate(p.from)} — ${localDate(p.to - 1)}, ${amount.toLocaleString('ru-RU')} сум, п/п ${ref}`,
    entity: p.id,
    payload: { operatorId: p.operatorId },
  });
  res.json(view(p));
});

/** A wrong mark can be taken back. */
api.delete('/admin/volume/:id/paid', requireAuth('admin'), (req, res) => {
  const p = periods().find(x => x.id === req.params.id);
  if (!p?.paidAt) return res.status(404).json({ error: 'Отметки нет' });
  delete p.paidAt; delete p.paidRef; delete p.paidAmount; delete p.paidBy;
  db.save();
  emit({ type: 'operator.volume.undo', portal: 'admin', actor: req.account.name ?? req.account.login, message: `Отметка оплаты ${p.id} снята`, entity: p.id, payload: { operatorId: p.operatorId } });
  res.json(view(p));
});

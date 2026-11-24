import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { alertTeam } from './alerts.js';

/**
 * Voli buys a network's charging ahead (contract edition of 24.11.2026): at the
 * start Voli prepays 5 000 kWh for the first period — a month, or a week once
 * demand grows — at the network's price, whether drivers use it or not. The
 * volume of every later period is agreed separately (Voli's request, confirmed
 * by the network); the admin enters it once agreed. A period with no agreed
 * volume has no prepayment: what drivers charged there is paid by the fact.
 * The rest of a period moves on to the next one only when both sides agree —
 * the admin marks that per period.
 *
 * The network's cabinet shows the volume, what Voli drivers have used of it
 * (live, from the station's own meter readings), what is left, and whether
 * Voli has paid. A change of price or month/week applies from the next period.
 */

export const MIN_KWH = 5000;
const DAY = 86400_000;
const TZ = 5 * 3600_000; // Asia/Tashkent
const PAY_DAYS = 5; // 3 banking days after the start, with a weekend in between
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[\p{L}\d\s№#/.,-]{1,60}$/u;

const periods = () => (db.data.volumePeriods ??= []);
const NOTE = /^[^<>]{3,300}$/;

/** The moment after `from` when `days` working days (Mon–Fri, Tashkent) have passed. */
function workingDaysAfter(from, days) {
  let t = from;
  let left = days;
  while (left > 0) {
    t += DAY;
    const wd = new Date(t + TZ).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return t;
}
const CONFIRM_DAYS = 3;

/**
 * The network's word on a marked payment: it confirms the money arrived or
 * says it did not; silent for 3 working days, the payment counts as accepted.
 */
function receiptOf(p, now) {
  if (!p.paidAt) return null;
  if (p.receipt?.status === 'confirmed') return { status: 'confirmed', at: p.receipt.at, by: p.receipt.by };
  if (p.receipt?.status === 'disputed') return { status: 'disputed', at: p.receipt.at, by: p.receipt.by, note: p.receipt.note };
  const by = workingDaysAfter(Date.parse(p.paidMarkedAt ?? p.paidAt), CONFIRM_DAYS);
  return now >= by ? { status: 'auto', at: new Date(by).toISOString() } : { status: 'waiting', by: localDate(by) };
}
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

/** What is left of a period's volume (with what was carried into it), in kWh. */
function leftOf(p) {
  const { used } = usedIn(p.operatorId, p.from, p.to);
  return Math.round(Math.max(0, p.kwh + p.carriedIn - used) * 10) / 10;
}

/** After a change in `p` (its volume or the carry mark), the following periods take what moves on. */
function recarry(p) {
  const own = periods().filter(x => x.operatorId === p.operatorId).sort((a, b) => a.from - b.from);
  for (let i = own.indexOf(p); i >= 0 && i < own.length - 1; i++) own[i + 1].carriedIn = own[i].carryOut ? leftOf(own[i]) : 0;
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
    last = { id: `VOL-${op.id}-1`, operatorId: op.id, n: 1, kind: deal.period, from, to: endOf(from, deal.period), kwh: MIN_KWH, price: deal.price, carriedIn: 0 };
    periods().push(last);
    added = true;
  }
  // Catch up period by period; a long gap (server off) still produces each one.
  for (let guard = 0; guard < 400 && last.to <= now && deal.on; guard++) {
    const next = {
      id: `VOL-${op.id}-${last.n + 1}`,
      operatorId: op.id,
      n: last.n + 1,
      kind: deal.period,
      from: last.to,
      to: endOf(last.to, deal.period),
      kwh: deal.next?.kwh ?? 0,
      price: deal.price,
      carriedIn: last.carryOut ? leftOf(last) : 0,
    };
    delete deal.next;
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

/** The prepayment's date: 3 banking days from the start, or from the agreement when the volume was agreed late. */
const dueOf = p => Math.max(p.from, p.agreedAt ?? 0) + PAY_DAYS * DAY;

/** One period as the cabinet and the admin read it. */
function view(p, now = Date.now()) {
  const { used, sessions } = usedIn(p.operatorId, p.from, p.to);
  const total = p.kwh + p.carriedIn;
  const due = dueOf(p);
  // No agreed volume: nothing to prepay; what drivers charged is paid by the fact.
  const status = p.paidAt ? 'paid' : !p.kwh ? 'actual' : now >= due ? 'overdue' : 'due';
  return {
    id: p.id,
    n: p.n,
    start: p.n === 1,
    carryOut: !!p.carryOut,
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
    ...(p.paidAt ? { paidAt: p.paidAt, paidRef: p.paidRef, paidAmount: p.paidAmount, receipt: receiptOf(p, now) } : {}),
  };
}

export function volumeFor(operatorId, now = Date.now()) {
  const op = db.byId('operators', operatorId);
  if (!op?.volume) return null;
  const list = periods().filter(p => p.operatorId === operatorId && p.from <= now).sort((a, b) => b.from - a.from).slice(0, 24);
  return {
    operatorId,
    operator: op.name,
    deal: { ...op.volume, kwh: MIN_KWH, next: op.volume.next ?? null },
    periods: list.map(p => view(p, now)),
  };
}

/** Every network's unpaid prepayments past their date, for the daily reminder. */
export function overdueVolume(now = Date.now()) {
  ensureAll(now);
  return periods().filter(p => !p.paidAt && p.kwh > 0 && p.from <= now && now >= dueOf(p)).map(p => ({ ...view(p, now), operator: db.byId('operators', p.operatorId)?.name ?? p.operatorId }));
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

/**
 * Sets or changes a network's terms: price, month or week, the first period's
 * start. The first period is always the start volume of 5 000 kWh; the current
 * period keeps its price, the change applies from the next.
 */
api.post('/admin/operators/:id/volume', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op) return res.status(404).json({ error: 'Сеть не найдена' });
  const b = req.body ?? {};
  const price = Math.round(Number(b.price));
  if (!Number.isFinite(price) || price < 1 || price > 100_000) return res.status(400).json({ error: 'Укажите цену за 1 кВт·ч' });
  if (b.period !== 'month' && b.period !== 'week') return res.status(400).json({ error: 'Период — месяц или неделя' });
  const started = periods().some(p => p.operatorId === op.id);
  const start = started ? op.volume.start : String(b.start ?? '');
  if (!DATE.test(start) || Number.isNaN(Date.parse(start))) return res.status(400).json({ error: 'Укажите дату начала первого периода' });
  op.volume = { on: b.on !== false, period: b.period, price, start, ...(op.volume?.next ? { next: op.volume.next } : {}) };
  ensurePeriods(op);
  db.save();
  emit({
    type: 'operator.volume.update',
    portal: 'admin',
    actor: req.account.name ?? req.account.login,
    message: `${op.name}: выкуп по ${price.toLocaleString('ru-RU')} сум за 1 кВт·ч, период — ${b.period === 'week' ? 'неделя' : 'месяц'}`,
    entity: op.id,
    payload: { operatorId: op.id },
  });
  res.json(volumeFor(op.id));
});

/** A volume agreed with the network: a whole number of kWh, or 0 to take it back. */
function agreedKwh(v) {
  const kwh = Math.round(Number(v ?? 0));
  return Number.isFinite(kwh) && kwh >= 0 && kwh <= 10_000_000 ? kwh : null;
}

/** The volume agreed for the period that starts next (by Voli's request, confirmed by the network). */
api.post('/admin/operators/:id/volume/next', requireAuth('admin'), (req, res) => {
  const op = db.byId('operators', req.params.id);
  if (!op?.volume) return res.status(404).json({ error: 'Выкуп у этой сети не настроен' });
  const kwh = agreedKwh(req.body?.kwh);
  if (kwh === null) return res.status(400).json({ error: 'Проверьте объём, кВт·ч' });
  ensurePeriods(op);
  if (kwh) op.volume.next = { kwh };
  else delete op.volume.next;
  db.save();
  emit({
    type: 'operator.volume.update',
    portal: 'admin',
    actor: req.account.name ?? req.account.login,
    message: kwh ? `${op.name}: на следующий период согласовано ${kwh.toLocaleString('ru-RU')} кВт·ч` : `${op.name}: объём на следующий период снят`,
    entity: op.id,
    payload: { operatorId: op.id },
  });
  res.json(volumeFor(op.id));
});

/** A volume agreed late, for a period that has already started (not the start one, not paid yet). */
api.post('/admin/volume/:id/kwh', requireAuth('admin'), (req, res) => {
  const p = periods().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Период не найден' });
  if (p.n === 1) return res.status(409).json({ error: `Первый период — стартовый объём ${MIN_KWH.toLocaleString('ru-RU')} кВт·ч по договору` });
  if (p.paidAt) return res.status(409).json({ error: 'Период уже оплачен — сначала снимите отметку оплаты' });
  const kwh = agreedKwh(req.body?.kwh);
  if (kwh === null) return res.status(400).json({ error: 'Проверьте объём, кВт·ч' });
  p.kwh = kwh;
  p.agreedAt = Date.now();
  recarry(p);
  db.save();
  const op = db.byId('operators', p.operatorId);
  emit({
    type: 'operator.volume.update',
    portal: 'admin',
    actor: req.account.name ?? req.account.login,
    message: `${op?.name ?? p.operatorId}: объём за ${localDate(p.from)} — ${localDate(p.to - 1)} — ${kwh.toLocaleString('ru-RU')} кВт·ч`,
    entity: p.id,
    payload: { operatorId: p.operatorId },
  });
  res.json(view(p));
});

/** Both sides agreed that the rest of this period moves on to the next one (or took that back). */
api.post('/admin/volume/:id/carry', requireAuth('admin'), (req, res) => {
  const p = periods().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Период не найден' });
  const own = periods().filter(x => x.operatorId === p.operatorId).sort((a, b) => a.from - b.from);
  if (own[own.indexOf(p) + 1]?.paidAt) return res.status(409).json({ error: 'Следующий период уже оплачен — перенос не поменять' });
  const on = req.body?.on === true;
  if (on) p.carryOut = true;
  else delete p.carryOut;
  recarry(p);
  db.save();
  const op = db.byId('operators', p.operatorId);
  emit({
    type: 'operator.volume.update',
    portal: 'admin',
    actor: req.account.name ?? req.account.login,
    message: `${op?.name ?? p.operatorId}: остаток за ${localDate(p.from)} — ${localDate(p.to - 1)} ${on ? 'переносится на следующий период' : 'не переносится'}`,
    entity: p.id,
    payload: { operatorId: p.operatorId },
  });
  res.json(view(p));
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
  Object.assign(p, { paidAt, paidRef: ref, paidAmount: amount, paidBy: req.account.name ?? req.account.login, paidMarkedAt: new Date().toISOString() });
  delete p.receipt;
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
  delete p.paidAt; delete p.paidRef; delete p.paidAmount; delete p.paidBy; delete p.paidMarkedAt; delete p.receipt;
  db.save();
  emit({ type: 'operator.volume.undo', portal: 'admin', actor: req.account.name ?? req.account.login, message: `Отметка оплаты ${p.id} снята`, entity: p.id, payload: { operatorId: p.operatorId } });
  res.json(view(p));
});

/**
 * The network answers for a payment Voli marked: the money arrived, or it did
 * not (with what is wrong). "Not received" alerts the team; a later "received"
 * settles it. A confirmed payment cannot be disputed afterwards.
 */
api.post('/operator/volume/:id/receipt', requireAuth('operator'), (req, res) => {
  const p = periods().find(x => x.id === req.params.id && x.operatorId === req.account.orgId);
  if (!p) return res.status(404).json({ error: 'Период не найден' });
  if (!p.paidAt) return res.status(400).json({ error: 'Voli ещё не отметила оплату этого периода' });
  const ok = req.body?.ok === true;
  const now = Date.now();
  const current = receiptOf(p, now);
  if (current.status === 'confirmed') return res.status(409).json({ error: 'Получение уже подтверждено' });
  if (!ok && current.status === 'auto') return res.status(409).json({ error: 'Срок подтверждения прошёл — оплата принята. Если деньги не пришли, напишите Voli' });
  const by = req.account.name ?? req.account.login;
  const op = db.byId('operators', p.operatorId);
  const range = `${localDate(p.from)} — ${localDate(p.to - 1)}`;
  if (ok) {
    p.receipt = { status: 'confirmed', at: new Date(now).toISOString(), by };
  } else {
    const note = String(req.body?.note ?? '').trim();
    if (!NOTE.test(note)) return res.status(400).json({ error: 'Напишите, что не так: например, деньги не пришли или пришло меньше' });
    p.receipt = { status: 'disputed', at: new Date(now).toISOString(), by, note };
    void alertTeam(`volume-dispute:${p.id}:${now}`, 'Сеть не получила оплату выкупа', [
      ['Сеть', op?.name ?? p.operatorId],
      ['Период', range],
      ['Отмечено', `${(p.paidAmount ?? 0).toLocaleString('ru-RU')} сум, п/п ${p.paidRef}`],
      ['Сеть пишет', note],
    ]);
  }
  db.save();
  emit({
    type: 'operator.volume.receipt',
    portal: 'operator',
    actor: by,
    message: ok ? `${op?.name ?? p.operatorId}: получение оплаты за ${range} подтверждено` : `${op?.name ?? p.operatorId}: оплата за ${range} не получена — ${p.receipt.note}`,
    entity: p.id,
    payload: { operatorId: p.operatorId },
  });
  res.json(view(p, now));
});

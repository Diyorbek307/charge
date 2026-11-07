// Partner webhooks
// (Moved out of server/api.js; registered by server.js after the core routes.)
import crypto from 'node:crypto';
import { db } from '../db.js';
import { validateEndpoint, kick as kickWebhooks } from '../webhooks.js';
import { api, demoStationHidden, emit, requireAuth } from '../api.js';

// ---------------------------------------------------------------------------
// Partner webhooks
// ---------------------------------------------------------------------------

const WEBHOOK_EVENTS = [
  'session.start',
  'session.stop',
  'evse.status',
  'alert.new',
  'alert.ack',
  'wallet.topup',
  'operator.status',
];

api.get('/webhooks/events', (_req, res) => res.json(WEBHOOK_EVENTS));

// ---------------------------------------------------------------------------
// Partner data API — read-only, for navigators, fleet software and roaming.
// Stable field names in English; prices in UZS per kWh before the time-of-day
// multiplier (see /tariffs/forecast).
// ---------------------------------------------------------------------------

function partnerStation(st) {
  const statuses = st.connectors.map(c => c.status);
  const status = statuses.includes('available') ? 'available' : statuses.every(x => x === 'unavailable') ? 'unavailable' : 'occupied';
  const operator = db.byId('operators', st.operatorId);
  return {
    id: st.id,
    name: st.name,
    operator: { id: st.operatorId, name: st.operator },
    address: st.address,
    city: st.city,
    location: { lat: st.geoLat, lng: st.geoLng },
    hours: st.hours,
    amenities: st.amenities ?? [],
    rating: st.rating,
    reviews: st.reviews ?? 0,
    status,
    // A suspended operator's stations take no new charges.
    accepting: operator?.status !== 'suspended' && status !== 'unavailable',
    connectors: st.connectors.map(c => ({ id: c.id, type: c.type, powerKw: c.power, priceUzsPerKwh: c.price, status: c.status })),
  };
}

api.get('/partner/stations', requireAuth('api', 'admin'), (req, res) => {
  const { city, status, type } = req.query;
  const minPower = Number(req.query.minPower) || 0;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  let list = db.data.stations.filter(st => req.account.portal === 'admin' || !demoStationHidden(st)).map(partnerStation);
  if (city) list = list.filter(s => s.city.toLowerCase() === String(city).toLowerCase());
  if (status) list = list.filter(s => s.status === status);
  if (type) list = list.filter(s => s.connectors.some(c => c.type.toLowerCase() === String(type).toLowerCase()));
  if (minPower) list = list.filter(s => s.connectors.some(c => c.powerKw >= minPower));
  res.json({ total: list.length, limit, offset, items: list.slice(offset, offset + limit), updated: new Date().toISOString() });
});

api.get('/partner/stations/:id', requireAuth('api', 'admin'), (req, res) => {
  const st = db.byId('stations', req.params.id);
  if (!st) return res.status(404).json({ error: 'Станция не найдена' });
  res.json(partnerStation(st));
});

/** A partner's own webhook, or any for the platform. */
const ownHook = (req, hook) => !!hook && (req.account.portal === 'admin' || hook.owner === req.account.id);
/** A delivery is the partner's whose webhook made it, even once that webhook is gone. */
const ownDelivery = (req, d) => req.account.portal === 'admin' || (d.owner ?? db.byId('webhooks', d.webhookId)?.owner) === req.account.id;

api.get('/webhooks', requireAuth('api', 'admin'), (req, res) => {
  res.json(
    (db.data.webhooks ?? []).filter(w => ownHook(req, w)).map(w => ({
      ...w,
      // Show only a prefix; the full secret is returned once, at creation.
      secret: `${w.secret.slice(0, 11)}…${w.secret.slice(-4)}`,
    })),
  );
});

api.post('/webhooks', requireAuth('api', 'admin'), (req, res) => {
  const { url, events } = req.body ?? {};
  const checked = validateEndpoint(url);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const parsed = checked.url;
  if ((db.data.webhooks ?? []).filter(w => w.owner === req.account.id).length >= 10) {
    return res.status(400).json({ error: 'Не больше 10 endpoint’ов на аккаунт' });
  }
  const chosen = Array.isArray(events) ? events.filter(e => WEBHOOK_EVENTS.includes(e)) : [];
  if (chosen.length === 0) {
    return res.status(400).json({ error: 'Выберите хотя бы одно событие' });
  }

  const hook = {
    id: db.nextId('webhook', 'wh-'),
    url: parsed.toString(),
    events: chosen,
    secret: 'whsec_' + crypto.randomBytes(16).toString('hex'),
    active: true,
    created: new Date().toISOString(),
    owner: req.account.id,
  };
  db.insert('webhooks', hook);

  emit({
    type: 'webhook.created',
    portal: req.account.portal,
    actor: req.account.name,
    message: `Webhook зарегистрирован · ${chosen.length} событий`,
    entity: hook.id,
  });

  // The only time the full secret is revealed.
  res.json({ webhook: hook });
});

api.post('/webhooks/:id/toggle', requireAuth('api', 'admin'), (req, res) => {
  const hook = db.byId('webhooks', req.params.id);
  if (!ownHook(req, hook)) return res.status(404).json({ error: 'Webhook не найден' });
  hook.active = !hook.active;
  db.save();
  res.json({ webhook: { ...hook, secret: `${hook.secret.slice(0, 11)}…${hook.secret.slice(-4)}` } });
});

api.delete('/webhooks/:id', requireAuth('api', 'admin'), (req, res) => {
  const i = (db.data.webhooks ?? []).findIndex(w => w.id === req.params.id && ownHook(req, w));
  if (i < 0) return res.status(404).json({ error: 'Webhook не найден' });
  db.data.webhooks.splice(i, 1);
  db.save();
  res.json({ ok: true });
});

const lastTestAt = new Map();

api.post('/webhooks/:id/test', requireAuth('api', 'admin'), (req, res) => {
  const hook = db.byId('webhooks', req.params.id);
  if (!ownHook(req, hook)) return res.status(404).json({ error: 'Webhook не найден' });
  // Test sends hit a real server now; do not let the button become a flood.
  if (Date.now() - (lastTestAt.get(hook.id) ?? 0) < 5000) {
    return res.status(429).json({ error: 'Не чаще одного теста в 5 секунд' });
  }
  lastTestAt.set(hook.id, Date.now());
  emit({
    type: hook.events[0],
    portal: req.account.portal,
    actor: req.account.name,
    message: 'Тестовое событие для проверки подписи',
    entity: hook.id,
    payload: { test: true },
  });
  res.json({ ok: true });
});

api.get('/webhooks/deliveries', requireAuth('api', 'admin'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  // Deliveries carry the events' payloads: a partner sees those of its own webhooks.
  res.json((db.data.deliveries ?? []).filter(d => ownDelivery(req, d)).slice(0, limit));
});

api.post('/webhooks/deliveries/:id/retry', requireAuth('api', 'admin'), (req, res) => {
  const delivery = (db.data.deliveries ?? []).find(d => d.id === req.params.id);
  if (!delivery || !ownDelivery(req, delivery)) return res.status(404).json({ error: 'Доставка не найдена' });
  if (!['failed', 'cancelled'].includes(delivery.status)) {
    return res.status(409).json({ error: 'Доставка ещё в очереди' });
  }
  const hook = db.byId('webhooks', delivery.webhookId);
  if (!hook?.active) return res.status(409).json({ error: 'Webhook удалён или отключён' });
  Object.assign(delivery, { status: 'pending', attempts: 0, nextAttemptAt: Date.now(), lastError: null });
  hook.consecutiveFailures = 0;
  db.save();
  kickWebhooks();
  res.json({ delivery });
});

import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { demoEnergy } from './history.js';
import { notifyTeam } from './mail.js';
import { aiAnswering, onDriverMessage } from './aiSupport.js';

/**
 * Small things that make the app easier every day:
 *
 *   station info   how to find the charger on site ("parking −1, by the
 *                  lift"), a photo, opening hours and amenities — set by the
 *                  station's network;
 *   share          a link to a running charge for family or colleagues:
 *                  station, progress and ready-by time, nothing personal;
 *   support chat   the driver writes (with a photo if needed), the AI
 *                  agents answer at once (aiSupport.js) and call a person
 *                  when needed; support answers from the admin portal,
 *                  both see it live.
 */

export const AMENITIES = ['Wi-Fi', 'Кафе', 'Туалет', 'Парковка', 'Крытая парковка', 'ТЦ', 'Магазин', 'Мойка'];
const HOURS = /^(24\/7|([01]\d|2[0-3]):[0-5]\d[–-]([01]\d|2[0-4]):[0-5]\d)$/;
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// ---------------------------------------------------------------------------
// Station info
// ---------------------------------------------------------------------------

api.patch('/stations/:id/info', requireAuth('operator', 'admin'), (req, res) => {
  const st = db.byId('stations', req.params.id);
  if (!st) return res.status(404).json({ error: 'Станция не найдена' });
  if (req.account.portal === 'operator' && st.operatorId !== req.account.orgId) return res.status(403).json({ error: 'Это не ваша станция' });
  const b = req.body ?? {};
  if (b.findHint !== undefined) st.findHint = text(b.findHint, 200) || null;
  if (b.hours !== undefined) {
    const h = text(b.hours, 20).replace('-', '–');
    if (!HOURS.test(h)) return res.status(400).json({ error: 'Часы — «24/7» или «08:00–22:00»' });
    st.hours = h;
  }
  if (b.amenities !== undefined) {
    if (!Array.isArray(b.amenities) || b.amenities.some(a => !AMENITIES.includes(a))) return res.status(400).json({ error: `Удобства — из списка: ${AMENITIES.join(', ')}` });
    st.amenities = [...new Set(b.amenities)];
  }
  // The photo lives apart from the station, so the map data every driver loads stays small.
  if (b.photo !== undefined) {
    const photos = (db.data.stationPhotos ??= {});
    if (b.photo === null) {
      delete photos[st.id];
      st.photoAt = null;
    } else if (typeof b.photo === 'string' && PHOTO.test(b.photo) && b.photo.length < 600_000) {
      photos[st.id] = b.photo;
      st.photoAt = new Date().toISOString();
    } else return res.status(400).json({ error: 'Фото — JPEG, PNG или WebP до 400 КБ' });
  }
  db.save();
  emit({ type: 'station.info', portal: req.account.portal, actor: req.account.name, message: `Обновлено описание станции ${st.name}`, entity: st.id, payload: { stationId: st.id } });
  res.json({ id: st.id, findHint: st.findHint ?? null, hours: st.hours, amenities: st.amenities, photoAt: st.photoAt ?? null });
});

// More photos of the site, after the cover: up to six, each stored apart like the cover.
const GALLERY_MAX = 6;
const galleryOf = st => (db.data.stationGallery ??= {})[st.id] ??= [];
const galleryMeta = st => galleryOf(st).map(({ id, at }) => ({ id, at }));

function ownStation(req, res) {
  const st = db.byId('stations', req.params.id);
  if (!st) return void res.status(404).json({ error: 'Станция не найдена' });
  if (req.account.portal === 'operator' && st.operatorId !== req.account.orgId) return void res.status(403).json({ error: 'Это не ваша станция' });
  return st;
}

api.post('/stations/:id/gallery', requireAuth('operator', 'admin'), (req, res) => {
  const st = ownStation(req, res);
  if (!st) return;
  const photo = req.body?.photo;
  if (typeof photo !== 'string' || !PHOTO.test(photo) || photo.length >= 600_000) return res.status(400).json({ error: 'Фото — JPEG, PNG или WebP до 400 КБ' });
  const list = galleryOf(st);
  if (list.length >= GALLERY_MAX) return res.status(400).json({ error: `Не больше ${GALLERY_MAX} фото — уберите одно` });
  list.push({ id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), data: photo });
  st.gallery = galleryMeta(st);
  db.save();
  emit({ type: 'station.info', portal: req.account.portal, actor: req.account.name, message: `Новое фото станции ${st.name}`, entity: st.id, payload: { stationId: st.id } });
  res.status(201).json({ gallery: st.gallery });
});

api.delete('/stations/:id/gallery/:photoId', requireAuth('operator', 'admin'), (req, res) => {
  const st = ownStation(req, res);
  if (!st) return;
  db.data.stationGallery[st.id] = galleryOf(st).filter(p => p.id !== req.params.photoId);
  st.gallery = galleryMeta(st);
  db.save();
  emit({ type: 'station.info', portal: req.account.portal, actor: req.account.name, message: `Убрано фото станции ${st.name}`, entity: st.id, payload: { stationId: st.id } });
  res.json({ gallery: st.gallery });
});

api.get('/stations/:id/gallery/:photoId', (req, res) => {
  const data = db.data.stationGallery?.[req.params.id]?.find(p => p.id === req.params.photoId)?.data;
  if (!data) return res.status(404).end();
  const [, type, b64] = data.match(/^data:(image\/\w+);base64,(.+)$/);
  res.set('Content-Type', type).set('Cache-Control', 'public, max-age=86400').send(Buffer.from(b64, 'base64'));
});

api.get('/stations/:id/photo', (req, res) => {
  const data = db.data.stationPhotos?.[req.params.id];
  if (!data) return res.status(404).end();
  const [, type, b64] = data.match(/^data:(image\/\w+);base64,(.+)$/);
  res.set('Content-Type', type).set('Cache-Control', 'public, max-age=86400').send(Buffer.from(b64, 'base64'));
});

/** Open right now, by the station's hours in Tashkent time. */
export function openNow(hours, at = Date.now()) {
  if (!hours || hours === '24/7') return true;
  const m = String(hours).match(/^(\d\d):(\d\d)[–-](\d\d):(\d\d)$/);
  if (!m) return true;
  const d = new Date(at + 5 * 3600_000);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  const from = +m[1] * 60 + +m[2];
  const to = +m[3] * 60 + +m[4];
  return from <= to ? now >= from && now < to : now >= from || now < to;
}

// ---------------------------------------------------------------------------
// Share a charge
// ---------------------------------------------------------------------------

api.post('/sessions/:id/share', requireAuth('driver'), (req, res) => {
  const s = db.byId('sessions', req.params.id);
  if (!s || s.userId !== req.account.id) return res.status(404).json({ error: 'Сессия не найдена' });
  s.shareToken ??= crypto.randomBytes(12).toString('base64url');
  db.save();
  res.json({ token: s.shareToken });
});

/** Public, by link: where the car charges and when it is ready. No name, no money. */
api.get('/share/:token', (req, res) => {
  const s = db.data.sessions.find(x => x.shareToken && x.shareToken === req.params.token);
  if (!s) return res.status(404).json({ error: 'Ссылка устарела' });
  const st = db.byId('stations', s.stationId);
  const minutes = Math.max(0, (Date.now() - Date.parse(s.start)) / 60000);
  const energy = s.status === 'active' && !['ocpp', 'ocpi', 'network'].includes(s.source) ? demoEnergy(s.power ?? 50, minutes) : s.energy;
  const goalKwh = s.goal?.stopKwh ?? (s.goal?.stopCost ? s.goal.stopCost / (s.price || 1800) : null);
  const kw = Math.max(3, (s.power ?? 50) * 0.85);
  const readyAt = s.status === 'active' && goalKwh ? new Date(Date.now() + Math.max(0, goalKwh - energy) / kw * 3600_000).toISOString() : null;
  res.json({
    status: s.status,
    station: s.stationName,
    address: st ? `${st.address}, ${st.city}` : null,
    lat: st?.geoLat ?? null,
    lng: st?.geoLng ?? null,
    connector: `${s.connector} · ${s.power} кВт`,
    start: s.start,
    end: s.end,
    energy: Math.round(energy * 10) / 10,
    progress: goalKwh ? Math.min(100, Math.round((energy / goalKwh) * 100)) : null,
    readyAt,
  });
});

// ---------------------------------------------------------------------------
// Support chat
// ---------------------------------------------------------------------------

const threads = () => (db.data.supportThreads ??= []);
const threadOf = userId => threads().find(t => t.userId === userId);
const publicThread = t => ({
  id: t.id, userId: t.userId, user: t.user, phone: t.phone, status: t.status, updatedAt: t.updatedAt, unreadAdmin: t.unreadAdmin, unreadUser: t.unreadUser,
  needsHuman: !!t.needsHuman, handoffReason: t.handoffReason ?? null, aiHoldUntil: t.aiHoldUntil ?? null,
  aiActive: aiAnswering() && !(t.aiHoldUntil && Date.parse(t.aiHoldUntil) > Date.now()),
  messages: t.messages.slice(-200),
});

function post(thread, from, b) {
  const body = text(b.text, 2000);
  const image = typeof b.image === 'string' && PHOTO.test(b.image) && b.image.length < 600_000 ? b.image : null;
  if (!body && !image) return { status: 400, error: 'Напишите сообщение или приложите фото' };
  const m = { id: crypto.randomBytes(6).toString('hex'), from, text: body, image, at: new Date().toISOString() };
  thread.messages.push(m);
  thread.updatedAt = m.at;
  if (from === 'user') {
    thread.unreadAdmin = (thread.unreadAdmin ?? 0) + 1;
    thread.status = 'open';
  } else thread.unreadUser = (thread.unreadUser ?? 0) + 1;
  db.save();
  return { message: m };
}

api.get('/support/messages', requireAuth('driver'), (req, res) => {
  const t = threadOf(req.account.id);
  if (t && t.unreadUser) {
    t.unreadUser = 0;
    db.save();
  }
  res.json(t ? publicThread(t) : { messages: [], status: 'new', aiActive: aiAnswering() });
});

api.post('/support/messages', requireAuth('driver'), (req, res) => {
  let t = threadOf(req.account.id);
  if (!t) {
    t = { id: `SUP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, userId: req.account.id, user: req.account.name, phone: req.account.phone ?? null, status: 'open', messages: [], unreadAdmin: 0, unreadUser: 0, updatedAt: new Date().toISOString() };
    threads().push(t);
  }
  const waiting = t.unreadAdmin ?? 0;
  const r = post(t, 'user', req.body ?? {});
  if (r.error) return res.status(r.status).json({ error: r.error });
  // One letter per conversation the team has not opened yet, not one per message.
  // With the AI agents on, the letter comes when an agent calls a person.
  if (!waiting && !aiAnswering()) {
    notifyTeam(`Поддержка: пишет ${req.account.name}`, [
      ['Обращение', t.id],
      ['Водитель', req.account.name],
      ['Телефон', req.account.login],
      ['Сообщение', r.message.text || '(фото)'],
    ], '/?portal=admin&page=support', 'support');
  }
  emit({ type: 'support.message', portal: 'driver', actor: req.account.name, message: `Поддержка: сообщение от ${req.account.name}`, entity: t.id, payload: { userId: req.account.id, from: 'user' } });
  onDriverMessage(t);
  res.status(201).json(publicThread(t));
});

api.get('/admin/support', requireAuth('admin'), (_req, res) => {
  res.json([...threads()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(publicThread));
});

api.post('/admin/support/:id', requireAuth('admin'), (req, res) => {
  const t = threads().find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Обращение не найдено' });
  // The agents step back into a chat, or out of it, at the admin's word.
  if (typeof req.body?.ai === 'boolean') {
    t.aiHoldUntil = req.body.ai ? null : new Date(Date.now() + 30 * 86_400_000).toISOString();
    db.save();
    return res.json(publicThread(t));
  }
  if (req.body?.close) {
    t.status = 'closed';
    t.needsHuman = false;
    db.save();
    return res.json(publicThread(t));
  }
  const r = post(t, 'support', req.body ?? {});
  if (r.error) return res.status(r.status).json({ error: r.error });
  t.unreadAdmin = 0;
  // A person is in the chat now: the agents stay out of it for a while.
  t.needsHuman = false;
  t.aiHoldUntil = new Date(Date.now() + 12 * 3600_000).toISOString();
  db.save();
  emit({ type: 'support.message', portal: 'admin', actor: 'Поддержка', message: `Ответ поддержки: ${r.message.text.slice(0, 80) || 'фото'}`, entity: t.id, payload: { userId: t.userId, from: 'support' } });
  res.json(publicThread(t));
});

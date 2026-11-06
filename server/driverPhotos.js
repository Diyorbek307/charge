import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';

/**
 * Photos of a station from the drivers who were there, as on PlugShare: what
 * the charger looks like, where the entrance is. A photo waits until the
 * admin approves it; then it joins the station's gallery, marked as a
 * driver's, and the driver is told. Rejected photos are deleted.
 */

const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_BYTES = 600_000;
const PER_DAY = 3;
const GALLERY_MAX = 10;
const DAY = 86400_000;

const photos = () => (db.data.driverPhotos ??= []);
const meta = p => ({ id: p.id, stationId: p.stationId, stationName: db.byId('stations', p.stationId)?.name ?? p.stationId, user: p.user, at: p.at, status: p.status, note: p.note ?? null });

api.post('/stations/:id/driver-photos', requireAuth('driver'), (req, res) => {
  const st = db.byId('stations', req.params.id);
  if (!st) return res.status(404).json({ error: 'Станция не найдена' });
  const photo = req.body?.photo;
  if (typeof photo !== 'string' || !PHOTO.test(photo) || photo.length >= MAX_BYTES) return res.status(400).json({ error: 'Фото — JPEG, PNG или WebP до 400 КБ' });
  const today = photos().filter(p => p.userId === req.account.id && Date.now() - Date.parse(p.at) < DAY).length;
  if (today >= PER_DAY) return res.status(429).json({ error: `Не больше ${PER_DAY} фото в день — спасибо, что помогаете!` });
  const p = {
    id: `PH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    stationId: st.id,
    userId: req.account.id,
    user: String(req.account.name ?? '').split(' ')[0],
    note: String(req.body?.note ?? '').trim().slice(0, 140) || null,
    at: new Date().toISOString(),
    status: 'pending',
    data: photo,
  };
  photos().unshift(p);
  if (photos().length > 500) db.data.driverPhotos = photos().filter(x => x.status === 'pending').concat(photos().filter(x => x.status !== 'pending').slice(0, 100));
  db.save();
  emit({ type: 'photo.new', portal: 'driver', actor: req.account.name, message: `Новое фото станции ${st.name} от водителя — ждёт проверки`, entity: p.id, payload: { stationId: st.id, userId: req.account.id } });
  res.status(201).json({ photo: meta(p) });
});

api.get('/admin/driver-photos', requireAuth('admin'), (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ photos: photos().filter(p => p.status === status).slice(0, 100).map(meta), pending: photos().filter(p => p.status === 'pending').length });
});

api.get('/admin/driver-photos/:id', requireAuth('admin'), (req, res) => {
  const p = photos().find(x => x.id === req.params.id);
  if (!p?.data) return res.status(404).end();
  const [, type, b64] = p.data.match(/^data:(image\/\w+);base64,(.+)$/);
  res.set('Content-Type', type).set('Cache-Control', 'private, max-age=600').send(Buffer.from(b64, 'base64'));
});

api.post('/admin/driver-photos/:id', requireAuth('admin'), (req, res) => {
  const p = photos().find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Фото не найдено' });
  if (p.status !== 'pending') return res.status(409).json({ error: 'Фото уже проверено' });
  const approve = req.body?.decision === 'approve';
  const st = db.byId('stations', p.stationId);
  if (approve) {
    if (!st) return res.status(404).json({ error: 'Станции больше нет' });
    const gallery = ((db.data.stationGallery ??= {})[st.id] ??= []);
    // The network's own photos stay; the oldest driver photo makes room.
    if (gallery.length >= GALLERY_MAX) {
      const oldest = gallery.findIndex(g => g.by === 'driver');
      if (oldest < 0) return res.status(409).json({ error: 'В галерее станции уже 10 фото сети' });
      gallery.splice(oldest, 1);
    }
    gallery.push({ id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), data: p.data, by: 'driver', author: p.user });
    st.gallery = gallery.map(({ id, at, by, author }) => ({ id, at, ...(by ? { by, author } : {}) }));
    p.status = 'approved';
  } else {
    p.status = 'rejected';
  }
  // The image now lives in the gallery, or nowhere.
  delete p.data;
  p.decidedAt = new Date().toISOString();
  p.decidedBy = req.account.name;
  db.save();
  emit({
    type: 'photo.decision',
    portal: 'admin',
    actor: req.account.name,
    message: approve ? `Ваше фото станции ${st?.name ?? ''} опубликовано — спасибо!` : `Фото станции ${st?.name ?? ''} не прошло проверку: на нём должна быть видна станция или подъезд к ней`,
    entity: p.id,
    payload: { userId: p.userId, stationId: p.stationId, approved: approve },
  });
  res.json({ photo: meta(p) });
});

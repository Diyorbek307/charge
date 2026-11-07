import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { hashPasswordAsync } from './guard.js';
import { deleteAccount, blockers } from './accountDeletion.js';

/**
 * What support may do for the person in a chat, from the panel beside it:
 * reset the password, rename, delete the account. (Blocking, a bonus and a
 * balance correction already have their admin endpoints.) Every action goes
 * to the audit log under the admin's name.
 */

const account = id => db.data.accounts.find(a => a.id === id && a.portal !== 'admin') ?? null;
const audit = (req, type, message, a) => emit({ type, portal: 'admin', actor: req.account.name, message, entity: a.id, payload: { userId: a.id } });

/**
 * A driver signs in by a code anyway: the password is simply removed and the
 * next sign-in is by SMS. Staff get a temporary password, shown once to the
 * admin to read out — and every device of theirs is signed out.
 */
api.post('/admin/accounts/:id/reset-password', requireAuth('admin'), async (req, res) => {
  const a = account(req.params.id);
  if (!a) return res.status(404).json({ error: 'Аккаунт не найден' });
  db.data.tokens = db.data.tokens.filter(t => t.accountId !== a.id);
  let temporary = null;
  if (a.portal === 'driver') {
    Object.assign(a, { salt: crypto.randomBytes(16).toString('hex'), hash: crypto.randomBytes(32).toString('hex'), noPassword: true });
  } else {
    temporary = crypto.randomBytes(9).toString('base64url');
    const { salt, hash } = await hashPasswordAsync(temporary);
    Object.assign(a, { salt, hash, noPassword: false });
  }
  db.save();
  audit(req, 'account.password', `Пароль сброшен: ${a.name}`, a);
  res.json({ ok: true, temporary, signIn: a.portal === 'driver' ? 'code' : 'password' });
});

api.post('/admin/accounts/:id/name', requireAuth('admin'), (req, res) => {
  const a = account(req.params.id);
  if (!a) return res.status(404).json({ error: 'Аккаунт не найден' });
  const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 2) return res.status(400).json({ error: 'Имя — от 2 символов' });
  const before = a.name;
  a.name = name;
  for (const t of db.data.supportThreads ?? []) if (t.userId === a.id) t.user = name;
  db.save();
  audit(req, 'account.name', `Имя изменено: ${before} → ${name}`, a);
  res.json({ ok: true, name });
});

/** Deleting a driver at their request, with the same checks the app makes: no charge running, no debt, no money left. */
api.post('/admin/accounts/:id/delete', requireAuth('admin'), (req, res) => {
  const a = account(req.params.id);
  if (!a) return res.status(404).json({ error: 'Аккаунт не найден' });
  if (a.portal !== 'driver') return res.status(400).json({ error: 'Удалить можно аккаунт водителя; сеть или автопарк отключаются в их разделе' });
  if (String(req.body?.confirm ?? '').trim().toUpperCase() !== 'УДАЛИТЬ') return res.status(400).json({ error: 'Введите слово УДАЛИТЬ, чтобы подтвердить' });
  const why = blockers(a);
  if (why) return res.status(409).json({ error: why.replace('Напишите в поддержку — вернём деньги и удалим аккаунт', 'Сначала верните деньги водителю') });
  const name = a.name;
  deleteAccount(a);
  emit({ type: 'account.deleted', portal: 'admin', actor: req.account.name, message: `Аккаунт удалён по просьбе: ${name}`, entity: a.id });
  res.json({ ok: true });
});

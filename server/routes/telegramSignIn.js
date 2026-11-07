// Telegram Mini App: one-tap sign-in for drivers who linked their account
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db, publicAccount } from '../db.js';
import { isBlocked } from '../analytics.js';
import { verifyInitData, accountByTelegram, telegramConfigured } from '../telegram.js';
import { api, requireAuth } from '../api.js';

// ---------------------------------------------------------------------------
// Telegram Mini App: one-tap sign-in for drivers who linked their account
// ---------------------------------------------------------------------------

api.get('/auth/telegram/status', (_req, res) => res.json({ configured: telegramConfigured() }));

api.post('/auth/telegram', (req, res) => {
  const checked = verifyInitData(req.body?.initData);
  if (checked.error) return res.status(checked.error === 'Telegram не настроен' ? 503 : 401).json({ error: checked.error });
  const account = accountByTelegram(checked.user.id);
  // Not linked yet: the app shows the usual sign-in and links afterwards.
  if (!account) return res.status(404).json({ error: 'Telegram ещё не привязан к аккаунту', telegram: { firstName: checked.user.firstName } });
  if (isBlocked(account.id)) return res.status(403).json({ error: 'Аккаунт заблокирован — обратитесь в поддержку' });
  const token = db.issueToken(account, req);
  db.update('accounts', account.id, { lastLogin: new Date().toISOString() });
  res.json({ token, user: publicAccount(db.byId('accounts', account.id)) });
});

api.post('/auth/telegram/link', requireAuth('driver'), (req, res) => {
  const checked = verifyInitData(req.body?.initData);
  if (checked.error) return res.status(checked.error === 'Telegram не настроен' ? 503 : 401).json({ error: checked.error });
  const owner = accountByTelegram(checked.user.id);
  if (owner && owner.id !== req.account.id) return res.status(409).json({ error: 'Этот Telegram уже привязан к другому аккаунту' });
  const telegram = { id: checked.user.id, username: checked.user.username, firstName: checked.user.firstName, linkedAt: new Date().toISOString(), notify: true };
  db.update('accounts', req.account.id, { telegram });
  res.json({ user: publicAccount(db.byId('accounts', req.account.id)) });
});

api.post('/auth/telegram/unlink', requireAuth('driver'), (req, res) => {
  db.update('accounts', req.account.id, { telegram: null });
  res.json({ user: publicAccount(db.byId('accounts', req.account.id)) });
});

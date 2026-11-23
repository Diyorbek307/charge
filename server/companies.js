import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { hashPasswordAsync } from './guard.js';
import { sendInviteLetter, mailConfigured } from './mail.js';
import { companies, companyById, orgOf } from './org.js';

export { DEMO_ORG, orgOf, isCompany } from './org.js';

/**
 * Companies (fleets, taxi parks, any business whose staff charge on its
 * money). Each has its own account (wallet), its own employees, charges,
 * limits and reports — one company never sees or spends another's.
 *
 * A company is made by the admin after the contract: its name and the
 * manager's email. The manager gets a letter with a link and sets the
 * password there; until then nobody can sign in to it. The demo company
 * (biz-001) is the one the older data belongs to.
 */

const INVITE_DAYS = 7;
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://app.voli.uz').replace(/\/$/, '');
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const text = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function walletFor(id) {
  return (db.data.wallets[id] ??= { balance: 0, currency: 'UZS', autoTopUp: false, threshold: 0, card: null });
}

/** A new link for the manager; the old one stops working. Returns the link (shown to the admin once). */
function newInvite(account) {
  const token = crypto.randomBytes(24).toString('base64url');
  account.invite = { hash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() };
  return `${PUBLIC_URL}/?portal=business&invite=${token}`;
}

async function sendInvite(account, company, link) {
  if (!mailConfigured()) return { sent: false, error: 'Почта не настроена — отправьте ссылку менеджеру сами' };
  try {
    await sendInviteLetter(account.login, company.name, account.name, link, INVITE_DAYS);
    return { sent: true };
  } catch (err) {
    return { sent: false, error: `Письмо не ушло: ${err.message}. Отправьте ссылку менеджеру сами` };
  }
}

const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'V';

/** What the admin sees about each company. */
function view(c) {
  const managers = db.data.accounts.filter(a => a.portal === 'business' && a.orgId === c.id);
  const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
  const charges = db.data.sessions.filter(s => s.corporate && orgOf(s) === c.id && s.status === 'completed' && new Date(Date.parse(s.start) + 5 * 3600_000).toISOString().startsWith(month));
  return {
    ...c,
    balance: db.data.wallets[c.id]?.balance ?? 0,
    employees: db.data.employees.filter(e => orgOf(e) === c.id).length,
    monthSpend: charges.reduce((n, s) => n + (s.cost ?? 0), 0),
    monthKwh: Math.round(charges.reduce((n, s) => n + (s.energy ?? 0), 0)),
    managers: managers.map(a => ({ id: a.id, name: a.name, login: a.login, active: !a.invite, inviteExpires: a.invite?.expiresAt ?? null })),
  };
}

api.get('/admin/companies', requireAuth('admin'), (_req, res) => {
  res.json(companies().map(view));
});

api.post('/admin/companies', requireAuth('admin'), async (req, res) => {
  const name = text(req.body?.name, 80);
  const inn = text(req.body?.inn, 20).replace(/\D/g, '') || null;
  const managerName = text(req.body?.managerName, 60);
  const email = text(req.body?.email, 120).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Укажите название компании' });
  if (inn && inn.length !== 9) return res.status(400).json({ error: 'ИНН — 9 цифр' });
  if (managerName.length < 2) return res.status(400).json({ error: 'Укажите имя менеджера' });
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Почта менеджера — например, fleet@company.uz' });
  if (db.data.accounts.some(a => a.portal === 'business' && a.login === email)) return res.status(409).json({ error: 'Кабинет с этой почтой уже есть' });
  if (inn && companies().some(c => c.inn === inn)) return res.status(409).json({ error: 'Компания с этим ИНН уже есть' });

  const company = { id: `biz-${crypto.randomBytes(4).toString('hex')}`, name, inn, createdAt: new Date().toISOString(), createdBy: req.account.name };
  companies().push(company);
  walletFor(company.id);
  // No password yet: random bytes nobody knows, until the manager sets one by the link.
  const { salt, hash } = await hashPasswordAsync(crypto.randomBytes(24).toString('hex'));
  const account = { id: `acc-${crypto.randomBytes(5).toString('hex')}`, portal: 'business', login: email, salt, hash, name: managerName, role: 'Менеджер автопарка', org: name, orgId: company.id, avatar: initials(managerName) };
  const link = newInvite(account);
  db.data.accounts.push(account);
  db.save();
  const mail = await sendInvite(account, company, link);
  emit({ type: 'company.created', portal: 'admin', actor: req.account.name, message: `Новая компания: ${name} · менеджер ${managerName} (${email})`, entity: company.id, payload: { orgId: company.id } });
  res.status(201).json({ company: view(company), link, mail });
});

/** A fresh link for a manager who lost or did not get the letter. */
api.post('/admin/companies/:id/invite', requireAuth('admin'), async (req, res) => {
  const company = companyById(req.params.id);
  if (!company) return res.status(404).json({ error: 'Компания не найдена' });
  const account = db.data.accounts.find(a => a.portal === 'business' && a.orgId === company.id && (!req.body?.accountId || a.id === req.body.accountId));
  if (!account) return res.status(404).json({ error: 'У компании нет менеджера' });
  const link = newInvite(account);
  // A new link also ends every session of that account: the old password no longer matters.
  db.data.tokens = db.data.tokens.filter(t => t.accountId !== account.id);
  db.save();
  const mail = await sendInvite(account, company, link);
  emit({ type: 'company.invite', portal: 'admin', actor: req.account.name, message: `Новая ссылка для входа: ${company.name} · ${account.login}`, entity: company.id, payload: { orgId: company.id } });
  res.json({ link, mail });
});

/**
 * Money a company paid by bank transfer (companies pay by invoice): the admin
 * credits it with the payment order's number, so it is traceable.
 */
api.post('/admin/companies/:id/credit', requireAuth('admin'), (req, res) => {
  const company = companyById(req.params.id);
  if (!company) return res.status(404).json({ error: 'Компания не найдена' });
  const amount = Math.round(Number(req.body?.amount));
  const reference = text(req.body?.reference, 60);
  if (!(amount >= 1000 && amount <= 10_000_000_000)) return res.status(400).json({ error: 'Сумма — от 1 000 сум' });
  if (reference.length < 2) return res.status(400).json({ error: 'Укажите номер платёжки или основание' });
  const wallet = walletFor(company.id);
  wallet.balance += amount;
  const order = { id: `BANK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, provider: 'bank', userId: req.account.id, walletId: company.id, amount, status: 'paid', created: new Date().toISOString(), paidAt: new Date().toISOString(), reference, by: req.account.name };
  (db.data.payments ??= []).unshift(order);
  db.save();
  emit({ type: 'wallet.topup', portal: 'admin', actor: req.account.name, message: `Пополнение счёта компании ${company.name} банковским переводом · +${amount.toLocaleString('ru-RU')} сум · ${reference}`, entity: company.id, payload: { amount, balance: wallet.balance, provider: 'bank', orderId: order.id } });
  res.json({ company: view(company), order });
});

/** The manager opens the link from the letter and sets a password. */
api.get('/auth/invite/:token', (req, res) => {
  const account = db.data.accounts.find(a => a.invite?.hash === hashToken(req.params.token));
  if (!account || Date.parse(account.invite.expiresAt) < Date.now()) return res.status(404).json({ error: 'Ссылка устарела или уже использована — попросите Voli прислать новую' });
  res.json({ login: account.login, name: account.name, org: account.org });
});

api.post('/auth/invite/:token', async (req, res) => {
  const account = db.data.accounts.find(a => a.invite?.hash === hashToken(req.params.token));
  if (!account || Date.parse(account.invite.expiresAt) < Date.now()) return res.status(404).json({ error: 'Ссылка устарела или уже использована — попросите Voli прислать новую' });
  const password = String(req.body?.password ?? '');
  if (password.length < 10 || password.length > 200) return res.status(400).json({ error: 'Пароль — от 10 символов' });
  if (!/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) return res.status(400).json({ error: 'В пароле нужны буквы и цифры' });
  Object.assign(account, await hashPasswordAsync(password), { noPassword: false });
  delete account.invite;
  db.data.tokens = db.data.tokens.filter(t => t.accountId !== account.id);
  db.save();
  res.json({ ok: true, login: account.login });
});

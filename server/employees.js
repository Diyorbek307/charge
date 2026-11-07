import crypto from 'node:crypto';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { normalizePhone } from './sms.js';

/**
 * A fleet's employees. The manager adds a person by phone number — one at a
 * time or a whole list from a spreadsheet — with a monthly charging limit.
 * The person's Voli driver account is linked by that same phone: at once if
 * they already use Voli, or the first time they sign in with it. From then
 * on "Paid by the company" appears when they start a charge.
 */

const MAX_IMPORT = 500;
const MAX_LIMIT = 100_000_000;
const text = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const driverByPhone = phone => db.data.accounts.find(a => a.portal === 'driver' && a.login === phone) ?? null;

/** Checks one row; an error text, or the cleaned employee. */
function clean(row) {
  const name = text(row?.name, 80);
  if (name.length < 2) return { error: 'Укажите имя' };
  const phone = normalizePhone(row?.phone);
  if (!phone) return { error: 'Номер телефона — узбекский, +998 и 9 цифр' };
  const limit = Math.round(Number(String(row?.limit ?? '').replace(/\s/g, '')) || 0);
  if (limit < 0 || limit > MAX_LIMIT) return { error: 'Лимит — сумма в сумах' };
  return { name, phone, limit, dept: text(row?.dept, 40) || '—', vehicle: text(row?.vehicle, 40) || '—' };
}

function add(e, by) {
  const driver = driverByPhone(e.phone);
  const employee = { id: `emp-${crypto.randomBytes(4).toString('hex')}`, name: e.name, phone: e.phone, driverId: driver?.id ?? null, dept: e.dept, vehicle: e.vehicle, limit: e.limit, added: new Date().toISOString(), addedBy: by };
  db.data.employees.push(employee);
  return employee;
}

api.post('/employees', requireAuth('business', 'admin'), (req, res) => {
  const e = clean(req.body);
  if (e.error) return res.status(400).json({ error: e.error });
  if (db.data.employees.some(x => x.phone === e.phone || (x.driverId && x.driverId === driverByPhone(e.phone)?.id))) return res.status(409).json({ error: 'Сотрудник с этим номером уже есть' });
  const employee = add(e, req.account.name);
  db.save();
  emit({
    type: 'employee.added',
    portal: req.account.portal,
    actor: req.account.name,
    message: employee.driverId ? `${employee.name} добавлен в автопарк — зарядка за счёт компании доступна` : `${employee.name} добавлен — привяжется, когда войдёт в Voli с номером ${employee.phone}`,
    entity: employee.id,
    payload: { userId: employee.driverId },
  });
  res.json({ employee, linked: !!employee.driverId });
});

/** A list from a spreadsheet: each row added or explained. */
api.post('/employees/import', requireAuth('business', 'admin'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows?.length) return res.status(400).json({ error: 'Список пуст' });
  if (rows.length > MAX_IMPORT) return res.status(400).json({ error: `Не больше ${MAX_IMPORT} строк за раз` });
  const known = new Set(db.data.employees.map(x => x.phone).filter(Boolean));
  const result = { added: 0, linked: 0, skipped: [] };
  rows.forEach((row, i) => {
    const e = clean(row);
    if (e.error) return result.skipped.push({ row: i + 1, reason: e.error });
    if (known.has(e.phone)) return result.skipped.push({ row: i + 1, reason: 'Уже есть в списке' });
    known.add(e.phone);
    const employee = add(e, req.account.name);
    result.added += 1;
    if (employee.driverId) result.linked += 1;
  });
  if (result.added) {
    db.save();
    emit({ type: 'employee.added', portal: req.account.portal, actor: req.account.name, message: `Загружено сотрудников: ${result.added}`, entity: null, payload: {} });
  }
  res.json(result);
});

api.delete('/employees/:id', requireAuth('business', 'admin'), (req, res) => {
  const e = db.byId('employees', req.params.id);
  if (!e) return res.status(404).json({ error: 'Сотрудник не найден' });
  db.data.employees = db.data.employees.filter(x => x.id !== e.id);
  db.save();
  emit({ type: 'employee.removed', portal: req.account.portal, actor: req.account.name, message: `${e.name} удалён из автопарка`, entity: e.id });
  res.json({ removed: true });
});

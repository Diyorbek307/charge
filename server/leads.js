import { db } from './db.js';
import { normalizePhone } from './sms.js';

/**
 * Leads from the landing page: drivers joining the launch waitlist, and
 * charger operators or fleets asking to partner.
 *
 * These are real people, not demo data, so the collection survives demo
 * resets and schema reseeds (see KEEP in db.js). Personal data is the
 * minimum needed to call back, stored only with explicit consent.
 */

export const LEAD_KINDS = ['driver', 'operator', 'fleet', 'partner'];
export const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost', 'spam'];

const WINDOW_MS = 10 * 60_000;
const PER_CLIENT = 5;
const recent = new Map(); // client key → timestamps of recent submissions

const leads = () => (db.data.leads ??= []);

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

function limited(client) {
  const now = Date.now();
  const hits = (recent.get(client) ?? []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= PER_CLIENT) {
    recent.set(client, hits);
    return Math.ceil((WINDOW_MS - (now - hits[0])) / 1000);
  }
  hits.push(now);
  recent.set(client, hits);
  return 0;
}

/**
 * Validates and stores a lead. Returns { status, body } for the route, and
 * `lead` when a new one was created, so the caller can announce it.
 */
export function submitLead(input, client) {
  const body = input ?? {};
  // Honeypot: a field people never see. Bots fill it; pretend success.
  if (clean(body.website, 200)) return { status: 200, body: { ok: true } };

  const kind = LEAD_KINDS.includes(body.kind) ? body.kind : null;
  if (!kind) return { status: 400, body: { error: 'Некорректный тип заявки' } };
  if (body.consent !== true) return { status: 400, body: { error: 'Нужно согласие на обработку персональных данных' } };

  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, body: { error: 'Введите номер в формате +998 XX XXX XX XX' } };
  const name = clean(body.name, 80);
  if (name.length < 2) return { status: 400, body: { error: 'Укажите имя' } };
  const company = clean(body.company, 120);
  if (kind !== 'driver' && company.length < 2) return { status: 400, body: { error: 'Укажите компанию' } };

  const retryAfter = limited(client);
  if (retryAfter) return { status: 429, retryAfter, body: { error: 'Слишком много заявок — попробуйте позже' } };

  // The same person signing up twice for the same thing is one lead.
  const dup = leads().find(l => l.phone === phone && l.kind === kind && l.status !== 'spam');
  if (dup) return { status: 200, body: { ok: true, duplicate: true } };

  const counters = db.data.counters;
  counters.lead ??= 1;
  const lead = {
    id: `LD-${String(counters.lead++).padStart(4, '0')}`,
    kind,
    name,
    phone,
    company: kind === 'driver' ? '' : company,
    city: clean(body.city, 60),
    size: clean(body.size, 40),
    message: clean(body.message, 1000),
    lang: ['ru', 'uz', 'en'].includes(body.lang) ? body.lang : 'ru',
    consentAt: new Date().toISOString(),
    created: new Date().toISOString(),
    status: 'new',
    note: '',
  };
  leads().unshift(lead);
  db.save();
  return { status: 201, body: { ok: true }, lead };
}

export function listLeads() {
  return leads();
}

export function updateLead(id, patch) {
  const lead = leads().find(l => l.id === id);
  if (!lead) return null;
  if (patch.status !== undefined) {
    if (!LEAD_STATUSES.includes(patch.status)) return { error: 'Некорректный статус' };
    lead.status = patch.status;
  }
  if (patch.note !== undefined) lead.note = clean(patch.note, 500);
  lead.updated = new Date().toISOString();
  db.save();
  return lead;
}

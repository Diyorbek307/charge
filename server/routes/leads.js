// Leads from the landing page: launch waitlist and partner requests.
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { submitLead, listLeads, updateLead, LEAD_KINDS } from '../leads.js';
import { notifyTeam } from '../mail.js';
import { api, clientKey, emit, requireAuth, scopeOf } from '../api.js';

// ---------------------------------------------------------------------------
// Leads from the landing page: launch waitlist and partner requests.
// ---------------------------------------------------------------------------

const LEAD_LABEL = { driver: 'Лист ожидания', operator: 'Оператор станций', fleet: 'Автопарк', partner: 'Партнёр' };

api.post('/leads', (req, res) => {
  const result = submitLead(req.body, clientKey(req));
  if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
  if (result.lead) {
    const l = result.lead;
    const again = result.repeat ? ' (повторная)' : '';
    // Admin-only: lead.* has no rule in scopeOf, so it never goes public.
    emit({
      type: 'lead.new',
      portal: 'system',
      actor: l.name,
      message: `Новая заявка${again} · ${LEAD_LABEL[l.kind]}${l.company ? ` · ${l.company}` : ''}`,
      entity: l.id,
      payload: { kind: l.kind },
    });
    notifyTeam(`Новая заявка${again}: ${LEAD_LABEL[l.kind]}`, [
      ['Номер', l.id],
      ['Тип', LEAD_LABEL[l.kind]],
      ['Имя', l.name],
      ['Телефон', l.phone],
      ['Компания', l.company],
      ['Город', l.city],
      ['Размер', l.size],
      ['Сообщение', l.message],
      ['Язык', l.lang.toUpperCase()],
    ], '/?portal=admin&page=leads', { driver: 'hello', operator: 'partners', partner: 'partners', fleet: 'business' }[l.kind]);
  }
  res.status(result.status).json(result.body);
});

api.get('/leads', requireAuth('admin'), (_req, res) => {
  res.json({ leads: listLeads(), kinds: LEAD_KINDS });
});

api.patch('/leads/:id', requireAuth('admin'), (req, res) => {
  const lead = updateLead(req.params.id, req.body ?? {});
  if (!lead) return res.status(404).json({ error: 'Заявка не найдена' });
  if (lead.error) return res.status(400).json({ error: lead.error });
  res.json(lead);
});

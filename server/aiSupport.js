import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db.js';
import { api, requireAuth, emit } from './api.js';
import { notifyTeam } from './mail.js';
import { bonusFor } from './rewards.js';
import { plusActive, PLUS } from './plus.js';
import { publicPromos } from './promos.js';
import { setting } from './settings.js';

/**
 * AI agents in the support chat. A driver writes; the agent whose topic it
 * is answers within seconds — charging and stations, payments and bonuses,
 * the account and the app. What an agent must not settle alone (a refund, a
 * dispute about money, danger, a complaint, anything it is unsure of) it
 * hands to a person: the team gets a letter, the chat is marked for them.
 *
 * With ANTHROPIC_API_KEY set the agents are Claude; without it a basic mode
 * answers the most common questions from a short list and hands the rest
 * on. An admin turns the agents on and off, renames them and edits what
 * each is told, from the support page. Once a person answers in a chat, the
 * agents stay out of it for a while.
 */

const MODEL = process.env.AI_SUPPORT_MODEL || 'claude-opus-5-5';

const DEFAULT_AGENTS = [
  {
    id: 'charging',
    name: 'Зарядка и станции',
    emoji: '⚡',
    topics: 'зарядка не началась или прервалась, разъёмы и совместимость, станция не работает или занята, QR-код, бронь и очередь, Autocharge, как найти станцию',
    instructions: 'Помогай по шагам: сначала уточни станцию и разъём, затем предложи проверить кабель, перезапустить зарядку из приложения или выбрать другой разъём. Если станция сломана — предложи отметить это в приложении и показать ближайшую свободную.',
  },
  {
    id: 'payments',
    name: 'Оплата и бонусы',
    emoji: '💳',
    topics: 'пополнение кошелька, списания и чеки, цена зарядки, бонусы и награды, акции и скидки, Voli Plus, «Приведи друга», зарядка в долг',
    instructions: 'Объясняй, из чего сложилась сумма, по данным водителя. Возвраты, компенсации и спорные списания не обещай и не оформляй — передавай человеку.',
  },
  {
    id: 'account',
    name: 'Аккаунт и приложение',
    emoji: '📱',
    topics: 'вход и регистрация, смена телефона или пароля, профиль и автомобиль, уведомления, язык, семейный кошелёк, удаление аккаунта, ошибки приложения',
    instructions: 'Подсказывай, где в приложении нужный экран (Профиль → …). Удаление аккаунта и смену номера телефона передавай человеку.',
  },
];

const store = () => {
  const s = (db.data.aiSupport ??= { on: true, agents: [], stats: {} });
  // New default agents appear; the admin's edits of existing ones stay.
  for (const d of DEFAULT_AGENTS) if (!s.agents.some(a => a.id === d.id)) s.agents.push({ ...d, on: true });
  return s;
};
const agentsOn = () => store().agents.filter(a => a.on);
export const aiAnswering = () => store().on && agentsOn().length > 0;
const connected = () => !!process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// What the agents know
// ---------------------------------------------------------------------------

const KNOWLEDGE = `Voli — приложение для зарядки электромобилей в Узбекистане. Voli не владеет станциями: это агрегатор, который собирает станции сетей-партнёров на одной карте и даёт заряжаться и платить в одном приложении.

Как зарядиться: на карте выбрать станцию → разъём → «Начать зарядку», или отсканировать QR-код на станции (кнопка QR на карте). Остановить — кнопкой «Остановить» на экране зарядки или в разделе «Зарядка». Можно задать цель: до нужного процента или суммы.
Оплата: из кошелька Voli. Пополнение — Payme или Click (Профиль → Кошелёк). Пока зарядка идёт, держится минимальная сумма; списывается только фактически полученная энергия по цене, зафиксированной при старте. Если зарядка не началась, деньги не списываются.
Цена: у каждой сети свой тариф за кВт·ч, бывают дневные и ночные цены. Акции и скидки видны на карте значком «%» и в разделе «Скидки»; скидка применяется сама при старте зарядки.
Бонусы: начисляются за достижения, за приглашённых друзей и по акциям. Тратятся только на зарядку, имеют срок действия (Профиль → Награды и бонусы).
Voli Plus: подписка со скидкой на каждую зарядку (Профиль → Voli Plus).
«Приведи друга»: у каждого водителя свой код (Профиль → Приведи друга). Друг получает бонус на первую зарядку, пригласивший — процент с каждой оплаченной зарядки друга в течение нескольких месяцев, с месячным лимитом.
Зарядка в долг: после проверки лица можно заряжаться и оплатить позже, в пределах лимита и срока.
Бронь и очередь: станцию можно забронировать на несколько минут; если всё занято — встать в очередь, приложение сообщит, когда разъём освободится.
SOS: при поломке в дороге или разрядке — кнопка SOS в приложении. При угрозе жизни, пожаре или ДТП — сначала 101 (пожарная), 103 (скорая), 102 (полиция).
Поддержка людьми работает каждый день; в сложных случаях отвечает специалист.`;

const RULES = `Ты — ИИ-агент поддержки Voli в чате с водителем. Отвечай как один из агентов ниже — тот, чья тема ближе к вопросу.

Правила:
- Пиши на языке водителя (русский, узбекский или английский), коротко и по делу: 1–5 предложений или короткий список шагов. Без приветствий в каждом сообщении, без markdown-заголовков.
- Опирайся на сведения о Voli и на данные водителя из сообщения «Данные водителя». Ничего не выдумывай: если данных нет — скажи, что уточнит специалист, и передай человеку.
- Никогда не проси пароль, код из SMS, номер или срок действия карты.
- Не обещай и не оформляй возвраты, компенсации, бонусы или исключения из правил.
- Передай человеку (handoff = true), если: водитель просит возврат, компенсацию или оспаривает списание; деньги списались, а зарядки не было; есть опасность, авария, пожар (тогда сначала назови номера экстренных служб и кнопку SOS); жалоба на сотрудника или сеть; удаление аккаунта или смена номера; водитель просит человека; ты не уверен в ответе. В reply тогда коротко ответь по существу, что можешь, и скажи, что передал вопрос специалисту.
- В reason кратко (для команды) — почему передал человеку или о чём был вопрос.`;

const systemText = () => {
  const agents = agentsOn().map(a => `- id «${a.id}», «${a.name}». Темы: ${a.topics}. Указания: ${a.instructions}`).join('\n');
  return `${RULES}\n\nАгенты:\n${agents}\n\nСведения о Voli:\n${KNOWLEDGE}`;
};

/** What the agent may see about this driver: money, bonuses and recent charges — nothing more. */
function driverFacts(userId) {
  const acc = db.byId('accounts', userId);
  const wallet = db.data.wallets?.[userId];
  const sessions = db.data.sessions.filter(s => s.userId === userId).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 5);
  const when = iso => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lines = [
    `Имя: ${acc?.name ?? 'неизвестно'}`,
    `Баланс кошелька: ${wallet ? `${wallet.balance} сум` : 'нет кошелька'}`,
    `Бонусы: ${bonusFor(userId).balance} сум`,
    `Voli Plus: ${plusActive(userId) ? `активна, скидка ${PLUS.discount}%` : 'нет'}`,
    `«Приведи друга»: ${setting('referral.percent')}% с зарядок друга, другу ${setting('referral.friendBonus')} сум на первую зарядку`,
    `Акции сейчас: ${publicPromos().map(p => `${p.title} (−${p.percent}%)`).join('; ') || 'нет'}`,
    sessions.length
      ? `Последние зарядки:\n${sessions.map(s => `  ${when(s.start)} · ${s.stationName} · ${s.connector} · статус ${s.status}${s.energy ? ` · ${s.energy} кВт·ч` : ''}${s.cost ? ` · ${s.cost} сум` : ''}${s.promo ? ` · акция ${s.promo.title}` : ''}${s.stopReason ? ` · остановлена: ${s.stopReason}` : ''}`).join('\n')}`
      : 'Зарядок ещё не было',
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    agent: { type: 'string', description: 'id агента, который отвечает' },
    reply: { type: 'string', description: 'Ответ водителю' },
    handoff: { type: 'boolean', description: 'Нужен ли человек' },
    reason: { type: 'string', description: 'Кратко для команды' },
  },
  required: ['agent', 'reply', 'handoff', 'reason'],
  additionalProperties: false,
};

let client = null;
const claude = () => (client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 }));

const PHOTO = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

/** The chat as Claude reads it: the driver's turns (with their photos), and what support and the agents said. */
function conversation(messages, userId) {
  const recent = messages.slice(-20);
  const photosFrom = recent.filter(m => m.from === 'user' && m.image).slice(-2).map(m => m.id);
  const turns = recent.map(m => {
    if (m.from !== 'user') return { role: 'assistant', content: m.text || '(фото)' };
    const content = [];
    const img = photosFrom.includes(m.id) && PHOTO.exec(m.image ?? '');
    if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img[1], data: img[2] } });
    content.push({ type: 'text', text: m.text || '(водитель прислал фото)' });
    return { role: 'user', content };
  });
  // The facts come first, so the first turn is the driver's.
  return [{ role: 'user', content: `Данные водителя (для справки, не пересказывай целиком):\n${driverFacts(userId)}` }, ...turns];
}

async function askClaude(messages, userId) {
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // A chat: quick and short answers do well at low effort.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: systemText(), cache_control: { type: 'ephemeral' } }],
    messages: conversation(messages, userId),
  });
  if (res.stop_reason === 'refusal') return null;
  const text = res.content.find(b => b.type === 'text')?.text;
  if (!text) return null;
  const out = JSON.parse(text);
  return { agent: out.agent, reply: String(out.reply ?? '').trim(), handoff: !!out.handoff, reason: String(out.reason ?? '') };
}

/** The basic mode, without Claude: the most common questions, everything else to a person. */
const BASIC = [
  { agent: 'charging', words: ['не начина', 'не запуска', 'не заряж', 'ошибка зарядк', 'прервал', 'остановил', 'zaryad'], reply: 'Проверьте, что кабель плотно вставлен в машину и в станцию, затем нажмите «Начать зарядку» ещё раз или выберите другой разъём. Если зарядка не началась, деньги не списываются. Не помогло — напишите название станции, я передам специалисту.' },
  { agent: 'charging', words: ['qr', 'куар', 'код на станц'], reply: 'Откройте карту и нажмите кнопку QR внизу, наведите камеру на код на станции — откроется нужный разъём. Если код не читается, выберите станцию на карте вручную.' },
  { agent: 'charging', words: ['занят', 'очеред', 'брон'], reply: 'Если все разъёмы заняты, на странице станции нажмите «Встать в очередь» — приложение сообщит, когда разъём освободится. Свободную станцию можно забронировать на несколько минут.' },
  { agent: 'payments', words: ['пополн', 'payme', 'click', 'кошел', 'баланс'], reply: 'Пополнить кошелёк: Профиль → Кошелёк → Пополнить, через Payme или Click. Деньги приходят сразу после оплаты.' },
  { agent: 'payments', words: ['бонус', 'наград', 'приведи', 'друг', 'реферал'], reply: 'Бонусы тратятся только на зарядку и действуют ограниченное время — всё видно в Профиль → Награды и бонусы. Свой код для друзей — в Профиль → Приведи друга.' },
  { agent: 'payments', words: ['скидк', 'акци', 'plus', 'плюс'], reply: 'Все скидки — в разделе «Скидки» и значком «%» на карте; скидка применяется сама при старте зарядки. Voli Plus даёт скидку на каждую зарядку: Профиль → Voli Plus.' },
  { agent: 'account', words: ['пароль', 'войти', 'вход', 'логин'], reply: 'На экране входа нажмите «Забыли пароль?» — придёт SMS с кодом, после него задайте новый пароль. Никому не сообщайте код из SMS.' },
  { agent: 'account', words: ['уведомлен', 'язык', 'til', 'настройк'], reply: 'Уведомления и язык меняются в Профиль → Настройки.' },
];
const HANDOFF_WORDS = ['верн', 'возврат', 'компенс', 'списал', 'дважды', 'жалоб', 'удал', 'человек', 'оператор', 'специалист', 'авари', 'пожар', 'дтп', 'опасн'];

function askBasic(messages) {
  const last = [...messages].reverse().find(m => m.from === 'user');
  const q = (last?.text ?? '').toLowerCase();
  const on = new Set(agentsOn().map(a => a.id));
  const danger = ['авари', 'пожар', 'дтп', 'опасн'].some(w => q.includes(w));
  if (!q || HANDOFF_WORDS.some(w => q.includes(w))) {
    return {
      agent: on.has('payments') && /верн|возврат|компенс|списал|дважды/.test(q) ? 'payments' : [...on][0],
      reply: danger
        ? 'Если есть угроза жизни — звоните 101 (пожарная), 103 (скорая), 102 (полиция) и нажмите SOS в приложении. Я уже передал ваше сообщение специалисту.'
        : 'Передал ваш вопрос специалисту — он ответит здесь в ближайшее время.',
      handoff: true,
      reason: last?.image && !q ? 'фото без текста' : 'нужен человек',
    };
  }
  const hit = BASIC.find(b => on.has(b.agent) && b.words.some(w => q.includes(w)));
  if (hit) return { agent: hit.agent, reply: hit.reply, handoff: false, reason: 'частый вопрос' };
  return { agent: [...on][0], reply: 'Передал ваш вопрос специалисту — он ответит здесь в ближайшее время.', handoff: true, reason: 'вопрос вне частых' };
}

/** One answer for this chat: Claude when connected, the basic mode otherwise or if Claude fails. */
export async function answerFor(messages, userId) {
  let out = null;
  let source = 'basic';
  if (connected()) {
    try {
      out = await askClaude(messages, userId);
      if (out) source = 'claude';
    } catch (err) {
      console.warn('[ai-support]', err?.status ?? '', err?.message);
    }
  }
  out ??= askBasic(messages);
  const agent = agentsOn().find(a => a.id === out.agent) ?? agentsOn()[0];
  return { ...out, agent: agent.id, agentName: agent.name, emoji: agent.emoji, source };
}

const running = new Map();

/** A driver wrote: the agents answer, unless a person is in this chat. */
export function onDriverMessage(thread) {
  if (!aiAnswering() || (thread.aiHoldUntil && Date.parse(thread.aiHoldUntil) > Date.now())) return;
  // Messages that come while an answer is being written are answered together, once.
  if (running.has(thread.id)) {
    running.set(thread.id, true);
    return;
  }
  running.set(thread.id, false);
  void (async () => {
    try {
      do {
        running.set(thread.id, false);
        await answerThread(thread);
      } while (running.get(thread.id));
    } finally {
      running.delete(thread.id);
    }
  })();
}

async function answerThread(thread) {
  const r = await answerFor(thread.messages, thread.userId);
  // A person may have stepped in while the agent was thinking.
  if (thread.aiHoldUntil && Date.parse(thread.aiHoldUntil) > Date.now()) return;
  const m = { id: crypto.randomBytes(6).toString('hex'), from: 'ai', agent: r.agent, agentName: r.agentName, text: r.reply.slice(0, 2000), image: null, at: new Date().toISOString() };
  thread.messages.push(m);
  thread.updatedAt = m.at;
  thread.unreadUser = (thread.unreadUser ?? 0) + 1;
  const stats = (store().stats[r.agent] ??= { answered: 0, handoffs: 0 });
  stats.answered++;
  if (r.handoff) {
    stats.handoffs++;
    thread.needsHuman = true;
    thread.handoffReason = r.reason;
    const last = [...thread.messages].reverse().find(x => x.from === 'user');
    notifyTeam(`Поддержка: нужен человек — ${thread.user}`, [
      ['Обращение', thread.id],
      ['Водитель', thread.user],
      ['Телефон', thread.phone ?? ''],
      ['Сообщение', last?.text || '(фото)'],
      ['Агент', `${r.agentName}: ${r.reason}`],
    ], '/?portal=admin&page=support', 'support');
  } else if (!thread.needsHuman) {
    // Answered and nothing left for a person: it does not wait in their list.
    thread.unreadAdmin = 0;
  }
  db.save();
  emit({ type: 'support.message', portal: 'system', actor: r.agentName, message: `${r.agentName}: ${m.text.slice(0, 80)}`, entity: thread.id, payload: { userId: thread.userId, from: 'ai', handoff: r.handoff } });
}

// ---------------------------------------------------------------------------
// The admin's controls
// ---------------------------------------------------------------------------

const view = () => {
  const s = store();
  return {
    on: s.on,
    connected: connected(),
    model: connected() ? MODEL : null,
    agents: s.agents.map(a => ({ ...a, answered: s.stats[a.id]?.answered ?? 0, handoffs: s.stats[a.id]?.handoffs ?? 0 })),
    waiting: (db.data.supportThreads ?? []).filter(t => t.needsHuman && t.status !== 'closed').length,
  };
};

api.get('/admin/ai-agents', requireAuth('admin'), (_req, res) => res.json(view()));

api.put('/admin/ai-agents', requireAuth('admin'), (req, res) => {
  const s = store();
  const b = req.body ?? {};
  if (typeof b.on === 'boolean') s.on = b.on;
  for (const patch of Array.isArray(b.agents) ? b.agents : []) {
    const a = s.agents.find(x => x.id === patch?.id);
    if (!a) continue;
    if (typeof patch.on === 'boolean') a.on = patch.on;
    for (const [k, max] of [['name', 40], ['topics', 400], ['instructions', 1500]]) {
      if (typeof patch[k] === 'string' && patch[k].trim()) a[k] = patch[k].trim().slice(0, max);
    }
  }
  db.save();
  emit({ type: 'settings.update', portal: 'admin', actor: req.account.name, message: 'Изменены ИИ-агенты поддержки', entity: 'ai-agents' });
  res.json(view());
});

/** Try the agents on a question without any chat: what they would answer, and whether they would call a person. */
api.post('/admin/ai-agents/test', requireAuth('admin'), async (req, res) => {
  const text = String(req.body?.text ?? '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Напишите вопрос' });
  if (!agentsOn().length) return res.status(400).json({ error: 'Включите хотя бы одного агента' });
  res.json(await answerFor([{ id: 'test', from: 'user', text, image: null, at: new Date().toISOString() }], req.account.id));
});

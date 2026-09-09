import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, RotateCcw, Mic } from 'lucide-react';

interface Msg { id: string; role: 'user' | 'ai'; text: string; ts: string; }

type PortalType = 'admin' | 'operator' | 'business';

const CONFIG = {
  admin: {
    name: 'Admin AI Analyst',
    accent: '#8B5CF6',
    accentBg: 'rgba(139,92,246,0.12)',
    accentBorder: 'rgba(139,92,246,0.28)',
    gradient: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
    greeting: 'Привет! Я AI-аналитик платформы ONE CHARGE. Могу ответить на любые вопросы по выручке, операторам, мошенничеству и трафику.',
    chips: ['Топ операторы', 'Выручка за неделю', 'Fraud за 24ч', 'Загрузка EVSE', 'Прогноз на октябрь'],
    answers: {
      'Топ операторы': 'GreenCharge UZ лидирует: **18.4M сум** за сентябрь (+22%). EcoVolt — 12.1M (+8%). SilkRoad EV — 8.7M (+15%). Общий рост сети: +19% vs август.',
      'Выручка за неделю': 'Выручка платформы за последние 7 дней: **91.2M сум**. Пиковый день — вторник (16.8M сум). Минимум — воскресенье (9.1M). Недельный тренд: +4.2%.',
      'Fraud за 24ч': 'За 24 часа ML-система зафиксировала **2 подозрительных транзакции**: аномальное потребление 312 кВт·ч (×2.7 физического лимита) и платёж ×21 медианы. Заблокировано автоматически. Предотвращённый ущерб: 713 000 сум.',
      'Загрузка EVSE': 'Средняя загрузка EVSE по сети: **87.3%** в пиковые часы (17–21ч). Перегружено: 12 коннекторов в Ташкенте. Рекомендую открыть очередь бронирования на Toshkent Siti Hub.',
      'Прогноз на октябрь': 'По модели AI, выручка октября составит **~467M сум** (+18.5% к сентябрю). Ожидается рост числа EV-регистраций +340 за месяц. Рекомендую ввести ночной тариф -20% для разгрузки пиков.',
      'default': 'Уточните вопрос — я анализирую данные 108 станций, 276 EVSE, 4 операторов и 14 218 пользователей в режиме реального времени.',
    },
  },
  operator: {
    name: 'Operator Assistant',
    accent: '#10B981',
    accentBg: 'rgba(16,185,129,0.12)',
    accentBorder: 'rgba(16,185,129,0.28)',
    gradient: 'linear-gradient(135deg, #059669, #10B981)',
    greeting: 'Привет! Я ваш AI-ассистент. Помогу разобраться со станциями, клиентами, тарифами и прогнозом выручки.',
    chips: ['Загрузка сейчас', 'Лучшая станция', 'Прогноз выручки', 'Проблемные EVSE'],
    answers: {
      'Загрузка сейчас': 'Сейчас **12 активных зарядок** из 124 EVSE (9.7%). Суммарная мощность: 1.48 МВт. Пиковые часы сегодня ожидаются в 18:00–21:00 — рекомендую включить динамический тариф.',
      'Лучшая станция': '**Toshkent Siti Hub** — лидер: 4.2M сум за сентябрь, 94 сессии, загрузка 94% в пик. На втором месте Yunusobod Mall (3.1M сум). Рекомендую расширить парковку у Hub.',
      'Прогноз выручки': 'По тренду: выручка октября составит **~21.3M сум** (+15.8% к сентябрю). Рост обусловлен сезоном и новыми клиентами. Если подключите ночной тариф, прогноз вырастет до 23.1M.',
      'Проблемные EVSE': '⚠️ **EVSE #14** (Yunusobod Mall) не выходит на связь 47 минут. Потенциальные потери: ~85 000 сум. Рекомендую технический визит. Остальные 123 коннектора работают нормально.',
      'default': 'Могу помочь с анализом любой из ваших 47 станций, 124 EVSE, тарифами или клиентской базой.',
    },
  },
  business: {
    name: 'Fleet AI',
    accent: '#6366F1',
    accentBg: 'rgba(99,102,241,0.12)',
    accentBorder: 'rgba(99,102,241,0.28)',
    gradient: 'linear-gradient(135deg, #4F46E5, #6366F1)',
    greeting: 'Привет! Я AI-ассистент вашего корпоративного флота. Помогу с планированием зарядки, контролем лимитов и оптимизацией расходов.',
    chips: ['Статус флота', 'Расходы этой недели', 'Кто превышает лимит', 'Оптимизировать'],
    answers: {
      'Статус флота': '**4 из 5 автомобилей** активны. BYD Han EV 01T сейчас заряжается (68%). Kia EV6 01R готов к выезду (91%). Hyundai Ioniq 5 03K в сервисе. Общий пробег за сентябрь: 4 280 км.',
      'Расходы этой недели': 'Расходы за текущую неделю: **2.18M сум** (22.3% месячного бюджета). Топ: Dilshod R. — 380 000 сум. Прогноз до конца месяца: 9.8M сум при текущем темпе.',
      'Кто превышает лимит': '⚠️ **Alisher T.** использовал 94% лимита (940 000 из 1M сум). Рекомендую увеличить лимит на 200K или ограничить зарядки до конца месяца. Остальные в норме.',
      'Оптимизировать': 'Рекомендации ИИ: заряжать авто **ночью 23–06ч** (тариф -18%), перенести 3 дальние поездки на утро. Расчётная экономия: **~420 000 сум/мес** (4.5% от бюджета).',
      'default': 'Могу проанализировать флот из 5 автомобилей, 18 сотрудников и историю расходов за 6 месяцев.',
    },
  },
};

export default function AIChat({ portalType }: { portalType: PortalType }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cfg = CONFIG[portalType];

  const ts = () => new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true);
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMsgs([{ id: '0', role: 'ai', text: cfg.greeting, ts: ts() }]);
      }, 900);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, typing]);

  const sendMsg = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { id: Date.now().toString(), role: 'user', text, ts: ts() };
    setMsgs(p => [...p, userMsg]);
    setInput('');
    setTyping(true);

    const delay = 900 + Math.random() * 800;
    setTimeout(() => {
      const answers = cfg.answers as Record<string, string>;
      const answer = answers[text] ?? answers['default'];
      setTyping(false);
      setMsgs(p => [...p, { id: (Date.now() + 1).toString(), role: 'ai', text: answer, ts: ts() }]);
    }, delay);
  };

  const reset = () => {
    setMsgs([]);
    setInitialized(false);
    setTyping(false);
  };

  const renderText = (t: string) => {
    // Bold **text**
    const parts = t.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong> : p
    );
  };

  return (
    <>
      {/* Floating trigger */}
      <div className="fixed bottom-6 right-6 z-50">
        {!open && (
          <button onClick={() => setOpen(true)}
            className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
            style={{ background: cfg.gradient, boxShadow: `0 8px 32px ${cfg.accent}50` }}>
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-2xl opacity-60"
              style={{ border: `2px solid ${cfg.accent}`, animation: 'pulse-halo 2s ease-out infinite' }} />
            <Sparkles size={22} className="text-white" />
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white"
              style={{ animation: 'pulse 1.8s ease-in-out infinite' }} />
          </button>
        )}
      </div>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] flex flex-col rounded-3xl overflow-hidden shadow-2xl"
          style={{ height: 540, background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), 0 0 40px ${cfg.accent}20`, animation: 'enter-up 0.3s cubic-bezier(0.16,1,0.3,1) both' }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 shrink-0"
            style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: cfg.gradient, boxShadow: `0 4px 12px ${cfg.accent}40` }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-none">{cfg.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" style={{ animation: 'pulse 1.8s ease-in-out infinite' }} />
                <p className="text-[10px] text-slate-500">AI · Онлайн</p>
              </div>
            </div>
            <button onClick={reset} className="text-slate-600 hover:text-slate-400 transition-colors p-1">
              <RotateCcw size={14} />
            </button>
            <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-300 transition-colors p-1">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                {m.role === 'ai' && (
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: cfg.gradient }}>
                    <Sparkles size={12} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                  style={m.role === 'user'
                    ? { background: cfg.gradient, color: '#fff' }
                    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className={`text-[13px] leading-relaxed ${m.role === 'ai' ? 'text-slate-200' : 'text-white'}`}>
                    {m.role === 'ai' ? renderText(m.text) : m.text}
                  </p>
                  <p className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-white/50' : 'text-slate-600'}`}>{m.ts}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: cfg.gradient }}>
                  <Sparkles size={12} className="text-white" />
                </div>
                <div className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-sm"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {[0, 150, 300].map(d => (
                    <div key={d} className="w-1.5 h-1.5 rounded-full bg-slate-400"
                      style={{ animation: `bounce 1s ease-in-out ${d}ms infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick chips */}
          {msgs.length <= 1 && !typing && (
            <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
              {cfg.chips.map(c => (
                <button key={c} onClick={() => sendMsg(c)}
                  className="text-[11px] px-2.5 py-1.5 rounded-xl border transition-all hover:opacity-80"
                  style={{ background: cfg.accentBg, borderColor: cfg.accentBorder, color: cfg.accent }}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 shrink-0">
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMsg(input)}
                placeholder="Спросите что угодно..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none" />
              <button onClick={() => sendMsg(input)} disabled={!input.trim()}
                className="w-7 h-7 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? cfg.gradient : 'rgba(255,255,255,0.08)' }}>
                <Send size={13} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

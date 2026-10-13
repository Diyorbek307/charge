import { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles, RotateCcw } from 'lucide-react';
import { useSync } from '../lib/sync';
import { useAnalytics, money, num, type Analytics } from '../lib/analytics';

interface Msg { id: string; role: 'user' | 'ai'; text: string; ts: string }
type PortalType = 'admin' | 'operator' | 'business';
type Live = ReturnType<typeof useSync>['state'];

const CONFIG = {
  admin: {
    name: 'Ассистент по данным',
    accent: '#4F6BFF',
    gradient: 'linear-gradient(135deg, #3B4FE0, #4F6BFF)',
    greeting: 'Отвечаю на вопросы о сети по живым данным: выручка, операторы, загрузка, проблемные станции, прогноз на месяц.',
    chips: ['Сводка за 30 дней', 'Лучшие операторы', 'Загрузка сейчас', 'Проблемные станции', 'Прогноз на месяц'],
  },
  operator: {
    name: 'Ассистент оператора',
    accent: '#0AAF97',
    gradient: 'linear-gradient(135deg, #078C7C, #0AAF97)',
    greeting: 'Подскажу по вашей сети на живых данных: выручка, лучшие станции, загрузка, проблемные разъёмы, прогноз.',
    chips: ['Сводка за 30 дней', 'Лучшая станция', 'Загрузка сейчас', 'Проблемные станции', 'Прогноз на месяц'],
  },
  business: {
    name: 'Ассистент автопарка',
    accent: '#4F6BFF',
    gradient: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)',
    greeting: 'Расскажу о расходах парка на живых данных: кто близок к лимиту, как сэкономить на ночных часах, прогноз на месяц.',
    chips: ['Расходы за 30 дней', 'Кто близок к лимиту', 'Как сэкономить', 'Прогноз на месяц'],
  },
};

type Topic = 'summary' | 'operators' | 'station' | 'load' | 'problems' | 'forecast' | 'limits' | 'savings' | 'help';

function topicOf(text: string): Topic {
  const t = text.toLowerCase();
  if (/прогноз|конец месяца|ожида/.test(t)) return 'forecast';
  if (/лимит|сотрудник|превыш/.test(t)) return 'limits';
  if (/эконом|сэконом|дешев|ночн|зелён|зелен|тариф/.test(t)) return 'savings';
  if (/оператор/.test(t)) return 'operators';
  if (/проблем|ошибк|сбо|не работ|неисправ|оповещ/.test(t)) return 'problems';
  if (/загруз|занят|сейчас|свобод/.test(t)) return 'load';
  if (/лучш|топ|станци/.test(t)) return 'station';
  if (/выручк|доход|оборот|сводк|расход|сесси|итог/.test(t)) return 'summary';
  return 'help';
}

function monthForecast(a: Analytics) {
  const now = new Date(Date.now() + 5 * 3600_000);
  const day = now.getUTCDate();
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const current = a.monthly[a.monthly.length - 1];
  const prev = a.monthly[a.monthly.length - 2];
  if (!current) return null;
  const projected = (current.revenue / day) * days;
  return { day, days, mtd: current.revenue, projected, prev: prev?.revenue ?? 0 };
}

function answer(topic: Topic, portal: PortalType, a: Analytics | null, live: Live): string {
  if (!a) return 'Данные ещё загружаются — спросите через пару секунд.';
  const t = a.totals;
  const spend = portal === 'business';
  switch (topic) {
    case 'summary':
      return spend
        ? `За 30 дней парк зарядился **${num(t.completed)} раз** на **${money(t.revenue)}**, ${num(t.energy, 0)} кВт·ч. Средняя зарядка — ${money(t.avgCheck)} (${num(t.avgKwh, 1)} кВт·ч), средняя цена ${num(t.avgPrice)} сум/кВт·ч.`
        : `За 30 дней: **${num(t.completed)} сессий**, **${money(t.revenue)}** выручки (${a.deltas.revenue === null ? 'нет базы для сравнения' : `${a.deltas.revenue >= 0 ? '+' : ''}${num(a.deltas.revenue, 1)}% к прошлому периоду`}), ${num(t.energy / 1000, 1)} МВт·ч. Средний чек ${money(t.avgCheck)}, успешных сессий ${num(t.successRate, 1)}%.`;
    case 'operators': {
      if (!a.operators.length) return 'Сведения по операторам доступны администратору платформы.';
      const rows = [...a.operators].filter(o => o.status === 'active').sort((x, y) => y.revenue - x.revenue);
      return rows.map((o, i) => `${i + 1}. **${o.name}** — ${money(o.revenue)}${o.revenueDelta === null ? '' : ` (${o.revenueDelta >= 0 ? '+' : ''}${num(o.revenueDelta, 1)}%)`}, ${o.stations} ст., загрузка ${num(o.utilization, 1)}%`).join('\n');
    }
    case 'station': {
      const top = a.stations[0];
      const second = a.stations[1];
      if (!top) return 'Пока нет данных по станциям.';
      return `Лидер по выручке — **${top.name}** (${top.city}): ${money(top.revenue)}, ${top.sessions} сессий, загрузка ${num(top.utilization, 1)}%.${second ? ` Второе место — ${second.name}: ${money(second.revenue)}.` : ''}`;
    }
    case 'load': {
      const stations = (live?.stations ?? []).filter(s => !a.operators.length || a.stations.some(x => x.id === s.id));
      const total = stations.reduce((n, s) => n + s.connectors.length, 0);
      const busy = stations.reduce((n, s) => n + s.connectors.filter(c => c.status === 'occupied').length, 0);
      const down = stations.reduce((n, s) => n + s.connectors.filter(c => c.status === 'unavailable').length, 0);
      const peak = [...a.hourly].sort((x, y) => y.sessions - x.sessions)[0];
      return `Сейчас заряжаются **${busy} из ${total}** разъёмов (${num((busy / Math.max(total, 1)) * 100, 0)}%), недоступно ${down}. Пик обычно в **${String(peak.hour).padStart(2, '0')}:00** по Ташкенту.`;
    }
    case 'problems': {
      const failing = a.stations.filter(s => s.failed > 0).sort((x, y) => y.failed - x.failed).slice(0, 3);
      const alerts = (live?.alerts ?? []).filter(al => !al.ack);
      const lines = failing.map(s => `• **${s.name}** — ${s.failed} неудачных запусков из ${s.sessions + s.failed}`);
      const head = alerts.length ? `Открыто оповещений: **${alerts.length}**${alerts.some(al => al.severity === 'critical') ? ', есть критические' : ''}.` : 'Открытых оповещений нет.';
      return failing.length ? `${head}\nЧаще всего ошибки запуска:\n${lines.join('\n')}` : `${head} Неудачных запусков за 30 дней нет.`;
    }
    case 'forecast': {
      const f = monthForecast(a);
      if (!f) return 'Для прогноза нужно хотя бы несколько дней данных этого месяца.';
      const vs = f.prev ? ` — это ${f.projected >= f.prev ? '+' : ''}${num(((f.projected - f.prev) / f.prev) * 100, 1)}% к прошлому месяцу` : '';
      return `За ${f.day} дней месяца: **${money(f.mtd)}**. При текущем темпе к концу месяца выйдет около **${money(f.projected)}**${vs}. Это линейная оценка, без учёта сезонности.`;
    }
    case 'limits': {
      const list = (a.employees ?? []).map(e => ({ ...e, share: e.limit ? e.spentMonth / e.limit : 0 })).sort((x, y) => y.share - x.share);
      if (!list.length) return 'Лимиты сотрудников видны в кабинете автопарка.';
      const near = list.filter(e => e.share >= 0.8);
      const rows = list.slice(0, 3).map(e => `• **${e.name}** — ${money(e.spentMonth)} из ${money(e.limit)} (${num(e.share * 100, 0)}%)`);
      return `${near.length ? `Близко к лимиту или выше: **${near.length}**.` : 'Никто не приблизился к лимиту (порог 80%).'}\n${rows.join('\n')}`;
    }
    case 'savings': {
      const night = a.hourly.filter(h => h.hour >= 23 || h.hour < 7);
      const nightShare = night.reduce((n, h) => n + h.sessions, 0) / Math.max(1, a.hourly.reduce((n, h) => n + h.sessions, 0));
      const dayEnergy = a.hourly.filter(h => !(h.hour >= 23 || h.hour < 7)).reduce((n, h) => n + h.energy, 0);
      const est = dayEnergy * t.avgPrice * 0.3 * 0.5;
      return `Ночью (23:00–07:00) цена ×0.7, но сейчас там только **${num(nightShare * 100, 0)}%** зарядок. Если перенести половину дневных зарядок на ночь, экономия составит около **${money(est)}** за 30 дней (оценка).`;
    }
    default:
      return 'Могу ответить про: выручку и сессии, операторов, лучшие станции, загрузку сейчас, проблемные станции, прогноз на месяц' + (spend ? ', лимиты сотрудников и экономию на ночных часах.' : '.');
  }
}

export default function AIChat({ portalType }: { portalType: PortalType }) {
  const cfg = CONFIG[portalType];
  const { data } = useAnalytics(portalType, 30);
  const { state } = useSync();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ts = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([{ id: 'hello', role: 'ai', text: cfg.greeting, ts: ts() }]);
  }, [open, msgs.length, cfg.greeting]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const reply = answer(topicOf(text), portalType, data, state);
    setMsgs(p => [...p, { id: `u${Date.now()}`, role: 'user', text, ts: ts() }, { id: `a${Date.now()}`, role: 'ai', text: reply, ts: ts() }]);
    setInput('');
  };

  const renderText = (t: string) =>
    t.split('\n').map((line, li) => (
      <span key={li} className="block">
        {line.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong> : p))}
      </span>
    ));

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={cfg.name}
          title={cfg.name}
          className="fixed bottom-[72px] right-4 z-[140] w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95"
          style={{ background: cfg.gradient, boxShadow: `0 8px 28px ${cfg.accent}55` }}
        >
          <Sparkles size={20} className="text-white" />
        </button>
      )}

      {open && (
        <div
          className="fixed z-[160] inset-x-2 bottom-2 sm:inset-x-auto sm:right-4 sm:bottom-[72px] sm:w-[380px] flex flex-col rounded-3xl overflow-hidden shadow-2xl"
          style={{ height: 'min(540px, calc(100vh - 96px))', background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', animation: 'enter-up 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
          role="dialog"
          aria-label={cfg.name}
        >
          <div className="flex items-center gap-3 px-4 py-3.5 shrink-0" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.gradient }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-none">{cfg.name}</p>
              <p className="text-[10px] text-slate-500 mt-1">Считает по живым данным · 30 дней</p>
            </div>
            <button onClick={() => setMsgs([])} aria-label="Начать заново" className="text-slate-500 hover:text-slate-300 p-1"><RotateCcw size={14} /></button>
            <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" aria-live="polite">
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                  style={m.role === 'user' ? { background: cfg.gradient } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className={`text-[13px] leading-relaxed ${m.role === 'ai' ? 'text-slate-200' : 'text-white'}`}>{m.role === 'ai' ? renderText(m.text) : m.text}</div>
                  <p className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-white/50' : 'text-slate-600'}`}>{m.ts}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
            {cfg.chips.map(c => (
              <button key={c} onClick={() => send(c)} className="text-[11px] px-2.5 py-1.5 rounded-xl border transition-opacity hover:opacity-80" style={{ background: `${cfg.accent}1f`, borderColor: `${cfg.accent}47`, color: '#cbd5e1' }}>
                {c}
              </button>
            ))}
          </div>

          <div className="px-3 pb-3 shrink-0">
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send(input)}
                placeholder="Например: какая станция лучшая?"
                aria-label="Вопрос ассистенту"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
              />
              <button onClick={() => send(input)} disabled={!input.trim()} aria-label="Отправить" className="w-7 h-7 rounded-xl flex items-center justify-center disabled:opacity-30" style={{ background: input.trim() ? cfg.gradient : 'rgba(255,255,255,0.08)' }}>
                <Send size={13} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

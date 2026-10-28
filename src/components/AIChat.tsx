import { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles, RotateCcw } from 'lucide-react';
import { useSync } from '../lib/sync';
import { useI18n, type Lang } from '../lib/i18n';
import { useAnalytics, moneyIn, num, type Analytics } from '../lib/analytics';

interface Msg { id: string; role: 'user' | 'ai'; text: string; ts: string }
type PortalType = 'admin' | 'operator' | 'business';
type Live = ReturnType<typeof useSync>['state'];
type Topic = 'summary' | 'operators' | 'station' | 'load' | 'problems' | 'forecast' | 'limits' | 'savings' | 'help';
type T3 = [ru: string, en: string, uz: string];

/** Picks the line for the current language. Answers are built here, not in phrase tables: they are full of numbers. */
const pick = (lang: Lang) => (ru: string, en: string, uz: string) => (lang === 'en' ? en : lang === 'uz' ? uz : ru);
const sign = (n: number) => (n >= 0 ? '+' : '');

const CONFIG: Record<PortalType, { name: T3; accent: string; gradient: string; greeting: T3; chips: { label: T3; topic: Topic }[] }> = {
  admin: {
    name: ['Ассистент по данным', 'Data assistant', 'Ma’lumotlar yordamchisi'],
    accent: '#4F6BFF',
    gradient: 'linear-gradient(135deg, #3B4FE0, #4F6BFF)',
    greeting: [
      'Отвечаю на вопросы о сети по живым данным: выручка, операторы, загрузка, проблемные станции, прогноз на месяц.',
      'I answer questions about the network from live data: revenue, operators, utilisation, problem stations, the month forecast.',
      'Tarmoq haqidagi savollarga jonli ma’lumotlar asosida javob beraman: daromad, operatorlar, yuklanish, muammoli stansiyalar, oylik prognoz.',
    ],
    chips: [
      { label: ['Сводка за 30 дней', '30-day summary', '30 kunlik xulosa'], topic: 'summary' },
      { label: ['Лучшие операторы', 'Top operators', 'Eng yaxshi operatorlar'], topic: 'operators' },
      { label: ['Загрузка сейчас', 'Load right now', 'Hozirgi yuklanish'], topic: 'load' },
      { label: ['Проблемные станции', 'Problem stations', 'Muammoli stansiyalar'], topic: 'problems' },
      { label: ['Прогноз на месяц', 'Month forecast', 'Oylik prognoz'], topic: 'forecast' },
    ],
  },
  operator: {
    name: ['Ассистент оператора', 'Operator assistant', 'Operator yordamchisi'],
    accent: '#FFC83D',
    gradient: 'linear-gradient(135deg, #2A2A2A, #111111)',
    greeting: [
      'Подскажу по вашей сети на живых данных: выручка, лучшие станции, загрузка, проблемные разъёмы, прогноз.',
      'I’ll help with your network from live data: revenue, best stations, utilisation, problem connectors, the forecast.',
      'Tarmog‘ingiz bo‘yicha jonli ma’lumotlar asosida yordam beraman: daromad, eng yaxshi stansiyalar, yuklanish, muammoli ulagichlar, prognoz.',
    ],
    chips: [
      { label: ['Сводка за 30 дней', '30-day summary', '30 kunlik xulosa'], topic: 'summary' },
      { label: ['Лучшая станция', 'Best station', 'Eng yaxshi stansiya'], topic: 'station' },
      { label: ['Загрузка сейчас', 'Load right now', 'Hozirgi yuklanish'], topic: 'load' },
      { label: ['Проблемные станции', 'Problem stations', 'Muammoli stansiyalar'], topic: 'problems' },
      { label: ['Прогноз на месяц', 'Month forecast', 'Oylik prognoz'], topic: 'forecast' },
    ],
  },
  business: {
    name: ['Ассистент автопарка', 'Fleet assistant', 'Avtopark yordamchisi'],
    accent: '#4F6BFF',
    gradient: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)',
    greeting: [
      'Расскажу о расходах парка на живых данных: кто близок к лимиту, как сэкономить на ночных часах, прогноз на месяц.',
      'I’ll walk you through fleet spending from live data: who is close to their limit, how to save at night, the month forecast.',
      'Avtopark xarajatlari haqida jonli ma’lumotlar asosida aytib beraman: kim limitga yaqin, tungi soatlarda qanday tejash, oylik prognoz.',
    ],
    chips: [
      { label: ['Расходы за 30 дней', '30-day spending', '30 kunlik xarajatlar'], topic: 'summary' },
      { label: ['Кто близок к лимиту', 'Who is near the limit', 'Kim limitga yaqin'], topic: 'limits' },
      { label: ['Как сэкономить', 'How to save', 'Qanday tejash mumkin'], topic: 'savings' },
      { label: ['Прогноз на месяц', 'Month forecast', 'Oylik prognoz'], topic: 'forecast' },
    ],
  },
};

/** Keyword routing in all three languages. */
function topicOf(text: string): Topic {
  const t = text.toLowerCase();
  if (/прогноз|конец месяца|ожида|forecast|projection|end of (the )?month|prognoz/.test(t)) return 'forecast';
  if (/лимит|сотрудник|превыш|limit|employee/.test(t)) return 'limits';
  if (/эконом|сэконом|дешев|ночн|зелён|зелен|тариф|save|saving|cheap|night|green|tarif|tejash|arzon|tun/.test(t)) return 'savings';
  if (/оператор|operator/.test(t)) return 'operators';
  if (/проблем|ошибк|сбо|не работ|неисправ|оповещ|problem|error|fail|broken|alert|muammo|xato|nosoz/.test(t)) return 'problems';
  if (/загруз|занят|сейчас|свобод|load|busy|now|free|utili|yuklan|band|hozir|bo‘sh|bo'sh/.test(t)) return 'load';
  if (/лучш|топ|станци|best|top|station|eng yaxshi|stansiya/.test(t)) return 'station';
  if (/выручк|доход|оборот|сводк|расход|сесси|итог|revenue|income|summary|spend|session|daromad|xulosa|xarajat|seans/.test(t)) return 'summary';
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

function answer(topic: Topic, portal: PortalType, a: Analytics | null, live: Live, lang: Lang): string {
  const L = pick(lang);
  const M = (n: number) => moneyIn(lang, n);
  if (!a) return L('Данные ещё загружаются — спросите через пару секунд.', 'The data is still loading — ask again in a couple of seconds.', 'Ma’lumotlar hali yuklanmoqda — bir necha soniyadan keyin so‘rang.');
  const t = a.totals;
  const spend = portal === 'business';
  switch (topic) {
    case 'summary': {
      if (spend)
        return L(
          `За 30 дней парк зарядился **${num(t.completed)} раз** на **${M(t.revenue)}**, ${num(t.energy, 0)} кВт·ч. Средняя зарядка — ${M(t.avgCheck)} (${num(t.avgKwh, 1)} кВт·ч), средняя цена ${num(t.avgPrice)} сум/кВт·ч.`,
          `In 30 days the fleet charged **${num(t.completed)} times** for **${M(t.revenue)}**, ${num(t.energy, 0)} kWh. An average charge is ${M(t.avgCheck)} (${num(t.avgKwh, 1)} kWh), the average price ${num(t.avgPrice)} UZS/kWh.`,
          `30 kunda avtopark **${num(t.completed)} marta** zaryadlandi, jami **${M(t.revenue)}**, ${num(t.energy, 0)} kVt·soat. O‘rtacha zaryad — ${M(t.avgCheck)} (${num(t.avgKwh, 1)} kVt·soat), o‘rtacha narx ${num(t.avgPrice)} so‘m/kVt·soat.`,
        );
      const d = a.deltas.revenue;
      const cmp = d === null
        ? L('нет базы для сравнения', 'nothing to compare with', 'taqqoslash uchun ma’lumot yo‘q')
        : L(`${sign(d)}${num(d, 1)}% к прошлому периоду`, `${sign(d)}${num(d, 1)}% on the previous period`, `oldingi davrga nisbatan ${sign(d)}${num(d, 1)}%`);
      return L(
        `За 30 дней: **${num(t.completed)} сессий**, **${M(t.revenue)}** выручки (${cmp}), ${num(t.energy / 1000, 1)} МВт·ч. Средний чек ${M(t.avgCheck)}, успешных сессий ${num(t.successRate, 1)}%.`,
        `Last 30 days: **${num(t.completed)} sessions**, **${M(t.revenue)}** in revenue (${cmp}), ${num(t.energy / 1000, 1)} MWh. Average check ${M(t.avgCheck)}, ${num(t.successRate, 1)}% of sessions successful.`,
        `30 kunda: **${num(t.completed)} ta seans**, **${M(t.revenue)}** daromad (${cmp}), ${num(t.energy / 1000, 1)} MVt·soat. O‘rtacha chek ${M(t.avgCheck)}, muvaffaqiyatli seanslar ${num(t.successRate, 1)}%.`,
      );
    }
    case 'operators': {
      if (!a.operators.length) return L('Сведения по операторам доступны администратору платформы.', 'Operator figures are available to the platform administrator.', 'Operatorlar bo‘yicha ma’lumotlar platforma administratoriga ochiq.');
      const rows = [...a.operators].filter(o => o.status === 'active').sort((x, y) => y.revenue - x.revenue);
      return rows
        .map((o, i) => {
          const d = o.revenueDelta === null ? '' : ` (${sign(o.revenueDelta)}${num(o.revenueDelta, 1)}%)`;
          return `${i + 1}. **${o.name}** — ${M(o.revenue)}${d}, ${L(`${o.stations} ст., загрузка ${num(o.utilization, 1)}%`, `${o.stations} stations, ${num(o.utilization, 1)}% utilisation`, `${o.stations} ta stansiya, yuklanish ${num(o.utilization, 1)}%`)}`;
        })
        .join('\n');
    }
    case 'station': {
      const top = a.stations[0];
      const second = a.stations[1];
      if (!top) return L('Пока нет данных по станциям.', 'No station data yet.', 'Stansiyalar bo‘yicha hali ma’lumot yo‘q.');
      return L(
        `Лидер по выручке — **${top.name}** (${top.city}): ${M(top.revenue)}, ${top.sessions} сессий, загрузка ${num(top.utilization, 1)}%.${second ? ` Второе место — ${second.name}: ${M(second.revenue)}.` : ''}`,
        `Top by revenue is **${top.name}** (${top.city}): ${M(top.revenue)}, ${top.sessions} sessions, ${num(top.utilization, 1)}% utilisation.${second ? ` Second is ${second.name}: ${M(second.revenue)}.` : ''}`,
        `Daromad bo‘yicha yetakchi — **${top.name}** (${top.city}): ${M(top.revenue)}, ${top.sessions} ta seans, yuklanish ${num(top.utilization, 1)}%.${second ? ` Ikkinchi o‘rinda — ${second.name}: ${M(second.revenue)}.` : ''}`,
      );
    }
    case 'load': {
      const stations = (live?.stations ?? []).filter(s => !a.operators.length || a.stations.some(x => x.id === s.id));
      const total = stations.reduce((n, s) => n + s.connectors.length, 0);
      const busy = stations.reduce((n, s) => n + s.connectors.filter(c => c.status === 'occupied').length, 0);
      const down = stations.reduce((n, s) => n + s.connectors.filter(c => c.status === 'unavailable').length, 0);
      const peak = `${String([...a.hourly].sort((x, y) => y.sessions - x.sessions)[0].hour).padStart(2, '0')}:00`;
      const share = num((busy / Math.max(total, 1)) * 100, 0);
      return L(
        `Сейчас заряжаются **${busy} из ${total}** разъёмов (${share}%), недоступно ${down}. Пик обычно в **${peak}** по Ташкенту.`,
        `Right now **${busy} of ${total}** connectors are charging (${share}%), ${down} unavailable. The usual peak is **${peak}** Tashkent time.`,
        `Hozir **${total} tadan ${busy} ta** ulagich zaryadlamoqda (${share}%), ${down} tasi ishlamayapti. Odatda cho‘qqi Toshkent vaqti bilan **${peak}** da.`,
      );
    }
    case 'problems': {
      const failing = a.stations.filter(s => s.failed > 0).sort((x, y) => y.failed - x.failed).slice(0, 3);
      const alerts = (live?.alerts ?? []).filter(al => !al.ack);
      const critical = alerts.some(al => al.severity === 'critical');
      const head = alerts.length
        ? L(`Открыто оповещений: **${alerts.length}**${critical ? ', есть критические' : ''}.`, `Open alerts: **${alerts.length}**${critical ? ', some critical' : ''}.`, `Ochiq ogohlantirishlar: **${alerts.length}**${critical ? ', kritiklari bor' : ''}.`)
        : L('Открытых оповещений нет.', 'No open alerts.', 'Ochiq ogohlantirishlar yo‘q.');
      if (!failing.length) return `${head} ${L('Неудачных запусков за 30 дней нет.', 'No failed starts in 30 days.', '30 kunda muvaffaqiyatsiz ishga tushirishlar yo‘q.')}`;
      const lines = failing.map(s => `• **${s.name}** — ${L(`${s.failed} неудачных запусков из ${s.sessions + s.failed}`, `${s.failed} failed starts of ${s.sessions + s.failed}`, `${s.sessions + s.failed} tadan ${s.failed} ta muvaffaqiyatsiz`)}`);
      return `${head}\n${L('Чаще всего ошибки запуска:', 'Most failed starts:', 'Eng ko‘p ishga tushirish xatolari:')}\n${lines.join('\n')}`;
    }
    case 'forecast': {
      const f = monthForecast(a);
      if (!f) return L('Для прогноза нужно хотя бы несколько дней данных этого месяца.', 'The forecast needs at least a few days of this month’s data.', 'Prognoz uchun shu oyning kamida bir necha kunlik ma’lumoti kerak.');
      const pct = f.prev ? `${sign(f.projected - f.prev)}${num(((f.projected - f.prev) / f.prev) * 100, 1)}%` : '';
      return L(
        `За ${f.day} дней месяца: **${M(f.mtd)}**. При текущем темпе к концу месяца выйдет около **${M(f.projected)}**${pct ? ` — это ${pct} к прошлому месяцу` : ''}. Это линейная оценка, без учёта сезонности.`,
        `First ${f.day} days of the month: **${M(f.mtd)}**. At this pace the month will close at about **${M(f.projected)}**${pct ? `, ${pct} on last month` : ''}. A linear estimate that ignores seasonality.`,
        `Oyning ${f.day} kunida: **${M(f.mtd)}**. Shu sur’atda oy oxirigacha taxminan **${M(f.projected)}** bo‘ladi${pct ? ` — o‘tgan oyga nisbatan ${pct}` : ''}. Bu mavsumiylikni hisobga olmagan chiziqli baho.`,
      );
    }
    case 'limits': {
      const list = (a.employees ?? []).map(e => ({ ...e, share: e.limit ? e.spentMonth / e.limit : 0 })).sort((x, y) => y.share - x.share);
      if (!list.length) return L('Лимиты сотрудников видны в кабинете автопарка.', 'Employee limits are shown in the fleet portal.', 'Xodimlar limitlari avtopark kabinetida ko‘rinadi.');
      const near = list.filter(e => e.share >= 0.8).length;
      const rows = list.slice(0, 3).map(e => `• **${e.name}** — ${L(`${M(e.spentMonth)} из ${M(e.limit)}`, `${M(e.spentMonth)} of ${M(e.limit)}`, `${M(e.limit)} dan ${M(e.spentMonth)}`)} (${num(e.share * 100, 0)}%)`);
      const head = near
        ? L(`Близко к лимиту или выше: **${near}**.`, `At or near the limit: **${near}**.`, `Limitga yaqin yoki undan oshgan: **${near}**.`)
        : L('Никто не приблизился к лимиту (порог 80%).', 'Nobody is close to their limit (80% threshold).', 'Hech kim limitga yaqinlashmagan (80% chegara).');
      return `${head}\n${rows.join('\n')}`;
    }
    case 'savings': {
      const isNight = (h: number) => h >= 23 || h < 7;
      const nightShare = num((a.hourly.filter(h => isNight(h.hour)).reduce((n, h) => n + h.sessions, 0) / Math.max(1, a.hourly.reduce((n, h) => n + h.sessions, 0))) * 100, 0);
      const dayEnergy = a.hourly.filter(h => !isNight(h.hour)).reduce((n, h) => n + h.energy, 0);
      const est = M(dayEnergy * t.avgPrice * 0.3 * 0.5);
      return L(
        `Ночью (23:00–07:00) цена ×0.7, но сейчас там только **${nightShare}%** зарядок. Если перенести половину дневных зарядок на ночь, экономия составит около **${est}** за 30 дней (оценка).`,
        `At night (23:00–07:00) the price is ×0.7, yet only **${nightShare}%** of charging happens then. Moving half of daytime charging to the night would save about **${est}** per 30 days (estimate).`,
        `Tunda (23:00–07:00) narx ×0.7, lekin hozir zaryadlashning atigi **${nightShare}%** shu vaqtga to‘g‘ri keladi. Kunduzgi zaryadlashning yarmini tunga o‘tkazsangiz, 30 kunda taxminan **${est}** tejaysiz (baho).`,
      );
    }
    default:
      return spend
        ? L(
            'Могу ответить про: расходы и зарядки парка, лимиты сотрудников, экономию на ночных часах, прогноз на месяц.',
            'I can answer about: fleet spending and charges, employee limits, night-time savings, the month forecast.',
            'Quyidagilar haqida javob bera olaman: avtopark xarajatlari va zaryadlari, xodimlar limitlari, tungi soatlarda tejash, oylik prognoz.',
          )
        : L(
            'Могу ответить про: выручку и сессии, операторов, лучшие станции, загрузку сейчас, проблемные станции, прогноз на месяц.',
            'I can answer about: revenue and sessions, operators, best stations, current load, problem stations, the month forecast.',
            'Quyidagilar haqida javob bera olaman: daromad va seanslar, operatorlar, eng yaxshi stansiyalar, hozirgi yuklanish, muammoli stansiyalar, oylik prognoz.',
          );
  }
}

const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-GB', uz: 'uz-UZ' };

export default function AIChat({ portalType }: { portalType: PortalType }) {
  const { lang } = useI18n();
  const L = pick(lang);
  const cfg = CONFIG[portalType];
  const name = L(...cfg.name);
  const greeting = L(...cfg.greeting);
  const { data } = useAnalytics(portalType, 30);
  const { state } = useSync();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ts = () => new Date().toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([{ id: 'hello', role: 'ai', text: greeting, ts: ts() }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, msgs.length, greeting]);

  // A new language starts a fresh conversation rather than mixing two.
  useEffect(() => setMsgs([]), [lang]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = (text: string, topic?: Topic) => {
    if (!text.trim()) return;
    const reply = answer(topic ?? topicOf(text), portalType, data, state, lang);
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
    <div data-no-translate>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={name}
          title={name}
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
          aria-label={name}
        >
          <div className="flex items-center gap-3 px-4 py-3.5 shrink-0" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.gradient }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-none">{name}</p>
              <p className="text-[10px] text-slate-500 mt-1">{L('Считает по живым данным · 30 дней', 'Works from live data · 30 days', 'Jonli ma’lumotlar asosida · 30 kun')}</p>
            </div>
            <button onClick={() => setMsgs([])} aria-label={L('Начать заново', 'Start over', 'Qaytadan boshlash')} className="text-slate-500 hover:text-slate-300 p-1"><RotateCcw size={14} /></button>
            <button onClick={() => setOpen(false)} aria-label={L('Закрыть', 'Close', 'Yopish')} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
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
            {cfg.chips.map(c => {
              const label = L(...c.label);
              return (
                <button key={c.topic} onClick={() => send(label, c.topic)} className="text-[11px] px-2.5 py-1.5 rounded-xl border transition-opacity hover:opacity-80" style={{ background: `${cfg.accent}1f`, borderColor: `${cfg.accent}47`, color: '#cbd5e1' }}>
                  {label}
                </button>
              );
            })}
          </div>

          <div className="px-3 pb-3 shrink-0">
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send(input)}
                placeholder={L('Например: какая станция лучшая?', 'For example: which station is the best?', 'Masalan: qaysi stansiya eng yaxshi?')}
                aria-label={L('Вопрос ассистенту', 'Question for the assistant', 'Yordamchiga savol')}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
              />
              <button onClick={() => send(input)} disabled={!input.trim()} aria-label={L('Отправить', 'Send', 'Yuborish')} className="w-7 h-7 rounded-xl flex items-center justify-center disabled:opacity-30" style={{ background: input.trim() ? cfg.gradient : 'rgba(255,255,255,0.08)' }}>
                <Send size={13} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

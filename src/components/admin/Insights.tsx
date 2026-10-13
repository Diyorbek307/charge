import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Flame, Moon, PlugZap, AlertTriangle, MapPin, Repeat, ArrowRight, Lightbulb } from 'lucide-react';
import { useAnalytics, money, num, type Analytics } from '../../lib/analytics';
import { Page, Card, Loading, ErrorNote, Pill } from './ui';

type Insight = {
  id: string;
  tone: 'red' | 'amber' | 'sky' | 'green';
  kind: string;
  icon: ReactNode;
  title: string;
  text: string;
  action?: { label: string; page: string };
};

/**
 * Insights are rules over the last 30 days of real network data — each one
 * states the numbers it is based on and points at the page to act on it.
 */
function buildInsights(a: Analytics): Insight[] {
  const out: Insight[] = [];
  const avgUtil = a.totals.utilization || 0.01;
  const byUtil = [...a.stations].filter(s => s.connectors > 0).sort((x, y) => y.utilization - x.utilization);

  const hot = byUtil[0];
  if (hot && hot.utilization > avgUtil * 1.8) {
    out.push({
      id: 'hot', tone: 'amber', kind: 'Загрузка', icon: <Flame size={16} />,
      title: `${hot.name}: загрузка ${num(hot.utilization, 1)}% — в ${num(hot.utilization / avgUtil, 1)} раза выше средней`,
      text: `${hot.sessions} сессий за 30 дней на ${hot.connectors} разъёмах (${hot.city}). Здесь чаще всего встают в очередь — стоит добавить быстрый разъём или выделить бронь в часы пик.`,
      action: { label: 'Станции и загрузка', page: 'analytics' },
    });
  }

  const cold = byUtil[byUtil.length - 1];
  if (cold && cold.utilization < avgUtil * 0.45) {
    out.push({
      id: 'cold', tone: 'sky', kind: 'Возможность', icon: <TrendingDown size={16} />,
      title: `${cold.name}: загрузка всего ${num(cold.utilization, 1)}%`,
      text: `${cold.sessions} сессий за 30 дней (${cold.city}). Можно предложить скидку в дневные часы, указать станцию в маршрутах планировщика или договориться о партнёрстве с площадкой рядом.`,
      action: { label: 'Тарифы сети', page: 'tariffs_global' },
    });
  }

  const failing = [...a.stations].filter(s => s.failed >= 2).sort((x, y) => y.failed / (y.sessions + y.failed) - x.failed / (x.sessions + x.failed))[0];
  if (failing) {
    const rate = (failing.failed / (failing.sessions + failing.failed)) * 100;
    out.push({
      id: 'fail', tone: rate > 5 ? 'red' : 'amber', kind: 'Надёжность', icon: <AlertTriangle size={16} />,
      title: `${failing.name}: ${failing.failed} неудачных запусков (${num(rate, 1)}%)`,
      text: `Выше, чем по сети (${num(100 - a.totals.successRate, 1)}%). Проверьте логи OCPP и состояние разъёмов — водители, у которых не запустилась зарядка, редко возвращаются.`,
      action: { label: 'Оператор станции', page: 'operators' },
    });
  }

  const nightSessions = a.hourly.filter(h => h.hour >= 23 || h.hour < 7).reduce((n, h) => n + h.sessions, 0);
  const allSessions = Math.max(1, a.hourly.reduce((n, h) => n + h.sessions, 0));
  const nightShare = (nightSessions / allSessions) * 100;
  const peak = [...a.hourly].sort((x, y) => y.sessions - x.sessions)[0];
  out.push({
    id: 'night', tone: nightShare < 15 ? 'sky' : 'green', kind: 'Тарифы', icon: <Moon size={16} />,
    title: `Ночью заряжаются ${num(nightShare, 0)}% водителей, пик — ${String(peak.hour).padStart(2, '0')}:00`,
    text: nightShare < 15
      ? 'Зелёные часы (×0.7) используются слабо. Напоминание в push за час до 23:00 и подсказка на карточке станции перенесут часть вечерних зарядок и разгрузят пик.'
      : 'Зелёные часы работают: ночная доля заметная. Можно расширить окно скидки на 22:00, если вечерний пик продолжит расти.',
    action: { label: 'Тарифы сети', page: 'tariffs_global' },
  });

  const gbt = a.connectors.find(c => c.type === 'GB/T DC');
  if (gbt) {
    out.push({
      id: 'gbt', tone: 'sky', kind: 'Спрос', icon: <PlugZap size={16} />,
      title: `GB/T DC — ${num(gbt.share, 1)}% всех сессий`,
      text: 'Китайские электромобили с GB/T — заметная доля рынка. Новые DC-станции стоит ставить с двумя кабелями: CCS2 и GB/T.',
      action: { label: 'Аналитика разъёмов', page: 'analytics' },
    });
  }

  const city = [...a.cities].filter(c => c.connectors > 0).sort((x, y) => y.sessions / y.connectors - x.sessions / x.connectors)[0];
  const perConnector = a.totals.completed / Math.max(1, a.network.connectors);
  if (city && city.sessions / city.connectors > perConnector * 1.3) {
    out.push({
      id: 'city', tone: 'amber', kind: 'Покрытие', icon: <MapPin size={16} />,
      title: `${city.city}: ${num(city.sessions / city.connectors, 0)} сессий на разъём — выше среднего (${num(perConnector, 0)})`,
      text: `${city.stations} станций и ${city.connectors} разъёмов не успевают за спросом. Хороший кандидат для следующей станции — предложите его операторам региона.`,
      action: { label: 'Операторы', page: 'operators' },
    });
  }

  if (a.deltas.revenue !== null) {
    const up = a.deltas.revenue >= 0;
    out.push({
      id: 'trend', tone: up ? 'green' : 'red', kind: 'Динамика', icon: up ? <TrendingUp size={16} /> : <TrendingDown size={16} />,
      title: `Выручка ${up ? 'растёт' : 'снижается'}: ${up ? '+' : ''}${num(a.deltas.revenue, 1)}% к прошлым 30 дням`,
      text: `${money(a.totals.revenue)} за период, ${num(a.totals.completed)} сессий (${a.deltas.sessions === null ? '' : `${a.deltas.sessions >= 0 ? '+' : ''}${num(a.deltas.sessions, 1)}%`}). Средний чек ${money(a.totals.avgCheck)}.`,
      action: { label: 'Аналитика', page: 'analytics' },
    });
  }

  out.push({
    id: 'repeat', tone: a.totals.repeatShare >= 50 ? 'green' : 'sky', kind: 'Лояльность', icon: <Repeat size={16} />,
    title: `${num(a.totals.repeatShare, 0)}% водителей заряжались больше одного раза`,
    text: `${num(a.totals.uniqueUsers)} уникальных водителей за 30 дней. ${a.totals.repeatShare >= 50 ? 'Сеть удерживает клиентов.' : 'Бонус за вторую зарядку поможет превратить разовых клиентов в постоянных.'}`,
    action: { label: 'Пользователи', page: 'users' },
  });

  const order = { red: 0, amber: 1, sky: 2, green: 3 };
  return out.sort((x, y) => order[x.tone] - order[y.tone]);
}

const BORDER = { red: 'border-red-200', amber: 'border-amber-200', sky: 'border-sky-100', green: 'border-emerald-100' };
const ICON = { red: 'bg-red-50 text-red-500', amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600', green: 'bg-emerald-50 text-emerald-600' };

export default function AdminInsights({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data, error } = useAnalytics('admin', 30);
  if (!data) return <Page title="Подсказки">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const insights = buildInsights(data);

  return (
    <Page title="Подсказки" subtitle="Правила по данным сети за 30 дней — каждая подсказка показывает, на каких цифрах она основана">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {insights.map(i => (
          <Card key={i.id} className={`border ${BORDER[i.tone]}`}>
            <div className="flex gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ICON[i.tone]}`}>{i.icon}</span>
              <div className="flex-1 min-w-0">
                <Pill tone={i.tone === 'green' ? 'green' : i.tone}>{i.kind}</Pill>
                <h3 className="text-sm font-bold text-slate-900 mt-2">{i.title}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{i.text}</p>
                {i.action && (
                  <button onClick={() => onNavigate(i.action!.page)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline">
                    {i.action.label}<ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-slate-400"><Lightbulb size={13} />Подсказки пересчитываются при каждой зарядке. Это правила, а не обученная модель — их легко проверить по цифрам на страницах аналитики.</p>
    </Page>
  );
}

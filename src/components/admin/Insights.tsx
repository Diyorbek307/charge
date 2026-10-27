import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Flame, Moon, PlugZap, AlertTriangle, MapPin, Repeat, ArrowRight, Lightbulb } from 'lucide-react';
import { useI18n, type Lang } from '../../lib/i18n';
import { useAnalytics, moneyIn, num, type Analytics } from '../../lib/analytics';
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

/** Picks the sentence for the current language; numbers are already formatted. */
const pick = (lang: Lang) => (ru: string, en: string, uz: string) => (lang === 'en' ? en : lang === 'uz' ? uz : ru);
const sign = (n: number) => (n >= 0 ? '+' : '');

/**
 * Insights are rules over the last 30 days of real network data — each one
 * states the numbers it is based on and points at the page to act on it.
 * Written per language: these sentences are too dynamic for phrase tables.
 */
function buildInsights(a: Analytics, lang: Lang): Insight[] {
  const L = pick(lang);
  const M = (n: number) => moneyIn(lang, n);
  const out: Insight[] = [];
  const avgUtil = a.totals.utilization || 0.01;
  const byUtil = [...a.stations].filter(s => s.connectors > 0).sort((x, y) => y.utilization - x.utilization);

  const hot = byUtil[0];
  if (hot && hot.utilization > avgUtil * 1.8) {
    const k = num(hot.utilization / avgUtil, 1);
    out.push({
      id: 'hot', tone: 'amber', kind: L('Загрузка', 'Utilisation', 'Yuklanish'), icon: <Flame size={16} />,
      title: L(
        `${hot.name}: загрузка ${num(hot.utilization, 1)}% — в ${k} раза выше средней`,
        `${hot.name}: ${num(hot.utilization, 1)}% utilisation — ${k}× the average`,
        `${hot.name}: yuklanish ${num(hot.utilization, 1)}% — o‘rtachadan ${k} baravar yuqori`,
      ),
      text: L(
        `${hot.sessions} сессий за 30 дней на ${hot.connectors} разъёмах (${hot.city}). Здесь чаще всего встают в очередь — стоит добавить быстрый разъём или выделить бронь в часы пик.`,
        `${hot.sessions} sessions in 30 days on ${hot.connectors} connectors (${hot.city}). Drivers queue here most — add a fast connector or set aside bookings at peak hours.`,
        `30 kunda ${hot.connectors} ta ulagichda ${hot.sessions} ta seans (${hot.city}). Bu yerda eng ko‘p navbat bo‘ladi — tezkor ulagich qo‘shish yoki cho‘qqi soatlarida bron ajratish kerak.`,
      ),
      action: { label: L('Станции и загрузка', 'Stations and utilisation', 'Stansiyalar va yuklanish'), page: 'analytics' },
    });
  }

  const cold = byUtil[byUtil.length - 1];
  if (cold && cold.utilization < avgUtil * 0.45) {
    out.push({
      id: 'cold', tone: 'sky', kind: L('Возможность', 'Opportunity', 'Imkoniyat'), icon: <TrendingDown size={16} />,
      title: L(`${cold.name}: загрузка всего ${num(cold.utilization, 1)}%`, `${cold.name}: only ${num(cold.utilization, 1)}% utilisation`, `${cold.name}: yuklanish atigi ${num(cold.utilization, 1)}%`),
      text: L(
        `${cold.sessions} сессий за 30 дней (${cold.city}). Можно предложить скидку в дневные часы, указать станцию в маршрутах планировщика или договориться о партнёрстве с площадкой рядом.`,
        `${cold.sessions} sessions in 30 days (${cold.city}). Offer a daytime discount, feature the station in trip-planner routes, or partner with a venue nearby.`,
        `30 kunda ${cold.sessions} ta seans (${cold.city}). Kunduzgi chegirma taklif qilish, stansiyani marshrutlarga qo‘shish yoki yaqin atrofdagi maydon bilan hamkorlik qilish mumkin.`,
      ),
      action: { label: L('Тарифы сети', 'Network tariffs', 'Tarmoq tariflari'), page: 'tariffs_global' },
    });
  }

  const failing = [...a.stations].filter(s => s.failed >= 2).sort((x, y) => y.failed / (y.sessions + y.failed) - x.failed / (x.sessions + x.failed))[0];
  if (failing) {
    const rate = num((failing.failed / (failing.sessions + failing.failed)) * 100, 1);
    const net = num(100 - a.totals.successRate, 1);
    out.push({
      id: 'fail', tone: Number(rate.replace(',', '.')) > 5 ? 'red' : 'amber', kind: L('Надёжность', 'Reliability', 'Ishonchlilik'), icon: <AlertTriangle size={16} />,
      title: L(`${failing.name}: неудачных запусков — ${failing.failed} (${rate}%)`, `${failing.name}: ${failing.failed} failed starts (${rate}%)`, `${failing.name}: ${failing.failed} ta muvaffaqiyatsiz ishga tushirish (${rate}%)`),
      text: L(
        `Выше, чем по сети (${net}%). Проверьте логи OCPP и состояние разъёмов — водители, у которых не запустилась зарядка, редко возвращаются.`,
        `Higher than the network (${net}%). Check the OCPP logs and the connectors — drivers whose charge failed to start rarely come back.`,
        `Tarmoq bo‘yicha ko‘rsatkichdan yuqori (${net}%). OCPP jurnallari va ulagichlarni tekshiring — zaryadlash boshlanmagan haydovchilar kamdan-kam qaytib keladi.`,
      ),
      action: { label: L('Оператор станции', 'Station operator', 'Stansiya operatori'), page: 'operators' },
    });
  }

  const nightSessions = a.hourly.filter(h => h.hour >= 23 || h.hour < 7).reduce((n, h) => n + h.sessions, 0);
  const allSessions = Math.max(1, a.hourly.reduce((n, h) => n + h.sessions, 0));
  const nightShare = num((nightSessions / allSessions) * 100, 0);
  const peak = `${String([...a.hourly].sort((x, y) => y.sessions - x.sessions)[0].hour).padStart(2, '0')}:00`;
  const lowNight = nightSessions / allSessions < 0.15;
  out.push({
    id: 'night', tone: lowNight ? 'sky' : 'green', kind: L('Тарифы', 'Tariffs', 'Tariflar'), icon: <Moon size={16} />,
    title: L(`Ночью заряжаются ${nightShare}% водителей, пик — ${peak}`, `${nightShare}% of drivers charge at night; the peak is ${peak}`, `Haydovchilarning ${nightShare}% tunda zaryadlanadi, cho‘qqi — ${peak}`),
    text: lowNight
      ? L(
          'Зелёные часы (×0.7) используются слабо. Напоминание в push за час до 23:00 и подсказка на карточке станции перенесут часть вечерних зарядок и разгрузят пик.',
          'Green hours (×0.7) are underused. A push reminder an hour before 23:00 and a hint on the station card will move some evening charging and ease the peak.',
          'Yashil soatlar (×0.7) kam ishlatilmoqda. 23:00 dan bir soat oldin push-eslatma va stansiya kartasidagi maslahat kechki zaryadlashning bir qismini ko‘chirib, cho‘qqini yengillashtiradi.',
        )
      : L(
          'Зелёные часы работают: ночная доля заметная. Можно расширить окно скидки на 22:00, если вечерний пик продолжит расти.',
          'Green hours work: the night share is noticeable. Consider extending the discount to 22:00 if the evening peak keeps growing.',
          'Yashil soatlar ishlayapti: tungi ulush sezilarli. Kechki cho‘qqi o‘sishda davom etsa, chegirmani 22:00 gacha kengaytirish mumkin.',
        ),
    action: { label: L('Тарифы сети', 'Network tariffs', 'Tarmoq tariflari'), page: 'tariffs_global' },
  });

  const gbt = a.connectors.find(c => c.type === 'GB/T DC');
  if (gbt) {
    out.push({
      id: 'gbt', tone: 'sky', kind: L('Спрос', 'Demand', 'Talab'), icon: <PlugZap size={16} />,
      title: L(`GB/T DC — ${num(gbt.share, 1)}% всех сессий`, `GB/T DC — ${num(gbt.share, 1)}% of all sessions`, `GB/T DC — barcha seanslarning ${num(gbt.share, 1)}%`),
      text: L(
        'Китайские электромобили с GB/T — заметная доля рынка. Новые DC-станции стоит ставить с двумя кабелями: CCS2 и GB/T.',
        'Chinese EVs with GB/T are a sizeable share of the market. New DC chargers should come with two cables: CCS2 and GB/T.',
        'GB/T ulagichli Xitoy elektromobillari bozorning sezilarli qismi. Yangi DC stansiyalarni ikki kabel bilan o‘rnatish kerak: CCS2 va GB/T.',
      ),
      action: { label: L('Аналитика разъёмов', 'Connector analytics', 'Ulagichlar tahlili'), page: 'analytics' },
    });
  }

  const city = [...a.cities].filter(c => c.connectors > 0).sort((x, y) => y.sessions / y.connectors - x.sessions / x.connectors)[0];
  const perConnector = a.totals.completed / Math.max(1, a.network.connectors);
  if (city && city.sessions / city.connectors > perConnector * 1.3) {
    const pc = num(city.sessions / city.connectors, 0);
    const avg = num(perConnector, 0);
    out.push({
      id: 'city', tone: 'amber', kind: L('Покрытие', 'Coverage', 'Qamrov'), icon: <MapPin size={16} />,
      title: L(`${city.city}: ${pc} сессий на разъём — выше среднего (${avg})`, `${city.city}: ${pc} sessions per connector — above the average (${avg})`, `${city.city}: ulagichga ${pc} ta seans — o‘rtachadan yuqori (${avg})`),
      text: L(
        `${city.stations} станций и ${city.connectors} разъёмов не успевают за спросом. Хороший кандидат для следующей станции — предложите его операторам региона.`,
        `${city.stations} stations and ${city.connectors} connectors can’t keep up with demand. A good spot for the next station — suggest it to the region’s operators.`,
        `${city.stations} ta stansiya va ${city.connectors} ta ulagich talabga ulgurmayapti. Keyingi stansiya uchun yaxshi joy — buni mintaqa operatorlariga taklif qiling.`,
      ),
      action: { label: L('Операторы', 'Operators', 'Operatorlar'), page: 'operators' },
    });
  }

  if (a.deltas.revenue !== null) {
    const up = a.deltas.revenue >= 0;
    const d = `${sign(a.deltas.revenue)}${num(a.deltas.revenue, 1)}%`;
    const ds = a.deltas.sessions === null ? '' : ` (${sign(a.deltas.sessions)}${num(a.deltas.sessions, 1)}%)`;
    out.push({
      id: 'trend', tone: up ? 'green' : 'red', kind: L('Динамика', 'Trend', 'Dinamika'), icon: up ? <TrendingUp size={16} /> : <TrendingDown size={16} />,
      title: L(`Выручка ${up ? 'растёт' : 'снижается'}: ${d} к прошлым 30 дням`, `Revenue is ${up ? 'growing' : 'falling'}: ${d} on the previous 30 days`, `Daromad ${up ? 'o‘smoqda' : 'kamaymoqda'}: oldingi 30 kunga nisbatan ${d}`),
      text: L(
        `${M(a.totals.revenue)} за период, ${num(a.totals.completed)} сессий${ds}. Средний чек ${M(a.totals.avgCheck)}.`,
        `${M(a.totals.revenue)} over the period, ${num(a.totals.completed)} sessions${ds}. Average check ${M(a.totals.avgCheck)}.`,
        `Davr uchun ${M(a.totals.revenue)}, ${num(a.totals.completed)} ta seans${ds}. O‘rtacha chek ${M(a.totals.avgCheck)}.`,
      ),
      action: { label: L('Аналитика', 'Analytics', 'Tahlil'), page: 'analytics' },
    });
  }

  const loyal = a.totals.repeatShare >= 50;
  out.push({
    id: 'repeat', tone: loyal ? 'green' : 'sky', kind: L('Лояльность', 'Loyalty', 'Sodiqlik'), icon: <Repeat size={16} />,
    title: L(`${num(a.totals.repeatShare, 0)}% водителей заряжались больше одного раза`, `${num(a.totals.repeatShare, 0)}% of drivers charged more than once`, `Haydovchilarning ${num(a.totals.repeatShare, 0)}% bir martadan ko‘p zaryadlangan`),
    text: L(
      `${num(a.totals.uniqueUsers)} уникальных водителей за 30 дней. ${loyal ? 'Сеть удерживает клиентов.' : 'Бонус за вторую зарядку поможет превратить разовых клиентов в постоянных.'}`,
      `${num(a.totals.uniqueUsers)} unique drivers in 30 days. ${loyal ? 'The network keeps its customers.' : 'A second-charge bonus would turn one-off customers into regulars.'}`,
      `30 kunda ${num(a.totals.uniqueUsers)} ta noyob haydovchi. ${loyal ? 'Tarmoq mijozlarini ushlab turibdi.' : 'Ikkinchi zaryadlash uchun bonus bir martalik mijozlarni doimiyga aylantiradi.'}`,
    ),
    action: { label: L('Пользователи', 'Users', 'Foydalanuvchilar'), page: 'users' },
  });

  const order = { red: 0, amber: 1, sky: 2, green: 3 };
  return out.sort((x, y) => order[x.tone] - order[y.tone]);
}

const BORDER = { red: 'border-red-200', amber: 'border-amber-200', sky: 'border-sky-100', green: 'border-emerald-100' };
const ICON = { red: 'bg-red-50 text-red-500', amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600', green: 'bg-emerald-50 text-emerald-600' };

export default function AdminInsights({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { lang } = useI18n();
  const { data, error } = useAnalytics('admin', 30);
  if (!data) return <Page title="Подсказки">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const insights = buildInsights(data, lang);
  const L = pick(lang);

  return (
    <Page title="Подсказки" subtitle="Правила по данным сети за 30 дней — каждая подсказка показывает, на каких цифрах она основана">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-no-translate>
        {insights.map(i => (
          <Card key={i.id} className={`border ${BORDER[i.tone]}`}>
            <div className="flex gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ICON[i.tone]}`}>{i.icon}</span>
              <div className="flex-1 min-w-0">
                <Pill tone={i.tone}>{i.kind}</Pill>
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
      <p className="flex items-center gap-2 text-xs text-slate-400" data-no-translate>
        <Lightbulb size={13} />
        {L(
          'Подсказки пересчитываются при каждой зарядке. Это правила, а не обученная модель — их легко проверить по цифрам на страницах аналитики.',
          'Insights are recalculated with every charge. They are rules, not a trained model — easy to check against the analytics pages.',
          'Tavsiyalar har bir zaryadlashda qayta hisoblanadi. Bu o‘qitilgan model emas, balki qoidalar — ularni tahlil sahifalaridagi raqamlar bilan tekshirish oson.',
        )}
      </p>
    </Page>
  );
}

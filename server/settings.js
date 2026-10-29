/**
 * Every business number and switch of the platform, in one place the admin
 * edits at run time: what each feature costs, gives and limits, and whether
 * drivers see it at all. Modules read values with setting(key) at the moment
 * they need them, so a change applies to the next request — no redeploy.
 *
 * A value comes from the admin's change, else the environment (the old
 * env names keep working), else the default here. Each change is logged
 * with who made it and the value before.
 */
import { db } from './db.js';

const n = (name, fallback) => (process.env[name] !== undefined && process.env[name] !== '' ? Number(process.env[name]) : fallback);

/** type: bool | int | money | percent | tiers. min/max bound numbers; unit is shown next to the field. */
export const SCHEMA = [
  // What drivers see
  { key: 'feature.offline', group: 'features', label: 'Офлайн-трассы', hint: 'Сохранение трассы для поездки без связи', type: 'bool', def: true },
  { key: 'feature.navigator', group: 'features', label: 'Навигатор', hint: 'Маршрут с голосом и камерами внутри приложения', type: 'bool', def: true },
  { key: 'feature.battery', group: 'features', label: 'Здоровье батареи', hint: 'Ёмкость по данным станций, отчёт для продажи', type: 'bool', def: true },
  { key: 'feature.arrival', group: 'features', label: '«Будет ли свободно, когда доеду»', hint: 'Шанс свободной точки к приезду и станции рядом', type: 'bool', def: true },
  { key: 'feature.places', group: 'features', label: '«Пока заряжаетесь»', hint: 'Места рядом со станцией и предложения партнёров', type: 'bool', def: true },
  { key: 'feature.rewards', group: 'features', label: 'Награды и бонусы', hint: 'Новые бонусы не начисляются; уже начисленные тратятся до срока', type: 'bool', def: true },
  { key: 'feature.plus', group: 'features', label: 'PowerGo Plus', hint: 'Выключено — новые подписки и продления не принимаются, оплаченные месяцы действуют', type: 'bool', def: true },
  { key: 'feature.autocharge', group: 'features', label: 'Autocharge', hint: 'Запуск по ID машины на станциях OCPP', type: 'bool', def: true },
  { key: 'feature.liveNotice', group: 'features', label: 'Зарядка на экране блокировки', hint: 'Push-уведомление, которое обновляется во время зарядки', type: 'bool', def: true },
  { key: 'feature.bookings', group: 'features', label: 'Бронь разъёма', type: 'bool', def: true },
  { key: 'feature.queue', group: 'features', label: 'Очередь на станции', type: 'bool', def: true },
  { key: 'feature.sos', group: 'features', label: 'SOS водителю', hint: 'Кнопка помощи на карте', type: 'bool', def: true },

  // First launch: what a new driver goes through before and after signing in
  { key: 'onboarding.intro', group: 'onboarding', label: 'Знакомство при первом запуске', hint: 'Три экрана о том, что умеет приложение', type: 'bool', def: true },
  { key: 'onboarding.askLocation', group: 'onboarding', label: 'Просить доступ к геолокации', hint: 'Отдельный экран с объяснением, зачем она нужна', type: 'bool', def: true },
  { key: 'onboarding.askPush', group: 'onboarding', label: 'Просить разрешение на уведомления', type: 'bool', def: true },
  { key: 'onboarding.tour', group: 'onboarding', label: 'Обучение после первого входа', hint: 'Подсказки поверх карты: баланс, поиск, QR, разделы', type: 'bool', def: true },
  { key: 'legal.consentVersion', group: 'onboarding', label: 'Версия пользовательского согласия', hint: 'Увеличьте после изменения документа — каждый водитель примет его заново при следующем открытии', type: 'int', def: 1, min: 1, max: 1000 },

  // Bonuses and rewards (PowerGo pays them)
  { key: 'rewards.carBonus', group: 'rewards', label: 'Бонус за данные автомобиля', type: 'money', def: n('CAR_BONUS_UZS', 100_000), min: 0, max: 1_000_000, unit: 'сум' },
  { key: 'rewards.bonusDays', group: 'rewards', label: 'Срок жизни бонуса', type: 'int', def: n('BONUS_DAYS', 60), min: 1, max: 365, unit: 'дней' },
  { key: 'rewards.monthBudget', group: 'rewards', label: 'Бюджет наград в месяц', hint: 'Сверх него награды в этом месяце не начисляются', type: 'money', def: n('REWARDS_MONTH_BUDGET_UZS', 50_000_000), min: 0, max: 10_000_000_000, unit: 'сум' },
  ...[
    ['first', 'Первая зарядка', 20_000, 1, 'зарядка от 5 кВт·ч'],
    ['night', 'Ночная сова', 15_000, 5, 'ночных зарядок'],
    ['networks', 'Без границ', 25_000, 3, 'разных сетей'],
    ['cities', 'Путешественник', 30_000, 3, 'разных городов'],
    ['rater', 'Честный отзыв', 10_000, 5, 'оценок'],
    ['ten', 'Свой человек', 30_000, 10, 'зарядок'],
    ['kwh500', 'Много кВт·ч', 50_000, 500, 'кВт·ч'],
  ].flatMap(([id, label, amount, goal, unit]) => [
    { key: `rewards.${id}.on`, group: 'rewards', label: `«${label}» — включена`, type: 'bool', def: true },
    { key: `rewards.${id}.amount`, group: 'rewards', label: `«${label}» — бонус`, type: 'money', def: amount, min: 0, max: 1_000_000, unit: 'сум' },
    ...(goal > 1 ? [{ key: `rewards.${id}.goal`, group: 'rewards', label: `«${label}» — сколько нужно`, type: 'int', def: goal, min: 1, max: 100_000, unit }] : []),
  ]),
  { key: 'points.valueUzs', group: 'rewards', label: 'Стоимость одного балла', hint: 'При обмене баллов на кошелёк', type: 'money', def: 10, min: 0, max: 1000, unit: 'сум' },

  // PowerGo Plus
  { key: 'plus.price', group: 'plus', label: 'Цена подписки', type: 'money', def: n('PLUS_PRICE_UZS', 49_000), min: 0, max: 10_000_000, unit: 'сум' },
  { key: 'plus.days', group: 'plus', label: 'Период подписки', type: 'int', def: 30, min: 1, max: 366, unit: 'дней' },
  { key: 'plus.discount', group: 'plus', label: 'Скидка на зарядку', hint: 'Её платит PowerGo, сеть получает полную цену', type: 'percent', def: n('PLUS_DISCOUNT_PCT', 5), min: 0, max: 50, unit: '%' },

  // Fleets
  { key: 'fleet.tiers', group: 'fleet', label: 'Скидка тарифа для такси по объёму', hint: 'От скольких кВт·ч за 30 дней — какая скидка', type: 'tiers', def: [{ kwh: 0, pct: 3 }, { kwh: 500, pct: 5 }, { kwh: 2000, pct: 8 }, { kwh: 5000, pct: 10 }] },

  // Charging, bookings, queue
  { key: 'charge.minPrepaidKwh', group: 'charging', label: 'Минимум на балансе для старта', hint: 'Сколько кВт·ч по цене разъёма должно быть на счёте', type: 'int', def: 5, min: 0, max: 100, unit: 'кВт·ч' },
  { key: 'booking.fee', group: 'charging', label: 'Плата за бронь', type: 'money', def: 2000, min: 0, max: 500_000, unit: 'сум' },
  { key: 'booking.graceMin', group: 'charging', label: 'Бронь держится после начала', type: 'int', def: 15, min: 1, max: 120, unit: 'мин' },
  { key: 'booking.leadMin', group: 'charging', label: 'Разъём придерживается до начала брони', hint: 'Другие водители не могут занять его за это время', type: 'int', def: 10, min: 0, max: 240, unit: 'мин' },
  { key: 'booking.horizonHours', group: 'charging', label: 'Бронь не дальше чем на', type: 'int', def: 24, min: 1, max: 24 * 14, unit: 'ч' },
  { key: 'queue.holdMin', group: 'charging', label: 'Очередь держит освободившийся разъём', type: 'int', def: 5, min: 1, max: 60, unit: 'мин' },
  { key: 'issue.cooldownMin', group: 'charging', label: 'Пауза между жалобами на одну станцию', hint: 'От одного водителя', type: 'int', def: 10, min: 0, max: 24 * 60, unit: 'мин' },
  { key: 'arrival.maxChance', group: 'charging', label: 'Прогноз «свободно к приезду» не выше', type: 'percent', def: 97, min: 50, max: 100, unit: '%' },
  { key: 'live.stepPct', group: 'charging', label: 'Обновлять уведомление о зарядке каждые', type: 'int', def: 5, min: 1, max: 50, unit: '%' },
  { key: 'autocharge.windowMin', group: 'charging', label: 'Окно привязки Autocharge', type: 'int', def: 10, min: 1, max: 60, unit: 'мин' },

  // Money in
  { key: 'payments.payme', group: 'payments', label: 'Payme', type: 'bool', def: true },
  { key: 'payments.click', group: 'payments', label: 'Click', type: 'bool', def: true },
  { key: 'payments.uzum', group: 'payments', label: 'Uzum', type: 'bool', def: true },
  { key: 'payments.humo', group: 'payments', label: 'Humo', type: 'bool', def: true },
  { key: 'topup.min', group: 'payments', label: 'Минимальное пополнение', type: 'money', def: 1000, min: 100, max: 1_000_000, unit: 'сум' },
  { key: 'topup.max', group: 'payments', label: 'Максимальное пополнение', type: 'money', def: 10_000_000, min: 10_000, max: 100_000_000, unit: 'сум' },

  // Partners at stations
  { key: 'places.partnerRadiusM', group: 'partners', label: 'Партнёр виден у станций в радиусе', type: 'int', def: 1200, min: 100, max: 5000, unit: 'м' },
  { key: 'places.partnerPrice', group: 'partners', label: 'Цена показа для новых партнёров', type: 'money', def: 50, min: 0, max: 100_000, unit: 'сум' },
];
export const GROUPS = {
  features: 'Функции для водителей',
  rewards: 'Награды и бонусы',
  plus: 'PowerGo Plus',
  fleet: 'Автопарки и такси',
  charging: 'Зарядка, бронь, очередь',
  payments: 'Пополнение кошелька',
  partners: 'Партнёры у станций',
  onboarding: 'Первый запуск и согласие',
};

const byKey = new Map(SCHEMA.map(s => [s.key, s]));
const stored = () => (db.data.platformSettings ??= {});
const log = () => (db.data.settingsLog ??= []);

/** The value in force for a key. */
export function setting(key) {
  const s = byKey.get(key);
  if (!s) throw new Error(`unknown setting ${key}`);
  const v = stored()[key];
  return v === undefined ? s.def : v;
}
export const feature = name => setting(`feature.${name}`) === true;

/** Checks one value against its definition; returns the clean value or an error. */
function clean(s, v) {
  if (s.type === 'bool') return typeof v === 'boolean' ? { v } : { error: `${s.label}: да или нет` };
  if (s.type === 'tiers') {
    if (!Array.isArray(v) || !v.length || v.length > 8) return { error: `${s.label}: от 1 до 8 ступеней` };
    const tiers = v.map(t => ({ kwh: Math.round(Number(t?.kwh)), pct: Math.round(Number(t?.pct) * 10) / 10 })).sort((a, b) => a.kwh - b.kwh);
    if (tiers.some(t => !Number.isFinite(t.kwh) || t.kwh < 0 || !Number.isFinite(t.pct) || t.pct < 0 || t.pct > 50)) return { error: `${s.label}: кВт·ч от 0, скидка от 0 до 50%` };
    if (tiers[0].kwh !== 0) return { error: `${s.label}: первая ступень — с 0 кВт·ч` };
    if (new Set(tiers.map(t => t.kwh)).size !== tiers.length) return { error: `${s.label}: ступени не должны повторяться` };
    return { v: tiers };
  }
  const num = Number(v);
  if (!Number.isFinite(num)) return { error: `${s.label}: нужно число` };
  const val = s.type === 'percent' ? Math.round(num * 10) / 10 : Math.round(num);
  if (val < s.min || val > s.max) return { error: `${s.label}: от ${s.min.toLocaleString('ru-RU')} до ${s.max.toLocaleString('ru-RU')}${s.unit ? ` ${s.unit}` : ''}` };
  return { v: val };
}

/** Applies a set of changes all or nothing. Returns what changed, or the first error. */
export function updateSettings(changes, actor) {
  const entries = Object.entries(changes ?? {});
  if (!entries.length) return { error: 'Нет изменений' };
  const next = [];
  for (const [key, raw] of entries) {
    const s = byKey.get(key);
    if (!s) return { error: `Неизвестная настройка ${key}` };
    const r = raw === null ? { v: undefined } : clean(s, raw);
    if (r.error) return { error: r.error };
    next.push([s, r.v]);
  }
  // Min above max would lock every top-up out.
  const after = key => {
    const hit = next.find(([s]) => s.key === key);
    return hit ? (hit[1] === undefined ? byKey.get(key).def : hit[1]) : setting(key);
  };
  if (after('topup.min') > after('topup.max')) return { error: 'Минимальное пополнение больше максимального' };
  const at = new Date().toISOString();
  const changed = [];
  for (const [s, v] of next) {
    const before = setting(s.key);
    if (JSON.stringify(before) === JSON.stringify(v ?? s.def)) continue;
    if (v === undefined) delete stored()[s.key];
    else stored()[s.key] = v;
    const entry = { key: s.key, label: s.label, from: before, to: v ?? s.def, by: actor?.name ?? 'Платформа', at };
    log().unshift(entry);
    changed.push(entry);
  }
  if (log().length > 500) log().length = 500;
  db.save();
  return { changed };
}

/** The admin's view: every setting with its value, default and whether it was changed. */
export function settingsView() {
  return {
    groups: GROUPS,
    items: SCHEMA.map(s => ({ ...s, value: setting(s.key), changed: stored()[s.key] !== undefined })),
    log: log().slice(0, 60),
  };
}

/** What every app needs to know to show the right things: features on, prices, limits. */
export function publicSettings() {
  return {
    features: Object.fromEntries(SCHEMA.filter(s => s.key.startsWith('feature.')).map(s => [s.key.slice(8), setting(s.key)])),
    booking: { fee: setting('booking.fee'), graceMin: setting('booking.graceMin') },
    topup: { min: setting('topup.min'), max: setting('topup.max'), providers: ['payme', 'click', 'uzum', 'humo'].filter(p => setting(`payments.${p}`)) },
    queueHoldMin: setting('queue.holdMin'),
    minPrepaidKwh: setting('charge.minPrepaidKwh'),
    onboarding: {
      intro: setting('onboarding.intro'),
      askLocation: setting('onboarding.askLocation'),
      askPush: setting('onboarding.askPush'),
      tour: setting('onboarding.tour'),
      consentVersion: setting('legal.consentVersion'),
    },
  };
}

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'ru' | 'uz' | 'en';

export const LANGS: { id: Lang; label: string; full: string }[] = [
  { id: 'uz', label: 'UZ', full: "O'zbekcha" },
  { id: 'ru', label: 'RU', full: 'Русский' },
  { id: 'en', label: 'EN', full: 'English' },
];

/**
 * Translation table.
 *
 * Russian is the source language and the fallback: the dashboards carry
 * thousands of strings that are not translated yet, so a missing key must
 * degrade to readable Russian rather than to a raw key name.
 */
const DICT = {
  // ── Shell / landing ──
  'nav.portals': { ru: 'Все порталы', uz: 'Barcha portallar', en: 'All portals' },
  'nav.live': { ru: 'Live', uz: 'Live', en: 'Live' },
  'nav.dark': { ru: 'Тёмная', uz: 'Tungi', en: 'Dark' },
  'nav.light': { ru: 'Светлая', uz: 'Kunduzgi', en: 'Light' },

  'hero.badge': {
    ru: 'Национальная eMobility-платформа · Узбекистан · 2026',
    uz: 'Milliy eMobility platformasi · O‘zbekiston · 2026',
    en: 'National eMobility platform · Uzbekistan · 2026',
  },
  'hero.line1': { ru: 'Одно приложение.', uz: 'Bitta ilova.', en: 'One app.' },
  'hero.line2': {
    ru: 'Любая зарядная станция.',
    uz: 'Istalgan zaryadlash stansiyasi.',
    en: 'Every charging station.',
  },
  'hero.sub': {
    ru: 'Единая экосистема зарядки ЭВ в Узбекистане —',
    uz: 'O‘zbekistondagi yagona EV zaryadlash ekotizimi —',
    en: 'A single EV charging ecosystem for Uzbekistan —',
  },
  'hero.stats': {
    ru: '108 станций · 276 EVSE · 4 оператора · 14 000+ водителей',
    uz: '108 stansiya · 276 EVSE · 4 operator · 14 000+ haydovchi',
    en: '108 stations · 276 EVSE · 4 operators · 14,000+ drivers',
  },

  'ticker.sessions': { ru: 'сессий сегодня', uz: 'bugungi seanslar', en: 'sessions today' },
  'ticker.kwh': { ru: 'кВт·ч сегодня', uz: 'bugun kVt·s', en: 'kWh today' },
  'ticker.online': { ru: 'EVSE онлайн', uz: 'EVSE onlayn', en: 'EVSE online' },
  'ticker.revenue': { ru: 'выручка, млн сум', uz: 'daromad, mln so‘m', en: 'revenue, M UZS' },

  'section.choose': { ru: 'Выберите портал', uz: 'Portalni tanlang', en: 'Choose a portal' },
  'cta.openDemo': { ru: 'Открыть демо', uz: 'Demoni ochish', en: 'Open demo' },
  'cta.compare': { ru: 'Сравнить порталы', uz: 'Portallarni solishtirish', en: 'Compare portals' },

  // ── Portal cards ──
  'portal.driver.sub': { ru: 'Мобильное приложение', uz: 'Mobil ilova', en: 'Mobile app' },
  'portal.driver.desc': {
    ru: 'Карта, зарядка, история, AI-планировщик маршрутов, оплата через Humo / Uzcard.',
    uz: 'Xarita, zaryadlash, tarix, AI marshrut rejalashtiruvchi, Humo / Uzcard orqali to‘lov.',
    en: 'Map, charging, history, AI trip planner, payment via Humo / Uzcard.',
  },
  'portal.operator.sub': { ru: 'Кабинет оператора', uz: 'Operator kabineti', en: 'Operator console' },
  'portal.operator.desc': {
    ru: 'Управление станциями, тарифами, финансами, Settlement D+2, OCPI/OCPP.',
    uz: 'Stansiyalar, tariflar, moliya, Settlement D+2, OCPI/OCPP boshqaruvi.',
    en: 'Manage stations, tariffs, finance, D+2 settlement, OCPI/OCPP.',
  },
  'portal.admin.sub': { ru: 'Национальный мониторинг', uz: 'Milliy monitoring', en: 'National monitoring' },
  'portal.admin.desc': {
    ru: 'Live Map, AI Insights, Fraud ML, CDR Validation, Settlement, Роли & Права.',
    uz: 'Live Map, AI Insights, Fraud ML, CDR tekshiruvi, Settlement, rollar va huquqlar.',
    en: 'Live map, AI insights, fraud ML, CDR validation, settlement, roles & permissions.',
  },
  'portal.business.sub': { ru: 'Корпоративный кабинет', uz: 'Korporativ kabinet', en: 'Corporate console' },
  'portal.business.desc': {
    ru: 'Автопарк, сотрудники, лимиты, CDR-отчёты, IBAN-выплаты.',
    uz: 'Avtopark, xodimlar, limitlar, CDR hisobotlari, IBAN to‘lovlari.',
    en: 'Fleet, employees, limits, CDR reports, IBAN payouts.',
  },
  'portal.api.sub': { ru: 'Документация', uz: 'Hujjatlar', en: 'Documentation' },
  'portal.api.desc': {
    ru: 'REST API v1, OCPI 2.3.0, OAuth 2.0, Remote Start/Stop, CDR, Webhooks.',
    uz: 'REST API v1, OCPI 2.3.0, OAuth 2.0, Remote Start/Stop, CDR, Webhooks.',
    en: 'REST API v1, OCPI 2.3.0, OAuth 2.0, remote start/stop, CDR, webhooks.',
  },
  'portal.arch.label': { ru: 'Архитектура', uz: 'Arxitektura', en: 'Architecture' },
  'portal.arch.sub': { ru: 'Техническая схема', uz: 'Texnik sxema', en: 'Technical diagram' },
  'portal.arch.desc': {
    ru: 'Визуальная диаграмма всей экосистемы — 6 слоёв от Driver App до SmartGrid.',
    uz: 'Butun ekotizimning vizual diagrammasi — Driver App’dan SmartGrid’gacha 6 qatlam.',
    en: 'A visual diagram of the whole ecosystem — six layers from Driver App to SmartGrid.',
  },

  // ── Auth ──
  'auth.phone': { ru: 'Телефон', uz: 'Telefon', en: 'Phone' },
  'auth.login': { ru: 'Email / Логин', uz: 'Email / Login', en: 'Email / Login' },
  'auth.password': { ru: 'Пароль', uz: 'Parol', en: 'Password' },
  'auth.signIn': { ru: 'Войти', uz: 'Kirish', en: 'Sign in' },
  'auth.checking': { ru: 'Проверяем…', uz: 'Tekshirilmoqda…', en: 'Checking…' },
  'auth.demoAccess': { ru: 'Демо-доступ', uz: 'Demo kirish', en: 'Demo access' },
  'auth.fill': { ru: 'Заполнить', uz: 'To‘ldirish', en: 'Fill in' },
  'auth.filled': { ru: 'Подставлено', uz: 'Kiritildi', en: 'Filled' },
  'auth.ownAccount': {
    ru: 'У каждого портала собственная учётная запись и пароль',
    uz: 'Har bir portalning o‘z hisobi va paroli bor',
    en: 'Each portal has its own account and password',
  },
  'auth.failed': { ru: 'Не удалось войти', uz: 'Kirib bo‘lmadi', en: 'Could not sign in' },

  // ── Sync inspector ──
  'sync.title': { ru: 'Синхронизация', uz: 'Sinxronizatsiya', en: 'Sync' },
  'sync.live': { ru: 'LIVE', uz: 'LIVE', en: 'LIVE' },
  'sync.connecting': { ru: 'СВЯЗЬ…', uz: 'ULANMOQDA…', en: 'CONNECTING…' },
  'sync.offline': { ru: 'ОФФЛАЙН', uz: 'OFFLAYN', en: 'OFFLINE' },
  'sync.events': { ru: 'событий за сессию', uz: 'seansdagi hodisalar', en: 'events this session' },
  'sync.active': { ru: 'активных', uz: 'faol', en: 'active' },
  'sync.evseOnline': { ru: 'EVSE онлайн', uz: 'EVSE onlayn', en: 'EVSE online' },
  'sync.alerts': { ru: 'алертов', uz: 'ogohlantirish', en: 'alerts' },
  'sync.signedIn': { ru: 'Вошли:', uz: 'Kirganlar:', en: 'Signed in:' },
  'sync.nobody': { ru: 'никто', uz: 'hech kim', en: 'nobody' },
  'sync.empty': {
    ru: 'Пока тихо. Начните зарядку в Driver App или измените статус EVSE в кабинете оператора — событие появится здесь мгновенно во всех порталах.',
    uz: 'Hozircha jim. Driver App’da zaryadlashni boshlang yoki operator kabinetida EVSE holatini o‘zgartiring — hodisa barcha portallarda darhol paydo bo‘ladi.',
    en: 'Quiet so far. Start a charge in the Driver App or change an EVSE status in the operator console — the event shows up here instantly, in every portal.',
  },
  'sync.close': { ru: 'Закрыть', uz: 'Yopish', en: 'Close' },
  'sync.open': { ru: 'Открыть монитор синхронизации', uz: 'Sinxronizatsiya monitorini ochish', en: 'Open sync monitor' },

  // ── Split view ──
  'split.title': { ru: 'Демо синхронизации', uz: 'Sinxronizatsiya demosi', en: 'Sync demo' },
  'split.subtitle': { ru: 'Два портала · одна база данных', uz: 'Ikki portal · bitta baza', en: 'Two portals · one database' },
  'split.hint': {
    ru: 'Войдите в оба портала и начните зарядку слева — справа всё обновится само, без перезагрузки.',
    uz: 'Ikkala portalga kiring va chapda zaryadlashni boshlang — o‘ngda hammasi o‘zi yangilanadi.',
    en: 'Sign into both portals and start a charge on the left — the right updates itself, no reload.',
  },
  'split.swap': { ru: 'Поменять панели местами', uz: 'Panellarni almashtirish', en: 'Swap panes' },
  'split.close': { ru: 'Закрыть режим сравнения', uz: 'Solishtirish rejimini yopish', en: 'Close compare mode' },
  'split.eventsWord': { ru: 'событий', uz: 'hodisa', en: 'events' },

  // ── Command palette ──
  'cmd.placeholder': { ru: 'Куда перейти?', uz: 'Qayerga o‘tamiz?', en: 'Where to?' },
  'cmd.nothing': { ru: 'Ничего не найдено', uz: 'Hech narsa topilmadi', en: 'No matches' },
  'cmd.navigation': { ru: 'Навигация', uz: 'Navigatsiya', en: 'Navigation' },
  'cmd.portals': { ru: 'Порталы', uz: 'Portallar', en: 'Portals' },
  'cmd.actions': { ru: 'Действия', uz: 'Amallar', en: 'Actions' },
  'cmd.status': { ru: 'Статус', uz: 'Holat', en: 'Status' },
  'cmd.sessions': { ru: 'Сессии', uz: 'Seanslar', en: 'Sessions' },
  'cmd.select': { ru: 'выбор', uz: 'tanlash', en: 'select' },
  'cmd.open': { ru: 'открыть', uz: 'ochish', en: 'open' },
  'cmd.signOut': { ru: 'Выйти из', uz: 'Chiqish:', en: 'Sign out of' },
  'cmd.syncStatus': { ru: 'Синхронизация', uz: 'Sinxronizatsiya', en: 'Sync' },

  // ── Export ──
  'export.button': { ru: 'Экспорт', uz: 'Eksport', en: 'Export' },
  'export.done': { ru: 'Готово', uz: 'Tayyor', en: 'Done' },
  'export.error': { ru: 'Ошибка', uz: 'Xatolik', en: 'Failed' },
  'export.csv': { ru: 'CSV для Excel', uz: 'Excel uchun CSV', en: 'CSV for Excel' },
  'export.rows': { ru: 'строк', uz: 'qator', en: 'rows' },
  'export.pdf': { ru: 'PDF-отчёт', uz: 'PDF hisobot', en: 'PDF report' },
  'export.pdfHint': { ru: 'A4, альбомная', uz: 'A4, albom', en: 'A4, landscape' },
  'export.building': { ru: 'Формируем…', uz: 'Tayyorlanmoqda…', en: 'Building…' },
} satisfies Record<string, Record<Lang, string>>;

export type TKey = keyof typeof DICT;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readLang(): Lang {
  try {
    const stored = localStorage.getItem('oc-lang');
    if (stored === 'ru' || stored === 'uz' || stored === 'en') return stored;
    const nav = navigator.language.slice(0, 2).toLowerCase();
    if (nav === 'uz') return 'uz';
    if (nav === 'en') return 'en';
  } catch {
    /* fall through to the default */
  }
  return 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Keeps split-view iframes and other tabs of this app in the same language.
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ lang: Lang }>).detail?.lang;
      if (next) setLangState(next);
    };
    window.addEventListener('oc-lang-change', onChange);
    return () => window.removeEventListener('oc-lang-change', onChange);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem('oc-lang', next);
    } catch {
      /* private mode — the change still applies to this session */
    }
    window.dispatchEvent(new CustomEvent('oc-lang-change', { detail: { lang: next } }));
  }, []);

  const t = useCallback(
    (key: TKey) => {
      const entry = DICT[key] as Record<Lang, string> | undefined;
      // Russian is the source text, so it is the safest fallback.
      return entry?.[lang] ?? entry?.ru ?? String(key);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  // Components rendered outside the provider still need to render something.
  if (!ctx) {
    return {
      lang: 'ru',
      setLang: () => {},
      t: (key: TKey) => (DICT[key] as Record<Lang, string> | undefined)?.ru ?? String(key),
    };
  }
  return ctx;
}

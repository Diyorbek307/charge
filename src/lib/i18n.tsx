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
  'export.history': { ru: 'Последние выгрузки', uz: 'So‘nggi eksportlar', en: 'Recent exports' },

  // ── Dashboard navigation (shared across the three consoles) ──
  'nav.group.overview': { ru: 'Обзор', uz: 'Umumiy', en: 'Overview' },
  'nav.group.operations': { ru: 'Операции', uz: 'Operatsiyalar', en: 'Operations' },
  'nav.group.finance': { ru: 'Финансы', uz: 'Moliya', en: 'Finance' },
  'nav.group.financeReports': { ru: 'Финансы & Отчёты', uz: 'Moliya va hisobotlar', en: 'Finance & reports' },
  'nav.group.analyticsAi': { ru: 'Аналитика & AI', uz: 'Tahlil va AI', en: 'Analytics & AI' },
  'nav.group.system': { ru: 'Система', uz: 'Tizim', en: 'System' },
  'nav.group.clientsSystem': { ru: 'Клиенты & Система', uz: 'Mijozlar va tizim', en: 'Clients & system' },

  'nav.dashboard': { ru: 'Дашборд', uz: 'Boshqaruv paneli', en: 'Dashboard' },
  'nav.stations': { ru: 'Станции', uz: 'Stansiyalar', en: 'Stations' },
  'nav.sessions': { ru: 'Сессии', uz: 'Seanslar', en: 'Sessions' },
  'nav.alerts': { ru: 'Оповещения', uz: 'Ogohlantirishlar', en: 'Alerts' },
  'nav.tariffs': { ru: 'Тарифы', uz: 'Tariflar', en: 'Tariffs' },
  'nav.finance': { ru: 'Финансы', uz: 'Moliya', en: 'Finance' },
  'nav.clients': { ru: 'Клиенты', uz: 'Mijozlar', en: 'Clients' },
  'nav.integration': { ru: 'Интеграция', uz: 'Integratsiya', en: 'Integration' },
  'nav.settings': { ru: 'Настройки', uz: 'Sozlamalar', en: 'Settings' },
  'nav.help': { ru: 'Помощь', uz: 'Yordam', en: 'Help' },
  'nav.operators': { ru: 'Операторы', uz: 'Operatorlar', en: 'Operators' },
  'nav.users': { ru: 'Пользователи', uz: 'Foydalanuvchilar', en: 'Users' },
  'nav.payments': { ru: 'Платежи', uz: 'To‘lovlar', en: 'Payments' },
  'nav.commissions': { ru: 'Комиссии', uz: 'Komissiyalar', en: 'Commissions' },
  'nav.networkTariffs': { ru: 'Тарифы сети', uz: 'Tarmoq tariflari', en: 'Network tariffs' },
  'nav.analytics': { ru: 'Аналитика', uz: 'Tahlil', en: 'Analytics' },
  'nav.roles': { ru: 'Роли & Права', uz: 'Rollar va huquqlar', en: 'Roles & permissions' },
  'nav.fleet': { ru: 'Автопарк', uz: 'Avtopark', en: 'Fleet' },
  'nav.employees': { ru: 'Сотрудники', uz: 'Xodimlar', en: 'Employees' },
  'nav.expenses': { ru: 'Расходы', uz: 'Xarajatlar', en: 'Expenses' },
  'nav.reports': { ru: 'Отчёты', uz: 'Hisobotlar', en: 'Reports' },
  'nav.signOutPortal': { ru: 'Выйти из портала', uz: 'Portaldan chiqish', en: 'Sign out of portal' },
  'nav.themeDark': { ru: 'Тёмная тема', uz: 'Tungi mavzu', en: 'Dark theme' },
  'nav.themeLight': { ru: 'Светлая тема', uz: 'Kunduzgi mavzu', en: 'Light theme' },

  // ── Common dashboard labels ──
  'lbl.total': { ru: 'Всего', uz: 'Jami', en: 'Total' },
  'lbl.active': { ru: 'Активные', uz: 'Faol', en: 'Active' },
  'lbl.activeCount': { ru: 'Активных', uz: 'Faol', en: 'Active' },
  'lbl.completed': { ru: 'Завершённых', uz: 'Yakunlangan', en: 'Completed' },
  'lbl.failed': { ru: 'Ошибок', uz: 'Xatolar', en: 'Failed' },
  'lbl.errors': { ru: 'Ошибки', uz: 'Xatolar', en: 'Errors' },
  'lbl.totalKwh': { ru: 'Итого кВт·ч', uz: 'Jami kVt·s', en: 'Total kWh' },
  'lbl.energy': { ru: 'Энергия', uz: 'Energiya', en: 'Energy' },
  'lbl.cost': { ru: 'Стоимость', uz: 'Narxi', en: 'Cost' },
  'lbl.user': { ru: 'Пользователь', uz: 'Foydalanuvchi', en: 'User' },
  'lbl.driver': { ru: 'Водитель', uz: 'Haydovchi', en: 'Driver' },
  'lbl.plate': { ru: 'Гос. номер', uz: 'Davlat raqami', en: 'Plate' },
  'lbl.connection': { ru: 'Подключение', uz: 'Ulanish', en: 'Connection' },
  'lbl.chargeStart': { ru: 'Начало зарядки', uz: 'Zaryad boshlanishi', en: 'Charge start' },
  'lbl.chargeEnd': { ru: 'Завершение', uz: 'Yakunlanishi', en: 'Charge end' },
  'lbl.vehicles': { ru: 'Автомобилей', uz: 'Avtomobillar', en: 'Vehicles' },
  'lbl.employeesCount': { ru: 'Сотрудников', uz: 'Xodimlar', en: 'Employees' },
  'lbl.spent': { ru: 'Потрачено', uz: 'Sarflandi', en: 'Spent' },
  'lbl.remaining': { ru: 'Остаток', uz: 'Qoldiq', en: 'Remaining' },
  'lbl.forecast': { ru: 'Прогноз', uz: 'Prognoz', en: 'Forecast' },
  'lbl.chargingNow': { ru: 'Заряжается сейчас', uz: 'Hozir zaryadlanmoqda', en: 'Charging now' },
  'lbl.overLimit': { ru: 'Превысили лимит', uz: 'Limitdan oshgan', en: 'Over limit' },

  // ── Dashboard page headings ──
  'page.stations': { ru: 'Станции', uz: 'Stansiyalar', en: 'Stations' },
  'page.sessions': { ru: 'Сессии', uz: 'Seanslar', en: 'Sessions' },
  'page.allSessions': { ru: 'Все сессии', uz: 'Barcha seanslar', en: 'All sessions' },
  'page.alerts': { ru: 'Оповещения', uz: 'Ogohlantirishlar', en: 'Alerts' },
  'page.tariffs': { ru: 'Управление тарифами', uz: 'Tariflarni boshqarish', en: 'Tariff management' },
  'page.finance': { ru: 'Финансы и расчёты', uz: 'Moliya va hisob-kitoblar', en: 'Finance & settlements' },
  'page.clients': { ru: 'Клиенты', uz: 'Mijozlar', en: 'Clients' },
  'page.integration': { ru: 'Интеграция', uz: 'Integratsiya', en: 'Integration' },
  'page.settingsApi': { ru: 'Настройки и API', uz: 'Sozlamalar va API', en: 'Settings & API' },
  'page.help': { ru: 'Помощь и поддержка', uz: 'Yordam va qo‘llab-quvvatlash', en: 'Help & support' },
  'page.nationalOverview': { ru: 'Национальный обзор', uz: 'Milliy ko‘rinish', en: 'National overview' },
  'page.operators': { ru: 'Операторы', uz: 'Operatorlar', en: 'Operators' },
  'page.users': { ru: 'Пользователи', uz: 'Foydalanuvchilar', en: 'Users' },
  'page.paymentCenter': { ru: 'Платёжный центр', uz: 'To‘lov markazi', en: 'Payment centre' },
  'page.commissions': { ru: 'Управление комиссиями', uz: 'Komissiyalarni boshqarish', en: 'Commission management' },
  'page.networkTariffs': { ru: 'Тарифы сети', uz: 'Tarmoq tariflari', en: 'Network tariffs' },
  'page.analytics': { ru: 'Аналитика', uz: 'Tahlil', en: 'Analytics' },
  'page.settings': { ru: 'Настройки', uz: 'Sozlamalar', en: 'Settings' },
  'page.fleet': { ru: 'Автопарк', uz: 'Avtopark', en: 'Fleet' },
  'page.employees': { ru: 'Сотрудники', uz: 'Xodimlar', en: 'Employees' },
  'page.chargingCosts': { ru: 'Расходы на зарядку', uz: 'Zaryadlash xarajatlari', en: 'Charging costs' },
  'page.reports': { ru: 'Отчёты', uz: 'Hisobotlar', en: 'Reports' },
  'page.accountSettings': { ru: 'Настройки аккаунта', uz: 'Hisob sozlamalari', en: 'Account settings' },

  // ── Table headers (shared across the dashboards) ──
  'th.action': { ru: 'Действие', uz: 'Amal', en: 'Action' },
  'th.amount': { ru: 'Сумма', uz: 'Summa', en: 'Amount' },
  'th.car': { ru: 'Авто', uz: 'Avto', en: 'Vehicle' },
  'th.changed': { ru: 'Изменено', uz: 'O‘zgartirilgan', en: 'Changed' },
  'th.city': { ru: 'Город', uz: 'Shahar', en: 'City' },
  'th.client': { ru: 'Клиент', uz: 'Mijoz', en: 'Client' },
  'th.commission': { ru: 'Комиссия', uz: 'Komissiya', en: 'Commission' },
  'th.commissionPct': { ru: 'Комиссия %', uz: 'Komissiya %', en: 'Commission %' },
  'th.connected': { ru: 'Подключено', uz: 'Ulangan', en: 'Connected' },
  'th.cost': { ru: 'Стоимость', uz: 'Narxi', en: 'Cost' },
  'th.date': { ru: 'Дата', uz: 'Sana', en: 'Date' },
  'th.dcNight': { ru: 'DC Ночной', uz: 'DC Tungi', en: 'DC Night' },
  'th.department': { ru: 'Отдел', uz: 'Bo‘lim', en: 'Department' },
  'th.driver': { ru: 'Водитель', uz: 'Haydovchi', en: 'Driver' },
  'th.employee': { ru: 'Сотрудник', uz: 'Xodim', en: 'Employee' },
  'th.end': { ru: 'Конец', uz: 'Tugash', en: 'End' },
  'th.energy': { ru: 'Энергия', uz: 'Energiya', en: 'Energy' },
  'th.expenses': { ru: 'Расходы', uz: 'Xarajatlar', en: 'Expenses' },
  'th.growth': { ru: 'Рост', uz: 'O‘sish', en: 'Growth' },
  'th.integration': { ru: 'Интеграция', uz: 'Integratsiya', en: 'Integration' },
  'th.invoice': { ru: 'Инвойс', uz: 'Hisob-faktura', en: 'Invoice' },
  'th.invoiced': { ru: 'Выставлено', uz: 'Hisob qo‘yilgan', en: 'Invoiced' },
  'th.kwh': { ru: 'кВт·ч', uz: 'kVt·s', en: 'kWh' },
  'th.kwhK': { ru: 'кВт·ч (k)', uz: 'kVt·s (k)', en: 'kWh (k)' },
  'th.lastVisit': { ru: 'Последний визит', uz: 'Oxirgi tashrif', en: 'Last visit' },
  'th.limitUzs': { ru: 'Лимит (сум)', uz: 'Limit (so‘m)', en: 'Limit (UZS)' },
  'th.method': { ru: 'Метод', uz: 'Usul', en: 'Method' },
  'th.monthlyFee': { ru: 'Ежемес. комиссия', uz: 'Oylik komissiya', en: 'Monthly fee' },
  'th.name': { ru: 'Название', uz: 'Nomi', en: 'Name' },
  'th.operator': { ru: 'Оператор', uz: 'Operator', en: 'Operator' },
  'th.parking': { ru: 'Парковка', uz: 'Parkovka', en: 'Parking' },
  'th.payout': { ru: 'К выплате', uz: 'To‘lanadi', en: 'Payout' },
  'th.period': { ru: 'Период', uz: 'Davr', en: 'Period' },
  'th.phone': { ru: 'Телефон', uz: 'Telefon', en: 'Phone' },
  'th.power': { ru: 'Мощность', uz: 'Quvvat', en: 'Power' },
  'th.price': { ru: 'Цена', uz: 'Narx', en: 'Price' },
  'th.pricePerKwh': { ru: 'Цена кВт·ч', uz: 'kVt·s narxi', en: 'Price per kWh' },
  'th.rate': { ru: 'Ставка', uz: 'Stavka', en: 'Rate' },
  'th.rating': { ru: 'Рейтинг', uz: 'Reyting', en: 'Rating' },
  'th.region': { ru: 'Регион', uz: 'Hudud', en: 'Region' },
  'th.registered': { ru: 'Регистрация', uz: 'Ro‘yxatdan o‘tgan', en: 'Registered' },
  'th.revenue': { ru: 'Выручка', uz: 'Daromad', en: 'Revenue' },
  'th.revenueM': { ru: 'Выручка (M)', uz: 'Daromad (M)', en: 'Revenue (M)' },
  'th.session': { ru: 'Сессия', uz: 'Seans', en: 'Session' },
  'th.sessions': { ru: 'Сессии', uz: 'Seanslar', en: 'Sessions' },
  'th.sessionsPerMonth': { ru: 'Сессий / мес', uz: 'Seans / oy', en: 'Sessions / mo' },
  'th.settlement': { ru: 'Расчёт', uz: 'Hisob-kitob', en: 'Settlement' },
  'th.spend': { ru: 'Расход', uz: 'Sarf', en: 'Spend' },
  'th.start': { ru: 'Начало', uz: 'Boshlanish', en: 'Start' },
  'th.station': { ru: 'Станция', uz: 'Stansiya', en: 'Station' },
  'th.stationsCount': { ru: 'Станций', uz: 'Stansiyalar', en: 'Stations' },
  'th.status': { ru: 'Статус', uz: 'Holat', en: 'Status' },
  'th.time': { ru: 'Время', uz: 'Vaqt', en: 'Time' },
  'th.trend': { ru: 'Тренд', uz: 'Trend', en: 'Trend' },
  'th.type': { ru: 'Тип', uz: 'Turi', en: 'Type' },
  'th.uptime30': { ru: 'Uptime 30д', uz: 'Uptime 30k', en: 'Uptime 30d' },
  'th.usage': { ru: 'Использование', uz: 'Foydalanish', en: 'Usage' },
  'th.user': { ru: 'Пользователь', uz: 'Foydalanuvchi', en: 'User' },
  'th.utilisation': { ru: 'Загрузка', uz: 'Yuklama', en: 'Utilisation' },
  'th.vehicle': { ru: 'Автомобиль', uz: 'Avtomobil', en: 'Vehicle' },
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

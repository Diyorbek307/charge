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

  // ── Dashboard stat-card and form labels ──
  'lbl2.vehicles': { ru: 'Автомобилей', uz: 'Avtomobillar', en: 'Vehicles' },
  'lbl2.vehicle': { ru: 'Автомобиль', uz: 'Avtomobil', en: 'Vehicle' },
  'lbl2.active': { ru: 'Активные', uz: 'Faol', en: 'Active' },
  'lbl2.active2': { ru: 'Активных', uz: 'Faol', en: 'Active' },
  'lbl2.activeEvse': { ru: 'Активных EVSE', uz: 'Faol EVSE', en: 'Active EVSE' },
  'lbl2.activeRules': { ru: 'Активных правил', uz: 'Faol qoidalar', en: 'Active rules' },
  'lbl2.activeTariffs': { ru: 'Активных тарифов', uz: 'Faol tariflar', en: 'Active tariffs' },
  'lbl2.anomalousEnergy': { ru: 'Аномальная энергия', uz: 'Anomal energiya', en: 'Anomalous energy' },
  'lbl2.anomalousPayment': { ru: 'Аномальный платёж', uz: 'Anomal tolov', en: 'Anomalous payment' },
  'lbl2.bank': { ru: 'Банк', uz: 'Bank', en: 'Bank' },
  'lbl2.bankTransfer': { ru: 'Банковский перевод', uz: 'Bank otkazmasi', en: 'Bank transfer' },
  'lbl2.tokenBruteForce': { ru: 'Брутфорс токена', uz: 'Token brutfors', en: 'Token brute force' },
  'lbl2.budgetUsed': { ru: 'Бюджет исп.', uz: 'Byudjet ishlatildi', en: 'Budget used' },
  'lbl2.valid': { ru: 'Валидных', uz: 'Yaroqli', en: 'Valid' },
  'lbl2.grossRevenue': { ru: 'Валовая выручка', uz: 'Yalpi daromad', en: 'Gross revenue' },
  'lbl2.vendor': { ru: 'Вендор', uz: 'Vendor', en: 'Vendor' },
  'lbl2.verification': { ru: 'Верификация', uz: 'Tekshiruv', en: 'Verification' },
  'lbl2.version': { ru: 'Версия', uz: 'Versiya', en: 'Version' },
  'lbl2.driver': { ru: 'Водитель', uz: 'Haydovchi', en: 'Driver' },
  'lbl2.time': { ru: 'Время', uz: 'Vaqt', en: 'Time' },
  'lbl2.total': { ru: 'Всего', uz: 'Jami', en: 'Total' },
  'lbl2.totalCdr24h': { ru: 'Всего CDR (24ч)', uz: 'Jami CDR (24s)', en: 'Total CDR (24h)' },
  'lbl2.totalEvse': { ru: 'Всего EVSE', uz: 'Jami EVSE', en: 'Total EVSE' },
  'lbl2.totalOcpp': { ru: 'Всего OCPP', uz: 'Jami OCPP', en: 'Total OCPP' },
  'lbl2.totalVehicles': { ru: 'Всего авто', uz: 'Jami avtomobil', en: 'Total vehicles' },
  'lbl2.totalAccounts': { ru: 'Всего аккаунтов', uz: 'Jami hisoblar', en: 'Total accounts' },
  'lbl2.totalSpend': { ru: 'Всего расходов', uz: 'Jami xarajat', en: 'Total spend' },
  'lbl2.totalToday': { ru: 'Всего сегодня', uz: 'Bugun jami', en: 'Total today' },
  'lbl2.totalSessions': { ru: 'Всего сессий', uz: 'Jami seanslar', en: 'Total sessions' },
  'lbl2.totalSessionsSep': { ru: 'Всего сессий (сент.)', uz: 'Jami seanslar (sen.)', en: 'Total sessions (Sep)' },
  'lbl2.totalStations': { ru: 'Всего станций', uz: 'Jami stansiyalar', en: 'Total stations' },
  'lbl2.paidOut': { ru: 'Выплачено', uz: 'Tolangan', en: 'Paid out' },
  'lbl2.paidOutAug': { ru: 'Выплачено (авг)', uz: 'Tolangan (avg)', en: 'Paid out (Aug)' },
  'lbl2.revenueTotal': { ru: 'Выручка (total)', uz: 'Daromad (jami)', en: 'Revenue (total)' },
  'lbl2.revenueSep': { ru: 'Выручка (сент.)', uz: 'Daromad (sen.)', en: 'Revenue (Sep)' },
  'lbl2.revenueUzs': { ru: 'Выручка (сум)', uz: 'Daromad (som)', en: 'Revenue (UZS)' },
  'lbl2.grossRevenue2': { ru: 'Выручка брутто', uz: 'Yalpi daromad', en: 'Gross revenue' },
  'lbl2.revenueSep2': { ru: 'Выручка, сен', uz: 'Daromad, sen', en: 'Revenue, Sep' },
  'lbl2.highRisk': { ru: 'Высокий риск', uz: 'Yuqori xavf', en: 'High risk' },
  'lbl2.plate': { ru: 'Гос. номер', uz: 'Davlat raqami', en: 'Plate' },
  'lbl2.payoutDate': { ru: 'Дата выплаты', uz: 'Tolov sanasi', en: 'Payout date' },
  'lbl2.director': { ru: 'Директор', uz: 'Direktor', en: 'Director' },
  'lbl2.documentation': { ru: 'Документация', uz: 'Hujjatlar', en: 'Documentation' },
  'lbl2.monthlyReport': { ru: 'Ежемесячный отчёт', uz: 'Oylik hisobot', en: 'Monthly report' },
  'lbl2.blocked': { ru: 'Заблокированных', uz: 'Bloklangan', en: 'Blocked' },
  'lbl2.reserved': { ru: 'Забронировано', uz: 'Band qilingan', en: 'Reserved' },
  'lbl2.end': { ru: 'Завершение', uz: 'Yakunlanishi', en: 'End' },
  'lbl2.completed': { ru: 'Завершённых', uz: 'Yakunlangan', en: 'Completed' },
  'lbl2.occupied': { ru: 'Занято', uz: 'Band', en: 'Occupied' },
  'lbl2.chargeComplete': { ru: 'Зарядка завершена', uz: 'Zaryadlash yakunlandi', en: 'Charge complete' },
  'lbl2.chargesSep': { ru: 'Зарядок (сент.)', uz: 'Zaryadlar (sen.)', en: 'Charges (Sep)' },
  'lbl2.chargingNow': { ru: 'Заряжается сейчас', uz: 'Hozir zaryadlanmoqda', en: 'Charging now' },
  'lbl2.taxId': { ru: 'ИНН', uz: 'STIR', en: 'Tax ID' },
  'lbl2.ideas': { ru: 'Идеи', uz: 'Goyalar', en: 'Ideas' },
  'lbl2.consumed': { ru: 'Израсходовано', uz: 'Sarflandi', en: 'Consumed' },
  'lbl2.totalKwh': { ru: 'Итого кВт·ч', uz: 'Jami kVt·s', en: 'Total kWh' },
  'lbl2.payout': { ru: 'К выплате', uz: 'Tolanadi', en: 'Payout' },
  'lbl2.customerSince': { ru: 'Клиент с', uz: 'Mijoz', en: 'Customer since' },
  'lbl2.oneChargeCommissions': { ru: 'Комиссии ONE CHARGE', uz: 'ONE CHARGE komissiyalari', en: 'ONE CHARGE commissions' },
  'lbl2.commission': { ru: 'Комиссия', uz: 'Komissiya', en: 'Commission' },
  'lbl2.commission3': { ru: 'Комиссия (3%)', uz: 'Komissiya (3%)', en: 'Commission (3%)' },
  'lbl2.commissionAug': { ru: 'Комиссия (авг)', uz: 'Komissiya (avg)', en: 'Commission (Aug)' },
  'lbl2.oneChargeCommission': { ru: 'Комиссия ONE CHARGE', uz: 'ONE CHARGE komissiyasi', en: 'ONE CHARGE commission' },
  'lbl2.end2': { ru: 'Конец', uz: 'Tugash', en: 'End' },
  'lbl2.connectors': { ru: 'Коннекторов', uz: 'Konnektorlar', en: 'Connectors' },
  'lbl2.critical': { ru: 'Критических', uz: 'Kritik', en: 'Critical' },
  'lbl2.limit80': { ru: 'Лимит 80%', uz: 'Limit 80%', en: 'Limit 80%' },
  'lbl2.limit95': { ru: 'Лимит 95%', uz: 'Limit 95%', en: 'Limit 95%' },
  'lbl2.limitPerEmployee': { ru: 'Лимит на сотрудника', uz: 'Xodim uchun limit', en: 'Limit per employee' },
  'lbl2.locationsSynced': { ru: 'Локации синхр.', uz: 'Lokatsiyalar sinx.', en: 'Locations synced' },
  'lbl2.bankCode': { ru: 'МФО', uz: 'MFO', en: 'Bank code' },
  'lbl2.maxPower': { ru: 'Макс. мощность', uz: 'Maks. quvvat', en: 'Max power' },
  'lbl2.maxPricePerKwh': { ru: 'Макс. цена кВт·ч', uz: 'Maks. kVt·s narxi', en: 'Max price per kWh' },
  'lbl2.monthlyLimitPerVehicle': { ru: 'Месячный лимит на авто', uz: 'Avtomobil uchun oylik limit', en: 'Monthly limit per vehicle' },
  'lbl2.method': { ru: 'Метод', uz: 'Usul', en: 'Method' },
  'lbl2.minPricePerKwh': { ru: 'Мин. цена кВт·ч', uz: 'Min. kVt·s narxi', en: 'Min price per kWh' },
  'lbl2.model': { ru: 'Модель', uz: 'Model', en: 'Model' },
  'lbl2.name': { ru: 'Название', uz: 'Nomi', en: 'Name' },
  'lbl2.taxReport': { ru: 'Налоговый отчёт', uz: 'Soliq hisoboti', en: 'Tax report' },
  'lbl2.start': { ru: 'Начало', uz: 'Boshlanish', en: 'Start' },
  'lbl2.chargeStart': { ru: 'Начало зарядки', uz: 'Zaryad boshlanishi', en: 'Charge start' },
  'lbl2.unavailable': { ru: 'Недоступно', uz: 'Mavjud emas', en: 'Unavailable' },
  'lbl2.netPayout': { ru: 'Нетто к выплате', uz: 'Sof tolov', en: 'Net payout' },
  'lbl2.newOperators': { ru: 'Новые операторы', uz: 'Yangi operatorlar', en: 'New operators' },
  'lbl2.newEmployee': { ru: 'Новый сотрудник', uz: 'Yangi xodim', en: 'New employee' },
  'lbl2.newIn7Days': { ru: 'Новых за 7 дней', uz: '7 kunda yangi', en: 'New in 7 days' },
  'lbl2.activityCode': { ru: 'ОКЭД', uz: 'IFUT', en: 'Activity code' },
  'lbl2.overview': { ru: 'Обзор', uz: 'Umumiy', en: 'Overview' },
  'lbl2.processing': { ru: 'Обработка', uz: 'Ishlov berish', en: 'Processing' },
  'lbl2.training': { ru: 'Обучение', uz: 'Oqitish', en: 'Training' },
  'lbl2.totalRevenue': { ru: 'Общая выручка', uz: 'Umumiy daromad', en: 'Total revenue' },
  'lbl2.pending': { ru: 'Ожидает', uz: 'Kutilmoqda', en: 'Pending' },
  'lbl2.awaitingPayout': { ru: 'Ожидает выплаты', uz: 'Tolov kutilmoqda', en: 'Awaiting payout' },
  'lbl2.pending2': { ru: 'Ожидают', uz: 'Kutilmoqda', en: 'Pending' },
  'lbl2.operator': { ru: 'Оператор', uz: 'Operator', en: 'Operator' },
  'lbl2.operators': { ru: 'Операторы', uz: 'Operatorlar', en: 'Operators' },
  'lbl2.payment': { ru: 'Оплата', uz: 'Tolov', en: 'Payment' },
  'lbl2.remaining': { ru: 'Осталось', uz: 'Qoldi', en: 'Remaining' },
  'lbl2.balance': { ru: 'Остаток', uz: 'Qoldiq', en: 'Balance' },
  'lbl2.driverReport': { ru: 'Отчёт по водителям', uz: 'Haydovchilar hisoboti', en: 'Driver report' },
  'lbl2.fleetReport': { ru: 'Отчёт по флоту', uz: 'Avtopark hisoboti', en: 'Fleet report' },
  'lbl2.errors': { ru: 'Ошибки', uz: 'Xatolar', en: 'Errors' },
  'lbl2.errors2': { ru: 'Ошибок', uz: 'Xatolar', en: 'Errors' },
  'lbl2.errors24h': { ru: 'Ошибок (24ч)', uz: 'Xatolar (24s)', en: 'Errors (24h)' },
  'lbl2.failedSessions': { ru: 'Ошибочных сессий', uz: 'Xato seanslar', en: 'Failed sessions' },
  'lbl2.period': { ru: 'Период', uz: 'Davr', en: 'Period' },
  'lbl2.payments': { ru: 'Платежи', uz: 'Tolovlar', en: 'Payments' },
  'lbl2.paymentErrors': { ru: 'Платёжных ошибок', uz: 'Tolov xatolari', en: 'Payment errors' },
  'lbl2.byStation': { ru: 'По станциям', uz: 'Stansiyalar boyicha', en: 'By station' },
  'lbl2.repeatVisits': { ru: 'Повторных визитов', uz: 'Takroriy tashriflar', en: 'Repeat visits' },
  'lbl2.connection': { ru: 'Подключение', uz: 'Ulanish', en: 'Connection' },
  'lbl2.suspicious': { ru: 'Подозрительных', uz: 'Shubhali', en: 'Suspicious' },
  'lbl2.users': { ru: 'Пользователи', uz: 'Foydalanuvchilar', en: 'Users' },
  'lbl2.user': { ru: 'Пользователь', uz: 'Foydalanuvchi', en: 'User' },
  'lbl2.lastPayout': { ru: 'Последняя выплата', uz: 'Oxirgi tolov', en: 'Last payout' },
  'lbl2.lastSync': { ru: 'Последняя синхр.', uz: 'Oxirgi sinx.', en: 'Last sync' },
  'lbl2.spent': { ru: 'Потрачено', uz: 'Sarflandi', en: 'Spent' },
  'lbl2.overLimit': { ru: 'Превысили лимит', uz: 'Limitdan oshgan', en: 'Over limit' },
  'lbl2.forecast': { ru: 'Прогноз', uz: 'Prognoz', en: 'Forecast' },
  'lbl2.forecastNextMonth': { ru: 'Прогноз (след. мес)', uz: 'Prognoz (keyingi oy)', en: 'Forecast (next month)' },
  'lbl2.forecastToDec2026': { ru: 'Прогноз к Dec 2026', uz: 'Prognoz Dec 2026 ga', en: 'Forecast to Dec 2026' },
  'lbl2.connector': { ru: 'Разъем', uz: 'Konnektor', en: 'Connector' },
  'lbl2.connector2': { ru: 'Разъём', uz: 'Konnektor', en: 'Connector' },
  'lbl2.connectors2': { ru: 'Разъёмы', uz: 'Konnektorlar', en: 'Connectors' },
  'lbl2.expensesSep': { ru: 'Расходы (сент.)', uz: 'Xarajatlar (sen.)', en: 'Expenses (Sep)' },
  'lbl2.spendLimit': { ru: 'Расходы / лимит', uz: 'Xarajat / limit', en: 'Spend / limit' },
  'lbl2.discrepancies': { ru: 'Расхождений', uz: 'Nomuvofiqliklar', en: 'Discrepancies' },
  'lbl2.settlement': { ru: 'Расчёт', uz: 'Hisob-kitob', en: 'Settlement' },
  'lbl2.regions': { ru: 'Регионов', uz: 'Hududlar', en: 'Regions' },
  'lbl2.regions2': { ru: 'Регионы', uz: 'Hududlar', en: 'Regions' },
  'lbl2.registered': { ru: 'Регистрация', uz: 'Royxatdan otish', en: 'Registered' },
  'lbl2.openingHours': { ru: 'Режим работы', uz: 'Ish rejimi', en: 'Opening hours' },
  'lbl2.rating': { ru: 'Рейтинг', uz: 'Reyting', en: 'Rating' },
  'lbl2.bugReport': { ru: 'Репорт бага', uz: 'Xato haqida xabar', en: 'Bug report' },
  'lbl2.resolvedToday': { ru: 'Решено сегодня', uz: 'Bugun hal qilindi', en: 'Resolved today' },
  'lbl2.role': { ru: 'Роль', uz: 'Rol', en: 'Role' },
  'lbl2.growth': { ru: 'Рост', uz: 'Osish', en: 'Growth' },
  'lbl2.growthMM': { ru: 'Рост м/м', uz: 'Osish o/o', en: 'Growth m/m' },
  'lbl2.withUsSince': { ru: 'С нами с', uz: 'Biz bilan', en: 'With us since' },
  'lbl2.available': { ru: 'Свободно', uz: 'Bosh', en: 'Available' },
  'lbl2.sessions': { ru: 'Сессии', uz: 'Seanslar', en: 'Sessions' },
  'lbl2.sessionsPerMonth': { ru: 'Сессии в месяц', uz: 'Oyiga seanslar', en: 'Sessions per month' },
  'lbl2.sessions2': { ru: 'Сессий', uz: 'Seanslar', en: 'Sessions' },
  'lbl2.sessions24h': { ru: 'Сессий (24ч)', uz: 'Seanslar (24s)', en: 'Sessions (24h)' },
  'lbl2.sessionsTotal': { ru: 'Сессий (total)', uz: 'Seanslar (jami)', en: 'Sessions (total)' },
  'lbl2.sessionsTotal2': { ru: 'Сессий всего', uz: 'Jami seanslar', en: 'Sessions total' },
  'lbl2.session': { ru: 'Сессия', uz: 'Seans', en: 'Session' },
  'lbl2.system': { ru: 'Системные', uz: 'Tizimli', en: 'System' },
  'lbl2.nextD2': { ru: 'Следующий D+2', uz: 'Keyingi D+2', en: 'Next D+2' },
  'lbl2.nextSettlement': { ru: 'Следующий расчёт', uz: 'Keyingi hisob-kitob', en: 'Next settlement' },
  'lbl2.employees': { ru: 'Сотрудников', uz: 'Xodimlar', en: 'Employees' },
  'lbl2.avgRevenueEvse': { ru: 'Ср. выручка/EVSE', uz: 'Ort. daromad/EVSE', en: 'Avg revenue/EVSE' },
  'lbl2.avgKwhSession': { ru: 'Ср. кВт·ч/сессию', uz: 'Ort. kVt·s/seans', en: 'Avg kWh/session' },
  'lbl2.avgSession': { ru: 'Ср. сессия', uz: 'Ort. seans', en: 'Avg session' },
  'lbl2.avgCost': { ru: 'Ср. стоимость', uz: 'Ort. narx', en: 'Avg cost' },
  'lbl2.avgTicket': { ru: 'Ср. чек', uz: 'Ort. chek', en: 'Avg ticket' },
  'lbl2.weeklyAverage': { ru: 'Средн. за неделю', uz: 'Haftalik ortacha', en: 'Weekly average' },
  'lbl2.averageAc': { ru: 'Средний AC', uz: 'Ortacha AC', en: 'Average AC' },
  'lbl2.averageDcFast': { ru: 'Средний DC Fast', uz: 'Ortacha DC Fast', en: 'Average DC Fast' },
  'lbl2.averageRating': { ru: 'Средний рейтинг', uz: 'Ortacha reyting', en: 'Average rating' },
  'lbl2.mediumRisk': { ru: 'Средний риск', uz: 'Ortacha xavf', en: 'Medium risk' },
  'lbl2.averageTicket': { ru: 'Средний чек', uz: 'Ortacha chek', en: 'Average ticket' },
  'lbl2.stations': { ru: 'Станции', uz: 'Stansiyalar', en: 'Stations' },
  'lbl2.stations2': { ru: 'Станций', uz: 'Stansiyalar', en: 'Stations' },
  'lbl2.station': { ru: 'Станция', uz: 'Stansiya', en: 'Station' },
  'lbl2.status': { ru: 'Статус', uz: 'Holat', en: 'Status' },
  'lbl2.cost': { ru: 'Стоимость', uz: 'Narxi', en: 'Cost' },
  'lbl2.amount': { ru: 'Сумма', uz: 'Summa', en: 'Amount' },
  'lbl2.amount24h': { ru: 'Сумма (24ч)', uz: 'Summa (24s)', en: 'Amount (24h)' },
  'lbl2.invoice': { ru: 'Счёт на оплату', uz: 'Tolov hisobi', en: 'Invoice' },
  'lbl2.tariff': { ru: 'Тариф', uz: 'Tarif', en: 'Tariff' },
  'lbl2.tariffsSynced': { ru: 'Тарифы синхр.', uz: 'Tariflar sinx.', en: 'Tariffs synced' },
  'lbl2.phone': { ru: 'Телефон', uz: 'Telefon', en: 'Phone' },
  'lbl2.integrationType': { ru: 'Тип интеграции', uz: 'Integratsiya turi', en: 'Integration type' },
  'lbl2.connectorType': { ru: 'Тип разъемов', uz: 'Konnektor turi', en: 'Connector type' },
  'lbl2.topBySpend': { ru: 'Топ по расходам', uz: 'Xarajat boyicha top', en: 'Top by spend' },
  'lbl2.transaction': { ru: 'Транзакция', uz: 'Tranzaksiya', en: 'Transaction' },
  'lbl2.notifyAt': { ru: 'Уведомление при', uz: 'Ogohlantirish', en: 'Notify at' },
  'lbl2.uniqueCustomers': { ru: 'Уникальных клиентов', uz: 'Noyob mijozlar', en: 'Unique customers' },
  'lbl2.services': { ru: 'Услуги', uz: 'Xizmatlar', en: 'Services' },
  'lbl2.successful24h': { ru: 'Успешных (24ч)', uz: 'Muvaffaqiyatli (24s)', en: 'Successful (24h)' },
  'lbl2.netPayout2': { ru: 'Чистая выплата', uz: 'Sof tolov', en: 'Net payout' },
  'lbl2.energy': { ru: 'Энергия', uz: 'Energiya', en: 'Energy' },
  'lbl2.legalAddress': { ru: 'Юр. адрес', uz: 'Yuridik manzil', en: 'Legal address' },
  'lbl2.totalKwh2': { ru: 'кВт·ч всего', uz: 'Jami kVt·s', en: 'Total kWh' },
  'lbl2.kwhThisWeek': { ru: 'кВт·ч за неделю', uz: 'Haftalik kVt·s', en: 'kWh this week' },
  'lbl2.kwhCharged': { ru: 'кВт·ч заряжено', uz: 'Zaryadlangan kVt·s', en: 'kWh charged' },
  'lbl2.kwhDelivered': { ru: 'кВт·ч отпущено', uz: 'Berilgan kVt·s', en: 'kWh delivered' },
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

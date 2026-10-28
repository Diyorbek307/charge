import crypto from 'node:crypto';
import { OPERATORS, buildStations, buildCustomers, buildHistory, buildMonthly, plantIncidents } from './history.js';

// Bump when the shape below changes so existing stores reseed instead of
// silently serving a stale schema.
export const SCHEMA_VERSION = 18;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

/**
 * Demo credentials — each portal has its own account and its own password.
 * These are prototype accounts, intentionally documented in the UI.
 */
export const DEMO_ACCOUNTS = [
  {
    id: 'acc-driver',
    portal: 'driver',
    login: '+998901234567',
    password: 'Driver2026',
    otp: '1234',
    name: 'Alisher Tursunov',
    role: 'Водитель',
    org: null,
    avatar: 'AT',
  },
  {
    id: 'acc-operator',
    portal: 'operator',
    login: 'operator@greencharge.uz',
    password: 'Operator2026',
    name: 'Sardor Yusupov',
    role: 'Оператор сети',
    org: 'GreenCharge UZ',
    orgId: 'op-001',
    avatar: 'SY',
  },
  {
    id: 'acc-admin',
    portal: 'admin',
    login: 'admin@zaryad24.uz',
    password: 'Admin2026',
    name: 'Nodira Baxtiyorova',
    role: 'Администратор платформы',
    org: 'Zaryad24',
    avatar: 'NB',
  },
  {
    id: 'acc-business',
    portal: 'business',
    login: 'fleet@uzauto.uz',
    password: 'Business2026',
    name: 'Bobur Mirzaev',
    role: 'Менеджер автопарка',
    org: 'Uzauto Motors Corp.',
    orgId: 'biz-001',
    avatar: 'BM',
  },
  {
    id: 'acc-partner',
    portal: 'api',
    login: 'partner@zaryad24.uz',
    password: 'Partner2026',
    name: 'Integration Partner',
    role: 'API-партнёр',
    org: 'Partner Sandbox',
    avatar: 'IP',
  },
];

const station = (id, name, operator, operatorId, address, city, geoLat, geoLng, lat, lng, connectors, extra = {}) => ({
  id,
  name,
  operator,
  operatorId,
  address,
  city,
  lat,
  lng,
  geoLat,
  geoLng,
  connectors,
  rating: extra.rating ?? 4.5,
  reviews: extra.reviews ?? 40,
  totalPower: Math.max(...connectors.map(c => c.power)),
  hours: extra.hours ?? '24/7',
  amenities: extra.amenities ?? [],
  image: extra.image ?? 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
});

/** A believable recent audit trail; new actions are appended by the server. */
function auditTrail(ago) {
  const rows = [
    [25, 'auth.login', 'admin', 'Nodira Baxtiyorova', 'Вход в Admin Control Center', null],
    [70, 'alert.ack', 'operator', 'Sardor Yusupov', 'Принято оповещение AL-004 · Namangan Industrial', 'AL-004'],
    [180, 'tariff.update', 'operator', 'Sardor Yusupov', 'Chilonzor Energy Park · CCS2 180 кВт: 2 000 → 2 100 сум/кВт·ч', 'st-007'],
    [320, 'ocpp.online', 'system', 'OCPP', 'Navoiy M-37 Hub подключилась · OCPP 1.6-J · прошивка 2.4.1', 'st-025'],
    [610, 'user.status', 'admin', 'Nodira Baxtiyorova', 'Заблокирован пользователь · 4 отменённых платежа подряд', null],
    [900, 'operator.status', 'system', 'Xorazm Energiya', 'Xorazm Energiya подал заявку на подключение · 6 станций в Xorazm', 'op-005'],
    [1440, 'system.backup', 'system', 'Backup', 'Резервная копия базы создана · 14 дней хранения', null],
    [1700, 'commission.update', 'admin', 'Nodira Baxtiyorova', 'Комиссия EcoVolt: 3,0% → 2,8% по договору от 01.10', 'op-002'],
    [2600, 'settlement.paid', 'system', 'Settlement', 'Закрыт расчёт за прошлый месяц · 4 инвойса отправлены в банк', null],
    [2900, 'webhook.created', 'api', 'Integration Partner', 'Подписка на session.start, session.stop, evse.status', 'wh-001'],
    [4300, 'station.added', 'operator', 'SilkRoad EV', 'Добавлена станция Jizzax M-39 Stop · 3 разъёма до 150 кВт', 'st-026'],
    [7200, 'system.backup', 'system', 'Backup', 'Резервная копия базы создана · 14 дней хранения', null],
    [9100, 'operator.status', 'admin', 'Nodira Baxtiyorova', 'Nukus Power: статус «На ревью» → «Активен»', 'op-004'],
  ];
  return rows.map(([minutes, type, portal, actor, message, entity], i) => ({
    id: `EV-A${String(rows.length - i).padStart(3, '0')}`,
    type,
    portal,
    actor,
    message,
    entity,
    payload: {},
    ts: ago(minutes),
    scope: {},
  }));
}

export function seed(now = Date.now()) {
  const accounts = DEMO_ACCOUNTS.map(a => {
    const { salt, hash } = hashPassword(a.password);
    return {
      id: a.id,
      portal: a.portal,
      login: a.login.toLowerCase(),
      salt,
      hash,
      otp: a.otp ?? null,
      name: a.name,
      role: a.role,
      org: a.org,
      orgId: a.orgId ?? null,
      avatar: a.avatar,
      lastLogin: null,
      twoFactor: { enabled: false, secret: null, pending: null },
    };
  });

  const baseStations = [
    station('st-001', 'Toshkent Siti Hub', 'GreenCharge UZ', 'op-001', "Amir Temur ko'chasi 107B", 'Toshkent', 41.2995, 69.2401, 72, 78, [
      { id: 'c1', type: 'CCS2', power: 150, status: 'available', price: 2000 },
      { id: 'c2', type: 'CCS2', power: 150, status: 'occupied', price: 2000 },
      { id: 'c3', type: 'Type2', power: 22, status: 'available', price: 1200 },
      { id: 'c4', type: 'Type2', power: 22, status: 'available', price: 1200 },
    ], { rating: 4.8, reviews: 124, amenities: ['Wi-Fi', 'Кафе', 'Туалет', 'Парковка'] }),

    station('st-002', 'Yunusobod Mall Charge', 'EcoVolt', 'op-002', 'Yunusobod tumani, 18-kvartal', 'Toshkent', 41.3111, 69.2797, 74, 81, [
      { id: 'c5', type: 'CCS2', power: 120, status: 'occupied', price: 1800 },
      { id: 'c6', type: 'CHAdeMO', power: 50, status: 'occupied', price: 1600 },
      { id: 'c7', type: 'Type2', power: 11, status: 'available', price: 1000 },
    ], { rating: 4.5, reviews: 87, hours: '08:00–22:00', amenities: ['Wi-Fi', 'ТЦ', 'Парковка'], image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop&auto=format' }),

    station('st-003', 'Samarqand Gateway', 'SilkRoad EV', 'op-003', "Registon ko'chasi 45", 'Samarqand', 39.6542, 66.9597, 55, 55, [
      { id: 'c8', type: 'CCS2', power: 100, status: 'available', price: 1900 },
      { id: 'c9', type: 'CCS2', power: 100, status: 'available', price: 1900 },
    ], { rating: 4.7, reviews: 56, amenities: ['Wi-Fi', 'Туалет'], image: 'https://images.unsplash.com/photo-1605152276897-4f618f831968?w=800&h=400&fit=crop&auto=format' }),

    station('st-004', 'Buxoro Silk Hub', 'SilkRoad EV', 'op-003', 'Mustaqillik xiyoboni 12', 'Buxoro', 39.7747, 64.4286, 48, 38, [
      { id: 'c10', type: 'CCS2', power: 60, status: 'reserved', price: 1700 },
      { id: 'c11', type: 'Type2', power: 22, status: 'available', price: 1100 },
    ], { rating: 4.3, reviews: 42, amenities: ['Парковка'], image: 'https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=800&h=400&fit=crop&auto=format' }),

    station('st-005', 'Namangan Industrial', 'GreenCharge UZ', 'op-001', "Sanoat ko'chasi 88", 'Namangan', 40.9983, 71.6726, 68, 88, [
      { id: 'c12', type: 'CCS2', power: 150, status: 'unavailable', price: 2000 },
    ], { rating: 3.9, reviews: 18, hours: '08:00–20:00' }),

    station('st-006', 'Andijon EV Point', 'EcoVolt', 'op-002', "Navoi ko'chasi 15", 'Andijon', 40.3864, 71.7864, 71, 92, [
      { id: 'c13', type: 'CCS2', power: 120, status: 'available', price: 1850 },
      { id: 'c14', type: 'Type2', power: 22, status: 'available', price: 1100 },
    ], { rating: 4.6, reviews: 33, amenities: ['Wi-Fi', 'Парковка'], image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop&auto=format' }),
  ];

  const stations = buildStations(baseStations);
  const customers = buildCustomers(now);
  const history = buildHistory({ stations, customers, now });
  plantIncidents({ history, stations, customers, now });
  const sessions = history.sessions;
  const transactions = history.transactions;
  const monthly = buildMonthly({ sessions, now });

  // Operator cards show this month's figures; completed sessions keep adding.
  const monthStart = (() => {
    const d = new Date(now + 5 * 3600_000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 5 * 3600_000;
  })();
  const operators = OPERATORS.map(o => {
    const own = stations.filter(st => st.operatorId === o.id);
    const month = sessions.filter(x => x.operatorId === o.id && x.status === 'completed' && Date.parse(x.start) >= monthStart);
    return {
      ...o,
      stations: own.length,
      evse: own.reduce((n, st) => n + st.connectors.length, 0),
      revenue: month.reduce((n, x) => n + x.cost, 0),
      sessions: month.length,
    };
  });

  const ago = minutes => new Date(now - minutes * 60_000).toISOString();

  const alerts = [
    { id: 'AL-004', severity: 'warning', stationId: 'st-005', station: 'Namangan Industrial', operatorId: 'op-001', code: 'EVSE_UNAVAILABLE', message: 'EVSE c12 не отвечает на OCPP heartbeat', time: ago(95), ack: false },
    { id: 'AL-003', severity: 'info', stationId: 'st-004', station: 'Buxoro Silk Hub', operatorId: 'op-003', code: 'RESERVATION', message: 'Коннектор c10 зарезервирован на 15 минут', time: ago(12), ack: false },
    { id: 'AL-002', severity: 'critical', stationId: 'st-002', station: 'Yunusobod Mall Charge', operatorId: 'op-002', code: 'POWER_DERATE', message: 'Снижение мощности до 60 кВт из-за нагрузки сети', time: ago(140), ack: false },
  ];

  const vehicles = [
    { id: 'VH-001', model: 'BYD Han EV', plate: '01 A 111 AA', driver: 'Alisher T.', driverId: 'acc-driver', battery: 82, status: 'available', charged: 18, cost: 1420000, odo: 42180 },
    { id: 'VH-002', model: 'Hyundai Ioniq 6', plate: '01 B 222 BB', driver: 'Nilufar K.', driverId: 'usr-nilufar', battery: 45, status: 'charging', charged: 31, cost: 2180000, odo: 28740 },
    { id: 'VH-003', model: 'Tesla Model 3', plate: '01 C 333 CC', driver: 'Bobur M.', driverId: 'usr-bobur', battery: 91, status: 'driving', charged: 24, cost: 1840000, odo: 15320 },
    { id: 'VH-004', model: 'Kia EV6', plate: '01 D 444 DD', driver: 'Dilshod R.', driverId: 'usr-dilshod', battery: 28, status: 'low', charged: 12, cost: 890000, odo: 9870 },
    { id: 'VH-005', model: 'BYD Atto 3', plate: '01 E 555 EE', driver: 'Kamola A.', driverId: 'usr-kamola', battery: 66, status: 'available', charged: 19, cost: 1560000, odo: 33410 },
  ];

  const monthOf = id => sessions.filter(x => x.userId === id && x.corporate && x.status === 'completed' && Date.parse(x.start) >= monthStart);
  for (const v of vehicles) {
    const mine = monthOf(v.driverId);
    v.charged = mine.length;
    v.cost = mine.reduce((n, x) => n + x.cost, 0);
  }
  const employees = [
    { id: 'emp-01', name: 'Alisher Tursunov', driverId: 'acc-driver', dept: 'Продажи', headroom: 1.4, vehicle: 'BYD Han EV' },
    { id: 'emp-02', name: 'Nilufar Karimova', driverId: 'usr-nilufar', dept: 'Маркетинг', headroom: 1.3, vehicle: 'Hyundai Ioniq 6' },
    { id: 'emp-03', name: 'Bobur Mirzayev', driverId: 'usr-bobur', dept: 'IT', headroom: 1.25, vehicle: 'Tesla Model 3' },
    { id: 'emp-04', name: 'Dilshod Raximov', driverId: 'usr-dilshod', dept: 'Логистика', headroom: 1.5, vehicle: 'Kia EV6' },
    { id: 'emp-05', name: 'Kamola Abdullayeva', driverId: 'usr-kamola', dept: 'HR', headroom: 1.0, vehicle: 'BYD Atto 3' },
  ].map(({ headroom, ...e }) => {
    // Limits a fleet manager would set: the usual monthly spend plus headroom,
    // rounded to 100k. One employee runs close to it, as someone always does.
    const pace = sessions
      .filter(x => x.userId === e.driverId && x.corporate && x.status === 'completed' && Date.parse(x.start) >= now - 30 * 86400_000)
      .reduce((n, x) => n + x.cost, 0);
    const limit = Math.max(300_000, Math.ceil((pace * headroom) / 100_000) * 100_000);
    const mine = monthOf(e.driverId);
    const spent = mine.reduce((n, x) => n + x.cost, 0);
    return { ...e, limit, spent, sessions: mine.length, status: spent > limit ? 'warning' : 'active' };
  });

  const wallets = {
    'acc-driver': { balance: 420000, currency: 'UZS', autoTopUp: true, threshold: 100000, card: 'Humo · 8600 •••• 4417' },
    'biz-001': { balance: 18400000, currency: 'UZS', autoTopUp: false, threshold: 2000000, card: 'Корпоративный счёт · IBAN' },
  };

  return {
    __v: SCHEMA_VERSION,
    accounts,
    tokens: [],
    challenges: [],
    stations,
    operators,
    sessions,
    transactions,
    customers: customers.map(({ activity, ...c }) => c),
    monthly,
    alerts,
    vehicles,
    employees,
    wallets,
    events: auditTrail(ago),
    webhooks: [
      {
        id: 'wh-001',
        url: 'https://partner.example.uz/hooks/one-charge',
        events: ['session.start', 'session.stop', 'evse.status'],
        secret: 'whsec_' + crypto.randomBytes(16).toString('hex'),
        // Off by default: the demo should not post to a third-party domain.
        active: false,
        created: ago(60 * 24 * 32),
        owner: 'acc-partner',
      },
    ],
    deliveries: [],
    reports: [],
    queues: [],
    bookings: [],
    payments: history.payments,
    // A point per kWh for charges already in the history, as if loyalty had always been on.
    points: sessions
      .filter(x => x.status === 'completed' && x.energy > 0)
      .map((x, i) => ({ id: `PT-SEED${i}`, userId: x.userId, delta: Math.round(x.energy), reason: `Зарядка · ${x.stationName}`, ts: x.end })),
    // Generated history runs up to here; the demo simulation fills in after it.
    // The generated history covers this window; months it only partly covers are not shown as real ones.
    historyStart: new Date(now - 60 * 86400_000).toISOString(),
    historyUntil: new Date(now - 20 * 60_000).toISOString(),
    counters: { session: history.counters.session, txn: history.counters.txn, alert: 5, event: 1, webhook: 2, delivery: 1, report: 1, queue: 1, booking: 1 },
  };
}

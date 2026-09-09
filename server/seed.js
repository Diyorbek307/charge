import crypto from 'node:crypto';

// Bump when the shape below changes so existing stores reseed instead of
// silently serving a stale schema.
export const SCHEMA_VERSION = 4;

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
    login: 'admin@onecharge.uz',
    password: 'Admin2026',
    name: 'Nodira Baxtiyorova',
    role: 'Администратор платформы',
    org: 'ONE CHARGE UZ',
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
    login: 'partner@onecharge.uz',
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

export function seed() {
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
    };
  });

  const stations = [
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

  const operators = [
    { id: 'op-001', name: 'GreenCharge UZ', logo: '🟢', stations: 47, evse: 124, status: 'active', integration: 'OCPI', since: 'Mar 2024', revenue: 184500000, sessions: 8420, region: 'Toshkent, Toshkent viloyati', contact: 'tech@greencharge.uz' },
    { id: 'op-002', name: 'EcoVolt', logo: '⚡', stations: 31, evse: 78, status: 'active', integration: 'OCPI', since: 'Jun 2024', revenue: 112300000, sessions: 5140, region: 'Toshkent, Andijon, Namangan', contact: 'api@ecovolt.uz' },
    { id: 'op-003', name: 'SilkRoad EV', logo: '🔵', stations: 22, evse: 56, status: 'active', integration: 'API', since: 'Sep 2024', revenue: 78900000, sessions: 3210, region: 'Samarqand, Buxoro, Navoiy', contact: 'info@silkroadev.uz' },
    { id: 'op-004', name: 'Nukus Power', logo: '🟡', stations: 8, evse: 18, status: 'pending', integration: 'API', since: 'Jan 2025', revenue: 18400000, sessions: 620, region: "Qoraqalpog'iston", contact: 'admin@nukuspower.uz' },
  ];

  const sessions = [
    { id: 'S-10842', userId: 'acc-driver', user: 'Alisher T.', stationId: 'st-001', stationName: 'Toshkent Siti Hub', operator: 'GreenCharge UZ', operatorId: 'op-001', connectorId: 'c1', connector: 'CCS2', start: '2026-09-09T09:23:00.000Z', end: '2026-09-09T10:05:00.000Z', energy: 38.4, cost: 76800, status: 'completed', corporate: false },
    { id: 'S-10840', userId: 'usr-bobur', user: 'Bobur M.', stationId: 'st-003', stationName: 'Samarqand Gateway', operator: 'SilkRoad EV', operatorId: 'op-003', connectorId: 'c8', connector: 'CCS2', start: '2026-09-09T07:10:00.000Z', end: '2026-09-09T07:55:00.000Z', energy: 41.2, cost: 78280, status: 'completed', corporate: true },
    { id: 'S-10839', userId: 'usr-dilshod', user: 'Dilshod R.', stationId: 'st-006', stationName: 'Andijon EV Point', operator: 'EcoVolt', operatorId: 'op-002', connectorId: 'c13', connector: 'CCS2', start: '2026-09-09T06:30:00.000Z', end: '2026-09-09T07:15:00.000Z', energy: 52.8, cost: 97680, status: 'completed', corporate: true },
    { id: 'S-10838', userId: 'usr-kamola', user: 'Kamola A.', stationId: 'st-004', stationName: 'Buxoro Silk Hub', operator: 'SilkRoad EV', operatorId: 'op-003', connectorId: 'c10', connector: 'CCS2', start: '2026-09-09T05:50:00.000Z', end: '2026-09-09T06:40:00.000Z', energy: 44.6, cost: 75820, status: 'completed', corporate: false },
    { id: 'S-10837', userId: 'usr-javlon', user: 'Javlon S.', stationId: 'st-005', stationName: 'Namangan Industrial', operator: 'GreenCharge UZ', operatorId: 'op-001', connectorId: 'c12', connector: 'CCS2', start: '2026-09-09T05:05:00.000Z', end: '2026-09-09T05:05:00.000Z', energy: 0, cost: 0, status: 'failed', corporate: false },
  ];

  const transactions = [
    { id: 'TXN-28441', sessionId: 'S-10842', userId: 'acc-driver', user: 'Alisher T.', amount: 76800, method: 'Humo', status: 'completed', time: '2026-09-09T10:05:00.000Z' },
    { id: 'TXN-28440', sessionId: 'S-10840', userId: 'usr-bobur', user: 'Bobur M.', amount: 78280, method: 'Uzcard', status: 'completed', time: '2026-09-09T07:55:00.000Z' },
    { id: 'TXN-28439', sessionId: 'S-10839', userId: 'usr-dilshod', user: 'Dilshod R.', amount: 97680, method: 'Visa', status: 'completed', time: '2026-09-09T07:15:00.000Z' },
    { id: 'TXN-28438', sessionId: 'S-10838', userId: 'usr-kamola', user: 'Kamola A.', amount: 75820, method: 'Humo', status: 'completed', time: '2026-09-09T06:40:00.000Z' },
    { id: 'TXN-28437', sessionId: 'S-10837', userId: 'usr-javlon', user: 'Javlon S.', amount: 0, method: 'Uzcard', status: 'failed', time: '2026-09-09T05:05:00.000Z' },
  ];

  const alerts = [
    { id: 'AL-004', severity: 'warning', stationId: 'st-005', station: 'Namangan Industrial', operatorId: 'op-001', code: 'EVSE_UNAVAILABLE', message: 'EVSE c12 не отвечает на OCPP heartbeat', time: '2026-09-09T04:12:00.000Z', ack: false },
    { id: 'AL-003', severity: 'info', stationId: 'st-004', station: 'Buxoro Silk Hub', operatorId: 'op-003', code: 'RESERVATION', message: 'Коннектор c10 зарезервирован на 15 минут', time: '2026-09-09T06:02:00.000Z', ack: false },
    { id: 'AL-002', severity: 'critical', stationId: 'st-002', station: 'Yunusobod Mall Charge', operatorId: 'op-002', code: 'POWER_DERATE', message: 'Снижение мощности до 60 кВт из-за нагрузки сети', time: '2026-09-09T03:40:00.000Z', ack: false },
  ];

  const vehicles = [
    { id: 'veh-01', plate: '01 A 123 BC', model: 'BYD Song Plus', driver: 'Alisher Tursunov', driverId: 'acc-driver', battery: 68, status: 'idle', odo: 42180 },
    { id: 'veh-02', plate: '01 B 456 DE', model: 'Chevrolet Bolt EUV', driver: 'Kamola Aliyeva', driverId: 'usr-kamola', battery: 34, status: 'idle', odo: 28740 },
    { id: 'veh-03', plate: '01 C 789 FG', model: 'BYD Chazor', driver: 'Bobur Mirzaev', driverId: 'usr-bobur', battery: 91, status: 'idle', odo: 15320 },
    { id: 'veh-04', plate: '01 D 012 HI', model: 'Hongqi E-HS9', driver: 'Dilshod Rahimov', driverId: 'usr-dilshod', battery: 52, status: 'idle', odo: 9870 },
    { id: 'veh-05', plate: '01 E 345 JK', model: 'BYD Han EV', driver: 'Javlon Sobirov', driverId: 'usr-javlon', battery: 77, status: 'idle', odo: 33410 },
  ];

  const employees = [
    { id: 'emp-01', name: 'Alisher Tursunov', role: 'Driver', limit: 1500000, spent: 842000, cards: 1, status: 'active' },
    { id: 'emp-02', name: 'Kamola Aliyeva', role: 'Driver', limit: 1200000, spent: 631000, cards: 1, status: 'active' },
    { id: 'emp-03', name: 'Bobur Mirzaev', role: 'Fleet Manager', limit: 3000000, spent: 1204000, cards: 2, status: 'active' },
    { id: 'emp-04', name: 'Dilshod Rahimov', role: 'Driver', limit: 1000000, spent: 977000, cards: 1, status: 'warning' },
    { id: 'emp-05', name: 'Javlon Sobirov', role: 'Driver', limit: 1000000, spent: 120000, cards: 1, status: 'active' },
  ];

  const wallets = {
    'acc-driver': { balance: 420000, currency: 'UZS', autoTopUp: true, threshold: 100000, card: 'Humo · 8600 •••• 4417' },
    'biz-001': { balance: 18400000, currency: 'UZS', autoTopUp: false, threshold: 2000000, card: 'Корпоративный счёт · IBAN' },
  };

  return {
    __v: SCHEMA_VERSION,
    accounts,
    tokens: [],
    stations,
    operators,
    sessions,
    transactions,
    alerts,
    vehicles,
    employees,
    wallets,
    events: [],
    counters: { session: 10843, txn: 28442, alert: 5, event: 1 },
  };
}

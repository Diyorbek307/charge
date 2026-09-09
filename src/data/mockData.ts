export type StationStatus = 'available' | 'occupied' | 'unavailable' | 'reserved';
export type ConnectorType = 'CCS2' | 'CCS1' | 'CHAdeMO' | 'Type2' | 'Type1' | 'GB/T DC' | 'NACS';

export interface Connector {
  id: string;
  type: ConnectorType;
  power: number;
  status: StationStatus;
  price: number;
}

export interface Station {
  id: string;
  name: string;
  operator: string;
  address: string;
  city: string;
  lat: number; // relative % on map
  lng: number;
  geoLat: number; // real geographic latitude
  geoLng: number; // real geographic longitude
  status: StationStatus;
  connectors: Connector[];
  rating: number;
  reviews: number;
  totalPower: number;
  image: string;
  hours: string;
  distance?: number;
  amenities: string[];
}

export interface ChargingSession {
  id: string;
  stationName: string;
  operator: string;
  date: string;
  duration: string;
  energy: number;
  cost: number;
  connector: ConnectorType;
  status: 'completed' | 'active' | 'failed';
}

export interface Operator {
  id: string;
  name: string;
  logo: string;
  stations: number;
  evse: number;
  status: 'active' | 'pending' | 'suspended';
  integration: 'OCPI' | 'API' | 'Manual';
  since: string;
  revenue: number;
  sessions: number;
  region: string;
  contact: string;
}

export const stations: Station[] = [
  {
    id: 'st-001',
    name: 'Toshkent Siti Hub',
    operator: 'GreenCharge UZ',
    address: 'Amir Temur ko\'chasi 107B',
    city: 'Toshkent',
    lat: 72, lng: 78,
    geoLat: 41.2995, geoLng: 69.2401,
    status: 'available',
    connectors: [
      { id: 'c1', type: 'CCS2', power: 150, status: 'available', price: 2000 },
      { id: 'c2', type: 'CCS2', power: 150, status: 'occupied', price: 2000 },
      { id: 'c3', type: 'Type2', power: 22, status: 'available', price: 1200 },
      { id: 'c4', type: 'Type2', power: 22, status: 'available', price: 1200 },
    ],
    rating: 4.8,
    reviews: 124,
    totalPower: 150,
    image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
    hours: '24/7',
    distance: 1.2,
    amenities: ['Wi-Fi', 'Кафе', 'Туалет', 'Парковка'],
  },
  {
    id: 'st-002',
    name: 'Yunusobod Mall Charge',
    operator: 'EcoVolt',
    address: 'Yunusobod tumani, 18-kvartal',
    city: 'Toshkent',
    lat: 74, lng: 81,
    geoLat: 41.3111, geoLng: 69.2797,
    status: 'occupied',
    connectors: [
      { id: 'c5', type: 'CCS2', power: 120, status: 'occupied', price: 1800 },
      { id: 'c6', type: 'CHAdeMO', power: 50, status: 'occupied', price: 1600 },
      { id: 'c7', type: 'Type2', power: 11, status: 'available', price: 1000 },
    ],
    rating: 4.5,
    reviews: 87,
    totalPower: 120,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop&auto=format',
    hours: '08:00–22:00',
    distance: 3.4,
    amenities: ['Wi-Fi', 'ТЦ', 'Парковка'],
  },
  {
    id: 'st-003',
    name: 'Samarqand Gateway',
    operator: 'SilkRoad EV',
    address: 'Registon ko\'chasi 45',
    city: 'Samarqand',
    lat: 55, lng: 55,
    geoLat: 39.6542, geoLng: 66.9597,
    status: 'available',
    connectors: [
      { id: 'c8', type: 'CCS2', power: 100, status: 'available', price: 1900 },
      { id: 'c9', type: 'CCS2', power: 100, status: 'available', price: 1900 },
    ],
    rating: 4.7,
    reviews: 56,
    totalPower: 100,
    image: 'https://images.unsplash.com/photo-1605152276897-4f618f831968?w=800&h=400&fit=crop&auto=format',
    hours: '24/7',
    distance: 0,
    amenities: ['Wi-Fi', 'Туалет'],
  },
  {
    id: 'st-004',
    name: 'Buxoro Silk Hub',
    operator: 'SilkRoad EV',
    address: 'Mustaqillik xiyoboni 12',
    city: 'Buxoro',
    lat: 48, lng: 38,
    geoLat: 39.7747, geoLng: 64.4286,
    status: 'reserved',
    connectors: [
      { id: 'c10', type: 'CCS2', power: 60, status: 'reserved', price: 1700 },
      { id: 'c11', type: 'Type2', power: 22, status: 'available', price: 1100 },
    ],
    rating: 4.3,
    reviews: 42,
    totalPower: 60,
    image: 'https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=800&h=400&fit=crop&auto=format',
    hours: '24/7',
    distance: 0,
    amenities: ['Парковка'],
  },
  {
    id: 'st-005',
    name: 'Namangan Industrial',
    operator: 'GreenCharge UZ',
    address: 'Sanoat ko\'chasi 88',
    city: 'Namangan',
    lat: 68, lng: 88,
    geoLat: 40.9983, geoLng: 71.6726,
    status: 'unavailable',
    connectors: [
      { id: 'c12', type: 'CCS2', power: 150, status: 'unavailable', price: 2000 },
    ],
    rating: 3.9,
    reviews: 18,
    totalPower: 150,
    image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
    hours: '08:00–20:00',
    distance: 0,
    amenities: [],
  },
  {
    id: 'st-006',
    name: 'Andijon EV Point',
    operator: 'EcoVolt',
    address: 'Navoi ko\'chasi 15',
    city: 'Andijon',
    lat: 71, lng: 92,
    geoLat: 40.3864, geoLng: 71.7864,
    status: 'available',
    connectors: [
      { id: 'c13', type: 'CCS2', power: 120, status: 'available', price: 1850 },
      { id: 'c14', type: 'Type2', power: 22, status: 'available', price: 1100 },
    ],
    rating: 4.6,
    reviews: 33,
    totalPower: 120,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop&auto=format',
    hours: '24/7',
    distance: 0,
    amenities: ['Wi-Fi', 'Парковка'],
  },
];

export const sessions: ChargingSession[] = [
  {
    id: 'sess-1042',
    stationName: 'Toshkent Siti Hub',
    operator: 'GreenCharge UZ',
    date: '2026-09-04 14:23',
    duration: '42 мин',
    energy: 38.4,
    cost: 76800,
    connector: 'CCS2',
    status: 'completed',
  },
  {
    id: 'sess-1039',
    stationName: 'Yunusobod Mall Charge',
    operator: 'EcoVolt',
    date: '2026-09-02 11:10',
    duration: '1 ч 05 мин',
    energy: 52.1,
    cost: 93780,
    connector: 'CCS2',
    status: 'completed',
  },
  {
    id: 'sess-1031',
    stationName: 'Samarqand Gateway',
    operator: 'SilkRoad EV',
    date: '2026-08-28 09:45',
    duration: '28 мин',
    energy: 25.6,
    cost: 48640,
    connector: 'CCS2',
    status: 'completed',
  },
  {
    id: 'sess-1028',
    stationName: 'Buxoro Silk Hub',
    operator: 'SilkRoad EV',
    date: '2026-08-25 17:30',
    duration: '55 мин',
    energy: 44.2,
    cost: 75140,
    connector: 'CCS2',
    status: 'completed',
  },
  {
    id: 'sess-1021',
    stationName: 'Toshkent Siti Hub',
    operator: 'GreenCharge UZ',
    date: '2026-08-20 08:15',
    duration: '35 мин',
    energy: 31.8,
    cost: 63600,
    connector: 'CCS2',
    status: 'completed',
  },
];

export const operators: Operator[] = [
  {
    id: 'op-001',
    name: 'GreenCharge UZ',
    logo: '🟢',
    stations: 47,
    evse: 124,
    status: 'active',
    integration: 'OCPI',
    since: 'Mar 2024',
    revenue: 184500000,
    sessions: 8420,
    region: 'Toshkent, Toshkent viloyati',
    contact: 'tech@greencharge.uz',
  },
  {
    id: 'op-002',
    name: 'EcoVolt',
    logo: '⚡',
    stations: 31,
    evse: 78,
    status: 'active',
    integration: 'OCPI',
    since: 'Jun 2024',
    revenue: 112300000,
    sessions: 5140,
    region: 'Toshkent, Andijon, Namangan',
    contact: 'api@ecovolt.uz',
  },
  {
    id: 'op-003',
    name: 'SilkRoad EV',
    logo: '🔵',
    stations: 22,
    evse: 56,
    status: 'active',
    integration: 'API',
    since: 'Sep 2024',
    revenue: 78900000,
    sessions: 3210,
    region: 'Samarqand, Buxoro, Navoiy',
    contact: 'info@silkroadev.uz',
  },
  {
    id: 'op-004',
    name: 'Nukus Power',
    logo: '🟡',
    stations: 8,
    evse: 18,
    status: 'pending',
    integration: 'API',
    since: 'Jan 2025',
    revenue: 18400000,
    sessions: 620,
    region: 'Qoraqalpog\'iston',
    contact: 'admin@nukuspower.uz',
  },
];

export const revenueData = [
  { month: 'Apr', revenue: 38, sessions: 1240, energy: 4200 },
  { month: 'May', revenue: 52, sessions: 1680, energy: 5800 },
  { month: 'Jun', revenue: 61, sessions: 2010, energy: 6900 },
  { month: 'Jul', revenue: 75, sessions: 2450, energy: 8400 },
  { month: 'Aug', revenue: 88, sessions: 2840, energy: 9800 },
  { month: 'Sep', revenue: 95, sessions: 3100, energy: 10600 },
];

export const hourlyData = [
  { hour: '00', sessions: 12 }, { hour: '02', sessions: 8 },
  { hour: '04', sessions: 6 }, { hour: '06', sessions: 18 },
  { hour: '08', sessions: 65 }, { hour: '10', sessions: 88 },
  { hour: '12', sessions: 95 }, { hour: '14', sessions: 102 },
  { hour: '16', sessions: 118 }, { hour: '18', sessions: 134 },
  { hour: '20', sessions: 98 }, { hour: '22', sessions: 45 },
];

export const connectorDistribution = [
  { name: 'CCS2', value: 48, color: '#0EA5E9' },
  { name: 'Type 2', value: 28, color: '#22C55E' },
  { name: 'CHAdeMO', value: 14, color: '#F59E0B' },
  { name: 'GB/T DC', value: 7, color: '#8B5CF6' },
  { name: 'Другие', value: 3, color: '#94A3B8' },
];

export const adminSessions = [
  { id: 'S-10842', user: 'Alisher T.', station: 'Toshkent Siti Hub', operator: 'GreenCharge UZ', start: '14:23', end: '15:05', energy: '38.4 кВт·ч', cost: '76 800 сум', status: 'completed' },
  { id: 'S-10841', user: 'Nilufar K.', station: 'Yunusobod Mall', operator: 'EcoVolt', start: '13:45', end: '—', energy: '24.1 кВт·ч', cost: '43 380 сум', status: 'active' },
  { id: 'S-10840', user: 'Bobur M.', station: 'Samarqand Gateway', operator: 'SilkRoad EV', start: '12:10', end: '12:55', energy: '41.2 кВт·ч', cost: '78 280 сум', status: 'completed' },
  { id: 'S-10839', user: 'Dilshod R.', station: 'Andijon EV Point', operator: 'EcoVolt', start: '11:30', end: '12:15', energy: '52.8 кВт·ч', cost: '97 680 сум', status: 'completed' },
  { id: 'S-10838', user: 'Kamola A.', station: 'Buxoro Silk Hub', operator: 'SilkRoad EV', start: '10:50', end: '11:40', energy: '44.6 кВт·ч', cost: '75 820 сум', status: 'completed' },
  { id: 'S-10837', user: 'Javlon S.', station: 'Namangan Industrial', operator: 'GreenCharge UZ', start: '10:05', end: '10:05', energy: '0 кВт·ч', cost: '0 сум', status: 'failed' },
];

export const payments = [
  { id: 'TXN-28441', user: 'Alisher T.', amount: 76800, method: 'Humo', status: 'completed', time: '15:05', session: 'S-10842' },
  { id: 'TXN-28440', user: 'Bobur M.', amount: 78280, method: 'Uzcard', status: 'completed', time: '12:55', session: 'S-10840' },
  { id: 'TXN-28439', user: 'Dilshod R.', amount: 97680, method: 'Visa', status: 'completed', time: '12:15', session: 'S-10839' },
  { id: 'TXN-28438', user: 'Kamola A.', amount: 75820, method: 'Humo', status: 'completed', time: '11:40', session: 'S-10838' },
  { id: 'TXN-28437', user: 'Javlon S.', amount: 0, method: 'Uzcard', status: 'failed', time: '10:05', session: 'S-10837' },
  { id: 'TXN-28436', user: 'Sarvar N.', amount: 45200, method: 'Visa', status: 'active', time: '09:30', session: 'S-10836' },
  { id: 'TXN-28435', user: 'Nodira B.', amount: 63400, method: 'Mastercard', status: 'completed', time: '09:10', session: 'S-10835' },
  { id: 'TXN-28434', user: 'Umid K.', amount: 0, method: 'Humo', status: 'failed', time: '08:45', session: 'S-10834' },
  { id: 'TXN-28433', user: 'Zulfiya M.', amount: 88200, method: 'Uzcard', status: 'completed', time: '08:20', session: 'S-10833' },
  { id: 'TXN-28432', user: 'Bekzod T.', amount: 54600, method: 'Humo', status: 'completed', time: '07:55', session: 'S-10832' },
];

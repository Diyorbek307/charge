/**
 * The demo network and its history.
 *
 * Every number the dashboards show is computed from this data, so it has to
 * look like a real young network: stations along the main cities and the
 * M-37/M-39 highways, a few hundred drivers, six weeks of sessions with
 * daily and weekly rhythms, top-ups through Payme and Click, and monthly
 * roll-ups for the half-year before that.
 *
 * Generation is deterministic (seeded PRNG), relative to "now", so every
 * reset produces the same network with fresh dates.
 */

const HISTORY_DAYS = 60;
const MONTHS_BEFORE = 5;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const TASHKENT_MS = 5 * 3600_000;

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const IMG = [
  'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=400&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1605152276897-4f618f831968?w=800&h=400&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=800&h=400&fit=crop&auto=format',
];

export const OPERATORS = [
  { id: 'op-001', name: 'GreenCharge UZ', logo: '🟢', status: 'active', integration: 'OCPP 1.6-J', since: '2024-03-12', region: 'Toshkent, Toshkent viloyati, Namangan', contact: 'tech@greencharge.uz', commission: 3.0, iban: 'UZ12 0001 •••• 4410' },
  { id: 'op-002', name: 'EcoVolt', logo: '⚡', status: 'active', integration: 'OCPP 1.6-J', since: '2024-06-03', region: 'Toshkent, Farg‘ona vodiysi', contact: 'api@ecovolt.uz', commission: 2.8, iban: 'UZ55 0004 •••• 9021' },
  { id: 'op-003', name: 'SilkRoad EV', logo: '🔵', status: 'active', integration: 'OCPP 1.6-J', since: '2024-09-20', region: 'Samarqand, Buxoro, Navoiy, Qashqadaryo, Surxondaryo', contact: 'info@silkroadev.uz', commission: 3.2, iban: 'UZ07 0009 •••• 3378' },
  { id: 'op-004', name: 'Nukus Power', logo: '🟡', status: 'active', integration: 'REST API', since: '2025-01-15', region: 'Qoraqalpog‘iston, Xorazm', contact: 'admin@nukuspower.uz', commission: 4.0, iban: 'UZ31 0011 •••• 7754' },
  { id: 'op-005', name: 'Xorazm Energiya', logo: '🟠', status: 'pending', integration: 'OCPP 1.6-J', since: '2026-09-28', region: 'Xorazm', contact: 'ev@xorazmenergiya.uz', commission: 3.5, iban: '—' },
];

const op = id => OPERATORS.find(o => o.id === id);

// [name, operatorId, address, city, lat, lng, popularity 0.4..1.6, connectors]
// Connector spec: [type, power, price]
const EXTRA_STATIONS = [
  ['Chilonzor Energy Park', 'op-001', 'Bunyodkor shoh ko‘chasi 24', 'Toshkent', 41.2856, 69.2034, 1.4, [['CCS2', 180, 2100], ['CCS2', 180, 2100], ['GB/T DC', 120, 1900], ['Type2', 22, 1200]]],
  ['Mirzo Ulug‘bek Tech Hub', 'op-001', 'Mirzo Ulug‘bek ko‘chasi 56', 'Toshkent', 41.3394, 69.3349, 1.1, [['CCS2', 120, 2000], ['GB/T DC', 60, 1800], ['Type2', 22, 1200]]],
  ['Sergeli Logistics Point', 'op-001', 'Yangi Sergeli ko‘chasi 3', 'Toshkent', 41.2234, 69.2213, 1.0, [['CCS2', 150, 1950], ['CCS2', 150, 1950], ['GB/T DC', 120, 1850]]],
  ['Yashnobod Airport Charge', 'op-001', 'Kushbegi ko‘chasi 2', 'Toshkent', 41.2602, 69.2811, 1.5, [['CCS2', 180, 2200], ['CCS2', 180, 2200], ['Type2', 22, 1300], ['Type2', 22, 1300]]],
  ['Olmazor Residence', 'op-001', 'Qorasaroy ko‘chasi 211', 'Toshkent', 41.3502, 69.2152, 0.7, [['Type2', 22, 1100], ['Type2', 22, 1100], ['Type2', 11, 1000]]],
  ['Chirchiq City Center', 'op-001', 'Amir Temur ko‘chasi 12', 'Chirchiq', 41.4689, 69.5822, 0.6, [['CCS2', 60, 1800], ['Type2', 22, 1100]]],
  ['Angren Highway A-373', 'op-001', 'A-373 trassasi, 98-km', 'Angren', 41.0167, 70.1436, 0.7, [['CCS2', 120, 2000], ['GB/T DC', 60, 1850]]],
  ['Namangan Davlat Bozori', 'op-001', 'Uychi ko‘chasi 5', 'Namangan', 41.0011, 71.6439, 0.6, [['CCS2', 60, 1800], ['Type2', 22, 1100]]],

  ['Magic City Charge', 'op-002', 'Bobur ko‘chasi 174', 'Toshkent', 41.3017, 69.2468, 1.3, [['CCS2', 120, 1900], ['GB/T DC', 120, 1850], ['Type2', 22, 1150]]],
  ['Next Mall Fast', 'op-002', 'Bobur ko‘chasi 6', 'Toshkent', 41.2913, 69.2489, 1.2, [['CCS2', 150, 1950], ['CCS2', 150, 1950]]],
  ['Samarqand Darvoza Mall', 'op-002', 'Qoratosh ko‘chasi 5A', 'Toshkent', 41.3165, 69.2316, 1.0, [['CCS2', 60, 1800], ['Type2', 22, 1100], ['Type2', 22, 1100]]],
  ['Farg‘ona Markaz', 'op-002', 'Mustaqillik ko‘chasi 30', 'Farg‘ona', 40.3842, 71.7843, 0.9, [['CCS2', 120, 1850], ['GB/T DC', 60, 1750], ['Type2', 22, 1050]]],
  ['Marg‘ilon Ipak Yo‘li', 'op-002', 'Burhoniddin Marg‘inoniy 41', 'Marg‘ilon', 40.4711, 71.7247, 0.5, [['CCS2', 60, 1750], ['Type2', 22, 1050]]],
  ['Qo‘qon Xon O‘rdasi', 'op-002', 'Istiqlol ko‘chasi 2', 'Qo‘qon', 40.5286, 70.9425, 0.6, [['CCS2', 120, 1850], ['Type2', 22, 1050]]],
  ['Andijon Bobur Park', 'op-002', 'Bobur shoh ko‘chasi 60', 'Andijon', 40.7827, 72.3442, 0.7, [['CCS2', 60, 1800], ['GB/T DC', 60, 1750]]],

  ['Samarqand Registon Plaza', 'op-003', 'Registon ko‘chasi 1', 'Samarqand', 39.6547, 66.9750, 1.1, [['CCS2', 150, 1950], ['GB/T DC', 120, 1850], ['Type2', 22, 1100]]],
  ['Samarqand Vokzal', 'op-003', 'Rudakiy ko‘chasi 2', 'Samarqand', 39.6747, 66.9298, 0.8, [['CCS2', 120, 1900], ['Type2', 22, 1100]]],
  ['Buxoro Ark Charge', 'op-003', 'Afrosiyob ko‘chasi 8', 'Buxoro', 39.7776, 64.4103, 0.6, [['CCS2', 120, 1850], ['GB/T DC', 60, 1750]]],
  ['Navoiy M-37 Hub', 'op-003', 'M-37 trassasi, Navoiy chiqishi', 'Navoiy', 40.0844, 65.3792, 0.9, [['CCS2', 180, 2100], ['CCS2', 180, 2100], ['GB/T DC', 120, 1900]]],
  ['Jizzax M-39 Stop', 'op-003', 'M-39 trassasi, 182-km', 'Jizzax', 40.1158, 67.8422, 1.0, [['CCS2', 150, 2000], ['CCS2', 150, 2000], ['GB/T DC', 120, 1900]]],
  ['Guliston Yo‘l Bo‘yi', 'op-003', 'M-39 trassasi, Guliston', 'Guliston', 40.4897, 68.7842, 0.8, [['CCS2', 120, 1950], ['GB/T DC', 60, 1850]]],
  ['Qarshi Nasaf', 'op-003', 'Islom Karimov ko‘chasi 15', 'Qarshi', 38.8606, 65.7891, 0.6, [['CCS2', 120, 1850], ['Type2', 22, 1100]]],
  ['Termiz Chegara', 'op-003', 'Al-Hakim at-Termiziy ko‘chasi 9', 'Termiz', 37.2242, 67.2783, 0.4, [['CCS2', 60, 1800], ['Type2', 22, 1100]]],

  ['Nukus Markaziy', 'op-004', 'Doslik guzari 4', 'Nukus', 42.4619, 59.6003, 0.5, [['CCS2', 60, 1800], ['Type2', 22, 1100]]],
  ['Nukus Aeroport', 'op-004', 'Aeroport yo‘li 1', 'Nukus', 42.4884, 59.6233, 0.4, [['CCS2', 60, 1800]]],
  ['Urganch Al-Xorazmiy', 'op-004', 'Al-Xorazmiy ko‘chasi 25', 'Urganch', 41.5506, 60.6311, 0.5, [['CCS2', 120, 1850], ['Type2', 22, 1100]]],
  ['Xiva Ichan Qal‘a', 'op-004', 'Polvon Qori ko‘chasi 1', 'Xiva', 41.3783, 60.3639, 0.6, [['CCS2', 60, 1800], ['GB/T DC', 60, 1750], ['Type2', 22, 1100]]],
];

const AMENITIES = [['Wi-Fi', 'Кафе', 'Туалет'], ['ТЦ', 'Парковка', 'Wi-Fi'], ['Парковка', 'Туалет'], ['Кафе', 'Магазин', 'Туалет', 'Парковка'], ['Парковка']];

export function buildStations(base) {
  const r = rng(71);
  let connectorId = 15;
  const extra = EXTRA_STATIONS.map(([name, operatorId, address, city, geoLat, geoLng, popularity, specs], i) => {
    const connectors = specs.map(([type, power, price]) => ({ id: `c${connectorId++}`, type, power, status: 'available', price }));
    return {
      id: `st-${String(i + 7).padStart(3, '0')}`,
      name,
      operator: op(operatorId).name,
      operatorId,
      address,
      city,
      // Legacy 0–100 grid used by the stylised driver map fallback.
      lat: Math.round(((45.6 - geoLat) / 8.4) * 100),
      lng: Math.round(((geoLng - 56) / 17.2) * 100),
      geoLat,
      geoLng,
      connectors,
      rating: round(3.9 + r() * 1.0, 1),
      reviews: Math.round(12 + popularity * 70 * r()),
      totalPower: Math.max(...connectors.map(c => c.power)),
      hours: popularity < 0.6 && r() < 0.5 ? '07:00–23:00' : '24/7',
      amenities: AMENITIES[i % AMENITIES.length],
      image: IMG[i % IMG.length],
      popularity,
    };
  });
  // The six original stations keep their ids and connectors (tests and the
  // e2e flows depend on them); they only gain a popularity weight.
  const pop = { 'st-001': 1.5, 'st-002': 1.2, 'st-003': 1.0, 'st-004': 0.7, 'st-005': 0.6, 'st-006': 0.8 };
  return [...base.map(s => ({ ...s, popularity: pop[s.id] ?? 1 })), ...extra];
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

const FIRST_M = ['Alisher', 'Bobur', 'Dilshod', 'Javlon', 'Sardor', 'Timur', 'Jasur', 'Sherzod', 'Otabek', 'Aziz', 'Rustam', 'Farrux', 'Umid', 'Bekzod', 'Islom', 'Sanjar', 'Shoxrux', 'Nodir', 'Akmal', 'Ulug‘bek', 'Doniyor', 'Eldor', 'Mansur', 'Sarvar'];
const FIRST_F = ['Nilufar', 'Kamola', 'Dilnoza', 'Madina', 'Gulnora', 'Feruza', 'Malika', 'Shahnoza', 'Zarina', 'Sevara', 'Laylo', 'Mohira', 'Nigora', 'Barno'];
const LAST = ['Karimov', 'Toshmatov', 'Yusupov', 'Rahimov', 'Abdullayev', 'Mirzayev', 'Raximov', 'Ismoilov', 'Xolmatov', 'Nazarov', 'Saidov', 'Qodirov', 'Ergashev', 'Usmonov', 'Sobirov', 'Aliyev', 'Hasanov', 'Jo‘rayev', 'Tursunov', 'Normatov'];
const CARS = [
  ['BYD Song Plus EV', 'CCS2'], ['BYD Han EV', 'CCS2'], ['BYD Seagull', 'GB/T DC'], ['BYD Atto 3', 'CCS2'], ['Chery eQ7', 'GB/T DC'],
  ['Zeekr 001', 'CCS2'], ['Tesla Model Y', 'CCS2'], ['Leapmotor C11', 'GB/T DC'], ['Hyundai Ioniq 5', 'CCS2'], ['Kia EV6', 'CCS2'],
  ['Li Auto L7', 'GB/T DC'], ['Chevrolet Bolt EV', 'CCS2'], ['Changan Deepal SL03', 'GB/T DC'], ['Voyah Free', 'CCS2'],
];
const HOME_CITIES = ['Toshkent', 'Toshkent', 'Toshkent', 'Toshkent', 'Toshkent', 'Samarqand', 'Farg‘ona', 'Andijon', 'Namangan', 'Buxoro', 'Navoiy', 'Qarshi', 'Nukus', 'Urganch'];

/** Fleet drivers keep the ids the vehicles and employees point at. */
const FIXED = [
  { id: 'acc-driver', name: 'Alisher Tursunov', phone: '+998901234567', car: 'BYD Han EV', connector: 'CCS2', city: 'Toshkent', fleet: true },
  { id: 'usr-nilufar', name: 'Nilufar Karimova', phone: '+998912345678', car: 'Hyundai Ioniq 6', connector: 'CCS2', city: 'Toshkent', fleet: true },
  { id: 'usr-bobur', name: 'Bobur Mirzayev', phone: '+998933456789', car: 'Tesla Model 3', connector: 'CCS2', city: 'Toshkent', fleet: true },
  { id: 'usr-dilshod', name: 'Dilshod Raximov', phone: '+998974567890', car: 'Kia EV6', connector: 'CCS2', city: 'Toshkent', fleet: true },
  { id: 'usr-kamola', name: 'Kamola Abdullayeva', phone: '+998905678901', car: 'BYD Atto 3', connector: 'CCS2', city: 'Samarqand', fleet: true },
];

export function buildCustomers(now) {
  const r = rng(1337);
  const list = FIXED.map((c, i) => ({ ...c, registered: new Date(now - (300 - i * 20) * 86400_000).toISOString(), status: 'active', activity: 1.6 }));
  const seen = new Set(list.map(c => c.phone));
  for (let i = 0; list.length < 320; i++) {
    const female = r() < 0.28;
    const first = female ? FIRST_F[Math.floor(r() * FIRST_F.length)] : FIRST_M[Math.floor(r() * FIRST_M.length)];
    let last = LAST[Math.floor(r() * LAST.length)];
    if (female) last = last.endsWith('ov') || last.endsWith('ev') ? `${last}a` : last;
    const phone = `+998${['90', '91', '93', '94', '95', '97', '98', '99', '33', '88'][Math.floor(r() * 10)]}${String(Math.floor(r() * 1e7)).padStart(7, '0')}`;
    if (seen.has(phone)) continue;
    seen.add(phone);
    const [car, connector] = CARS[Math.floor(r() * CARS.length)];
    // Long-tail activity: most drivers charge a few times a month, some daily.
    const activity = Math.pow(r(), 2.2) * 2.4 + 0.05;
    const days = Math.floor(Math.pow(r(), 1.4) * 540);
    list.push({
      id: `usr-${String(1000 + i).padStart(4, '0')}`,
      name: `${first} ${last}`,
      phone,
      car,
      connector,
      city: HOME_CITIES[Math.floor(r() * HOME_CITIES.length)],
      registered: new Date(now - days * 86400_000 - Math.floor(r() * 86400_000)).toISOString(),
      status: r() < 0.012 ? 'blocked' : 'active',
      activity,
      fleet: false,
    });
  }
  return list;
}

const short = name => {
  const [a, b] = name.split(' ');
  return b ? `${a} ${b[0]}.` : a;
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Relative demand by Tashkent hour: low at night, peaks at lunch and evening. */
const HOUR_WEIGHT = [0.35, 0.25, 0.18, 0.14, 0.14, 0.22, 0.45, 0.8, 1.05, 1.0, 0.95, 1.0, 1.15, 1.2, 1.05, 1.0, 1.1, 1.35, 1.55, 1.5, 1.3, 1.05, 0.8, 0.55];
const HOURS = [...Array(24).keys()];
const WEEKDAY_WEIGHT = [0.9, 1.0, 1.02, 1.0, 1.08, 1.15, 0.95]; // Sun..Sat

function bandMultiplier(hour) {
  if (hour >= 23 || hour < 7) return 0.7;
  if (hour >= 17 && hour < 22) return 1.25;
  if (hour >= 10 && hour < 17) return 0.9;
  return 1;
}

function pickWeighted(r, items, weight) {
  const total = items.reduce((n, x) => n + weight(x), 0);
  let x = r() * total;
  for (const it of items) {
    x -= weight(it);
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Six weeks of sessions, their wallet transactions, a few failures, the
 * sessions running right now (one per occupied connector), and Payme/Click
 * top-ups. Returns them newest first, as the live collections are kept.
 */
export function buildHistory({ stations, customers, now }) {
  const r = rng(2026);
  const sessions = [];
  const byCity = new Map();
  for (const c of customers) {
    const list = byCity.get(c.city) ?? [];
    list.push(c);
    byCity.set(c.city, list);
  }
  const fleet = customers.filter(c => c.fleet && c.id !== 'acc-driver');
  const active = customers.filter(c => c.status === 'active');

  // The network grew through the period: newer weeks are a little busier.
  const startDay = new Date(now - HISTORY_DAYS * 86400_000);
  // Through today: today's sessions run up to twenty minutes ago.
  for (let d = 0; d <= HISTORY_DAYS; d++) {
    // Midnight in Tashkent of the d-th day, so hours and weekdays are local.
    const t = startDay.getTime() + d * 86400_000;
    const midnight = Math.floor((t + TASHKENT_MS) / 86400_000) * 86400_000 - TASHKENT_MS;
    const growth = 0.82 + 0.18 * (d / HISTORY_DAYS);
    const weekday = new Date(midnight + TASHKENT_MS).getUTCDay();
    for (const st of stations) {
      const expected = st.popularity * 2.3 * growth * WEEKDAY_WEIGHT[weekday] * (0.75 + st.connectors.length * 0.12);
      const count = Math.floor(expected + r());
      for (let k = 0; k < count; k++) {
        const hour = pickWeighted(r, HOURS, h => HOUR_WEIGHT[h]);
        const startMs = midnight + hour * 3600_000 + Math.floor(r() * 3600_000);
        if (startMs > now - 20 * 60_000) continue;
        const connector = st.connectors[Math.floor(r() * st.connectors.length)];
        const locals = byCity.get(st.city) ?? [];
        // Mostly locals, sometimes travellers; fleet cars on Tashkent DC.
        let customer;
        if (st.city === 'Toshkent' && connector.power >= 60 && r() < 0.12) customer = fleet[Math.floor(r() * fleet.length)];
        else if (locals.length && r() < 0.78) customer = pickWeighted(r, locals.filter(c => c.status === 'active'), c => c.activity);
        else customer = pickWeighted(r, active, c => c.activity);
        if (!customer) continue;

        const failed = r() < 0.025;
        const dc = connector.power >= 50;
        const energy = failed ? 0 : round(dc ? 12 + r() * 46 : 8 + r() * 26, 1);
        // DC tapers well below the charger's rating; on AC the car's onboard
        // charger (7–11 kW) is the limit, so AC sessions last hours.
        const kw = dc ? connector.power * (0.45 + r() * 0.3) : Math.min(connector.power, r() < 0.6 ? 11 : 7.4) * 0.95;
        const minutes = failed ? 1 : Math.max(8, Math.round((energy / kw) * 60 + r() * 6));
        const multiplier = bandMultiplier(hour);
        const price = Math.round(connector.price * multiplier);
        sessions.push({
          userId: customer.id,
          user: short(customer.name),
          stationId: st.id,
          stationName: st.name,
          operator: st.operator,
          operatorId: st.operatorId,
          connectorId: connector.id,
          connector: connector.type,
          start: new Date(startMs).toISOString(),
          end: new Date(startMs + minutes * 60_000).toISOString(),
          energy,
          cost: Math.round(energy * price),
          power: connector.power,
          basePrice: connector.price,
          multiplier,
          price,
          status: failed ? 'failed' : 'completed',
          commissionRate: op(st.operatorId).commission,
          // Fleet drivers charge the company car on the corporate account; the
          // demo driver also charges privately about half the time.
          corporate: customer.fleet && (customer.id !== 'acc-driver' || r() < 0.5),
          source: 'app',
        });
      }
    }
  }

  // A busy-but-not-full network right now: some connectors are mid-session.
  const running = [];
  const busy = new Set(['st-001:c2', 'st-002:c5', 'st-002:c6']);
  for (const st of stations.slice(6)) {
    for (const c of st.connectors) if (r() < 0.16 * st.popularity) busy.add(`${st.id}:${c.id}`);
  }
  const occupiedBy = new Set();
  for (const key of busy) {
    const [stationId, connectorId] = key.split(':');
    const st = stations.find(s => s.id === stationId);
    const connector = st.connectors.find(c => c.id === connectorId);
    connector.status = 'occupied';
    // Never the demo accounts: they must be free to start their own charge.
    let customer;
    do customer = pickWeighted(r, active, c => c.activity);
    while (customer.fleet || occupiedBy.has(customer.id));
    occupiedBy.add(customer.id);
    const minutesAgo = 4 + Math.floor(r() * 40);
    const hour = new Date(now + TASHKENT_MS).getUTCHours();
    const multiplier = bandMultiplier(hour);
    const price = Math.round(connector.price * multiplier);
    const energy = round(Math.min(connector.power * 0.85 * (minutesAgo / 60), 80), 1);
    running.push({
      userId: customer.id,
      user: short(customer.name),
      stationId,
      stationName: st.name,
      operator: st.operator,
      operatorId: st.operatorId,
      connectorId,
      connector: connector.type,
      start: new Date(now - minutesAgo * 60_000).toISOString(),
      end: null,
      energy,
      cost: Math.round(energy * price),
      power: connector.power,
      basePrice: connector.price,
      multiplier,
      price,
      status: 'active',
      commissionRate: op(st.operatorId).commission,
      corporate: false,
      source: 'app',
    });
  }
  // A handful of chargers are down for maintenance.
  for (const st of stations.slice(6)) {
    for (const c of st.connectors) if (c.status === 'available' && r() < 0.025) c.status = 'unavailable';
  }

  const all = [...sessions, ...running].sort((a, b) => a.start.localeCompare(b.start));
  let n = 10001;
  let t = 30001;
  const transactions = [];
  for (const s of all) {
    s.id = `S-${n++}`;
    if (s.status === 'active') continue;
    transactions.push({
      id: `TXN-${t++}`,
      sessionId: s.id,
      userId: s.userId,
      user: s.user,
      amount: s.cost,
      method: s.corporate ? 'Корпоративный счёт' : 'Кошелёк',
      status: s.status === 'failed' ? 'failed' : 'completed',
      time: s.end,
    });
  }

  // Wallet top-ups: what drivers spent came in through Payme and Click.
  const payments = [];
  const spentBy = new Map();
  for (const s of all) if (!s.corporate && s.status === 'completed') spentBy.set(s.userId, (spentBy.get(s.userId) ?? 0) + s.cost);
  for (const [userId, spent] of spentBy) {
    let left = spent * (1.05 + r() * 0.2);
    while (left > 0) {
      const amount = [50000, 100000, 100000, 150000, 200000, 300000, 500000][Math.floor(r() * 7)];
      const at = now - Math.floor(r() * HISTORY_DAYS * 86400_000);
      payments.push({
        id: `PAY-${Math.floor(r() * 0xffffffffff).toString(16).toUpperCase().padStart(10, '0')}`,
        provider: r() < 0.62 ? 'payme' : 'click',
        userId,
        walletId: userId,
        amount,
        status: r() < 0.03 ? 'cancelled' : 'paid',
        created: new Date(at).toISOString(),
        paidAt: new Date(at + 20_000).toISOString(),
        payme: null,
        click: null,
        seeded: true,
      });
      left -= amount;
    }
  }
  payments.sort((a, b) => b.created.localeCompare(a.created));

  return {
    sessions: all.reverse(),
    transactions: transactions.reverse(),
    payments,
    counters: { session: n, txn: t },
  };
}

/**
 * Monthly totals for the months before the detailed history, per operator,
 * on a growth curve that ends where the detailed data begins.
 */
export function buildMonthly({ sessions, now }) {
  const r = rng(99);
  const recent = sessions.filter(s => s.status === 'completed' && Date.parse(s.start) > now - 30 * 86400_000);
  const perOp = new Map();
  for (const s of recent) {
    const row = perOp.get(s.operatorId) ?? { sessions: 0, energy: 0, revenue: 0 };
    row.sessions += 1;
    row.energy += s.energy;
    row.revenue += s.cost;
    perOp.set(s.operatorId, row);
  }
  // Roll-ups cover the months up to and including the one in which the
  // detailed history starts (that month is only partly detailed); later
  // months are computed from sessions, so the two never overlap.
  const out = [];
  const d = new Date(now + TASHKENT_MS);
  const start = new Date(now - HISTORY_DAYS * 86400_000 + TASHKENT_MS);
  const startOffset = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - start.getUTCMonth();
  for (let m = startOffset + MONTHS_BEFORE - 1; m >= startOffset; m--) {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const o of OPERATORS) {
      const base = perOp.get(o.id);
      if (!base) continue;
      const since = Date.parse(o.since);
      if (date.getTime() < since) continue;
      const factor = Math.pow(0.86, m) * (0.94 + r() * 0.12);
      out.push({
        month,
        operatorId: o.id,
        sessions: Math.round(base.sessions * factor),
        energy: Math.round(base.energy * factor),
        revenue: Math.round(base.revenue * factor),
        commissionRate: o.commission,
      });
    }
  }
  return out;
}

// Eco profile — what driving electric actually saved, plus a little glory.
// (Moved out of server/api.js; registered by server.js after the core routes.)
import { db } from '../db.js';
import { api, bearer, requireAuth, round, tashkentHour } from '../api.js';

// ---------------------------------------------------------------------------
// Eco profile — what driving electric actually saved, plus a little glory.
// ---------------------------------------------------------------------------

// Petrol displaced per kWh minus grid emissions for Uzbekistan's mix; rough
// on purpose — this is motivation, not an emissions audit.
const CO2_KG_PER_KWH = 0.6;
const KM_PER_KWH = 5.5;
const CO2_KG_PER_TREE_YEAR = 21;

function ecoFor(userId) {
  const done = db.data.sessions.filter(s => s.userId === userId && s.status === 'completed');
  const kwh = round(done.reduce((n, s) => n + s.energy, 0), 1);
  const co2Kg = round(kwh * CO2_KG_PER_KWH, 1);
  const stationsVisited = new Set(done.map(s => s.stationId)).size;
  const greenHour = s => {
    const h = tashkentHour(new Date(s.start));
    return h >= 23 || h < 7;
  };

  return {
    sessions: done.length,
    kwh,
    co2Kg,
    trees: round(co2Kg / CO2_KG_PER_TREE_YEAR, 2),
    km: Math.round(kwh * KM_PER_KWH),
    stationsVisited,
    badges: [
      { id: 'first', title: 'Первая зарядка', description: 'Завершить первую сессию', earned: done.length >= 1 },
      { id: 'night', title: 'Ночная птица', description: 'Зарядиться в зелёные часы 23:00–07:00', earned: done.some(greenHour) },
      { id: 'green', title: 'Зелёный тариф', description: 'Сессия по сниженной цене', earned: done.some(s => (s.multiplier ?? 1) < 1) },
      { id: 'explorer', title: 'Исследователь', description: 'Зарядиться на 3 разных станциях', earned: stationsVisited >= 3 },
      { id: 'century', title: '100 кВт·ч', description: 'Накопить 100 кВт·ч', earned: kwh >= 100 },
    ],
  };
}

api.get('/eco/me', requireAuth('driver', 'business'), (req, res) => {
  res.json(ecoFor(req.account.id));
});

api.get('/eco/leaderboard', (req, res) => {
  const me = db.resolveToken(bearer(req))?.account?.id ?? null;
  const totals = new Map();
  for (const s of db.data.sessions) {
    if (s.status !== 'completed') continue;
    const row = totals.get(s.userId) ?? { userId: s.userId, name: s.user, kwh: 0 };
    row.kwh += s.energy;
    totals.set(s.userId, row);
  }
  // Public board: first name and an initial only.
  const shortName = n => {
    const [first, last] = String(n).split(' ');
    return last ? `${first} ${last[0]}.` : first;
  };
  const ranked = [...totals.values()]
    .sort((a, b) => b.kwh - a.kwh)
    .map((r, i) => ({
      rank: i + 1,
      name: shortName(r.name),
      kwh: round(r.kwh, 1),
      co2Kg: round(r.kwh * CO2_KG_PER_KWH, 1),
      me: r.userId === me,
    }));
  // Top ten, plus the caller's own row with their real rank if they are lower.
  const top = ranked.slice(0, 10);
  const mine = ranked.find(r => r.me);
  res.json(mine && mine.rank > 10 ? [...top, mine] : top);
});

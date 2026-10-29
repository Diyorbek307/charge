/**
 * Battery health from the driver's own charges.
 *
 * The honest measure is capacity: a fast charger reports the battery's
 * percentage (OCPP MeterValues, measurand "SoC"), so energy in over the
 * percent gained gives the kWh the pack really holds today. Against the
 * car's rated capacity that is its state of health. Charges without a
 * percentage still show how much power the car takes on fast chargers,
 * month by month — a battery that ages takes less.
 */
import { db } from './db.js';

/** Share of the metered energy that reaches the cells (losses in the car's charger and cables). */
const INTO_CELLS = 0.93;
const MIN_GAIN = 15;

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export function batteryHealthFor(account) {
  const car = account.car ?? null;
  const rated = car?.battery ?? null;
  const done = db.data.sessions
    .filter(s => s.userId === account.id && s.status === 'completed' && s.energy > 0)
    .sort((a, b) => a.start.localeCompare(b.start));

  // Capacity from each charge the charger told us the percentage for.
  const measured = done
    .filter(s => Number.isFinite(s.socStart) && Number.isFinite(s.socEnd) && s.socEnd - s.socStart >= MIN_GAIN)
    .map(s => ({ at: s.start, sessionId: s.id, station: s.stationName, from: s.socStart, to: s.socEnd, energy: s.energy, kwh: Math.round(((s.energy * INTO_CELLS) / ((s.socEnd - s.socStart) / 100)) * 10) / 10 }));
  const recent = measured.slice(-6);
  const capacity = median(recent.map(m => m.kwh));
  const soh = capacity && rated ? Math.min(100, Math.round((capacity / rated) * 100)) : null;
  // The first measurements against the latest: how fast it changes.
  const early = median(measured.slice(0, 3).map(m => m.kwh));
  const drift = capacity && early && measured.length >= 6 ? Math.round(((capacity - early) / early) * 1000) / 10 : null;

  // What the car takes on fast chargers, by month.
  const months = new Map();
  for (const s of done) {
    if ((s.power ?? 0) < 50) continue;
    const hours = (Date.parse(s.end ?? s.start) - Date.parse(s.start)) / 3_600_000;
    if (hours <= 0.05) continue;
    const can = Math.min(s.power, car?.maxKw ?? s.power);
    const key = s.start.slice(0, 7);
    const m = months.get(key) ?? { month: key, sum: 0, n: 0 };
    m.sum += Math.min(1, s.energy / hours / can);
    m.n++;
    months.set(key, m);
  }
  const acceptance = [...months.values()].map(m => ({ month: m.month, share: Math.round((m.sum / m.n) * 100), charges: m.n }));

  const fastShare = done.length ? done.filter(s => (s.power ?? 0) >= 50).length / done.length : 0;
  const full = done.filter(s => Number.isFinite(s.socEnd) && s.socEnd >= 95).length;
  const tips = [];
  if (fastShare > 0.7) tips.push('Почти все зарядки быстрые: ночная AC-зарядка бережнее для батареи');
  if (full >= 3) tips.push('Часто заряжаете до 100% — для каждого дня хватит 80%, батарея скажет спасибо');
  if (!tips.length) tips.push('Хорошая привычка: держите заряд между 20 и 80%, до 100% — перед дальней дорогой');

  return {
    car: car ? { brand: car.brand, model: car.model, year: car.year, rated } : null,
    soh,
    capacity,
    grade: soh === null ? null : soh >= 90 ? 'excellent' : soh >= 80 ? 'good' : 'attention',
    drift,
    measured: measured.slice(-12).reverse(),
    acceptance,
    charges: done.length,
    tips,
    reportId: `BH-${account.id.slice(-4).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
  };
}

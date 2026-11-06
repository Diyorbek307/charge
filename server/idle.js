import { db } from './db.js';
import { emit, onEvent } from './api.js';
import { setting } from './settings.js';

/**
 * The fee for staying at the connector after the charge is done, as Tesla
 * and Electrify America charge it: a car that has finished but is still
 * plugged in keeps the next driver waiting.
 *
 * Off by default; the admin switches it on and sets the free minutes, the
 * price a minute and a cap (server/settings.js, idle.*). When a charge ends
 * the driver is told how long they have. The minutes are counted only from
 * the station's own word that the cable was taken out (OCPP or OCPI status
 * back to "available"); a station that never says so never charges anyone.
 *
 * Taken from the driver's wallet, as far as it goes, and kept on the charge
 * (session.idle) and in db.data.idleFees for the networks' settlements.
 */

const WINDOW_MS = 6 * 3600_000;
const fees = () => (db.data.idleFees ??= []);
const paidFromWallet = s => !s.corporate && !s.credit && !s.direct && !s.familyOwner;

/** What the stay cost: the minutes past the free ones, at most the cap. */
export function idleFeeFor(minutes, { freeMin, perMin, maxMin }) {
  const billed = Math.min(Math.max(0, Math.floor(minutes) - freeMin), maxMin);
  return { billed, fee: billed * perMin };
}

const rules = () => ({ freeMin: setting('idle.freeMin'), perMin: setting('idle.perMin'), maxMin: setting('idle.maxMin') });

function warn(session) {
  const { freeMin, perMin } = rules();
  emit({
    type: 'session.idle.warn',
    portal: 'system',
    actor: 'Voli',
    message: `Освободите разъём на ${session.stationName} в течение ${freeMin} мин — дальше ${perMin.toLocaleString('ru-RU')} сум за минуту`,
    entity: session.id,
    payload: { userId: session.userId, freeMin, perMin },
  });
}

export function settleIdle(stationId, connectorId) {
  const now = Date.now();
  const session = db.data.sessions.find(
    s => s.status === 'completed' && s.stationId === stationId && s.connectorId === connectorId && !s.idle && s.end && now - Date.parse(s.end) < WINDOW_MS,
  );
  if (!session) return;
  const minutes = (now - Date.parse(session.end)) / 60000;
  const { billed, fee } = idleFeeFor(minutes, rules());
  session.idle = { minutes: Math.round(minutes), billed, fee: 0, at: new Date(now).toISOString() };
  if (fee > 0 && paidFromWallet(session)) {
    const wallet = db.data.wallets[session.userId];
    const taken = wallet ? Math.min(fee, Math.max(0, wallet.balance)) : 0;
    if (wallet) wallet.balance -= taken;
    session.idle.fee = taken;
    fees().unshift({ sessionId: session.id, userId: session.userId, operatorId: session.operatorId, stationId, minutes: billed, fee: taken, at: session.idle.at });
    emit({
      type: 'session.idle',
      portal: 'system',
      actor: 'Voli',
      message: `Простой после зарядки ${billed} мин на ${session.stationName}: списано ${taken.toLocaleString('ru-RU')} сум`,
      entity: session.id,
      payload: { userId: session.userId, minutes: billed, fee: taken },
    });
  }
  db.save();
}

export function startIdleFees() {
  onEvent(event => {
    if (!setting('idle.enabled') || event.payload?.simulated) return;
    if (event.type === 'session.stop') {
      const s = db.byId('sessions', event.entity);
      if (s && paidFromWallet(s)) warn(s);
    } else if (event.type === 'evse.status' && event.payload?.status === 'available' && ['OCPP', 'OCPI'].includes(event.actor)) {
      // Only the station's own word; a person switching the connector by hand is not proof the cable came out.
      settleIdle(event.payload.stationId, event.payload.connectorId);
    }
  });
}

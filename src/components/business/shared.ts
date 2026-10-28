import type { Session, Vehicle } from '../../lib/api';

/** Lapis — the fleet portal's accent, shared by its charts. */
export const FLEET = '#FFB000';

export type VehicleState = 'charging' | 'low' | 'ready';

/** What a car is doing now: charging if its driver has a running session, otherwise by battery. */
export function vehicleState(v: Vehicle, active: Session[]): VehicleState {
  if (active.some(s => s.userId === v.driverId && s.status === 'active')) return 'charging';
  return v.battery < 30 ? 'low' : 'ready';
}

export const VEHICLE_PILL: Record<VehicleState, { tone: 'sky' | 'amber' | 'green'; label: string }> = {
  charging: { tone: 'sky', label: 'Заряжается' },
  low: { tone: 'amber', label: 'Нужна зарядка' },
  ready: { tone: 'green', label: 'Готов к работе' },
};

/** Share of a monthly limit, with the colour the progress bar should take. */
export function limitShare(spent: number, limit: number) {
  const share = limit ? spent / limit : 0;
  return { share, color: share >= 1 ? '#EF4444' : share >= 0.8 ? '#F59E0B' : FLEET };
}

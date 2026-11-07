// Moved out of DriverApp.tsx: hm, APP_VERSION, statusColor.


/** Minutes as "25 мин" or "5 ч 10 мин". */
export const hm = (m: number) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`);

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '—';

export const statusColor: Record<string, string> = {
  available: '#22C55E',
  occupied: '#EF4444',
  unavailable: '#94A3B8',
  reserved: '#F59E0B',
};

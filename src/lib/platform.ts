/**
 * What the admin switched on and the numbers they set (server/settings.js),
 * as every app sees them: a feature that is off is hidden, a fee or limit
 * shown to the driver is the one in force.
 */
import { useSync } from './sync';
import type { PlatformSettings } from './api';

export type Feature = keyof PlatformSettings['features'];

const DEFAULTS: PlatformSettings = {
  features: { offline: true, navigator: true, battery: true, arrival: true, places: true, rewards: true, plus: true, autocharge: true, liveNotice: true, bookings: true, queue: true, sos: true, referral: true },
  booking: { fee: 2000, graceMin: 15 },
  topup: { min: 1000, max: 10_000_000, providers: ['payme', 'click', 'uzum', 'humo'] },
  queueHoldMin: 5,
  minPrepaidKwh: 5,
  onboarding: { intro: true, askLocation: true, askPush: true, tour: true, consentVersion: 1 },
};

/** The platform's switches and numbers; the defaults until the state arrives. */
export function usePlatform(): PlatformSettings {
  const { state } = useSync();
  return state?.platform ?? DEFAULTS;
}

export function useFeature(name: Feature): boolean {
  return usePlatform().features[name] !== false;
}

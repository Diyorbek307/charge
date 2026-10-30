/**
 * The landing and the app can be served from two sites (voli.uz and
 * app.voli.uz). These say where the other one is; empty means "this same
 * site", which is how one server runs everything locally and in tests.
 */
const clean = (url: string | undefined) => (url ?? '').trim().replace(/\/+$/, '');

/** Where the server's API lives. */
export const API_ORIGIN = clean(import.meta.env.VITE_API_URL);
/** The app's site, when this build is the landing. */
export const APP_URL = clean(import.meta.env.VITE_APP_URL);
/** The landing's site, when this build is the app. */
export const LANDING_URL = clean(import.meta.env.VITE_LANDING_URL);

const elsewhere = (url: string) => !!url && typeof window !== 'undefined' && url !== window.location.origin;
export const appElsewhere = () => elsewhere(APP_URL);
export const landingElsewhere = () => elsewhere(LANDING_URL);

/** Inside the store app the shell opens the app itself; it never leaves for the landing. */
export const inNativeShell = () =>
  typeof window !== 'undefined' && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

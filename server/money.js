/**
 * Real money or play money. The demo has sandbox merchant keys written in
 * the code and a button that tops a wallet up for free; that is fine while
 * nothing is real. The moment any payment system's real key is set, all of
 * that stops — even if DEMO_MODE was left on by mistake — so play money can
 * never pay for a charge on a real station.
 */

const DEMO_MODE = process.env.DEMO_MODE !== 'false';

const REAL_KEYS = ['PAYME_KEY', 'CLICK_SECRET_KEY', 'UZUM_SECRET', 'HUMO_SECRET', 'PAYNET_PASSWORD'];

/** Which real payment keys are set (names only). */
export const realPaymentKeys = () => REAL_KEYS.filter(k => Boolean(process.env[k]));

/** Some payment system takes real money here. */
export const realMoney = () => realPaymentKeys().length > 0;

/** The live server (Render, or NODE_ENV=production), not a laptop or a test run. */
const REAL_SERVER = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

/**
 * Sandbox keys, on-screen codes, the demo driver and free top-ups: only in a
 * demo with no real money. On the live server one real key ends them all;
 * locally, tests may run real keys beside the demo data.
 */
export const playMoney = () => DEMO_MODE && !(REAL_SERVER && realMoney());

/** A demo server that also takes real money: worth a warning to the admin. */
export const mixedMode = () => DEMO_MODE && realMoney();

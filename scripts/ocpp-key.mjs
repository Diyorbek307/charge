/**
 * Prints a charge point's own OCPP password, for its network to enter in the
 * charger's settings (Basic auth: user = station id, password = this key).
 *
 *   OCPP_PASSWORD=<the value from Render> node scripts/ocpp-key.mjs st-003
 */
import crypto from 'node:crypto';

const master = process.env.OCPP_PASSWORD;
const ids = process.argv.slice(2);
if (!master || !ids.length) {
  console.error('Usage: OCPP_PASSWORD=<key from Render> node scripts/ocpp-key.mjs <station id> [...]');
  process.exit(1);
}
// The same formula as stationKey() in server/ocpp.js.
for (const id of ids) console.log(`${id}\t${crypto.createHmac('sha256', master).update(`ocpp:${id}`).digest('base64url').slice(0, 32)}`);

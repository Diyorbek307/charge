import crypto from 'node:crypto';
import http2 from 'node:http2';

/**
 * Updates to the charge's Live Activity on iPhones, straight through Apple
 * (APNs), so the card on the lock screen moves with the app closed. Needs an
 * APNs key from the Apple developer account (Keys → Apple Push Notifications
 * service), set in Render:
 *   APNS_KEY      the .p8 file's text (BEGIN PRIVATE KEY … END PRIVATE KEY)
 *   APNS_KEY_ID   the key's 10-character id
 *   APNS_TEAM_ID  the team id
 *   APNS_TOPIC    the app's bundle id (uz.voli.app)
 *   APNS_SANDBOX  "true" for TestFlight/debug builds' tokens
 * Without them nothing is sent. Written ahead of the Apple account; checked
 * against Apple's documentation, not yet against a real device.
 */

const env = k => process.env[k] || '';
export const apnsConfigured = () => Boolean(env('APNS_KEY') && env('APNS_KEY_ID') && env('APNS_TEAM_ID'));

let jwt = { token: '', until: 0 };
/** Apple's provider token: ES256, refreshed every 50 minutes (Apple accepts up to an hour). */
function providerToken() {
  if (jwt.token && Date.now() < jwt.until) return jwt.token;
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: env('APNS_KEY_ID') });
  const body = b64({ iss: env('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) });
  const key = env('APNS_KEY').replace(/\\n/g, '\n');
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jwt = { token: `${head}.${body}.${sig}`, until: Date.now() + 50 * 60_000 };
  return jwt.token;
}

/**
 * One Live Activity update or end. `state` is ChargeAttributes.ContentState
 * (ios/VoliLiveActivity/Shared/ChargeAttributes.swift). Resolves to 'sent',
 * 'gone' (the activity ended or the token changed) or 'failed'.
 */
export function sendLiveActivity(token, { state, end = false, alert = null }) {
  if (!apnsConfigured()) return Promise.resolve('failed');
  const host = env('APNS_SANDBOX') === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aps: {
      timestamp: now,
      event: end ? 'end' : 'update',
      'content-state': state,
      ...(end ? { 'dismissal-date': now + 15 * 60 } : { 'stale-date': now + 30 * 60 }),
      ...(alert ? { alert } : {}),
    },
  };
  return new Promise(resolve => {
    let client;
    try {
      client = http2.connect(host);
    } catch {
      return resolve('failed');
    }
    client.on('error', () => resolve('failed'));
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': `${env('APNS_TOPIC') || 'uz.voli.app'}.push-type.liveactivity`,
      'apns-push-type': 'liveactivity',
      'apns-priority': end || alert ? '10' : '5',
      'content-type': 'application/json',
    });
    let status = 0;
    req.on('response', h => { status = Number(h[':status']); });
    req.setTimeout(10_000, () => { req.close(); resolve('failed'); });
    req.on('end', () => {
      client.close();
      resolve(status === 200 ? 'sent' : status === 410 || status === 400 ? 'gone' : 'failed');
    });
    req.on('error', () => resolve('failed'));
    req.end(JSON.stringify(payload));
  });
}

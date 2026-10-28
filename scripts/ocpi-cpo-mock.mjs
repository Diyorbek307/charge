/**
 * A pretend partner network that speaks OCPI 2.2.1 as a CPO: two stations in
 * Tashkent, tariffs in UZS, START/STOP commands, live sessions and CDRs.
 * It is what a real partner's back office does, small enough to read, so the
 * eMSP side (server/ocpi.js) can be shown and tested end to end.
 *
 * In the demo it is mounted inside the app at /demo-cpo. Standalone:
 *   node scripts/ocpi-cpo-mock.mjs        (PORT, default 4600)
 * then connect it in Admin → Операторы with the versions URL and token it prints.
 */
import crypto from 'node:crypto';
import express from 'express';
import { pathToFileURL } from 'node:url';

const now = () => new Date().toISOString();
const envelope = (data, status_code = 1000, status_message = 'Success') => ({ data, status_code, status_message, timestamp: now() });
const b64 = t => Buffer.from(t).toString('base64');

export function mockCpo({ base, name = 'Партнёр OCPI (демо)', partyId = 'DMO', tokenA = crypto.randomBytes(12).toString('hex'), meterEveryMs = 2000, speed = 1 } = {}) {
  const root = `${base.replace(/\/$/, '')}/ocpi`;
  const cpo = `${root}/cpo/2.2.1`;
  let tokenC = null;
  let emsp = null; // { token: B, versionsUrl, endpoints }

  const tariffs = [
    { country_code: 'UZ', party_id: partyId, id: 'T-DC', currency: 'UZS', elements: [{ price_components: [{ type: 'ENERGY', price: 2200, step_size: 1 }] }], last_updated: now() },
    { country_code: 'UZ', party_id: partyId, id: 'T-AC', currency: 'UZS', elements: [{ price_components: [{ type: 'ENERGY', price: 1400, step_size: 1 }] }], last_updated: now() },
  ];
  const evse = (uid, std, kw, tariff) => ({
    uid,
    evse_id: `UZ*${partyId}*E${uid}`,
    status: 'AVAILABLE',
    connectors: [{ id: '1', standard: std, format: std === 'IEC_62196_T2' ? 'SOCKET' : 'CABLE', power_type: std === 'IEC_62196_T2' ? 'AC_3_PHASE' : 'DC', max_voltage: 400, max_amperage: 32, max_electric_power: kw * 1000, tariff_ids: [tariff], last_updated: now() }],
    last_updated: now(),
  });
  const locations = [
    { country_code: 'UZ', party_id: partyId, id: 'LOC-1', publish: true, name: `${name.split(' (')[0]} · Chilonzor`, address: 'Bunyodkor ko‘chasi, 21', city: 'Toshkent', country: 'UZB', coordinates: { latitude: '41.2856', longitude: '69.2036' }, evses: [evse('1001', 'IEC_62196_T2_COMBO', 120, 'T-DC'), evse('1002', 'IEC_62196_T2', 22, 'T-AC')], opening_times: { twentyfourseven: true }, time_zone: 'Asia/Tashkent', last_updated: now() },
    { country_code: 'UZ', party_id: partyId, id: 'LOC-2', publish: true, name: `${name.split(' (')[0]} · Yunusobod`, address: 'Amir Temur shoh ko‘chasi, 108', city: 'Toshkent', country: 'UZB', coordinates: { latitude: '41.3647', longitude: '69.2855' }, evses: [evse('2001', 'IEC_62196_T2_COMBO', 60, 'T-DC')], opening_times: { twentyfourseven: true }, time_zone: 'Asia/Tashkent', last_updated: now() },
  ];
  const sessions = new Map(); // id -> { session, timer, kw }

  const tokenOf = req => {
    const m = String(req.headers.authorization ?? '').match(/^Token\s+(\S+)$/i);
    return m ? Buffer.from(m[1], 'base64').toString('utf8') : null;
  };
  const allow = (...accepted) => (req, res, next) => (accepted.some(t => t() && t() === tokenOf(req)) ? next() : res.status(401).json(envelope(null, 2000, 'Unauthorized')));
  const withA = allow(() => tokenA, () => tokenC);
  const withC = allow(() => tokenC);

  /** Calls the eMSP with the token B it gave us; finds its endpoints on first use. */
  async function toEmsp(module, path, method, body) {
    if (!emsp) return;
    if (!emsp.endpoints) {
      const auth = { Authorization: `Token ${b64(emsp.token)}` };
      const versions = await (await fetch(emsp.versionsUrl, { headers: auth })).json();
      const v = versions.data.find(x => x.version === '2.2.1');
      const details = await (await fetch(v.url, { headers: auth })).json();
      emsp.endpoints = Object.fromEntries(details.data.endpoints.filter(e => e.role === 'RECEIVER').map(e => [e.identifier, e.url]));
    }
    const url = `${emsp.endpoints[module]}${path}`;
    try {
      await fetch(url, { method, headers: { Authorization: `Token ${b64(emsp.token)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      /* a real CPO would retry; the demo does not need to */
    }
  }
  const pushEvse = (loc, e) => toEmsp('locations', `/UZ/${partyId}/${loc.id}/${e.uid}`, 'PATCH', { status: e.status, last_updated: now() });
  const findEvse = (locationId, evseUid) => {
    const loc = locations.find(l => l.id === locationId);
    return { loc, e: loc?.evses.find(x => x.uid === evseUid) };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/ocpi/versions', withA, (_req, res) => res.json(envelope([{ version: '2.2.1', url: `${root}/2.2.1` }])));
  router.get('/ocpi/2.2.1', withA, (_req, res) =>
    res.json(
      envelope({
        version: '2.2.1',
        endpoints: [
          { identifier: 'credentials', role: 'RECEIVER', url: `${root}/2.2.1/credentials` },
          { identifier: 'locations', role: 'SENDER', url: `${cpo}/locations` },
          { identifier: 'tariffs', role: 'SENDER', url: `${cpo}/tariffs` },
          { identifier: 'commands', role: 'RECEIVER', url: `${cpo}/commands` },
        ],
      }),
    ),
  );

  router.post('/ocpi/2.2.1/credentials', allow(() => tokenA), (req, res) => {
    const b = req.body ?? {};
    if (!b.token || !b.url) return res.status(400).json(envelope(null, 2001, 'token and url are required'));
    emsp = { token: b.token, versionsUrl: b.url, endpoints: null };
    tokenC = crypto.randomBytes(16).toString('hex');
    // Token A is single-use: from now on only token C opens this API.
    tokenA = null;
    res.json(envelope({ token: tokenC, url: `${root}/versions`, roles: [{ role: 'CPO', country_code: 'UZ', party_id: partyId, business_details: { name } }] }));
  });

  // Paginated list modules, two items per page so the eMSP has to follow Link.
  const page = (list, req, res, path) => {
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 1));
    const slice = list.slice(offset, offset + limit);
    if (offset + limit < list.length) res.set('Link', `<${cpo}/${path}?offset=${offset + limit}&limit=${limit}>; rel="next"`);
    res.set('X-Total-Count', String(list.length));
    res.json(envelope(slice));
  };
  router.get('/ocpi/cpo/2.2.1/locations', withC, (req, res) => page(locations, req, res, 'locations'));
  router.get('/ocpi/cpo/2.2.1/tariffs', withC, (req, res) => page(tariffs, req, res, 'tariffs'));

  router.post('/ocpi/cpo/2.2.1/commands/START_SESSION', withC, (req, res) => {
    const b = req.body ?? {};
    const { loc, e } = findEvse(b.location_id, b.evse_uid);
    if (!e || e.status !== 'AVAILABLE' || !b.token?.uid || !b.response_url) return res.json(envelope({ result: 'REJECTED', timeout: 30 }));
    res.json(envelope({ result: 'ACCEPTED', timeout: 30 }));
    setTimeout(async () => {
      const auth = { Authorization: `Token ${b64(emsp.token)}`, 'Content-Type': 'application/json' };
      await fetch(b.response_url, { method: 'POST', headers: auth, body: JSON.stringify({ result: 'ACCEPTED' }) }).catch(() => {});
      e.status = 'CHARGING';
      await pushEvse(loc, e);
      const id = `SES-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const session = {
        country_code: 'UZ', party_id: partyId, id, start_date_time: now(), kwh: 0,
        cdr_token: { uid: b.token.uid, type: b.token.type, contract_id: b.token.contract_id, country_code: b.token.country_code, party_id: b.token.party_id },
        auth_method: 'COMMAND', location_id: loc.id, evse_uid: e.uid, connector_id: b.connector_id ?? '1', currency: 'UZS', status: 'ACTIVE', last_updated: now(),
      };
      const kw = e.connectors[0].max_electric_power / 1000;
      const entry = { session, kw, tariff: tariffs.find(t => t.id === e.connectors[0].tariff_ids[0]) };
      entry.timer = setInterval(() => {
        session.kwh = Math.round((session.kwh + (kw * speed * meterEveryMs) / 3_600_000) * 1000) / 1000;
        toEmsp('sessions', `/UZ/${partyId}/${id}`, 'PATCH', { kwh: session.kwh, last_updated: now() });
      }, meterEveryMs);
      entry.timer.unref?.();
      sessions.set(id, entry);
      await toEmsp('sessions', `/UZ/${partyId}/${id}`, 'PUT', session);
    }, 30);
  });

  router.post('/ocpi/cpo/2.2.1/commands/STOP_SESSION', withC, (req, res) => {
    const entry = sessions.get(req.body?.session_id);
    if (!entry || entry.session.status !== 'ACTIVE') return res.json(envelope({ result: 'REJECTED', timeout: 30 }));
    res.json(envelope({ result: 'ACCEPTED', timeout: 30 }));
    setTimeout(async () => {
      clearInterval(entry.timer);
      const s = entry.session;
      // Never less than a little energy, so a quick demo still produces a bill.
      s.kwh = Math.max(s.kwh, 0.5);
      s.status = 'COMPLETED';
      s.end_date_time = now();
      const auth = { Authorization: `Token ${b64(emsp.token)}`, 'Content-Type': 'application/json' };
      await fetch(req.body.response_url, { method: 'POST', headers: auth, body: JSON.stringify({ result: 'ACCEPTED' }) }).catch(() => {});
      await toEmsp('sessions', `/UZ/${partyId}/${s.id}`, 'PATCH', { status: 'COMPLETED', kwh: s.kwh, end_date_time: s.end_date_time });
      const price = entry.tariff.elements[0].price_components[0].price;
      const cost = Math.round(s.kwh * price);
      await toEmsp('cdrs', '', 'POST', {
        country_code: 'UZ', party_id: partyId, id: `CDR-${s.id}`, session_id: s.id, start_date_time: s.start_date_time, end_date_time: s.end_date_time,
        cdr_token: s.cdr_token, auth_method: 'COMMAND', currency: 'UZS', total_energy: s.kwh, total_time: (Date.parse(s.end_date_time) - Date.parse(s.start_date_time)) / 3_600_000,
        total_cost: { excl_vat: Math.round(cost / 1.12), incl_vat: cost }, tariffs: [entry.tariff], last_updated: now(),
      });
      const { loc, e } = findEvse(s.location_id, s.evse_uid);
      e.status = 'AVAILABLE';
      await pushEvse(loc, e);
    }, 30);
  });

  return {
    router,
    get tokenA() {
      return tokenA;
    },
    versionsUrl: `${root}/versions`,
    /** After a restart: pick up the credentials both sides already hold, instead of registering again. */
    restore: ({ tokenB, versionsUrl, tokenC: c }) => {
      emsp = { token: tokenB, versionsUrl, endpoints: null };
      tokenC = c;
      tokenA = null;
    },
    /** Test helper: change an EVSE status and push it, as a real charger would. */
    setStatus: async (locationId, evseUid, status) => {
      const { loc, e } = findEvse(locationId, evseUid);
      e.status = status;
      await pushEvse(loc, e);
    },
  };
}

// Standalone run.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || 4600;
  const cpo = mockCpo({ base: `http://127.0.0.1:${port}`, tokenA: process.env.TOKEN_A || undefined });
  const app = express();
  app.use(cpo.router);
  app.listen(port, () => console.log(`OCPI CPO mock\n  versions URL: ${cpo.versionsUrl}\n  token A:      ${cpo.tokenA}`));
}

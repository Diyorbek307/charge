import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Copy, CheckCircle, ChevronDown, Zap, Lock, Globe, Activity, Play, Radio, Bell, Clock,
  AlertCircle, RefreshCw, Cpu, Map as MapIcon, Rocket,
} from 'lucide-react';
import WebhooksLive from './WebhooksLive';
import { tokenStore } from '../lib/api';
import { BRAND } from '../brand';

type Section = 'overview' | 'auth' | 'stations' | 'tariffs' | 'events' | 'webhooks' | 'ocpp' | 'errors' | 'roadmap' | 'status';

const ORIGIN = typeof location !== 'undefined' ? location.origin : 'https://<host>';
const BASE = `${ORIGIN}/api`;

const METHOD: Record<string, string> = {
  GET: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  POST: 'bg-green-500/15 text-green-400 border border-green-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

type Param = { name: string; type: string; required?: boolean; desc: string };
type Endpoint = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  desc: string;
  auth: 'none' | 'partner';
  params?: Param[];
  request?: object;
  response: object;
  errors?: { code: number; reason: string }[];
  /** Safe to call from the docs with the signed-in partner's token. */
  tryable?: boolean;
};

const STATION_EXAMPLE = {
  id: 'st-001',
  name: 'Toshkent Siti Hub',
  operator: { id: 'op-001', name: 'GreenCharge UZ' },
  address: 'Amir Temur ko‘chasi, 107',
  city: 'Toshkent',
  location: { lat: 41.3111, lng: 69.2797 },
  hours: '24/7',
  amenities: ['Wi-Fi', 'Кафе'],
  rating: 4.8,
  reviews: 124,
  status: 'available',
  accepting: true,
  connectors: [
    { id: 'c1', type: 'CCS2', powerKw: 150, priceUzsPerKwh: 1950, status: 'available' },
    { id: 'c2', type: 'Type 2', powerKw: 22, priceUzsPerKwh: 1200, status: 'occupied' },
  ],
};

const ENDPOINTS: Record<'auth' | 'stations' | 'tariffs' | 'events', Endpoint[]> = {
  auth: [
    {
      method: 'POST', path: '/auth/login', auth: 'none',
      desc: 'Вход партнёрского аккаунта. Возвращает bearer-токен для заголовка Authorization. Токен действует, пока используется: без запросов 60 дней — истекает.',
      request: { portal: 'api', login: 'partner@example.uz', password: '••••••••' },
      response: { token: '9f2c…e41a', user: { id: 'acc-partner', portal: 'api', name: 'Integration Partner', org: 'Partner Sandbox' } },
      errors: [{ code: 400, reason: 'Не указан портал, логин или пароль' }, { code: 401, reason: 'Неверный логин или пароль' }, { code: 403, reason: 'Аккаунт заблокирован' }],
    },
    {
      method: 'GET', path: '/auth/me', auth: 'partner', tryable: true,
      desc: 'Проверить токен и получить профиль аккаунта.',
      response: { user: { id: 'acc-partner', portal: 'api', name: 'Integration Partner', org: 'Partner Sandbox', twoFactorEnabled: false } },
      errors: [{ code: 401, reason: 'Токен недействителен или истёк' }],
    },
    {
      method: 'POST', path: '/auth/logout', auth: 'partner',
      desc: 'Отозвать текущий токен.',
      response: { ok: true },
    },
  ],
  stations: [
    {
      method: 'GET', path: '/partner/stations', auth: 'partner', tryable: true,
      desc: 'Станции сети со статусом каждого разъёма в реальном времени. Цена — базовая, сум за кВт·ч; итоговая зависит от времени суток (см. «Тарифы»).',
      params: [
        { name: 'city', type: 'string', desc: 'Город, как в поле city: Toshkent, Samarqand…' },
        { name: 'status', type: 'string', desc: 'available | occupied | unavailable — статус станции целиком' },
        { name: 'type', type: 'string', desc: 'Тип разъёма: CCS2, GB/T DC, Type 2, CHAdeMO' },
        { name: 'minPower', type: 'number', desc: 'Хотя бы один разъём не слабее, кВт' },
        { name: 'limit', type: 'number', desc: 'До 200, по умолчанию 50' },
        { name: 'offset', type: 'number', desc: 'Смещение для постраничной выдачи' },
      ],
      response: { total: 33, limit: 50, offset: 0, items: [STATION_EXAMPLE], updated: '2026-10-28T09:41:00.000Z' },
      errors: [{ code: 401, reason: 'Нет токена' }, { code: 403, reason: 'Токен не партнёрского аккаунта' }],
    },
    {
      method: 'GET', path: '/partner/stations/{id}', auth: 'partner', tryable: true,
      desc: 'Одна станция по ID.',
      response: STATION_EXAMPLE,
      errors: [{ code: 404, reason: 'Станция не найдена' }],
    },
  ],
  tariffs: [
    {
      method: 'GET', path: '/tariffs/forecast', auth: 'none', tryable: true,
      desc: 'Множители цены по часам на ближайшие сутки (время Ташкента) и ближайшее самое дешёвое окно. Итоговая цена = базовая цена разъёма × множитель часа старта; тариф фиксируется в момент старта.',
      response: {
        timezone: 'Asia/Tashkent',
        currentHour: 9,
        current: { hour: 9, band: 'standard', multiplier: 1 },
        hours: [{ hour: 0, band: 'green', multiplier: 0.7 }, { hour: 10, band: 'day', multiplier: 0.9 }, { hour: 18, band: 'peak', multiplier: 1.25 }],
        bestWindow: { from: 23, to: 7, multiplier: 0.7, startsInHours: 14 },
      },
    },
  ],
  events: [
    {
      method: 'GET', path: '/events', auth: 'partner', tryable: true,
      desc: 'Последние события сети в обезличенном виде: старты и завершения зарядок, статусы разъёмов, подключение станций. Без персональных данных и сумм.',
      params: [{ name: 'limit', type: 'number', desc: 'До 300, по умолчанию 60' }],
      response: [{ id: 'EV-1042', type: 'session.start', portal: 'system', actor: 'Сеть', message: 'Старт зарядки · Toshkent Siti Hub', entity: 'S-2231', payload: { stationId: 'st-001', connectorId: 'c1' }, ts: '2026-10-28T09:40:12.000Z' }],
    },
    {
      method: 'POST', path: '/stream/ticket', auth: 'partner',
      desc: 'Одноразовый тикет на 60 секунд для подписки на поток событий (Server-Sent Events): GET /stream?ticket=…',
      response: { ticket: 'b7e1…90af' },
    },
  ],
};

function useCopy() {
  const [copied, setCopied] = useState('');
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1600);
  };
  return { copied, copy };
}

function Code({ id, text, color = 'text-emerald-300' }: { id: string; text: string; color?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="relative group">
      <button onClick={() => copy(id, text)} aria-label="Скопировать" className={`absolute top-2 right-2 text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 ${copied === id ? 'text-green-400' : 'text-slate-400 hover:text-white'}`}>
        {copied === id ? <CheckCircle size={11} /> : <Copy size={11} />}
      </button>
      <pre data-no-translate className={`bg-slate-950 ${color} rounded-xl p-4 pr-10 text-xs overflow-x-auto font-mono leading-relaxed border border-slate-700/50`}>{text}</pre>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('st-001');
  const [result, setResult] = useState<{ status: number; ms: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const token = tokenStore.get('api');

  const run = async () => {
    setBusy(true);
    const path = ep.path.replace('{id}', encodeURIComponent(id));
    const t0 = performance.now();
    try {
      const res = await fetch(`/api${path}${ep.path === '/events' ? '?limit=5' : ep.path === '/partner/stations' ? '?limit=2' : ''}`, {
        headers: ep.auth === 'partner' && token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON */
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - t0), body: body.length > 6000 ? `${body.slice(0, 6000)}\n…` : body });
    } catch (e) {
      setResult({ status: 0, ms: 0, body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${open ? 'border-slate-600 bg-slate-800/40' : 'border-slate-700/50 hover:border-slate-600'}`}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-3 px-5 py-3.5 text-left">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 font-mono ${METHOD[ep.method]}`}>{ep.method}</span>
        <span className="font-mono text-sm text-slate-200 flex-1 break-all">{ep.path}</span>
        {ep.auth === 'partner' && <Lock size={12} className="text-slate-500 shrink-0" aria-label="Нужен токен" />}
        <ChevronDown size={14} className={`text-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-700/50 px-5 py-4 space-y-4">
          <p className="text-sm text-slate-400">{ep.desc}</p>
          {ep.params && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-2">ПАРАМЕТРЫ ЗАПРОСА</p>
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                {ep.params.map(p => (
                  <div key={p.name} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 border-b border-slate-700/50 last:border-none">
                    <span className="font-mono text-xs text-sky-300 w-24">{p.name}</span>
                    <span className="text-xs text-slate-500 w-14">{p.type}</span>
                    <span className="text-xs text-slate-400 flex-1 min-w-[160px]">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ep.request && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-2">ТЕЛО ЗАПРОСА</p>
              <Code id={`req${ep.path}`} text={JSON.stringify(ep.request, null, 2)} />
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-2">ОТВЕТ 200</p>
            <Code id={`res${ep.path}`} text={JSON.stringify(ep.response, null, 2)} color="text-sky-300" />
          </div>
          {ep.errors && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 tracking-wider">ОШИБКИ</p>
              {ep.errors.map(e => (
                <div key={e.code} className="flex items-center gap-3 text-xs">
                  <span className="bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-mono font-bold">{e.code}</span>
                  <span className="text-slate-400">{e.reason}</span>
                </div>
              ))}
            </div>
          )}
          {ep.tryable && (
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-700/50 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-slate-400 break-all flex-1">{`${BASE}${ep.path.replace('{id}', id)}`}</span>
                {ep.path.includes('{id}') && <input value={id} onChange={e => setId(e.target.value)} aria-label="ID станции" className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-200" />}
                <button onClick={run} disabled={busy || (ep.auth === 'partner' && !token)} className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                  {busy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}Отправить
                </button>
              </div>
              {ep.auth === 'partner' && !token && <p className="text-xs text-amber-400">Войдите в портал партнёра, чтобы отправлять запросы с вашим токеном.</p>}
              {result && (
                <div className="border-t border-slate-700/50 pt-3">
                  <p className="text-[10px] mb-2 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-bold border ${result.status >= 200 && result.status < 300 ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}>{result.status || 'сеть'}</span>
                    <span className="text-slate-500">{`${result.ms} мс · настоящий ответ сервера`}</span>
                  </p>
                  <pre className="text-xs font-mono text-sky-300 leading-relaxed overflow-x-auto max-h-80">{result.body}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function H({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-white">{children}</h2>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Overview({ go }: { go: (s: Section) => void }) {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{`${BRAND.name} Partner API`}</h1>
        <p className="text-slate-400 mt-2 text-sm leading-relaxed">Данные сети зарядных станций Узбекистана для навигаторов, сервисов автопарков, автодилеров и роуминг-партнёров: станции и статусы разъёмов в реальном времени, тарифы по часам, события сети и вебхуки. Для операторов станций — подключение зарядных устройств по OCPP 1.6-J.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          ['Базовый адрес', `${BASE}`],
          ['Формат', 'JSON, UTF-8, время в ISO 8601 (UTC)'],
          ['Авторизация', 'Authorization: Bearer <token>'],
          ['Деньги', 'целые сумы (UZS), цена за кВт·ч'],
        ].map(([k, v]) => (
          <div key={k} className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3">
            <p className="text-[11px] text-slate-500">{k}</p>
            <p className="text-sm text-slate-200 font-mono break-all">{v}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-2">Быстрый старт</p>
        <Code id="quick" text={`# 1. Get a token\nTOKEN=$(curl -s -X POST ${BASE}/auth/login \\\n  -H 'Content-Type: application/json' \\\n  -d '{"portal":"api","login":"partner@example.uz","password":"…"}' | jq -r .token)\n\n# 2. Free fast chargers in Tashkent\ncurl -s "${BASE}/partner/stations?city=Toshkent&status=available&minPower=50" \\\n  -H "Authorization: Bearer $TOKEN"`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          ['stations', <MapIcon size={16} />, 'Станции', 'Статусы разъёмов и цены'],
          ['webhooks', <Bell size={16} />, 'Вебхуки', 'События с подписью HMAC'],
          ['ocpp', <Cpu size={16} />, 'OCPP 1.6-J', 'Подключение зарядок'],
        ] as const).map(([id, icon, t, d]) => (
          <button key={id} onClick={() => go(id)} className="text-left bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-xl p-4">
            <span className="text-sky-400">{icon}</span>
            <p className="text-sm font-semibold text-white mt-2">{t}</p>
            <p className="text-xs text-slate-400">{d}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Доступ выдаётся по заявке: {BRAND.email}. Обратно несовместимые изменения анонсируем минимум за 30 дней.</p>
    </div>
  );
}

const VERIFY_NODE = `import crypto from 'node:crypto';

// header: X-OneCharge-Signature: t=1730108472,v1=5f2b…
export function verify(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 ?? ''));
}`;

const VERIFY_PY = `import hmac, hashlib, time

def verify(raw_body: bytes, header: str, secret: str, tolerance=300) -> bool:
    parts = dict(p.split('=', 1) for p in header.split(','))
    t = int(parts.get('t', 0))
    if not t or abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get('v1', ''))`;

function Webhooks() {
  return (
    <div className="max-w-3xl space-y-6">
      <H sub="Сервер сам присылает события на ваш HTTPS-адрес — не нужно опрашивать API.">Вебхуки</H>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {[
          ['События', 'session.start, session.stop, evse.status, alert.new, alert.ack, wallet.topup, operator.status'],
          ['Повторы', 'при ошибке: через 30 с, 2 мин, 10 мин, 1 ч и 6 ч; 4xx (кроме 408/429) — без повторов'],
          ['Подпись', 'HMAC-SHA256 от «timestamp.тело» секретом endpoint’а'],
          ['Адреса', 'только публичные; внутренние сети и редиректы отклоняются'],
        ].map(([k, v]) => (
          <div key={k} className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3">
            <p className="text-[11px] text-slate-500">{k}</p>
            <p className="text-slate-200 text-xs mt-0.5">{v}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-2">Что приходит</p>
        <Code id="wh-body" text={`POST /your/endpoint\nX-OneCharge-Event: session.start\nX-OneCharge-Timestamp: 1730108472\nX-OneCharge-Signature: t=1730108472,v1=5f2b…\n\n{\n  "id": "EV-1042",\n  "type": "session.start",\n  "created": "2026-10-28T09:41:12.000Z",\n  "data": { "message": "Старт зарядки · Toshkent Siti Hub", "stationId": "st-001", "connectorId": "c1" }\n}`} />
        <p className="text-xs text-slate-500 mt-2">Данные обезличены: без водителей и сумм. Ответьте 2xx в течение 10 секунд; обработку делайте асинхронно и по полю id отбрасывайте дубли.</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div><p className="text-xs font-semibold text-slate-400 mb-2">Проверка подписи — Node.js</p><Code id="v-node" text={VERIFY_NODE} /></div>
        <div><p className="text-xs font-semibold text-slate-400 mb-2">Проверка подписи — Python</p><Code id="v-py" text={VERIFY_PY} /></div>
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-2">Управление</p>
        <Code id="wh-api" text={`GET    /webhooks                       your endpoints\nPOST   /webhooks                       { "url": "https://…", "events": ["session.start"] } → secret (shown once)\nPOST   /webhooks/{id}/toggle           enable / disable\nPOST   /webhooks/{id}/test             send a test event\nDELETE /webhooks/{id}\nGET    /webhooks/deliveries            delivery log\nPOST   /webhooks/deliveries/{id}/retry retry a delivery\nGET    /webhooks/events                event types`} />
      </div>
      <WebhooksLive />
    </div>
  );
}

function Ocpp() {
  return (
    <div className="max-w-3xl space-y-6">
      <H sub="Для операторов: зарядные устройства подключаются к центральной системе напрямую.">OCPP 1.6-J</H>
      <Code id="ocpp-url" text={`${ORIGIN.replace(/^http/, 'ws')}/ocpp/<station-id>\nSubprotocol: ocpp1.6\nAuth: Basic — user: station ID, password: the network OCPP key`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-slate-500 mb-2">ОТ СТАНЦИИ</p>
          <p className="font-mono text-slate-200 leading-6">BootNotification · Heartbeat · StatusNotification · Authorize · StartTransaction · MeterValues · StopTransaction</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-slate-500 mb-2">К СТАНЦИИ</p>
          <p className="font-mono text-slate-200 leading-6">RemoteStartTransaction · RemoteStopTransaction · Reset · TriggerMessage · UnlockConnector</p>
        </div>
      </div>
      <p className="text-sm text-slate-400">Энергия для счёта берётся из MeterValues и StopTransaction станции. Проверить без железа можно симулятором из репозитория:</p>
      <Code id="sim" text={`node scripts/ocpp-simulator.mjs --url ${ORIGIN.replace(/^http/, 'ws')} --station st-001`} />
    </div>
  );
}

function Errors() {
  return (
    <div className="max-w-3xl space-y-4">
      <H sub="Ошибка — это код HTTP и JSON с понятным текстом.">Ошибки</H>
      <Code id="err" text={`HTTP/1.1 409 Conflict\n\n{ "error": "Коннектор уже занят" }`} />
      <div className="rounded-xl border border-slate-700 overflow-hidden text-xs">
        {[
          [400, 'Неверные параметры или тело запроса'],
          [401, 'Нет токена, он истёк или отозван'],
          [403, 'Токен другого типа аккаунта или нет прав на объект'],
          [404, 'Объект не найден'],
          [409, 'Конфликт состояния: разъём занят, событие уже обработано'],
          [429, 'Слишком много запросов — повторите позже'],
          [500, 'Ошибка на нашей стороне — повторите с паузой'],
        ].map(([c, t]) => (
          <div key={c} className="flex gap-3 px-4 py-2.5 border-b border-slate-700/50 last:border-0">
            <span className="font-mono font-bold text-red-400 w-10">{c}</span>
            <span className="text-slate-400">{t}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Текст ошибки — для людей, на русском; ветвите логику по коду HTTP.</p>
    </div>
  );
}

function Roadmap() {
  const items: [string, string, string][] = [
    ['OCPI 2.2.1', 'Роуминг с другими сетями: Locations, Sessions, CDRs, Tariffs, Commands', 'в плане'],
    ['Удалённый запуск для партнёров', 'Старт и стоп зарядки из приложения партнёра от имени водителя (OAuth)', 'в плане'],
    ['API-ключи', 'Долгоживущие ключи с правами на чтение/запись вместо входа по паролю', 'в плане'],
    ['OCPP 2.0.1', 'Новые станции: ISO 15118 Plug & Charge, смарт-зарядка', 'в плане'],
    ['Счета и CDR для партнёров', 'Выгрузка детализированных записей зарядок за период', 'в плане'],
  ];
  return (
    <div className="max-w-3xl space-y-4">
      <H sub="Этого ещё нет в API. Порядок зависит от запросов партнёров — расскажите, что нужно вам.">Дорожная карта</H>
      {items.map(([t, d, when]) => (
        <div key={t} className="flex items-start gap-3 bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
          <Rocket size={15} className="text-violet-400 mt-0.5 shrink-0" />
          <div className="flex-1"><p className="text-sm font-semibold text-white">{t}</p><p className="text-xs text-slate-400">{d}</p></div>
          <span className="text-[11px] text-violet-300 bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 rounded shrink-0">{when}</span>
        </div>
      ))}
    </div>
  );
}

/** Measured from this browser, now — not a marketing number. */
function Status() {
  const [checks, setChecks] = useState<{ name: string; ok: boolean; ms: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const probe = async (name: string, url: string) => {
      const t0 = performance.now();
      try {
        const r = await fetch(url, { cache: 'no-store' });
        return { name, ok: r.ok, ms: Math.round(performance.now() - t0) };
      } catch {
        return { name, ok: false, ms: Math.round(performance.now() - t0) };
      }
    };
    setChecks([await probe('Сервер (/health)', '/health'), await probe('Тарифы (/api/tariffs/forecast)', '/api/tariffs/forecast'), await probe('Список событий (/api/webhooks/events)', '/api/webhooks/events')]);
    setBusy(false);
  };
  useEffect(() => {
    void run();
  }, []);
  return (
    <div className="max-w-3xl space-y-4">
      <H sub="Проверка прямо сейчас из вашего браузера.">Статус</H>
      {checks.map(c => (
        <div key={c.name} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3 text-sm">
          <span className={`w-2 h-2 rounded-full ${c.ok ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="flex-1 text-slate-200">{c.name}</span>
          <span className={c.ok ? 'text-green-400' : 'text-red-400'}>{c.ok ? 'работает' : 'недоступен'}</span>
          <span className="text-slate-500 tabular-nums w-16 text-right">{`${c.ms} мс`}</span>
        </div>
      ))}
      <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 text-xs text-sky-400 disabled:opacity-50"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} />Проверить ещё раз</button>
    </div>
  );
}

const NAV: { label: string; items: { id: Section; label: string; icon: ReactNode }[] }[] = [
  { label: 'НАЧАЛО', items: [
    { id: 'overview', label: 'Обзор', icon: <Globe size={14} /> },
    { id: 'auth', label: 'Авторизация', icon: <Lock size={14} /> },
    { id: 'errors', label: 'Ошибки', icon: <AlertCircle size={14} /> },
    { id: 'status', label: 'Статус', icon: <Activity size={14} /> },
  ] },
  { label: 'ДАННЫЕ', items: [
    { id: 'stations', label: 'Станции', icon: <Zap size={14} /> },
    { id: 'tariffs', label: 'Тарифы', icon: <Clock size={14} /> },
    { id: 'events', label: 'События и поток', icon: <Radio size={14} /> },
  ] },
  { label: 'ИНТЕГРАЦИЯ', items: [
    { id: 'webhooks', label: 'Вебхуки', icon: <Bell size={14} /> },
    { id: 'ocpp', label: 'OCPP 1.6-J', icon: <Cpu size={14} /> },
    { id: 'roadmap', label: 'Дорожная карта', icon: <Rocket size={14} /> },
  ] },
];

const TITLES: Record<string, [string, string]> = {
  auth: ['Авторизация', 'Партнёрский аккаунт выдаёт bearer-токен; передавайте его в заголовке Authorization.'],
  stations: ['Станции', 'Статусы разъёмов обновляются в реальном времени по OCPP и из приложения.'],
  tariffs: ['Тарифы', 'Цена зависит от часа старта зарядки: ночью дешевле, вечером в пик — дороже.'],
  events: ['События и поток', 'История событий сети и подписка на них в реальном времени без вебхуков.'],
};

export default function ApiDocsApp({ onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<Section>('overview');

  const content = (() => {
    switch (section) {
      case 'overview': return <Overview go={setSection} />;
      case 'webhooks': return <Webhooks />;
      case 'ocpp': return <Ocpp />;
      case 'errors': return <Errors />;
      case 'roadmap': return <Roadmap />;
      case 'status': return <Status />;
      default: {
        const [title, sub] = TITLES[section];
        return (
          <div className="max-w-3xl space-y-3">
            <H sub={sub}>{title}</H>
            {ENDPOINTS[section as keyof typeof ENDPOINTS].map(ep => <EndpointCard key={ep.method + ep.path} ep={ep} />)}
            {section === 'events' && (
              <Code id="sse" text={`// Live event stream — browser or Node 18+\nconst { ticket } = await (await fetch('${BASE}/stream/ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })).json();\nconst es = new EventSource('${BASE}/stream?ticket=' + ticket);\nes.onmessage = e => console.log(JSON.parse(e.data));`} />
            )}
          </div>
        );
      }
    }
  })();

  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
      <aside className="md:w-60 bg-slate-950 flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-slate-800">
        <div className="px-4 py-4 md:py-5 border-b border-slate-800 flex md:block items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-xs md:mb-4"><ArrowLeft size={13} />Назад</button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center"><Zap size={14} className="text-white" /></div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">{BRAND.name}</p>
              <p className="text-slate-500 text-[11px]">Partner API</p>
            </div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 md:gap-4 px-3 py-2 md:py-3 overflow-x-auto md:overflow-y-auto md:flex-1">
          {NAV.map(group => (
            <div key={group.label} className="flex md:block gap-1 shrink-0">
              <p className="hidden md:block text-[10px] font-bold text-slate-600 tracking-widest px-2 mb-1">{group.label}</p>
              {group.items.map(item => (
                <button key={item.id} onClick={() => setSection(item.id)} aria-current={section === item.id ? 'page' : undefined} className={`md:w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs whitespace-nowrap text-left ${section === item.id ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}>
                  {item.icon}{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-8 pb-24">{content}</div>
      </main>
    </div>
  );
}

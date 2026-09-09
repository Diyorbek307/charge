import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, Copy, CheckCircle, ChevronDown, Terminal,
  Zap, Lock, Globe, Activity, DollarSign, FileText, Play,
  Radio, Code2, BookOpen, Cpu, Bell, Clock, AlertCircle,
  Hash, ExternalLink, RefreshCw, Wifi, X, ChevronRight,
  BarChart3, Shield, Send,
} from 'lucide-react';

type Section =
  | 'overview' | 'auth' | 'locations' | 'sessions' | 'cdr'
  | 'remote' | 'reservations' | 'tokens' | 'settlement'
  | 'webhooks' | 'sdk' | 'changelog' | 'status';

const BASE = 'https://api.onecharge.uz/v1';

const methodColor: Record<string, string> = {
  GET: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  POST: 'bg-green-500/15 text-green-400 border border-green-500/30',
  PUT: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border border-red-500/30',
  PATCH: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
};

const methodBg: Record<string, string> = {
  GET: 'bg-sky-500', POST: 'bg-green-500', PUT: 'bg-amber-500',
  DELETE: 'bg-red-500', PATCH: 'bg-violet-500',
};

type Endpoint = {
  method: string;
  path: string;
  desc: string;
  params?: { name: string; type: string; required: boolean; desc: string }[];
  request?: object;
  response: object;
  errors?: { code: number; reason: string }[];
};

const endpoints: Record<string, Endpoint[]> = {
  auth: [
    {
      method: 'POST', path: '/auth/token',
      desc: 'Получить OAuth2 access_token. Используйте client_credentials для server-to-server интеграций.',
      request: { client_id: 'op_live_xxxxx', client_secret: 'sk_live_xxxxx', grant_type: 'client_credentials', scope: 'ocpi:read ocpi:write sessions:manage' },
      response: { access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...', token_type: 'Bearer', expires_in: 3600, scope: 'ocpi:read ocpi:write sessions:manage', issued_at: '2026-09-07T10:00:00Z' },
      errors: [{ code: 401, reason: 'Неверный client_id или client_secret' }, { code: 400, reason: 'Не указан grant_type' }],
    },
    {
      method: 'POST', path: '/auth/refresh',
      desc: 'Обновить истёкший access_token без повторной аутентификации.',
      request: { refresh_token: 'rt_live_xxxxxxxx', grant_type: 'refresh_token' },
      response: { access_token: 'eyJhbGciOiJSUzI1NiJ9...', expires_in: 3600, issued_at: '2026-09-07T11:00:00Z' },
      errors: [{ code: 401, reason: 'refresh_token истёк или недействителен' }],
    },
    {
      method: 'GET', path: '/auth/me',
      desc: 'Информация о текущем авторизованном операторе и его разрешениях.',
      response: { operator_id: 'op-001', name: 'GreenCharge UZ', plan: 'enterprise', scopes: ['ocpi:read', 'ocpi:write', 'sessions:manage', 'settlement:read'], rate_limit: 1000, quota_used: 142 },
    },
  ],
  locations: [
    {
      method: 'GET', path: '/locations',
      desc: 'Список зарядных станций сети. Фильтрация по городу, статусу, типу разъёма. Пагинация cursor-based.',
      params: [
        { name: 'city', type: 'string', required: false, desc: 'ISO-код города: tashkent, samarkand, bukhara' },
        { name: 'status', type: 'enum', required: false, desc: 'AVAILABLE | OCCUPIED | FAULTED | OFFLINE' },
        { name: 'connector_type', type: 'enum', required: false, desc: 'CCS2 | CHAdeMO | Type2 | GB/T' },
        { name: 'limit', type: 'integer', required: false, desc: 'Макс. 100, по умолчанию 20' },
        { name: 'cursor', type: 'string', required: false, desc: 'Токен пагинации из предыдущего ответа' },
      ],
      response: {
        data: [{ id: 'LOC-001', name: 'Toshkent Siti Hub', address: 'Amir Temur 107B', city: 'Toshkent', coordinates: { lat: 41.2995, lng: 69.2401 }, evse_count: 4, available_count: 2, status: 'AVAILABLE', amenities: ['parking', 'wifi', 'cafe'] }],
        total: 108, cursor_next: 'cur_a3f9x2', has_more: true,
      },
    },
    {
      method: 'GET', path: '/locations/:id',
      desc: 'Полные данные станции включая все EVSE, разъёмы, тарифы и фотографии.',
      response: {
        id: 'LOC-001', name: 'Toshkent Siti Hub', operator: 'GreenCharge UZ', address: 'Amir Temur 107B', city: 'Toshkent',
        evses: [{ id: 'EVSE-001', status: 'AVAILABLE', connectors: [{ id: 'CONN-1', type: 'CCS2', power_kw: 150, price_per_kwh: 2000, currency: 'UZS' }], floor_level: 'B1' }],
        photos: ['https://cdn.onecharge.uz/stations/loc-001/main.jpg'],
        working_hours: '24/7', has_parking: true,
      },
    },
    {
      method: 'PUT', path: '/locations/:id',
      desc: 'Обновить данные станции. Изменения синхронизируются с OCPI-партнёрами в течение 60 секунд.',
      request: { name: 'Updated Station Name', address: 'New Street 42', working_hours: '08:00-22:00', amenities: ['parking', 'wifi'] },
      response: { id: 'LOC-001', updated: true, synced_at: '2026-09-07T12:30:00Z', ocpi_push_status: 'queued' },
    },
    {
      method: 'POST', path: '/locations/:id/evses',
      desc: 'Добавить новый EVSE к существующей станции.',
      request: { uid: 'EVSE-005', connectors: [{ type: 'CCS2', power_kw: 150, voltage: 920 }], floor_level: 'G' },
      response: { evse_id: 'EVSE-005', location_id: 'LOC-001', status: 'OFFLINE', created_at: '2026-09-07T12:00:00Z' },
    },
  ],
  sessions: [
    {
      method: 'GET', path: '/sessions',
      desc: 'История зарядных сессий с фильтрацией. Cursor-пагинация. Данные доступны до 2 лет.',
      params: [
        { name: 'from', type: 'ISO8601', required: false, desc: 'Начало периода' },
        { name: 'to', type: 'ISO8601', required: false, desc: 'Конец периода' },
        { name: 'status', type: 'enum', required: false, desc: 'ACTIVE | COMPLETED | INVALID' },
        { name: 'location_id', type: 'string', required: false, desc: 'Фильтр по станции' },
      ],
      response: {
        data: [{ id: 'S-10842', user_id: 'U-8831', location_id: 'LOC-001', evse_id: 'EVSE-001', start_time: '2026-09-07T10:23:04Z', end_time: '2026-09-07T11:05:41Z', energy_kwh: 38.4, cost: 76800, currency: 'UZS', status: 'COMPLETED', tariff_id: 'T-001' }],
        total: 10418, cursor_next: 'cur_s88kx1',
      },
    },
    {
      method: 'GET', path: '/sessions/:id',
      desc: 'Данные сессии. Для активных сессий включает real-time метрики (обновляются каждые 15с).',
      response: { id: 'S-10842', energy_kwh: 38.4, current_power_kw: 148.2, soc_percent: 80, cost: 76800, eta_minutes: 0, meter_values: [{ timestamp: '2026-09-07T10:45:00Z', energy_kwh: 22.1, power_kw: 143.5 }], status: 'COMPLETED' },
    },
    {
      method: 'GET', path: '/sessions/active',
      desc: 'Все активные сессии оператора в реальном времени.',
      response: { data: [{ id: 'S-10853', location_id: 'LOC-002', evse_id: 'EVSE-003', energy_kwh: 12.3, current_power_kw: 149.8, duration_minutes: 14, soc_percent: 45 }], count: 1 },
    },
  ],
  remote: [
    {
      method: 'POST', path: '/remote/start',
      desc: 'Удалённый запуск зарядки через OCPP RemoteStartTransaction. Ответ синхронный (таймаут 30с).',
      request: { location_id: 'LOC-001', evse_id: 'EVSE-001', connector_id: 'CONN-1', token: 'APP_U8831_TOKEN', tariff_id: 'T-001', max_cost_uzs: 100000 },
      response: { session_id: 'S-10853', status: 'ACCEPTED', message: 'RemoteStartTransaction accepted', ocpp_transaction_id: 42891, timestamp: '2026-09-07T13:10:00Z' },
      errors: [{ code: 409, reason: 'EVSE уже занят другой сессией' }, { code: 503, reason: 'Зарядная станция недоступна' }],
    },
    {
      method: 'POST', path: '/remote/stop',
      desc: 'Удалённая остановка активной сессии через OCPP RemoteStopTransaction.',
      request: { session_id: 'S-10853', reason: 'USER_REQUEST' },
      response: { session_id: 'S-10853', status: 'STOP_ACCEPTED', final_energy_kwh: 24.7, final_cost: 49400, cdr_id: 'CDR-10853' },
    },
    {
      method: 'POST', path: '/remote/reset',
      desc: 'Перезагрузить зарядную станцию. Тип: Soft (после сессий) или Hard (немедленно).',
      request: { location_id: 'LOC-001', evse_id: 'EVSE-001', type: 'Soft' },
      response: { accepted: true, estimated_restart_seconds: 45 },
    },
    {
      method: 'POST', path: '/remote/unlock',
      desc: 'Разблокировать разъём (UnlockConnector) при зависшей сессии.',
      request: { location_id: 'LOC-001', evse_id: 'EVSE-001', connector_id: 'CONN-1' },
      response: { status: 'Unlocked', connector_id: 'CONN-1' },
    },
  ],
  reservations: [
    {
      method: 'POST', path: '/reservations',
      desc: 'Забронировать разъём. Станция держит слот 15 минут после start_time.',
      request: { location_id: 'LOC-001', evse_id: 'EVSE-001', token: 'APP_U8831_TOKEN', start_time: '2026-09-08T10:00:00Z', duration_minutes: 60 },
      response: { reservation_id: 'RES-7821', status: 'ACCEPTED', hold_fee: 2000, expires_at: '2026-09-08T10:15:00Z', cancellation_policy: 'free_before_15min' },
    },
    {
      method: 'GET', path: '/reservations/:id',
      desc: 'Статус бронирования.',
      response: { reservation_id: 'RES-7821', status: 'ACTIVE', start_time: '2026-09-08T10:00:00Z', location: 'Toshkent Siti Hub', evse_id: 'EVSE-001' },
    },
    {
      method: 'DELETE', path: '/reservations/:id',
      desc: 'Отменить бронирование. Возврат средств согласно политике отмены.',
      response: { reservation_id: 'RES-7821', status: 'CANCELLED', refund_amount: 2000, refund_eta_hours: 24 },
    },
  ],
  cdr: [
    {
      method: 'GET', path: '/cdrs',
      desc: 'Charge Detail Records — итоговые финансовые записи завершённых сессий.',
      params: [
        { name: 'from', type: 'ISO8601', required: false, desc: 'Начало периода' },
        { name: 'to', type: 'ISO8601', required: false, desc: 'Конец периода' },
        { name: 'status', type: 'enum', required: false, desc: 'VALID | INVALID | PENDING' },
      ],
      response: {
        data: [{ id: 'CDR-10842', session_id: 'S-10842', operator_id: 'op-001', start: '2026-09-07T10:23:04Z', end: '2026-09-07T11:05:41Z', energy_kwh: 38.4, tariff: { price_per_kwh: 2000, currency: 'UZS' }, total_cost: 76800, commission: 2304, net_revenue: 74496, status: 'VALID' }],
        summary: { total_energy_kwh: 9842.1, total_revenue: 19684200, total_commission: 590526 },
      },
    },
    {
      method: 'GET', path: '/cdrs/:id',
      desc: 'Детальный CDR с разбивкой тарифов и meter values.',
      response: { id: 'CDR-10842', meter_start: 108420, meter_stop: 108804, meter_values_count: 42, charging_periods: [{ start_date_time: '2026-09-07T10:23:04Z', dimensions: [{ type: 'ENERGY', volume: 38.4 }] }] },
    },
  ],
  tokens: [
    {
      method: 'GET', path: '/tokens',
      desc: 'RFID и App-токены пользователей под управлением оператора.',
      response: { data: [{ uid: 'APP_U8831', type: 'APP_USER', valid: true, user_id: 'U-8831', last_used: '2026-09-07T11:05:41Z', whitelist: 'ALLOWED' }], total: 3218 },
    },
    {
      method: 'POST', path: '/tokens',
      desc: 'Создать новый RFID-токен (корпоративные карты, флот).',
      request: { uid: 'RFID_FLEET_001', type: 'RFID', user_ref: 'fleet-vehicle-12', whitelist: 'ALLOWED', group_id: 'corp-fleet-01' },
      response: { uid: 'RFID_FLEET_001', created: true, valid: true },
    },
    {
      method: 'POST', path: '/tokens/:uid/authorize',
      desc: 'Авторизовать токен (используется OCPP ChargePoint для проверки).',
      request: { uid: 'APP_U8831', location_id: 'LOC-001' },
      response: { allowed: true, token_type: 'APP_USER', tariff_id: 'T-001', max_energy_kwh: null, group_id: null },
    },
  ],
  settlement: [
    {
      method: 'GET', path: '/settlement/invoices',
      desc: 'Расчётные инвойсы D+2. Выплаты по рабочим дням через Центробанк УЗ.',
      response: {
        data: [{ id: 'INV-2026-08', period: '2026-08', gross_revenue: 176200000, commission: 5286000, net_payout: 170914000, sessions: 8821, energy_kwh: 88420, status: 'PAID', paid_at: '2026-09-02T10:00:00Z', iban: 'UZ12...4421' }],
      },
    },
    {
      method: 'GET', path: '/settlement/balance',
      desc: 'Текущий незакрытый баланс и дата следующего расчёта.',
      response: { pending_amount: 18450000, pending_sessions: 342, next_settlement_date: '2026-09-09', commission_rate: 0.03, currency: 'UZS' },
    },
    {
      method: 'GET', path: '/settlement/payouts',
      desc: 'История банковских переводов.',
      response: { data: [{ id: 'PAY-2026-0902', amount: 170914000, iban: 'UZ12...4421', bank: 'Uzpromstroybank', transferred_at: '2026-09-02T10:00:00Z', reference: 'ONECHARGE/2026-08/op-001' }] },
    },
  ],
  webhooks: [],
  sdk: [],
  changelog: [],
  status: [],
};

const webhookEvents = [
  {
    event: 'session.started',
    desc: 'Зарядная сессия успешно запущена (OCPP StartTransaction принят).',
    payload: { event: 'session.started', session_id: 'S-10853', location_id: 'LOC-001', evse_id: 'EVSE-001', user_id: 'U-8831', timestamp: '2026-09-07T13:10:05Z' },
    color: 'text-green-400',
  },
  {
    event: 'session.updated',
    desc: 'Обновление метрик активной сессии (каждые 60 секунд).',
    payload: { event: 'session.updated', session_id: 'S-10853', energy_kwh: 12.4, current_power_kw: 148.5, soc_percent: 47, cost: 24800, timestamp: '2026-09-07T13:11:05Z' },
    color: 'text-sky-400',
  },
  {
    event: 'session.stopped',
    desc: 'Зарядная сессия завершена. Содержит итоговые данные и CDR ID.',
    payload: { event: 'session.stopped', session_id: 'S-10853', final_energy_kwh: 38.4, final_cost: 76800, cdr_id: 'CDR-10853', stop_reason: 'EVDisconnected', timestamp: '2026-09-07T14:05:41Z' },
    color: 'text-amber-400',
  },
  {
    event: 'evse.status_changed',
    desc: 'Изменение статуса EVSE (AVAILABLE → OCCUPIED → FAULTED и т.д.).',
    payload: { event: 'evse.status_changed', location_id: 'LOC-001', evse_id: 'EVSE-001', old_status: 'AVAILABLE', new_status: 'OCCUPIED', timestamp: '2026-09-07T13:10:01Z' },
    color: 'text-violet-400',
  },
  {
    event: 'payment.success',
    desc: 'Оплата успешно проведена через Humo/Uzcard/Visa.',
    payload: { event: 'payment.success', session_id: 'S-10853', amount: 76800, currency: 'UZS', method: 'humo', last4: '4421', timestamp: '2026-09-07T14:05:45Z' },
    color: 'text-emerald-400',
  },
  {
    event: 'payment.failed',
    desc: 'Оплата отклонена. Требуется альтернативный способ оплаты.',
    payload: { event: 'payment.failed', session_id: 'S-10853', amount: 76800, reason: 'insufficient_funds', card_last4: '0012', timestamp: '2026-09-07T14:05:45Z' },
    color: 'text-red-400',
  },
  {
    event: 'cdr.created',
    desc: 'CDR сформирован и готов к расчёту. Синхронизируется с OCPI-партнёрами.',
    payload: { event: 'cdr.created', cdr_id: 'CDR-10853', session_id: 'S-10853', net_revenue: 74496, commission: 2304, status: 'VALID', timestamp: '2026-09-07T14:06:00Z' },
    color: 'text-pink-400',
  },
  {
    event: 'location.offline',
    desc: 'Станция потеряла связь с платформой (OCPP heartbeat timeout).',
    payload: { event: 'location.offline', location_id: 'LOC-007', evse_count: 4, last_seen: '2026-09-07T11:30:00Z', timestamp: '2026-09-07T11:33:00Z' },
    color: 'text-red-400',
  },
];

const sdkExamples: Record<'javascript' | 'python' | 'curl', Record<string, string>> = {
  javascript: {
    install: `npm install @onecharge/sdk`,
    auth: `import { OneCharge } from '@onecharge/sdk';

const client = new OneCharge({
  clientId: process.env.ONECHARGE_CLIENT_ID,
  clientSecret: process.env.ONECHARGE_CLIENT_SECRET,
});`,
    locations: `// Получить список станций
const { data, cursor_next } = await client.locations.list({
  city: 'tashkent',
  status: 'AVAILABLE',
  limit: 20,
});

// Детали станции
const station = await client.locations.get('LOC-001');
console.log(station.evses[0].connectors);`,
    sessions: `// Запустить зарядку
const session = await client.remote.start({
  locationId: 'LOC-001',
  evseId: 'EVSE-001',
  token: userToken,
  maxCostUzs: 100_000,
});

// Следить за прогрессом
const stream = client.sessions.stream(session.id);
stream.on('update', (data) => {
  console.log(\`\${data.energy_kwh} kWh · \${data.soc_percent}%\`);
});`,
    webhooks: `import express from 'express';
import { verifyWebhook } from '@onecharge/sdk';

const app = express();
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const event = verifyWebhook(req.body, req.headers['x-onecharge-signature']);

  if (event.type === 'session.stopped') {
    console.log('Сессия завершена:', event.data.final_energy_kwh, 'kWh');
  }
  res.json({ received: true });
});`,
  },
  python: {
    install: `pip install onecharge-sdk`,
    auth: `from onecharge import OneCharge
import os

client = OneCharge(
    client_id=os.environ["ONECHARGE_CLIENT_ID"],
    client_secret=os.environ["ONECHARGE_CLIENT_SECRET"],
)`,
    locations: `# Получить список станций
locations = client.locations.list(city="tashkent", status="AVAILABLE")
for loc in locations.data:
    print(f"{loc.name}: {loc.available_count}/{loc.evse_count} свободно")

# Детали станции
station = client.locations.get("LOC-001")`,
    sessions: `# Запустить зарядку
session = client.remote.start(
    location_id="LOC-001",
    evse_id="EVSE-001",
    token=user_token,
    max_cost_uzs=100_000,
)
print(f"Сессия: {session.session_id}")

# Получить активные сессии
active = client.sessions.list_active()
for s in active.data:
    print(f"{s.id}: {s.energy_kwh} kWh · {s.current_power_kw} kW")`,
    webhooks: `from flask import Flask, request
from onecharge import verify_webhook

app = Flask(__name__)

@app.route("/webhooks", methods=["POST"])
def webhook():
    event = verify_webhook(
        payload=request.data,
        signature=request.headers.get("X-OneCharge-Signature"),
    )
    if event.type == "session.stopped":
        print(f"Завершено: {event.data['final_energy_kwh']} kWh")
    return {"received": True}`,
  },
  curl: {
    install: `# Для работы с API вам нужен curl 7.x+`,
    auth: `# Получить токен
curl -X POST https://api.onecharge.uz/v1/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_id": "op_live_xxxxx",
    "client_secret": "sk_live_xxxxx",
    "grant_type": "client_credentials"
  }'`,
    locations: `# Список станций
curl -X GET "https://api.onecharge.uz/v1/locations?city=tashkent&status=AVAILABLE" \\
  -H "Authorization: Bearer eyJhbGci..."

# Детали станции
curl -X GET https://api.onecharge.uz/v1/locations/LOC-001 \\
  -H "Authorization: Bearer eyJhbGci..."`,
    sessions: `# Запустить зарядку
curl -X POST https://api.onecharge.uz/v1/remote/start \\
  -H "Authorization: Bearer eyJhbGci..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "location_id": "LOC-001",
    "evse_id": "EVSE-001",
    "token": "APP_U8831_TOKEN",
    "max_cost_uzs": 100000
  }'

# Активные сессии
curl -X GET https://api.onecharge.uz/v1/sessions/active \\
  -H "Authorization: Bearer eyJhbGci..."`,
    webhooks: `# Проверка подписи вручную
# X-OneCharge-Signature = HMAC-SHA256(raw_body, webhook_secret)

# Тестовый webhook (sandbox)
curl -X POST https://api.onecharge.uz/v1/webhooks/test \\
  -H "Authorization: Bearer eyJhbGci..." \\
  -d '{"event_type": "session.started"}'`,
  },
};

const changelog = [
  {
    version: '1.4.2', date: '2026-09-01', type: 'patch',
    changes: [
      { type: 'fix', text: 'Исправлен race condition при одновременном RemoteStart для одного EVSE' },
      { type: 'fix', text: 'CDR timestamp теперь всегда возвращает UTC с суффиксом Z' },
      { type: 'improvement', text: 'Время ответа /sessions/active снижено с 340мс до 48мс' },
    ],
  },
  {
    version: '1.4.0', date: '2026-08-15', type: 'minor',
    changes: [
      { type: 'new', text: 'Cursor-based пагинация во всех list-эндпоинтах (deprecated: offset/page)' },
      { type: 'new', text: 'Эндпоинт GET /sessions/active для real-time мониторинга' },
      { type: 'new', text: 'Поле max_cost_uzs в remote/start — автостоп по бюджету' },
      { type: 'new', text: 'Webhook событие payment.failed' },
      { type: 'improvement', text: 'OCPI 2.3.0 токен-обмен с роуминг-партнёрами' },
    ],
  },
  {
    version: '1.3.5', date: '2026-07-20', type: 'patch',
    changes: [
      { type: 'fix', text: 'Некорректный commission_rate для enterprise-планов' },
      { type: 'security', text: 'Refresh tokens теперь rotate при каждом использовании' },
    ],
  },
  {
    version: '1.3.0', date: '2026-06-10', type: 'minor',
    changes: [
      { type: 'new', text: 'POST /remote/reset и POST /remote/unlock' },
      { type: 'new', text: 'Settlement API v2: payouts, balance, invoice detail' },
      { type: 'new', text: 'Node.js + Python SDK (бета)' },
      { type: 'deprecation', text: 'POST /charge/start → заменён на POST /remote/start (до 1.5.0)' },
    ],
  },
];

const statusServices = [
  { name: 'API Gateway', uptime: 99.98, latency: 24, status: 'operational' },
  { name: 'OCPP Broker', uptime: 99.95, latency: 12, status: 'operational' },
  { name: 'Payment Engine', uptime: 99.99, latency: 180, status: 'operational' },
  { name: 'OCPI Roaming Hub', uptime: 99.87, latency: 55, status: 'operational' },
  { name: 'Webhook Delivery', uptime: 99.93, latency: 340, status: 'operational' },
  { name: 'Session Streaming', uptime: 99.96, latency: 18, status: 'operational' },
  { name: 'CDR Processing', uptime: 100.00, latency: 92, status: 'operational' },
  { name: 'Settlement Service', uptime: 100.00, latency: 210, status: 'operational' },
];

function useCopy() {
  const [copied, setCopied] = useState('');
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };
  return { copied, copy };
}

function Tag({ type }: { type: string }) {
  const map: Record<string, string> = {
    new: 'bg-green-500/15 text-green-400 border-green-500/30',
    fix: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    improvement: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    security: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    deprecation: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const label: Record<string, string> = {
    new: 'NEW', fix: 'FIX', improvement: 'IMPROVED', security: 'SECURITY', deprecation: 'DEPRECATED',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${map[type] || map.fix}`}>{label[type] || type}</span>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'body' | 'try'>('body');
  const [tryResponse, setTryResponse] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);
  const { copied, copy } = useCopy();

  const simulate = () => {
    setTrying(true);
    setTryResponse(null);
    setTimeout(() => {
      setTrying(false);
      setTryResponse(JSON.stringify(ep.response, null, 2));
    }, 900 + Math.random() * 600);
  };

  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${open ? 'border-slate-600 bg-slate-800/50' : 'border-slate-700/50 hover:border-slate-600'}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 font-mono ${methodColor[ep.method]}`}>{ep.method}</span>
        <span className="font-mono text-sm text-slate-200 flex-1">{ep.path}</span>
        <span className="text-xs text-slate-500 hidden sm:block mr-4 max-w-64 truncate">{ep.desc}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-700/50">
          <div className="px-5 py-3">
            <p className="text-sm text-slate-400">{ep.desc}</p>
          </div>

          {ep.params && ep.params.length > 0 && (
            <div className="px-5 pb-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">ПАРАМЕТРЫ</p>
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                {ep.params.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-700/50 last:border-none">
                    <span className="font-mono text-xs text-sky-300 shrink-0 w-32">{p.name}</span>
                    <span className="text-xs text-slate-500 shrink-0 w-16">{p.type}</span>
                    {p.required && <span className="text-[10px] text-red-400 border border-red-500/30 px-1.5 rounded shrink-0">required</span>}
                    <span className="text-xs text-slate-400">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-700/50">
            <div className="flex px-5 pt-3 gap-3">
              {(['body', 'try'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {t === 'body' ? 'Схема' : '▶ Try It'}
                </button>
              ))}
            </div>

            {tab === 'body' ? (
              <div className="px-5 py-3 space-y-3">
                {ep.request && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-slate-500 tracking-wider">REQUEST BODY</span>
                      <button onClick={() => copy('req' + ep.path, JSON.stringify(ep.request, null, 2))}
                        className={`text-xs flex items-center gap-1 transition-colors ${copied === 'req' + ep.path ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
                        {copied === 'req' + ep.path ? <CheckCircle size={11} /> : <Copy size={11} />} Copy
                      </button>
                    </div>
                    <pre className="bg-slate-950 text-emerald-300 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed border border-slate-700/50">
                      {JSON.stringify(ep.request, null, 2)}
                    </pre>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-500 tracking-wider">RESPONSE 200</span>
                    <button onClick={() => copy('res' + ep.path, JSON.stringify(ep.response, null, 2))}
                      className={`text-xs flex items-center gap-1 transition-colors ${copied === 'res' + ep.path ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
                      {copied === 'res' + ep.path ? <CheckCircle size={11} /> : <Copy size={11} />} Copy
                    </button>
                  </div>
                  <pre className="bg-slate-950 text-sky-300 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed border border-slate-700/50">
                    {JSON.stringify(ep.response, null, 2)}
                  </pre>
                </div>
                {ep.errors && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 tracking-wider mb-2">ВОЗМОЖНЫЕ ОШИБКИ</p>
                    <div className="space-y-1.5">
                      {ep.errors.map((e, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className="bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-mono font-bold shrink-0">{e.code}</span>
                          <span className="text-slate-400">{e.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-5 py-3">
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${methodBg[ep.method]}`} />
                      <span className="text-xs font-mono text-slate-400">{BASE}{ep.path}</span>
                    </div>
                    <button onClick={simulate} disabled={trying}
                      className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      {trying ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                      {trying ? 'Отправка...' : 'Send Request'}
                    </button>
                  </div>
                  {ep.request && (
                    <pre className="text-xs font-mono text-slate-400 mb-3 leading-relaxed opacity-60">
                      {JSON.stringify(ep.request, null, 2)}
                    </pre>
                  )}
                  {tryResponse && (
                    <div className="border-t border-slate-700/50 pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded font-bold">200 OK</span>
                        <span className="text-[10px] text-slate-500">{Math.round(40 + Math.random() * 80)}ms</span>
                      </div>
                      <pre className="text-xs font-mono text-sky-300 leading-relaxed overflow-x-auto">{tryResponse}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WebhooksSection() {
  const [selected, setSelected] = useState(webhookEvents[0]);
  const [showSetup, setShowSetup] = useState(false);
  const { copied, copy } = useCopy();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Webhooks</h2>
        <p className="text-slate-400 text-sm">Real-time уведомления о событиях платформы. Настройте URL в кабинете оператора или через API.</p>
      </div>

      {/* Setup CTA */}
      <div className="bg-gradient-to-r from-sky-500/10 to-violet-500/10 border border-sky-500/20 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white mb-1">Настройка Webhook URL</p>
            <p className="text-xs text-slate-400">Запросы подписываются HMAC-SHA256. Проверяйте заголовок <code className="bg-slate-800 px-1 rounded text-sky-300">X-OneCharge-Signature</code>.</p>
          </div>
          <button onClick={() => setShowSetup(s => !s)}
            className="text-xs bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg font-semibold transition-colors shrink-0">
            {showSetup ? 'Скрыть' : 'Настроить'}
          </button>
        </div>
        {showSetup && (
          <div className="mt-4 pt-4 border-t border-sky-500/20">
            <pre className="bg-slate-950 text-green-300 rounded-xl p-4 text-xs font-mono leading-relaxed border border-slate-700/50 overflow-x-auto">{`curl -X POST https://api.onecharge.uz/v1/webhooks \\
  -H "Authorization: Bearer eyJhbGci..." \\
  -d '{
    "url": "https://your-server.com/webhooks",
    "events": ["session.started","session.stopped","payment.success","evse.status_changed"],
    "secret": "whsec_your_secret_here"
  }'`}</pre>
          </div>
        )}
      </div>

      {/* Events */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-500 px-1 mb-2">СОБЫТИЯ</p>
          {webhookEvents.map(ev => (
            <button key={ev.event} onClick={() => setSelected(ev)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${selected.event === ev.event ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected.event === ev.event ? ev.color.replace('text-', 'bg-') : 'bg-slate-600'}`} />
              <span className="text-xs font-mono">{ev.event}</span>
            </button>
          ))}
        </div>
        <div className="col-span-2 space-y-3">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-white mb-1">{selected.event}</p>
            <p className="text-xs text-slate-400 mb-4">{selected.desc}</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-slate-500 font-semibold">PAYLOAD</span>
              <button onClick={() => copy('wh', JSON.stringify(selected.payload, null, 2))}
                className={`text-xs flex items-center gap-1 ${copied === 'wh' ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {copied === 'wh' ? <CheckCircle size={11} /> : <Copy size={11} />} Copy
              </button>
            </div>
            <pre className={`bg-slate-950 rounded-xl p-4 text-xs font-mono leading-relaxed border border-slate-700/50 overflow-x-auto ${selected.color}`}>
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function SdkSection() {
  const [lang, setLang] = useState<'javascript' | 'python' | 'curl'>('javascript');
  const [topic, setTopic] = useState<'install' | 'auth' | 'locations' | 'sessions' | 'webhooks'>('auth');
  const { copied, copy } = useCopy();

  const topics = [
    { id: 'install', label: 'Установка' },
    { id: 'auth', label: 'Авторизация' },
    { id: 'locations', label: 'Станции' },
    { id: 'sessions', label: 'Сессии' },
    { id: 'webhooks', label: 'Webhooks' },
  ] as const;

  const code = sdkExamples[lang][topic] || '';

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">SDK & Code Examples</h2>
        <p className="text-slate-400 text-sm">Официальные SDK для быстрой интеграции. Production-ready с автообновлением токенов, retry-логикой и типизацией.</p>
      </div>

      <div className="flex gap-3">
        {(['javascript', 'python', 'curl'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${lang === l ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            {l === 'javascript' && <span>JS</span>}
            {l === 'python' && <span>Py</span>}
            {l === 'curl' && <Terminal size={14} />}
            {l === 'javascript' ? 'JavaScript' : l === 'python' ? 'Python' : 'cURL'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-1 space-y-1">
          {topics.map(t => (
            <button key={t.id} onClick={() => setTopic(t.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${topic === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="col-span-4">
          <div className="bg-slate-950 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <button onClick={() => copy('sdk', code)}
                className={`text-xs flex items-center gap-1 ${copied === 'sdk' ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {copied === 'sdk' ? <CheckCircle size={11} /> : <Copy size={11} />} Copy
              </button>
            </div>
            <pre className="p-5 text-sm font-mono text-green-300 leading-relaxed overflow-x-auto">{code}</pre>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { title: 'Авторасширение токена', desc: 'SDK автоматически обновляет access_token за 5 минут до истечения' },
          { title: 'Retry + Backoff', desc: 'Экспоненциальный backoff при 429/503. Настраиваемые попытки (по умолчанию 3)' },
          { title: 'TypeScript типы', desc: 'Полная типизация всех запросов и ответов. OpenAPI-генерация поддерживается' },
        ].map(f => (
          <div key={f.title} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-white mb-1">{f.title}</p>
            <p className="text-xs text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangelogSection() {
  const typeColor: Record<string, string> = { major: 'bg-red-500', minor: 'bg-sky-500', patch: 'bg-slate-600' };
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Changelog</h2>
        <p className="text-slate-400 text-sm">История изменений API. Семантическое версионирование (SemVer). Устаревшие методы поддерживаются ещё 2 минорные версии.</p>
      </div>
      <div className="space-y-5">
        {changelog.map((release, i) => (
          <div key={i} className="border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-slate-800/30">
              <span className={`w-2 h-2 rounded-full shrink-0 ${typeColor[release.type]}`} />
              <span className="text-base font-bold text-white font-mono">v{release.version}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                release.type === 'minor' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                : release.type === 'patch' ? 'bg-slate-700 text-slate-400 border-slate-600'
                : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}>{release.type.toUpperCase()}</span>
              <span className="text-sm text-slate-500 ml-auto">{release.date}</span>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {release.changes.map((c, j) => (
                <div key={j} className="flex items-start gap-3">
                  <Tag type={c.type} />
                  <span className="text-sm text-slate-300">{c.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusSection() {
  const [refreshed, setRefreshed] = useState(false);
  const refresh = () => { setRefreshed(true); setTimeout(() => setRefreshed(false), 1500); };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">API Status</h2>
          <p className="text-slate-400 text-sm">Текущий статус всех сервисов платформы ONE CHARGE.</p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg transition-colors">
          <RefreshCw size={12} className={refreshed ? 'animate-spin' : ''} />Обновить
        </button>
      </div>

      <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
        <div>
          <p className="text-sm font-semibold text-green-300">Все системы работают</p>
          <p className="text-xs text-green-400/70">Последнее обновление: только что · Uptime 99.96% (30 дней)</p>
        </div>
      </div>

      <div className="border border-slate-700/50 rounded-2xl overflow-hidden">
        {statusServices.map((svc, i) => (
          <div key={i} className={`flex items-center gap-4 px-5 py-3.5 ${i < statusServices.length - 1 ? 'border-b border-slate-700/30' : ''}`}>
            <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
            <span className="text-sm text-slate-200 flex-1">{svc.name}</span>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">{svc.latency}ms</span>
              <span className="text-green-400 font-mono">{svc.uptime.toFixed(2)}%</span>
              <span className="bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[11px] font-semibold">Operational</span>
            </div>
          </div>
        ))}
      </div>

      {/* 30-day uptime bars */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-3">ИСТОРИЯ АПТАЙМА — 30 ДНЕЙ</p>
        <div className="space-y-3">
          {statusServices.slice(0, 4).map((svc, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-40 shrink-0">{svc.name}</span>
              <div className="flex-1 flex gap-0.5 h-6">
                {Array.from({ length: 30 }, (_, d) => {
                  const ok = Math.random() > 0.02;
                  return (
                    <div key={d} className={`flex-1 rounded-sm ${ok ? 'bg-green-500/70' : 'bg-red-500/60'}`} title={ok ? 'OK' : 'Incident'} />
                  );
                })}
              </div>
              <span className="text-xs text-green-400 font-mono w-14 text-right shrink-0">{svc.uptime.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  const { copied, copy } = useCopy();
  const quickStart = `# 1. Получить токен
curl -X POST ${BASE}/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{"client_id":"YOUR_ID","client_secret":"SECRET","grant_type":"client_credentials"}'

# 2. Список станций
curl -X GET "${BASE}/locations?city=tashkent&status=AVAILABLE" \\
  -H "Authorization: Bearer eyJhbGci..."

# 3. Запустить зарядку
curl -X POST ${BASE}/remote/start \\
  -H "Authorization: Bearer eyJhbGci..." \\
  -H "Content-Type: application/json" \\
  -d '{"location_id":"LOC-001","evse_id":"EVSE-001","token":"APP_USER_TOKEN"}'`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded-lg">v1.4.2</span>
          <span className="text-xs text-slate-500">Stable</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">ONE CHARGE Partner API</h1>
        <p className="text-slate-400 leading-relaxed">REST API для интеграции зарядных станций с платформой ONE CHARGE UZ. Поддержка OCPI 2.3.0, OCPP 2.0.1, webhook-уведомлений и Roaming Hub.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Base URL', value: 'api.onecharge.uz/v1', mono: true },
          { label: 'Протокол', value: 'HTTPS / TLS 1.3' },
          { label: 'Стандарт', value: 'OCPI 2.3.0' },
          { label: 'Auth', value: 'OAuth 2.0 Bearer' },
          { label: 'Rate Limit', value: '1 000 req/min' },
          { label: 'SLA', value: '99.9% uptime' },
        ].map(r => (
          <div key={r.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[11px] text-slate-500 mb-0.5">{r.label}</p>
            <p className={`text-sm font-semibold text-white ${r.mono ? 'font-mono text-xs' : ''}`}>{r.value}</p>
          </div>
        ))}
      </div>

      {/* Environments */}
      <div className="border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-800/30 border-b border-slate-700/50">
          <p className="text-xs font-semibold text-slate-400">ОКРУЖЕНИЯ</p>
        </div>
        {[
          { name: 'Production', url: 'https://api.onecharge.uz/v1', badge: 'LIVE', color: 'text-green-400 bg-green-500/15 border-green-500/30' },
          { name: 'Sandbox', url: 'https://sandbox.onecharge.uz/v1', badge: 'TEST', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
          { name: 'Staging', url: 'https://staging-api.onecharge.uz/v1', badge: 'STAGING', color: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
        ].map((env, i) => (
          <div key={i} className="flex items-center px-4 py-3 border-b border-slate-700/30 last:border-none">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${env.color} shrink-0 mr-3`}>{env.badge}</span>
            <span className="text-sm text-slate-300 w-24 shrink-0">{env.name}</span>
            <span className="font-mono text-xs text-slate-400">{env.url}</span>
          </div>
        ))}
      </div>

      {/* Quick start */}
      <div className="bg-slate-950 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-400">БЫСТРЫЙ СТАРТ</span>
          </div>
          <button onClick={() => copy('qs', quickStart)}
            className={`text-xs flex items-center gap-1 transition-colors ${copied === 'qs' ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
            {copied === 'qs' ? <CheckCircle size={11} /> : <Copy size={11} />} Copy
          </button>
        </div>
        <pre className="p-5 text-sm font-mono text-green-300 leading-relaxed overflow-x-auto">{quickStart}</pre>
      </div>

      {/* Flow diagram */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-3">ТИПИЧНЫЙ FLOW ЗАРЯДКИ</p>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {[
            { step: '1', label: 'Auth token', color: 'bg-sky-500' },
            { step: '→', label: '', color: 'bg-transparent' },
            { step: '2', label: 'GET locations', color: 'bg-slate-600' },
            { step: '→', label: '', color: 'bg-transparent' },
            { step: '3', label: 'POST remote/start', color: 'bg-green-600' },
            { step: '→', label: '', color: 'bg-transparent' },
            { step: '4', label: 'Webhook session.started', color: 'bg-violet-600' },
            { step: '→', label: '', color: 'bg-transparent' },
            { step: '5', label: 'POST remote/stop', color: 'bg-amber-600' },
            { step: '→', label: '', color: 'bg-transparent' },
            { step: '6', label: 'CDR + Settlement', color: 'bg-pink-600' },
          ].map((s, i) => s.step === '→'
            ? <ChevronRight key={i} size={16} className="text-slate-600 shrink-0" />
            : (
              <div key={i} className={`${s.color} rounded-xl px-3 py-2 shrink-0`}>
                <p className="text-[10px] text-white/60 font-bold">STEP {s.step}</p>
                <p className="text-xs text-white font-semibold whitespace-nowrap">{s.label}</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Error codes */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-3">КОДЫ ОТВЕТОВ</p>
        <div className="border border-slate-700/50 rounded-2xl overflow-hidden">
          {[
            { code: '200', label: 'OK', desc: 'Успешный запрос' },
            { code: '201', label: 'Created', desc: 'Ресурс создан' },
            { code: '400', label: 'Bad Request', desc: 'Неверные параметры запроса' },
            { code: '401', label: 'Unauthorized', desc: 'Токен недействителен или истёк' },
            { code: '403', label: 'Forbidden', desc: 'Нет прав на операцию' },
            { code: '404', label: 'Not Found', desc: 'Ресурс не найден' },
            { code: '409', label: 'Conflict', desc: 'Конфликт состояния (EVSE занят, дубль)' },
            { code: '429', label: 'Too Many Requests', desc: 'Превышен rate limit (1000 req/min)' },
            { code: '503', label: 'Service Unavailable', desc: 'Станция недоступна для управления' },
          ].map(e => (
            <div key={e.code} className="px-4 py-2.5 flex items-center gap-4 border-b border-slate-700/20 last:border-none">
              <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded shrink-0 ${
                e.code.startsWith('2') ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : e.code.startsWith('4') ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-red-500/15 text-red-400 border border-red-500/30'
              }`}>{e.code}</span>
              <span className="text-xs text-slate-400 w-36 shrink-0">{e.label}</span>
              <span className="text-xs text-slate-500">{e.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ApiDocsApp({ onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<Section>('overview');

  const navGroups = [
    {
      label: 'НАЧАЛО РАБОТЫ',
      items: [
        { id: 'overview' as Section, label: 'Overview', icon: <Globe size={14} /> },
        { id: 'status' as Section, label: 'API Status', icon: <Activity size={14} />, badge: '99.96%' },
        { id: 'sdk' as Section, label: 'SDK & Examples', icon: <Code2 size={14} /> },
        { id: 'changelog' as Section, label: 'Changelog', icon: <Clock size={14} />, badge: 'v1.4.2' },
      ],
    },
    {
      label: 'REFERENCE',
      items: [
        { id: 'auth' as Section, label: 'Authentication', icon: <Lock size={14} /> },
        { id: 'locations' as Section, label: 'Locations & EVSE', icon: <Zap size={14} /> },
        { id: 'sessions' as Section, label: 'Sessions', icon: <Activity size={14} /> },
        { id: 'remote' as Section, label: 'Remote Control', icon: <Terminal size={14} /> },
        { id: 'reservations' as Section, label: 'Reservations', icon: <FileText size={14} /> },
        { id: 'tokens' as Section, label: 'Tokens', icon: <Shield size={14} /> },
        { id: 'cdr' as Section, label: 'CDR', icon: <BarChart3 size={14} /> },
        { id: 'settlement' as Section, label: 'Settlement', icon: <DollarSign size={14} /> },
      ],
    },
    {
      label: 'ИНТЕГРАЦИЯ',
      items: [
        { id: 'webhooks' as Section, label: 'Webhooks', icon: <Bell size={14} />, badge: '8 events' },
      ],
    },
  ];

  const sectionTitles: Record<string, string> = {
    auth: 'Authentication', locations: 'Locations & EVSE', sessions: 'Sessions',
    remote: 'Remote Control', reservations: 'Reservations', tokens: 'Tokens',
    cdr: 'Charge Detail Records', settlement: 'Settlement & Finance',
  };

  const renderContent = () => {
    if (section === 'overview') return <OverviewSection />;
    if (section === 'webhooks') return <WebhooksSection />;
    if (section === 'sdk') return <SdkSection />;
    if (section === 'changelog') return <ChangelogSection />;
    if (section === 'status') return <StatusSection />;

    const eps = endpoints[section] || [];
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-xl font-bold text-white">{sectionTitles[section]}</h2>
        {eps.map((ep, i) => <EndpointCard key={i} ep={ep} />)}
      </div>
    );
  };

  return (
    <div className="h-full flex bg-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Sidebar */}
      <div className="w-60 bg-slate-950 flex flex-col shrink-0 border-r border-slate-800">
        <div className="px-4 py-5 border-b border-slate-800">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-xs mb-4 transition-colors">
            <ArrowLeft size={13} /> Назад
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Zap size={14} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">ONE CHARGE</p>
              <p className="text-slate-500 text-[11px]">Partner API</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-slate-600 tracking-widest px-2 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button key={item.id} onClick={() => setSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${section === item.id ? 'bg-sky-500/20 text-sky-300 border border-sky-500/20' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}>
                    <span className="shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{item.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 space-y-2">
          <div className="bg-slate-900 rounded-xl p-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
            <div>
              <p className="text-[11px] text-green-400 font-semibold">All systems operational</p>
              <p className="text-[10px] text-slate-600">uptime 99.96% (30d)</p>
            </div>
          </div>
          <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3">
            <p className="text-[11px] text-sky-400 font-semibold mb-0.5">Sandbox доступен</p>
            <p className="text-[10px] text-slate-500">sandbox.onecharge.uz/v1</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

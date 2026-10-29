export type Portal = 'driver' | 'operator' | 'admin' | 'business' | 'api';

/** A password may buy a token outright, or only a 2FA challenge. */
export type LoginResult =
  | { token: string; user: Account; requires2fa?: false }
  | { requires2fa: true; challenge: string };

export interface Account {
  id: string;
  portal: Portal;
  login: string;
  name: string;
  role: string;
  org: string | null;
  orgId: string | null;
  avatar: string;
  lastLogin: string | null;
  twoFactorEnabled?: boolean;
  /** A driver's own car, when they have told us. */
  car?: Car | null;
  /** Linked Telegram account: one-tap sign-in in the Mini App and bot notifications. */
  telegram?: { id: string; username: string | null; firstName: string; linkedAt: string; notify?: boolean } | null;
}

export interface Car {
  brand: string;
  model: string;
  year: number;
  battery: number;
  port: string;
  maxKw: number;
  /** Stop charging at this level, %; 80 by default. */
  chargeLimit?: number;
}

export interface StationForecast {
  stationId: string;
  connectors: { id: string; status: string; freeInMin: number | null; basis?: 'planned' | 'typical' }[];
  nextFreeInMin: number | null;
  queue: number;
  queueWaitMin: number | null;
  typical: { dc: number; ac: number };
}
export type ReportKind = 'works' | 'broken' | 'queue' | 'no_queue' | 'power' | 'access';
export interface CommunityReport { id: string; stationId: string; userId: string; user: string; kind: ReportKind; value: number | null; note: string; ts: string; confirms: number; verified: boolean }
export interface StationCommunity { works: number; broken: number; queue: number; noQueue: number; access: number; power: number | null; reports: CommunityReport[] }
export interface Loyalty {
  balance: number;
  earned90: number;
  tier: 'start' | 'silver' | 'gold';
  next: { tier: 'silver' | 'gold'; need: number } | null;
  trusted: boolean;
  confirmedReports: number;
  valueUzs: number;
  history: { id: string; delta: number; reason: string; ts: string }[];
}
export type SosKind = 'tow' | 'mobile_charge' | 'breakdown' | 'accident' | 'station' | 'other';
export interface SosRequest { id: string; userId: string; user: string; phone: string; kind: SosKind; lat: number | null; lng: number | null; note: string; status: 'open' | 'taken' | 'closed'; ts: string; takenBy: string | null; closedAt: string | null }
export interface FamilyState {
  members: { memberId: string; name: string; phone: string; limit: number; status: 'pending' | 'active'; spent: number }[];
  payers: { ownerId: string; name: string; limit: number; status: 'pending' | 'active'; spent: number; left: number }[];
}
/** Charging on credit: the face is enrolled once and checked before every credit charge. */
export interface CreditDebt { id: string; sessionId: string; station: string; amount: number; repaid: number; left: number; createdAt: string; dueAt: string; paidAt: string | null; refunded?: boolean }
export interface CreditState {
  enrolled: boolean; status: 'active' | 'paused' | null; provider: 'sandbox' | 'myid'; limit: number; days: number; termsVersion: string;
  acceptedAt: string | null; faceSavedAt: string | null; debt: number; available: number; overdue: boolean; nextDue: string | null; debts: CreditDebt[];
}
export interface CreditOverview {
  rows: { userId: string; user: string; phone: string | null; status: 'active' | 'paused'; limit: number; acceptedAt: string; faceSavedAt: string; provider: string; lastVerifiedAt: string | null; debt: number; overdue: boolean; nextDue: string | null; charges: number }[];
  totals: { drivers: number; debt: number; overdue: number; overdueDrivers: number };
  limit: number; days: number; provider: 'sandbox' | 'myid';
}
/** A driver's balance at a network that is paid directly (money goes to the network's own cashbox). */
export interface NetworkWallet { operatorId: string; name: string; logo: string; balance: number; direct: boolean; payme: boolean; click: boolean }
export interface PayoutSettings {
  mode: 'platform' | 'direct';
  sandbox: boolean;
  payme: { merchantId: string; configured: boolean } | null;
  click: { serviceId: string; merchantId: string; configured: boolean } | null;
  updatedAt: string | null;
  callbacks: { payme: string; clickPrepare: string; clickComplete: string };
}
export interface DirectLedgerLine { id: string; at: string; kind: 'topup' | 'topup-reversed' | 'charge' | 'refund'; operatorId: string; network: string; userId: string; user: string; amount: number; commission?: number; provider?: string; ref: string }
export interface DirectReport {
  days: number;
  rows: { operatorId: string; name: string; mode: 'platform' | 'direct'; sandbox: boolean; received: number; payments: number; charged: number; charges: number; commission: number; totalReceived: number; totalCommission: number; held: number; byDay: { date: string; received: number; charged: number }[] }[];
  totals: { received: number; charged: number; commission: number; held: number };
  lines: DirectLedgerLine[];
  payout?: PayoutSettings | null;
}
export type IntegrationType = 'OCPP 1.6-J' | 'OCPI 2.2.1' | 'Network API' | 'Только карта';
export interface IntegrationSettings { type: string; networkApi: { keyPrefix: string; webhookUrl: string; createdAt: string } | null; key?: string | null; secret?: string | null }
/** A partner network connected over OCPI 2.2.1 (we are the eMSP, they are the CPO). */
export interface OcpiPartner {
  id: string; name: string; status: 'connecting' | 'connected' | 'disconnected'; versionsUrl: string; country_code: string; party_id: string;
  operatorId: string; createdAt: string; lastSync: string | null; error: string | null; stations: number; endpoints: Record<string, string>;
}
export interface OcpiOverview { partners: OcpiPartner[]; version: string; ourVersionsUrl: string; party: { country_code: string; party_id: string } }
/** What a driver wants from a charge; the server stops it there. */
export type ChargeGoal = { kind: 'percent'; value: number; fromPct?: number } | { kind: 'sum'; value: number } | { kind: 'km'; value: number };
export interface SessionGoal { kind: 'percent' | 'sum' | 'km'; value: number; fromPct?: number; stopKwh?: number; stopCost?: number }
export interface ScheduledStart { id: string; stationId: string; stationName: string; connectorId: string; connector: string; payer: string; goal: ChargeGoal | null; at: string; status: 'pending' | 'starting' | 'started' | 'failed' | 'cancelled' }
export interface SupportMessage { id: string; from: 'user' | 'support'; text: string; image: string | null; at: string }
export interface SupportThread { id: string; userId: string; user: string; phone: string | null; status: 'open' | 'closed' | 'new'; updatedAt: string; unreadAdmin: number; unreadUser: number; messages: SupportMessage[] }
export type Payer = 'self' | 'company' | 'credit' | `family:${string}`;
export type HostKind = 'home' | 'hotel' | 'business' | 'parking' | 'cafe';
export interface HostApplication {
  id: string; userId: string; user: string; phone: string; kind: HostKind; name: string; city: string; address: string; lat: number; lng: number;
  specs: { type: string; power: number; price: number }[]; hours: string; note: string; status: 'pending' | 'approved' | 'rejected'; ts: string; decidedAt: string | null; reason: string | null; stationId: string | null;
}
export interface HostOverview { applications: HostApplication[]; stations: Station[]; sessions: number; energy: number; gross: number; net: number; commission: number }

export interface RiskFinding {
  id: string;
  rule: 'failed_starts' | 'impossible_energy' | 'parallel_sessions' | 'abandoned_payments' | 'repeated_refunds';
  risk: 'critical' | 'high' | 'medium';
  userId: string;
  user: string;
  detail: string;
  at: string;
  refs: string[];
  review: { decision: 'confirmed' | 'dismissed'; by: string; at: string; note: string } | null;
}
export interface RiskReport { checked: { sessions: number; payments: number }; open: number; findings: RiskFinding[] }
export interface CdrIssue { sessionId: string; check: string; detail: string; station: string; operator: string; start: string; cost: number }
export interface CdrReport { days: number; checked: number; passed: number; energy: number; amount: number; issues: CdrIssue[] }
export interface TariffBand { band: 'green' | 'day' | 'peak'; from: number; to: number; multiplier: number }
export interface StaffAccount { id: string; portal: Portal; name: string; login: string; role: string; org: string | null; lastLogin: string | null; twoFactor: boolean; devices: number }
export interface SystemHealth {
  uptimeSec: number;
  node: string;
  memoryMb: { rss: number; heap: number };
  storage: 'postgres' | 'file';
  demo: { mode: boolean; simulation: boolean };
  records: Record<string, number>;
  live: { sseClients: number; activeSessions: number; eventsLastHour: number; tokens: number };
  ocpp: { connected: number };
  webhooks: { endpoints: number; active: number; pending: number; failed: number; delivered: number; lastError: { url: string; error: string; at: string } | null };
  sms: boolean;
  time: string;
}

export interface SignedInDevice {
  id: string;
  device: string;
  issued: string;
  lastSeen: string;
  current: boolean;
}

export interface Connector {
  id: string;
  type: string;
  power: number;
  status: 'available' | 'occupied' | 'unavailable' | 'reserved';
  price: number;
}

export interface Station {
  id: string;
  name: string;
  operator: string;
  operatorId: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  geoLat: number;
  geoLng: number;
  connectors: Connector[];
  rating: number;
  reviews: number;
  totalPower: number;
  hours: string;
  amenities: string[];
  image: string;
  /** Set once a charger has connected over OCPP, or while a new station awaits it. */
  ocpp?: { online?: boolean; awaiting?: boolean; lastSeen?: string; connectedAt?: string };
}

export interface Session {
  id: string;
  userId: string;
  user: string;
  stationId: string;
  stationName: string;
  operator: string;
  operatorId: string;
  connectorId: string;
  connector: string;
  start: string;
  end: string | null;
  energy: number;
  cost: number;
  power?: number;
  price?: number;
  status: 'active' | 'completed' | 'failed';
  corporate: boolean;
  /** Paid from a relative's wallet. */
  familyOwner?: string;
  /** Charged on credit: owed, not taken from the wallet. */
  credit?: boolean;
  /** Paid from the driver's balance at this network (operator id): the money is the network's. */
  direct?: string;
  /** Stops by itself at this goal. */
  goal?: SessionGoal;
  /** Tariff band at start: 0.7 at night, 0.9 by day, 1.25 at the evening peak. */
  multiplier?: number;
  basePrice?: number;
  /** Paid from PowerGo's bonus, sum. */
  bonusUsed?: number;
  /** Charged with PowerGo Plus; `plusCovered` is what PowerGo paid the network on top. */
  plus?: boolean;
  plusCovered?: number;
  networkPrice?: number;
  /** The network's promo this charge ran under. */
  promo?: { id: string; title: string; percent: number };
  /** The driver's 1–5 rating, once given. */
  rating?: number;
}

export interface Transaction {
  id: string;
  sessionId: string;
  userId: string;
  user: string;
  amount: number;
  method: string;
  status: string;
  time: string;
  /** Paid from PowerGo's bonus, sum; the rest came from the wallet. */
  bonus?: number;
}

/** A milestone PowerGo pays a bonus for. */
export interface Achievement { id: string; icon: string; title: string; desc: string; amount: number; goal: number; progress: number; grantedAt: string | null }
export interface Rewards {
  /** Bonus money for charging only; it burns after `bonusDays`. */
  bonus: { balance: number; nextExpiry: string | null; nextExpiryAmount: number };
  bonusDays: number;
  achievements: Achievement[];
}
/** Battery health from the driver's charges (server/battery.js). */
export interface BatteryHealth {
  car: { brand: string; model: string; year: number; rated: number } | null;
  /** Share of the rated capacity the pack still holds, %, when it could be measured. */
  soh: number | null;
  capacity: number | null;
  grade: 'excellent' | 'good' | 'attention' | null;
  /** Change since the first measurements, %. */
  drift: number | null;
  measured: { at: string; sessionId: string; station: string; from: number; to: number; energy: number; kwh: number }[];
  acceptance: { month: string; share: number; charges: number }[];
  charges: number;
  tips: string[];
  reportId: string;
}
/** The chance of a free point on arrival (server/driverFeatures.js). */
export interface ArrivalChance { stationId: string; etaMin: number; chance: number; expectedFree: number; verdict: 'likely' | 'maybe' | 'unlikely'; waitAfterMin: number | null; queue: number; alternatives: (Omit<ArrivalChance, 'alternatives'> & { name: string; operator: string; km: number })[] }
export type PlaceKind = 'food' | 'prayer' | 'toilets' | 'shop' | 'hotel';
/** What is a short walk from a station: partners with an offer, and places from OpenStreetMap. */
export interface StationPlaces {
  partners: { id: string; name: string; kind: PlaceKind; lat: number; lng: number; offer: string; km: number; walkMin: number }[];
  places: { id: string; name: string; kind: PlaceKind; lat: number; lng: number; hours: string | null; km: number; walkMin: number }[];
  counts: Record<PlaceKind, number>;
  loaded: boolean;
}
export interface PartnerPlace { id: string; name: string; kind: PlaceKind; lat: number; lng: number; offer: string; stationIds: string[]; pricePerShow: number; shows: number; taps: number; until: string; active: boolean; bill: number }
export interface PlusState { active: boolean; since: string | null; renewsAt: string | null; autoRenew: boolean; savedThisMonth: number; price: number; discount: number; days: number }
export interface FleetPlan { plan: 'standard' | 'taxi'; since: string | null; kwh30: number; discount: number; tierDiscount: number; next: { kwh: number; pct: number } | null; tiers: { kwh: number; pct: number }[]; savedThisMonth: number }
export interface FleetDriverRow { employeeId: string; name: string; vehicle: string; charges: number; energy: number; cost: number; avgPrice: number; nightShare: number; medianMinutes: number; topStation: string | null; saved: number }
export interface AutochargeState { cars: { carId: string; car: string | null; since: string }[]; linking: { stationId: string; until: string } | null }
export interface BonusGrant { id: string; kind: string; title: string; amount: number; left: number; at: string; expiresAt: string }

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  stationId: string | null;
  station: string;
  operatorId: string | null;
  code: string;
  message: string;
  time: string;
  ack: boolean;
  ackBy?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  driver: string;
  driverId: string;
  battery: number;
  status: string;
  charged: number;
  cost: number;
  odo: number;
}

export interface Employee {
  id: string;
  name: string;
  dept: string;
  limit: number;
  spent: number;
  sessions: number;
  vehicle: string;
  status?: string;
}

export interface Employer {
  org: string;
  employeeId: string;
  limit: number;
  spent: number;
  left: number;
  vehicle: string;
}

export interface OperatorRecord {
  id: string;
  name: string;
  logo: string;
  stations: number;
  evse: number;
  status: 'active' | 'pending' | 'suspended';
  integration: string;
  since: string;
  revenue: number;
  sessions: number;
  region: string;
  contact: string;
}

export interface Wallet {
  balance: number;
  currency: string;
  autoTopUp: boolean;
  threshold: number;
  card: string;
}

export interface SyncEvent {
  id: string;
  type: string;
  portal: string;
  actor: string;
  message: string;
  entity: string | null;
  payload: Record<string, unknown>;
  ts: string;
}

export interface Stats {
  activeSessions: number;
  totalSessions: number;
  energyToday: number;
  /** Network-wide revenue is admin-only; null for everyone else. */
  revenueToday: number | null;
  evseTotal: number;
  evseOnline: number;
  stations: number;
  operators: number;
  openAlerts: number;
  availability: number;
}

/** A discount a partner network runs at its stations and pays for itself. */
export interface Promo {
  id: string;
  operatorId: string;
  title: string;
  percent: number;
  /** Tashkent hours it runs, e.g. 23 → 7; null for all day. */
  fromHour: number | null;
  toHour: number | null;
  firstOnly: boolean;
  /** null: every station of the network. */
  stationIds: string[] | null;
  until: string | null;
  active?: boolean;
  uses?: number;
  discount?: number;
}

/** The admin's switches and numbers every app follows (server/settings.js publicSettings). */
export interface PlatformSettings {
  features: { offline: boolean; navigator: boolean; battery: boolean; arrival: boolean; places: boolean; rewards: boolean; plus: boolean; autocharge: boolean; liveNotice: boolean; bookings: boolean; queue: boolean; sos: boolean };
  booking: { fee: number; graceMin: number };
  topup: { min: number; max: number; providers: ('payme' | 'click' | 'uzum' | 'humo')[] };
  queueHoldMin: number;
  minPrepaidKwh: number;
}
/** One setting in the admin's Platform control. */
export interface SettingItem { key: string; group: string; label: string; hint?: string; type: 'bool' | 'int' | 'money' | 'percent' | 'tiers'; def: unknown; min?: number; max?: number; unit?: string; value: unknown; changed: boolean }
export interface SettingsView { groups: Record<string, string>; items: SettingItem[]; log: { key: string; label: string; from: unknown; to: unknown; by: string; at: string }[] }

export interface PlatformState {
  platform?: PlatformSettings;
  promos?: Promo[];
  stations: Station[];
  operators: OperatorRecord[];
  sessions: Session[];
  transactions: Transaction[];
  alerts: Alert[];
  vehicles: Vehicle[];
  employees: Employee[];
  wallets: Record<string, Wallet>;
  /** For a driver who works for a fleet client: the company account they may charge to. */
  employer?: Employer | null;
  /** Family wallets: relatives I pay for, and whose wallets I may use. */
  family?: FamilyState;
  /** Charging on credit, for a driver. */
  credit?: CreditState;
  rewards?: Rewards;
  plus?: PlusState;
  fleetPlan?: FleetPlan;
  autocharge?: AutochargeState;
  /** The driver's balances at networks paid directly. */
  networkWallets?: NetworkWallet[];
  /** Charges the driver asked to start later. */
  scheduled?: ScheduledStart[];
  queues?: QueueEntry[];
  bookings?: Booking[];
  events: SyncEvent[];
  stats: Stats;
  serverTime: string;
}

export interface QueueEntry {
  id: string;
  stationId: string;
  /** Present only on your own entry; other drivers' places are anonymous. */
  userId?: string;
  user?: string;
  joined: string;
  notified: boolean;
  notifiedAt: number | null;
  connectorId: string | null;
}

export interface TariffHour {
  hour: number;
  band: 'green' | 'standard' | 'day' | 'peak';
  multiplier: number;
}

export interface TariffForecast {
  timezone: string;
  currentHour: number;
  current: TariffHour;
  hours: TariffHour[];
  bestWindow: { from: number; to: number; multiplier: number; startsInHours: number };
}

export interface EcoBadge {
  id: string;
  title: string;
  description: string;
  earned: boolean;
}

export interface EcoProfile {
  sessions: number;
  kwh: number;
  co2Kg: number;
  trees: number;
  km: number;
  stationsVisited: number;
  badges: EcoBadge[];
}

export interface LeaderRow {
  rank: number;
  name: string;
  kwh: number;
  co2Kg: number;
  me: boolean;
}

export interface Booking {
  id: string;
  stationId: string;
  connectorId: string;
  startsAt: string;
  endsAt: string;
  graceUntil: string;
  status: 'active' | 'used' | 'cancelled' | 'expired';
  /** The fields below are present only on your own bookings. */
  code?: string;
  userId?: string;
  user?: string;
  stationName?: string;
  connectorType?: string;
  power?: number;
  minutes?: number;
  fee?: number;
}

export interface PaymentProvider {
  id: 'payme' | 'click' | 'uzum' | 'humo';
  name: string;
  configured: boolean;
  live: boolean;
}

export interface PaymentOrder {
  id: string;
  provider: 'payme' | 'click' | 'uzum' | 'humo';
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  created: string;
  paidAt: string | null;
  /** Set when the money went straight to a partner network's cashbox. */
  operatorId?: string | null;
}

export interface ReportRecord {
  id: string;
  name: string;
  title: string;
  format: 'csv' | 'pdf';
  rows: number;
  actor: string;
  portal: string;
  ts: string;
}

export interface DemoCredential {
  portal: Portal;
  login: string;
  password: string;
  otp: string | null;
  name: string;
  role: string;
  org: string | null;
}

const TOKEN_PREFIX = 'oc-token-';

/** Tokens are stored per portal so each app keeps its own independent session. */
export const tokenStore = {
  get(portal: Portal): string | null {
    try {
      return localStorage.getItem(TOKEN_PREFIX + portal);
    } catch {
      return null;
    }
  },
  set(portal: Portal, token: string) {
    try {
      localStorage.setItem(TOKEN_PREFIX + portal, token);
    } catch {
      /* private mode — session stays in memory only */
    }
  },
  clear(portal: Portal) {
    try {
      localStorage.removeItem(TOKEN_PREFIX + portal);
    } catch {
      /* ignore */
    }
  },
};

export type LeadKind = 'driver' | 'operator' | 'fleet' | 'partner';
export type LeadStatus = 'new' | 'contacted' | 'won' | 'lost' | 'spam';

export interface Lead {
  id: string;
  kind: LeadKind;
  name: string;
  phone: string;
  company: string;
  city: string;
  size: string;
  message: string;
  lang: string;
  consentAt: string;
  created: string;
  updated?: string;
  status: LeadStatus;
  note: string;
}

export interface LeadInput {
  kind: LeadKind;
  name: string;
  phone: string;
  company?: string;
  city?: string;
  size?: string;
  message?: string;
  consent: boolean;
  lang: string;
  /** Honeypot — always empty from a real form. */
  website?: string;
}

export interface ChargePointInfo {
  stationId: string;
  name: string;
  operatorId: string | null;
  online?: boolean;
  connectedAt?: string;
  lastSeen?: string;
  vendor?: string;
  model?: string;
  firmware?: string;
  connectors: { ocppConnectorId: number; id: string; status: string }[];
}

export interface OcppLogEntry {
  ts: string;
  stationId: string;
  dir: 'in' | 'out';
  action: string;
  detail: string;
}

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  car: string;
  city: string;
  registered: string | null;
  status: 'active' | 'blocked';
  selfRegistered?: boolean;
  sessions: number;
  spent: number;
  last: string | null;
}

export interface AdminUsers {
  total: number;
  active: number;
  newWeek: number;
  blocked: number;
  users: AdminUser[];
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit & { portal?: Portal } = {}): Promise<T> {
  const { portal, headers, ...rest } = options;
  const token = portal ? tokenStore.get(portal) : null;

  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error ?? `Ошибка ${res.status}`, res.status);
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown, portal?: Portal) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, portal });

export const apiClient = {
  getState: (portal?: Portal) => request<PlatformState>('/state', { portal }),
  streamTicket: (portal: Portal) => post<{ ticket: string }>('/stream/ticket', undefined, portal),
  getDemoCredentials: () => request<DemoCredential[]>('/auth/demo-credentials'),

  login: (portal: Portal, login: string, password: string) =>
    post<LoginResult>('/auth/login', { portal, login, password }),

  verify2fa: (challenge: string, code: string) =>
    post<{ token: string; user: Account }>('/auth/2fa/verify', { challenge, code }),
  get2fa: (portal: Portal) => request<{ enabled: boolean }>('/auth/2fa', { portal }),
  setup2fa: (portal: Portal) => post<{ secret: string; uri: string }>('/auth/2fa/setup', undefined, portal),
  enable2fa: (portal: Portal, code: string) => post<{ enabled: boolean }>('/auth/2fa/enable', { code }, portal),
  disable2fa: (portal: Portal, code: string) => post<{ enabled: boolean }>('/auth/2fa/disable', { code }, portal),

  smsStatus: () => request<{ configured: boolean; demo: boolean }>('/auth/sms/status'),
  requestSmsCode: (phone: string, purpose: 'register' | 'reset') =>
    post<{ sent: boolean; phone: string; demoCode?: string }>('/auth/sms/request', { phone, purpose }),
  register: (phone: string, code: string, name: string, password: string) =>
    post<{ token: string; user: Account }>('/auth/register', { phone, code, name, password }),
  resetPassword: (phone: string, code: string, password: string) =>
    post<{ reset: true; requires2fa?: boolean; token?: string; user?: Account }>('/auth/password/reset', { phone, code, password }),

  requestOtp: (phone: string) => post<{ sent: boolean; hint: string }>('/auth/otp/request', { phone }),
  verifyOtp: (phone: string, code: string) =>
    post<{ token: string; user: Account }>('/auth/otp/verify', { phone, code }),

  me: (portal: Portal) => request<{ user: Account }>('/auth/me', { portal }),
  stationForecast: (stationId: string) => request<StationForecast>(`/stations/${stationId}/forecast`),
  stationCommunity: (stationId: string) => request<StationCommunity>(`/stations/${stationId}/community`),
  addCommunityReport: (stationId: string, body: { kind: ReportKind; value?: number; note?: string }) =>
    post<{ report: CommunityReport; community: StationCommunity }>(`/stations/${stationId}/community`, body, 'driver'),
  confirmCommunityReport: (id: string) => post<{ report: CommunityReport; community: StationCommunity }>(`/community/${id}/confirm`, undefined, 'driver'),
  loyalty: () => request<Loyalty>('/loyalty', { portal: 'driver' }),
  redeemPoints: (points: number) => post<{ wallet: Wallet; amount: number; loyalty: Loyalty }>('/loyalty/redeem', { points }, 'driver'),
  sendSos: (body: { kind: SosKind; lat?: number; lng?: number; note?: string }) => post<{ sos: SosRequest }>('/sos', body, 'driver'),
  mySos: () => request<SosRequest[]>('/sos/mine', { portal: 'driver' }),
  adminSos: (portal: Portal) => request<SosRequest[]>('/admin/sos', { portal }),
  setSosStatus: (portal: Portal, id: string, status: 'taken' | 'closed') => post<{ sos: SosRequest }>(`/admin/sos/${id}/status`, { status }, portal),
  credit: () => request<CreditState>('/credit', { portal: 'driver' }),
  enrollCredit: (image: string, accept: string) => post<CreditState>('/credit/enroll', { image, accept }, 'driver'),
  verifyFace: (image: string) => post<{ faceToken: string; provider: string }>('/credit/verify', { image }, 'driver'),
  repayCredit: (amount?: number) => post<{ paid: number; credit: CreditState; wallet: Wallet }>('/credit/repay', amount ? { amount } : {}, 'driver'),
  deleteCredit: () => post<CreditState>('/credit/delete', undefined, 'driver'),
  payout: (portal: Portal, operatorId: string) => request<PayoutSettings>(`/admin/operators/${operatorId}/payout`, { portal }),
  setPayout: (portal: Portal, operatorId: string, body: Record<string, unknown>) =>
    request<PayoutSettings>(`/admin/operators/${operatorId}/payout`, { method: 'PUT', body: JSON.stringify(body), portal }),
  directSettlement: (portal: Portal, days = 30) => request<DirectReport>(portal === 'operator' ? `/operator/direct-settlement?days=${days}` : `/admin/direct-settlement?days=${days}`, { portal }),
  integration: (portal: Portal, operatorId: string) => request<IntegrationSettings>(`/admin/operators/${operatorId}/integration`, { portal }),
  setIntegration: (portal: Portal, operatorId: string, body: { type: IntegrationType; webhookUrl?: string }) =>
    request<IntegrationSettings>(`/admin/operators/${operatorId}/integration`, { method: 'PUT', body: JSON.stringify(body), portal }),
  rotateNetworkKey: (portal: Portal, operatorId: string) => post<IntegrationSettings>(`/admin/operators/${operatorId}/integration/rotate`, undefined, portal),
  ocpi: (portal: Portal) => request<OcpiOverview>('/admin/ocpi', { portal }),
  connectOcpi: (portal: Portal, versionsUrl: string, token: string) => post<{ partner: OcpiPartner; synced: number }>('/admin/ocpi', { versionsUrl, token }, portal),
  syncOcpi: (portal: Portal, id: string) => post<{ stations: number; partner: OcpiPartner }>('/admin/ocpi/' + encodeURIComponent(id) + '/sync', undefined, portal),
  adminCredit: (portal: Portal) => request<CreditOverview>('/admin/credit', { portal }),
  updateCredit: (portal: Portal, userId: string, body: { status?: 'active' | 'paused'; limit?: number }) => post<CreditOverview>(`/admin/credit/${userId}`, body, portal),
  family: () => request<FamilyState>('/family', { portal: 'driver' }),
  inviteFamily: (phone: string, limit: number) => post<FamilyState>('/family/invite', { phone, limit }, 'driver'),
  answerFamily: (ownerId: string, accept: boolean) => post<FamilyState>('/family/answer', { ownerId, accept }, 'driver'),
  updateFamily: (memberId: string, body: { limit?: number; remove?: boolean }) => post<FamilyState>(`/family/${memberId}`, body, 'driver'),
  applyHost: (body: Record<string, unknown>) => post<{ application: HostApplication }>('/hosts/apply', body, 'driver'),
  myHosting: () => request<HostOverview>('/hosts/mine', { portal: 'driver' }),
  adminHosts: (portal: Portal) => request<HostApplication[]>('/admin/hosts', { portal }),
  decideHost: (portal: Portal, id: string, approve: boolean, reason?: string) => post<{ application: HostApplication; station?: Station }>(`/admin/hosts/${id}/decision`, { approve, reason }, portal),
  riskReport: (portal: Portal) => request<RiskReport>('/admin/risk', { portal }),
  reviewRisk: (portal: Portal, id: string, decision: 'confirmed' | 'dismissed', block = false) =>
    post<{ review: RiskFinding['review'] }>(`/admin/risk/${encodeURIComponent(id)}/review`, { decision, block }, portal),
  cdrReport: (portal: Portal, days = 30) => request<CdrReport>(`/admin/cdr?days=${days}`, { portal }),
  tariffBands: (portal: Portal) => request<{ bands: TariffBand[] }>('/admin/tariff-bands', { portal }),
  setTariffBands: (portal: Portal, bands: TariffBand[]) => request<{ bands: TariffBand[] }>('/admin/tariff-bands', { method: 'PUT', body: JSON.stringify({ bands }), portal }),
  staffAccounts: (portal: Portal) => request<StaffAccount[]>('/admin/accounts', { portal }),
  systemHealth: (portal: Portal) => request<SystemHealth>('/admin/health', { portal }),
  devices: (portal: Portal) => request<SignedInDevice[]>('/auth/sessions', { portal }),
  signOutOthers: (portal: Portal) => post<{ revoked: number }>('/auth/sessions/revoke-others', undefined, portal),
  changePassword: (portal: Portal, current: string, next: string) => post<{ ok: boolean }>('/auth/password', { current, next }, portal),
  notifications: (portal: Portal) => request<SyncEvent[]>('/notifications', { portal }),
  telegramStatus: () => request<{ configured: boolean }>('/auth/telegram/status'),
  telegramSignIn: (initData: string) => post<{ token: string; user: Account }>('/auth/telegram', { initData }),
  telegramLink: (initData: string) => post<{ user: Account }>('/auth/telegram/link', { initData }, 'driver'),
  telegramUnlink: () => post<{ user: Account }>('/auth/telegram/unlink', undefined, 'driver'),
  adminSettings: () => request<SettingsView>('/admin/settings', { portal: 'admin' }),
  saveSettings: (changes: Record<string, unknown>) => request<SettingsView>('/admin/settings', { method: 'PUT', body: JSON.stringify({ changes }), portal: 'admin' }),
  adminPrograms: () => request<any>('/admin/programs', { portal: 'admin' }),
  adminBonus: (phone: string, amount: number, reason: string) => post<BonusGrant>('/admin/bonus', { phone, amount, reason }, 'admin'),
  adminPartners: () => request<PartnerPlace[]>('/admin/partners', { portal: 'admin' }),
  createPartner: (body: { name: string; kind: PlaceKind; offer: string; lat: number; lng: number; pricePerShow: number; days: number }) => post<PartnerPlace>('/admin/partners', body, 'admin'),
  stopPartner: (id: string) => request<PartnerPlace>(`/admin/partners/${id}`, { method: 'DELETE', portal: 'admin' }),
  places: (stationId: string) => request<StationPlaces>(`/stations/${stationId}/places`),
  tapPlace: (id: string) => post<{ ok: boolean }>(`/places/${id}/tap`),
  arrival: (stationId: string, etaMin: number) => request<ArrivalChance>(`/stations/${stationId}/arrival?eta=${Math.round(etaMin)}`),
  setFleetPlan: (plan: 'standard' | 'taxi') => request<FleetPlan>('/fleet/plan', { method: 'PUT', body: JSON.stringify({ plan }), portal: 'business' }),
  fleetReport: (month: string) => request<{ month: string; drivers: FleetDriverRow[] }>(`/fleet/report?month=${month}`, { portal: 'business' }),
  linkAutocharge: (stationId: string) => post<AutochargeState>('/autocharge/link', { stationId }, 'driver'),
  unlinkAutocharge: () => request<AutochargeState>('/autocharge', { method: 'DELETE', portal: 'driver' }),
  subscribePlus: () => post<PlusState>('/plus', undefined, 'driver'),
  cancelPlus: () => request<PlusState>('/plus', { method: 'DELETE', portal: 'driver' }),
  batteryHealth: () => request<BatteryHealth>('/battery', { portal: 'driver' }),
  saveCar: (portal: Portal, car: Car) => request<{ user: Account; granted?: BonusGrant[] }>('/me/car', { method: 'PUT', body: JSON.stringify(car), portal }),
  logout: (portal: Portal) => post<{ ok: boolean }>('/auth/logout', undefined, portal),

  /** payer 'company' charges a fleet employee's session to their employer, within the monthly limit. */
  startSession: (portal: Portal, stationId: string, connectorId: string, payer: Payer = 'self', faceToken?: string, goal?: ChargeGoal) =>
    post<{ session: Session; stats: Stats }>('/sessions/start', { stationId, connectorId, payer, ...(faceToken ? { faceToken } : {}), ...(goal ? { goal } : {}) }, portal),
  reportCamera: (lat: number, lng: number, maxspeed?: number) => post<{ camera: { id: string } }>('/cameras', { lat, lng, ...(maxspeed ? { maxspeed } : {}) }, 'driver'),
  /** A link to the running charge for family or colleagues; the page shows no name or money. */
  supportThread: () => request<SupportThread>('/support/messages', { portal: 'driver' }),
  sendSupport: (text: string, image: string | null) => post<SupportThread>('/support/messages', { text, ...(image ? { image } : {}) }, 'driver'),
  adminSupport: () => request<SupportThread[]>('/admin/support', { portal: 'admin' }),
  answerSupport: (id: string, body: { text?: string; close?: boolean }) => post<SupportThread>(`/admin/support/${id}`, body, 'admin'),
  setStationInfo: (id: string, body: { findHint?: string; hours?: string; amenities?: string[]; photo?: string | null }) =>
    request<{ id: string }>(`/stations/${id}/info`, { method: 'PATCH', body: JSON.stringify(body), portal: 'operator' }),
  shareSession: (id: string) => post<{ token: string }>(`/sessions/${id}/share`, undefined, 'driver'),
  scheduleCharge: (body: { stationId: string; connectorId: string; payer: Payer; goal?: ChargeGoal; at: string }) => post<ScheduledStart>('/sessions/schedule', body, 'driver'),
  networkPromos: () => request<Promo[]>('/operator/promos', { portal: 'operator' }),
  createPromo: (body: { percent: number; title?: string; fromHour?: number | null; toHour?: number | null; firstOnly?: boolean; stationIds?: string[]; until?: string | null }) =>
    post<Promo>('/operator/promos', body, 'operator'),
  stopPromo: (id: string) => request<Promo>(`/operator/promos/${id}`, { method: 'DELETE', portal: 'operator' }),
  cancelSchedule: (id: string) => request<ScheduledStart>(`/sessions/schedule/${id}`, { method: 'DELETE', portal: 'driver' }),
  rateSession: (portal: Portal, id: string, stars: number) =>
    post<{ station: Station; session: Session }>(`/sessions/${id}/rating`, { stars }, portal),
  stopSession: (portal: Portal, id: string) =>
    post<{ session: Session; transaction: Transaction; stats: Stats }>(`/sessions/${id}/stop`, undefined, portal),
  tickSession: (portal: Portal, id: string) => post<{ session: Session }>(`/sessions/${id}/tick`, undefined, portal),
  tariffForecast: () => request<TariffForecast>('/tariffs/forecast'),
  reportIssue: (portal: Portal, stationId: string, body: { category: string; details?: string }) =>
    post<{ alert: Alert }>(`/stations/${stationId}/issues`, body, portal),
  ecoMe: (portal: Portal) => request<EcoProfile>('/eco/me', { portal }),
  ecoLeaderboard: (portal?: Portal) => request<LeaderRow[]>('/eco/leaderboard', { portal }),
  createBooking: (portal: Portal, stationId: string, body: { connectorId: string; startsAt: string; minutes: number }) =>
    post<{ booking: Booking; wallet: Wallet }>(`/stations/${stationId}/bookings`, body, portal),
  cancelBooking: (portal: Portal, id: string) =>
    request<{ booking: Booking; refunded: boolean }>(`/bookings/${id}`, { method: 'DELETE', portal }),
  paymentProviders: () => request<PaymentProvider[]>('/payments/providers'),
  /** With operatorId the money goes straight to that network's cashbox and tops up the balance there. */
  createTopUpOrder: (portal: Portal, provider: 'payme' | 'click' | 'uzum' | 'humo', amount: number, operatorId?: string) =>
    post<{ order: PaymentOrder; checkoutUrl: string; sandbox: boolean }>('/payments/topup', { provider, amount, ...(operatorId ? { operatorId } : {}) }, portal),
  /** Your own recent top-up orders, newest first. */
  listPayments: (portal: Portal) => request<PaymentOrder[]>('/payments', { portal }),
  sandboxConfirm: (portal: Portal, id: string) =>
    post<{ order: PaymentOrder; balance: number | null }>(`/payments/order/${id}/sandbox-confirm`, undefined, portal),
  joinQueue: (portal: Portal, stationId: string) =>
    post<{ entry: QueueEntry; position: number }>(`/stations/${stationId}/queue`, undefined, portal),
  leaveQueue: (portal: Portal, stationId: string) =>
    request<{ ok: boolean }>(`/stations/${stationId}/queue`, { method: 'DELETE', portal }),

  setConnectorStatus: (portal: Portal, stationId: string, connectorId: string, status: string) =>
    post<{ station: Station; stats: Stats }>(`/stations/${stationId}/connectors/${connectorId}`, { status }, portal),

  ackAlert: (portal: Portal, id: string) => post<{ alert: Alert; stats: Stats }>(`/alerts/${id}/ack`, undefined, portal),
  createAlert: (portal: Portal, body: { severity: string; stationId?: string; message: string; code?: string }) =>
    post<{ alert: Alert; stats: Stats }>('/alerts', body, portal),

  topUp: (portal: Portal, amount: number) => post<{ wallet: Wallet }>('/wallet/topup', { amount }, portal),
  setEmployeeLimit: (portal: Portal, id: string, limit: number) =>
    post<{ employee: Employee }>(`/employees/${id}/limit`, { limit }, portal),
  setOperatorStatus: (portal: Portal, id: string, status: string) =>
    post<{ operator: OperatorRecord }>(`/operators/${id}/status`, { status }, portal),

  resetDemo: (portal: Portal) => post<{ ok: boolean }>('/admin/reset', undefined, portal),

  refundTransaction: (portal: Portal, id: string) => post<{ transaction: Transaction }>(`/transactions/${id}/refund`, undefined, portal),
  setCommission: (portal: Portal, id: string, rate: number) => post<{ operator: OperatorRecord }>(`/operators/${id}/commission`, { rate }, portal),
  setConnectorPrice: (portal: Portal, stationId: string, connectorId: string, price: number) =>
    post<{ station: Station }>(`/stations/${stationId}/connectors/${connectorId}/price`, { price }, portal),
  addStation: (portal: Portal, body: { name: string; city: string; address: string; geoLat: number; geoLng: number; hours?: string; connectors: { type: string; power: number; price: number }[] }) =>
    post<{ station: Station; ocpp: { url: string; login: string } }>('/stations', body, portal),
  ocppChargepoints: (portal: Portal) => request<ChargePointInfo[]>('/ocpp/chargepoints', { portal }),
  ocppLog: (portal: Portal) => request<OcppLogEntry[]>('/ocpp/log', { portal }),
  ocppCommand: (portal: Portal, stationId: string, body: { action: string; type?: string; requestedMessage?: string; connectorId?: string }) =>
    post<{ status: string }>(`/ocpp/chargepoints/${stationId}/command`, body, portal),
  adminUsers: (portal: Portal) => request<AdminUsers>('/admin/users', { portal }),
  setUserStatus: (portal: Portal, id: string, status: 'active' | 'blocked') =>
    post<{ id: string; status: string }>(`/admin/users/${id}/status`, { status }, portal),
  events: (portal: Portal, limit = 300) => request<SyncEvent[]>(`/events?limit=${limit}`, { portal }),

  submitLead: (body: LeadInput) => post<{ ok: boolean; duplicate?: boolean }>('/leads', body),
  listLeads: (portal: Portal) => request<{ leads: Lead[] }>('/leads', { portal }),
  updateLead: (portal: Portal, id: string, patch: { status?: LeadStatus; note?: string }) =>
    request<Lead>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch), portal }),

  listReports: (portal: Portal, name: string) =>
    request<ReportRecord[]>(`/reports?name=${encodeURIComponent(name)}&limit=5`, { portal }),
  recordReport: (portal: Portal, body: { name: string; title: string; format: 'csv' | 'pdf'; rows: number }) =>
    post<{ report: ReportRecord }>('/reports', body, portal),
};

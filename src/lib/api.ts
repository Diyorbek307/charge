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
}

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
  revenueToday: number;
  evseTotal: number;
  evseOnline: number;
  stations: number;
  operators: number;
  openAlerts: number;
  availability: number;
}

export interface PlatformState {
  stations: Station[];
  operators: OperatorRecord[];
  sessions: Session[];
  transactions: Transaction[];
  alerts: Alert[];
  vehicles: Vehicle[];
  employees: Employee[];
  wallets: Record<string, Wallet>;
  queues?: QueueEntry[];
  events: SyncEvent[];
  stats: Stats;
  serverTime: string;
}

export interface QueueEntry {
  id: string;
  stationId: string;
  userId: string;
  user: string;
  joined: string;
  notified: boolean;
  notifiedAt: number | null;
  connectorId: string | null;
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
  getState: () => request<PlatformState>('/state'),
  getDemoCredentials: () => request<DemoCredential[]>('/auth/demo-credentials'),

  login: (portal: Portal, login: string, password: string) =>
    post<LoginResult>('/auth/login', { portal, login, password }),

  verify2fa: (challenge: string, code: string) =>
    post<{ token: string; user: Account }>('/auth/2fa/verify', { challenge, code }),
  get2fa: (portal: Portal) => request<{ enabled: boolean }>('/auth/2fa', { portal }),
  setup2fa: (portal: Portal) => post<{ secret: string; uri: string }>('/auth/2fa/setup', undefined, portal),
  enable2fa: (portal: Portal, code: string) => post<{ enabled: boolean }>('/auth/2fa/enable', { code }, portal),
  disable2fa: (portal: Portal, code: string) => post<{ enabled: boolean }>('/auth/2fa/disable', { code }, portal),

  requestOtp: (phone: string) => post<{ sent: boolean; hint: string }>('/auth/otp/request', { phone }),
  verifyOtp: (phone: string, code: string) =>
    post<{ token: string; user: Account }>('/auth/otp/verify', { phone, code }),

  me: (portal: Portal) => request<{ user: Account }>('/auth/me', { portal }),
  logout: (portal: Portal) => post<{ ok: boolean }>('/auth/logout', undefined, portal),

  startSession: (portal: Portal, stationId: string, connectorId: string) =>
    post<{ session: Session; stats: Stats }>('/sessions/start', { stationId, connectorId }, portal),
  stopSession: (portal: Portal, id: string) =>
    post<{ session: Session; transaction: Transaction; stats: Stats }>(`/sessions/${id}/stop`, undefined, portal),
  tickSession: (portal: Portal, id: string) => post<{ session: Session }>(`/sessions/${id}/tick`, undefined, portal),
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

  listReports: (portal: Portal, name: string) =>
    request<ReportRecord[]>(`/reports?name=${encodeURIComponent(name)}&limit=5`, { portal }),
  recordReport: (portal: Portal, body: { name: string; title: string; format: 'csv' | 'pdf'; rows: number }) =>
    post<{ report: ReportRecord }>('/reports', body, portal),
};

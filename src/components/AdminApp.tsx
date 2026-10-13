import { useState, type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import LeadsPage from './LeadsPage';
import AdminOverview from './admin/Overview';
import AdminOperators from './admin/Operators';
import AdminUsers from './admin/Users';
import AdminSessions from './admin/Sessions';
import AdminPayments from './admin/Payments';
import AdminSettlement from './admin/Settlement';
import AdminCommissions from './admin/Commissions';
import AdminAnalytics from './admin/Analytics';
import AdminInsights from './admin/Insights';
import AdminAudit from './admin/Audit';
import {
  LayoutDashboard, MapPin, Users, Activity, DollarSign, BarChart2,
  Settings, LogOut, Zap, AlertTriangle, Shield,
  CheckCircle, XCircle, Building2, Download,
  Brain, ScrollText, ClipboardCheck, Percent, UserCheck, Banknote, Plus,
  Tag, Sparkles, Menu
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useI18n } from '../lib/i18n';
import TwoFactorPanel from './TwoFactorPanel';
import SidebarThemeToggle from './SidebarThemeToggle';
import AIChat from './AIChat';

type Page = 'dashboard' | 'map' | 'operators' | 'leads' | 'users' | 'sessions' | 'payments' | 'settlement' | 'analytics' | 'ai' | 'fraud' | 'cdr' | 'commissions' | 'tariffs_global' | 'audit' | 'roles' | 'settings' | 'system_health';

function AdminSidebar({ current, onChange, onBack, isOpen, onClose }: { current: Page; onChange: (p: Page) => void; onBack: () => void; isOpen?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  const groups = [
    {
      label: t('nav.group.overview'),
      items: [
        { id: 'dashboard' as Page, label: 'Обзор', icon: <LayoutDashboard size={14} /> },
        { id: 'map' as Page, label: 'Карта сети', icon: <MapPin size={14} />, badge: '●' },
      ],
    },
    {
      label: t('nav.group.operations'),
      items: [
        { id: 'operators' as Page, label: t('nav.operators'), icon: <Building2 size={14} /> },
        { id: 'leads' as Page, label: 'Заявки', icon: <Inbox size={14} /> },
        { id: 'users' as Page, label: t('nav.users'), icon: <Users size={14} /> },
        { id: 'sessions' as Page, label: t('nav.sessions'), icon: <Activity size={14} /> },
      ],
    },
    {
      label: t('nav.finance'),
      items: [
        { id: 'payments' as Page, label: t('nav.payments'), icon: <DollarSign size={14} /> },
        { id: 'settlement' as Page, label: 'Расчёты', icon: <Banknote size={14} /> },
        { id: 'commissions' as Page, label: t('nav.commissions'), icon: <Percent size={14} /> },
        { id: 'tariffs_global' as Page, label: t('nav.networkTariffs'), icon: <Tag size={14} /> },
      ],
    },
    {
      label: t('nav.group.analyticsAi'),
      items: [
        { id: 'analytics' as Page, label: t('nav.analytics'), icon: <BarChart2 size={14} /> },
        { id: 'ai' as Page, label: 'Подсказки', icon: <Brain size={14} /> },
        { id: 'fraud' as Page, label: 'Риски и фрод', icon: <Shield size={14} /> },
        { id: 'cdr' as Page, label: 'Проверка CDR', icon: <ClipboardCheck size={14} /> },
      ],
    },
    {
      label: t('nav.group.system'),
      items: [
        { id: 'audit' as Page, label: 'Журнал аудита', icon: <ScrollText size={14} /> },
        { id: 'roles' as Page, label: t('nav.roles'), icon: <UserCheck size={14} /> },
        { id: 'settings' as Page, label: t('nav.settings'), icon: <Settings size={14} /> },
        { id: 'system_health' as Page, label: 'Состояние системы', icon: <Activity size={14} /> },
      ],
    },
  ];

  return (
    <div className={`w-[210px] flex flex-col h-full shrink-0 absolute inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#080C18', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Brand */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #4F6BFF, #3B4FE0)' }}>
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ONE CHARGE</p>
            <p className="text-[11px] leading-none mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>Admin Control Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #4F6BFF, #2F3DB8)' }}>A</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">Super Admin</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>ONE CHARGE UZ</p>
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.35)' }}>{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = current === item.id;
                return (
                  <button key={item.id} onClick={() => { onChange(item.id); onClose?.(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] transition-all relative"
                    style={active ? {
                      background: 'rgba(79, 107, 255,0.15)',
                      color: '#C4B5FD',
                      fontWeight: 600,
                    } : {
                      color: 'rgba(148,163,184,0.7)',
                    }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'; } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.7)'; } }}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-violet-400" />}
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${item.badge === '●' ? 'text-emerald-400' : 'bg-red-500/90 text-white'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onBack}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all"
          style={{ color: 'rgba(148,163,184,0.5)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.5)'; }}
        >
          <LogOut size={14} />{t('nav.signOutPortal')}
        </button>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

const mapStations = [
  { x: 72, y: 65, status: 'available', name: 'Toshkent Siti Hub', city: 'Toshkent', count: 47, evse: 120, power: 150, operator: 'GreenCharge UZ', active: 31 },
  { x: 55, y: 48, status: 'occupied', name: 'Samarqand Gateway', city: 'Samarqand', count: 22, evse: 56, power: 100, operator: 'EcoVolt', active: 18 },
  { x: 36, y: 38, status: 'available', name: 'SilkRoad Buxoro', city: 'Buxoro', count: 18, evse: 44, power: 150, operator: 'SilkRoad EV', active: 10 },
  { x: 76, y: 55, status: 'reserved', name: 'Namangan Station', city: 'Namangan', count: 8, evse: 20, power: 50, operator: 'GreenCharge UZ', active: 5 },
  { x: 80, y: 59, status: 'available', name: 'Andijon EV Park', city: 'Andijon', count: 13, evse: 32, power: 100, operator: 'EcoVolt', active: 9 },
  { x: 14, y: 30, status: 'unavailable', name: 'Nukus Power Hub', city: 'Nukus', count: 8, evse: 24, power: 50, operator: 'Nukus Power', active: 0 },
];

function LiveMapPage() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<typeof mapStations[0] | null>(null);
  const [opFilter, setOpFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = mapStations.filter(s => {
    const matchOp = opFilter === 'all' || s.operator === opFilter;
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchOp && matchStatus;
  });

  const stColor: Record<string, string> = { available: '#22C55E', occupied: '#EF4444', unavailable: '#94A3B8', reserved: '#F59E0B' };
  const stBg: Record<string, string> = { available: 'bg-green-100 text-green-700', occupied: 'bg-red-100 text-red-700', unavailable: 'bg-slate-100 text-slate-500', reserved: 'bg-amber-100 text-amber-700' };
  const stLabel: Record<string, string> = { available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно', reserved: 'Забронировано' };

  const totals = { all: mapStations.length, available: mapStations.filter(s => s.status === 'available').length, occupied: mapStations.filter(s => s.status === 'occupied').length, reserved: mapStations.filter(s => s.status === 'reserved').length, unavailable: mapStations.filter(s => s.status === 'unavailable').length };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 bg-white border-b border-slate-100 flex items-center gap-3 shrink-0">
          <h1 className="text-base font-bold text-slate-900">Live Map</h1>
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-slate-500">real-time</span>
          </div>
          <div className="flex gap-1 ml-auto">
            {['all', 'available', 'occupied', 'unavailable'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${statusFilter === f ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                {f === 'all' ? 'Все' : stLabel[f]} {f !== 'all' && `(${totals[f as keyof typeof totals]})`}
              </button>
            ))}
          </div>
          <select value={opFilter} onChange={e => setOpFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none">
            <option value="all">Все операторы</option>
            {[...new Set(mapStations.map(s => s.operator))].map(op => <option key={op}>{op}</option>)}
          </select>
        </div>

        {/* KPI row */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex gap-4 shrink-0">
          {[
            { label: t('lbl2.totalStations'), v: totals.all, c: 'text-slate-900' },
            { label: t('lbl2.available'), v: totals.available, c: 'text-green-600' },
            { label: t('lbl2.occupied'), v: totals.occupied, c: 'text-red-500' },
            { label: t('lbl2.reserved'), v: totals.reserved, c: 'text-amber-500' },
            { label: t('lbl2.unavailable'), v: totals.unavailable, c: 'text-slate-400' },
            { label: t('lbl2.activeEvse'), v: mapStations.reduce((s, st) => s + st.active, 0), c: 'text-sky-600' },
          ].map(k => (
            <div key={k.label} className="flex items-center gap-1.5">
              <span className={`text-base font-bold mono ${k.c}`}>{k.v}</span>
              <span className="text-xs text-slate-400">{k.label}</span>
            </div>
          ))}
        </div>

        {/* Map */}
        <div className="flex-1 bg-slate-100 relative overflow-hidden">
          <svg viewBox="0 0 100 80" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="adminHeat1" cx="72%" cy="65%" r="18%">
                <stop offset="0%" stopColor="#EF4444" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
              </radialGradient>
              <radialGradient id="adminHeat2" cx="55%" cy="48%" r="14%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
              </radialGradient>
              <filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3"/></filter>
            </defs>

            {/* UZ outline */}
            <path d="M10,25 L18,18 L28,15 L38,12 L50,10 L62,8 L72,12 L82,14 L90,18 L93,25 L92,32 L88,38 L82,42 L76,48 L70,52 L65,58 L60,65 L55,70 L48,72 L42,68 L38,62 L32,58 L26,55 L20,50 L14,44 L10,36 Z"
              fill="#E2EAF4" stroke="#B8C8DC" strokeWidth="0.6" />

            {/* Heat zones */}
            <ellipse cx="72" cy="65" rx="14" ry="10" fill="url(#adminHeat1)" />
            <ellipse cx="55" cy="48" rx="11" ry="8" fill="url(#adminHeat2)" />

            {/* Roads */}
            <path d="M72,14 L68,25 L62,34 L55,42 L48,46 L40,44 L35,40" stroke="#C8D4E4" strokeWidth="0.6" fill="none" strokeDasharray="1,1" />
            <path d="M55,42 L60,52 L66,58 L72,62" stroke="#C8D4E4" strokeWidth="0.5" fill="none" strokeDasharray="1,1" />

            {/* Station markers */}
            {filtered.map((st, i) => (
              <g key={i} onClick={() => setSelected(selected?.name === st.name ? null : st)} style={{ cursor: 'pointer' }}>
                {selected?.name === st.name && (
                  <circle cx={st.x} cy={st.y} r="6" fill={stColor[st.status]} opacity={0.2} />
                )}
                <circle cx={st.x} cy={st.y} r={selected?.name === st.name ? 3.5 : 2.8}
                  fill={stColor[st.status]} stroke="white" strokeWidth="0.8" filter="url(#shadow)"
                  className="transition-all" />
                {st.status === 'available' && (
                  <circle cx={st.x} cy={st.y} r="5" fill="none" stroke={stColor[st.status]} strokeWidth="0.4" opacity={0.5}>
                    <animate attributeName="r" from="3" to="7" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <text x={st.x + 4} y={st.y + 1} fontSize="2" fill="#475569" fontWeight="500" fontFamily="Manrope, sans-serif">
                  {st.name.split(' ')[0]}
                </text>
              </g>
            ))}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-xl p-2.5 text-xs shadow-sm border border-slate-100 space-y-1.5">
            {Object.entries(stLabel).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: stColor[k] }} />
                <span className="text-slate-600">{v}</span>
              </div>
            ))}
          </div>

          {/* Realtime ticker */}
          <div className="absolute top-3 right-3 bg-white/95 rounded-xl px-3 py-2 text-xs border border-slate-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="font-semibold text-slate-700">Активных сессий</span>
            </div>
            <p className="text-2xl font-bold mono text-sky-600">{mapStations.reduce((s, st) => s + st.active, 0)}</p>
            <p className="text-slate-400">из {mapStations.reduce((s, st) => s + st.evse, 0)} EVSE</p>
          </div>
        </div>
      </div>

      {/* Station sidebar */}
      {selected && (
        <div className="w-72 shrink-0 bg-white border-l border-slate-100 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">{selected.name}</p>
              <p className="text-xs text-slate-400">{selected.city} · {selected.operator}</p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <XCircle size={15} className="text-slate-400" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <span className={`inline-flex text-xs px-2.5 py-1 rounded-full ${stBg[selected.status]}`}>{stLabel[selected.status]}</span>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t('lbl2.stations2'), value: selected.count },
                { label: 'EVSE всего', value: selected.evse },
                { label: t('lbl2.active2'), value: selected.active },
                { label: t('lbl2.maxPower'), value: `${selected.power} кВт` },
              ].map(m => (
                <div key={m.label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-0.5">{m.label}</p>
                  <p className="text-base font-bold mono text-slate-800">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Utilization bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Загрузка EVSE</span>
                <span className="mono">{Math.round((selected.active / selected.evse) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${(selected.active / selected.evse) * 100}%` }} />
              </div>
            </div>

            {/* Mini session log */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">ТЕКУЩИЕ СЕССИИ</p>
              {selected.active > 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: Math.min(selected.active, 3) }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2">
                      <span className="text-slate-600">EVSE-{i + 1}</span>
                      <span className="text-green-600 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        {(50 + Math.random() * 90).toFixed(1)} кВт
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">Нет активных сессий</p>
              )}
            </div>

            <button className="w-full py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600">
              Открыть в Станции →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const fraudAlerts = [
  {
    id: 'FRD-001', sessionId: 'S-10812', type: 'energy_anomaly', label: 'Аномальная энергия',
    detail: '312 кВт·ч за 45 мин — физически невозможно для CCS2 150 кВт (макс ~112 кВт·ч)',
    risk: 'critical', score: 97, user: 'Anon-7821', userId: 'U-8841',
    station: 'Namangan Industrial', time: '03:41', amount: '624 000 сум',
    signals: ['Превышение физического лимита в 2.7x', 'Аккаунт создан 3 дня назад', 'VPN-адрес при регистрации'],
    status: 'open',
  },
  {
    id: 'FRD-002', sessionId: 'TXN-28422', type: 'payment_anomaly', label: 'Аномальный платёж',
    detail: 'Сессия 3 мин, списание 89 000 сум (медиана для 3 мин = 4 200 сум, отклонение ×21)',
    risk: 'high', score: 88, user: 'U.Karimov', userId: 'U-3344',
    station: 'Yunusobod Mall', time: '22:17', amount: '89 000 сум',
    signals: ['Нетипично большая сумма', 'Нетипичное время суток', 'Первая транзакция карты'],
    status: 'open',
  },
  {
    id: 'FRD-003', sessionId: 'S-10798', type: 'auth_brute', label: 'Брутфорс токена',
    detail: '8 последовательных ошибок авторизации с одного IP за 2 мин на EVSE-001',
    risk: 'medium', score: 72, user: 'Anon-3344', userId: 'U-3344',
    station: 'Toshkent Siti Hub', time: '14:33', amount: '—',
    signals: ['Повторные ошибки авторизации', 'Один IP-адрес', 'Паттерн совпадает с credential stuffing'],
    status: 'open',
  },
  {
    id: 'FRD-004', sessionId: 'API-7821', type: 'api_abuse', label: 'API Rate Abuse',
    detail: '1 840 запросов за 60 сек с одного client_id (лимит 1000/мин)',
    risk: 'low', score: 44, user: 'partner-api-key-12', userId: 'OP-002',
    station: '—', time: '09:02', amount: '—',
    signals: ['Превышение rate limit', 'Нетипичный паттерн запросов', 'Автоматически заблокирован на 15 мин'],
    status: 'resolved',
  },
];

function FraudPage() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState(fraudAlerts);
  const [selected, setSelected] = useState<typeof fraudAlerts[0] | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const dismiss = (id: string) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a));
  const block = (id: string) => { dismiss(id); setSelected(null); };

  const filtered = alerts.filter(a => filter === 'all' || a.status === filter);
  const open = alerts.filter(a => a.status === 'open').length;

  const riskColor: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const riskLabel: Record<string, string> = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
  const scoreColor = (s: number) => s >= 85 ? 'text-red-600' : s >= 65 ? 'text-amber-500' : 'text-slate-500';

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 space-y-5 overflow-y-auto min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fraud & Risk Monitor</h1>
            <p className="text-sm text-slate-500">ML-модель · обновляется каждые 30 сек</p>
          </div>
          {open > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 animate-pulse">
              <AlertTriangle size={13} />{open} требуют действий
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t('lbl2.critical'), v: alerts.filter(a => a.risk === 'critical' && a.status === 'open').length, c: 'text-red-600', bg: 'bg-red-50' },
            { label: t('lbl2.highRisk'), v: alerts.filter(a => a.risk === 'high' && a.status === 'open').length, c: 'text-orange-600', bg: 'bg-orange-50' },
            { label: t('lbl2.mediumRisk'), v: alerts.filter(a => a.risk === 'medium' && a.status === 'open').length, c: 'text-amber-600', bg: 'bg-amber-50' },
            { label: t('lbl2.resolvedToday'), v: alerts.filter(a => a.status === 'resolved').length, c: 'text-green-600', bg: 'bg-green-50' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl border border-slate-100 p-4 text-center`}>
              <p className={`text-2xl font-bold mono ${k.c}`}>{k.v}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* ML model info */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center justify-center text-xl">🤖</div>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">Fraud ML Engine v2.4</p>
            <p className="text-slate-400 text-xs">Isolation Forest + LSTM · 847 признаков · точность 96.3% · False Positive Rate 0.8%</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-green-400">Active</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-700">Подозрительные операции</h3>
            <div className="flex gap-1 ml-auto">
              {(['all', 'open', 'resolved'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs rounded-lg ${filter === f ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {f === 'all' ? 'Все' : f === 'open' ? 'Открытые' : 'Решённые'}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(alert => (
              <div key={alert.id} onClick={() => setSelected(selected?.id === alert.id ? null : alert)}
                className={`px-5 py-4 flex items-start gap-4 cursor-pointer transition-colors hover:bg-slate-50 ${selected?.id === alert.id ? 'bg-sky-50' : ''} ${alert.status === 'resolved' ? 'opacity-60' : ''}`}>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full ${alert.risk === 'critical' ? 'bg-red-500' : alert.risk === 'high' ? 'bg-orange-400' : alert.risk === 'medium' ? 'bg-amber-400' : 'bg-slate-300'}`} />
                  <span className={`text-xs font-bold mono ${scoreColor(alert.score)}`}>{alert.score}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{alert.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${riskColor[alert.risk]}`}>{riskLabel[alert.risk]}</span>
                    {alert.status === 'resolved' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">Решено</span>}
                  </div>
                  <p className="text-xs text-slate-500 mb-1 leading-relaxed">{alert.detail}</p>
                  <p className="text-xs text-slate-400 mono">{alert.id} · {alert.user} · {alert.station} · {alert.time}</p>
                </div>
                {alert.status === 'open' && (
                  <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => block(alert.id)} className="px-2.5 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200">
                      Блок
                    </button>
                    <button onClick={() => dismiss(alert.id)} className="px-2.5 py-1.5 text-xs bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 border border-slate-200">
                      Игнор
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 shrink-0 bg-white border-l border-slate-100 overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900 mono">{selected.id}</p>
              <p className="text-xs text-slate-400">{selected.label}</p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <Plus size={14} className="rotate-45 text-slate-500" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            {/* Risk score meter */}
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-slate-500">ML FRAUD SCORE</p>
                <span className={`text-2xl font-bold mono ${scoreColor(selected.score)}`}>{selected.score}<span className="text-sm text-slate-400">/100</span></span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${selected.score >= 85 ? 'bg-red-500' : selected.score >= 65 ? 'bg-amber-400' : 'bg-slate-400'}`}
                  style={{ width: `${selected.score}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{selected.score >= 85 ? 'Высокая вероятность мошенничества' : selected.score >= 65 ? 'Требует ручной проверки' : 'Низкий риск'}</p>
            </div>

            {/* Key signals */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Сигналы ML-модели</p>
              <div className="space-y-1.5">
                {selected.signals.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1 h-1 bg-red-400 rounded-full shrink-0 mt-1.5" />
                    <span className="text-slate-600">{s}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">{selected.score >= 80 ? 'Высокий риск' : selected.score >= 60 ? 'Средний риск' : 'Низкий риск'}</p>
            </div>

            {/* Details */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Детали операции</p>
              {[
                { label: 'Session / Txn ID', value: selected.sessionId },
                { label: t('lbl2.user'), value: selected.user },
                { label: 'User ID', value: selected.userId },
                { label: t('lbl2.station'), value: selected.station },
                { label: t('lbl2.time'), value: selected.time },
                { label: t('lbl2.amount'), value: selected.amount },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-xs py-0.5 border-b border-slate-50">
                  <span className="text-slate-400">{r.label}</span>
                  <span className="text-slate-800 font-medium mono">{r.value}</span>
                </div>
              ))}
            </div>

            {selected.status === 'open' && (
              <div className="flex flex-col gap-2">
                <button onClick={() => { block(selected.id); }} className="w-full py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">
                  Заблокировать пользователя
                </button>
                <button className="w-full py-2.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl text-sm font-medium hover:bg-amber-100">
                  Инициировать возврат
                </button>
                <button onClick={() => { dismiss(selected.id); setSelected(null); }}
                  className="w-full py-2.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-100">
                  Отметить как безопасное
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const regionTariffs = [
  { region: 'Ташкент', city: 'Tashkent', dcFast: 2000, acStd: 1200, dcNight: 1500, sessions: 5840, trend: +8.2 },
  { region: 'Самарканд', city: 'Samarkand', dcFast: 1900, acStd: 1100, dcNight: 1400, sessions: 1420, trend: +15.1 },
  { region: 'Бухара', city: 'Bukhara', dcFast: 1850, acStd: 1050, dcNight: 1350, sessions: 840, trend: +22.4 },
  { region: 'Наманган', city: 'Namangan', dcFast: 1800, acStd: 1000, dcNight: 1300, sessions: 620, trend: +31.0 },
  { region: 'Фергана', city: 'Fergana', dcFast: 1750, acStd: 980, dcNight: 1250, sessions: 440, trend: +18.7 },
  { region: 'Андижан', city: 'Andijan', dcFast: 1750, acStd: 980, dcNight: 1250, sessions: 310, trend: +42.1 },
];

const pricingRules = [
  { id: 'PR-001', name: 'Пиковые часы', desc: 'Надбавка в час-пик', time: '08:00–10:00 / 17:00–19:00', modifier: '+15%', active: true, applies: 'DC Fast · все регионы' },
  { id: 'PR-002', name: 'Ночной тариф', desc: 'Скидка в ночное время', time: '23:00–07:00', modifier: '−25%', active: true, applies: 'DC Fast + AC · все регионы' },
  { id: 'PR-003', name: 'Выходные', desc: 'Надбавка в выходные дни', time: 'Сб–Вс 10:00–18:00', modifier: '+8%', active: false, applies: 'Торговые центры' },
  { id: 'PR-004', name: 'Корпоративный', desc: 'Фиксированная скидка для флота', time: 'Всегда', modifier: '−10%', active: true, applies: 'Business Plan операторы' },
];

function GlobalTariffsPage() {
  const { t } = useI18n();
  const [editingRegion, setEditingRegion] = useState<string | null>(null);
  const [regionData, setRegionData] = useState(regionTariffs);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [rules, setRules] = useState(pricingRules);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  const startEdit = (city: string, r: typeof regionTariffs[0]) => {
    setEditingRegion(city);
    setEditValues({ dcFast: r.dcFast, acStd: r.acStd, dcNight: r.dcNight });
  };

  const saveEdit = (city: string) => {
    setRegionData(prev => prev.map(r => r.city === city ? { ...r, ...editValues } : r));
    setEditingRegion(null);
  };

  const runAI = () => {
    setAiLoading(true);
    setAiSuggestion(null);
    setTimeout(() => {
      setAiLoading(false);
      setAiSuggestion('На основе анализа 47 тыс. сессий за последние 30 дней: в Андижане и Намангане рост спроса +35%. Рекомендую увеличить DC Fast тариф на 5% (до 1 838–1 890 сум/кВтч). Ташкент — высокая конкуренция, текущие цены оптимальны. Включение правила «Выходные» для ТЦ прогнозирует +4.2% выручки.');
    }, 1800);
  };

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('page.networkTariffs')}</h1>
          <p className="text-sm text-slate-500">Ценообразование по регионам, пиковые правила и AI-оптимизация</p>
        </div>
        <button onClick={runAI} disabled={aiLoading}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-lg shadow-violet-500/25 disabled:opacity-60">
          <Sparkles size={14} className={aiLoading ? 'animate-spin' : ''} />
          {aiLoading ? 'AI анализирует...' : 'AI Рекомендация'}
        </button>
      </div>

      {aiSuggestion && (
        <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-400/20 rounded-2xl p-4 flex items-start gap-3">
          <Sparkles size={16} className="text-violet-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-violet-400 mb-1">AI РЕКОМЕНДАЦИЯ</p>
            <p className="text-sm text-slate-700 leading-relaxed">{aiSuggestion}</p>
          </div>
          <button onClick={() => setAiSuggestion(null)} className="text-slate-400 hover:text-slate-600 shrink-0 text-xs">✕</button>
        </div>
      )}

      {/* Summary stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('lbl2.averageDcFast'), value: `${Math.round(regionData.reduce((s, r) => s + r.dcFast, 0) / regionData.length).toLocaleString()} сум`, sub: t('sub.acrossTheNetwork') },
          { label: t('lbl2.averageAc'), value: `${Math.round(regionData.reduce((s, r) => s + r.acStd, 0) / regionData.length).toLocaleString()} сум`, sub: t('sub.acrossTheNetwork') },
          { label: t('lbl2.activeRules'), value: String(rules.filter(r => r.active).length), sub: `из ${rules.length}` },
          { label: t('lbl2.regions'), value: String(regionData.length), sub: t('sub.covered') },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-2xl p-4">
            <p className="text-xs text-slate-400 mb-0.5">{s.label}</p>
            <p className="text-xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Regional price matrix */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Ценовая матрица по регионам</h3>
          <p className="text-xs text-slate-400">сум / кВтч · НДС включён</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {[t('th.region'), 'DC Fast (CCS2)', 'AC Standard', t('th.dcNight'), t('th.sessionsPerMonth'), t('th.trend'), ''].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {regionData.map(r => (
              <tr key={r.city} className="hover:bg-slate-50">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-semibold text-slate-800">{r.region}</p>
                  <p className="text-xs text-slate-400">{r.city}</p>
                </td>
                {(['dcFast', 'acStd', 'dcNight'] as const).map(field => (
                  <td key={field} className="px-5 py-3.5">
                    {editingRegion === r.city ? (
                      <input type="number" value={editValues[field]}
                        onChange={e => setEditValues(prev => ({ ...prev, [field]: Number(e.target.value) }))}
                        className="w-20 border border-sky-300 rounded-lg px-2 py-1 text-sm font-mono outline-none" />
                    ) : (
                      <span className="text-sm font-mono font-semibold text-slate-700">{r[field].toLocaleString()}</span>
                    )}
                  </td>
                ))}
                <td className="px-5 py-3.5 text-sm text-slate-600">{r.sessions.toLocaleString()}</td>
                <td className="px-5 py-3.5">
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-lg">+{r.trend}%</span>
                </td>
                <td className="px-5 py-3.5">
                  {editingRegion === r.city ? (
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(r.city)} className="text-xs text-green-500 font-semibold hover:text-green-700">Сохранить</button>
                      <button onClick={() => setEditingRegion(null)} className="text-xs text-slate-400 hover:text-slate-600">Отмена</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r.city, r)} className="text-xs text-sky-500 font-medium hover:underline">Изменить</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pricing rules */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Правила ценообразования</h3>
          <button className="text-xs bg-sky-500 hover:bg-sky-400 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1">
            <Plus size={11} /> Добавить правило
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {rules.map(rule => (
            <div key={rule.id} className="px-5 py-4 flex items-center gap-4">
              <button onClick={() => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))}
                className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${rule.active ? 'bg-sky-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${rule.active ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{rule.name}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${rule.modifier.startsWith('+') ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{rule.modifier}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{rule.time} · {rule.applies}</p>
              </div>
              <span className={`text-xs font-medium ${rule.active ? 'text-green-600' : 'text-slate-400'}`}>{rule.active ? 'Активно' : 'Выкл.'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bar chart by region */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">DC Fast тариф по регионам</h3>
        <div className="flex items-end gap-3 h-28">
          {regionData.map(r => {
            const pct = (r.dcFast - 1700) / (2100 - 1700);
            return (
              <div key={r.city} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-slate-500">{r.dcFast.toLocaleString()}</span>
                <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(20, pct * 80)}px`, background: `linear-gradient(180deg, #20D4B6, #078C7C)` }} />
                <span className="text-[10px] text-slate-400 text-center leading-tight">{r.region}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const cdrRecords = [
  { id: 'CDR-10842', session: 'S-10842', user: 'Alisher T.', operator: 'GreenCharge UZ', start: '14:23:04', end: '15:05:41', energy: 38.4, tariff: 2000, computed: 76800, billed: 76800, status: 'valid', suspicious: false },
  { id: 'CDR-10841', session: 'S-10841', user: 'Nilufar K.', operator: 'EcoVolt', start: '13:45:12', end: '—', energy: 24.1, tariff: 1800, computed: 43380, billed: 43380, status: 'active', suspicious: false },
  { id: 'CDR-10840', session: 'S-10840', user: 'Bobur M.', operator: 'SilkRoad EV', start: '12:10:00', end: '12:55:33', energy: 41.2, tariff: 1900, computed: 78280, billed: 78280, status: 'valid', suspicious: false },
  { id: 'CDR-10812', session: 'S-10812', user: 'Anon-7821', operator: 'GreenCharge UZ', start: '09:12:00', end: '09:57:11', energy: 312.0, tariff: 2000, computed: 624000, billed: 0, status: 'suspicious', suspicious: true },
  { id: 'CDR-10798', session: 'S-10798', user: 'Anon-3344', operator: 'EcoVolt', start: '08:44:00', end: '08:46:10', energy: 0.2, tariff: 1800, computed: 360, billed: 89000, status: 'mismatch', suspicious: true },
  { id: 'CDR-10791', session: 'S-10791', user: 'Kamola A.', operator: 'SilkRoad EV', start: '07:30:00', end: '08:10:25', energy: 32.8, tariff: 1900, computed: 62320, billed: 62320, status: 'valid', suspicious: false },
];

function CDRValidationPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | 'suspicious' | 'mismatch' | 'valid'>('all');
  const filtered = filter === 'all' ? cdrRecords : cdrRecords.filter(r => r.status === filter);

  const cdrStatusBg: Record<string, string> = {
    valid: 'bg-green-100 text-green-700',
    active: 'bg-sky-100 text-sky-700',
    suspicious: 'bg-red-100 text-red-700',
    mismatch: 'bg-amber-100 text-amber-700',
  };
  const cdrStatusLabel: Record<string, string> = {
    valid: 'Валидно', active: 'Активна', suspicious: 'Подозрительно', mismatch: 'Расхождение',
  };

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">CDR Validation</h1>
          <p className="text-sm text-slate-500">Charge Detail Records · проверка корректности данных</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600">
          <Download size={14} />Экспорт CDR
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('lbl2.totalCdr24h'), v: String(cdrRecords.length), c: 'text-slate-900' },
          { label: t('lbl2.valid'), v: String(cdrRecords.filter(r => r.status === 'valid').length), c: 'text-green-600' },
          { label: t('lbl2.discrepancies'), v: String(cdrRecords.filter(r => r.status === 'mismatch').length), c: 'text-amber-500' },
          { label: t('lbl2.suspicious'), v: String(cdrRecords.filter(r => r.suspicious).length), c: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
            <p className={`text-2xl font-bold mono ${s.c}`}>{s.v}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(['all', 'valid', 'mismatch', 'suspicious'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filter === f ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f === 'all' ? 'Все' : cdrStatusLabel[f]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['CDR ID', t('th.operator'), t('th.user'), t('th.start'), t('th.end'), t('th.energy'), t('th.settlement'), t('th.invoiced'), t('th.status'), ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(r => (
              <tr key={r.id} className={`hover:bg-slate-50 ${r.suspicious ? 'bg-red-50/30' : ''}`}>
                <td className="px-4 py-3 text-xs text-sky-600 font-medium mono">{r.id}</td>
                <td className="px-4 py-3 text-slate-600">{r.operator.split(' ')[0]}</td>
                <td className="px-4 py-3 text-slate-700">{r.user}</td>
                <td className="px-4 py-3 text-slate-500 mono text-xs">{r.start}</td>
                <td className="px-4 py-3 text-slate-500 mono text-xs">{r.end}</td>
                <td className={`px-4 py-3 font-medium mono ${r.energy > 200 ? 'text-red-600' : 'text-slate-700'}`}>{r.energy} кВт·ч</td>
                <td className="px-4 py-3 text-slate-600 mono">{r.computed.toLocaleString()}</td>
                <td className={`px-4 py-3 font-semibold mono ${r.billed !== r.computed ? 'text-amber-600' : 'text-slate-800'}`}>
                  {r.billed.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cdrStatusBg[r.status]}`}>{cdrStatusLabel[r.status]}</span>
                </td>
                <td className="px-4 py-3">
                  {r.suspicious && (
                    <button className="text-xs text-red-500 font-medium hover:underline">Проверить</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Validation rules */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Правила валидации</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { rule: 'Энергия > мощность × время', ok: true },
            { rule: 'Стоимость = энергия × тариф', ok: true },
            { rule: 'Время завершения > время начала', ok: true },
            { rule: 'Макс. энергия CCS2 150кВт: 150 кВт·ч/ч', ok: false },
            { rule: 'Тариф соответствует OCPI тарифу', ok: true },
            { rule: 'Дублирующих CDR нет', ok: true },
          ].map(r => (
            <div key={r.rule} className={`flex items-center gap-2 p-3 rounded-xl text-xs ${r.ok ? 'bg-green-50' : 'bg-red-50'}`}>
              {r.ok ? <CheckCircle size={13} className="text-green-500 shrink-0" /> : <XCircle size={13} className="text-red-400 shrink-0" />}
              <span className={r.ok ? 'text-green-700' : 'text-red-600'}>{r.rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PERMISSIONS = [
  { group: 'Станции', perms: ['Просмотр', 'Создание', 'Редактирование', 'Удаление', 'Remote Reset', 'Remote Stop'] },
  { group: 'Сессии', perms: ['Просмотр', 'Остановка сессии', 'Экспорт CDR', 'Возврат'] },
  { group: 'Пользователи', perms: ['Просмотр', 'Блокировка', 'KYC', 'Сброс PIN'] },
  { group: 'Финансы', perms: ['Просмотр балансов', 'Выплаты', 'Экспорт', 'Комиссии'] },
  { group: 'Операторы', perms: ['Просмотр', 'Подключение', 'Тарифы', 'Отключение'] },
  { group: 'Настройки', perms: ['Системные настройки', 'API ключи', 'Аудит лог', 'Роли'] },
];

const DEFAULT_ROLES: Record<string, Record<string, string[]>> = {
  'Super Admin': {
    'Станции': ['Просмотр', 'Создание', 'Редактирование', 'Удаление', 'Remote Reset', 'Remote Stop'],
    'Сессии': ['Просмотр', 'Остановка сессии', 'Экспорт CDR', 'Возврат'],
    'Пользователи': ['Просмотр', 'Блокировка', 'KYC', 'Сброс PIN'],
    'Финансы': ['Просмотр балансов', 'Выплаты', 'Экспорт', 'Комиссии'],
    'Операторы': ['Просмотр', 'Подключение', 'Тарифы', 'Отключение'],
    'Настройки': ['Системные настройки', 'API ключи', 'Аудит лог', 'Роли'],
  },
  'Operations Manager': {
    'Станции': ['Просмотр', 'Редактирование', 'Remote Reset', 'Remote Stop'],
    'Сессии': ['Просмотр', 'Остановка сессии', 'Экспорт CDR'],
    'Пользователи': ['Просмотр'],
    'Финансы': ['Просмотр балансов', 'Экспорт'],
    'Операторы': ['Просмотр', 'Тарифы'],
    'Настройки': [],
  },
  'Finance Analyst': {
    'Станции': ['Просмотр'],
    'Сессии': ['Просмотр', 'Экспорт CDR'],
    'Пользователи': ['Просмотр'],
    'Финансы': ['Просмотр балансов', 'Выплаты', 'Экспорт', 'Комиссии'],
    'Операторы': ['Просмотр'],
    'Настройки': ['Аудит лог'],
  },
  'Support Agent': {
    'Станции': ['Просмотр'],
    'Сессии': ['Просмотр'],
    'Пользователи': ['Просмотр', 'Блокировка', 'Сброс PIN'],
    'Финансы': ['Просмотр балансов'],
    'Операторы': ['Просмотр'],
    'Настройки': [],
  },
};

const ROLE_USERS: Record<string, { name: string; email: string; avatar: string }[]> = {
  'Super Admin': [{ name: 'Алишер Каримов', email: 'a.karimov@onecharge.uz', avatar: 'AK' }],
  'Operations Manager': [
    { name: 'Нилуфар Рашидова', email: 'n.rashidova@onecharge.uz', avatar: 'НР' },
    { name: 'Бобур Юсупов', email: 'b.yusupov@onecharge.uz', avatar: 'БЮ' },
  ],
  'Finance Analyst': [{ name: 'Дилноза Хасанова', email: 'd.khasanova@onecharge.uz', avatar: 'ДХ' }],
  'Support Agent': [
    { name: 'Санжар Умаров', email: 's.umarov@onecharge.uz', avatar: 'СУ' },
    { name: 'Малика Исмоилова', email: 'm.ismoilova@onecharge.uz', avatar: 'МИ' },
    { name: 'Шерзод Тошматов', email: 'sh.toshmatov@onecharge.uz', avatar: 'ШТ' },
  ],
};

function RolesPage() {
  const roleNames = Object.keys(DEFAULT_ROLES);
  const [selectedRole, setSelectedRole] = useState(roleNames[0]);
  const [perms, setPerms] = useState<Record<string, Record<string, string[]>>>(DEFAULT_ROLES);

  const toggle = (group: string, perm: string) => {
    setPerms(prev => {
      const cur = prev[selectedRole][group] || [];
      const next = cur.includes(perm) ? cur.filter(p => p !== perm) : [...cur, perm];
      return { ...prev, [selectedRole]: { ...prev[selectedRole], [group]: next } };
    });
  };

  const roleBadge: Record<string, string> = {
    'Super Admin': 'bg-red-100 text-red-700',
    'Operations Manager': 'bg-sky-100 text-sky-700',
    'Finance Analyst': 'bg-green-100 text-green-700',
    'Support Agent': 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* Role list */}
      <div className="w-56 bg-white border-r border-slate-100 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Роли</h2>
          <button className="text-xs px-2 py-1 bg-sky-500 text-white rounded-lg hover:bg-sky-600">+ Новая</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {roleNames.map(r => (
            <button key={r} onClick={() => setSelectedRole(r)}
              className={`w-full px-4 py-3 text-left transition-colors ${selectedRole === r ? 'bg-sky-50 border-r-2 border-sky-500' : 'hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-800">{r}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${roleBadge[r]}`}>{ROLE_USERS[r]?.length || 0}</span>
              </div>
              <p className="text-xs text-slate-400">{ROLE_USERS[r]?.length || 0} сотрудник(ов)</p>
            </button>
          ))}
        </div>
      </div>

      {/* Permission matrix */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{selectedRole}</h1>
            <p className="text-sm text-slate-500">{ROLE_USERS[selectedRole]?.length || 0} пользователей с этой ролью</p>
          </div>
          <button className="px-4 py-2 bg-sky-500 text-white text-sm rounded-xl hover:bg-sky-600">Сохранить изменения</button>
        </div>

        {/* Users with role */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Пользователи с ролью</p>
          <div className="flex flex-wrap gap-2">
            {(ROLE_USERS[selectedRole] || []).map(u => (
              <div key={u.email} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-6 h-6 bg-gradient-to-br from-sky-400 to-sky-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{u.avatar}</div>
                <div>
                  <p className="text-xs font-medium text-slate-800">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </div>
            ))}
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 hover:bg-slate-50">
              + Добавить
            </button>
          </div>
        </div>

        {/* Permission matrix */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">Матрица доступов</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {PERMISSIONS.map(({ group, perms: ps }) => (
              <div key={group} className="px-5 py-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{group}</p>
                <div className="flex flex-wrap gap-2">
                  {ps.map(perm => {
                    const active = (perms[selectedRole][group] || []).includes(perm);
                    return (
                      <button key={perm} onClick={() => toggle(group, perm)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all ${
                          active
                            ? 'bg-sky-50 border-sky-200 text-sky-700'
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}>
                        {active ? <CheckCircle size={13} className="text-sky-500" /> : <XCircle size={13} className="text-slate-300" />}
                        {perm}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-sky-500' : 'bg-slate-200'}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function AdminSettingsPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('rustam.nazarov@onecharge.uz');
  const [tfa, setTfa] = useState(true);
  const [showChangePw, setShowChangePw] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [lang, setLang] = useState<'ru' | 'uz' | 'en'>('ru');
  const [notifs, setNotifs] = useState({
    fraud: true, operators: true, payments: false,
    cdrErrors: true, system: true, emailDigest: false,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sessions = [
    { device: 'Chrome · Windows 11', location: 'Ташкент, UZ', time: 'Сейчас (текущая)' },
    { device: 'Safari · iPhone 15 Pro', location: 'Ташкент, UZ', time: '2ч назад' },
    { device: 'Firefox · macOS', location: 'Самарканд, UZ', time: '1 день назад' },
  ];

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <TwoFactorPanel portal="admin" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{t('page.settings')}</h1>
        <button onClick={handleSave}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${saved ? 'bg-green-500 text-white' : 'bg-sky-500 text-white hover:bg-sky-600'}`}>
          {saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>

      {/* 1. Профиль */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Профиль</h3>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #4F6BFF, #3B4FE0)' }}>
            RN
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">Rustam Nazarov</p>
            <p className="text-xs text-violet-600 font-medium">Суперадминистратор</p>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-sky-300 max-w-sm" />
        </div>
      </div>

      {/* 2. Безопасность */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Безопасность</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Двухфакторная аутентификация</p>
            <p className="text-xs text-slate-400">SMS на +998 90 *** ** 12</p>
          </div>
          <Toggle value={tfa} onChange={setTfa} />
        </div>

        <div>
          <button onClick={() => setShowChangePw(v => !v)}
            className="text-sm font-medium text-sky-600 hover:text-sky-700 transition-colors">
            {showChangePw ? 'Отмена' : 'Изменить пароль'}
          </button>
          {showChangePw && (
            <div className="mt-3 space-y-2 p-4 bg-slate-50 rounded-xl">
              {['Текущий пароль', 'Новый пароль', 'Повторите новый'].map(l => (
                <div key={l}>
                  <label className="block text-xs text-slate-400 mb-1">{l}</label>
                  <input type="password" className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
              ))}
              <button className="mt-1 px-4 py-2 bg-sky-500 text-white text-xs font-medium rounded-xl hover:bg-sky-600">
                Обновить пароль
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Активные сессии</p>
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div>
                  <p className="text-xs font-medium text-slate-800">{s.device}</p>
                  <p className="text-xs text-slate-400">{s.location} · {s.time}</p>
                </div>
                {i !== 0 && (
                  <button className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                    Завершить
                  </button>
                )}
                {i === 0 && <span className="text-xs text-green-600 font-medium">Текущая</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Уведомления */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Уведомления</h3>
        <div className="space-y-3">
          {([
            { key: 'fraud', label: 'Fraud-оповещения', sub: t('sub.suspiciousOperations') },
            { key: 'operators', label: t('lbl2.newOperators'), sub: t('sub.connectionRequests') },
            { key: 'payments', label: t('lbl2.payments'), sub: t('sub.errorsAndRefunds') },
            { key: 'cdrErrors', label: 'CDR ошибки', sub: t('sub.cdrValidationErrors') },
            { key: 'system', label: t('lbl2.system'), sub: t('sub.platformUpdates') },
            { key: 'emailDigest', label: 'Email дайджест', sub: t('sub.weeklySummary') },
          ] as const).map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-400">{item.sub}</p>
              </div>
              <Toggle value={notifs[item.key]} onChange={v => setNotifs(n => ({ ...n, [item.key]: v }))} />
            </div>
          ))}
        </div>
      </div>

      {/* 4. Система */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Система</h3>

        <div>
          <p className="text-xs text-slate-400 mb-2">Язык интерфейса</p>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {([['ru', 'Русский'], ['uz', "O'zbek"], ['en', 'English']] as const).map(([code, label]) => (
              <button key={code} onClick={() => setLang(code)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${lang === code ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Часовой пояс</p>
            <p className="text-xs text-slate-400">UTC+5 (Ташкент)</p>
          </div>
          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg mono">Asia/Tashkent</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">API Rate Limit</p>
            <p className="text-xs text-slate-400">Текущий лимит запросов</p>
          </div>
          <span className="text-xs bg-sky-50 text-sky-600 border border-sky-100 px-2.5 py-1 rounded-lg mono font-semibold">1000 req/min</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Режим обслуживания</p>
            <p className="text-xs text-slate-400">Отключить доступ пользователей</p>
          </div>
          <Toggle value={maintenanceMode} onChange={setMaintenanceMode} />
        </div>
        {maintenanceMode && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
            <AlertTriangle size={13} />
            Платформа недоступна для пользователей
          </div>
        )}
      </div>
    </div>
  );
}

const ocppConnections = [
  { operator: 'GreenCharge', connected: 41, total: 47, latency: 45, uptime: 99.8 },
  { operator: 'EV Charge UZ', connected: 28, total: 31, latency: 62, uptime: 99.2 },
  { operator: 'Botibot EV', connected: 19, total: 22, latency: 38, uptime: 99.9 },
  { operator: 'GreenGo', connected: 12, total: 14, latency: 110, uptime: 97.4 },
];

const apiMetrics = [
  { time: '00:00', rps: 12, errors: 0, latency: 42 },
  { time: '04:00', rps: 8, errors: 0, latency: 38 },
  { time: '08:00', rps: 45, errors: 1, latency: 55 },
  { time: '10:00', rps: 78, errors: 2, latency: 68 },
  { time: '12:00', rps: 92, errors: 0, latency: 61 },
  { time: '14:00', rps: 110, errors: 3, latency: 74 },
  { time: '16:00', rps: 134, errors: 1, latency: 72 },
  { time: '18:00', rps: 121, errors: 0, latency: 65 },
  { time: '20:00', rps: 89, errors: 2, latency: 58 },
  { time: '22:00', rps: 56, errors: 0, latency: 48 },
  { time: 'Сейчас', rps: 67, errors: 0, latency: 51 },
];

const systemServices = [
  { name: 'OCPP Gateway', status: 'operational', uptime: 99.97, latency: 42, icon: '⚡' },
  { name: 'Payment Service', status: 'operational', uptime: 99.95, latency: 68, icon: '💳' },
  { name: 'OCPI Router', status: 'operational', uptime: 99.91, latency: 38, icon: '🔗' },
  { name: 'CDR Processor', status: 'operational', uptime: 99.88, latency: 120, icon: '📋' },
  { name: 'Auth Service', status: 'operational', uptime: 100.0, latency: 22, icon: '🔐' },
  { name: 'Notification Hub', status: 'degraded', uptime: 98.40, latency: 340, icon: '🔔' },
  { name: 'AI Analytics', status: 'operational', uptime: 99.72, latency: 890, icon: '🤖' },
  { name: 'Webhook Relay', status: 'operational', uptime: 99.83, latency: 55, icon: '📡' },
];

function SystemHealthPage() {
  const { t } = useI18n();
  const totalConnected = ocppConnections.reduce((s, o) => s + o.connected, 0);
  const totalStations = ocppConnections.reduce((s, o) => s + o.total, 0);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">System Health</h1>
          <p className="text-sm text-slate-400">Реальный мониторинг инфраструктуры ONE CHARGE</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm text-green-600 font-medium">Все системы работают</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('lbl2.totalOcpp'), value: `${totalConnected}/${totalStations}`, sub: t('sub.stationsOnline') },
          { label: 'API RPS', value: '67 / сек', sub: t('sub.currentTraffic') },
          { label: 'Avg Latency', value: '51 мс', sub: t('sub.averageLatency') },
          { label: 'Uptime 30д', value: '99.8%', sub: t('sub.availability') },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Service Status grid */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Статус сервисов</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {systemServices.map(service => (
            <div key={service.name} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
              <span className="text-xl">{service.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{service.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${service.status === 'operational' ? 'bg-green-100 text-green-700' : service.status === 'degraded' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {service.status === 'operational' ? 'Работает' : service.status === 'degraded' ? 'Деградация' : 'Ошибка'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                  <span>{service.latency} мс</span>
                  <span>{service.uptime}% uptime</span>
                </div>
              </div>
              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${service.latency < 100 ? 'bg-green-400' : service.latency < 300 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, service.latency / 10)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API Traffic Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">API Traffic (24ч)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={apiMetrics}>
            <defs>
              <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#20D4B6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#20D4B6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip formatter={(v: unknown) => [`${v as number} req/s`, 'RPS']} />
            <Area type="monotone" dataKey="rps" stroke="#20D4B6" strokeWidth={2} fill="url(#rpsGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* OCPP Operators table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">OCPP Соединения по операторам</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {[t('th.operator'), t('th.connected'), 'Latency', t('th.uptime30'), t('th.status')].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ocppConnections.map(op => (
              <tr key={op.operator}>
                <td className="px-5 py-3 text-sm font-medium text-slate-800">{op.operator}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden" style={{ maxWidth: 80 }}>
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(op.connected / op.total) * 100}%` }} />
                    </div>
                    <span className="text-sm font-mono text-slate-700">{op.connected}/{op.total}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-sm font-mono font-medium ${op.latency < 70 ? 'text-green-600' : op.latency < 150 ? 'text-amber-600' : 'text-red-600'}`}>
                    {op.latency} мс
                  </span>
                </td>
                <td className="px-5 py-3 text-sm font-mono text-slate-700">{op.uptime}%</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${op.uptime > 99 ? 'bg-green-400' : op.uptime > 98 ? 'bg-amber-400' : 'bg-red-400'}`} />
                    <span className={`text-xs font-medium ${op.uptime > 99 ? 'text-green-600' : op.uptime > 98 ? 'text-amber-600' : 'text-red-600'}`}>
                      {op.uptime > 99 ? 'Норма' : op.uptime > 98 ? 'Внимание' : 'Проблема'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminApp({ onBack }: { onBack: () => void }) {
  // Authentication is handled by the real per-portal gate in App.tsx.
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const go = (p: string) => setPage(p as Page);
  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      map: <LiveMapPage />, operators: <AdminOperators onNavigate={go} />, leads: <LeadsPage />, users: <AdminUsers />,
      settlement: <AdminSettlement />, commissions: <AdminCommissions />, tariffs_global: <GlobalTariffsPage />,
      sessions: <AdminSessions />, payments: <AdminPayments />,
      analytics: <AdminAnalytics />, ai: <AdminInsights onNavigate={go} />, fraud: <FraudPage />,
      cdr: <CDRValidationPage />, audit: <AdminAudit />, roles: <RolesPage />,
      settings: <AdminSettingsPage />,
      system_health: <SystemHealthPage />,
    };
    return (
      <div key={page} className="animate-fade-in h-full">
        {pages[page] ?? <AdminOverview onNavigate={go} />}
      </div>
    );
  };

  return (
    <div className="h-full flex relative dash-surface">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-20" />}
      <AdminSidebar current={page} onChange={setPage} onBack={onBack} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-hidden relative">
        <button onClick={() => setSidebarOpen(true)} aria-label="Открыть меню" className="md:hidden absolute top-3 left-3 z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600">
          <Menu size={18} />
        </button>
        {renderPage()}
      </div>
      <AIChat portalType="admin" />
    </div>
  );
}

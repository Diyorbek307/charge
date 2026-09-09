import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  LayoutDashboard, MapPin, Users, Activity, DollarSign, BarChart2,
  Settings, LogOut, Zap, ArrowUp, AlertTriangle, Shield,
  CheckCircle, XCircle, Building2, FileText, Download, Bell,
  Brain, AlertCircle, ScrollText, ClipboardCheck, Percent, UserCheck, Banknote, Plus, Send,
  Eye, EyeOff, Tag, Sparkles, ChevronDown, Menu
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { revenueData, hourlyData, connectorDistribution } from '../data/mockData';
import { useSync } from '../lib/sync';
import TwoFactorPanel from './TwoFactorPanel';
import SidebarThemeToggle from './SidebarThemeToggle';
import ExportButton from './ExportButton';
import {
  useLiveOperators,
  useLiveAdminSessions,
  useLivePayments,
  useLiveStats,
  type LegacyAdminSession,
} from '../lib/live';
import AnimatedCounter from './AnimatedCounter';
import AIChat from './AIChat';

type Page = 'dashboard' | 'map' | 'operators' | 'users' | 'sessions' | 'payments' | 'settlement' | 'analytics' | 'ai' | 'fraud' | 'cdr' | 'commissions' | 'tariffs_global' | 'audit' | 'roles' | 'settings' | 'system_health';

const statusBg: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-amber-100 text-amber-700',
  completed: 'bg-slate-100 text-slate-600',
};
const statusLabel: Record<string, string> = {
  active: 'Активен', pending: 'На ревью', suspended: 'Заблокирован',
  success: 'Успешно', failed: 'Ошибка', refunded: 'Возврат', completed: 'Завершена',
};

function AdminSidebar({ current, onChange, onBack, isOpen, onClose }: { current: Page; onChange: (p: Page) => void; onBack: () => void; isOpen?: boolean; onClose?: () => void }) {
  const groups = [
    {
      label: 'Обзор',
      items: [
        { id: 'dashboard' as Page, label: 'Overview', icon: <LayoutDashboard size={14} /> },
        { id: 'map' as Page, label: 'Live Map', icon: <MapPin size={14} />, badge: '●' },
      ],
    },
    {
      label: 'Операции',
      items: [
        { id: 'operators' as Page, label: 'Операторы', icon: <Building2 size={14} /> },
        { id: 'users' as Page, label: 'Пользователи', icon: <Users size={14} /> },
        { id: 'sessions' as Page, label: 'Сессии', icon: <Activity size={14} /> },
      ],
    },
    {
      label: 'Финансы',
      items: [
        { id: 'payments' as Page, label: 'Платежи', icon: <DollarSign size={14} /> },
        { id: 'settlement' as Page, label: 'Settlement', icon: <Banknote size={14} /> },
        { id: 'commissions' as Page, label: 'Комиссии', icon: <Percent size={14} /> },
        { id: 'tariffs_global' as Page, label: 'Тарифы сети', icon: <Tag size={14} /> },
      ],
    },
    {
      label: 'Аналитика & AI',
      items: [
        { id: 'analytics' as Page, label: 'Аналитика', icon: <BarChart2 size={14} /> },
        { id: 'ai' as Page, label: 'AI Insights', icon: <Brain size={14} /> },
        { id: 'fraud' as Page, label: 'Fraud & Risk', icon: <Shield size={14} />, badge: '3' },
        { id: 'cdr' as Page, label: 'CDR Validation', icon: <ClipboardCheck size={14} /> },
      ],
    },
    {
      label: 'Система',
      items: [
        { id: 'audit' as Page, label: 'Audit Log', icon: <ScrollText size={14} /> },
        { id: 'roles' as Page, label: 'Роли & Права', icon: <UserCheck size={14} /> },
        { id: 'settings' as Page, label: 'Настройки', icon: <Settings size={14} /> },
        { id: 'system_health' as Page, label: 'System Health', icon: <Activity size={14} /> },
      ],
    },
  ];

  return (
    <div className={`w-[210px] flex flex-col h-full shrink-0 absolute inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#080C18', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Brand */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}>
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ONE CHARGE</p>
            <p className="text-[11px] leading-none mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>Admin Control Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}>A</div>
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
                      background: 'rgba(139,92,246,0.15)',
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
          <LogOut size={14} />Выйти из портала
        </button>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

function useLiveData() {
  const makePoint = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      sessions: 38 + Math.round((Math.random() - 0.5) * 6),
      revenue: 394100000 + Math.round((Math.random() - 0.5) * 100000),
    };
  };

  const [liveData, setLiveData] = useState(() => Array.from({ length: 20 }, makePoint));
  const [lastUpdated, setLastUpdated] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const pt = makePoint();
      setLastUpdated(pt.time);
      setLiveData(prev => [...prev.slice(-19), pt]);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return { liveData, lastUpdated };
}

function AdminDashboard() {
  const operators = useLiveOperators();
  const adminSessions = useLiveAdminSessions();
  const { liveData, lastUpdated } = useLiveData();

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Национальный обзор</h1>
          <p className="text-sm text-slate-500 inter">ONE CHARGE UZ · Реальное время · 5 сент 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Все системы в норме
          </div>
          <button className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            <Bell size={16} />
          </button>
        </div>
      </div>

      {/* National KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Операторы', num: 4, sub: '3 активных', icon: <Building2 size={14} />, bg: 'bg-sky-50', ic: 'text-sky-500' },
          { label: 'Станции', num: 108, sub: '96 онлайн', icon: <MapPin size={14} />, bg: 'bg-emerald-50', ic: 'text-emerald-600' },
          { label: 'EVSE', num: 276, sub: '38 активны сейчас', icon: <Zap size={14} />, bg: 'bg-amber-50', ic: 'text-amber-500' },
          { label: 'Пользователи', num: 14218, sub: '+420 этой неделе', icon: <Users size={14} />, bg: 'bg-violet-50', ic: 'text-violet-500' },
        ].map((k, i) => (
          <div key={k.label} className="bg-white rounded-2xl p-4 border border-slate-100/80 hover:shadow-md transition-all enter-up"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)', animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide inter">{k.label}</p>
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${k.bg} ${k.ic}`}>{k.icon}</div>
            </div>
            <p className="text-[28px] font-bold text-slate-900 mono leading-none tracking-tight mb-1 num-pop" style={{ animationDelay: `${i * 60 + 100}ms` }}>
              <AnimatedCounter value={k.num} duration={1200} />
            </p>
            <p className="text-xs text-slate-400 inter">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Выручка (сент.)', num: 394.1, suffix: 'M', sub: '+19% vs авг.', positive: true },
          { label: 'Комиссии ONE CHARGE', num: 12.8, suffix: 'M', sub: 'средн. 3.25%', positive: true },
          { label: 'Ошибочных сессий', num: 14, suffix: '', sub: '0.05% от общего', positive: false },
          { label: 'Платёжных ошибок', num: 7, suffix: '', sub: 'требуют проверки', positive: false },
        ].map((k, i) => (
          <div key={k.label} className="bg-white rounded-2xl p-4 border border-slate-100/80 hover:shadow-md transition-all enter-up"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)', animationDelay: `${i * 60 + 240}ms` }}>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide inter mb-3">{k.label}</p>
            <p className="text-[26px] font-bold text-slate-900 mono leading-none tracking-tight mb-1.5 num-pop" style={{ animationDelay: `${i * 60 + 340}ms` }}>
              <AnimatedCounter value={k.num} decimals={k.suffix ? 1 : 0} suffix={k.suffix} duration={1000} />
            </p>
            <p className={`text-xs inter flex items-center gap-0.5 ${k.positive ? 'text-emerald-600' : 'text-amber-500'}`}>
              <ArrowUp size={10} />{k.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Общая выручка по сети</h3>
            <span className="text-xs text-slate-400">млн сум</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
              <Area type="monotone" dataKey="revenue" stroke="#0EA5E9" fill="url(#adminGrad)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Операторы</h3>
          <div className="space-y-2">
            {operators.map(op => (
              <div key={op.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50">
                <span className="text-lg">{op.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{op.name}</p>
                  <p className="text-xs text-slate-400">{op.stations} ст. · {op.sessions.toLocaleString()} сесс.</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${statusBg[op.status]}`}>
                  {statusLabel[op.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Activity Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Live Activity</h3>
            <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-green-500 px-1.5 py-0.5 rounded-full animate-pulse">
              ● LIVE
            </span>
          </div>
          <span className="text-xs text-slate-400">последнее обновление: {lastUpdated}</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={liveData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: 11 }} formatter={(v: unknown) => [(v as number), 'Сессий']} />
            <Line type="monotone" dataKey="sessions" stroke="#22C55E" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Live sessions */}
      <div className="bg-white rounded-2xl border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Активные и последние сессии
          </h3>
          <button className="text-xs text-sky-500 font-medium">Все →</button>
        </div>
        <div className="divide-y divide-slate-50">
          {adminSessions.map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-xs text-sky-600 font-medium mono w-20">{s.id}</span>
              <span className="text-slate-700 w-28">{s.user}</span>
              <span className="text-slate-500 flex-1 min-w-32 truncate">{s.station}</span>
              <span className="text-xs text-slate-400 w-16 hidden sm:inline">{s.operator.split(' ')[0]}</span>
              <span className="text-slate-700 font-medium mono w-28">{s.cost}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[s.status]}`}>{statusLabel[s.status]}</span>
            </div>
          ))}
        </div>
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
            { label: 'Всего станций', v: totals.all, c: 'text-slate-900' },
            { label: 'Свободно', v: totals.available, c: 'text-green-600' },
            { label: 'Занято', v: totals.occupied, c: 'text-red-500' },
            { label: 'Забронировано', v: totals.reserved, c: 'text-amber-500' },
            { label: 'Недоступно', v: totals.unavailable, c: 'text-slate-400' },
            { label: 'Активных EVSE', v: mapStations.reduce((s, st) => s + st.active, 0), c: 'text-sky-600' },
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
                <text x={st.x + 4} y={st.y + 1} fontSize="2" fill="#475569" fontWeight="500" fontFamily="DM Sans, sans-serif">
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
                { label: 'Станций', value: selected.count },
                { label: 'EVSE всего', value: selected.evse },
                { label: 'Активных', value: selected.active },
                { label: 'Макс. мощность', value: `${selected.power} кВт` },
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

function OperatorsPage() {
  const operators = useLiveOperators();
  const { actions, refresh } = useSync();
  const [selected, setSelected] = useState<(typeof operators)[0] | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const ocpiHealth = ['OK', 'OK', 'OK', 'WARN'];
  const monthlyKwh = [
    [62, 74, 81, 88, 98],
    [28, 34, 39, 42, 48],
    [18, 23, 28, 31, 35],
    [4, 6, 7, 8, 9],
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 space-y-5 overflow-y-auto min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Операторы</h1>
            <p className="text-sm text-slate-500">{operators.length} зарегистрированных партнёров</p>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600">
            + Добавить оператора
          </button>
        </div>

        {/* Network summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Всего станций', value: operators.reduce((s, o) => s + o.stations, 0) },
            { label: 'Всего EVSE', value: operators.reduce((s, o) => s + o.evse, 0) },
            { label: 'Сессий (total)', value: operators.reduce((s, o) => s + o.sessions, 0).toLocaleString() },
            { label: 'Выручка (total)', value: `${(operators.reduce((s, o) => s + o.revenue, 0) / 1000000).toFixed(0)}M` },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-4 text-center">
              <p className="text-2xl font-bold mono text-slate-900">{k.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {operators.map((op, idx) => (
            <button key={op.id} onClick={() => setSelected(selected?.id === op.id ? null : op)}
              className={`bg-white rounded-2xl border p-5 text-left transition-all hover:shadow-sm ${selected?.id === op.id ? 'border-sky-300 shadow-sm' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{op.logo}</span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{op.name}</h3>
                    <p className="text-xs text-slate-400">{op.region}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[op.status]}`}>{statusLabel[op.status]}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ocpiHealth[idx] === 'OK' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    OCPI {ocpiHealth[idx]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center mb-3">
                {[
                  { label: 'Станции', value: op.stations },
                  { label: 'EVSE', value: op.evse },
                  { label: 'Сессии', value: op.sessions.toLocaleString() },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-2">
                    <p className="text-base font-bold text-slate-900 mono">{s.value}</p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Mini sparkline */}
              <div className="flex items-end gap-1 h-8 mb-3">
                {monthlyKwh[idx].map((v, i) => (
                  <div key={i} className="flex-1 bg-sky-200 rounded-sm transition-all"
                    style={{ height: `${(v / Math.max(...monthlyKwh[idx])) * 100}%` }} />
                ))}
              </div>

              <div className="flex justify-between text-xs text-slate-500">
                <span>{op.integration}</span>
                <span className="font-semibold text-slate-700 mono">{(op.revenue / 1000000).toFixed(1)}M сум</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 shrink-0 bg-white border-l border-slate-100 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{selected.logo}</span>
              <div>
                <p className="text-sm font-bold text-slate-900">{selected.name}</p>
                <p className="text-xs text-slate-400">{selected.region}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <Plus size={14} className="rotate-45 text-slate-500" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Статус', value: statusLabel[selected.status], accent: true },
                { label: 'С нами с', value: selected.since },
                { label: 'Тип интеграции', value: selected.integration },
                { label: 'Комиссия', value: '3%' },
                { label: 'Станций', value: selected.stations },
                { label: 'EVSE', value: selected.evse },
              ].map(r => (
                <div key={r.label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-0.5">{r.label}</p>
                  <p className="text-sm font-semibold text-slate-800">{r.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">OCPI статус</p>
              <div className="space-y-1.5">
                {[
                  { label: 'Locations sync', ok: true },
                  { label: 'Sessions push', ok: true },
                  { label: 'CDR delivery', ok: true },
                  { label: 'Token auth', ok: selected.name !== 'Nukus Power' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 text-xs">{item.label}</span>
                    <span className={`text-xs font-medium ${item.ok ? 'text-green-600' : 'text-amber-500'}`}>
                      {item.ok ? '✓ OK' : '⚠ WARN'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Финансы</p>
              {[
                { label: 'Общая выручка', value: `${(selected.revenue / 1000000).toFixed(1)}M сум` },
                { label: 'Последняя выплата', value: `${(selected.revenue * 0.97 / 1000000).toFixed(1)}M сум` },
                { label: 'Следующий расчёт', value: 'D+2 · 07.09.2026' },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-400">{r.label}</span>
                  <span className="text-slate-800 font-semibold mono">{r.value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button className="w-full py-2.5 bg-sky-50 text-sky-600 border border-sky-200 rounded-xl text-xs font-medium hover:bg-sky-100">
                Открыть кабинет оператора
              </button>
              {!confirmDisconnect ? (
                <button onClick={() => setConfirmDisconnect(true)}
                  className="w-full py-2.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl text-xs font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                  Отключить оператора
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs text-red-700 font-medium mb-2">Подтвердить отключение?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDisconnect(false)} className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Отмена</button>
                    <button
                      onClick={async () => {
                        setConfirmDisconnect(false);
                        try {
                          await actions.setOperatorStatus('admin', selected.id, selected.status === 'suspended' ? 'active' : 'suspended');
                          await refresh();
                        } catch {
                          /* status stays as the server reports it */
                        }
                      }}
                      className="flex-1 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      {selected.status === 'suspended' ? 'Включить' : 'Отключить'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const methodBreakdown = [
  { method: 'Humo', count: 5842, amount: 421800000, pct: 56, color: '#F97316' },
  { method: 'Uzcard', count: 2941, amount: 212200000, pct: 28, color: '#3B82F6' },
  { method: 'Visa', count: 1041, amount: 75100000, pct: 10, color: '#1A56DB' },
  { method: 'Mastercard', count: 594, amount: 42900000, pct: 6, color: '#EB5757' },
];

function PaymentsPage() {
  const payments = useLivePayments();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [selected, setSelected] = useState<(typeof payments)[0] | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = payments.filter(p => {
    const matchF = filter === 'all' || p.status === filter;
    const matchQ = !query || p.id.toLowerCase().includes(query.toLowerCase()) || p.user.toLowerCase().includes(query.toLowerCase());
    return matchF && matchQ;
  });

  const doRefund = (id: string) => {
    setRefunding(id);
    setTimeout(() => setRefunding(null), 2000);
  };

  const methodColor: Record<string, string> = { Humo: '#F97316', Uzcard: '#3B82F6', Visa: '#1A56DB', Mastercard: '#EB5757' };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Платёжный центр</h1>
            <p className="text-sm text-slate-500">Все транзакции платформы · реальное время</p>
          </div>
          <ExportButton
            name="one-charge-payments"
            title="Payments report"
            headers={['ID', 'Пользователь', 'Сумма', 'Метод', 'Статус', 'Время', 'Сессия']}
            rows={filtered.map(p => [p.id, p.user, p.amount, p.method, p.status, p.time, p.session])}
          />
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Успешных (24ч)', v: '10 418', c: 'text-green-600', bg: 'bg-green-50 border-green-100', f: 'completed' },
            { label: 'Ошибок (24ч)', v: '14', c: 'text-red-500', bg: 'bg-red-50 border-red-100', f: 'failed' },
            { label: 'Сумма (24ч)', v: '752M', c: 'text-slate-900', bg: 'bg-slate-50 border-slate-200', f: 'all' },
            { label: 'Ожидают', v: '3', c: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', f: 'active' },
          ].map(s => (
            <button key={s.label} onClick={() => setFilter(s.f as typeof filter)}
              className={`border rounded-2xl p-4 text-left transition-all hover:shadow-sm ${s.bg} ${filter === s.f ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}>
              <p className={`text-2xl font-bold mono ${s.c}`}>{s.v}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Method breakdown */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Методы оплаты (24ч)</h3>
          <div className="flex items-stretch gap-3 mb-3">
            {methodBreakdown.map(m => (
              <div key={m.method} className="flex-1 rounded-xl p-3 border border-slate-100 text-center" style={{ borderTopColor: m.color, borderTopWidth: 3 }}>
                <p className="text-base font-bold text-slate-800 mono">{m.count.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{m.method}</p>
                <p className="text-[11px] text-slate-400 font-mono">{(m.amount / 1000000).toFixed(0)}M сум</p>
              </div>
            ))}
          </div>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {methodBreakdown.map(m => (
              <div key={m.method} style={{ width: `${m.pct}%`, backgroundColor: m.color }} title={`${m.method}: ${m.pct}%`} />
            ))}
          </div>
          <div className="flex gap-4 mt-2">
            {methodBreakdown.map(m => (
              <div key={m.method} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="text-xs text-slate-500">{m.method} {m.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">Транзакции</span>
            <div className="flex gap-1">
              {(['all', 'completed', 'failed', 'active'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${filter === f ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {f === 'all' ? 'Все' : f === 'completed' ? 'Успешные' : f === 'failed' ? 'Ошибки' : 'Активные'}
                </button>
              ))}
            </div>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="TXN ID или пользователь..." className="ml-auto text-xs border border-slate-200 rounded-xl px-3 py-1.5 outline-none w-48" />
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['TXN ID', 'Пользователь', 'Метод', 'Сумма', 'Сессия', 'Время', 'Статус', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => (
                <tr key={p.id} onClick={() => setSelected(selected?.id === p.id ? null : p)}
                  className={`hover:bg-slate-50 cursor-pointer transition-colors ${selected?.id === p.id ? 'bg-sky-50' : ''}`}>
                  <td className="px-4 py-3 text-xs text-sky-600 font-mono font-semibold">{p.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{p.user}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ color: methodColor[p.method] || '#64748B', backgroundColor: (methodColor[p.method] || '#64748B') + '18' }}>
                      {p.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 mono">{p.amount > 0 ? `${p.amount.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 mono">{p.session || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 mono">{p.time}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[p.status]}`}>{statusLabel[p.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'completed' && (
                      <button onClick={e => { e.stopPropagation(); doRefund(p.id); }}
                        className={`text-xs px-2.5 py-1 rounded-lg transition-all ${refunding === p.id ? 'bg-green-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                        {refunding === p.id ? '✓' : 'Возврат'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail */}
      {selected && (
        <div className="w-64 border-l border-slate-100 bg-white p-5 space-y-4 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Транзакция</p>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className={`rounded-2xl p-4 text-center ${selected.status === 'completed' ? 'bg-green-50 border border-green-100' : selected.status === 'failed' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
            <p className={`text-2xl font-bold mono ${selected.status === 'completed' ? 'text-green-700' : selected.status === 'failed' ? 'text-red-600' : 'text-amber-700'}`}>
              {selected.amount > 0 ? `${selected.amount.toLocaleString()} сум` : '—'}
            </p>
            <p className="text-xs mt-0.5 text-slate-500">{statusLabel[selected.status]}</p>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'TXN ID', value: selected.id, mono: true },
              { label: 'Пользователь', value: selected.user },
              { label: 'Метод', value: selected.method },
              { label: 'Сессия', value: selected.session || '—', mono: true },
              { label: 'Время', value: selected.time, mono: true },
              { label: 'Статус', value: statusLabel[selected.status] },
            ].map(r => (
              <div key={r.label} className="flex items-start justify-between gap-2">
                <span className="text-xs text-slate-400">{r.label}</span>
                <span className={`text-xs font-semibold text-slate-700 text-right ${r.mono ? 'font-mono' : ''}`}>{r.value}</span>
              </div>
            ))}
          </div>
          {selected.status === 'completed' && (
            <button onClick={() => doRefund(selected.id)}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${refunding === selected.id ? 'bg-green-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
              {refunding === selected.id ? '✓ Возврат инициирован' : '↩ Инициировать возврат'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const regionData = [
  { region: 'Toshkent', sessions: 4820, revenue: 194, utilization: 78, kwh: 84200, stations: 47, growth: 22 },
  { region: 'Samarqand', sessions: 2140, revenue: 86, utilization: 62, kwh: 37400, stations: 22, growth: 18 },
  { region: 'Buxoro', sessions: 1480, revenue: 58, utilization: 54, kwh: 25800, stations: 18, growth: 14 },
  { region: 'Andijon', sessions: 1210, revenue: 49, utilization: 48, kwh: 21100, stations: 13, growth: 31 },
  { region: 'Namangan', sessions: 840, revenue: 34, utilization: 41, kwh: 14700, stations: 8, growth: 28 },
  { region: 'Nukus', sessions: 410, revenue: 17, utilization: 29, kwh: 7200, stations: 8, growth: 9 },
];

const connectorPie = [
  { name: 'CCS2', value: 168, color: '#0EA5E9' },
  { name: 'Type 2', value: 76, color: '#22C55E' },
  { name: 'CHAdeMO', value: 24, color: '#F59E0B' },
  { name: 'Type 1', value: 8, color: '#94A3B8' },
];

const growthTrend = [
  { m: 'Янв', users: 4200, sessions: 6800, kwh: 420 },
  { m: 'Фев', users: 5100, sessions: 7900, kwh: 510 },
  { m: 'Мар', users: 6400, sessions: 9200, kwh: 610 },
  { m: 'Апр', users: 7800, sessions: 10800, kwh: 720 },
  { m: 'Май', users: 9200, sessions: 12500, kwh: 840 },
  { m: 'Июн', users: 10800, sessions: 14100, kwh: 960 },
  { m: 'Июл', users: 12400, sessions: 15800, kwh: 1080 },
  { m: 'Авг', users: 13800, sessions: 17200, kwh: 1180 },
  { m: 'Сен', users: 14200, sessions: 18400, kwh: 1250 },
];

function AnalyticsPage() {
  const [tab, setTab] = useState<'overview' | 'regions' | 'connectors' | 'growth'>('overview');

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Аналитика</h1>
        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
          <Download size={14} />Экспорт
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Всего сессий (сент.)', value: '10 900', delta: '+8.4%', pos: true },
          { label: 'кВт·ч отпущено', value: '1 250 MWh', delta: '+13.2%', pos: true },
          { label: 'Ср. сессия', value: '44 мин', delta: '-2 мин', pos: true },
          { label: 'Ср. выручка/EVSE', value: '4.2M сум', delta: '+6.1%', pos: true },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-bold mono text-slate-900">{k.value}</p>
            <p className={`text-xs mt-0.5 ${k.pos ? 'text-green-500' : 'text-red-500'}`}>{k.delta} к авг.</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'overview', label: 'Обзор' },
          { id: 'regions', label: 'Регионы' },
          { id: 'connectors', label: 'Разъёмы' },
          { id: 'growth', label: 'Рост' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${tab === t.id ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Потребление энергии (MWh)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                  <Bar dataKey="energy" fill="#22C55E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Сессии по часам суток</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                  <Line type="monotone" dataKey="sessions" stroke="#0EA5E9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top stations */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Топ станций по выручке</h3>
            <div className="space-y-2">
              {[
                { name: 'Toshkent Siti Hub', op: 'GreenCharge UZ', revenue: 82, sessions: 1240 },
                { name: 'Yunusobod Mall', op: 'GreenCharge UZ', revenue: 61, sessions: 980 },
                { name: 'Samarqand Gateway', op: 'EcoVolt', revenue: 48, sessions: 820 },
                { name: 'Andijon EV Park', op: 'EcoVolt', revenue: 38, sessions: 640 },
              ].map((s, i) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 mono w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-medium text-slate-700 truncate">{s.name}</span>
                      <span className="text-slate-500 mono shrink-0 ml-2">{s.revenue}M · {s.sessions.toLocaleString()} сесс.</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(s.revenue / 82) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'regions' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Регион', 'Сессии', 'Выручка (M)', 'кВт·ч (k)', 'Станций', 'Рост', 'Загрузка'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {regionData.map(r => (
                <tr key={r.region} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-sm font-semibold text-slate-800">{r.region}</td>
                  <td className="px-5 py-3 text-sm text-slate-600 mono">{r.sessions.toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-slate-600 mono">{r.revenue}M</td>
                  <td className="px-5 py-3 text-sm text-slate-600 mono">{(r.kwh / 1000).toFixed(1)}k</td>
                  <td className="px-5 py-3 text-sm text-slate-600 mono">{r.stations}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold ${r.growth >= 25 ? 'text-green-600' : r.growth >= 15 ? 'text-sky-600' : 'text-slate-500'}`}>+{r.growth}%</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.utilization}%`, backgroundColor: r.utilization > 70 ? '#EF4444' : r.utilization > 50 ? '#F59E0B' : '#22C55E' }} />
                      </div>
                      <span className="text-xs text-slate-500 mono">{r.utilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'connectors' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Распределение по типам разъёмов</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={connectorPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {connectorPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => [`${(v as number)} EVSE`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {connectorPie.map(c => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-slate-600">{c.name}</span>
                  <span className="text-slate-400 mono ml-auto">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Статистика по типам</h3>
            <div className="space-y-3">
              {connectorPie.map(c => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{c.name}</span>
                    <span className="text-slate-400">{c.value} EVSE · {Math.round(c.value / 276 * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.value / 276 * 100}%`, backgroundColor: c.color }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {c.name === 'CCS2' ? 'DC · 50–350 кВт · основной стандарт' : c.name === 'Type 2' ? 'AC · 7–22 кВт · медленная зарядка' : c.name === 'CHAdeMO' ? 'DC · legacy · Nissan/Mitsubishi' : 'AC · устаревший стандарт'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'growth' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Рост пользователей и сессий</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={growthTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="u" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                <Line yAxisId="u" type="monotone" dataKey="users" stroke="#0EA5E9" strokeWidth={2} dot={{ r: 3 }} name="Пользователи" />
                <Line yAxisId="s" type="monotone" dataKey="sessions" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name="Сессии" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center">
              {[{ color: '#0EA5E9', label: 'Пользователи' }, { color: '#22C55E', label: 'Сессии в месяц' }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div className="w-3 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'CAGR пользователей', value: '+187%', sub: 'янв → сен 2026', color: 'text-sky-600' },
              { label: 'CAGR сессий', value: '+171%', sub: 'янв → сен 2026', color: 'text-green-600' },
              { label: 'Прогноз к Dec 2026', value: '22k+ users', sub: 'при текущей динамике', color: 'text-violet-600' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-4 text-center">
                <p className={`text-xl font-bold mono ${k.color}`}>{k.value}</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">{k.label}</p>
                <p className="text-xs text-slate-400">{k.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const AI_ANALYST_QA: Record<string, string> = {
  'Ферганская долина': 'Ферганская долина: рост EV-регистраций +34% при **нулевом покрытии**. Рекомендую 12 DC-станций в Фергане и Намангане к Q1 2027. Приоритет: трасса М-100.',
  'Ночной тариф': 'Снижение ночного тарифа с 2000 до **1400 сум (23–06ч)** увеличит загрузку на ~38%. ROI за 6 месяцев: +12M сум дополнительной выручки.',
  'Прогноз октябрь': 'Прогноз октября: **467M сум** (+18.5% к сентябрю). Ключевые драйверы: рост числа EV (+340), ввод 3 новых станций, улучшение загрузки ночью.',
  'Fraud риски': 'Текущие риски: **2 открытых кейса** — аномальное потребление ×2.7 и платёж ×21 медианы. Рекомендую усилить ML-порог для новых аккаунтов (<7 дней).',
  'Топ станция': '**Toshkent Siti Hub**: выручка 4.2M сум/мес, загрузка 94% в пик. Рекомендую +2 CCS2 150кВт. Окупаемость оборудования: 8 месяцев при текущем трафике.',
  'Buxoro South': '**Buxoro Silk Hub** работает на 18%. Причина: низкий трафик туристов. Рекомендую партнёрство с отелями Бухары + промо для туристических маршрутов.',
  'default': 'Анализирую данные 108 станций, 276 EVSE, 14 218 пользователей. Уточните запрос или выберите подсказку выше.',
};

function AIInsightsPage() {
  type AiMsg = { role: 'user' | 'ai'; text: string; ts: string };
  const [msgs, setMsgs] = useState<AiMsg[]>([{
    role: 'ai',
    text: 'Привет! Я AI-аналитик ONE CHARGE. Задайте вопрос по инфраструктуре, выручке, прогнозам или безопасности — отвечу с данными.',
    ts: '—',
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ts = () => new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, typing]);

  const send = (text: string) => {
    if (!text.trim()) return;
    setMsgs(p => [...p, { role: 'user', text, ts: ts() }]);
    setInput('');
    setTyping(true);
    const delay = 800 + Math.random() * 600;
    setTimeout(() => {
      const key = Object.keys(AI_ANALYST_QA).find(k => text.toLowerCase().includes(k.toLowerCase()));
      const answer = key ? AI_ANALYST_QA[key] : AI_ANALYST_QA['default'];
      setTyping(false);
      setMsgs(p => [...p, { role: 'ai', text: answer, ts: ts() }]);
    }, delay);
  };

  const renderBold = (t: string) => t.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith('**') ? <strong key={i} className="font-semibold text-violet-900">{p.slice(2, -2)}</strong> : p
  );

  const insights = [
    { type: 'critical', icon: '🔴', title: 'Критическая нехватка: Фергана', body: 'Рост EV +34% при нулевом покрытии. Нужно 12 DC-станций к Q1 2027.', confidence: 94 },
    { type: 'warning', icon: '🟡', title: 'Перегрузка Toshkent Siti Hub', body: 'Загрузка 94% в пик. Очередь 18–22 мин. Нужно +2 CCS2 150кВт.', confidence: 89 },
    { type: 'info', icon: '💡', title: 'Оптимизация ночного тарифа', body: 'Тариф -30% в 23–06ч увеличит загрузку ночью на ~38%.', confidence: 81 },
    { type: 'info', icon: '📈', title: 'Прогноз 50K пользователей', body: 'Достигнем к Q2 2027. Нужно масштабирование до 300+ EVSE.', confidence: 76 },
    { type: 'warning', icon: '🟡', title: 'Низкая загрузка: Buxoro South', body: 'Загрузка 18%. Нужно партнёрство с туристической отраслью.', confidence: 72 },
  ];

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: insights */}
      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Insights</h1>
            <p className="text-sm text-slate-500 inter">Рекомендации модели v2.4 · 108 станций · обновлено 2ч назад</p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-violet-50 text-violet-700 px-3 py-2 rounded-xl border border-violet-100">
            <Brain size={13} />Model v2.4
          </div>
        </div>

        <div className="space-y-3">
          {insights.map((ins, i) => (
            <div key={i} className={`bg-white rounded-2xl border p-5 enter-up hover:shadow-md transition-all`}
              style={{ borderColor: ins.type === 'critical' ? '#FECACA' : ins.type === 'warning' ? '#FDE68A' : '#E2E8F0', animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{ins.icon}</span>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-900">{ins.title}</h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${ins.confidence}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 mono">{ins.confidence}%</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{ins.body}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1.5 text-xs font-medium bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors">
                  Применить
                </button>
                <button className="px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                  Подробнее
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: AI chat */}
      <div className="w-80 shrink-0 flex flex-col" style={{ background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Chat header */}
        <div className="px-4 py-4 flex items-center gap-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)', boxShadow: '0 4px 12px rgba(139,92,246,0.4)' }}>
            <Brain size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">AI Analyst</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" style={{ animation: 'pulse 2s infinite' }} />
              <p className="text-[10px] text-slate-500">Онлайн · GPT-4 based</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {m.role === 'ai' && (
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)' }}>
                  <Brain size={10} className="text-white" />
                </div>
              )}
              <div className="max-w-[80%] rounded-2xl px-3 py-2"
                style={m.role === 'user'
                  ? { background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)', borderRadius: '14px 14px 4px 14px' }
                  : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px 14px 14px 14px' }}>
                <p className="text-[12px] leading-relaxed text-slate-200">{m.role === 'ai' ? renderBold(m.text) : m.text}</p>
                {m.ts !== '—' && <p className="text-[9px] text-slate-600 mt-1">{m.ts}</p>}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-end gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)' }}>
                <Brain size={10} className="text-white" />
              </div>
              <div className="flex items-center gap-1 px-3 py-2.5 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-1.5 h-1.5 rounded-full bg-slate-500"
                    style={{ animation: `bounce 1s ease-in-out ${d}ms infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick chips */}
        {msgs.length <= 2 && !typing && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {['Ферганская долина', 'Ночной тариф', 'Fraud риски', 'Топ станция'].map(c => (
              <button key={c} onClick={() => send(c)}
                className="text-[10px] px-2 py-1 rounded-lg border transition-all hover:opacity-80"
                style={{ background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.28)', color: '#A78BFA' }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 shrink-0">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Спросите AI аналитика..."
              className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 outline-none" />
            <button onClick={() => send(input)} disabled={!input.trim()}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: input.trim() ? 'linear-gradient(135deg, #7C3AED, #8B5CF6)' : 'rgba(255,255,255,0.06)' }}>
              <Send size={11} className="text-white" />
            </button>
          </div>
        </div>
      </div>
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
            { label: 'Критических', v: alerts.filter(a => a.risk === 'critical' && a.status === 'open').length, c: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Высокий риск', v: alerts.filter(a => a.risk === 'high' && a.status === 'open').length, c: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Средний риск', v: alerts.filter(a => a.risk === 'medium' && a.status === 'open').length, c: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Решено сегодня', v: alerts.filter(a => a.status === 'resolved').length, c: 'text-green-600', bg: 'bg-green-50' },
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
                { label: 'Пользователь', value: selected.user },
                { label: 'User ID', value: selected.userId },
                { label: 'Станция', value: selected.station },
                { label: 'Время', value: selected.time },
                { label: 'Сумма', value: selected.amount },
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

const allUsers = [
  { id: 'U-8831', name: 'Alisher Toshmatov', phone: '+998 90 123 45 67', sessions: 47, spent: 3780000, registered: '12 янв 2025', status: 'active', car: 'BYD Han EV' },
  { id: 'U-4422', name: 'Nilufar Karimova', phone: '+998 91 234 56 78', sessions: 32, spent: 2410000, registered: '3 фев 2025', status: 'active', car: 'Hyundai Ioniq 6' },
  { id: 'U-7721', name: 'Bobur Mirzayev', phone: '+998 93 345 67 89', sessions: 18, spent: 1240000, registered: '18 мар 2025', status: 'active', car: 'Tesla Model 3' },
  { id: 'U-3301', name: 'Dilshod Raximov', phone: '+998 97 456 78 90', sessions: 62, spent: 5120000, registered: '5 дек 2024', status: 'active', car: 'Kia EV6' },
  { id: 'U-9910', name: 'Kamola Abdullayeva', phone: '+998 90 567 89 01', sessions: 9, spent: 680000, registered: '22 апр 2025', status: 'active', car: 'BYD Atto 3' },
  { id: 'U-8841', name: 'Anon-7821', phone: '+998 99 *** ** **', sessions: 2, spent: 0, registered: '1 сент 2026', status: 'suspended', car: '—' },
  { id: 'U-3344', name: 'Anon-3344', phone: '+998 94 *** ** **', sessions: 1, spent: 0, registered: '3 сент 2026', status: 'suspended', car: '—' },
];

const userSessions: Record<string, { date: string; station: string; kWh: number; cost: number; duration: string }[]> = {
  'U-8831': [
    { date: '4 сент 2026', station: 'Toshkent Siti Hub', kWh: 42.1, cost: 84200, duration: '48 мин' },
    { date: '1 сент 2026', station: 'Yunusobod Mall', kWh: 38.8, cost: 77600, duration: '44 мин' },
    { date: '28 авг 2026', station: 'Toshkent Siti Hub', kWh: 45.2, cost: 90400, duration: '51 мин' },
  ],
  'U-4422': [
    { date: '3 сент 2026', station: 'Yunusobod Mall', kWh: 44.0, cost: 88000, duration: '50 мин' },
    { date: '29 авг 2026', station: 'Toshkent Siti Hub', kWh: 39.5, cost: 79000, duration: '45 мин' },
  ],
  'U-7721': [
    { date: '2 сент 2026', station: 'Toshkent Siti Hub', kWh: 48.0, cost: 96000, duration: '54 мин' },
  ],
  'U-3301': [
    { date: '4 сент 2026', station: 'Toshkent Siti Hub', kWh: 55.1, cost: 110200, duration: '62 мин' },
    { date: '2 сент 2026', station: 'Namangan Station', kWh: 51.8, cost: 103600, duration: '58 мин' },
    { date: '31 авг 2026', station: 'Toshkent Siti Hub', kWh: 49.2, cost: 98400, duration: '56 мин' },
  ],
  'U-9910': [{ date: '28 авг 2026', station: 'Yunusobod Mall', kWh: 29.0, cost: 58000, duration: '33 мин' }],
  'U-8841': [],
  'U-3344': [],
};

const paymentMethods: Record<string, { type: string; last4: string; default: boolean }[]> = {
  'U-8831': [{ type: 'Uzcard', last4: '4412', default: true }, { type: 'Humo', last4: '8821', default: false }],
  'U-4422': [{ type: 'Visa', last4: '2233', default: true }],
  'U-7721': [{ type: 'Uzcard', last4: '9901', default: true }],
  'U-3301': [{ type: 'Humo', last4: '6678', default: true }, { type: 'Uzcard', last4: '3390', default: false }],
  'U-9910': [{ type: 'Uzcard', last4: '1127', default: true }],
  'U-8841': [],
  'U-3344': [],
};

function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState(allUsers);
  const [selected, setSelected] = useState<typeof allUsers[0] | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<string | null>(null);

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search)
  );

  const toggleBlock = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'suspended' : 'active' } : u));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: prev.status === 'active' ? 'suspended' : 'active' } : null);
    setConfirmBlock(null);
  };

  const active = users.filter(u => u.status === 'active').length;
  const suspended = users.filter(u => u.status === 'suspended').length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Пользователи</h1>
            <p className="text-sm text-slate-500 inter">14 218 зарегистрированных аккаунтов · платформа ONE CHARGE</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />Экспорт
          </button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Всего аккаунтов', value: '14 218', sub: 'все платформы', bg: 'bg-slate-50', ic: 'text-slate-500', icon: <Users size={14} /> },
            { label: 'Активных', value: String(active + 12840), sub: 'подтверждённые телефоны', bg: 'bg-emerald-50', ic: 'text-emerald-600', icon: <UserCheck size={14} /> },
            { label: 'Новых за 7 дней', value: '284', sub: '+18% к прошлой неделе', bg: 'bg-violet-50', ic: 'text-violet-500', icon: <ArrowUp size={14} /> },
            { label: 'Заблокированных', value: String(suspended + 10), sub: 'превышение лимитов', bg: 'bg-red-50', ic: 'text-red-500', icon: <AlertTriangle size={14} /> },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl p-4 border border-slate-100/80 hover:shadow-md transition-all" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div className="flex items-start justify-between mb-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide inter">{k.label}</p>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${k.bg} ${k.ic}`}>{k.icon}</div>
              </div>
              <p className="text-[28px] font-bold text-slate-900 mono leading-none tracking-tight mb-1">{k.value}</p>
              <p className="text-xs text-slate-400 inter">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по имени или телефону..."
              className="flex-1 text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            <span className="text-xs text-slate-400 inter">{filtered.length} из {users.length}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Пользователь', 'Телефон', 'Автомобиль', 'Сессии', 'Расходы', 'Регистрация', 'Статус'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide inter whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(u => (
                <tr key={u.id}
                  onClick={() => setSelected(selected?.id === u.id ? null : u)}
                  className={`cursor-pointer transition-colors ${selected?.id === u.id ? 'bg-violet-50/40' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${u.status === 'active' ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'}`}>
                        {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{u.name}</p>
                        <p className="text-[10px] text-slate-400 mono">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-500 mono">{u.phone}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">{u.car}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-800 mono">{u.sessions}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 mono">{u.spent > 0 ? `${(u.spent / 1000000).toFixed(2)}M` : '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">{u.registered}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {u.status === 'active' ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 border-l border-slate-200 bg-white flex flex-col overflow-y-auto shrink-0" style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${selected.status === 'active' ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'}`}>
                {selected.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{selected.name}</p>
                <p className="text-[10px] text-slate-400 mono">{selected.id}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div className="p-5 space-y-5">
            {/* Status badge */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${selected.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              <div className={`w-2 h-2 rounded-full ${selected.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {selected.status === 'active' ? 'Аккаунт активен' : 'Аккаунт заблокирован'}
            </div>

            {/* Details */}
            <div className="space-y-2.5">
              {[
                { label: 'Телефон', value: selected.phone },
                { label: 'Автомобиль', value: selected.car },
                { label: 'Регистрация', value: selected.registered },
                { label: 'Всего сессий', value: String(selected.sessions) },
                { label: 'Всего расходов', value: selected.spent > 0 ? `${selected.spent.toLocaleString()} сум` : '—' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{r.label}</p>
                  <p className="text-sm font-semibold text-slate-800 mono">{r.value}</p>
                </div>
              ))}
            </div>

            {/* Payment methods */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter mb-2">Способы оплаты</p>
              {(paymentMethods[selected.id] || []).length === 0 ? (
                <p className="text-xs text-slate-400">Нет привязанных карт</p>
              ) : (
                <div className="space-y-1.5">
                  {(paymentMethods[selected.id] || []).map((pm, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">{pm.type}</span>
                        <span className="text-xs text-slate-400 mono">·· {pm.last4}</span>
                      </div>
                      {pm.default && <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">Основная</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sessions */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter mb-2">Последние сессии</p>
              <div className="space-y-2">
                {(userSessions[selected.id] || []).length === 0 ? (
                  <p className="text-xs text-slate-400">Нет сессий</p>
                ) : (userSessions[selected.id] || []).map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-xs font-medium text-slate-700 truncate max-w-[130px]">{s.station}</p>
                      <p className="text-[10px] text-slate-400">{s.date} · {s.kWh} кВт·ч · {s.duration}</p>
                    </div>
                    <p className="text-sm font-bold mono text-slate-900">{(s.cost / 1000).toFixed(0)}K</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Block/unblock action */}
            {confirmBlock === selected.id ? (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-red-700">
                  {selected.status === 'active' ? 'Заблокировать аккаунт?' : 'Разблокировать аккаунт?'}
                </p>
                <p className="text-xs text-red-500">
                  {selected.status === 'active' ? 'Пользователь не сможет совершать зарядки' : 'Пользователь сможет снова пользоваться платформой'}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => toggleBlock(selected.id)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all ${selected.status === 'active' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                    Подтвердить
                  </button>
                  <button onClick={() => setConfirmBlock(null)} className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-500 text-white rounded-xl text-sm font-semibold hover:bg-violet-600 active:scale-95 transition-all">
                  <Activity size={14} />Все сессии пользователя
                </button>
                <button onClick={() => setConfirmBlock(selected.id)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${selected.status === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                  {selected.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const settlementInvoices = [
  { inv: 'INV-GC-0824', op: 'GreenCharge UZ', logo: '🟢', opId: 'op-001', period: 'Авг 2026', revenueRaw: 176200000, commissionRate: 0.03, payoutRaw: 170914000, date: '2 сент 2026', iban: 'UZ12 0145 2000 0001 4421', bank: 'Uzpromstroybank', sessions: 8821, kwh: 88420, status: 'paid' },
  { inv: 'INV-EV-0824', op: 'EcoVolt', logo: '⚡', opId: 'op-002', period: 'Авг 2026', revenueRaw: 98400000, commissionRate: 0.028, payoutRaw: 95644800, date: '2 сент 2026', iban: 'UZ34 0872 1100 0002 8812', bank: 'Hamkorbank', sessions: 4920, kwh: 49200, status: 'paid' },
  { inv: 'INV-SR-0824', op: 'SilkRoad EV', logo: '🔵', opId: 'op-003', period: 'Авг 2026', revenueRaw: 64100000, commissionRate: 0.032, payoutRaw: 62148800, date: '2 сент 2026', iban: 'UZ56 0581 4300 0003 1105', bank: 'AsiaAllianceBank', sessions: 3205, kwh: 32050, status: 'paid' },
  { inv: 'INV-WB-0824', op: 'WattBox', logo: '🟡', opId: 'op-004', period: 'Авг 2026', revenueRaw: 18400000, commissionRate: 0.04, payoutRaw: 17664000, date: '2 сент 2026', iban: 'UZ78 0124 8800 0004 7720', bank: 'Kapitalbank', sessions: 920, kwh: 9200, status: 'paid' },
  { inv: 'INV-GC-0924', op: 'GreenCharge UZ', logo: '🟢', opId: 'op-001', period: 'Сент 2026', revenueRaw: 18450000, commissionRate: 0.03, payoutRaw: 17896500, date: '9 сент 2026', iban: 'UZ12 0145 2000 0001 4421', bank: 'Uzpromstroybank', sessions: 922, kwh: 9220, status: 'pending' },
  { inv: 'INV-EV-0924', op: 'EcoVolt', logo: '⚡', opId: 'op-002', period: 'Сент 2026', revenueRaw: 11200000, commissionRate: 0.028, payoutRaw: 10886400, date: '9 сент 2026', iban: 'UZ34 0872 1100 0002 8812', bank: 'Hamkorbank', sessions: 560, kwh: 5600, status: 'pending' },
  { inv: 'INV-SR-0924', op: 'SilkRoad EV', logo: '🔵', opId: 'op-003', period: 'Сент 2026', revenueRaw: 7300000, commissionRate: 0.032, payoutRaw: 7066400, date: '9 сент 2026', iban: 'UZ56 0581 4300 0003 1105', bank: 'AsiaAllianceBank', sessions: 365, kwh: 3650, status: 'processing' },
];

const settlementMonthly = [
  { month: 'Фев', total: 182 }, { month: 'Мар', total: 241 }, { month: 'Апр', total: 228 },
  { month: 'Май', total: 287 }, { month: 'Июн', total: 312 }, { month: 'Июл', total: 298 },
  { month: 'Авг', total: 357 },
];

function SettlementPage() {
  const [selected, setSelected] = useState<typeof settlementInvoices[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'processing'>('all');
  const [executing, setExecuting] = useState<string | null>(null);

  const filtered = statusFilter === 'all' ? settlementInvoices : settlementInvoices.filter(i => i.status === statusFilter);

  const totalPending = settlementInvoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.payoutRaw, 0);
  const totalPaidMonth = settlementInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.payoutRaw, 0);

  const executePayment = (inv: string) => {
    setExecuting(inv);
    setTimeout(() => setExecuting(null), 2000);
  };

  const statusCfg: Record<string, { bg: string; label: string; dot: string }> = {
    paid: { bg: 'bg-green-100 text-green-700', label: 'Выплачено', dot: 'bg-green-500' },
    pending: { bg: 'bg-amber-100 text-amber-700', label: 'Ожидает', dot: 'bg-amber-400' },
    processing: { bg: 'bg-sky-100 text-sky-700', label: 'Обработка', dot: 'bg-sky-400' },
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settlement</h1>
            <p className="text-sm text-slate-500">Расчёты ONE CHARGE с операторами · модель D+2 · банковский перевод</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />Все инвойсы
          </button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Выплачено (авг)', value: `${(totalPaidMonth / 1000000).toFixed(1)}M`, sub: '4 оператора', color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
            { label: 'Ожидает выплаты', value: `${(totalPending / 1000000).toFixed(1)}M`, sub: 'дата: 9 сент 2026', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
            { label: 'Комиссия (авг)', value: `${((totalPaidMonth * 0.031) / 1000000).toFixed(1)}M`, sub: '~3.1% средняя', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
            { label: 'Следующий D+2', value: '9 сент', sub: '3 инвойса', color: 'text-slate-800', bg: 'bg-slate-50 border-slate-200' },
          ].map(k => (
            <div key={k.label} className={`border rounded-2xl p-4 ${k.bg}`}>
              <p className="text-xs text-slate-500 mb-0.5">{k.label}</p>
              <p className={`text-xl font-bold mono ${k.color}`}>{k.value}</p>
              <p className="text-xs text-slate-400">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* D+2 Flow */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 mb-4 tracking-wider">ЦИКЛ ВЫПЛАТЫ</p>
          <div className="flex items-stretch gap-0">
            {[
              { step: 'T', label: 'Транзакция', sub: 'Оплата пользователя', color: 'bg-sky-500' },
              { step: 'T+1', label: 'Верификация', sub: 'CDR валидация, fraud check', color: 'bg-violet-500' },
              { step: 'T+2', label: 'Расчёт', sub: 'Формирование инвойса', color: 'bg-amber-500' },
              { step: 'D+2', label: 'Банковский перевод', sub: 'IBAN оператора', color: 'bg-green-500' },
            ].map((s, i, arr) => (
              <div key={s.step} className="flex items-center flex-1">
                <div className="flex-1">
                  <div className={`${s.color} text-white rounded-xl p-3`}>
                    <p className="text-xs font-bold opacity-70">{s.step}</p>
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{s.sub}</p>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div className="w-6 flex items-center justify-center shrink-0">
                    <div className="w-4 h-0.5 bg-slate-300" />
                    <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-slate-300 ml-0.5" style={{ borderLeftWidth: 6, borderLeftColor: '#CBD5E1' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Monthly chart */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Объём выплат по месяцам</h3>
            <span className="text-xs text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-lg font-semibold">▲ +19.8% м/м</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={settlementMonthly} barSize={28}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${v}M`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => [`${(v as number)}M сум`, 'Выплачено']} />
              <Bar dataKey="total" fill="#22C55E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Invoice table */}
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">Инвойсы</span>
            <div className="flex gap-1 ml-auto">
              {(['all', 'paid', 'pending', 'processing'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${statusFilter === f ? 'bg-sky-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {f === 'all' ? 'Все' : f === 'paid' ? 'Выплачено' : f === 'pending' ? 'Ожидает' : 'Обработка'}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Инвойс', 'Оператор', 'Период', 'Выручка', 'Комиссия %', 'К выплате', 'Дата', 'Статус', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(row => {
                const cfg = statusCfg[row.status];
                const commission = row.revenueRaw - row.payoutRaw;
                return (
                  <tr key={row.inv} onClick={() => setSelected(selected?.inv === row.inv ? null : row)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${selected?.inv === row.inv ? 'bg-sky-50' : ''}`}>
                    <td className="px-4 py-3 text-xs text-sky-600 font-mono font-semibold">{row.inv}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span>{row.logo}</span>
                        <span className="text-sm text-slate-700 font-medium">{row.op}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{row.period}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{(row.revenueRaw / 1000000).toFixed(1)}M</td>
                    <td className="px-4 py-3 text-sm font-mono text-red-500">
                      -{(commission / 1000000).toFixed(1)}M <span className="text-slate-400 text-xs">({(row.commissionRate * 100).toFixed(1)}%)</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold font-mono text-green-700">{(row.payoutRaw / 1000000).toFixed(1)}M</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{row.date}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-semibold w-fit ${cfg.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'pending' && (
                        <button onClick={e => { e.stopPropagation(); executePayment(row.inv); }}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${executing === row.inv ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                          {executing === row.inv ? '✓ Отправлено' : 'Выплатить'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 border-l border-slate-100 bg-white overflow-y-auto shrink-0 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Детали инвойса</p>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
            <p className="text-xs text-green-600 font-semibold mb-1">{selected.inv}</p>
            <p className="text-2xl font-bold text-green-700 font-mono">{(selected.payoutRaw / 1000000).toFixed(2)}M сум</p>
            <p className="text-xs text-green-500 mt-0.5">К выплате · {selected.period}</p>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Оператор', value: `${selected.logo} ${selected.op}` },
              { label: 'Банк', value: selected.bank },
              { label: 'IBAN', value: selected.iban, mono: true },
              { label: 'Сессий', value: selected.sessions.toLocaleString() },
              { label: 'Энергия', value: `${selected.kwh.toLocaleString()} кВт·ч` },
              { label: 'Выручка брутто', value: `${(selected.revenueRaw / 1000000).toFixed(2)}M сум` },
              { label: `Комиссия (${(selected.commissionRate * 100).toFixed(1)}%)`, value: `-${((selected.revenueRaw - selected.payoutRaw) / 1000000).toFixed(2)}M сум`, red: true },
              { label: 'Нетто к выплате', value: `${(selected.payoutRaw / 1000000).toFixed(2)}M сум`, green: true },
              { label: 'Дата выплаты', value: selected.date },
            ].map(r => (
              <div key={r.label} className="flex items-start justify-between gap-2">
                <span className="text-xs text-slate-400 shrink-0">{r.label}</span>
                <span className={`text-xs font-semibold text-right ${r.red ? 'text-red-600' : r.green ? 'text-green-600' : 'text-slate-700'} ${r.mono ? 'font-mono text-[10px]' : ''}`}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-400 transition-colors">
              <Download size={14} />Скачать PDF
            </button>
            {selected.status === 'pending' && (
              <button onClick={() => executePayment(selected.inv)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${executing === selected.inv ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                {executing === selected.inv ? '✓ Перевод отправлен' : '💸 Выплатить сейчас'}
              </button>
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
          <h1 className="text-xl font-bold text-slate-900">Тарифы сети</h1>
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
          { label: 'Средний DC Fast', value: `${Math.round(regionData.reduce((s, r) => s + r.dcFast, 0) / regionData.length).toLocaleString()} сум`, sub: 'по сети' },
          { label: 'Средний AC', value: `${Math.round(regionData.reduce((s, r) => s + r.acStd, 0) / regionData.length).toLocaleString()} сум`, sub: 'по сети' },
          { label: 'Активных правил', value: String(rules.filter(r => r.active).length), sub: `из ${rules.length}` },
          { label: 'Регионов', value: String(regionData.length), sub: 'охвачено' },
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
              {['Регион', 'DC Fast (CCS2)', 'AC Standard', 'DC Ночной', 'Сессий / мес', 'Тренд', ''].map(h => (
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
                <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(20, pct * 80)}px`, background: `linear-gradient(180deg, #38BDF8, #0284C7)` }} />
                <span className="text-[10px] text-slate-400 text-center leading-tight">{r.region}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommissionsPage() {
  const operators = useLiveOperators();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Управление комиссиями</h1>
        <p className="text-sm text-slate-500">Индивидуальные ставки ONE CHARGE per оператор</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <p className="text-sm font-medium text-slate-600 mb-1">Базовая ставка (по умолчанию)</p>
        <div className="flex items-center gap-4">
          <span className="text-3xl font-bold text-slate-900 mono">3.00%</span>
          <span className="text-sm text-slate-400">от суммы каждой зарядки · устанавливается при onboarding</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Индивидуальные ставки</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Оператор', 'Интеграция', 'Ставка', 'Ежемес. комиссия', 'Изменено', 'Действие'].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {[
              { ...operators[0], rate: 3.0, monthly: 5535000, changed: '15 мар 2024' },
              { ...operators[1], rate: 2.8, monthly: 3144400, changed: '14 авг 2026' },
              { ...operators[2], rate: 3.2, monthly: 2524800, changed: '1 сент 2024' },
              { ...operators[3], rate: 4.0, monthly: 736000, changed: '10 янв 2025' },
            ].map(op => (
              <tr key={op.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{op.logo}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{op.name}</p>
                      <p className="text-xs text-slate-400">{op.region.split(',')[0]}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4"><span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-700 rounded-lg">{op.integration}</span></td>
                <td className="px-5 py-4">
                  {editing === op.id ? (
                    <div className="flex items-center gap-2">
                      <input type="number" defaultValue={op.rate} step="0.1" min="1" max="10"
                        className="w-16 text-sm border border-sky-300 rounded-lg px-2 py-1 outline-none mono" />
                      <span className="text-sm text-slate-500">%</span>
                      <button onClick={() => setEditing(null)} className="text-xs text-green-500 font-medium">Сохранить</button>
                    </div>
                  ) : (
                    <span className="text-base font-bold text-slate-900 mono">{op.rate.toFixed(1)}%</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-slate-700 mono">{op.monthly.toLocaleString()} сум</td>
                <td className="px-5 py-4 text-xs text-slate-400">{op.changed}</td>
                <td className="px-5 py-4">
                  <button onClick={() => setEditing(editing === op.id ? null : op.id)}
                    className="text-xs text-sky-500 font-medium hover:underline">
                    {editing === op.id ? 'Отмена' : 'Изменить'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <p className="text-sm font-medium text-slate-700 mb-2">Условия начисления</p>
        <div className="space-y-1.5 text-sm text-slate-500">
          <p>• Комиссия начисляется с каждой <strong className="text-slate-700">успешной зарядной сессии</strong> в момент оплаты</p>
          <p>• Расчёт с оператором производится <strong className="text-slate-700">D+2</strong> по рабочим дням</p>
          <p>• Минимальная ставка: <strong className="text-slate-700">1%</strong>. Максимальная: <strong className="text-slate-700">10%</strong></p>
          <p>• Изменение ставки вступает в силу с <strong className="text-slate-700">начала следующего расчётного периода</strong></p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">История изменений ставок</h3>
        {(() => {
          const commissionHistory = [
            { month: 'Мар', revenue: 8200000, sessions: 1820 },
            { month: 'Апр', revenue: 9100000, sessions: 2010 },
            { month: 'Май', revenue: 10400000, sessions: 2280 },
            { month: 'Июн', revenue: 11800000, sessions: 2510 },
            { month: 'Июл', revenue: 13200000, sessions: 2740 },
            { month: 'Авг', revenue: 14900000, sessions: 3090 },
            { month: 'Сен', revenue: 12800000, sessions: 2650 },
          ];
          const rateChanges = [
            { date: '14 авг 2026', operator: 'EV Charge UZ', change: '3.0% → 2.8%', reason: 'Партнёрская скидка за объём' },
            { date: '1 сент 2024', operator: 'Botibot EV', change: '3.0% → 3.2%', reason: 'Коррекция по договору' },
            { date: '10 янв 2025', operator: 'GreenGo', change: '3.0% → 4.0%', reason: 'Повышенный риск-профиль' },
          ];
          return (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={commissionHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v / 1000000).toFixed(0) + 'M'} />
                  <Tooltip formatter={(v: unknown) => (v as number).toLocaleString() + ' сум'} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#38BDF8" strokeWidth={2} fill="url(#commGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">Лог изменений ставок</p>
                <div className="space-y-2">
                  {rateChanges.map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-28 shrink-0">{r.date}</span>
                      <span className="text-sm font-medium text-slate-700 flex-1">{r.operator}</span>
                      <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded shrink-0">{r.change}</span>
                      <span className="text-xs text-slate-400 italic hidden sm:block">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}
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
          { label: 'Всего CDR (24ч)', v: String(cdrRecords.length), c: 'text-slate-900' },
          { label: 'Валидных', v: String(cdrRecords.filter(r => r.status === 'valid').length), c: 'text-green-600' },
          { label: 'Расхождений', v: String(cdrRecords.filter(r => r.status === 'mismatch').length), c: 'text-amber-500' },
          { label: 'Подозрительных', v: String(cdrRecords.filter(r => r.suspicious).length), c: 'text-red-500' },
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
              {['CDR ID', 'Оператор', 'Пользователь', 'Начало', 'Конец', 'Энергия', 'Расчёт', 'Выставлено', 'Статус', ''].map(h => (
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

const auditLog = [
  { time: '15:42:18', user: 'admin@onecharge.uz', action: 'Operator approved', detail: 'GreenCharge UZ (op-001) — статус: active', level: 'info', category: 'operator', ip: '185.22.61.4' },
  { time: '15:38:04', user: 'system', action: 'Fraud alert triggered', detail: 'CDR-10812 — аномальная энергия 312 кВт·ч', level: 'warn', category: 'fraud', ip: 'internal' },
  { time: '15:21:55', user: 'admin@onecharge.uz', action: 'Tariff modified', detail: 'T-003 DC Night Rate — цена 2000→1500 сум', level: 'info', category: 'tariff', ip: '185.22.61.4' },
  { time: '14:58:12', user: 'ops@onecharge.uz', action: 'Station disabled', detail: 'Namangan Industrial (st-005) — maintenance', level: 'warn', category: 'station', ip: '10.0.0.15' },
  { time: '14:44:30', user: 'system', action: 'Settlement processed', detail: 'GreenCharge UZ — август 2026 — 170.9M сум', level: 'info', category: 'finance', ip: 'internal' },
  { time: '14:33:20', user: 'admin@onecharge.uz', action: 'Commission rate changed', detail: 'EcoVolt (op-002) — 3% → 2.8%', level: 'info', category: 'finance', ip: '185.22.61.4' },
  { time: '14:12:00', user: 'system', action: 'API abuse blocked', detail: 'IP 185.24.xxx.xxx — 18 попыток за 60 сек', level: 'error', category: 'access', ip: 'internal' },
  { time: '13:55:41', user: 'ops@onecharge.uz', action: 'User suspended', detail: 'user-id: 88341 — подозрительная активность', level: 'warn', category: 'fraud', ip: '10.0.0.15' },
  { time: '13:44:09', user: 'admin@onecharge.uz', action: 'Operator added', detail: 'Nukus Power (op-004) — integration: API', level: 'info', category: 'operator', ip: '185.22.61.4' },
  { time: '12:30:00', user: 'system', action: 'Daily backup completed', detail: 'S3 backup — 2.4 GB — 00:00 UTC', level: 'info', category: 'data', ip: 'internal' },
];

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

const extendedAuditLog = [
  ...auditLog,
  { time: '14:55:02', action: 'Тариф изменён', detail: 'T-003 DC Night Rate: 1 400 → 1 500 сум/кВт·ч', user: 'admin@onecharge.uz', level: 'info' as const, category: 'tariff', ip: '185.22.61.4' },
  { time: '14:42:18', action: 'Оператор отключён', detail: 'op-003 SilkRoad EV · причина: просрочка платежа', user: 'finance@onecharge.uz', level: 'warn' as const, category: 'operator', ip: '185.22.61.9' },
  { time: '14:31:05', action: 'Роль назначена', detail: 'support@onecharge.uz → Support Agent', user: 'admin@onecharge.uz', level: 'info' as const, category: 'access', ip: '185.22.61.4' },
  { time: '14:12:44', action: 'Fraud alert закрыт', detail: 'CDR-10812 · ложная тревога, подтверждено', user: 'ops@onecharge.uz', level: 'info' as const, category: 'fraud', ip: '10.0.0.15' },
  { time: '13:55:30', action: 'Настройки OCPI обновлены', detail: 'Partner: Kazakhstan EV Net · токен ротирован', user: 'admin@onecharge.uz', level: 'info' as const, category: 'integration', ip: '185.22.61.4' },
  { time: '13:20:11', action: 'Экспорт CDR', detail: '8 821 записей за август 2026 · format: CSV', user: 'finance@onecharge.uz', level: 'info' as const, category: 'data', ip: '185.22.61.9' },
  { time: '12:45:02', action: 'Попытка входа отклонена', detail: 'unknown@example.com · неверный пароль × 5', user: 'unknown', level: 'error' as const, category: 'access', ip: '91.108.4.50' },
  { time: '12:30:18', action: 'Settlement выполнен', detail: 'INV-2026-08 · 170 914 000 сум → IBAN UZ12...4421', user: 'system', level: 'info' as const, category: 'finance', ip: 'internal' },
  { time: '11:58:33', action: 'EVSE переведена в Offline', detail: 'CS-0104 Yunusobod Mall B · admin override', user: 'ops@onecharge.uz', level: 'warn' as const, category: 'station', ip: '10.0.0.15' },
  { time: '11:20:44', action: 'Пользователь заблокирован', detail: 'U-5521 · подозрение в fraud · 312 кВт·ч за сессию', user: 'fraud@onecharge.uz', level: 'warn' as const, category: 'fraud', ip: '185.22.61.12' },
];

const auditCategories = ['Все', 'tariff', 'operator', 'access', 'fraud', 'finance', 'station', 'integration', 'data'] as const;
const categoryLabel: Record<string, string> = {
  tariff: 'Тарифы', operator: 'Операторы', access: 'Доступ', fraud: 'Fraud',
  finance: 'Финансы', station: 'Станции', integration: 'Интеграция', data: 'Данные',
};
const categoryColor: Record<string, string> = {
  tariff: 'bg-amber-100 text-amber-700', operator: 'bg-sky-100 text-sky-700',
  access: 'bg-violet-100 text-violet-700', fraud: 'bg-red-100 text-red-700',
  finance: 'bg-green-100 text-green-700', station: 'bg-slate-100 text-slate-600',
  integration: 'bg-blue-100 text-blue-700', data: 'bg-pink-100 text-pink-700',
};

function AuditLogPage() {
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [catFilter, setCatFilter] = useState<string>('Все');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<typeof extendedAuditLog[0] | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const filtered = extendedAuditLog.filter(e => {
    const matchLevel = levelFilter === 'all' || e.level === levelFilter;
    const matchCat = catFilter === 'Все' || e.category === catFilter;
    const matchQ = !query || e.action.toLowerCase().includes(query.toLowerCase()) || e.user.toLowerCase().includes(query.toLowerCase()) || e.detail.toLowerCase().includes(query.toLowerCase());
    return matchLevel && matchCat && matchQ;
  });

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const levelColors: Record<string, string> = {
    info: 'text-sky-600 bg-sky-50 border-sky-200',
    warn: 'text-amber-600 bg-amber-50 border-amber-200',
    error: 'text-red-600 bg-red-50 border-red-200',
  };

  const stats = {
    info: extendedAuditLog.filter(e => e.level === 'info').length,
    warn: extendedAuditLog.filter(e => e.level === 'warn').length,
    error: extendedAuditLog.filter(e => e.level === 'error').length,
  };

  return (
    <div className="flex h-full">
      {/* Main log */}
      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
            <p className="text-sm text-slate-500">Журнал всех действий в системе · неизменяемый · retention 2 года</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />Экспорт CSV
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'INFO', count: stats.info, color: 'bg-sky-50 border-sky-100 text-sky-700' },
            { label: 'WARN', count: stats.warn, color: 'bg-amber-50 border-amber-100 text-amber-700' },
            { label: 'ERROR', count: stats.error, color: 'bg-red-50 border-red-100 text-red-700' },
          ].map(s => (
            <button key={s.label} onClick={() => { setLevelFilter(s.label.toLowerCase() as typeof levelFilter); setPage(1); }}
              className={`border rounded-xl p-3 text-left transition-all ${s.color} ${levelFilter === s.label.toLowerCase() ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs font-semibold">{s.label} events (24ч)</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {(['all', 'info', 'warn', 'error'] as const).map(l => (
              <button key={l} onClick={() => { setLevelFilter(l); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${levelFilter === l ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {l === 'all' ? 'Все уровни' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {auditCategories.map(c => (
              <button key={c} onClick={() => { setCatFilter(c); setPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${catFilter === c ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {c === 'Все' ? 'Все категории' : categoryLabel[c] || c}
              </button>
            ))}
          </div>
          <input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder="Поиск..." className="ml-auto text-sm border border-slate-200 rounded-xl px-3 py-1.5 outline-none w-48" />
        </div>

        {/* Log table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">{filtered.length} событий</span>
            <span className="text-xs text-slate-400">· страница {page} из {totalPages}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {paginated.map((entry, i) => (
              <button key={i} onClick={() => setSelected(selected?.time === entry.time && selected.action === entry.action ? null : entry)}
                className={`w-full px-5 py-3 flex items-start gap-4 text-left hover:bg-slate-50 transition-colors ${selected?.time === entry.time && selected.action === entry.action ? 'bg-sky-50' : ''}`}>
                <span className="text-xs text-slate-400 font-mono w-14 shrink-0 mt-0.5">{entry.time}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded border font-bold shrink-0 w-11 text-center ${levelColors[entry.level]}`}>
                  {entry.level.toUpperCase()}
                </span>
                {entry.category && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${categoryColor[entry.category] || 'bg-slate-100 text-slate-600'}`}>
                    {categoryLabel[entry.category] || entry.category}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{entry.action}</p>
                  <p className="text-xs text-slate-500 truncate">{entry.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">{entry.user}</p>
                  <p className="text-[10px] text-slate-300 font-mono">{(entry as any).ip || ''}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="w-8 h-8 rounded-lg text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30">‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm transition-colors ${page === p ? 'bg-sky-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{p}</button>
          ))}
          {totalPages > 5 && <span className="text-slate-400">...</span>}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-8 h-8 rounded-lg text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 border-l border-slate-100 bg-white p-5 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-slate-800">Детали события</p>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">ДЕЙСТВИЕ</p>
              <p className="text-sm font-semibold text-slate-800">{selected.action}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">ОПИСАНИЕ</p>
              <p className="text-xs text-slate-600 leading-relaxed">{selected.detail}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">ВРЕМЯ</p>
                <p className="text-xs font-mono font-semibold text-slate-700">{selected.time}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">УРОВЕНЬ</p>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${levelColors[selected.level]}`}>{selected.level.toUpperCase()}</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">ПОЛЬЗОВАТЕЛЬ</p>
                <p className="text-xs font-mono text-slate-700 truncate">{selected.user}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">IP</p>
                <p className="text-xs font-mono text-slate-700">{(selected as any).ip || '—'}</p>
              </div>
            </div>
            {selected.category && (
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">КАТЕГОРИЯ</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${categoryColor[selected.category]}`}>{categoryLabel[selected.category]}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const extraSessions = [
  { id: 'S-106', user: 'Sardor N.', station: 'EcoVolt Andijon', start: '09:12', end: '10:01', energy: '31.2', cost: '54 600 сум', status: 'completed' as const },
  { id: 'S-107', user: 'Kamola A.', station: 'Nukus Power', start: '11:30', end: '—', energy: '18.4', cost: '—', status: 'active' as const },
  { id: 'S-108', user: 'Timur K.', station: 'GreenCharge Namangan', start: '07:55', end: '08:44', energy: '0', cost: '0 сум', status: 'failed' as const },
];

function AdminSessionsPage() {
  const liveSessions = useLiveAdminSessions();
  const extendedSessions = [...liveSessions, ...extraSessions] as LegacyAdminSession[];
  const [selected, setSelected] = useState<LegacyAdminSession | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('all');

  const filtered = extendedSessions.filter(s => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchQuery = !query || s.id.toLowerCase().includes(query.toLowerCase()) || s.user.toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  const statusBgLocal: Record<string, string> = {
    active: 'bg-green-100 text-green-700', completed: 'bg-slate-100 text-slate-600', failed: 'bg-red-100 text-red-600',
  };
  const statusLabelLocal: Record<string, string> = { active: 'Активна', completed: 'Завершена', failed: 'Ошибка' };

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 space-y-5 overflow-y-auto min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Все сессии</h1>
            <p className="text-sm text-slate-500">{filtered.length} записей</p>
          </div>
          <ExportButton
            name="one-charge-cdr"
            title="CDR export"
            headers={['ID', 'Пользователь', 'Станция', 'Начало', 'Конец', 'Энергия', 'Стоимость', 'Статус']}
            rows={filtered.map(s => [s.id, s.user, s.station, s.start, s.end, s.energy, s.cost, s.status])}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Всего сегодня', value: extendedSessions.length, color: 'text-slate-900' },
            { label: 'Активных', value: extendedSessions.filter(s => s.status === 'active').length, color: 'text-green-600' },
            { label: 'Ошибок', value: extendedSessions.filter(s => s.status === 'failed').length, color: 'text-red-500' },
            { label: 'Выручка (сум)', value: '4.2 млн', color: 'text-sky-600' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className={`text-2xl font-bold mono ${k.color}`}>{k.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-3 flex-wrap">
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по ID, пользователю..."
              className="flex-1 min-w-40 text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            <div className="flex gap-1">
              {['all', 'active', 'completed', 'failed'].map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${statusFilter === f ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {f === 'all' ? 'Все' : statusLabelLocal[f]}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['ID', 'Пользователь', 'Станция', 'Начало', 'Конец', 'кВт·ч', 'Сумма', 'Статус'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(s => (
                <tr key={s.id} onClick={() => setSelected(s)}
                  className={`hover:bg-slate-50 cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-sky-50' : ''}`}>
                  <td className="px-4 py-3 text-xs text-sky-600 font-medium mono">{s.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{s.user}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.station}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 mono">{s.start}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 mono">{s.end}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 mono">{s.energy}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 mono">{s.cost}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBgLocal[s.status]}`}>{statusLabelLocal[s.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="w-72 shrink-0 bg-white border-l border-slate-100 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900 mono">{selected.id}</p>
              <p className="text-xs text-slate-400">{selected.user}</p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <XCircle size={15} className="text-slate-400" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <span className={`inline-flex text-xs px-2.5 py-1 rounded-full ${statusBgLocal[selected.status]}`}>{statusLabelLocal[selected.status]}</span>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Детали сессии</p>
              {[
                { label: 'Станция', value: selected.station },
                { label: 'Начало', value: selected.start },
                { label: 'Конец', value: selected.end },
                { label: 'Энергия', value: `${selected.energy} кВт·ч` },
                { label: 'Сумма', value: selected.cost },
                { label: 'Разъём', value: 'CCS2' },
                { label: 'Тариф', value: 'DC Fast Standard' },
                { label: 'Оплата', value: 'Humo' },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-sm">
                  <span className="text-slate-400 text-xs">{r.label}</span>
                  <span className="text-slate-800 font-medium text-xs mono">{r.value}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">OCPP события</p>
              {[
                { t: selected.start, msg: 'StatusNotification: Preparing' },
                { t: selected.start, msg: 'StartTransaction confirmed' },
                { t: selected.end || '—', msg: selected.status === 'failed' ? 'StopTransaction: EVDisconnected' : 'StopTransaction: Local' },
              ].map((e, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-slate-400 mono w-10 shrink-0">{e.t}</span>
                  <span className={`${e.msg.includes('Disconnect') || e.msg.includes('failed') ? 'text-red-500' : 'text-slate-600'}`}>{e.msg}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {selected.status === 'active' && (
                <button className="w-full py-2 bg-red-50 text-red-500 border border-red-200 rounded-xl text-xs font-medium hover:bg-red-100">
                  Remote Stop
                </button>
              )}
              {selected.status === 'failed' && (
                <button className="w-full py-2 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl text-xs font-medium hover:bg-amber-100">
                  Инициировать возврат
                </button>
              )}
              <button className="w-full py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-medium hover:bg-slate-100">
                Скачать CDR
              </button>
            </div>
          </div>
        </div>
      )}
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
        <h1 className="text-xl font-bold text-slate-900">Настройки</h1>
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
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}>
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
            { key: 'fraud', label: 'Fraud-оповещения', sub: 'Подозрительные операции' },
            { key: 'operators', label: 'Новые операторы', sub: 'Заявки на подключение' },
            { key: 'payments', label: 'Платежи', sub: 'Ошибки и возвраты' },
            { key: 'cdrErrors', label: 'CDR ошибки', sub: 'Ошибки валидации CDR' },
            { key: 'system', label: 'Системные', sub: 'Обновления платформы' },
            { key: 'emailDigest', label: 'Email дайджест', sub: 'Еженедельная сводка' },
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

function AuthFlow({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<'login' | 'tfa'>('login');
  const [email, setEmail] = useState('admin@onecharge.uz');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('tfa');
    setCountdown(30);
  };

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (step === 'tfa') {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const otpFilled = otp.every(d => d !== '');

  if (step === 'login') {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #080C18 0%, #0F172A 60%, #1E1040 100%)' }}>
        <div className="w-full max-w-sm mx-auto px-6">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}>
              <Zap size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">ONE CHARGE UZ</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(148,163,184,0.6)' }}>Admin Control Center</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(148,163,184,0.7)' }}>Email / Логин</label>
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(148,163,184,0.7)' }}>Пароль</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-violet-500"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(148,163,184,0.5)' }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit"
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', boxShadow: '0 4px 20px rgba(139,92,246,0.4)' }}>
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #080C18 0%, #0F172A 60%, #1E1040 100%)' }}>
      <div className="w-full max-w-sm mx-auto px-6 flex flex-col items-center">
        {/* Shield icon with glow */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full blur-xl" style={{ background: 'rgba(139,92,246,0.4)', transform: 'scale(1.5)' }} />
          <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', boxShadow: '0 0 32px rgba(139,92,246,0.5)' }}>
            <Shield size={28} className="text-white" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white mb-1">Двухфакторная аутентификация</h2>
        <p className="text-sm text-center mb-8" style={{ color: 'rgba(148,163,184,0.6)' }}>Код отправлен на +998 90 *** ** 12</p>

        {/* OTP input boxes */}
        <div className="flex gap-2 mb-6">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => { otpRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1}
              value={digit}
              onChange={e => handleOtpChange(i, e.target.value)}
              onKeyDown={e => handleOtpKeyDown(i, e)}
              className="w-11 h-14 text-center text-2xl font-bold mono border-2 rounded-xl outline-none transition-colors"
              style={{
                background: 'rgba(255,255,255,0.07)',
                borderColor: digit ? '#8B5CF6' : 'rgba(255,255,255,0.12)',
                color: 'white',
              }}
              onFocus={e => (e.target.style.borderColor = '#8B5CF6')}
              onBlur={e => (e.target.style.borderColor = digit ? '#8B5CF6' : 'rgba(255,255,255,0.12)')}
            />
          ))}
        </div>

        <button
          onClick={() => { if (otpFilled) onLogin(); }}
          disabled={!otpFilled}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all mb-4"
          style={{
            background: otpFilled ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)' : 'rgba(255,255,255,0.08)',
            boxShadow: otpFilled ? '0 4px 20px rgba(139,92,246,0.4)' : 'none',
            color: otpFilled ? 'white' : 'rgba(148,163,184,0.4)',
          }}>
          Подтвердить
        </button>

        <button
          onClick={() => { if (countdown === 0) { setCountdown(30); setOtp(Array(6).fill('')); } }}
          disabled={countdown > 0}
          className="text-sm mb-4 transition-colors"
          style={{ color: countdown > 0 ? 'rgba(148,163,184,0.35)' : 'rgba(139,92,246,0.9)' }}>
          {countdown > 0 ? `Отправить код повторно (${countdown}с)` : 'Отправить код повторно'}
        </button>

        <button onClick={() => { setStep('login'); setOtp(Array(6).fill('')); }}
          className="text-sm transition-colors hover:text-white"
          style={{ color: 'rgba(148,163,184,0.5)' }}>
          ← Вернуться
        </button>
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
          { label: 'Всего OCPP', value: `${totalConnected}/${totalStations}`, sub: 'станций онлайн' },
          { label: 'API RPS', value: '67 / сек', sub: 'текущий трафик' },
          { label: 'Avg Latency', value: '51 мс', sub: 'средняя задержка' },
          { label: 'Uptime 30д', value: '99.8%', sub: 'доступность' },
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
                <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip formatter={(v: unknown) => [`${v as number} req/s`, 'RPS']} />
            <Area type="monotone" dataKey="rps" stroke="#38BDF8" strokeWidth={2} fill="url(#rpsGrad)" dot={false} />
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
              {['Оператор', 'Подключено', 'Latency', 'Uptime 30д', 'Статус'].map(h => (
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

  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      map: <LiveMapPage />, operators: <OperatorsPage />, users: <UsersPage />,
      settlement: <SettlementPage />, commissions: <CommissionsPage />, tariffs_global: <GlobalTariffsPage />,
      sessions: <AdminSessionsPage />, payments: <PaymentsPage />,
      analytics: <AnalyticsPage />, ai: <AIInsightsPage />, fraud: <FraudPage />,
      cdr: <CDRValidationPage />, audit: <AuditLogPage />, roles: <RolesPage />,
      settings: <AdminSettingsPage />,
      system_health: <SystemHealthPage />,
    };
    return (
      <div key={page} className="animate-fade-in h-full">
        {pages[page] ?? <AdminDashboard />}
      </div>
    );
  };

  return (
    <div className="h-full flex relative dash-surface">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-20" />}
      <AdminSidebar current={page} onChange={setPage} onBack={onBack} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-hidden relative">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden absolute top-3 left-3 z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600">
          <Menu size={18} />
        </button>
        {renderPage()}
      </div>
      <AIChat portalType="admin" />
    </div>
  );
}

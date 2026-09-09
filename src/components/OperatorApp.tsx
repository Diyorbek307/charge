import { useState, useEffect, type ReactNode } from 'react';
import {
  LayoutDashboard, MapPin, DollarSign, BarChart2,
  Settings, LogOut, Zap, ArrowUp, ArrowDown, ArrowLeft, Activity,
  CheckCircle, RefreshCw, Download, Filter,
  Link, Terminal, Bell, Copy, Eye, EyeOff,
  Plus, Trash2, Shield, Globe, Lock, Users, Star, Menu,
  AlertTriangle, AlertCircle, Info
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { stations, sessions, revenueData, hourlyData, connectorDistribution, adminSessions } from '../data/mockData';
import AnimatedCounter from './AnimatedCounter';
import AIChat from './AIChat';

type Page = 'dashboard' | 'stations' | 'sessions' | 'alerts' | 'tariffs' | 'finance' | 'customers' | 'integration' | 'settings' | 'help';

const statusColor: Record<string, string> = {
  available: '#22C55E', occupied: '#EF4444', unavailable: '#94A3B8', reserved: '#F59E0B',
  active: '#22C55E', completed: '#94A3B8', failed: '#EF4444',
};
const statusBg: Record<string, string> = {
  available: 'bg-green-100 text-green-700', occupied: 'bg-red-100 text-red-700',
  unavailable: 'bg-slate-100 text-slate-600', reserved: 'bg-amber-100 text-amber-700',
  active: 'bg-green-100 text-green-700', completed: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-700',
};
const statusLabel: Record<string, string> = {
  available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно',
  reserved: 'Забронировано', active: 'Активна', completed: 'Завершена', failed: 'Ошибка',
};

function Sidebar({ current, onChange, onBack, isOpen, onClose }: { current: Page; onChange: (p: Page) => void; onBack: () => void; isOpen?: boolean; onClose?: () => void }) {
  const groups = [
    {
      label: 'Обзор',
      items: [
        { id: 'dashboard' as Page, label: 'Дашборд', icon: <LayoutDashboard size={14} /> },
        { id: 'stations' as Page, label: 'Станции', icon: <MapPin size={14} /> },
        { id: 'sessions' as Page, label: 'Сессии', icon: <Activity size={14} /> },
        { id: 'alerts' as Page, label: 'Оповещения', icon: <Bell size={14} />, badge: 3 },
      ],
    },
    {
      label: 'Финансы',
      items: [
        { id: 'tariffs' as Page, label: 'Тарифы', icon: <DollarSign size={14} /> },
        { id: 'finance' as Page, label: 'Финансы', icon: <BarChart2 size={14} /> },
      ],
    },
    {
      label: 'Клиенты & Система',
      items: [
        { id: 'customers' as Page, label: 'Клиенты', icon: <Users size={14} /> },
        { id: 'integration' as Page, label: 'Интеграция', icon: <Link size={14} /> },
        { id: 'settings' as Page, label: 'Настройки', icon: <Settings size={14} /> },
        { id: 'help' as Page, label: 'Помощь', icon: <Bell size={14} /> },
      ],
    },
  ];

  return (
    <div className={`w-[210px] flex flex-col h-full shrink-0 absolute inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#061510', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Brand */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ONE CHARGE</p>
            <p className="text-[11px] leading-none mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>Operator Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>G</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">GreenCharge UZ</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>op-001 · 47 станций</p>
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.3)' }}>{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = current === item.id;
                return (
                  <button key={item.id} onClick={() => { onChange(item.id); onClose?.(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] transition-all relative"
                    style={active ? {
                      background: 'rgba(16,185,129,0.15)',
                      color: '#6EE7B7',
                      fontWeight: 600,
                    } : {
                      color: 'rgba(148,163,184,0.65)',
                    }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'; } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.65)'; } }}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-emerald-400" />}
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    {'badge' in item && (item as { badge: number }).badge > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {(item as { badge: number }).badge}
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
          style={{ color: 'rgba(148,163,184,0.45)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.45)'; }}
        >
          <LogOut size={14} />Выйти из портала
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, trend, color = 'sky', numValue, delay = 0 }: { label: string; value: string; sub: string; icon: ReactNode; trend?: number; color?: string; numValue?: number; delay?: number }) {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-500',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-500',
    purple: 'bg-violet-50 text-violet-500',
  };
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100/80 hover:border-slate-200 transition-all hover:shadow-md enter-up"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide inter">{label}</p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
      </div>
      <p className="text-[28px] font-bold text-slate-900 mono leading-none tracking-tight mb-1.5 num-pop" style={{ animationDelay: `${delay + 80}ms` }}>
        {numValue !== undefined ? <AnimatedCounter value={numValue} duration={1100} /> : value}
      </p>
      <div className="flex items-center gap-1">
        {trend !== undefined && (trend >= 0
          ? <ArrowUp size={11} className="text-emerald-500" />
          : <ArrowDown size={11} className="text-red-500" />)}
        <p className={`text-xs inter ${trend !== undefined ? (trend >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'}`}>{sub}</p>
      </div>
    </div>
  );
}

function DashboardPage() {
  const [activeSessions, setActiveSessions] = useState(12);
  const [livePower, setLivePower] = useState(1482);
  const [todaySessions, setTodaySessions] = useState(284);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveSessions(s => Math.max(8, Math.min(18, s + Math.floor(Math.random() * 3 - 1))));
      setLivePower(p => Math.max(1200, Math.min(1800, p + Math.floor(Math.random() * 60 - 30))));
      setTodaySessions(s => s + Math.floor(Math.random() * 2));
    }, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Добрый день, GreenCharge UZ</h1>
          <p className="text-sm text-slate-500 inter flex items-center gap-2">
            4 сентября 2026 · Четверг
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />live
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />Экспорт
          </button>
          <button className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            <Bell size={16} />
          </button>
        </div>
      </div>

      {/* Live power strip */}
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-500 via-sky-500 to-sky-600 rounded-2xl px-5 py-4 flex items-center justify-between text-white enter-up delay-100"
        style={{ boxShadow: '0 4px 24px rgba(14,165,233,0.3)' }}>
        <div className="beam-sweep opacity-60" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sky-100 text-xs font-medium">Суммарная мощность сейчас</p>
            <p className="text-2xl font-bold mono transition-all duration-700">{(livePower / 1000).toFixed(2)} МВт</p>
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <p className="text-3xl font-bold mono transition-all duration-500">{activeSessions}</p>
            <p className="text-sky-100 text-xs">активных зарядок</p>
          </div>
          <div>
            <p className="text-3xl font-bold mono">{todaySessions}</p>
            <p className="text-sky-100 text-xs">сессий сегодня</p>
          </div>
          <div>
            <p className="text-3xl font-bold mono">{Math.round(activeSessions / 124 * 100)}%</p>
            <p className="text-sky-100 text-xs">загрузка EVSE</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Станции" value="47" numValue={47} sub="+3 этот месяц" icon={<MapPin size={16} />} trend={3} color="sky" delay={0} />
        <StatCard label="Активные зарядки" value={String(activeSessions)} numValue={activeSessions} sub="из 124 EVSE" icon={<Zap size={16} />} color="green" delay={60} />
        <StatCard label="Выручка (сент.)" value="18.4M" sub="+22% vs авг." icon={<DollarSign size={16} />} trend={22} color="purple" delay={120} />
        <StatCard label="Сессий сегодня" value={String(todaySessions)} numValue={todaySessions} sub="ср. 41 мин" icon={<Activity size={16} />} trend={5} color="amber" delay={180} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <div className="col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Выручка и сессии</h3>
            <span className="text-xs text-slate-400">млн сум / сессии</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }} />
              <Area type="monotone" dataKey="revenue" stroke="#0EA5E9" fill="url(#revenueGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="sessions" stroke="#22C55E" fill="none" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Connector dist */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Типы разъемов</h3>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={connectorDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                {connectorDistribution.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: unknown) => `${(v as number)}%`} contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {connectorDistribution.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-slate-600 flex-1">{d.name}</span>
                <span className="text-slate-800 font-medium mono">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak hours */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Пиковые часы</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
            <Bar dataKey="sessions" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Latest sessions */}
      <div className="bg-white rounded-2xl border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Последние сессии</h3>
          <button className="text-xs text-sky-500 font-medium">Все →</button>
        </div>
        <div className="divide-y divide-slate-50">
          {adminSessions.slice(0, 4).map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center gap-4">
              <span className="text-xs text-slate-400 mono w-20">{s.id}</span>
              <span className="text-sm text-slate-700 flex-1">{s.user}</span>
              <span className="text-sm text-slate-600 w-44 truncate">{s.station}</span>
              <span className="text-xs text-slate-400 w-16">{s.start}</span>
              <span className="text-sm font-medium text-slate-800 mono w-24">{s.cost}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[s.status]}`}>{statusLabel[s.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StationsPage() {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  if (selectedStation) return <StationDetailPage stationId={selectedStation} onBack={() => setSelectedStation(null)} />;
  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Станции</h1>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors">
          + Добавить станцию
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Всего', value: '47', color: 'text-slate-900' },
          { label: 'Активные', value: '41', color: 'text-green-600' },
          { label: 'EVSE', value: '124', color: 'text-sky-600' },
          { label: 'Ошибки', value: '2', color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 text-center">
            <p className={`text-2xl font-bold mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-3">
          <input placeholder="Поиск..." className="flex-1 text-sm outline-none text-slate-700 placeholder:text-slate-400" />
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600">
            <Filter size={12} />Фильтр
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Станция', 'Город', 'Статус', 'EVSE', 'Мощность', 'Загрузка', 'Цена'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {stations.map(s => {
              const free = s.connectors.filter(c => c.status === 'available').length;
              const util = Math.round((1 - free / s.connectors.length) * 100);
              return (
                <tr key={s.id} onClick={() => setSelectedStation(s.id)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.address}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.city}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[s.status]}`}>{statusLabel[s.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 mono">{free}/{s.connectors.length}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 mono">{s.totalPower} кВт</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${util}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 mono w-8">{util}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 mono">{s.connectors[0].price.toLocaleString()} сум</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-5 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Новая станция</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Название *</label>
                <input type="text" placeholder="например: ONE CHARGE Ташкент Центр" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Адрес</label>
                <input type="text" placeholder="Улица, дом" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Город</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors bg-white">
                  <option value="tashkent">Ташкент</option>
                  <option value="samarkand">Самарканд</option>
                  <option value="bukhara">Бухара</option>
                  <option value="fergana">Фергана</option>
                  <option value="nukus">Нукус</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Тип зарядки</label>
                <div className="space-y-1.5">
                  {['AC Type 2', 'DC CCS2', 'DC CHAdeMO'].map(t => (
                    <label key={t} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" className="rounded" />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Мощность кВт</label>
                  <input type="number" placeholder="50" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Тариф (сум/кВт·ч)</label>
                  <input type="number" defaultValue={900} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Часы работы</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors bg-white">
                  <option value="24h">Круглосуточно</option>
                  <option value="6-22">06:00–22:00</option>
                  <option value="8-20">08:00–20:00</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Описание</label>
                <textarea rows={3} placeholder="Дополнительная информация о станции..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Отмена
              </button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors">
                Добавить станцию
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionsPage() {
  const [selected, setSelected] = useState<typeof adminSessions[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = adminSessions.filter(s => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchQuery = !query || s.id.toLowerCase().includes(query.toLowerCase()) || s.user.toLowerCase().includes(query.toLowerCase()) || s.station.toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  return (
    <div className="flex h-full">
      <div className={`flex-1 p-6 space-y-5 overflow-y-auto transition-all ${selected ? 'w-0 hidden' : ''} md:block md:flex-1`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Сессии</h1>
            <p className="text-sm text-slate-500">{filtered.length} из {adminSessions.length}</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />CSV
          </button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Активных', value: adminSessions.filter(s => s.status === 'active').length, color: 'text-green-600', dot: 'bg-green-500' },
            { label: 'Завершённых', value: adminSessions.filter(s => s.status === 'completed').length, color: 'text-slate-700', dot: 'bg-slate-400' },
            { label: 'Ошибок', value: adminSessions.filter(s => s.status === 'failed').length, color: 'text-red-600', dot: 'bg-red-500' },
            { label: 'Итого кВт·ч', value: '847', color: 'text-sky-600', dot: 'bg-sky-500' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full shrink-0 ${k.dot}`} />
              <div>
                <p className={`text-xl font-bold mono ${k.color}`}>{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-3">
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по ID, пользователю, станции..."
              className="flex-1 text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            <div className="flex gap-1">
              {['all', 'active', 'completed', 'failed'].map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 text-xs rounded-lg ${statusFilter === f ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {f === 'all' ? 'Все' : statusLabel[f]}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Session ID', 'Пользователь', 'Станция', 'Начало', 'Конец', 'кВт·ч', 'Стоимость', 'Статус'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(s => (
                <tr key={s.id} onClick={() => setSelected(s)} className={`hover:bg-slate-50 cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-sky-50' : ''}`}>
                  <td className="px-4 py-3 text-xs text-sky-600 font-medium mono">{s.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{s.user}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.station}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 mono">{s.start}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 mono">{s.end}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 mono">{s.energy}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 mono">{s.cost}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[s.status]}`}>{statusLabel[s.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 shrink-0 bg-white border-l border-slate-100 flex flex-col h-full overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900 mono">{selected.id}</p>
              <p className="text-xs text-slate-400 mt-0.5">{selected.station}</p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <Plus size={14} className="rotate-45 text-slate-500" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <span className={`text-xs px-2.5 py-1 rounded-full ${statusBg[selected.status]}`}>{statusLabel[selected.status]}</span>

            {/* Timeline */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Временная шкала</p>
              {[
                { icon: '🔌', label: 'Подключение', time: selected.start },
                { icon: '⚡', label: 'Начало зарядки', time: selected.start },
                { icon: '✅', label: 'Завершение', time: selected.end || '—' },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-base">{e.icon}</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-700">{e.label}</p>
                  </div>
                  <p className="text-xs mono text-slate-500">{e.time}</p>
                </div>
              ))}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Энергия', value: selected.energy + ' кВт·ч' },
                { label: 'Стоимость', value: selected.cost },
                { label: 'Пользователь', value: selected.user },
                { label: 'EVSE', value: 'EVSE-1' },
              ].map(m => (
                <div key={m.label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-0.5">{m.label}</p>
                  <p className="text-sm font-semibold text-slate-800 mono">{m.value}</p>
                </div>
              ))}
            </div>

            {/* CDR */}
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">CDR</p>
              {[
                { k: 'CDR ID', v: `CDR-${selected.id}` },
                { k: 'Тариф', v: 'DC Fast Standard' },
                { k: 'Метод оплаты', v: 'Humo' },
                { k: 'Комиссия', v: '3%' },
              ].map(r => (
                <div key={r.k} className="flex justify-between text-xs py-0.5">
                  <span className="text-slate-400">{r.k}</span>
                  <span className="text-slate-700 font-medium mono">{r.v}</span>
                </div>
              ))}
            </div>

            {selected.status === 'active' && (
              <button className="w-full py-2.5 bg-red-50 text-red-500 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100">
                Остановить сессию
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const financeHistory = [
  { period: 'Сентябрь 2026', sessions: 3120, energy: 108400, revenue: 184500000, commission: 5535000, payout: 178965000, status: 'pending', invoiceId: 'INV-2026-09' },
  { period: 'Август 2026', sessions: 2840, energy: 98420, revenue: 176200000, commission: 5286000, payout: 170914000, status: 'paid', invoiceId: 'INV-2026-08' },
  { period: 'Июль 2026', sessions: 2450, energy: 84700, revenue: 152500000, commission: 4575000, payout: 147925000, status: 'paid', invoiceId: 'INV-2026-07' },
  { period: 'Июнь 2026', sessions: 2010, energy: 69200, revenue: 124600000, commission: 3738000, payout: 120862000, status: 'paid', invoiceId: 'INV-2026-06' },
];

const revenueMonthly = [
  { m: 'Апр', v: 98 }, { m: 'Май', v: 112 }, { m: 'Июн', v: 124 },
  { m: 'Июл', v: 152 }, { m: 'Авг', v: 176 }, { m: 'Сен', v: 184 },
];

function FinancePage() {
  const [selectedInvoice, setSelectedInvoice] = useState<typeof financeHistory[0] | null>(null);

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 space-y-5 overflow-y-auto min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Финансы и расчёты</h1>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />Выгрузить
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Выручка, сен', value: '184.5M', sub: '+4.7% к авг', color: 'text-slate-900', trend: true },
            { label: 'Комиссия ONE CHARGE', value: '5.5M', sub: '3% · вычтено', color: 'text-red-500', trend: false },
            { label: 'К выплате', value: '178.9M', sub: 'до 07.09.2026', color: 'text-green-600', trend: false },
            { label: 'Сессий всего', value: '3 120', sub: 'сентябрь', color: 'text-sky-600', trend: false },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-400 mb-1">{c.label}</p>
              <p className={`text-xl font-bold mono ${c.color}`}>{c.value}</p>
              <p className={`text-xs mt-0.5 ${c.trend ? 'text-green-500' : 'text-slate-400'}`}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Revenue chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Выручка по месяцам (млн сум)</h3>
            <span className="text-xs text-slate-400">последние 6 месяцев</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={revenueMonthly}>
              <defs>
                <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="m" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[80, 200]} />
              <Tooltip formatter={(v: unknown) => [`${(v as number)}M сум`, 'Выручка']} />
              <Area type="monotone" dataKey="v" stroke="#0EA5E9" strokeWidth={2} fill="url(#finGrad)" dot={{ r: 3, fill: '#0EA5E9' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Settlement flow */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Схема расчётов</h3>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {[
              { label: 'Пользователь', sub: 'оплачивает', bg: 'bg-sky-50 border-sky-200 text-sky-700' },
              null,
              { label: 'ONE CHARGE', sub: 'удерживает 3%', bg: 'bg-slate-50 border-slate-200 text-slate-700' },
              null,
              { label: 'GreenCharge UZ', sub: 'получает D+2', bg: 'bg-green-50 border-green-200 text-green-700' },
            ].map((item, i) => item === null
              ? <div key={i} className="flex flex-col items-center gap-0.5 text-slate-300">
                  <div className="h-0.5 w-8 bg-slate-200" />
                  <span className="text-xs">→</span>
                </div>
              : <div key={i} className={`flex-1 border rounded-xl px-3 py-2.5 text-center ${item.bg}`}>
                  <p className="font-semibold text-sm">{item.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{item.sub}</p>
                </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center text-slate-500">
            <span>184 500 000 сум</span>
            <span>-5 535 000 сум (3%)</span>
            <span className="text-green-600 font-semibold">178 965 000 сум</span>
          </div>
        </div>

        {/* Invoice table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">История инвойсов</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Инвойс', 'Период', 'Сессии', 'кВт·ч', 'Выручка', 'Комиссия', 'К выплате', 'Статус'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {financeHistory.map(row => (
                <tr key={row.invoiceId} onClick={() => setSelectedInvoice(selectedInvoice?.invoiceId === row.invoiceId ? null : row)}
                  className={`cursor-pointer transition-colors hover:bg-slate-50 ${selectedInvoice?.invoiceId === row.invoiceId ? 'bg-sky-50' : ''}`}>
                  <td className="px-4 py-3 text-xs text-sky-600 font-medium mono">{row.invoiceId}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.period}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 mono">{row.sessions.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 mono">{(row.energy / 1000).toFixed(1)}k</td>
                  <td className="px-4 py-3 text-sm text-slate-700 mono">{(row.revenue / 1000000).toFixed(1)}M</td>
                  <td className="px-4 py-3 text-sm text-red-500 mono">-{(row.commission / 1000000).toFixed(1)}M</td>
                  <td className="px-4 py-3 text-sm font-semibold text-green-700 mono">{(row.payout / 1000000).toFixed(1)}M</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {row.status === 'paid' ? 'Выплачено' : 'Ожидает'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice detail panel */}
      {selectedInvoice && (
        <div className="w-72 shrink-0 bg-white border-l border-slate-100 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900 mono">{selectedInvoice.invoiceId}</p>
              <p className="text-xs text-slate-400">{selectedInvoice.period}</p>
            </div>
            <button onClick={() => setSelectedInvoice(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <Plus size={14} className="rotate-45 text-slate-500" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <span className={`inline-flex text-xs px-2.5 py-1 rounded-full ${selectedInvoice.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {selectedInvoice.status === 'paid' ? 'Выплачено' : 'Ожидает выплаты'}
            </span>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Детали инвойса</p>
              {[
                { label: 'Период', value: selectedInvoice.period },
                { label: 'Сессий', value: selectedInvoice.sessions.toLocaleString() },
                { label: 'Энергия', value: `${selectedInvoice.energy.toLocaleString()} кВт·ч` },
                { label: 'Валовая выручка', value: `${selectedInvoice.revenue.toLocaleString()} сум` },
                { label: 'Комиссия (3%)', value: `-${selectedInvoice.commission.toLocaleString()} сум` },
                { label: 'Чистая выплата', value: `${selectedInvoice.payout.toLocaleString()} сум` },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-xs py-0.5 border-b border-slate-50">
                  <span className="text-slate-400">{r.label}</span>
                  <span className={`font-semibold mono ${r.label === 'Комиссия (3%)' ? 'text-red-500' : r.label === 'Чистая выплата' ? 'text-green-600' : 'text-slate-800'}`}>{r.value}</span>
                </div>
              ))}
            </div>

            {selectedInvoice.status === 'paid' && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 mb-1">Выплата произведена</p>
                <p className="text-xs text-green-600">Kapitalbank · IBAN UZ53 0145...</p>
                <p className="text-xs text-green-500 mono mt-0.5">TXN-{selectedInvoice.invoiceId.replace('INV-', '')}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button className="w-full py-2 bg-sky-50 text-sky-600 border border-sky-200 rounded-xl text-xs font-medium hover:bg-sky-100 flex items-center justify-center gap-1.5">
                <Download size={12} />Скачать PDF инвойс
              </button>
              {selectedInvoice.status === 'pending' && (
                <button className="w-full py-2 bg-green-50 text-green-600 border border-green-200 rounded-xl text-xs font-medium hover:bg-green-100">
                  Запросить досрочную выплату
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ocppChargers = [
  { id: 'CS-0101', name: 'Tashkent City Hub #1', model: 'ABB Terra 184', vendor: 'ABB', fw: '1.4.2', status: 'Available', connectors: 2, lastHb: '5с', ip: '10.1.0.101', sessions24h: 28, errors24h: 0 },
  { id: 'CS-0102', name: 'Tashkent City Hub #2', model: 'ABB Terra 184', vendor: 'ABB', fw: '1.4.2', status: 'Occupied', connectors: 2, lastHb: '3с', ip: '10.1.0.102', sessions24h: 31, errors24h: 0 },
  { id: 'CS-0103', name: 'Yunusobod Mall A', model: 'KEBA P30', vendor: 'KEBA', fw: '3.9.1', status: 'Available', connectors: 1, lastHb: '12с', ip: '10.2.0.103', sessions24h: 14, errors24h: 0 },
  { id: 'CS-0104', name: 'Yunusobod Mall B', model: 'KEBA P30', vendor: 'KEBA', fw: '3.9.1', status: 'Faulted', connectors: 1, lastHb: '—', ip: '10.2.0.104', sessions24h: 4, errors24h: 3 },
  { id: 'CS-0105', name: 'Samarkand Plaza', model: 'ChargePoint CPF50', vendor: 'ChargePoint', fw: '6.43', status: 'Unavailable', connectors: 2, lastHb: '18м', ip: '172.16.5.10', sessions24h: 0, errors24h: 1 },
  { id: 'CS-0106', name: 'Bukhara Business Center', model: 'Wallbox Pulsar Plus', vendor: 'Wallbox', fw: '5.8.2', status: 'Available', connectors: 1, lastHb: '8с', ip: '192.168.4.20', sessions24h: 9, errors24h: 0 },
];

const ocppLog = [
  { time: '15:42:38', dir: '←', cs: 'CS-0101', action: 'Heartbeat', status: 'ok', ms: 4 },
  { time: '15:42:35', dir: '←', cs: 'CS-0102', action: 'StatusNotification', status: 'ok', ms: 6, extra: 'Connector 1 → Occupied' },
  { time: '15:42:22', dir: '→', cs: 'CS-0102', action: 'RemoteStartTransaction', status: 'ok', ms: 28, extra: 'txId: 42891' },
  { time: '15:42:18', dir: '←', cs: 'CS-0101', action: 'Heartbeat', status: 'ok', ms: 3 },
  { time: '15:42:10', dir: '←', cs: 'CS-0104', action: 'StatusNotification', status: 'warn', ms: 12, extra: 'Connector 1 → Faulted · ErrorCode: ConnectorLockFailure' },
  { time: '15:41:55', dir: '←', cs: 'CS-0103', action: 'MeterValues', status: 'ok', ms: 8, extra: '38.4 kWh · 148.2 kW' },
  { time: '15:41:40', dir: '←', cs: 'CS-0101', action: 'Heartbeat', status: 'ok', ms: 4 },
  { time: '15:41:20', dir: '←', cs: 'CS-0105', action: 'Heartbeat', status: 'err', ms: 0, extra: 'Timeout — CS недоступен' },
  { time: '15:40:48', dir: '→', cs: 'CS-0106', action: 'ChangeAvailability', status: 'ok', ms: 44, extra: 'Operative' },
  { time: '15:40:30', dir: '←', cs: 'CS-0103', action: 'StopTransaction', status: 'ok', ms: 14, extra: 'txId: 42890 · 38.4 kWh' },
];

function IntegrationPage() {
  const [tab, setTab] = useState<'ocpp' | 'ocpi' | 'webhooks'>('ocpp');
  const [selectedCs, setSelectedCs] = useState<typeof ocppChargers[0] | null>(null);
  const [cmdResult, setCmdResult] = useState<string | null>(null);
  const [cmdRunning, setCmdRunning] = useState(false);
  const [logLines, setLogLines] = useState(ocppLog);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState('');
  const [liveLog, setLiveLog] = useState(true);

  const copy = (k: string, v: string) => {
    navigator.clipboard?.writeText(v).catch(() => {});
    setCopied(k);
    setTimeout(() => setCopied(''), 1500);
  };

  useEffect(() => {
    if (!liveLog) return;
    const t = setInterval(() => {
      const templates = [
        { dir: '←', action: 'Heartbeat', status: 'ok', ms: 3 + Math.floor(Math.random() * 5) },
        { dir: '←', action: 'MeterValues', status: 'ok', ms: 6 + Math.floor(Math.random() * 10), extra: `${(10 + Math.random() * 40).toFixed(1)} kWh · ${(100 + Math.random() * 50).toFixed(1)} kW` },
        { dir: '←', action: 'StatusNotification', status: 'ok', ms: 5, extra: 'Connector 1 → Available' },
      ];
      const tmpl = templates[Math.floor(Math.random() * templates.length)];
      const cs = ocppChargers[Math.floor(Math.random() * ocppChargers.length)];
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLogLines(prev => [{ ...tmpl, time, cs: cs.id }, ...prev.slice(0, 29)]);
    }, 3500);
    return () => clearInterval(t);
  }, [liveLog]);

  const runCmd = (cmd: string) => {
    setCmdRunning(true);
    setCmdResult(null);
    setTimeout(() => {
      const results: Record<string, string> = {
        reset_soft: `[${new Date().toISOString()}] RemoteReset(Soft) → ${selectedCs?.id}\nStatus: Accepted\nЗарядная станция перезагрузится после завершения активных сессий.`,
        reset_hard: `[${new Date().toISOString()}] RemoteReset(Hard) → ${selectedCs?.id}\nStatus: Accepted\nЗарядная станция немедленно перезагружена.`,
        unlock: `[${new Date().toISOString()}] UnlockConnector(1) → ${selectedCs?.id}\nStatus: Unlocked`,
        avail_on: `[${new Date().toISOString()}] ChangeAvailability(Operative) → ${selectedCs?.id}\nStatus: Accepted`,
        avail_off: `[${new Date().toISOString()}] ChangeAvailability(Inoperative) → ${selectedCs?.id}\nStatus: Accepted`,
        clear_cache: `[${new Date().toISOString()}] ClearCache → ${selectedCs?.id}\nStatus: Accepted`,
      };
      setCmdRunning(false);
      setCmdResult(results[cmd] || 'OK');
    }, 800 + Math.random() * 600);
  };

  const csStatus: Record<string, { bg: string; dot: string; text: string }> = {
    Available: { bg: 'bg-green-50', dot: 'bg-green-500', text: 'text-green-700' },
    Occupied: { bg: 'bg-sky-50', dot: 'bg-sky-500', text: 'text-sky-700' },
    Faulted: { bg: 'bg-red-50', dot: 'bg-red-500', text: 'text-red-700' },
    Unavailable: { bg: 'bg-slate-100', dot: 'bg-slate-400', text: 'text-slate-600' },
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="px-6 pt-5 pb-0 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-900">Интеграция</h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-green-600 font-medium">124 CS подключено</span>
          </div>
        </div>
        <div className="flex gap-1">
          {[
            { id: 'ocpp', label: 'OCPP 2.0.1 Live Monitor' },
            { id: 'ocpi', label: 'OCPI 2.3.0' },
            { id: 'webhooks', label: 'Webhooks' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t.id ? 'bg-white border border-b-white border-slate-200 text-slate-900 -mb-px z-10' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* OCPP Tab */}
      {tab === 'ocpp' && (
        <div className="flex-1 overflow-hidden flex">
          {/* CS List */}
          <div className="w-72 border-r border-slate-100 overflow-y-auto shrink-0">
            <div className="p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-400 tracking-widest px-2 mb-2">CHARGE POINTS</p>
              {ocppChargers.map(cs => {
                const s = csStatus[cs.status] || csStatus.Unavailable;
                return (
                  <button key={cs.id} onClick={() => setSelectedCs(cs)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors border ${selectedCs?.id === cs.id ? 'border-sky-200 bg-sky-50' : 'border-transparent hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700 font-mono">{cs.id}</span>
                      <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${cs.status === 'Available' ? 'animate-pulse' : ''}`} />
                        {cs.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{cs.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>HB: {cs.lastHb}</span>
                      <span>{cs.sessions24h} сессий/24ч</span>
                      {cs.errors24h > 0 && <span className="text-red-500">⚠ {cs.errors24h} ошибки</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail / Command panel */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {selectedCs ? (
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm font-bold text-slate-700">{selectedCs.id}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${csStatus[selectedCs.status]?.bg} ${csStatus[selectedCs.status]?.text}`}>{selectedCs.status}</span>
                    </div>
                    <p className="text-slate-500 text-sm">{selectedCs.name}</p>
                  </div>
                  <button onClick={() => setSelectedCs(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Вендор', value: selectedCs.vendor },
                    { label: 'Модель', value: selectedCs.model },
                    { label: 'FW версия', value: selectedCs.fw },
                    { label: 'IP адрес', value: selectedCs.ip },
                    { label: 'Коннекторов', value: String(selectedCs.connectors) },
                    { label: 'Сессий (24ч)', value: String(selectedCs.sessions24h) },
                  ].map(r => (
                    <div key={r.label} className="bg-slate-50 rounded-xl p-2.5">
                      <p className="text-[10px] text-slate-400 mb-0.5">{r.label}</p>
                      <p className="text-xs font-semibold text-slate-700 font-mono">{r.value}</p>
                    </div>
                  ))}
                </div>

                {/* OCPP Commands */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-600">OCPP КОМАНДЫ</p>
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-2">
                    {[
                      { id: 'reset_soft', label: 'Reset Soft', icon: '🔄', color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
                      { id: 'reset_hard', label: 'Reset Hard', icon: '⚡', color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' },
                      { id: 'unlock', label: 'Unlock Conn.', icon: '🔓', color: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100' },
                      { id: 'avail_on', label: 'Set Operative', icon: '✅', color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
                      { id: 'avail_off', label: 'Set Inoperative', icon: '🚫', color: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' },
                      { id: 'clear_cache', label: 'Clear Cache', icon: '🗑️', color: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100' },
                    ].map(cmd => (
                      <button key={cmd.id} onClick={() => runCmd(cmd.id)} disabled={cmdRunning}
                        className={`border rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 ${cmd.color}`}>
                        <span>{cmd.icon}</span>{cmd.label}
                      </button>
                    ))}
                  </div>
                  {cmdRunning && (
                    <div className="px-4 pb-3 flex items-center gap-2 text-xs text-slate-500">
                      <RefreshCw size={11} className="animate-spin" />Отправка команды...
                    </div>
                  )}
                  {cmdResult && (
                    <div className="px-4 pb-4">
                      <pre className="bg-slate-900 text-green-300 rounded-xl p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">{cmdResult}</pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Выберите зарядную станцию для управления
              </div>
            )}

            {/* Live log */}
            <div className="border-t border-slate-100 bg-slate-950 flex-1 min-h-48 overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal size={13} className="text-slate-400" />
                  <span className="text-xs font-medium text-slate-300">OCPP Live Log</span>
                  {liveLog && <span className="flex items-center gap-1 text-[10px] text-green-400"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />LIVE</span>}
                </div>
                <button onClick={() => setLiveLog(l => !l)}
                  className={`text-[11px] px-2 py-1 rounded transition-colors ${liveLog ? 'bg-slate-800 text-slate-300' : 'bg-slate-900 text-slate-500'}`}>
                  {liveLog ? 'Пауза' : 'Запустить'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px]">
                {logLines.map((log, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-slate-600 shrink-0">{log.time}</span>
                    <span className={`shrink-0 w-3 ${log.dir === '→' ? 'text-sky-400' : 'text-slate-500'}`}>{log.dir}</span>
                    <span className="text-slate-500 shrink-0 w-16">{log.cs}</span>
                    <span className={`shrink-0 ${log.status === 'err' ? 'text-red-400' : log.status === 'warn' ? 'text-amber-400' : 'text-green-300'}`}>{log.action}</span>
                    {log.ms > 0 && <span className="text-slate-600">{log.ms}ms</span>}
                    {log.extra && <span className="text-slate-500">{log.extra}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OCPI Tab */}
      {tab === 'ocpi' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">ONE CHARGE Hub</p>
                  <p className="text-xs text-slate-400">OCPI 2.3.0 · CPO роль</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Подключено
                </span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Endpoint', value: 'ocpi.onecharge.uz/2.3.0', mono: true },
                  { label: 'Роль', value: 'CPO (Charge Point Operator)' },
                  { label: 'Локации синхр.', value: '47 / 47' },
                  { label: 'EVSE синхр.', value: '124 / 124' },
                  { label: 'Тарифы синхр.', value: '8 / 8' },
                  { label: 'CDR (сутки)', value: '284', ok: true },
                  { label: 'Последняя синхр.', value: '2 мин назад' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{r.label}</span>
                    <span className={`font-medium ${r.mono ? 'font-mono text-xs' : ''} text-slate-700`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500">РОУМИНГ ПАРТНЁРЫ</p>
              {[
                { name: 'eMSP Uzbekistan', role: 'eMSP', tokens: 8820, status: 'Active', color: 'green' },
                { name: 'Humo Mobility', role: 'eMSP', tokens: 3210, status: 'Active', color: 'green' },
                { name: 'Kazakhstan EV Net', role: 'CPO + eMSP', tokens: 442, status: 'Active', color: 'green' },
                { name: 'Tajikistan Grid', role: 'CPO', tokens: 0, status: 'Pending', color: 'amber' },
              ].map(p => (
                <div key={p.name} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${p.color === 'green' ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.role} · {p.tokens.toLocaleString()} токенов</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${p.color === 'green' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {tab === 'webhooks' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Webhook конфигурация</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">ENDPOINT URL</label>
                <div className="flex gap-2">
                  <input defaultValue="https://erp.mycompany.uz/hooks/onecharge"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 font-mono outline-none focus:border-sky-400" />
                  <button className="bg-sky-500 hover:bg-sky-400 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors">Сохранить</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">SIGNING SECRET</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-400 flex items-center gap-2">
                    <span>{showKey ? 'whsec_k8f2mP9xNq4rT7vA3bL6jE1' : '••••••••••••••••••••••••'}</span>
                  </div>
                  <button onClick={() => setShowKey(k => !k)} className="text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl p-2">
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button onClick={() => copy('sec', 'whsec_k8f2mP9xNq4rT7vA3bL6jE1')} className={`border border-slate-200 rounded-xl p-2 transition-colors ${copied === 'sec' ? 'text-green-500' : 'text-slate-400 hover:text-slate-600'}`}>
                    {copied === 'sec' ? <CheckCircle size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-2">ПОДПИСКИ НА СОБЫТИЯ</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { event: 'session.started', on: true },
                    { event: 'session.stopped', on: true },
                    { event: 'payment.success', on: true },
                    { event: 'payment.failed', on: true },
                    { event: 'evse.status_changed', on: false },
                    { event: 'cdr.created', on: true },
                    { event: 'location.offline', on: true },
                    { event: 'session.updated', on: false },
                  ].map(e => (
                    <label key={e.event} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${e.on ? 'bg-sky-500 border-sky-500' : 'border-slate-300'}`}>
                        {e.on && <CheckCircle size={10} className="text-white" />}
                      </div>
                      <span className="text-xs font-mono text-slate-600">{e.event}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Последние доставки</p>
              <span className="text-xs text-green-600 font-medium">98.7% success rate</span>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                { time: '15:42:35', event: 'session.stopped', status: 200, ms: 142 },
                { time: '15:42:22', event: 'payment.success', status: 200, ms: 89 },
                { time: '15:40:30', event: 'cdr.created', status: 200, ms: 203 },
                { time: '15:38:11', event: 'session.started', status: 200, ms: 61 },
                { time: '15:35:42', event: 'payment.failed', status: 500, ms: 0 },
              ].map((d, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                  <span className="text-slate-400 text-xs font-mono w-14">{d.time}</span>
                  <span className="font-mono text-xs text-slate-600 flex-1">{d.event}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${d.status === 200 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{d.status}</span>
                  <span className="text-xs text-slate-400 w-14 text-right">{d.ms > 0 ? `${d.ms}ms` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const initialTariffs = [
  { id: 'T-001', name: 'DC Fast Standard', type: 'CCS2', price: 2000, timeFrom: '00:00', timeTo: '23:59', stations: 47, active: true, parkingFee: 500, idleMin: 5 },
  { id: 'T-002', name: 'AC Standard', type: 'Type 2', price: 1200, timeFrom: '00:00', timeTo: '23:59', stations: 47, active: true, parkingFee: 0, idleMin: 10 },
  { id: 'T-003', name: 'DC Night Rate', type: 'CCS2', price: 1500, timeFrom: '23:00', timeTo: '07:00', stations: 12, active: true, parkingFee: 300, idleMin: 15 },
  { id: 'T-004', name: 'Corporate Fleet', type: 'CCS2', price: 1800, timeFrom: '06:00', timeTo: '22:00', stations: 8, active: false, parkingFee: 0, idleMin: 10 },
];

function TariffsPage() {
  const [tariffs, setTariffs] = useState(initialTariffs);
  const [editing, setEditing] = useState<typeof initialTariffs[0] | null>(null);

  const save = () => {
    if (!editing) return;
    setTariffs(prev => prev.map(t => t.id === editing.id ? editing : t));
    setEditing(null);
  };

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full relative">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Управление тарифами</h1>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600">
          + Новый тариф
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Активных тарифов', value: tariffs.filter(t => t.active).length, color: 'text-green-600' },
          { label: 'Мин. цена кВт·ч', value: `${Math.min(...tariffs.map(t => t.price)).toLocaleString()} сум`, color: 'text-sky-600' },
          { label: 'Макс. цена кВт·ч', value: `${Math.max(...tariffs.map(t => t.price)).toLocaleString()} сум`, color: 'text-slate-900' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4">
            <p className={`text-xl font-bold mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['ID', 'Название', 'Тип', 'Цена кВт·ч', 'Парковка', 'Время', 'Станций', 'Статус', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tariffs.map(t => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-sky-600 font-medium mono">{t.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{t.name}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{t.type}</td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-800 mono">{t.price.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-slate-500 mono">{t.parkingFee > 0 ? `+${t.parkingFee}/мин` : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500 mono">{t.timeFrom === '00:00' && t.timeTo === '23:59' ? '24/7' : `${t.timeFrom}–${t.timeTo}`}</td>
                <td className="px-4 py-3 text-sm text-slate-600 mono">{t.stations}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setTariffs(prev => prev.map(x => x.id === t.id ? { ...x, active: !x.active } : x))}
                    className={`text-xs px-2.5 py-1 rounded-full cursor-pointer ${t.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {t.active ? 'Активен' : 'Выкл.'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditing({ ...t })} className="text-xs text-sky-500 hover:text-sky-700 font-medium">Ред.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10 rounded-2xl">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 w-80 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Редактировать тариф</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Plus size={14} className="rotate-45 text-slate-500" /></button>
            </div>
            {[
              { label: 'Название', key: 'name' as const, type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <p className="text-xs text-slate-400 mb-1">{f.label}</p>
                <input value={editing[f.key] as string} onChange={e => setEditing({ ...editing, [f.key]: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            ))}
            <div>
              <p className="text-xs text-slate-400 mb-1">Цена кВт·ч (сум)</p>
              <input type="number" value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-300 mono" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Плата за парковку (сум/мин)</p>
              <input type="number" value={editing.parkingFee} onChange={e => setEditing({ ...editing, parkingFee: Number(e.target.value) })}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-300 mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">С</p>
                <input type="time" value={editing.timeFrom} onChange={e => setEditing({ ...editing, timeFrom: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-300 mono" />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">До</p>
                <input type="time" value={editing.timeTo} onChange={e => setEditing({ ...editing, timeTo: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-300 mono" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">Отмена</button>
              <button onClick={save} className="flex-1 py-2 bg-sky-500 text-white rounded-xl text-sm hover:bg-sky-600 font-medium">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StationDetailPage({ stationId, onBack }: { stationId: string; onBack: () => void }) {
  const s = stations.find(st => st.id === stationId) || stations[0];
  const statusColors: Record<string, string> = { available: '#22C55E', occupied: '#EF4444', unavailable: '#94A3B8', reserved: '#F59E0B' };
  const statusBgs: Record<string, string> = { available: 'bg-green-100 text-green-700', occupied: 'bg-red-100 text-red-700', unavailable: 'bg-slate-100 text-slate-500', reserved: 'bg-amber-100 text-amber-700' };
  const statusLabels: Record<string, string> = { available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно', reserved: 'Забронировано' };

  const [power, setPower] = useState(s.connectors.map(c => c.status === 'occupied' ? (c.power * 0.94 + Math.random() * 10 - 5) : 0));

  useEffect(() => {
    const t = setInterval(() => {
      setPower(s.connectors.map(c => c.status === 'occupied' ? (c.power * 0.9 + Math.random() * c.power * 0.15) : 0));
    }, 2000);
    return () => clearInterval(t);
  }, [s]);

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"><ArrowLeft size={16} /></button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{s.name}</h1>
          <p className="text-sm text-slate-500">{s.address}, {s.city}</p>
        </div>
        <span className={`ml-auto text-xs px-3 py-1 rounded-full ${statusBgs[s.status]}`}>{statusLabels[s.status]}</span>
      </div>

      {/* Photo + stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-1 rounded-2xl overflow-hidden h-36 bg-slate-100">
          <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
        </div>
        <div className="col-span-2 grid grid-cols-3 gap-3">
          {[
            { label: 'Режим работы', value: s.hours },
            { label: 'Макс. мощность', value: `${s.totalPower} кВт` },
            { label: 'Рейтинг', value: `⭐ ${s.rating} (${s.reviews})` },
            { label: 'Тип разъемов', value: [...new Set(s.connectors.map(c => c.type))].join(', ') },
            { label: 'Свободно', value: `${s.connectors.filter(c => c.status === 'available').length}/${s.connectors.length} EVSE` },
            { label: 'Услуги', value: s.amenities.join(', ') || '—' },
          ].map(r => (
            <div key={r.label} className="bg-white rounded-xl border border-slate-100 p-3">
              <p className="text-xs text-slate-400 mb-0.5">{r.label}</p>
              <p className="text-sm font-semibold text-slate-800">{r.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* EVSE Live Status */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            EVSE — реальное время
          </h3>
          <span className="text-xs text-slate-400">обновляется каждые 2 сек</span>
        </div>
        <div className="divide-y divide-slate-50">
          {s.connectors.map((c, i) => (
            <div key={c.id} className="px-5 py-4 flex items-center gap-5">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-sm font-bold text-slate-500 border border-slate-100">
                {i + 1}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{c.type}</p>
                <p className="text-xs text-slate-400">{c.id} · {c.power} кВт макс</p>
              </div>
              <div className="flex-1 mx-4">
                {c.status === 'occupied' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">Мощность</span>
                      <span className="text-sm font-bold text-sky-600 mono">{power[i]?.toFixed(1)} кВт</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full transition-all duration-700"
                        style={{ width: `${((power[i] || 0) / c.power) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="h-2 bg-slate-100 rounded-full" />
                )}
              </div>
              <div className="text-right">
                <span className={`text-xs px-2.5 py-1 rounded-full ${statusBgs[c.status]}`}>{statusLabels[c.status]}</span>
                <p className="text-xs text-slate-400 mt-1 mono">{c.price.toLocaleString()} сум/кВт·ч</p>
              </div>
              <div className="flex gap-1.5">
                <button className="px-2.5 py-1.5 text-xs bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 border border-slate-200">
                  Remote Reset
                </button>
                {c.status === 'occupied' && (
                  <button className="px-2.5 py-1.5 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 border border-red-200">
                    Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Session history for this station */}
      <div className="bg-white rounded-2xl border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Последние сессии на станции</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {adminSessions.filter(s2 => s2.station === s.name || true).slice(0, 4).map(sess => (
            <div key={sess.id} className="px-5 py-3 flex items-center gap-4 text-sm">
              <span className="text-xs text-sky-600 mono w-20">{sess.id}</span>
              <span className="text-slate-700 flex-1">{sess.user}</span>
              <span className="text-xs text-slate-400">{sess.start}</span>
              <span className="font-medium mono text-slate-800">{sess.cost}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[sess.status]}`}>{statusLabel[sess.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomersPage() {
  const customers = [
    { id: 'U-8831', name: 'Alisher T.', phone: '+998 90 123 45 67', sessions: 22, spent: 1680000, car: 'BYD Han EV', connector: 'CCS2', last: '4 сент 2026', rating: 5.0, joined: 'Янв 2024', avgKwh: 38.4, avgCost: 76400 },
    { id: 'U-4422', name: 'Nilufar K.', phone: '+998 91 234 56 78', sessions: 18, spent: 1240000, car: 'Hyundai Ioniq 6', connector: 'CCS2', last: '3 сент 2026', rating: 4.8, joined: 'Мар 2024', avgKwh: 42.1, avgCost: 68900 },
    { id: 'U-7721', name: 'Bobur M.', phone: '+998 93 345 67 89', sessions: 11, spent: 820000, car: 'Tesla Model 3', connector: 'CCS2', last: '2 сент 2026', rating: 4.5, joined: 'Май 2024', avgKwh: 44.8, avgCost: 74500 },
    { id: 'U-3301', name: 'Dilshod R.', phone: '+998 97 456 78 90', sessions: 31, spent: 2480000, car: 'Kia EV6', connector: 'CCS2', last: '4 сент 2026', rating: 4.9, joined: 'Окт 2023', avgKwh: 51.2, avgCost: 80000 },
    { id: 'U-9910', name: 'Kamola A.', phone: '+998 90 567 89 01', sessions: 7, spent: 480000, car: 'BYD Atto 3', connector: 'Type 2', last: '28 авг 2026', rating: 4.3, joined: 'Июл 2024', avgKwh: 28.6, avgCost: 68600 },
    { id: 'U-1122', name: 'Sanjar Y.', phone: '+998 99 678 90 12', sessions: 14, spent: 1020000, car: 'Hyundai Ioniq 5', connector: 'CCS2', last: '1 сент 2026', rating: 4.7, joined: 'Фев 2024', avgKwh: 46.2, avgCost: 72900 },
    { id: 'U-5544', name: 'Feruza N.', phone: '+998 91 789 01 23', sessions: 9, spent: 640000, car: 'BYD Han EV', connector: 'CCS2', last: '29 авг 2026', rating: 4.6, joined: 'Апр 2024', avgKwh: 39.8, avgCost: 71100 },
  ];

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<typeof customers[0] | null>(null);

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) || c.car.toLowerCase().includes(search.toLowerCase())
  );

  const avgRating = (customers.reduce((s, c) => s + c.rating, 0) / customers.length).toFixed(1);
  const avgCheck = Math.round(customers.reduce((s, c) => s + c.spent / c.sessions, 0) / customers.length);

  // Recent sessions per customer
  const recentSessions: Record<string, { date: string; station: string; kWh: number; cost: number }[]> = {
    'U-8831': [{ date: '4 сент', station: 'Toshkent Siti Hub', kWh: 38.4, cost: 76800 }, { date: '28 авг', station: 'Yunusobod Mall', kWh: 44.1, cost: 88200 }, { date: '22 авг', station: 'Toshkent Siti Hub', kWh: 41.0, cost: 82000 }],
    'U-3301': [{ date: '4 сент', station: 'Toshkent Siti Hub', kWh: 52.8, cost: 105600 }, { date: '2 сент', station: 'Namangan Station', kWh: 48.3, cost: 96600 }, { date: '31 авг', station: 'Toshkent Siti Hub', kWh: 55.1, cost: 110200 }],
    'U-4422': [{ date: '3 сент', station: 'Yunusobod Mall', kWh: 42.0, cost: 84000 }, { date: '26 авг', station: 'Toshkent Siti Hub', kWh: 38.8, cost: 77600 }],
    'U-7721': [{ date: '2 сент', station: 'Toshkent Siti Hub', kWh: 44.8, cost: 89600 }, { date: '20 авг', station: 'Yunusobod Mall', kWh: 50.2, cost: 100400 }],
    'U-9910': [{ date: '28 авг', station: 'Yunusobod Mall', kWh: 28.6, cost: 57200 }],
    'U-1122': [{ date: '1 сент', station: 'Toshkent Siti Hub', kWh: 46.2, cost: 92400 }, { date: '25 авг', station: 'Namangan Station', kWh: 42.0, cost: 84000 }],
    'U-5544': [{ date: '29 авг', station: 'Yunusobod Mall', kWh: 39.8, cost: 79600 }],
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Клиенты</h1>
            <p className="text-sm text-slate-500 inter">Водители ONE CHARGE, заряжавшиеся на ваших станциях</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} />CSV
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Уникальных клиентов', value: '1 284', sub: '+42 этой неделе', bg: 'bg-sky-50', ic: 'text-sky-500', icon: <Users size={14} /> },
            { label: 'Средний чек', value: `${(avgCheck / 1000).toFixed(0)}K сум`, sub: 'за сессию', bg: 'bg-emerald-50', ic: 'text-emerald-600', icon: <DollarSign size={14} /> },
            { label: 'Повторных визитов', value: '78%', sub: 'в течение месяца', bg: 'bg-violet-50', ic: 'text-violet-500', icon: <Activity size={14} /> },
            { label: 'Средний рейтинг', value: avgRating, sub: 'по отзывам клиентов', bg: 'bg-amber-50', ic: 'text-amber-500', icon: <Star size={14} /> },
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
              placeholder="Поиск по имени, телефону или авто..."
              className="flex-1 text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            <span className="text-xs text-slate-400 inter">{filtered.length} из {customers.length}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Клиент', 'Телефон', 'Авто', 'Сессии', 'Расходы', 'Последний визит', 'Рейтинг'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide inter">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(c => (
                <tr key={c.id}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  className={`cursor-pointer transition-colors ${selected?.id === c.id ? 'bg-sky-50/60' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-sky-100 rounded-xl flex items-center justify-center text-xs font-bold text-sky-600">
                        {c.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                        <p className="text-[10px] text-slate-400 mono">{c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-500 mono">{c.phone}</td>
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm text-slate-700">{c.car}</p>
                      <p className="text-[10px] text-slate-400">{c.connector}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-800 mono">{c.sessions}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 mono">{(c.spent / 1000).toFixed(0)}K сум</td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">{c.last}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} size={10} className={i <= Math.round(c.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
                      ))}
                      <span className="text-xs font-semibold text-slate-600 mono ml-1">{c.rating.toFixed(1)}</span>
                    </div>
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
              <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center text-sm font-bold text-sky-600">
                {selected.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{selected.name}</p>
                <p className="text-[10px] text-slate-400 mono">{selected.id}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div className="p-5 space-y-5">
            {/* Rating */}
            <div className="flex items-center justify-between bg-amber-50 rounded-2xl p-4">
              <div>
                <p className="text-xs text-amber-600 font-medium">Рейтинг водителя</p>
                <p className="text-3xl font-bold text-amber-700 mono">{selected.rating.toFixed(1)}</p>
              </div>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={16} className={i <= Math.round(selected.rating) ? 'text-amber-400 fill-amber-400' : 'text-amber-200 fill-amber-200'} />
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2.5">
              {[
                { label: 'Телефон', value: selected.phone },
                { label: 'Автомобиль', value: selected.car },
                { label: 'Разъем', value: selected.connector },
                { label: 'Клиент с', value: selected.joined },
                { label: 'Всего сессий', value: String(selected.sessions) },
                { label: 'Всего расходов', value: `${selected.spent.toLocaleString()} сум` },
                { label: 'Ср. кВт·ч/сессию', value: `${selected.avgKwh} кВт·ч` },
                { label: 'Ср. чек', value: `${selected.avgCost.toLocaleString()} сум` },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{r.label}</p>
                  <p className="text-sm font-semibold text-slate-800 mono">{r.value}</p>
                </div>
              ))}
            </div>

            {/* Recent sessions */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter mb-3">Последние сессии</p>
              <div className="space-y-2">
                {(recentSessions[selected.id] || []).map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-xs font-medium text-slate-700 truncate max-w-[130px]">{s.station}</p>
                      <p className="text-[10px] text-slate-400">{s.date} · {s.kWh} кВт·ч</p>
                    </div>
                    <p className="text-sm font-bold mono text-slate-900">{(s.cost / 1000).toFixed(0)}K</p>
                  </div>
                ))}
                {(recentSessions[selected.id] || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">Нет данных</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 active:scale-95 transition-all">
                <Activity size={14} />Все сессии клиента
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all">
                Отправить уведомление
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const [showKey, setShowKey] = useState(false);
  const apiKey = 'oc_live_GreenChargeUZ_k9X2mP4nQ8rL1vT7wS3eA5hY6uN0jF';
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <h1 className="text-xl font-bold text-slate-900">Настройки и API</h1>

      {/* API Keys */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Shield size={15} className="text-sky-500" />API Ключи</h3>
          <button className="flex items-center gap-1.5 text-xs text-sky-500 font-medium">
            <Plus size={12} />Новый ключ
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700">Production Key</span>
                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">live</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 flex-1 truncate">
                  {showKey ? apiKey : apiKey.slice(0, 20) + '•'.repeat(20)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Создан: 15 мар 2024 · Использований: 841 293</p>
            </div>
            <button onClick={() => setShowKey(v => !v)} className="p-2 text-slate-400 hover:text-slate-600">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => copy(apiKey)} className={`p-2 rounded-lg transition-colors ${copied ? 'text-green-500' : 'text-slate-400 hover:text-slate-600'}`}>
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700">Sandbox Key</span>
                <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">test</span>
              </div>
              <span className="text-xs font-mono text-slate-400">oc_test_GreenChargeUZ_sandbox_••••••••••</span>
            </div>
            <button className="p-2 text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Globe size={15} className="text-sky-500" />Webhooks</h3>
          <button className="flex items-center gap-1.5 text-xs text-sky-500 font-medium"><Plus size={12} />Добавить</button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { url: 'https://api.greencharge.uz/webhooks/sessions', events: ['session.start', 'session.stop', 'session.fail'], active: true },
            { url: 'https://api.greencharge.uz/webhooks/payments', events: ['payment.success', 'payment.failed'], active: true },
          ].map((wh, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800 mono text-xs mb-1">{wh.url}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {wh.events.map(e => (
                    <span key={e} className="text-xs px-2 py-0.5 bg-sky-50 text-sky-600 rounded-lg border border-sky-100">{e}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-green-600">Активен</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OCPI Credentials */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Lock size={15} className="text-sky-500" />OCPI Credentials</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'OCPI URL', value: 'https://ocpi.onecharge.uz/ocpi/2.3' },
            { label: 'Token A (ONE CHARGE)', value: 'eyJhbGc...••••••••' },
            { label: 'Token B (GreenCharge)', value: 'Bearer oc_ocpi_gc_••••' },
            { label: 'Версия', value: 'OCPI 2.3.0' },
          ].map(row => (
            <div key={row.label} className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">{row.label}</p>
              <p className="text-sm font-medium text-slate-800 mono text-xs">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Company Info */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Реквизиты компании</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Название', value: 'GreenCharge UZ LLC' },
            { label: 'ИНН', value: '312 847 120' },
            { label: 'Email', value: 'tech@greencharge.uz' },
            { label: 'IBAN', value: 'UZ21 0080 8000 0000 0001 2345 67' },
            { label: 'Банк', value: 'Kapitalbank' },
            { label: 'Settlement', value: 'D+2 · SWIFT' },
          ].map(row => (
            <div key={row.label}>
              <p className="text-xs text-slate-400">{row.label}</p>
              <p className="text-sm font-medium text-slate-800">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketText, setTicketText] = useState('');

  const faqs = [
    { q: 'Как добавить новую зарядную станцию?', a: 'Перейдите в раздел «Станции» → кнопка «+ Добавить станцию». Заполните адрес, координаты, тип разъёмов и мощность. После проверки модератором станция появится на карте ONE CHARGE в течение 24 часов.' },
    { q: 'Как настроить тарифы на зарядку?', a: 'В разделе «Тарифы» нажмите «Создать тариф». Укажите цену за кВт·ч, возможные ночные/дневные тарифы и тарифы для подписчиков ONE CHARGE+. Изменения применяются немедленно.' },
    { q: 'Что значит статус EVSE «Недоступно»?', a: 'Статус «Недоступно» означает, что коннектор не отвечает по OCPP более 5 минут. Возможные причины: отключение питания, сбой сети, ошибка прошивки. Рекомендуем провести физический осмотр станции.' },
    { q: 'Когда происходит Settlement (выплата)?', a: 'Выплата происходит на D+2 от даты транзакции. Комиссия ONE CHARGE составляет 2.5%. Средства поступают на указанный IBAN в рабочие дни. Детали в разделе «Финансы → Settlement».' },
    { q: 'Как подключить OCPI к другой сети?', a: 'В разделе «Интеграция» выберите «OCPI Hub». Запросите bilateral agreement с партнёром. После подтверждения администратором ONE CHARGE ваши локации появятся в роуминговой сети.' },
    { q: 'Как работает Fraud Detection?', a: 'Платформа ONE CHARGE автоматически анализирует каждую транзакцию. Подозрительные сессии (аномальная мощность, повторные ошибки авторизации) блокируются и отправляются на ручную проверку.' },
  ];

  const contacts = [
    { icon: '📧', label: 'Email поддержки', value: 'operator@onecharge.uz', sub: 'Ответ в течение 2 часов' },
    { icon: '📱', label: 'Телефон', value: '+998 71 200-00-01', sub: 'Пн–Пт 9:00–18:00' },
    { icon: '💬', label: 'Telegram', value: '@onecharge_support', sub: 'Онлайн 24/7' },
    { icon: '📖', label: 'Документация', value: 'docs.onecharge.uz', sub: 'API, OCPI, вебхуки' },
  ];

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Помощь и поддержка</h1>
          <p className="text-sm text-slate-400 inter mt-0.5">Документация, FAQ и контакты команды ONE CHARGE</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
          <span className="text-xs font-semibold text-emerald-700">Поддержка онлайн</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: '📖', label: 'Документация', sub: 'API, OCPI, руководства', color: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
          { icon: '🎓', label: 'Обучение', sub: 'Видеоуроки и вебинары', color: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
          { icon: '🐛', label: 'Репорт бага', sub: 'Сообщить о проблеме', color: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
          { icon: '💡', label: 'Идеи', sub: 'Предложить улучшение', color: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
        ].map(c => (
          <button key={c.label} className="rounded-2xl p-4 text-left hover:scale-[1.02] active:scale-98 transition-all"
            style={{ background: c.color, border: `1px solid ${c.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-sm font-bold" style={{ color: c.text }}>{c.label}</p>
            <p className="text-xs mt-0.5" style={{ color: c.text + 'aa' }}>{c.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* FAQ */}
        <div className="col-span-3 bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-sm font-bold text-slate-800">Частые вопросы</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {faqs.map((f, i) => (
              <div key={i}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors text-left">
                  <p className="text-sm font-medium text-slate-800">{f.q}</p>
                  <span className="text-slate-400 text-lg shrink-0 transition-transform" style={{ transform: openFaq === i ? 'rotate(45deg)' : '' }}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4" style={{ animation: 'enter-up 0.2s ease both' }}>
                    <p className="text-sm text-slate-500 leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-4">
          {/* Contacts */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Контакты</h3>
            </div>
            <div className="p-4 space-y-3">
              {contacts.map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <span className="text-lg shrink-0">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{c.label}</p>
                    <p className="text-sm font-semibold text-emerald-600 truncate">{c.value}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 shrink-0 text-right">{c.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ticket form */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 className="text-sm font-bold text-slate-800">Написать в поддержку</h3>
            {ticketSent ? (
              <div className="flex flex-col items-center py-4 gap-2">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <CheckCircle size={20} className="text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-emerald-700">Обращение отправлено!</p>
                <p className="text-xs text-slate-400 text-center">Ответим в течение 2 часов на email оператора</p>
                <button onClick={() => { setTicketSent(false); setTicketText(''); }} className="text-xs text-emerald-600 font-medium mt-1">Новое обращение</button>
              </div>
            ) : (
              <>
                <select className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-emerald-400 text-slate-700 bg-white">
                  <option>Технический вопрос</option>
                  <option>Проблема с выплатой</option>
                  <option>Проблема с OCPI/OCPP</option>
                  <option>Добавление станции</option>
                  <option>Другое</option>
                </select>
                <textarea value={ticketText} onChange={e => setTicketText(e.target.value)}
                  placeholder="Опишите проблему подробно..."
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-emerald-400 resize-none text-slate-700 placeholder:text-slate-300" />
                <button onClick={() => ticketText.trim() && setTicketSent(true)}
                  disabled={!ticketText.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
                  Отправить
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* System status */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">Статус платформы</h3>
          <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-1 rounded-lg">Все системы работают</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'API Gateway', status: '✅', uptime: '99.98%' },
            { label: 'OCPP Server', status: '✅', uptime: '99.95%' },
            { label: 'Payment Engine', status: '✅', uptime: '100%' },
            { label: 'OCPI Hub', status: '⚠️', uptime: '98.2%' },
            { label: 'CDR Processing', status: '✅', uptime: '99.99%' },
          ].map(s => (
            <div key={s.label} className="text-center p-3 bg-slate-50 rounded-xl">
              <p className="text-xl mb-1">{s.status}</p>
              <p className="text-xs font-semibold text-slate-700">{s.label}</p>
              <p className="text-[10px] text-slate-400 mono mt-0.5">{s.uptime}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const alertsData = [
  { id: 'A001', severity: 'critical', title: 'Станция офлайн', desc: 'GreenCharge Toshkent-1 потеряла связь с OCPP сервером', station: 'GreenCharge Toshkent-1', time: '5 мин назад', code: 'OCPP-503' },
  { id: 'A002', severity: 'critical', title: 'Ошибка зарядки', desc: 'EVSE #3 прервал сессию S-10840 с ошибкой PowerLoss', station: 'EV Hub Samarkand', time: '12 мин назад', code: 'EVSE-E07' },
  { id: 'A003', severity: 'warning', title: 'Высокое время отклика', desc: 'OCPP latency > 800ms в течение последних 15 минут', station: 'AutoCharge Fergana', time: '18 мин назад', code: 'NET-W02' },
  { id: 'A004', severity: 'warning', title: 'Температура выше нормы', desc: 'Температура EVSE #2: 68°C (норма < 60°C)', station: 'GreenCharge Toshkent-2', time: '34 мин назад', code: 'HW-W05' },
  { id: 'A005', severity: 'warning', title: 'Ошибка платежа', desc: '3 неудачных попытки оплаты подряд — возможная проблема с Humo', station: 'EV Hub Samarkand', time: '41 мин назад', code: 'PAY-W01' },
  { id: 'A006', severity: 'info', title: 'Обновление прошивки доступно', desc: 'Версия 3.1.4 доступна для 8 зарядных устройств', station: 'Все станции', time: '1 час назад', code: 'SYS-I01' },
  { id: 'A007', severity: 'info', title: 'Плановое обслуживание', desc: 'Напоминание: техобслуживание EVSE #1 запланировано на 10 сент', station: 'GreenCharge Toshkent-1', time: '2 часа назад', code: 'MAINT-I01' },
  { id: 'A008', severity: 'info', title: 'Новый оператор подключился', desc: 'Роуминг-партнёр OCPI: EV Networks RU успешно авторизован', station: 'Система', time: '3 часа назад', code: 'OCPI-I01' },
];

function AlertsPage() {
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const filtered = alertsData.filter(a => filter === 'all' || a.severity === filter);
  const active = filtered.filter(a => !resolved.has(a.id));
  const resolvedFiltered = filtered.filter(a => resolved.has(a.id));
  const criticalCount = alertsData.filter(a => a.severity === 'critical').length;
  const warningCount = alertsData.filter(a => a.severity === 'warning').length;
  const infoCount = alertsData.filter(a => a.severity === 'info').length;

  const severityIcon = (sev: string) => {
    if (sev === 'critical') return <AlertTriangle size={16} className="text-red-500" />;
    if (sev === 'warning') return <AlertCircle size={16} className="text-amber-500" />;
    return <Info size={16} className="text-sky-500" />;
  };
  const severityBorder = (sev: string) => sev === 'critical' ? 'border-l-red-500' : sev === 'warning' ? 'border-l-amber-500' : 'border-l-sky-400';
  const severityCircle = (sev: string) => sev === 'critical' ? 'bg-red-50' : sev === 'warning' ? 'bg-amber-50' : 'bg-sky-50';

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Оповещения</h1>
          <p className="text-sm text-slate-500 mt-0.5">{alertsData.length} оповещений всего</p>
        </div>
        <button
          onClick={() => setResolved(new Set(alertsData.map(a => a.id)))}
          className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Все прочитано
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            <Bell size={16} className="text-slate-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-800">{alertsData.length}</p>
            <p className="text-[11px] text-slate-500">Всего</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertTriangle size={16} className="text-red-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-red-600">{criticalCount}</p>
            <p className="text-[11px] text-slate-500">Критических</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <AlertCircle size={16} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-amber-600">{warningCount}</p>
            <p className="text-[11px] text-slate-500">Предупреждений</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
            <Info size={16} className="text-sky-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-sky-600">{infoCount}</p>
            <p className="text-[11px] text-slate-500">Информация</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'critical', 'warning', 'info'] as const).map(f => {
          const labels: Record<string, string> = { all: 'Все', critical: 'Критические', warning: 'Предупреждения', info: 'Инфо' };
          const activeColors: Record<string, string> = { all: 'bg-slate-800 text-white', critical: 'bg-red-500 text-white', warning: 'bg-amber-500 text-white', info: 'bg-sky-500 text-white' };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === f ? activeColors[f] : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {active.length === 0 && resolvedFiltered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle size={24} className="text-green-500" />
            </div>
            <p className="text-slate-600 font-medium">Нет активных оповещений</p>
            <p className="text-sm text-slate-400">Все оповещения устранены</p>
          </div>
        )}
        {active.map(alert => (
          <div key={alert.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${severityBorder(alert.severity)} p-4 flex items-start gap-3`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${severityCircle(alert.severity)}`}>
              {severityIcon(alert.severity)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm">{alert.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{alert.desc}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[11px] text-slate-400">{alert.station}</span>
                <span className="text-slate-300">·</span>
                <span className="text-[11px] text-slate-400">{alert.time}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{alert.code}</span>
              </div>
            </div>
            <button
              onClick={() => setResolved(prev => new Set([...prev, alert.id]))}
              className="text-xs text-green-600 hover:text-green-700 font-medium px-2.5 py-1 rounded-lg hover:bg-green-50 transition-colors shrink-0"
            >
              Устранить
            </button>
          </div>
        ))}
        {resolvedFiltered.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Устранённые</p>
            {resolvedFiltered.map(alert => (
              <div key={alert.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${severityBorder(alert.severity)} p-4 flex items-start gap-3 opacity-50`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${severityCircle(alert.severity)}`}>
                  {severityIcon(alert.severity)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{alert.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{alert.desc}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[11px] text-slate-400">{alert.station}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] text-slate-400">{alert.time}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{alert.code}</span>
                  </div>
                </div>
                <span className="text-xs text-green-600 font-medium flex items-center gap-1 shrink-0">
                  <CheckCircle size={12} /> Восстановлено
                </span>
              </div>
            ))}
          </div>
        )}
        {active.length === 0 && resolvedFiltered.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center gap-3 mt-2">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle size={24} className="text-green-500" />
            </div>
            <p className="text-slate-600 font-medium">Нет активных оповещений</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperatorApp({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      stations: <StationsPage />, sessions: <SessionsPage />, alerts: <AlertsPage />, tariffs: <TariffsPage />,
      finance: <FinancePage />, customers: <CustomersPage />,
      integration: <IntegrationPage />, settings: <SettingsPage />, help: <HelpPage />,
    };
    return (
      <div key={page} className="animate-fade-in h-full">
        {pages[page] ?? <DashboardPage />}
      </div>
    );
  };

  return (
    <div className="h-full flex relative" style={{ background: '#F2F4F8' }}>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-20" />}
      <Sidebar current={page} onChange={setPage} onBack={onBack} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-hidden relative">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden absolute top-3 left-3 z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600">
          <Menu size={18} />
        </button>
        {renderPage()}
      </div>
      <AIChat portalType="operator" />
    </div>
  );
}

import { useState, type ReactNode } from 'react';
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
import AdminRisk from './admin/Risk';
import AdminCdr from './admin/Cdr';
import AdminHealth from './admin/Health';
import AdminTariffs from './admin/Tariffs';
import AdminRoles from './admin/Roles';
import AdminNetworkMap from './admin/NetworkMap';
import AccountSettings, { DemoReset } from './admin/AccountSettings';
import {
  LayoutDashboard, MapPin, Users, Activity, DollarSign, BarChart2, Settings, LogOut, Zap, Shield,
  Building2, Brain, ScrollText, ClipboardCheck, Percent, UserCheck, Banknote, Tag, Menu, Inbox,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
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

export default function AdminApp({ onBack }: { onBack: () => void }) {
  // Authentication is handled by the real per-portal gate in App.tsx.
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const go = (p: string) => setPage(p as Page);
  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      map: <AdminNetworkMap />, operators: <AdminOperators onNavigate={go} />, leads: <LeadsPage />, users: <AdminUsers />,
      settlement: <AdminSettlement />, commissions: <AdminCommissions />, tariffs_global: <AdminTariffs />,
      sessions: <AdminSessions />, payments: <AdminPayments />,
      analytics: <AdminAnalytics />, ai: <AdminInsights onNavigate={go} />, fraud: <AdminRisk />,
      cdr: <AdminCdr />, audit: <AdminAudit />, roles: <AdminRoles />,
      settings: <AccountSettings portal="admin"><DemoReset /></AccountSettings>,
      system_health: <AdminHealth />,
    };
    return (
      <div key={page} className="animate-fade-in h-full">
        {pages[page] ?? <AdminOverview onNavigate={go} />}
      </div>
    );
  };

  return (
    <div className="h-full flex relative dash-surface safe-top">
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

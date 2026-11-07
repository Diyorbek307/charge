import { useState, type ReactNode } from 'react';
import AdminDriverPhotos from './admin/DriverPhotos';
import AdminPartners from './admin/Partners';
import AdminPlatform from './admin/Platform';
import AdminPromos from './admin/Promos';
import LeadsPage from './LeadsPage';
import AdminOverview from './admin/Overview';
import AdminOperators from './admin/Operators';
import AdminUsers from './admin/Users';
import AdminSessions from './admin/Sessions';
import AdminPayments from './admin/Payments';
import AdminSettlement from './admin/Settlement';
import AdminCommissions from './admin/Commissions';
import AdminAnalytics from './admin/Analytics';
import Investor from './admin/Investor';
import AdminInsights from './admin/Insights';
import AdminAudit from './admin/Audit';
import AdminRisk from './admin/Risk';
import AdminCdr from './admin/Cdr';
import AdminHealth from './admin/Health';
import AdminTariffs from './admin/Tariffs';
import AdminRoles from './admin/Roles';
import AdminNetworkMap from './admin/NetworkMap';
import AccountSettings, { DemoReset } from './admin/AccountSettings';
import { AdminSos, AdminHosts } from './admin/SosHosts';
import { AdminCredit } from './admin/Credit';
import { DirectSettlement } from './admin/DirectSettlement';
import { AdminSupport } from './admin/Support';
import AdminSearch, { SearchButton } from './admin/AdminSearch';
import {
  LayoutDashboard, MapPin, Users, Activity, DollarSign, BarChart2, Settings, LogOut, Shield,
  Building2, Brain, ScrollText, ClipboardCheck, Percent, UserCheck, Banknote, Tag, Menu, Inbox,
  Siren, Home, ScanFace, Landmark, MessageCircle, Coffee, SlidersHorizontal, Megaphone, TrendingUp,
  Camera,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAdminInbox } from '../lib/inbox';
import SidebarThemeToggle from './SidebarThemeToggle';
import AIChat from './AIChat';
import { LogoMark } from '../landing/Logo';

type Page = 'investor' | 'photos' | 'dashboard' | 'promos' | 'map' | 'sos' | 'hosts' | 'credit' | 'direct' | 'support' | 'operators' | 'leads' | 'users' | 'sessions' | 'payments' | 'settlement' | 'analytics' | 'ai' | 'fraud' | 'cdr' | 'commissions' | 'tariffs_global' | 'partners' | 'platform' | 'audit' | 'roles' | 'settings' | 'system_health';

function AdminSidebar({ current, onChange, onBack, isOpen, onClose }: { current: Page; onChange: (p: Page) => void; onBack: () => void; isOpen?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  // A red count next to every page where something waits.
  const inbox = useAdminInbox();
  const waiting = (page: string) => inbox?.items.filter(i => i.page === page && i.key !== 'alerts').reduce((n, i) => n + i.count, 0) || 0;
  const groups = [
    {
      label: t('nav.group.overview'),
      items: [
        { id: 'dashboard' as Page, label: 'Обзор', icon: <LayoutDashboard size={14} /> },
        { id: 'platform' as Page, label: 'Управление платформой', icon: <SlidersHorizontal size={14} /> },
        { id: 'promos' as Page, label: 'Акции', icon: <Megaphone size={14} /> },
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
        { id: 'sos' as Page, label: 'SOS водителей', icon: <Siren size={14} /> },
        { id: 'support' as Page, label: 'Поддержка', icon: <MessageCircle size={14} /> },
        { id: 'hosts' as Page, label: 'Частные зарядки', icon: <Home size={14} /> },
        { id: 'credit' as Page, label: 'Зарядка в долг', icon: <ScanFace size={14} /> },
        { id: 'photos' as Page, label: 'Фото от водителей', icon: <Camera size={14} /> },
      ],
    },
    {
      label: t('nav.finance'),
      items: [
        { id: 'payments' as Page, label: t('nav.payments'), icon: <DollarSign size={14} /> },
        { id: 'settlement' as Page, label: 'Расчёты', icon: <Banknote size={14} /> },
        { id: 'direct' as Page, label: 'Расчёты с сетями', icon: <Landmark size={14} /> },
        { id: 'commissions' as Page, label: t('nav.commissions'), icon: <Percent size={14} /> },
        { id: 'tariffs_global' as Page, label: t('nav.networkTariffs'), icon: <Tag size={14} /> },
        { id: 'partners' as Page, label: 'Партнёры у станций', icon: <Coffee size={14} /> },
      ],
    },
    {
      label: t('nav.group.analyticsAi'),
      items: [
        { id: 'analytics' as Page, label: t('nav.analytics'), icon: <BarChart2 size={14} /> },
        { id: 'investor' as Page, label: 'Для инвестора', icon: <TrendingUp size={14} /> },
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
    <div className={`w-[210px] flex flex-col h-full shrink-0 absolute inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#111111', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Brand */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <LogoMark size={32} />
          <div>
            <p className="text-white font-bold text-sm leading-tight"><span style={{ color: '#FFC83D' }}>V</span>oli</p>
            <p className="text-[11px] leading-none mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>Admin Control Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #4F6BFF, #2F3DB8)' }}>A</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">Super Admin</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>Voli</p>
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        </div>
        <SearchButton className="mt-2 w-full px-2.5 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-white/[0.07]" />
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
                    {!item.badge && waiting(item.id) > 0 && (
                      <span className="text-[10px] min-w-[18px] text-center px-1.5 py-0.5 rounded-full font-bold bg-red-500 text-white tabular-nums">{waiting(item.id) > 99 ? '99+' : waiting(item.id)}</span>
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

export default function AdminApp({ onBack }: { onBack: () => void }) {
  // Authentication is handled by the real per-portal gate in App.tsx.
  // A link from a notification letter (?page=leads) opens that page.
  const [page, setPage] = useState<Page>(() => {
    const p = new URLSearchParams(window.location.search).get('page');
    return p && ['leads', 'support', 'sos', 'system_health'].includes(p) ? (p as Page) : 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const go = (p: string) => setPage(p as Page);
  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      map: <AdminNetworkMap />, sos: <AdminSos />, support: <AdminSupport />, hosts: <AdminHosts />, credit: <AdminCredit />, photos: <AdminDriverPhotos />, operators: <AdminOperators onNavigate={go} />, leads: <LeadsPage />, users: <AdminUsers />,
      settlement: <AdminSettlement />, direct: <DirectSettlement portal="admin" />, commissions: <AdminCommissions />, tariffs_global: <AdminTariffs />, partners: <AdminPartners />, platform: <AdminPlatform />, promos: <AdminPromos />,
      sessions: <AdminSessions />, payments: <AdminPayments />,
      analytics: <AdminAnalytics />, investor: <Investor />, ai: <AdminInsights onNavigate={go} />, fraud: <AdminRisk />,
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
        <SearchButton label={false} className="md:hidden absolute top-3 left-[60px] z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600" />
        <AdminSearch onOpen={go} />
        {renderPage()}
      </div>
      <AIChat portalType="admin" hideButton={page === 'support'} />
    </div>
  );
}

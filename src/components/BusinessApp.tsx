import { useState } from 'react';
import { LayoutDashboard, Car, Users, DollarSign, Settings, LogOut, Building2, Menu, Wallet } from 'lucide-react';
import { useSync } from '../lib/sync';
import { useI18n } from '../lib/i18n';
import { plural } from '../lib/analytics';
import SidebarThemeToggle from './SidebarThemeToggle';
import AIChat from './AIChat';
import BusinessDashboard from './business/Dashboard';
import BusinessFleet from './business/Fleet';
import BusinessEmployees from './business/Employees';
import BusinessExpenses from './business/Expenses';
import BusinessBilling from './business/Billing';
import BusinessSettings from './business/Settings';

type Page = 'dashboard' | 'fleet' | 'employees' | 'expenses' | 'billing' | 'settings';

function Sidebar({ current, onChange, onBack, isOpen, onClose }: { current: Page; onChange: (p: Page) => void; onBack: () => void; isOpen?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  const { state, sessions } = useSync();
  const me = sessions.business;
  const cars = state?.vehicles.length ?? 0;
  const people = state?.employees.length ?? 0;
  const nearLimit = (state?.employees ?? []).filter(e => e.limit && e.spent / e.limit >= 0.8).length;
  const groups = [
    {
      label: t('nav.group.overview'),
      items: [
        { id: 'dashboard' as Page, label: t('nav.dashboard'), icon: <LayoutDashboard size={14} /> },
        { id: 'fleet' as Page, label: t('nav.fleet'), icon: <Car size={14} /> },
        { id: 'employees' as Page, label: t('nav.employees'), icon: <Users size={14} />, badge: nearLimit },
      ],
    },
    {
      label: t('nav.group.financeReports'),
      items: [
        { id: 'expenses' as Page, label: t('nav.expenses'), icon: <DollarSign size={14} /> },
        { id: 'billing' as Page, label: 'Счёт и оплата', icon: <Wallet size={14} /> },
        { id: 'settings' as Page, label: t('nav.settings'), icon: <Settings size={14} /> },
      ],
    },
  ];

  return (
    <div className={`w-[210px] flex flex-col h-full shrink-0 absolute inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#0C0A1E', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)' }}>
            <Building2 size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ONE CHARGE</p>
            <p className="text-[11px] leading-none mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>Business Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #2F3DB8, #4F6BFF)' }}>{(me?.org ?? 'B').slice(0, 1)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{me?.org ?? 'Автопарк'}</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>{`${cars} ${plural(cars, ['машина', 'машины', 'машин'])} · ${people} ${plural(people, ['сотрудник', 'сотрудника', 'сотрудников'])}`}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-4">
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.3)' }}>{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = current === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onChange(item.id); onClose?.(); }}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] transition-colors relative ${active ? 'font-semibold' : 'hover:bg-white/5 hover:text-white/85'}`}
                    style={active ? { background: 'rgba(79,107,255,0.18)', color: '#A5B4FC' } : { color: 'rgba(148,163,184,0.65)' }}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-400" />}
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    {'badge' in item && item.badge ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{item.badge}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onBack} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors hover:bg-white/5 hover:text-white/70" style={{ color: 'rgba(148,163,184,0.45)' }}>
          <LogOut size={14} />{t('nav.signOutPortal')}
        </button>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

export default function BusinessApp({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const go = (p: string) => setPage(p as Page);

  const content = {
    dashboard: <BusinessDashboard onNavigate={go} />,
    fleet: <BusinessFleet />,
    employees: <BusinessEmployees />,
    expenses: <BusinessExpenses />,
    billing: <BusinessBilling />,
    settings: <BusinessSettings />,
  }[page];

  return (
    <div className="h-full flex relative dash-surface safe-top">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-20" />}
      <Sidebar current={page} onChange={setPage} onBack={onBack} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-hidden relative">
        <button onClick={() => setSidebarOpen(true)} aria-label="Открыть меню" className="md:hidden absolute top-3 left-3 z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600">
          <Menu size={18} />
        </button>
        <div key={page} className="animate-fade-in h-full">{content}</div>
      </div>
      <AIChat portalType="business" />
    </div>
  );
}

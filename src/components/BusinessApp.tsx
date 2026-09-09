import { useState, type ReactNode } from 'react';
import { jsPDF } from 'jspdf';
import {
  LayoutDashboard, Car, Users, DollarSign, BarChart2, Settings, LogOut,
  Zap, ArrowUp, ArrowDown, Download, Plus, X, ChevronRight, Activity,
  Building2, MapPin, FileText, Bell, CheckCircle, AlertTriangle,
  Leaf, TrendingUp, Clock, Target, Fuel, Star, Navigation, Menu
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, ComposedChart, Cell
} from 'recharts';
import { revenueData } from '../data/mockData';
import { useLiveVehicles, useLiveEmployees, useLiveStats } from '../lib/live';
import { useSync } from '../lib/sync';
import { useI18n } from '../lib/i18n';
import SidebarThemeToggle from './SidebarThemeToggle';
import AnimatedCounter from './AnimatedCounter';
import AIChat from './AIChat';

type Page = 'dashboard' | 'fleet' | 'employees' | 'expenses' | 'reports' | 'settings';

const staticFleetVehicles = [
  { id: 'VH-001', model: 'BYD Han EV', plate: '01 A 111 AA', driver: 'Alisher T.', battery: 82, status: 'available', charged: 18, cost: 1420000 },
  { id: 'VH-002', model: 'Hyundai Ioniq 6', plate: '01 B 222 BB', driver: 'Nilufar K.', battery: 45, status: 'charging', charged: 31, cost: 2180000 },
  { id: 'VH-003', model: 'Tesla Model 3', plate: '01 C 333 CC', driver: 'Bobur M.', battery: 91, status: 'driving', charged: 24, cost: 1840000 },
  { id: 'VH-004', model: 'Kia EV6', plate: '01 D 444 DD', driver: 'Dilshod R.', battery: 28, status: 'low', charged: 12, cost: 890000 },
  { id: 'VH-005', model: 'BYD Atto 3', plate: '01 E 555 EE', driver: 'Kamola A.', battery: 66, status: 'available', charged: 19, cost: 1560000 },
];

const staticEmployees = [
  { id: 'emp-01', name: 'Alisher Toshmatov', dept: 'Продажи', limit: 500000, spent: 284000, sessions: 22, vehicle: 'BYD Han EV' },
  { id: 'emp-02', name: 'Nilufar Karimova', dept: 'Маркетинг', limit: 400000, spent: 391000, sessions: 28, vehicle: 'Hyundai Ioniq 6' },
  { id: 'emp-03', name: 'Bobur Mirzayev', dept: 'IT', limit: 300000, spent: 142000, sessions: 14, vehicle: 'Tesla Model 3' },
  { id: 'emp-04', name: 'Dilshod Raximov', dept: 'Логистика', limit: 600000, spent: 521000, sessions: 38, vehicle: 'Kia EV6' },
  { id: 'emp-05', name: 'Kamola Abdullayeva', dept: 'HR', limit: 250000, spent: 98000, sessions: 9, vehicle: 'BYD Atto 3' },
];

const monthlySpend = [
  { month: 'Apr', spend: 4.2, sessions: 124 },
  { month: 'May', spend: 5.8, sessions: 164 },
  { month: 'Jun', spend: 6.4, sessions: 185 },
  { month: 'Jul', spend: 7.1, sessions: 208 },
  { month: 'Aug', spend: 8.2, sessions: 241 },
  { month: 'Sep', spend: 9.4, sessions: 278 },
];

function Sidebar({ current, onChange, onBack, isOpen, onClose }: { current: Page; onChange: (p: Page) => void; onBack: () => void; isOpen?: boolean; onClose?: () => void }) {
  const { t } = useI18n();
  const groups = [
    {
      label: t('nav.group.overview'),
      items: [
        { id: 'dashboard' as Page, label: t('nav.dashboard'), icon: <LayoutDashboard size={14} /> },
        { id: 'fleet' as Page, label: t('nav.fleet'), icon: <Car size={14} /> },
        { id: 'employees' as Page, label: t('nav.employees'), icon: <Users size={14} /> },
      ],
    },
    {
      label: t('nav.group.financeReports'),
      items: [
        { id: 'expenses' as Page, label: t('nav.expenses'), icon: <DollarSign size={14} /> },
        { id: 'reports' as Page, label: t('nav.reports'), icon: <FileText size={14} /> },
        { id: 'settings' as Page, label: t('nav.settings'), icon: <Settings size={14} /> },
      ],
    },
  ];

  return (
    <div className={`w-[210px] flex flex-col h-full shrink-0 absolute inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: '#0C0A1E', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Brand */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
            <Building2 size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ONE CHARGE</p>
            <p className="text-[11px] leading-none mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>Business Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>U</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">Uzauto Motors Corp.</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>5 авто · 18 сотрудников</p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 space-y-4">
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
                      background: 'rgba(99,102,241,0.18)',
                      color: '#A5B4FC',
                      fontWeight: 600,
                    } : {
                      color: 'rgba(148,163,184,0.65)',
                    }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'; } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.65)'; } }}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-400" />}
                    {item.icon}
                    {item.label}
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
          <LogOut size={14} />{t('nav.signOutPortal')}
        </button>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

const MONTHLY_BUDGET = 14000000;
const SPENT = 9400000;

const deptBreakdown = [
  { dept: 'Логистика', spend: 3280000, pct: 35, color: '#6366F1' },
  { dept: 'Продажи', spend: 1880000, pct: 20, color: '#8B5CF6' },
  { dept: 'Маркетинг', spend: 1692000, pct: 18, color: '#A78BFA' },
  { dept: 'IT', spend: 1128000, pct: 12, color: '#818CF8' },
  { dept: 'HR', spend: 940000, pct: 10, color: '#C4B5FD' },
];

const forecastData = [
  { month: 'Апр', actual: 4.2, forecast: undefined },
  { month: 'Май', actual: 5.8, forecast: undefined },
  { month: 'Июн', actual: 6.4, forecast: undefined },
  { month: 'Июл', actual: 7.1, forecast: undefined },
  { month: 'Авг', actual: 8.2, forecast: undefined },
  { month: 'Сент', actual: 9.4, forecast: 9.4 },
  { month: 'Окт', actual: undefined, forecast: 11.2 },
  { month: 'Ноя', actual: undefined, forecast: 12.8 },
];

const topStations = [
  { name: 'Toshkent Siti Hub', sessions: 82, spend: '4.2M', type: 'DC Fast', pct: 100 },
  { name: 'Yunusobod Mall', sessions: 67, spend: '3.1M', type: 'DC Fast', pct: 82 },
  { name: 'Agrobank Biz Park', sessions: 44, spend: '1.6M', type: 'AC 22kW', pct: 54 },
  { name: 'Namangan Hub', sessions: 24, spend: '0.8M', type: 'DC 50kW', pct: 29 },
];

const activityFeed = [
  { Icon: Zap, color: '#10B981', bg: '#ECFDF5', borderColor: '#A7F3D0', time: 'сейчас', event: 'Зарядка начата', detail: 'Nilufar K. · Ioniq 6 · Yunusobod Mall' },
  { Icon: CheckCircle, color: '#6366F1', bg: '#EEF2FF', borderColor: '#C7D2FE', time: '23 мин', event: 'Зарядка завершена', detail: 'Alisher T. · BYD Han · 42 кВт·ч' },
  { Icon: AlertTriangle, color: '#F59E0B', bg: '#FFFBEB', borderColor: '#FDE68A', time: '2 ч', event: 'Лимит 87%', detail: 'Dilshod R. · 521K из 600K сум' },
  { Icon: Navigation, color: '#0EA5E9', bg: '#F0F9FF', borderColor: '#BAE6FD', time: '4 ч', event: 'Авто выехало', detail: 'Bobur M. · Tesla Model 3 · ~120 км' },
  { Icon: CheckCircle, color: '#6366F1', bg: '#EEF2FF', borderColor: '#C7D2FE', time: '5 ч', event: 'Зарядка завершена', detail: 'Kamola A. · BYD Atto 3 · 54 кВт·ч' },
];

const weeklyUtil = [
  { day: 'Пн', pct: 82 }, { day: 'Вт', pct: 76 }, { day: 'Ср', pct: 91 },
  { day: 'Чт', pct: 88 }, { day: 'Пт', pct: 74 }, { day: 'Сб', pct: 38 }, { day: 'Вс', pct: 22 },
];

function DashboardPage() {
  const liveVehicles = useLiveVehicles();
  const liveEmployees = useLiveEmployees();
  const fleetVehicles = liveVehicles.length ? liveVehicles : staticFleetVehicles;
  const employees = liveEmployees.length ? liveEmployees : staticEmployees;
  const spentPct = Math.round((SPENT / MONTHLY_BUDGET) * 100);
  const R = 52, C = 2 * Math.PI * R;
  const dashOffset = C - (spentPct / 100) * C;
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = () => {
    setPdfLoading(true);
    setTimeout(() => {
      const doc = new jsPDF();
      const now = new Date();
      const dateStr = now.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
      const fileMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('ONE CHARGE UZ — Корпоративный отчёт', 14, 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Дата: ${dateStr}`, 14, 32);
      doc.text('Uzauto Motors Corp.', 14, 38);

      doc.setDrawColor(226, 232, 240);
      doc.line(14, 43, 196, 43);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text('Сводка за месяц', 14, 52);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      const kpis = [
        ['Зарядок (сентябрь)', '278'],
        ['Расходы', '9 400 000 сум'],
        ['CO₂ сэкономлено', '24 тонны'],
        ['Сотрудников', '18'],
      ];
      kpis.forEach(([label, value], i) => {
        const y = 62 + i * 9;
        doc.text(label, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(value, 100, y);
        doc.setFont('helvetica', 'normal');
      });

      doc.line(14, 102, 196, 102);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text('Топ-3 станции', 14, 112);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      topStations.slice(0, 3).forEach((s, i) => {
        const y = 122 + i * 9;
        doc.text(`${i + 1}. ${s.name}`, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(s.spend + ' сум', 140, y);
        doc.setFont('helvetica', 'normal');
      });

      doc.line(14, 150, 196, 150);
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text('Сгенерировано платформой ONE CHARGE UZ', 14, 158);

      doc.save(`onecharge-report-${fileMonth}.pdf`);
      setPdfLoading(false);
    }, 800);
  };

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full" style={{ background: 'linear-gradient(180deg, #F8FAFF 0%, #F1F5F9 100%)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between enter-up">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Fleet Dashboard</h1>
          <p className="text-sm text-slate-400 inter mt-0.5">Uzauto Motors Corp. · сентябрь 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border" style={{ background: '#ECFDF5', borderColor: '#A7F3D0' }}>
            <div className="relative w-2 h-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 live-dot" style={{ color: '#10B981' }} />
            </div>
            <span className="text-xs font-semibold text-emerald-700">1 зарядка сейчас</span>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60"
          >
            {pdfLoading ? (
              <>
                <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Генерация…
              </>
            ) : (
              <><Download size={14} />Скачать отчёт</>
            )}
          </button>
          <button className="relative p-2 bg-white border border-slate-200 rounded-xl text-slate-500 shadow-sm hover:bg-slate-50 transition-colors">
            <Bell size={16} />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
          </button>
        </div>
      </div>

      {/* ── KPI Row (6 tiles) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          { label: 'Автомобилей', num: 5, sub: '4 активны', icon: <Car size={13} />, grad: 'linear-gradient(135deg,#EEF2FF,#E0E7FF)', ic: '#6366F1', trend: null },
          { label: 'Зарядок (сент.)', num: 278, sub: '+15% к авг.', icon: <Zap size={13} />, grad: 'linear-gradient(135deg,#F0F9FF,#DBEAFE)', ic: '#3B82F6', trend: 15 },
          { label: 'кВт·ч всего', num: 1842, sub: 'за сентябрь', icon: <Activity size={13} />, grad: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', ic: '#22C55E', trend: 8 },
          { label: 'Бюджет исп.', num: spentPct, sub: `${(SPENT/1000000).toFixed(1)}M из 14M сум`, icon: <Target size={13} />, grad: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', ic: '#F59E0B', trend: null },
          { label: 'CO₂ сэкономлено', num: 24, sub: 'тонн × 100г CO₂/км', icon: <Leaf size={13} />, grad: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', ic: '#10B981', trend: 22 },
          { label: 'Сотрудников', num: 18, sub: '2 у лимита', icon: <Users size={13} />, grad: 'linear-gradient(135deg,#FDF4FF,#FAE8FF)', ic: '#A855F7', trend: null },
        ] as const).map((k, i) => (
          <div key={k.label} className="rounded-2xl p-4 enter-up"
            style={{ background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.9)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: `${i * 55}ms` }}>
            <div className="flex items-start justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider inter leading-tight">{k.label}</p>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: k.grad, color: k.ic }}>{k.icon}</div>
            </div>
            <p className="text-[26px] font-bold leading-none tracking-tight mb-1 mono num-pop" style={{ color: '#0F172A', animationDelay: `${i * 55 + 80}ms` }}>
              <AnimatedCounter value={k.num} duration={1100} suffix={k.label === 'Бюджет исп.' ? '%' : ''} />
            </p>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400 inter leading-tight">{k.sub}</p>
              {k.trend !== null && (
                <div className="flex items-center gap-0.5" style={{ color: '#10B981' }}>
                  <TrendingUp size={9} />
                  <span className="text-[9px] font-semibold">{k.trend}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Budget ring + Dept breakdown + Activity feed ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Budget gauge */}
        <div className="bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Бюджет месяца</h3>
            <span className="text-[10px] px-2 py-1 rounded-lg font-semibold" style={{ background: '#FFFBEB', color: '#D97706' }}>Сентябрь</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="budgetGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#A78BFA" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r={R} fill="none" stroke="#F1F5F9" strokeWidth="10" />
                <circle cx="60" cy="60" r={R} fill="none" stroke="url(#budgetGrad)" strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
                />
                <text x="60" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill="#0F172A" fontFamily="JetBrains Mono">{spentPct}%</text>
                <text x="60" y="72" textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="Inter">использовано</text>
              </svg>
            </div>
            <div className="flex-1 space-y-3">
              {[
                { label: 'Потрачено', value: '9.4M сум', color: '#6366F1', w: `${spentPct}%` },
                { label: 'Остаток', value: '4.6M сум', color: '#E2E8F0', w: `${100 - spentPct}%` },
                { label: 'Прогноз', value: '11.2M сум', color: '#F59E0B', w: '80%' },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[11px] text-slate-400 inter">{r.label}</p>
                    <p className="text-[11px] font-semibold text-slate-700 mono">{r.value}</p>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color, transition: 'width 1s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
            <p className="text-[11px] text-slate-400 inter">Осталось дней: <strong className="text-slate-700">11</strong></p>
            <p className="text-[11px] text-slate-400 inter">Бюджет: <strong className="text-indigo-600">14M сум</strong></p>
          </div>
        </div>

        {/* Department breakdown */}
        <div className="bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '175ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">По отделам</h3>
            <span className="text-[10px] text-slate-400 inter">сум</span>
          </div>
          <div className="space-y-2.5">
            {deptBreakdown.map(d => (
              <div key={d.dept}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <p className="text-[12px] font-medium text-slate-700">{d.dept}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-slate-400 mono">{(d.spend / 1000000).toFixed(2)}M</p>
                    <p className="text-[11px] font-bold mono" style={{ color: d.color }}>{d.pct}%</p>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50">
            <p className="text-[11px] text-slate-400 inter">Наибольший рост: <strong className="text-indigo-600">Логистика +18%</strong></p>
          </div>
        </div>

        {/* Activity feed */}
        <div className="bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '230ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Активность</h3>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full live-dot" style={{ color: '#10B981' }} />
              <span className="text-[10px] text-emerald-600 font-semibold inter">Live</span>
            </div>
          </div>
          <div className="space-y-3">
            {activityFeed.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: a.bg, border: `1px solid ${a.borderColor}` }}>
                  <a.Icon size={12} style={{ color: a.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[12px] font-semibold text-slate-800 truncate">{a.event}</p>
                    <p className="text-[10px] text-slate-400 inter shrink-0">{a.time}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 inter truncate mt-0.5">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Forecast chart + Fleet live + CO2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

        {/* Spend + forecast chart */}
        <div className="col-span-2 bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '80ms' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Расходы + прогноз</h3>
              <p className="text-[10px] text-slate-400 inter mt-0.5">факт / прогноз AI (M сум)</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-400 inter">
              <div className="flex items-center gap-1"><div className="w-6 h-0.5 bg-indigo-500 rounded" /><span>Факт</span></div>
              <div className="flex items-center gap-1"><div className="w-6 h-0.5 rounded" style={{ background: '#F59E0B', borderTop: '2px dashed #F59E0B' }} /><span>Прогноз</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart data={forecastData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: 11 }} formatter={(v: unknown) => `${(v as number)}M сум`} />
              <Area type="monotone" dataKey="actual" stroke="#6366F1" fill="url(#actualGrad)" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Fleet utilization heatmap */}
        <div className="col-span-1 bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '135ms' }}>
          <h3 className="text-sm font-bold text-slate-800 mb-1">Использование</h3>
          <p className="text-[10px] text-slate-400 inter mb-4">% от парка по дням</p>
          <div className="space-y-1.5">
            {weeklyUtil.map(d => (
              <div key={d.day} className="flex items-center gap-2">
                <p className="text-[10px] text-slate-400 w-5 text-right font-medium">{d.day}</p>
                <div className="flex-1 h-5 bg-slate-100 rounded-lg overflow-hidden">
                  <div className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
                    style={{ width: `${d.pct}%`, background: d.pct > 80 ? 'linear-gradient(90deg,#6366F1,#818CF8)' : d.pct > 50 ? 'linear-gradient(90deg,#8B5CF6,#A78BFA)' : 'linear-gradient(90deg,#C4B5FD,#DDD6FE)' }}>
                    <span className="text-[9px] text-white font-semibold leading-none">{d.pct}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-50">
            <p className="text-[10px] text-slate-400 inter">Средняя: <strong className="text-indigo-600">67%</strong></p>
          </div>
        </div>

        {/* CO2 savings card */}
        <div className="col-span-1 rounded-2xl p-5 enter-up relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #059669, #10B981, #34D399)', boxShadow: '0 8px 24px rgba(16,185,129,0.35)', animationDelay: '190ms' }}>
          <div className="relative z-10">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Leaf size={16} className="text-white" />
            </div>
            <p className="text-[11px] font-semibold text-white/70 uppercase tracking-wide inter mb-1">CO₂ сэкономлено</p>
            <p className="text-[32px] font-bold text-white mono leading-none">2.4<span className="text-lg ml-1 font-semibold opacity-80">т</span></p>
            <p className="text-[11px] text-white/70 mt-1 inter">vs бензиновый парк</p>
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/60">Топлива не сожжено</p>
                <p className="text-[10px] font-bold text-white mono">680 л</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/60">Деревьев эквивалент</p>
                <p className="text-[10px] font-bold text-white mono">118 🌳</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full bg-white/8" />
        </div>

        {/* Top stations */}
        <div className="col-span-1 bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '245ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Топ станции</h3>
            <MapPin size={13} className="text-slate-300" />
          </div>
          <div className="space-y-3">
            {topStations.map((s, i) => (
              <div key={s.name}>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold text-slate-300 mono w-3">#{i + 1}</span>
                    <p className="text-[11px] font-semibold text-slate-700 truncate">{s.name}</p>
                  </div>
                  <p className="text-[10px] font-bold text-indigo-600 mono shrink-0">{s.spend}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: 'linear-gradient(90deg,#6366F1,#A78BFA)' }} />
                  </div>
                  <span className="text-[9px] text-slate-400 mono w-6">{s.sessions}</span>
                  <span className="text-[9px] text-slate-300">{s.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Fleet status + Top spenders ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Fleet status mini */}
        <div className="bg-white rounded-2xl p-5 enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '80ms' }}>
          <h3 className="text-sm font-bold text-slate-800 mb-4">Состояние парка</h3>
          <div className="space-y-2.5">
            {fleetVehicles.map(v => {
              const bc = v.battery < 30 ? '#EF4444' : v.battery < 60 ? '#F59E0B' : '#22C55E';
              const stBg: Record<string, string> = { available: '#F0FDF4', charging: '#F0F9FF', driving: '#F5F3FF', low: '#FEF2F2' };
              const stIc: Record<string, string> = { available: '#22C55E', charging: '#0EA5E9', driving: '#7C3AED', low: '#EF4444' };
              const stLabel: Record<string, string> = { available: '✓', charging: '⚡', driving: '→', low: '!' };
              return (
                <div key={v.id} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: stBg[v.status], color: stIc[v.status] }}>
                    {stLabel[v.status]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-slate-800 truncate">{v.model}</p>
                      <p className="text-[11px] font-bold mono" style={{ color: bc }}>{v.battery}%</p>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-0.5">
                      <div className="h-full rounded-full" style={{ width: `${v.battery}%`, backgroundColor: bc, transition: 'width 0.8s ease' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top spenders */}
        <div className="col-span-2 bg-white rounded-2xl overflow-hidden enter-up" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)', border: '1px solid rgba(226,232,240,0.7)', animationDelay: '135ms' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F8FAFC' }}>
            <h3 className="text-sm font-bold text-slate-800">Расходы сотрудников</h3>
            <button className="text-[11px] text-indigo-500 font-semibold hover:text-indigo-700 transition-colors">Все сотрудники →</button>
          </div>
          <div className="divide-y divide-slate-50/80">
            {employees.map((e, idx) => {
              const pct = Math.round((e.spent / e.limit) * 100);
              const over = pct > 90;
              const warn = pct > 75;
              return (
                <div key={e.name} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#EEF2FF,#E0E7FF)', color: '#6366F1' }}>
                    {e.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{e.name}</p>
                    <p className="text-[11px] text-slate-400 inter">{e.dept} · {e.vehicle}</p>
                  </div>
                  <div className="w-32">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-slate-400">Расход</p>
                      <p className={`text-[11px] font-bold mono ${over ? 'text-red-500' : warn ? 'text-amber-500' : 'text-slate-700'}`}>{pct}%</p>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: over ? '#EF4444' : warn ? '#F59E0B' : '#6366F1' }} />
                    </div>
                  </div>
                  <div className="text-right w-28">
                    <p className="text-[13px] font-bold text-slate-900 mono">{(e.spent / 1000).toFixed(0)}K</p>
                    <p className="text-[10px] text-slate-400 inter">из {(e.limit / 1000).toFixed(0)}K сум</p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-lg font-semibold shrink-0 ${over ? 'bg-red-100 text-red-600' : warn ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {over ? '⚠ Лимит' : warn ? 'Высокий' : '✓ Норма'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FleetPage() {
  const liveVehicles = useLiveVehicles();
  const fleetVehicles = liveVehicles.length ? liveVehicles : staticFleetVehicles;
  type VehicleStatus = 'available' | 'charging' | 'driving' | 'low';
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>('all');
  const [selected, setSelected] = useState<typeof fleetVehicles[0] | null>(null);

  const statusBg: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    charging: 'bg-sky-100 text-sky-700',
    driving: 'bg-violet-100 text-violet-700',
    low: 'bg-red-100 text-red-600',
  };
  const statusLabel: Record<string, string> = {
    available: 'Свободен', charging: 'Заряжается', driving: 'В поездке', low: 'Низкий заряд',
  };
  const statusIcon: Record<string, string> = {
    available: '🟢', charging: '⚡', driving: '🚗', low: '🔴',
  };
  const batteryColor = (b: number) => b < 30 ? '#EF4444' : b < 60 ? '#F59E0B' : '#22C55E';
  const batteryText = (b: number) => b < 30 ? 'text-red-500' : b < 60 ? 'text-amber-500' : 'text-green-600';

  const filtered = statusFilter === 'all' ? fleetVehicles : fleetVehicles.filter(v => v.status === statusFilter);

  // Per-vehicle charge history (last 7 sessions)
  const chargeHistory: Record<string, { day: string; kWh: number; cost: number }[]> = {
    'VH-001': [
      { day: 'Пн', kWh: 42, cost: 84000 }, { day: 'Вт', kWh: 0, cost: 0 }, { day: 'Ср', kWh: 38, cost: 76000 },
      { day: 'Чт', kWh: 55, cost: 110000 }, { day: 'Пт', kWh: 22, cost: 44000 }, { day: 'Сб', kWh: 62, cost: 124000 }, { day: 'Вс', kWh: 0, cost: 0 },
    ],
    'VH-002': [
      { day: 'Пн', kWh: 68, cost: 136000 }, { day: 'Вт', kWh: 45, cost: 90000 }, { day: 'Ср', kWh: 72, cost: 144000 },
      { day: 'Чт', kWh: 58, cost: 116000 }, { day: 'Пт', kWh: 44, cost: 88000 }, { day: 'Сб', kWh: 38, cost: 76000 }, { day: 'Вс', kWh: 52, cost: 104000 },
    ],
    'VH-003': [
      { day: 'Пн', kWh: 28, cost: 56000 }, { day: 'Вт', kWh: 35, cost: 70000 }, { day: 'Ср', kWh: 0, cost: 0 },
      { day: 'Чт', kWh: 41, cost: 82000 }, { day: 'Пт', kWh: 52, cost: 104000 }, { day: 'Сб', kWh: 48, cost: 96000 }, { day: 'Вс', kWh: 36, cost: 72000 },
    ],
    'VH-004': [
      { day: 'Пн', kWh: 62, cost: 124000 }, { day: 'Вт', kWh: 58, cost: 116000 }, { day: 'Ср', kWh: 72, cost: 144000 },
      { day: 'Чт', kWh: 48, cost: 96000 }, { day: 'Пт', kWh: 55, cost: 110000 }, { day: 'Сб', kWh: 38, cost: 76000 }, { day: 'Вс', kWh: 0, cost: 0 },
    ],
    'VH-005': [
      { day: 'Пн', kWh: 38, cost: 76000 }, { day: 'Вт', kWh: 44, cost: 88000 }, { day: 'Ср', kWh: 52, cost: 104000 },
      { day: 'Чт', kWh: 0, cost: 0 }, { day: 'Пт', kWh: 46, cost: 92000 }, { day: 'Сб', kWh: 54, cost: 108000 }, { day: 'Вс', kWh: 32, cost: 64000 },
    ],
  };

  const totalKwh = fleetVehicles.reduce((s, v) => s + (chargeHistory[v.id]?.reduce((a, b) => a + b.kWh, 0) || 0), 0);
  const avgBattery = Math.round(fleetVehicles.reduce((s, v) => s + v.battery, 0) / fleetVehicles.length);
  const chargingNow = fleetVehicles.filter(v => v.status === 'charging').length;
  const totalCost = fleetVehicles.reduce((s, v) => s + v.cost, 0);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Автопарк</h1>
            <p className="text-sm text-slate-500 inter">Uzauto Motors Corp. · 5 автомобилей</p>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 active:scale-95 transition-all shadow-sm">
            <Plus size={14} />Добавить авто
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Всего авто', value: '5', sub: '4 активных', bg: 'bg-indigo-50', ic: 'text-indigo-500', icon: <Car size={14} /> },
            { label: 'Заряжается сейчас', value: String(chargingNow), sub: `${fleetVehicles.filter(v=>v.status==='driving').length} в поездке`, bg: 'bg-sky-50', ic: 'text-sky-500', icon: <Zap size={14} /> },
            { label: 'кВт·ч за неделю', value: totalKwh.toLocaleString(), sub: 'по всему парку', bg: 'bg-emerald-50', ic: 'text-emerald-600', icon: <Activity size={14} /> },
            { label: 'Расходы (сент.)', value: `${(totalCost / 1000000).toFixed(1)}M`, sub: 'сум · весь парк', bg: 'bg-amber-50', ic: 'text-amber-500', icon: <DollarSign size={14} /> },
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

        {/* Average battery bar */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter">Средний заряд парка</p>
            <p className="text-sm font-bold mono" style={{ color: batteryColor(avgBattery) }}>{avgBattery}%</p>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${avgBattery}%`, background: `linear-gradient(to right, ${batteryColor(avgBattery)}, ${batteryColor(avgBattery)}aa)` }} />
          </div>
          <div className="flex gap-4 mt-3">
            {(['available', 'charging', 'driving', 'low'] as const).map(s => (
              <span key={s} className={`text-xs px-2 py-0.5 rounded-full ${statusBg[s]}`}>{statusIcon[s]} {fleetVehicles.filter(v => v.status === s).length} {statusLabel[s].toLowerCase()}</span>
            ))}
          </div>
        </div>

        {/* Status filters + table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
            {(['all', 'available', 'charging', 'driving', 'low'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-colors ${statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {s === 'all' ? `Все (${fleetVehicles.length})` : `${statusIcon[s]} ${statusLabel[s]}`}
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(v => (
              <div key={v.id}
                onClick={() => setSelected(selected?.id === v.id ? null : v)}
                className={`px-5 py-4 flex items-center gap-5 cursor-pointer transition-colors ${selected?.id === v.id ? 'bg-indigo-50/60' : 'hover:bg-slate-50/60'}`}
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${(statusBg[v.status] ?? statusBg.available).split(' ')[0]}`}>
                  <Car size={20} className={(statusBg[v.status] ?? statusBg.available).split(' ')[1]} />
                </div>

                {/* Vehicle info */}
                <div className="w-44">
                  <p className="text-sm font-bold text-slate-900">{v.model}</p>
                  <p className="text-xs text-slate-400 mono">{v.plate}</p>
                </div>

                {/* Driver */}
                <div className="w-32">
                  <p className="text-xs text-slate-400 mb-0.5">Водитель</p>
                  <p className="text-sm font-medium text-slate-700">{v.driver}</p>
                </div>

                {/* Battery */}
                <div className="w-36">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-slate-400">Заряд</p>
                    <p className={`text-xs font-bold mono ${batteryText(v.battery)}`}>{v.battery}%</p>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${v.battery}%`, backgroundColor: batteryColor(v.battery) }} />
                  </div>
                </div>

                {/* Sessions */}
                <div className="w-20 text-center">
                  <p className="text-xs text-slate-400">Зарядок</p>
                  <p className="text-sm font-bold mono text-slate-800">{v.charged}</p>
                </div>

                {/* Cost */}
                <div className="flex-1 text-right">
                  <p className="text-xs text-slate-400">Расходы</p>
                  <p className="text-sm font-bold mono text-slate-900">{(v.cost / 1000).toFixed(0)}K сум</p>
                </div>

                {/* Status badge */}
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${statusBg[v.status]}`}>
                  {statusLabel[v.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 border-l border-slate-200 bg-white flex flex-col overflow-y-auto" style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{selected.model}</h3>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>

          <div className="p-5 space-y-5">
            {/* Battery + status */}
            <div className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusBg[selected.status]}`}>{statusLabel[selected.status]}</span>
                <p className={`text-2xl font-bold mono ${batteryText(selected.battery)}`}>{selected.battery}%</p>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${selected.battery}%`, backgroundColor: batteryColor(selected.battery) }} />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 text-right">заряд батареи</p>
            </div>

            {/* Details */}
            <div className="space-y-2">
              {[
                { label: 'Гос. номер', value: selected.plate },
                { label: 'Водитель', value: selected.driver },
                { label: 'ID авто', value: selected.id },
                { label: 'Зарядок (сент.)', value: String(selected.charged) },
                { label: 'Расходы (сент.)', value: `${selected.cost.toLocaleString()} сум` },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{r.label}</p>
                  <p className="text-sm font-semibold text-slate-800 mono">{r.value}</p>
                </div>
              ))}
            </div>

            {/* Weekly charge chart */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Зарядки за 7 дней (кВт·ч)</p>
              <div className="flex items-end gap-1 h-16">
                {(chargeHistory[selected.id] || []).map((d, i) => {
                  const max = Math.max(...(chargeHistory[selected.id] || []).map(x => x.kWh));
                  const h = max > 0 ? (d.kWh / max) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full rounded-t-lg transition-all"
                        style={{ height: `${Math.max(h, 4)}%`, background: d.kWh > 0 ? 'linear-gradient(to top, #6366F1, #818CF8)' : '#E2E8F0', minHeight: 3, maxHeight: 48 }} />
                      <p className="text-[9px] text-slate-400">{d.day}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-2 text-right mono">
                {(chargeHistory[selected.id] || []).reduce((s, d) => s + d.kWh, 0)} кВт·ч · {((chargeHistory[selected.id] || []).reduce((s, d) => s + d.cost, 0) / 1000).toFixed(0)}K сум
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 active:scale-95 transition-all">
                <Zap size={14} />Найти ближайшую зарядку
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all">
                <Activity size={14} />История зарядок
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all">
                <Users size={14} />Сменить водителя
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeesPage() {
  const liveEmployees = useLiveEmployees();
  const { actions, refresh } = useSync();
  const employees = liveEmployees.length ? liveEmployees : staticEmployees;
  const [selected, setSelected] = useState<typeof employees[0] | null>(null);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState('');
  const [search, setSearch] = useState('');

  const overLimit = employees.filter(e => e.spent / e.limit > 0.95).length;
  const avgUtil = Math.round(employees.reduce((s, e) => s + (e.spent / e.limit) * 100, 0) / employees.length);
  const totalSpent = employees.reduce((s, e) => s + e.spent, 0);
  const totalLimit = employees.reduce((s, e) => s + e.limit, 0);

  const filtered = employees.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.dept.toLowerCase().includes(search.toLowerCase())
  );

  const spendHistory: Record<string, { month: string; amount: number }[]> = {
    'Alisher Toshmatov': [{ month: 'Май', amount: 180000 }, { month: 'Июн', amount: 210000 }, { month: 'Июл', amount: 240000 }, { month: 'Авг', amount: 260000 }, { month: 'Сент', amount: 284000 }],
    'Nilufar Karimova': [{ month: 'Май', amount: 290000 }, { month: 'Июн', amount: 320000 }, { month: 'Июл', amount: 350000 }, { month: 'Авг', amount: 370000 }, { month: 'Сент', amount: 391000 }],
    'Bobur Mirzayev': [{ month: 'Май', amount: 90000 }, { month: 'Июн', amount: 105000 }, { month: 'Июл', amount: 120000 }, { month: 'Авг', amount: 132000 }, { month: 'Сент', amount: 142000 }],
    'Dilshod Raximov': [{ month: 'Май', amount: 380000 }, { month: 'Июн', amount: 420000 }, { month: 'Июл', amount: 460000 }, { month: 'Авг', amount: 495000 }, { month: 'Сент', amount: 521000 }],
    'Kamola Abdullayeva': [{ month: 'Май', amount: 60000 }, { month: 'Июн', amount: 72000 }, { month: 'Июл', amount: 84000 }, { month: 'Авг', amount: 90000 }, { month: 'Сент', amount: 98000 }],
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main */}
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Сотрудники</h1>
            <p className="text-sm text-slate-500 inter">{employees.length} сотрудников · корпоративные лимиты</p>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 active:scale-95 transition-all shadow-sm">
            <Plus size={14} />Добавить
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Сотрудников', value: String(employees.length), sub: 'с корп. лимитом', bg: 'bg-indigo-50', ic: 'text-indigo-500', icon: <Users size={14} /> },
            { label: 'Превысили лимит', value: String(overLimit), sub: 'требуют внимания', bg: 'bg-red-50', ic: 'text-red-500', icon: <AlertTriangle size={14} /> },
            { label: 'Avg. использование', value: `${avgUtil}%`, sub: 'от лимита', bg: 'bg-amber-50', ic: 'text-amber-500', icon: <Activity size={14} /> },
            { label: 'Расходы / лимит', value: `${((totalSpent / totalLimit) * 100).toFixed(0)}%`, sub: `${(totalSpent / 1000000).toFixed(1)}M из ${(totalLimit / 1000000).toFixed(1)}M сум`, bg: 'bg-emerald-50', ic: 'text-emerald-600', icon: <DollarSign size={14} /> },
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
              placeholder="Поиск по имени или отделу..."
              className="flex-1 text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50">
              <Download size={12} />CSV
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Сотрудник', 'Отдел', 'Автомобиль', 'Сессии', 'Лимит (сум)', 'Расход', 'Использование', 'Статус'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide inter">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(e => {
                const pct = Math.round((e.spent / e.limit) * 100);
                const over = pct > 95;
                const warn = pct > 75 && !over;
                const isSelected = selected?.name === e.name;
                return (
                  <tr key={e.name}
                    onClick={() => setSelected(isSelected ? null : e)}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50/50'}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-xs font-bold text-indigo-600">
                          {e.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{e.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">{e.dept}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{e.vehicle}</td>
                    <td className="px-4 py-3.5 text-sm font-medium text-slate-700 mono">{e.sessions}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 mono">{e.limit.toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 mono">{e.spent.toLocaleString()}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: over ? '#EF4444' : warn ? '#F59E0B' : '#6366F1' }} />
                        </div>
                        <span className={`text-xs font-semibold mono ${over ? 'text-red-500' : warn ? 'text-amber-500' : 'text-slate-500'}`}>{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${over ? 'bg-red-100 text-red-600' : warn ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-700'}`}>
                        {over ? '⚠ Лимит' : warn ? 'Высокий' : '✓ Норма'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (() => {
        const pct = Math.round((selected.spent / selected.limit) * 100);
        const over = pct > 95;
        const hist = spendHistory[selected.name] || [];
        const maxAmt = Math.max(...hist.map(h => h.amount));
        return (
          <div className="w-80 border-l border-slate-200 bg-white flex flex-col overflow-y-auto shrink-0" style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.06)' }}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-sm font-bold text-indigo-600">
                  {selected.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{selected.name}</p>
                  <p className="text-xs text-slate-400">{selected.dept}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Limit usage */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter">Использование лимита</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${over ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                    {over ? 'Лимит!' : 'Норма'}
                  </span>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <p className={`text-3xl font-bold mono ${over ? 'text-red-500' : 'text-indigo-600'}`}>{pct}%</p>
                  <p className="text-xs text-slate-400">{selected.spent.toLocaleString()} / {selected.limit.toLocaleString()}</p>
                </div>
                <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: over ? '#EF4444' : '#6366F1' }} />
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2.5">
                {[
                  { label: 'Автомобиль', value: selected.vehicle },
                  { label: 'Зарядок (сент.)', value: String(selected.sessions) },
                  { label: 'Израсходовано', value: `${selected.spent.toLocaleString()} сум` },
                  { label: 'Осталось', value: `${Math.max(0, selected.limit - selected.spent).toLocaleString()} сум` },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">{r.label}</p>
                    <p className="text-sm font-semibold text-slate-800 mono">{r.value}</p>
                  </div>
                ))}
              </div>

              {/* Edit limit */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter mb-2">Лимит на месяц</p>
                {editingLimit ? (
                  <div className="flex gap-2">
                    <input value={limitDraft} onChange={e => setLimitDraft(e.target.value)}
                      className="flex-1 text-sm border border-indigo-300 rounded-xl px-3 py-2 outline-none mono focus:ring-2 focus:ring-indigo-200" />
                    <button
                      onClick={async () => {
                        setEditingLimit(false);
                        const next = Number(limitDraft.replace(/\s/g, ''));
                        if (!Number.isFinite(next) || next < 0) return;
                        try {
                          await actions.setEmployeeLimit('business', selected.id, next);
                          await refresh();
                          setSelected(prev => (prev ? { ...prev, limit: next } : prev));
                        } catch {
                          /* server keeps the previous limit */
                        }
                      }}
                      className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-semibold hover:bg-indigo-600">
                      ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                    <p className="text-sm font-bold mono text-slate-900">{selected.limit.toLocaleString()} сум</p>
                    <button onClick={() => { setLimitDraft(String(selected.limit)); setEditingLimit(true); }}
                      className="text-xs text-indigo-500 font-semibold hover:underline">
                      Изменить
                    </button>
                  </div>
                )}
              </div>

              {/* Spend trend */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inter mb-3">Динамика расходов</p>
                <div className="flex items-end gap-1.5 h-14">
                  {hist.map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full rounded-t-lg"
                        style={{ height: `${maxAmt > 0 ? Math.max((h.amount / maxAmt) * 48, 4) : 4}px`, background: 'linear-gradient(to top, #6366F1, #818CF8)' }} />
                      <p className="text-[9px] text-slate-400">{h.month.slice(0, 3)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 active:scale-95 transition-all">
                  <Activity size={14} />История зарядок
                </button>
                <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium hover:bg-amber-100 transition-all">
                  Сбросить лимит на след. месяц
                </button>
                <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all">
                  Заблокировать сотрудника
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const expenseRows = [
  { date: '2025-07-20', vehicle: 'BYD Han EV', driver: 'Alisher T.', station: 'GreenCharge Toshkent', city: 'Toshkent', kWh: 62.4, cost: 2184000, type: 'CCS2' },
  { date: '2025-07-19', vehicle: 'Hyundai Ioniq 6', driver: 'Nilufar K.', station: 'EcoVolt Samarkand', city: 'Samarkand', kWh: 45.1, cost: 1578500, type: 'CCS2' },
  { date: '2025-07-19', vehicle: 'Tesla Model 3', driver: 'Bobur M.', station: 'GreenCharge Toshkent', city: 'Toshkent', kWh: 55.2, cost: 1932000, type: 'Type 2' },
  { date: '2025-07-18', vehicle: 'Kia EV6', driver: 'Dilshod R.', station: 'SilkRoad Bukhara', city: 'Bukhara', kWh: 38.7, cost: 1354500, type: 'CCS2' },
  { date: '2025-07-18', vehicle: 'BYD Atto 3', driver: 'Kamola A.', station: 'GreenCharge Toshkent', city: 'Toshkent', kWh: 51.0, cost: 1785000, type: 'CCS2' },
  { date: '2025-07-17', vehicle: 'BYD Han EV', driver: 'Alisher T.', station: 'EcoVolt Andijon', city: 'Andijon', kWh: 44.8, cost: 1568000, type: 'CCS2' },
  { date: '2025-07-16', vehicle: 'Hyundai Ioniq 6', driver: 'Nilufar K.', station: 'GreenCharge Namangan', city: 'Namangan', kWh: 39.5, cost: 1382500, type: 'Type 2' },
  { date: '2025-07-15', vehicle: 'Tesla Model 3', driver: 'Bobur M.', station: 'SilkRoad Bukhara', city: 'Bukhara', kWh: 48.3, cost: 1690500, type: 'Type 2' },
];

const expenseByStation = [
  { name: 'GreenCharge Toshkent', cost: 7821000, sessions: 34 },
  { name: 'EcoVolt Samarkand', cost: 3254000, sessions: 18 },
  { name: 'SilkRoad Bukhara', cost: 2892000, sessions: 15 },
  { name: 'GreenCharge Namangan', cost: 2341000, sessions: 12 },
  { name: 'EcoVolt Andijon', cost: 1920000, sessions: 9 },
];

const expenseByDay = [
  { day: 'Пн', cost: 4200000 }, { day: 'Вт', cost: 3800000 }, { day: 'Ср', cost: 5100000 },
  { day: 'Чт', cost: 4600000 }, { day: 'Пт', cost: 6200000 }, { day: 'Сб', cost: 2900000 }, { day: 'Вс', cost: 1800000 },
];

const weeklyTrend = [
  { week: '5 мая', cost: 18400000, sessions: 74 },
  { week: '12 мая', cost: 21200000, sessions: 88 },
  { week: '19 мая', cost: 19800000, sessions: 81 },
  { week: '26 мая', cost: 24100000, sessions: 97 },
  { week: '2 июн', cost: 22700000, sessions: 91 },
  { week: '9 июн', cost: 26500000, sessions: 108 },
  { week: '16 июн', cost: 25300000, sessions: 102 },
  { week: '23 июн', cost: 28900000, sessions: 116 },
  { week: '30 июн', cost: 31200000, sessions: 124 },
  { week: '7 июл', cost: 29800000, sessions: 119 },
  { week: '14 июл', cost: 33500000, sessions: 134 },
  { week: '21 июл', cost: 35100000, sessions: 141 },
];

const byEmployee = [
  { name: 'Bobur M.', sessions: 31, kwh: 158.4, cost: 5546400, vehicle: 'Tesla Model 3', limit: 8000000 },
  { name: 'Alisher T.', sessions: 26, kwh: 134.2, cost: 4697000, vehicle: 'BYD Han EV', limit: 8000000 },
  { name: 'Kamola A.', sessions: 21, kwh: 108.8, cost: 3808000, vehicle: 'BYD Atto 3', limit: 6000000 },
  { name: 'Nilufar K.', sessions: 18, kwh: 93.1, cost: 3258500, vehicle: 'Hyundai Ioniq 6', limit: 6000000 },
  { name: 'Dilshod R.', sessions: 14, kwh: 72.4, cost: 2534000, vehicle: 'Kia EV6', limit: 5000000 },
];

function ExpensesPage() {
  const [cityFilter, setCityFilter] = useState('all');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [viewTab, setViewTab] = useState<'overview' | 'employees' | 'trend'>('overview');
  const total = expenseRows.reduce((s, r) => s + r.cost, 0);
  const totalKwh = expenseRows.reduce((s, r) => s + r.kWh, 0);

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Расходы на зарядку</h1>
          <p className="text-sm text-slate-400">Аналитика затрат корпоративного флота</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
            {(['week', 'month', 'quarter'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${period === p ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Квартал'}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 transition-colors">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Всего расходов', value: `${(total / 1000000).toFixed(2)} млн сум`, sub: `за ${period === 'week' ? 'неделю' : period === 'month' ? 'месяц' : 'квартал'}`, trend: +12.4, color: 'text-violet-600' },
          { label: 'кВт·ч заряжено', value: `${totalKwh.toFixed(0)} кВт·ч`, sub: `${expenseRows.length} сессий`, trend: +8.1, color: 'text-sky-600' },
          { label: 'Ср. стоимость', value: `${Math.round(total / totalKwh).toLocaleString()}`, sub: 'сум / кВт·ч', trend: -1.2, color: 'text-slate-900' },
          { label: 'Топ по расходам', value: 'Bobur M.', sub: '5 546 400 сум', trend: null, color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className={`text-lg font-bold mono ${k.color}`}>{k.value}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-xs text-slate-400">{k.sub}</p>
              {k.trend !== null && (
                <span className={`text-[11px] font-semibold ml-1 ${k.trend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {k.trend > 0 ? '▲' : '▼'}{Math.abs(k.trend)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {([['overview', 'Обзор'], ['employees', 'По сотрудникам'], ['trend', 'Тренд']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setViewTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${viewTab === t ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {viewTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">По дням недели</h3>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={expenseByDay} barSize={20}>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: unknown) => [`${((v as number)/1000000).toFixed(2)} млн`, 'Расход']} />
                  <Bar dataKey="cost" fill="#8B5CF6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">По станциям</h3>
              <div className="space-y-2.5">
                {expenseByStation.map(s => {
                  const pct = Math.round((s.cost / expenseByStation[0].cost) * 100);
                  return (
                    <div key={s.name}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-slate-600 truncate max-w-[160px]">{s.name}</span>
                        <span className="text-slate-500 mono">{(s.cost / 1000000).toFixed(2)} млн</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">Детализация сессий</span>
              <div className="flex gap-1 ml-auto">
                {['all', 'Toshkent', 'Samarkand', 'Bukhara'].map(f => (
                  <button key={f} onClick={() => setCityFilter(f)}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${cityFilter === f ? 'bg-violet-100 text-violet-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
                    {f === 'all' ? 'Все' : f}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Дата', 'Авто', 'Водитель', 'Станция', 'кВт·ч', 'Стоимость', 'Тип'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {expenseRows.filter(r => cityFilter === 'all' || r.city === cityFilter).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 text-sm">
                    <td className="px-4 py-3 text-slate-500 mono text-xs">{r.date}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{r.vehicle}</td>
                    <td className="px-4 py-3 text-slate-600">{r.driver}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{r.station}</td>
                    <td className="px-4 py-3 text-slate-700 mono">{r.kWh}</td>
                    <td className="px-4 py-3 text-violet-700 font-semibold mono">{r.cost.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full">{r.type}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Расходы по сотрудникам</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {byEmployee.map((emp, i) => {
              const pct = Math.round((emp.cost / emp.limit) * 100);
              const limitColor = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-violet-400';
              return (
                <div key={emp.name} className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {emp.name[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">{emp.name}</p>
                        <p className="text-sm font-bold text-violet-700 mono">{emp.cost.toLocaleString()} сум</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{emp.vehicle}</span>
                        <span>·</span>
                        <span>{emp.sessions} сессий</span>
                        <span>·</span>
                        <span>{emp.kwh} кВт·ч</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Лимит: {emp.limit.toLocaleString()} сум</span>
                      <span className={`font-semibold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-green-600'}`}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${limitColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewTab === 'trend' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">Тренд расходов — 12 недель</h3>
            <span className="text-xs text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-lg font-semibold">▲ +90.8% квартал</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyTrend}>
              <defs>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${(v/1000000).toFixed(0)}M`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => [`${((v as number)/1000000).toFixed(2)} млн сум`, 'Расходы']} />
              <Area type="monotone" dataKey="cost" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#expGrad)" dot={false} activeDot={{ r: 5, fill: '#8B5CF6' }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {[
              { label: 'Средн. за неделю', value: `${Math.round(weeklyTrend.reduce((s, w) => s + w.cost, 0) / weeklyTrend.length / 1000000 * 100) / 100} млн сум` },
              { label: 'Рост м/м', value: '+12.4%' },
              { label: 'Прогноз (след. мес)', value: '38.2 млн сум' },
            ].map(s => (
              <div key={s.label} className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                <p className="text-xs text-violet-500 mb-0.5">{s.label}</p>
                <p className="text-sm font-bold text-violet-700">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsPage() {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const generate = (type: string) => {
    setGenerating(true);
    setGenerated(null);
    setTimeout(() => { setGenerating(false); setGenerated(type); }, 1800);
  };

  const reportTypes = [
    { id: 'monthly', label: 'Ежемесячный отчёт', desc: 'Расходы, кВт·ч, сессии по месяцам', icon: '📅', color: 'from-violet-500 to-violet-600' },
    { id: 'fleet', label: 'Отчёт по флоту', desc: 'Стоимость и пробег каждого авто', icon: '🚗', color: 'from-sky-500 to-sky-600' },
    { id: 'driver', label: 'Отчёт по водителям', desc: 'Расходы и лимиты по сотрудникам', icon: '👤', color: 'from-green-500 to-green-600' },
    { id: 'station', label: 'По станциям', desc: 'Сравнение операторов и тарифов', icon: '⚡', color: 'from-amber-500 to-amber-600' },
    { id: 'cdr', label: 'CDR выгрузка', desc: 'Полные Charge Detail Records', icon: '📋', color: 'from-slate-500 to-slate-600' },
    { id: 'tax', label: 'Налоговый отчёт', desc: 'Для бухгалтерии — НДС, инвойсы', icon: '🧾', color: 'from-red-500 to-red-600' },
  ];

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <h1 className="text-xl font-bold text-slate-900">Отчёты</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reportTypes.map(r => (
          <button key={r.id} onClick={() => generate(r.label)}
            className="group bg-white rounded-2xl border border-slate-100 p-5 text-left hover:border-violet-200 hover:shadow-sm transition-all">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.color} flex items-center justify-center text-xl mb-3`}>{r.icon}</div>
            <p className="text-sm font-semibold text-slate-800 group-hover:text-violet-700 transition-colors">{r.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{r.desc}</p>
          </button>
        ))}
      </div>

      {generating && (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-violet-700">Генерация отчёта...</p>
        </div>
      )}

      {generated && !generating && (
        <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle size={18} className="text-green-500" />
            <div>
              <p className="text-sm font-semibold text-green-800">{generated} готов</p>
              <p className="text-xs text-green-600">fleet_report_2025_07.pdf · 142 KB</p>
            </div>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-xl text-xs hover:bg-green-600">
            <Download size={13} />Скачать PDF
          </button>
        </div>
      )}

      {/* Recent reports */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Последние отчёты</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {[
            { name: 'Ежемесячный отчёт — Июль 2025', date: '31.07.2025', size: '218 KB', format: 'PDF' },
            { name: 'Отчёт по флоту — Июль 2025', date: '31.07.2025', size: '98 KB', format: 'PDF' },
            { name: 'CDR выгрузка — Q2 2025', date: '01.07.2025', size: '1.4 MB', format: 'CSV' },
            { name: 'Налоговый отчёт — Q2 2025', date: '01.07.2025', size: '145 KB', format: 'XLSX' },
          ].map(r => (
            <div key={r.name} className="px-5 py-3.5 flex items-center gap-4">
              <FileText size={16} className="text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                <p className="text-xs text-slate-400">{r.date} · {r.size}</p>
              </div>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full mono">{r.format}</span>
              <button className="p-1.5 text-slate-400 hover:text-violet-600"><Download size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BizToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors shrink-0"
      style={{ backgroundColor: value ? '#6366F1' : '#E2E8F0' }}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function BusinessSettingsPage() {
  const [notifs, setNotifs] = useState({ limit80: true, limit95: true, chargeStart: false, chargeEnd: true, newEmployee: true, invoice: true });
  const [saved, setSaved] = useState(false);
  const [lang, setLang] = useState<'ru' | 'uz' | 'en'>('ru');
  const [twofa, setTwofa] = useState(false);
  const [currency, setCurrency] = useState<'sum' | 'usd'>('sum');

  const saveSettings = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Настройки аккаунта</h1>
        <button onClick={saveSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: saved ? '#22C55E' : 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#fff', boxShadow: saved ? '0 4px 12px rgba(34,197,94,0.3)' : '0 4px 12px rgba(99,102,241,0.3)' }}>
          {saved ? <><CheckCircle size={14} />Сохранено!</> : <><Download size={14} />Сохранить</>}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Company info */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Компания</h3>
          {[
            { label: 'Название', value: 'UzMotor Fleet LLC' },
            { label: 'ИНН', value: '310 458 221' },
            { label: 'Юр. адрес', value: 'г. Ташкент, ул. Амира Темура, 107' },
            { label: 'Директор', value: 'Алишер Каримов' },
            { label: 'ОКЭД', value: '49400 — Грузовой транспорт' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-xs text-slate-400 mb-0.5">{f.label}</p>
              <input defaultValue={f.value} className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          ))}
        </div>

        {/* Bank info + limits */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Банковские реквизиты</h3>
            {[
              { label: 'Банк', value: 'АО "Узпромстройбанк"' },
              { label: 'IBAN', value: 'UZ53 0145 2000 1234 0001 0001' },
              { label: 'МФО', value: '00453' },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-slate-400 mb-0.5">{f.label}</p>
                <input defaultValue={f.value} className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300 mono" />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Лимиты флота</h3>
            {[
              { label: 'Месячный лимит на авто', value: '5 000 000 сум' },
              { label: 'Лимит на сотрудника', value: '2 000 000 сум' },
              { label: 'Уведомление при', value: '80% лимита' },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{f.label}</p>
                <p className="text-sm font-semibold text-slate-800 mono">{f.value}</p>
              </div>
            ))}
            <button className="w-full mt-1 text-xs text-violet-600 hover:underline text-left">Изменить лимиты →</button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="px-5 py-4 border-b border-slate-50">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Bell size={14} className="text-indigo-500" />Уведомления</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {([
            { key: 'limit80', label: 'Лимит 80%', sub: 'Когда сотрудник использовал 80% лимита' },
            { key: 'limit95', label: 'Лимит 95%', sub: 'Предупреждение об исчерпании лимита' },
            { key: 'chargeStart', label: 'Начало зарядки', sub: 'Push при каждой новой зарядке' },
            { key: 'chargeEnd', label: 'Зарядка завершена', sub: 'Итоговый отчёт по сессии' },
            { key: 'newEmployee', label: 'Новый сотрудник', sub: 'При добавлении пользователя' },
            { key: 'invoice', label: 'Счёт на оплату', sub: 'Еженедельный инвойс на email' },
          ] as const).map(n => (
            <div key={n.key} className="px-5 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800">{n.label}</p>
                <p className="text-xs text-slate-400">{n.sub}</p>
              </div>
              <BizToggle value={notifs[n.key]} onChange={v => setNotifs(p => ({ ...p, [n.key]: v }))} />
            </div>
          ))}
        </div>
      </div>

      {/* System */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 className="text-sm font-bold text-slate-700">Система</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Язык интерфейса</p>
            <p className="text-xs text-slate-400">Язык отображения дашборда и отчётов</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['ru', 'uz', 'en'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${lang === l ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {l === 'ru' ? 'Рус' : l === 'uz' ? 'O\'zb' : 'Eng'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Валюта отчётов</p>
            <p className="text-xs text-slate-400">Сум или USD в экспортах</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['sum', 'usd'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${currency === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {c === 'sum' ? 'UZS' : 'USD'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Двухфакторная аутентификация</p>
            <p className="text-xs text-slate-400">SMS-код при каждом входе</p>
          </div>
          <BizToggle value={twofa} onChange={setTwofa} />
        </div>
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-sm font-medium text-slate-800">Версия платформы</p>
            <p className="text-xs text-slate-400">ONE CHARGE Business Portal</p>
          </div>
          <span className="text-xs font-bold mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">v2.4.1</span>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 className="text-sm font-bold text-red-600 mb-3">Опасная зона</h3>
        <div className="space-y-2">
          <button className="w-full flex items-center justify-between px-4 py-3 bg-red-50 rounded-xl text-sm font-medium text-red-700 hover:bg-red-100 transition-colors">
            <span>Удалить все данные за квартал</span>
            <ChevronRight size={14} />
          </button>
          <button className="w-full flex items-center justify-between px-4 py-3 bg-red-50 rounded-xl text-sm font-medium text-red-700 hover:bg-red-100 transition-colors">
            <span>Закрыть корпоративный аккаунт</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BusinessApp({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      fleet: <FleetPage />, employees: <EmployeesPage />, expenses: <ExpensesPage />,
      reports: <ReportsPage />, settings: <BusinessSettingsPage />,
    };
    return (
      <div key={page} className="animate-fade-in h-full">
        {pages[page] ?? <DashboardPage />}
      </div>
    );
  };

  return (
    <div className="h-full flex relative dash-surface">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-20" />}
      <Sidebar current={page} onChange={setPage} onBack={onBack} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-hidden relative">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden absolute top-3 left-3 z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600">
          <Menu size={18} />
        </button>
        {renderPage()}
      </div>
      <AIChat portalType="business" />
    </div>
  );
}

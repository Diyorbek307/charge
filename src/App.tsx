import { useState, useEffect } from 'react';
import { Zap, Car, Building2, Shield, ArrowRight, Briefcase, BookOpen } from 'lucide-react';
import { lazy, Suspense } from 'react';
import PortalLogin from './components/PortalLogin';
import SyncInspector from './components/SyncInspector';
import SyncToasts from './components/SyncToasts';
import CommandPalette from './components/CommandPalette';
import { useI18n } from './lib/i18n';
import Landing from './landing/Landing';

// Each portal is a large, independent app — load one only when it is opened
// so the landing page ships a fraction of the bundle.
const DriverApp = lazy(() => import('./components/DriverApp'));
const OperatorApp = lazy(() => import('./components/OperatorApp'));
const AdminApp = lazy(() => import('./components/AdminApp'));
const BusinessApp = lazy(() => import('./components/BusinessApp'));
const ApiDocsApp = lazy(() => import('./components/ApiDocsApp'));
const SplitView = lazy(() => import('./components/SplitView'));
import { useSync } from './lib/sync';
import type { Portal as AuthPortal } from './lib/api';

type Portal = 'selector' | 'driver' | 'operator' | 'admin' | 'business' | 'api' | 'architecture';

const FLOW_LABELS = [
  { label: 'OCPP 2.0.1', color: '#38BDF8' },
  { label: 'REST / OCPI', color: '#A78BFA' },
  { label: 'OCPI 2.3.0', color: '#34D399' },
  { label: 'OCPP 2.0.1', color: '#FBBF24' },
  { label: 'Payment Token', color: '#FB7185' },
];

function FlowConnector({ index }: { index: number }) {
  const fl = FLOW_LABELS[index] ?? FLOW_LABELS[0];
  const dots = [
    { delay: '0s', size: 6 },
    { delay: '0.75s', size: 5 },
    { delay: '1.4s', size: 6 },
  ];
  return (
    <div className="flex items-center justify-center gap-3 py-1">
      <span className="text-[10px] font-semibold tracking-widest opacity-50" style={{ color: fl.color }}>{fl.label}</span>
      <div className="relative flex items-center justify-center" style={{ width: 2, height: 44 }}>
        {/* dashed vertical line */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', borderLeft: '2px dashed rgba(255,255,255,0.12)' }} />
        {/* animated dots */}
        {dots.map((dot, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: dot.size,
              height: dot.size,
              borderRadius: '50%',
              backgroundColor: fl.color,
              boxShadow: `0 0 6px ${fl.color}`,
              animation: `flow-dot 2.2s ease-in-out ${dot.delay} infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ArchitectureDiagram({ onBack }: { onBack: () => void }) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ label: string; sub: string; detail: string } | null>(null);

  const layers = [
    {
      id: 'user', label: 'ПОЛЬЗОВАТЕЛИ', color: 'border-sky-400 bg-sky-950/40',
      desc: '3 типа клиентов взаимодействуют с платформой через мобильные и веб-интерфейсы',
      nodes: [
        { label: 'Driver App', sub: 'iOS / Android', icon: '📱', color: 'bg-sky-500', detail: 'React Native · Auth flow · Map · Booking · History · AI Trip Planner · Push уведомления · Humo/Uzcard оплата' },
        { label: 'Business App', sub: 'Корпорации', icon: '🏢', color: 'bg-sky-600', detail: 'Управление флотом · Лимиты сотрудников · CDR-отчёты · Корпоративный счёт · IBAN-выплаты' },
        { label: 'Operator Dashboard', sub: 'Веб-кабинет', icon: '💻', color: 'bg-sky-700', detail: 'Управление станциями · EVSE real-time · Тарифы · Финансы · OCPI/OCPP настройки' },
        { label: 'Admin Center', sub: 'ONE CHARGE team', icon: '🔐', color: 'bg-sky-800', detail: 'Полный контроль · Fraud ML · CDR validation · Settlements · Роли & права · Аудит лог' },
      ],
    },
    {
      id: 'core', label: 'ONE CHARGE CORE', color: 'border-white/30 bg-white/5',
      desc: 'Микросервисная архитектура на Kubernetes. Каждый сервис независимо масштабируется',
      nodes: [
        { label: 'API Gateway', sub: 'Auth / Rate Limit', icon: '🔀', color: 'bg-slate-600', detail: 'OAuth 2.0 · JWT · 1000 req/min · TLS 1.3 · DDoS protection · Load balancing' },
        { label: 'Session Manager', sub: 'Start/Stop/CDR', icon: '⚡', color: 'bg-sky-600', detail: 'OCPP 2.0.1 Management · Real-time power metering · CDR generation · Session state machine' },
        { label: 'Payment Engine', sub: 'Tokenized cards', icon: '💳', color: 'bg-emerald-600', detail: 'PCI DSS tokenization · Humo, Uzcard, Visa, Mastercard · Refund flow · Escrow hold' },
        { label: 'Roaming Layer', sub: 'OCPI Hub', icon: '🌐', color: 'bg-violet-600', detail: 'OCPI 2.3.0 · Bilateral agreements · Token exchange · Location sync · Settlement hub' },
        { label: 'AI Engine', sub: 'Insights/Predict', icon: '🤖', color: 'bg-pink-600', detail: 'Demand forecasting · Price optimization · Fraud scoring · Trip planning · Usage anomalies' },
        { label: 'Settlement', sub: 'Clearing D+2', icon: '📊', color: 'bg-amber-600', detail: 'D+2 settlement · Commission 2–5% · Invoice generation · Bank transfers · PDF receipts' },
      ],
    },
    {
      id: 'integration', label: 'ИНТЕГРАЦИОННЫЙ СЛОЙ', color: 'border-violet-400/50 bg-violet-950/30',
      desc: 'Стандартизированные интерфейсы для подключения операторов и партнёров',
      nodes: [
        { label: 'OCPI 2.3.0', sub: 'Locations/Sessions/CDR', icon: '🔌', color: 'bg-violet-600', detail: 'Locations · Sessions · CDRs · Tokens · Tariffs · Commands · Reservations endpoints' },
        { label: 'REST API', sub: 'Partner API v1', icon: '⚙️', color: 'bg-violet-700', detail: 'OpenAPI 3.0 docs · Partner API v1.4.2 · SDK for JS/Python/Java · Postman collection' },
        { label: 'Integration Gateway', sub: 'Legacy systems', icon: '🔧', color: 'bg-violet-800', detail: 'XML/SOAP → REST adapters · Custom protocol support · Data transformation · Retries' },
        { label: 'Webhook Hub', sub: 'Events push', icon: '📡', color: 'bg-violet-500', detail: 'session.start · session.stop · payment.success · evse.status_change · HMAC-SHA256 signing' },
      ],
    },
    {
      id: 'operators', label: 'ОПЕРАТОРЫ', color: 'border-emerald-400/50 bg-emerald-950/30',
      desc: '4 сертифицированных оператора, 108 станций, 276 EVSE по всему Узбекистану',
      nodes: [
        { label: 'GreenCharge UZ', sub: '47 станций', icon: '🟢', color: 'bg-emerald-600', detail: 'Ташкент · 120 EVSE · CCS2/Type2 · DC до 150 кВт · Ключевой партнёр с 2024' },
        { label: 'EcoVolt', sub: '31 станция', icon: '⚡', color: 'bg-emerald-700', detail: 'Самарканд, Андижан · 68 EVSE · AC/DC · Заправочные комплексы' },
        { label: 'SilkRoad EV', sub: '22 станции', icon: '🔵', color: 'bg-emerald-800', detail: 'Бухара, Навои · 56 EVSE · Трасса Ташкент–Самарканд–Бухара' },
        { label: 'Nukus Power', sub: '8 станций', icon: '🟡', color: 'bg-emerald-900', detail: 'Каракалпакстан · 32 EVSE · Региональный оператор · AC 22 кВт' },
      ],
    },
    {
      id: 'physical', label: 'ФИЗИЧЕСКИЙ УРОВЕНЬ', color: 'border-amber-400/50 bg-amber-950/20',
      desc: 'Физическое оборудование и коммуникационные протоколы зарядных станций',
      nodes: [
        { label: 'OCPP 2.0.1', sub: 'CS Management', icon: '📶', color: 'bg-amber-600', detail: 'WebSocket · Remote Start/Stop/Reset · FirmwareUpdate · SmartCharging · ISO 15118 ready' },
        { label: 'Charging Stations', sub: '276 EVSE · 108 мест', icon: '🔋', color: 'bg-amber-700', detail: 'CCS2 DC 50–350 кВт · Type2 AC 7–22 кВт · CHAdeMO (legacy) · Менее 2% downtime' },
        { label: 'ISO 15118', sub: 'Plug & Charge Q1 2028', icon: '🚗', color: 'bg-amber-800', detail: 'V2G Vehicle-to-Grid · Automatic auth · Contract-based · В разработке для флота BYD' },
        { label: 'Smart Grid', sub: 'Demand response', icon: '⚡', color: 'bg-amber-900', detail: 'Dynamic load balancing · Peak shaving · Solar integration pilot · UzGrid API' },
      ],
    },
    {
      id: 'finance', label: 'ФИНАНСОВЫЙ УРОВЕНЬ', color: 'border-rose-400/50 bg-rose-950/20',
      desc: 'Платёжная экосистема: локальные карты, международные системы, банки-партнёры',
      nodes: [
        { label: 'Humo / Uzcard', sub: 'Локальные карты', icon: '🏦', color: 'bg-rose-600', detail: 'Национальные платёжные системы · Tokenization · 3DS · Ключевой метод оплаты для Узбекистана' },
        { label: 'Visa / Mastercard', sub: 'Международные', icon: '💰', color: 'bg-rose-700', detail: 'Для иностранных водителей · PCI DSS L1 · EMV 3DS2 · Мультивалютный рассчёт' },
        { label: 'Banks UZ', sub: 'Kapitalbank и др.', icon: '🏛', color: 'bg-rose-800', detail: 'Kapitalbank · Uzpromstroybank · Hamkorbank · IBAN transfers · Swift для иностранных выплат' },
      ],
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-auto" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          <ArrowRight size={14} className="rotate-180" />Назад
        </button>
        <div>
          <h1 className="text-white font-bold">ONE CHARGE UZ · Архитектура платформы</h1>
          <p className="text-slate-400 text-xs">Полная техническая схема национальной eMobility-экосистемы</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/8 border border-emerald-400/15 px-3 py-1.5 rounded-full font-medium">
          <div className="live-dot w-1.5 h-1.5 bg-emerald-400 rounded-full" style={{ color: 'rgba(52,211,153,0.6)' }} />
          Система активна
        </div>
      </div>
      <div className="flex-1 overflow-auto px-8 py-8 space-y-2">
        {layers.map((layer, li) => {
          const isExpanded = expandedLayer === layer.id;
          return (
            <div key={layer.id}>
              <div className={`border rounded-2xl ${layer.color} transition-all`}>
                {/* Layer header */}
                <button onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left">
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-bold tracking-widest text-white/50">{layer.label}</p>
                    <span className="text-xs text-white/20 hidden md:block">{(layer as any).desc}</span>
                  </div>
                  <div className={`text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</div>
                </button>

                <div className="px-4 pb-4">
                  <div className="flex gap-3 flex-wrap">
                    {layer.nodes.map((node, ni) => (
                      <button key={ni} onClick={() => setSelectedNode(selectedNode?.label === node.label ? null : node)}
                        className={`flex items-center gap-2.5 border rounded-xl px-3 py-2 transition-all text-left ${
                          selectedNode?.label === node.label
                            ? 'bg-white/20 border-white/40 shadow-lg'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${node.color}`}>
                          {node.icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{node.label}</p>
                          <p className="text-xs text-white/40">{node.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Node detail */}
                  {selectedNode && layer.nodes.some(n => n.label === selectedNode.label) && (
                    <div className="mt-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      <p className="text-xs font-bold text-white/60 mb-1">{selectedNode.label}</p>
                      <p className="text-xs text-white/50 leading-relaxed">{selectedNode.detail}</p>
                    </div>
                  )}

                  {/* Expanded layer description */}
                  {isExpanded && (
                    <div className="mt-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      <p className="text-xs text-white/40 leading-relaxed">{(layer as any).desc}</p>
                    </div>
                  )}
                </div>
              </div>
              {li < layers.length - 1 && <FlowConnector index={li} />}
            </div>
          );
        })}

        {/* Legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {[
            { title: 'Основные протоколы', items: ['OCPI 2.3.0 · Roaming standard', 'OCPP 2.0.1 · CS protocol', 'ISO 15118 · Plug & Charge (Q1 2028)', 'OAuth 2.0 · API auth', 'TLS 1.3 · Transport security'] },
            { title: 'Ключевые стандарты', items: ['PCI DSS · Card tokenization', 'EMV 3DS2 · Payment auth', 'REST + JSON:API · Interface', 'Webhook · Event delivery', 'OpenAPI 3.0 · Docs'] },
            { title: 'SLA & Надёжность', items: ['99.9% uptime (8.7 ч/год)', 'D+2 Settlement', 'CDR validation real-time', 'Fraud detection < 50 ms', 'API latency P99 < 200 ms'] },
          ].map(col => (
            <div key={col.title} className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs font-bold text-white/40 mb-3 tracking-wider">{col.title.toUpperCase()}</p>
              <div className="space-y-1.5">
                {col.items.map(item => (
                  <div key={item} className="flex items-center gap-2 text-xs text-white/60">
                    <div className="w-1 h-1 bg-sky-400 rounded-full shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortalGate({
  portal,
  title,
  subtitle,
  icon,
  onBack,
  children,
}: {
  portal: AuthPortal;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const { sessions } = useSync();
  if (!sessions[portal]) {
    return <PortalLogin portal={portal} title={title} subtitle={subtitle} icon={icon} onBack={onBack} />;
  }
  return <>{children}</>;
}

/** Shown while a portal's chunk is still downloading. */
function PortalLoading() {
  return (
    <div className="h-full w-full grid place-items-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center"
          style={{ background: 'linear-gradient(135deg,#38BDF8,#0284C7)', animation: 'pulse 1.6s ease-in-out infinite' }}
        >
          <Zap size={17} className="text-white" />
        </div>
        <p className="text-xs text-slate-500">Загружаем портал…</p>
      </div>
    </div>
  );
}

const VALID_PORTALS: Portal[] = ['selector', 'driver', 'operator', 'admin', 'business', 'api', 'architecture'];

/** Lets a portal be deep-linked (?portal=operator) — used by the split view. */
function initialPortal(): Portal {
  try {
    const p = new URLSearchParams(window.location.search).get('portal') as Portal | null;
    if (p && VALID_PORTALS.includes(p)) return p;
  } catch {
    /* SSR-safe no-op */
  }
  return 'selector';
}

export default function App() {
  const { t: tApp } = useI18n();
  const [portal, setPortal] = useState<Portal>(initialPortal);
  const [splitView, setSplitView] = useState(false);
  // Split view embeds the app in iframes; nested chrome there would be noise.
  const embedded = typeof window !== 'undefined' && window.self !== window.top;
  const { sessions } = useSync();
  const driverSession = sessions.driver;
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('oc-theme') === 'dark');

  useEffect(() => {
    localStorage.setItem('oc-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const handler = (e: Event) => {
      const isDark = (e as CustomEvent<{dark: boolean}>).detail.dark;
      setDarkMode(isDark);
    };
    window.addEventListener('oc-theme-change', handler);
    return () => window.removeEventListener('oc-theme-change', handler);
  }, []);

  return (
    <div className={`size-full overflow-hidden${darkMode ? ' dark' : ''}`}>
      <Suspense fallback={<PortalLoading />}>
      {portal === 'selector' && <Landing onSelect={setPortal} onSplitView={() => setSplitView(true)} />}
      {portal === 'driver' && (
        <div className="h-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 30%, #0f1e3a 0%, #080d19 50%, #050810 100%)' }}>
          {/* Animated ambient orbs */}
          <div className="absolute pointer-events-none">
            <div className="anim-orb-1" style={{ position: 'absolute', top: -200, left: -100, width: 500, height: 500, background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(30px)' }} />
            <div className="anim-orb-3" style={{ position: 'absolute', bottom: -100, right: -100, width: 400, height: 400, background: 'radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(30px)' }} />
          </div>
          {/* Dot grid overlay */}
          <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
          {/* Ambient glow behind device */}
          <div className="absolute w-96 h-96 bg-sky-500/8 rounded-full blur-[100px] pointer-events-none" style={{ animation: 'charge-glow 4s ease-in-out infinite' }} />
          {/* Mobile device frame */}
          <div className="relative z-10" style={{ width: 'min(390px, 100vw)', height: 'min(844px, 90vh)', maxWidth: '100%' }}>
            {/* Device body */}
            <div className="absolute inset-0 rounded-[42px] shadow-[0_32px_80px_rgba(0,0,0,0.6),0_0_0_2px_rgba(255,255,255,0.08)] overflow-hidden" style={{ background: 'linear-gradient(135deg, #2a2a2e 0%, #1a1a1e 100%)' }}>
              <div className="absolute inset-[2px] bg-black rounded-[40px] overflow-hidden">
                <div className="w-full h-full bg-white rounded-[40px] overflow-hidden">
                  {driverSession ? (
                    <DriverApp />
                  ) : (
                    <PortalLogin
                      portal="driver"
                      title="Driver App"
                      subtitle={tApp('portal.driver.sub')}
                      icon={<Car size={22} />}
                      onBack={() => setPortal('selector')}
                    />
                  )}
                </div>
              </div>
            </div>
            {/* Dynamic Island */}
            <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-[120px] h-[34px] bg-black rounded-[20px] z-20 flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-slate-800 rounded-full border border-slate-700" />
              <div className="w-3 h-3 bg-slate-800 rounded-full border border-slate-700" />
            </div>
            {/* Side buttons */}
            <div className="absolute right-[-3px] top-28 w-1 h-16 bg-slate-600 rounded-l-full" />
            <div className="absolute left-[-3px] top-24 w-1 h-10 bg-slate-600 rounded-r-full" />
            <div className="absolute left-[-3px] top-36 w-1 h-10 bg-slate-600 rounded-r-full" />
          </div>
          {/* Back button */}
          <button onClick={() => setPortal('selector')}
            className="absolute top-5 left-5 flex items-center gap-2 text-sm text-white/80 bg-white/8 backdrop-blur border border-white/12 px-3 py-2 rounded-xl hover:bg-white/14 transition-colors">
            <ArrowRight size={14} className="rotate-180" /> Порталы
          </button>
          <div className="absolute bottom-5 left-0 right-0 text-center text-xs text-white/25 inter tracking-wider">
            ONE CHARGE · Driver App · iOS / Android
          </div>
        </div>
      )}
      {portal === 'operator' && (
        <PortalGate portal="operator" title="Operator Portal" subtitle={tApp('portal.operator.sub')} icon={<Building2 size={22} />} onBack={() => setPortal('selector')}>
          <div className="h-full overflow-x-auto"><OperatorApp onBack={() => setPortal('selector')} /></div>
        </PortalGate>
      )}
      {portal === 'admin' && (
        <PortalGate portal="admin" title="Admin Control Center" subtitle={tApp('portal.admin.sub')} icon={<Shield size={22} />} onBack={() => setPortal('selector')}>
          <div className="h-full overflow-x-auto"><AdminApp onBack={() => setPortal('selector')} /></div>
        </PortalGate>
      )}
      {portal === 'business' && (
        <PortalGate portal="business" title="Business Portal" subtitle={tApp('portal.business.sub')} icon={<Briefcase size={22} />} onBack={() => setPortal('selector')}>
          <div className="h-full overflow-x-auto"><BusinessApp onBack={() => setPortal('selector')} /></div>
        </PortalGate>
      )}
      {portal === 'api' && (
        <PortalGate portal="api" title="Partner API" subtitle={tApp('portal.api.sub')} icon={<BookOpen size={22} />} onBack={() => setPortal('selector')}>
          <ApiDocsApp onBack={() => setPortal('selector')} />
        </PortalGate>
      )}
      {portal === 'architecture' && <ArchitectureDiagram onBack={() => setPortal('selector')} />}
      </Suspense>
      <SyncToasts />
      {!embedded && (
        <CommandPalette
          onNavigate={p => setPortal(p as Portal)}
          onSplitView={() => setSplitView(true)}
        />
      )}
      {!embedded && portal !== 'selector' && <SyncInspector />}
      {splitView && (
        <Suspense fallback={<PortalLoading />}>
          <SplitView onClose={() => setSplitView(false)} />
        </Suspense>
      )}
    </div>
  );
}

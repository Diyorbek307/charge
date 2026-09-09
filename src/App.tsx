import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Car, Building2, Shield, Globe, ArrowRight, Briefcase, BookOpen, Network, Activity, Radio, BellRing, CircleAlert, Route } from 'lucide-react';
import DriverApp from './components/DriverApp';
import OperatorApp from './components/OperatorApp';
import AdminApp from './components/AdminApp';
import BusinessApp from './components/BusinessApp';
import ApiDocsApp from './components/ApiDocsApp';
import AuthFlow from './components/AuthFlow';

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

// Generates stable particle positions per session
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: (i * 37 + 5) % 95,
  size: (i % 3) + 1,
  dur: 7 + (i % 9),
  delay: -(i * 0.8),
  drift: ((i % 5) - 2) * 40,
  color: ['rgba(56,189,248,0.6)', 'rgba(167,139,250,0.5)', 'rgba(52,211,153,0.5)', 'rgba(251,191,36,0.4)', 'rgba(248,113,113,0.35)'][i % 5],
}));

function LiveTicker() {
  const [sessions, setSessions] = useState(10418);
  const [kwh, setKwh] = useState(847312);
  const [online, setOnline] = useState(241);
  const [revenue, setRevenue] = useState(394.1);

  useEffect(() => {
    const t = setInterval(() => {
      setSessions(s => s + Math.floor(Math.random() * 2));
      setKwh(k => k + Math.floor(Math.random() * 8 + 2));
      setOnline(o => Math.max(230, Math.min(260, o + Math.floor(Math.random() * 5 - 2))));
      setRevenue(r => parseFloat((r + Math.random() * 0.03).toFixed(2)));
    }, 2400);
    return () => clearInterval(t);
  }, []);

  const stats = [
    { label: 'сессий сегодня', value: sessions.toLocaleString(), dot: '#38BDF8', live: true },
    { label: 'кВт·ч сегодня', value: kwh.toLocaleString(), dot: '#4ADE80', live: false },
    { label: 'EVSE онлайн', value: online.toString(), dot: '#FBBF24', live: true },
    { label: 'выручка, млн сум', value: revenue.toFixed(1) + 'M', dot: '#A78BFA', live: false },
  ];

  return (
    <div className="flex items-stretch justify-center gap-0 mb-14 rounded-2xl border border-white/8 overflow-hidden bg-white/[0.03] backdrop-blur-sm divide-x divide-white/8">
      {stats.map(stat => (
        <div key={stat.label} className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stat.dot, boxShadow: stat.live ? `0 0 6px ${stat.dot}` : 'none', animation: stat.live ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : 'none' }} />
            <span className="text-xs text-slate-500 uppercase tracking-wider font-medium inter">{stat.label}</span>
          </div>
          <span className="text-2xl font-bold text-white mono tracking-tight">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

function NetworkPulse({ onSelect }: { onSelect: (portal: Portal) => void }) {
  const [mode, setMode] = useState<'live' | 'forecast'>('live');
  const [stamp, setStamp] = useState('сейчас');

  useEffect(() => {
    const timer = setInterval(() => setStamp('только что'), 6000);
    return () => clearInterval(timer);
  }, []);

  const points = mode === 'live'
    ? '8,42 29,33 48,37 69,18 88,29 110,13 128,23 148,8 168,19 190,11 212,25 234,7 252,16'
    : '8,43 29,38 48,34 69,36 88,25 110,29 128,16 148,22 168,12 190,18 212,10 234,14 252,8';

  return (
    <section className="pulse-panel enter-up delay-225 mb-9 relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.025] px-5 py-4">
      <div className="pulse-scanline" aria-hidden="true" />
      <div className="relative grid grid-cols-[1.15fr_1.4fr_1fr] gap-5 items-center max-lg:grid-cols-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="live-dot w-2 h-2 rounded-full bg-emerald-400" style={{ color: 'rgba(52,211,153,.65)' }} />
            <span className="mono text-[10px] tracking-[0.16em] text-emerald-300 uppercase">Пульс национальной сети</span>
          </div>
          <div className="flex items-baseline gap-3">
            <strong className="text-white text-2xl tracking-tight">99.94%</strong>
            <span className="text-xs text-slate-500 inter">доступность за 24 часа</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mt-2 inter">241 EVSE отвечают штатно. Один узел переведён на профилактику без влияния на маршрут водителей.</p>
        </div>

        <div className="border-x border-white/[0.08] px-5 max-lg:border-x-0 max-lg:border-y max-lg:px-0 max-lg:py-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest inter">Нагрузка · Ташкент</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {(['live', 'forecast'] as const).map(item => <button key={item} onClick={() => setMode(item)} className={`px-2 py-1 rounded-md text-[10px] transition-colors ${mode === item ? 'bg-sky-400/15 text-sky-300' : 'text-slate-600 hover:text-slate-400'}`}>{item === 'live' ? 'LIVE' : 'ПРОГНОЗ'}</button>)}
            </div>
          </div>
          <div className="h-12 relative">
            <svg viewBox="0 0 260 52" className="w-full h-full overflow-visible" preserveAspectRatio="none" aria-label="График нагрузки">
              <defs><linearGradient id="pulseFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#38BDF8" stopOpacity=".28"/><stop offset="100%" stopColor="#38BDF8" stopOpacity="0"/></linearGradient></defs>
              <polyline points={`8,52 ${points} 252,52`} fill="url(#pulseFill)" stroke="none" />
              <polyline points={points} fill="none" stroke="#38BDF8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="pulse-line" />
              <circle cx="234" cy={mode === 'live' ? '7' : '14'} r="3" fill="#7DD3FC" className="pulse-point" />
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mono mt-1"><span>08:00</span><span>пик 17:30</span><span>22:00</span></div>
        </div>

        <div className="space-y-2.5">
          <button onClick={() => onSelect('admin')} className="group w-full text-left flex items-center gap-3 rounded-xl p-2 -m-2 hover:bg-white/[0.045] transition-colors">
            <span className="relative grid place-items-center w-8 h-8 rounded-lg bg-violet-500/12 text-violet-300"><BellRing size={15}/><span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-amber-400 pulse-point" /></span>
            <span className="min-w-0"><span className="block text-xs text-white font-medium">1 сигнал требует внимания</span><span className="block text-[11px] text-slate-500 mt-0.5">EVSE · Yunusobod 04 · {stamp}</span></span><ArrowRight size={14} className="ml-auto text-slate-600 group-hover:text-violet-300 group-hover:translate-x-0.5 transition" />
          </button>
          <button onClick={() => onSelect('architecture')} className="group w-full flex items-center gap-2 text-[11px] text-slate-500 hover:text-sky-300 transition-colors"><Route size={13}/><span>Открыть поток данных и SLA</span><ArrowRight size={12} className="group-hover:translate-x-0.5 transition"/></button>
        </div>
      </div>
    </section>
  );
}

function PortalSelector({ onSelect, darkMode, setDarkMode }: { onSelect: (p: Portal) => void; darkMode: boolean; setDarkMode: (v: (d: boolean) => boolean) => void }) {
  const portals = [
    {
      id: 'driver' as Portal, icon: <Car size={22} />,
      label: 'Driver App', sub: 'Мобильное приложение',
      desc: 'Карта, зарядка, история, AI-планировщик маршрутов, оплата через Humo / Uzcard.',
      grad: 'from-sky-500 to-cyan-400', shadow: 'rgba(14,165,233,0.35)',
      line: 'from-sky-500 via-cyan-400 to-transparent', cta: 'text-sky-400',
      tags: ['iOS / Android', 'QR-зарядка', 'AI Trip', 'Humo'],
    },
    {
      id: 'operator' as Portal, icon: <Building2 size={22} />,
      label: 'Operator Portal', sub: 'Кабинет оператора',
      desc: 'Управление станциями, тарифами, финансами, Settlement D+2, OCPI/OCPP.',
      grad: 'from-emerald-500 to-green-400', shadow: 'rgba(16,185,129,0.35)',
      line: 'from-emerald-500 via-green-400 to-transparent', cta: 'text-emerald-400',
      tags: ['Dashboard', 'OCPI 2.3.0', 'Settlement', 'EVSE Live'],
    },
    {
      id: 'admin' as Portal, icon: <Shield size={22} />,
      label: 'Admin Control Center', sub: 'Национальный мониторинг',
      desc: 'Live Map, AI Insights, Fraud ML, CDR Validation, Settlement, Роли & Права.',
      grad: 'from-violet-500 to-purple-400', shadow: 'rgba(139,92,246,0.35)',
      line: 'from-violet-500 via-purple-400 to-transparent', cta: 'text-violet-400',
      tags: ['Live Map', 'AI Insights', 'Fraud ML', 'Audit Log'],
    },
    {
      id: 'business' as Portal, icon: <Briefcase size={22} />,
      label: 'Business Portal', sub: 'Корпоративный кабинет',
      desc: 'Автопарк, сотрудники, лимиты, CDR-отчёты, IBAN-выплаты.',
      grad: 'from-indigo-500 to-violet-500', shadow: 'rgba(99,102,241,0.35)',
      line: 'from-indigo-500 via-violet-500 to-transparent', cta: 'text-indigo-400',
      tags: ['Fleet', 'Employees', 'Limits', 'Reports'],
    },
    {
      id: 'api' as Portal, icon: <BookOpen size={22} />,
      label: 'Partner API Docs', sub: 'Документация',
      desc: 'REST API v1, OCPI 2.3.0, OAuth 2.0, Remote Start/Stop, CDR, Webhooks.',
      grad: 'from-slate-500 to-slate-400', shadow: 'rgba(100,116,139,0.3)',
      line: 'from-slate-500 via-slate-400 to-transparent', cta: 'text-slate-300',
      tags: ['REST API', 'OCPI 2.3', 'OAuth2', 'Webhooks'],
    },
    {
      id: 'architecture' as Portal, icon: <Network size={22} />,
      label: 'Архитектура', sub: 'Техническая схема',
      desc: 'Визуальная диаграмма всей экосистемы — 6 слоёв от Driver App до SmartGrid.',
      grad: 'from-teal-500 to-cyan-500', shadow: 'rgba(20,184,166,0.35)',
      line: 'from-teal-500 via-cyan-500 to-transparent', cta: 'text-teal-400',
      tags: ['OCPI', 'OCPP', 'Payment', 'SmartGrid'],
    },
  ];

  const staggerDelays = [0, 80, 160, 80, 160, 240];

  const handleTilt = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((y - cy) / cy) * 8;
    const ry = ((cx - x) / cx) * 8;
    el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
  }, []);

  const handleTiltLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = '';
  }, []);

  return (
    <div className="h-full flex flex-col overflow-auto relative" style={{ background: darkMode ? '#020509' : '#050A14', backgroundImage: darkMode ? 'radial-gradient(circle at 50% 0%, #050d1e 0%, #020509 60%)' : 'radial-gradient(circle at 50% 0%, #0a1628 0%, #050A14 60%)' }}>

      {/* Dot grid overlay */}
      <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />

      {/* ── Animated background orbs ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Large orbs */}
        <div className="absolute anim-orb-1" style={{ top: '-15%', right: '-5%', width: 700, height: 700, background: 'radial-gradient(circle, rgba(14,165,233,0.09) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(40px)' }} />
        <div className="absolute anim-orb-2" style={{ top: '40%', left: '-10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(40px)' }} />
        <div className="absolute anim-orb-3" style={{ bottom: '-5%', left: '35%', width: 600, height: 400, background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(50px)' }} />
        <div className="absolute anim-orb-4" style={{ top: '20%', right: '25%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(251,191,36,0.05) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(30px)' }} />

        {/* ── Floating particles ── */}
        {PARTICLES.map(p => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.left}%`,
              bottom: '-4px',
              width: p.size,
              height: p.size,
              background: p.color,
              '--dur': `${p.dur}s`,
              '--delay': `${p.delay}s`,
              '--drift': `${p.drift}px`,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="relative flex flex-col min-h-full px-8 py-8 max-w-[1100px] mx-auto w-full">

        {/* Top nav */}
        <div className="flex items-center justify-between mb-20 enter-up delay-0">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #38BDF8, #0EA5E9, #0284C7)', boxShadow: '0 0 20px rgba(14,165,233,0.5), 0 0 40px rgba(14,165,233,0.2)' }}>
              <Zap size={20} className="text-white absolute inset-0 m-auto" />
              <div className="beam-sweep" />
            </div>
            <div>
              <p className="text-white font-bold text-base tracking-tight leading-none">ONE CHARGE</p>
              <p className="text-slate-600 text-xs mt-0.5">UZ · Prototype Demo · v2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 inter">
              <Globe size={11} /><span>UZ · RU · EN</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/8 border border-emerald-400/15 px-3 py-1.5 rounded-full">
              <div className="live-dot w-1.5 h-1.5 bg-emerald-400 rounded-full" style={{ color: 'rgba(52,211,153,0.6)' }} />
              <span className="inter font-medium">Live</span>
            </div>
            <button onClick={() => setDarkMode(d => !d)} className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors">
              {darkMode ? '☀️' : '🌙'}<span className="hidden md:inline">{darkMode ? ' Светлая' : ' Тёмная'}</span>
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-12">
          {/* Pill badge */}
          <div className="enter-up delay-100 inline-flex items-center gap-2 text-xs text-sky-300/80 bg-sky-400/8 border border-sky-400/15 px-4 py-2 rounded-full mb-8 inter tracking-wide">
            <span className="flex gap-1">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1 h-1 bg-sky-400 rounded-full animate-pulse" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            Национальная eMobility-платформа · Узбекистан · 2026
          </div>

          {/* Headline */}
          <div className="enter-up delay-150">
            <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-white leading-[1.05] tracking-[-0.03em] mb-6">
              Одно приложение.<br />
              <span style={{ background: 'linear-gradient(135deg, #BAE6FD 0%, #38BDF8 40%, #0EA5E9 70%, #7C3AED 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Любая зарядная станция.
              </span>
            </h1>
            <p className="text-slate-400 text-lg max-w-lg mx-auto leading-relaxed font-normal inter">
              Единая экосистема зарядки ЭВ в Узбекистане —<br />
              108 станций · 276 EVSE · 4 оператора · 14 000+ водителей
            </p>
          </div>
        </div>

        {/* Live stats */}
        <div className="enter-up delay-200">
          <LiveTicker />
        </div>

        <NetworkPulse onSelect={onSelect} />

        {/* Section label */}
        <div className="flex items-center gap-3 mb-5 enter-up delay-250">
          <p className="text-xs font-semibold text-slate-600 tracking-widest inter uppercase">Выберите портал</p>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>

        {/* Portal cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {portals.map((portal, i) => (
            <button
              key={portal.id}
              onClick={() => onSelect(portal.id)}
              onMouseMove={handleTilt}
              onMouseLeave={handleTiltLeave}
              className="portal-card group relative border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 text-left overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                animationDelay: `${staggerDelays[i]}ms`,
                animation: `enter-up 0.5s cubic-bezier(0.16,1,0.3,1) ${staggerDelays[i]}ms both`,
                transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease',
              }}
            >
              {/* Top accent line */}
              <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${portal.line} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

              {/* Corner glow on hover */}
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
                style={{ background: portal.shadow }} />

              {/* Icon */}
              <div className={`w-11 h-11 bg-gradient-to-br ${portal.grad} rounded-2xl flex items-center justify-center text-white mb-4 transition-all duration-300 group-hover:scale-110`}
                style={{ boxShadow: `0 4px 16px ${portal.shadow}` }}>
                {portal.icon}
              </div>

              <p className="text-[10px] text-slate-600 font-semibold tracking-wider uppercase inter mb-1.5">{portal.sub}</p>
              <h3 className="text-[15px] font-bold text-white mb-2 leading-tight">{portal.label}</h3>
              <p className="text-[13px] text-slate-400 leading-relaxed mb-4 inter">{portal.desc}</p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {portal.tags.map(tag => (
                  <span key={tag} className="text-[11px] px-2 py-0.5 bg-white/5 text-slate-500 rounded-md border border-white/[0.07] inter transition-colors group-hover:border-white/12 group-hover:text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>

              <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${portal.cta} group-hover:gap-3 transition-all duration-200`}>
                Открыть демо <ArrowRight size={13} />
              </div>
            </button>
          ))}
        </div>

        {/* Footer tech bar */}
        <div className="enter-up delay-400 border border-white/[0.07] rounded-2xl p-5 bg-white/[0.015] relative overflow-hidden">
          <div className="beam-sweep" />
          <p className="text-[10px] font-semibold text-slate-600 mb-4 tracking-widest inter uppercase">Техническая архитектура</p>
          <div className="flex items-center gap-2 flex-wrap text-xs inter">
            {[
              { label: 'DRIVER APP', c: 'text-sky-400 border-sky-500/30 bg-sky-500/8' },
              null,
              { label: 'ONE CHARGE CORE', c: 'text-white border-white/20 bg-white/8', bold: true },
              null,
              { label: 'OCPI 2.3.0 Hub', c: 'text-violet-400 border-violet-500/30 bg-violet-500/8' },
              null,
              { label: 'OPERATORS ×4', c: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8' },
              null,
              { label: 'OCPP 2.0.1', c: 'text-amber-400 border-amber-500/30 bg-amber-500/8' },
              null,
              { label: '276 EVSE', c: 'text-orange-400 border-orange-500/30 bg-orange-500/8' },
            ].map((item, i) => item === null ? (
              <span key={i} className="text-slate-700 text-base">→</span>
            ) : (
              <span key={i} className={`px-2.5 py-1 rounded-lg border font-medium ${item.c} ${item.bold ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 md:gap-6 text-[11px] text-slate-600 inter">
            {['PCI DSS · Card tokenization', 'OCPI 2.3.0 · Roaming', 'OCPP 2.0.1 · CS Management', 'D+2 Settlement · Commission 2–5%', 'ISO 15118 · Plug & Charge Q1 2028'].map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="w-1 h-1 bg-slate-700 rounded-full" />
                {s}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

const changelog = [
  { icon: '🔋', title: 'Кошелёк водителя', desc: 'Пополнение баланса, автопополнение, история транзакций' },
  { icon: '🛡️', title: 'Безопасность', desc: 'PIN-код, Face ID, двухфакторная аутентификация' },
  { icon: '🔔', title: 'Оповещения оператора', desc: 'OCPP алерты, ошибки EVSE, предупреждения в реальном времени' },
  { icon: '📊', title: 'System Health', desc: 'Мониторинг OCPP соединений, API трафик, статус сервисов' },
  { icon: '⚙️', title: 'Настройки приложения', desc: 'Язык, тема, уведомления, единицы измерения' },
  { icon: '🗺️', title: 'Маршрутизатор поездок', desc: 'Планирование маршрута с учётом зарядных остановок' },
];

export default function App() {
  const [portal, setPortal] = useState<Portal>('selector');
  const [driverAuthed, setDriverAuthed] = useState(false);
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
  const [showChangelog, setShowChangelog] = useState(() => !sessionStorage.getItem('cl_seen'));
  const dismissChangelog = () => { sessionStorage.setItem('cl_seen', '1'); setShowChangelog(false); };

  return (
    <div className={`size-full overflow-hidden${darkMode ? ' dark' : ''}`}>
      {portal === 'selector' && <PortalSelector onSelect={p => { if (p === 'driver') setDriverAuthed(false); setPortal(p); }} darkMode={darkMode} setDarkMode={setDarkMode} />}
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
                  {driverAuthed ? <DriverApp /> : <AuthFlow onComplete={() => setDriverAuthed(true)} />}
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
      {portal === 'operator' && <div className="h-full overflow-x-auto"><OperatorApp onBack={() => setPortal('selector')} /></div>}
      {portal === 'admin' && <div className="h-full overflow-x-auto"><AdminApp onBack={() => setPortal('selector')} /></div>}
      {portal === 'business' && <div className="h-full overflow-x-auto"><BusinessApp onBack={() => setPortal('selector')} /></div>}
      {portal === 'api' && <ApiDocsApp onBack={() => setPortal('selector')} />}
      {portal === 'architecture' && <ArchitectureDiagram onBack={() => setPortal('selector')} />}
      {showChangelog && portal === 'selector' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" style={{animation:'fade-in 0.3s ease both'}}>
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl" style={{animation:'scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both'}}>
            {/* Header */}
            <div className="bg-gradient-to-br from-sky-500 to-sky-700 px-6 pt-6 pb-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px'}} />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-sky-200 tracking-widest">ONE CHARGE UZ</span>
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-mono">v1.8.3</span>
                </div>
                <h2 className="text-2xl font-black text-white leading-tight">Что нового?</h2>
                <p className="text-sky-200 text-sm mt-1">Обновление сентябрь 2026</p>
              </div>
            </div>
            {/* Items */}
            <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
              {changelog.map((item, i) => (
                <div key={i} className="flex items-start gap-3" style={{animation: `slide-up 0.4s ${i * 0.06}s cubic-bezier(0.16,1,0.3,1) both`}}>
                  <span className="text-2xl shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div className="px-5 pb-5">
              <button onClick={dismissChangelog}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-2xl transition-colors text-sm">
                Отлично, поехали! 🚀
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, type ReactNode } from 'react';
import OperatorDashboard from './operator/Dashboard';
import OperatorStations from './operator/Stations';
import OperatorTariffs from './operator/Tariffs';
import OperatorFinance from './operator/Finance';
import OperatorCustomers from './operator/Customers';
import OperatorIntegration from './operator/Integration';
import AdminSessions from './admin/Sessions';
import { plural } from '../lib/analytics';
import {
  LayoutDashboard, MapPin, DollarSign, BarChart2,
  Settings, LogOut, Zap, ArrowLeft, Activity,
  CheckCircle,
  Link, Bell, Copy, Eye, EyeOff,
  Plus, Trash2, Shield, Globe, Lock, Users, Menu,
  AlertTriangle, AlertCircle, Info
} from 'lucide-react';
import { useLiveStations, useLiveAlerts } from '../lib/live';
import { useSync } from '../lib/sync';
import { useI18n } from '../lib/i18n';
import SidebarThemeToggle from './SidebarThemeToggle';
import PushToggle from './PushToggle';
import AIChat from './AIChat';

type Page = 'dashboard' | 'stations' | 'sessions' | 'alerts' | 'tariffs' | 'finance' | 'customers' | 'integration' | 'settings' | 'help';

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
  const { t } = useI18n();
  const { sessions, state } = useSync();
  const me = sessions.operator;
  const ownStations = (state?.stations ?? []).filter(st => st.operatorId === me?.orgId).length;
  const openAlerts = (state?.alerts ?? []).filter(a => !a.ack && (!a.operatorId || a.operatorId === me?.orgId)).length;
  const groups = [
    {
      label: t('nav.group.overview'),
      items: [
        { id: 'dashboard' as Page, label: t('nav.dashboard'), icon: <LayoutDashboard size={14} /> },
        { id: 'stations' as Page, label: t('nav.stations'), icon: <MapPin size={14} /> },
        { id: 'sessions' as Page, label: t('nav.sessions'), icon: <Activity size={14} /> },
        { id: 'alerts' as Page, label: t('nav.alerts'), icon: <Bell size={14} />, badge: openAlerts },
      ],
    },
    {
      label: t('nav.finance'),
      items: [
        { id: 'tariffs' as Page, label: t('nav.tariffs'), icon: <DollarSign size={14} /> },
        { id: 'finance' as Page, label: t('nav.finance'), icon: <BarChart2 size={14} /> },
      ],
    },
    {
      label: t('nav.group.clientsSystem'),
      items: [
        { id: 'customers' as Page, label: t('nav.clients'), icon: <Users size={14} /> },
        { id: 'integration' as Page, label: t('nav.integration'), icon: <Link size={14} /> },
        { id: 'settings' as Page, label: t('nav.settings'), icon: <Settings size={14} /> },
        { id: 'help' as Page, label: t('nav.help'), icon: <Bell size={14} /> },
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
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>{(me?.org ?? 'O')[0]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{me?.org ?? 'Оператор'}</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>{me?.name} · {ownStations} {plural(ownStations, ['станция', 'станции', 'станций'])}</p>
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
          <LogOut size={14} />{t('nav.signOutPortal')}
        </button>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

function StationDetailPage({ stationId, onBack }: { stationId: string; onBack: () => void }) {
  const { t } = useI18n();
  const stations = useLiveStations();
  const { actions, refresh, state } = useSync();
  const [busyConnector, setBusyConnector] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const s = stations.find(st => st.id === stationId) || stations[0];

  /** Takes an EVSE in or out of service for the whole platform. */
  const toggleConnector = async (connectorId: string, status: string) => {
    setBusyConnector(connectorId);
    setActionError(null);
    try {
      await actions.setConnectorStatus(
        'operator',
        s.id,
        connectorId,
        status === 'unavailable' ? 'available' : 'unavailable',
      );
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось изменить статус');
    } finally {
      setBusyConnector(null);
    }
  };

  /** Remote-stops whoever is charging on this connector. */
  const stopConnectorSession = async (connectorId: string) => {
    const live = state?.sessions.find(
      x => x.status === 'active' && x.stationId === s.id && x.connectorId === connectorId,
    );
    if (!live) {
      setActionError('Активная сессия не найдена');
      return;
    }
    setBusyConnector(connectorId);
    setActionError(null);
    try {
      await actions.stopSession('operator', live.id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось остановить сессию');
    } finally {
      setBusyConnector(null);
    }
  };
  const statusBgs: Record<string, string> = { available: 'bg-green-100 text-green-700', occupied: 'bg-red-100 text-red-700', unavailable: 'bg-slate-100 text-slate-500', reserved: 'bg-amber-100 text-amber-700' };
  const statusLabels: Record<string, string> = { available: 'Свободно', occupied: 'Занято', unavailable: 'Недоступно', reserved: 'Забронировано' };

  // Re-render every few seconds so durations and averages stay current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const runningOn = (connectorId: string) =>
    state?.sessions.find(x => x.status === 'active' && x.stationId === s.id && x.connectorId === connectorId);
  const stationSessions = (state?.sessions ?? []).filter(x => x.stationId === s.id).slice(0, 8);

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
        <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: t('lbl2.openingHours'), value: s.hours },
            { label: t('lbl2.maxPower'), value: `${s.totalPower} кВт` },
            { label: t('lbl2.rating'), value: `⭐ ${s.rating.toFixed(1)} (${s.reviews})` },
            { label: t('lbl2.connectorType'), value: [...new Set(s.connectors.map(c => c.type))].join(', ') },
            { label: t('lbl2.available'), value: `${s.connectors.filter(c => c.status === 'available').length}/${s.connectors.length} EVSE` },
            { label: t('lbl2.services'), value: s.amenities.join(', ') || '—' },
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
            Разъёмы — реальное время
          </h3>
          <span className="text-xs text-slate-400">средняя мощность текущей сессии</span>
        </div>
        {actionError && (
          <div role="alert" className="mx-5 mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-px" />
            <span>{actionError}</span>
          </div>
        )}
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
                {c.status === 'occupied' ? (() => {
                  const run = runningOn(c.id);
                  const hours = run ? Math.max(1 / 60, (Date.now() - Date.parse(run.start)) / 3_600_000) : 0;
                  const avgKw = run ? Math.min(c.power, run.energy / hours) : 0;
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">{run ? `${run.user} · ${Math.round(hours * 60)} мин · ${run.energy} кВт·ч` : 'Идёт зарядка'}</span>
                        <span className="text-sm font-bold text-sky-600 mono">≈ {avgKw.toFixed(0)} кВт</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-400 rounded-full transition-all duration-700" style={{ width: `${(avgKw / c.power) * 100}%` }} />
                      </div>
                    </div>
                  );
                })() : (
                  <div className="h-2 bg-slate-100 rounded-full" />
                )}
              </div>
              <div className="text-right">
                <span className={`text-xs px-2.5 py-1 rounded-full ${statusBgs[c.status]}`}>{statusLabels[c.status]}</span>
                <p className="text-xs text-slate-400 mt-1 mono">{c.price.toLocaleString()} сум/кВт·ч</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => toggleConnector(c.id, c.status)}
                  disabled={busyConnector === c.id || c.status === 'occupied'}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyConnector === c.id ? '…' : c.status === 'unavailable' ? 'Включить' : 'Вывести из работы'}
                </button>
                {c.status === 'occupied' && (
                  <button
                    onClick={() => stopConnectorSession(c.id)}
                    disabled={busyConnector === c.id}
                    className="px-2.5 py-1.5 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 border border-red-200 disabled:opacity-40"
                  >
                    {busyConnector === c.id ? '…' : 'Остановить'}
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
          {stationSessions.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">Сессий на этой станции пока нет</p>}
          {stationSessions.map(sess => (
            <div key={sess.id} className="px-5 py-3 flex items-center flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-xs text-sky-600 mono w-20">{sess.id}</span>
              <span className="text-slate-700 flex-1 min-w-24">{sess.user}</span>
              <span className="text-xs text-slate-400">{new Date(sess.start).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="text-xs text-slate-500">{sess.connector} · {sess.energy} кВт·ч</span>
              <span className="font-medium mono text-slate-800">{sess.status === 'failed' ? '—' : `${sess.cost.toLocaleString('ru-RU')} сум`}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg[sess.status]}`}>{statusLabel[sess.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const { t } = useI18n();
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
      <h1 className="text-xl font-bold text-slate-900">{t('page.settingsApi')}</h1>

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
            { label: t('lbl2.version'), value: 'OCPI 2.3.0' },
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
            { label: t('lbl2.name'), value: 'GreenCharge UZ LLC' },
            { label: t('lbl2.taxId'), value: '312 847 120' },
            { label: 'Email', value: 'tech@greencharge.uz' },
            { label: 'IBAN', value: 'UZ21 0080 8000 0000 0001 2345 67' },
            { label: t('lbl2.bank'), value: 'Kapitalbank' },
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
  const { t } = useI18n();
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
    { icon: '📧', label: 'Email поддержки', value: 'operator@onecharge.uz', sub: t('sub.replyWithin2Hours') },
    { icon: '📱', label: t('lbl2.phone'), value: '+998 71 200-00-01', sub: t('sub.monFri9001800') },
    { icon: '💬', label: 'Telegram', value: '@onecharge_support', sub: t('sub.online247') },
    { icon: '📖', label: t('lbl2.documentation'), value: 'docs.onecharge.uz', sub: t('sub.apiOcpiWebhooks') },
  ];

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('page.help')}</h1>
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
          { icon: '📖', label: t('lbl2.documentation'), sub: t('sub.apiOcpiGuides'), color: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
          { icon: '🎓', label: t('lbl2.training'), sub: t('sub.videoLessonsAndWebinars'), color: '#F5F3FF', border: '#DDD6FE', text: '#2F3DB8' },
          { icon: '🐛', label: t('lbl2.bugReport'), sub: t('sub.reportAProblem'), color: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
          { icon: '💡', label: t('lbl2.ideas'), sub: t('sub.suggestAnImprovement'), color: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
        ].map(c => (
          <button key={c.label} className="rounded-2xl p-4 text-left hover:scale-[1.02] active:scale-98 transition-all"
            style={{ background: c.color, border: `1px solid ${c.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-sm font-bold" style={{ color: c.text }}>{c.label}</p>
            <p className="text-xs mt-0.5" style={{ color: c.text + 'aa' }}>{c.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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

/** Human titles for alert codes; OCPP faults carry the charger's error code. */
function alertTitle(code: string) {
  const known: Record<string, string> = {
    EVSE_UNAVAILABLE: 'Разъём не отвечает',
    POWER_DERATE: 'Снижение мощности',
    RESERVATION: 'Разъём забронирован',
    DRIVER_REPORT: 'Жалоба водителя',
  };
  if (known[code]) return known[code];
  if (code.startsWith('OCPP_')) return `Неисправность станции · ${code.slice(5)}`;
  return code.replace(/_/g, ' ');
}

function AlertsPage() {
  const { t } = useI18n();
  const { actions, refresh, sessions: portalSessions } = useSync();
  const myNetwork = portalSessions.operator?.orgId;
  // An operator only sees its own network's alerts, plus platform-wide ones.
  const liveAlerts = useLiveAlerts().filter(a => !a.operatorId || a.operatorId === myNetwork);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  // Alerts raised by the platform come first; the bundled ones pad the list out.
  const alertsData = [
    ...liveAlerts.map(a => ({
      id: a.id,
      severity: a.severity,
      title: alertTitle(a.code),
      desc: a.message,
      station: a.station,
      time: new Date(a.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      code: a.code,
      live: true,
      ack: a.ack,
    })),
  ];

  /** Acknowledging a live alert clears it for every portal, not just this tab. */
  const resolveAlert = async (id: string) => {
    setResolved(prev => new Set([...prev, id]));
    if (liveAlerts.some(a => a.id === id)) {
      try {
        await actions.ackAlert('operator', id);
        await refresh();
      } catch {
        /* optimistic update already applied */
      }
    }
  };

  const isResolved = (a: { id: string; ack: boolean }) => resolved.has(a.id) || a.ack;

  const filtered = alertsData.filter(a => filter === 'all' || a.severity === filter);
  const active = filtered.filter(a => !isResolved(a));
  const resolvedFiltered = filtered.filter(a => isResolved(a));
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
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('page.alerts')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{alertsData.length} {plural(alertsData.length, ['оповещение', 'оповещения', 'оповещений'])} всего</p>
        </div>
        <button
          onClick={() => setResolved(new Set(alertsData.map(a => a.id)))}
          className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Все прочитано
        </button>
      </div>

      <PushToggle portal="operator" compact />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="flex gap-2 flex-wrap">
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
              onClick={() => resolveAlert(alert.id)}
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

  const [station, setStation] = useState<string | null>(null);
  const go = (p: string) => { setStation(null); setPage(p as Page); };
  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      stations: station ? <StationDetailPage stationId={station} onBack={() => setStation(null)} /> : <OperatorStations onOpen={setStation} />,
      sessions: <AdminSessions portal="operator" />, alerts: <AlertsPage />, tariffs: <OperatorTariffs />,
      finance: <OperatorFinance />, customers: <OperatorCustomers />,
      integration: <OperatorIntegration />, settings: <SettingsPage />, help: <HelpPage />,
    };
    return (
      <div key={page + (station ?? '')} className="animate-fade-in h-full">
        {pages[page] ?? <OperatorDashboard onNavigate={go} />}
      </div>
    );
  };

  return (
    <div className="h-full flex relative dash-surface">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-20" />}
      <Sidebar current={page} onChange={go} onBack={onBack} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-hidden relative">
        <button onClick={() => setSidebarOpen(true)} aria-label="Открыть меню" className="md:hidden absolute top-3 left-3 z-10 p-2 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-600">
          <Menu size={18} />
        </button>
        {renderPage()}
      </div>
      <AIChat portalType="operator" />
    </div>
  );
}

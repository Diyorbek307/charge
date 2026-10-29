import { useEffect, useState } from 'react';
import { ArrowLeft, Cable, CheckCircle, LoaderCircle, Zap, X } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { useLiveStations } from '../../lib/live';
import { useMyLocation, km, fmtKm } from '../../lib/geo';

const left = (iso: string) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));

/**
 * Autocharge: link the car once at a fast charger, then plugging in is
 * enough — the charger recognises the car and the charge starts, paid from
 * the wallet. Works on chargers connected to PowerGo directly (OCPP).
 */
export default function AutochargeScreen({ onBack }: { onBack: () => void }) {
  const { state, actions, refresh } = useSync();
  const stations = useLiveStations();
  const here = useMyLocation();
  const ac = state?.autocharge;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  // The window counts down; the link shows up by itself when the charger reports the car.
  useEffect(() => {
    if (!ac?.linking) return;
    const t = setInterval(() => tick(n => n + 1), 15_000);
    return () => clearInterval(t);
  }, [ac?.linking]);

  const direct = stations
    .filter(s => (s as typeof s & { ocpp?: { online?: boolean } }).ocpp?.online && s.connectors.some(c => c.power >= 50))
    .map(s => ({ s, d: here ? km(here, { lat: s.geoLat, lng: s.geoLng }) : null }))
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
    .slice(0, 6);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const linkingAt = ac?.linking ? stations.find(s => s.id === ac.linking!.stationId) : null;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <div>
          <h1 className="text-base font-bold text-slate-900">Autocharge</h1>
          <p className="text-xs text-slate-500">Подключили кабель — зарядка пошла</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: 'linear-gradient(150deg,#1F1F1F,#0A0A0A)' }}>
          <span className="absolute -right-8 -bottom-8 w-40 h-40 rounded-full opacity-25 pg-float" style={{ background: 'radial-gradient(circle,#34D399,transparent 65%)' }} aria-hidden="true" />
          <Cable size={28} className="text-[#FFC83D]" />
          <p className="mt-2 text-lg font-bold">Без QR, без телефона</p>
          <p className="text-sm text-white/65 mt-1">Быстрая станция узнаёт вашу машину по кабелю и сама запускает зарядку. Оплата — с кошелька, чек придёт в приложение.</p>
        </div>

        {ac?.cars.length ? (
          <div className="bg-white rounded-2xl border border-emerald-100 p-4 pg-reveal">
            <p className="text-sm font-bold text-slate-900 flex items-center gap-2"><CheckCircle size={17} className="text-emerald-500" />Autocharge включён</p>
            {ac.cars.map(c => (
              <p key={c.carId} className="text-xs text-slate-500 mt-1">{`${c.car ?? 'Машина'} · ID ${c.carId} · с ${new Date(c.since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}</p>
            ))}
            <p className="text-xs text-slate-500 mt-2">Работает на станциях, подключённых к PowerGo напрямую. На остальных — как обычно, через приложение.</p>
            <button onClick={() => void run(() => actions.unlinkAutocharge())} disabled={busy} className="mt-3 w-full py-2.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><X size={14} />Выключить Autocharge</button>
          </div>
        ) : ac?.linking ? (
          <div className="bg-white rounded-2xl border border-amber-200 p-4 pg-reveal">
            <p className="text-sm font-bold text-slate-900 flex items-center gap-2"><LoaderCircle size={16} className="animate-spin text-[#FFB000]" />Ждём машину</p>
            <p className="text-sm text-slate-600 mt-1">{`Подключите кабель на станции ${linkingAt?.name ?? ''}. Станция передаст ID машины — и всё.`}</p>
            <p className="text-xs text-slate-400 mt-1">{`Окно открыто ещё ${left(ac.linking.until)} мин`}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-bold text-slate-900">Связать машину</p>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">Один раз: выберите станцию, у которой стоите, и подключите кабель.</p>
            {direct.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-3">Сейчас нет быстрых станций, подключённых напрямую. Autocharge заработает, как только сети подключат их к PowerGo по OCPP.</p>
            ) : (
              <div className="space-y-2">
                {direct.map(({ s, d }) => (
                  <button key={s.id} onClick={() => void run(() => actions.linkAutocharge(s.id))} disabled={busy}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50 hover:border-[#FFB000] text-left disabled:opacity-50">
                    <span className="w-9 h-9 rounded-xl bg-[#111] text-[#FFC83D] grid place-items-center shrink-0"><Zap size={16} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                      <span className="block text-xs text-slate-500">{`${s.operator}${d !== null ? ` · ${fmtKm(d)}` : ''}`}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-600">Я здесь</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 pg-shake">{error}</p>}
        <p className="text-[11px] text-slate-400 px-1">Станция видит уникальный ID машины (EVCCID) — по нему и узнаёт. Одна машина — один водитель; выключить можно в любой момент.</p>
      </div>
    </div>
  );
}

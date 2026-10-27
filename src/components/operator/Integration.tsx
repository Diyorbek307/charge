import { useCallback, useEffect, useState } from 'react';
import { PlugZap, Wifi, WifiOff, RotateCcw, Radio, Unlock, Copy, Check, Terminal, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { ChargePointInfo, OcppLogEntry } from '../../lib/api';
import { num, dateTime, time } from '../../lib/analytics';
import { Page, Card, Kpi, Pill, Empty, ErrorNote } from '../admin/ui';

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2">
      <code className="flex-1 text-xs text-emerald-300 break-all">{text}</code>
      <button
        onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
        aria-label="Скопировать"
        className="p-1 text-slate-400 hover:text-white"
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

/**
 * OCPP 1.6-J integration: which chargers are connected, maintenance
 * commands to them, and the live message log from the central system.
 */
export default function OperatorIntegration() {
  const { state, sessions, actions, events } = useSync();
  const org = sessions.operator?.orgId;
  const [points, setPoints] = useState<ChargePointInfo[]>([]);
  const [log, setLog] = useState<OcppLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    actions.ocppChargepoints('operator').then(setPoints).catch(() => {});
    actions.ocppLog('operator').then(setLog).catch(() => {});
  }, [actions]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  const lastOcpp = events.find(e => e.type.startsWith('ocpp.'))?.id;
  useEffect(() => {
    if (lastOcpp) load();
  }, [lastOcpp, load]);

  const own = (state?.stations ?? []).filter(s => s.operatorId === org);
  const online = new Map(points.map(p => [p.stationId, p]));
  const origin = typeof location !== 'undefined' ? location.origin.replace(/^http/, 'ws') : 'wss://…';
  const example = own[0]?.id ?? 'st-001';

  const send = async (stationId: string, body: { action: string; type?: string; requestedMessage?: string; connectorId?: string }, label: string) => {
    setBusy(`${stationId}:${label}`);
    setResult(null);
    try {
      const r = await actions.ocppCommand('operator', stationId, body);
      setResult({ ok: true, text: `${label}: станция ответила «${r.status}»` });
    } catch (e) {
      setResult({ ok: false, text: `${label}: ${(e as Error).message}` });
    } finally {
      setBusy(null);
      load();
    }
  };

  return (
    <Page title="Интеграция OCPP" subtitle="Подключение зарядных станций к центральной системе по OCPP 1.6-J">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Станций в сети" value={own.length} icon={<PlugZap size={14} />} tone="sky" />
        <Kpi label="На связи по OCPP" value={points.length} sub={points.length ? 'обмениваются сообщениями' : 'подключите первую станцию'} icon={<Wifi size={14} />} tone="emerald" />
        <Kpi label="Ждут подключения" value={own.filter(s => s.ocpp?.awaiting && !online.has(s.id)).length} sub="созданы в кабинете" icon={<WifiOff size={14} />} tone="amber" />
        <Kpi label="Сообщений в журнале" value={num(log.length)} sub="последние 100" icon={<Radio size={14} />} tone="violet" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Как подключить станцию">
          <ol className="space-y-3 text-sm text-slate-600 list-decimal pl-5">
            <li>В настройках зарядного устройства укажите адрес центральной системы:<div className="mt-1.5"><CopyLine text={`${origin}/ocpp/${example}`} /></div></li>
            <li>{`Протокол OCPP 1.6-J (WebSocket, подпротокол ocpp1.6), авторизация Basic: логин — ID станции (например ${example}), пароль — ключ OCPP вашей сети от администратора платформы.`}</li>
            <li>После BootNotification и StatusNotification разъёмы станут доступны водителям, а здесь появится статус «На связи».</li>
          </ol>
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2"><Terminal size={12} />Проверить без железа — симулятор из репозитория</p>
            <CopyLine text={`node scripts/ocpp-simulator.mjs --url ${origin} --station ${example}`} />
          </div>
        </Card>

        <Card title="Поддерживаемые сообщения">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase mb-2"><ArrowDownLeft size={12} />От станции</p>
              <ul className="space-y-1 text-slate-700">{['BootNotification', 'Heartbeat', 'StatusNotification', 'Authorize', 'StartTransaction', 'MeterValues', 'StopTransaction'].map(m => <li key={m} className="font-mono text-xs">{m}</li>)}</ul>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase mb-2"><ArrowUpRight size={12} />К станции</p>
              <ul className="space-y-1 text-slate-700">{['RemoteStartTransaction', 'RemoteStopTransaction', 'Reset', 'TriggerMessage', 'UnlockConnector'].map(m => <li key={m} className="font-mono text-xs">{m}</li>)}</ul>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">OCPP 2.0.1 и роуминг OCPI 2.3 — в дорожной карте платформы.</p>
        </Card>
      </div>

      {result && (result.ok ? <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{result.text}</p> : <ErrorNote text={result.text} />)}

      <Card pad={false} title="Станции и команды">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-y border-slate-50">
                <th className="px-5 py-2.5 font-semibold">Станция</th>
                <th className="px-5 py-2.5 font-semibold">Статус OCPP</th>
                <th className="px-5 py-2.5 font-semibold">Последний сигнал</th>
                <th className="px-5 py-2.5 font-semibold">Команды</th>
              </tr>
            </thead>
            <tbody>
              {own.map(s => {
                const cp = online.get(s.id);
                const disabled = !cp || !!busy;
                return (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5"><p className="font-semibold text-slate-800">{s.name}</p><p className="text-[11px] text-slate-400 font-mono">{s.id}</p></td>
                    <td className="px-5 py-2.5">{cp ? <Pill tone="green"><Wifi size={11} />На связи</Pill> : s.ocpp?.awaiting ? <Pill tone="amber">Ждёт подключения</Pill> : <Pill tone="slate"><WifiOff size={11} />Не подключена</Pill>}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">{cp?.lastSeen ? dateTime(cp.lastSeen) : '—'}</td>
                    <td className="px-5 py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        <button disabled={disabled} onClick={() => send(s.id, { action: 'Reset', type: 'Soft' }, 'Мягкая перезагрузка')} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40"><RotateCcw size={11} />Перезагрузить</button>
                        <button disabled={disabled} onClick={() => send(s.id, { action: 'TriggerMessage', requestedMessage: 'StatusNotification' }, 'Запрос статуса')} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40"><Radio size={11} />Статус</button>
                        <button disabled={disabled} onClick={() => send(s.id, { action: 'UnlockConnector', connectorId: s.connectors[0]?.id }, 'Разблокировка разъёма')} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40"><Unlock size={11} />Разблокировать</button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">Команды доступны для станций на связи. Ответ станции попадает в журнал ниже и в журнал аудита платформы.</p>
      </Card>

      <Card pad={false} title={<span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Журнал OCPP</span>} right={<span className="text-xs text-slate-400">обновляется каждые 5 секунд</span>}>
        {log.length === 0 ? (
          <Empty text="Сообщений пока нет — они появятся, когда станция подключится" />
        ) : (
          <div className="bg-slate-950 mx-5 mb-5 rounded-xl p-3 font-mono text-xs max-h-80 overflow-y-auto space-y-1">
            {log.map((e, i) => (
              <p key={`${e.ts}-${i}`} className="text-slate-300">
                <span className="text-slate-500">{time(e.ts)}</span>{' '}
                <span className={e.dir === 'in' ? 'text-sky-400' : 'text-amber-400'}>{e.dir === 'in' ? '←' : '→'}</span>{' '}
                <span className="text-slate-400">{e.stationId}</span>{' '}
                <span className="text-white">{e.action}</span>
                {e.detail && <span className="text-emerald-300"> {e.detail}</span>}
              </p>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

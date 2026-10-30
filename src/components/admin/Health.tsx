import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Server, Database, Radio, Cpu, Bell, MessageSquare, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import type { SystemHealth } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill } from './ui';

const uptime = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`;
};

/** What the server reports about itself right now, refreshed every 10 seconds. */
export default function AdminHealth() {
  const { actions, connection } = useSync();
  const [data, setData] = useState<SystemHealth | null>(null);
  const [error, setError] = useState('');
  const [ms, setMs] = useState<number | null>(null);

  const load = useCallback(() => {
    const t0 = performance.now();
    actions
      .systemHealth('admin')
      .then(r => { setData(r); setMs(Math.round(performance.now() - t0)); setError(''); })
      .catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <Page title="Состояние системы">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const w = data.webhooks;

  const rows: { icon: ReactNode; name: string; ok: boolean; detail: string }[] = [
    { icon: <Server size={15} />, name: 'API-сервер', ok: true, detail: `ответ за ${ms ?? '—'} мс · работает ${uptime(data.uptimeSec)} · Node ${data.node}` },
    { icon: <Database size={15} />, name: 'Хранилище', ok: true, detail: data.storage === 'postgres' ? 'PostgreSQL' : 'Файл JSON на диске сервера — для продакшена нужен PostgreSQL (DATABASE_URL)' },
    { icon: <Radio size={15} />, name: 'Живая синхронизация (SSE)', ok: connection === 'live', detail: `${data.live.sseClients} подключённых вкладок · ${num(data.live.eventsLastHour)} событий за час` },
    { icon: <Cpu size={15} />, name: 'OCPP 1.6-J', ok: true, detail: data.ocpp.connected ? `${data.ocpp.connected} станций на связи` : 'Ни одна станция сейчас не подключена по OCPP' },
    { icon: <Bell size={15} />, name: 'Вебхуки', ok: w.failed === 0, detail: `${w.active} из ${w.endpoints} endpoint’ов активны · в очереди ${w.pending} · доставлено ${w.delivered} · с ошибкой ${w.failed}` },
    { icon: <MessageSquare size={15} />, name: 'SMS-шлюз', ok: data.sms, detail: data.sms ? 'Настроен' : 'Не настроен — коды входа показываются на экране (демо-режим)' },
    { icon: <Bell size={15} />, name: 'Письма команде', ok: !!data.mail?.configured, detail: data.mail?.configured ? `Заявки, поддержка и SOS приходят по ящикам: ${data.mail.to}` : `Не настроены — нужны SMTP_HOST, SMTP_USER и SMTP_PASS; письма пойдут на ящики @voli.uz` },
  ];

  return (
    <Page
      title="Состояние системы"
      subtitle={`Данные сервера на ${dateTime(data.time)} · обновляется каждые 10 секунд`}
      actions={<button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 bg-white"><RefreshCw size={13} />Обновить</button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Аптайм процесса" value={uptime(data.uptimeSec)} sub="с последнего запуска" icon={<Server size={14} />} tone="emerald" />
        <Kpi label="Память" value={`${data.memoryMb.rss} МБ`} sub={`куча ${data.memoryMb.heap} МБ`} icon={<Cpu size={14} />} tone="sky" />
        <Kpi label="Идут зарядки" value={data.live.activeSessions} sub={`${data.live.tokens} активных входов`} icon={<Radio size={14} />} tone="violet" />
        <Kpi label="Задержка API" value={ms === null ? '—' : `${ms} мс`} sub="из вашего браузера" icon={<RefreshCw size={14} />} tone="amber" />
      </div>

      <Card pad={false} title="Компоненты">
        <ul className="divide-y divide-slate-50">
          {rows.map(r => (
            <li key={r.name} className="px-5 py-3 flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-500">{r.detail}</p>
              </div>
              {r.ok ? <Pill tone="green"><CheckCircle size={11} />В норме</Pill> : <Pill tone="amber"><AlertTriangle size={11} />Внимание</Pill>}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Данные в базе">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries({ stations: 'Станции', sessions: 'Сессии', transactions: 'Транзакции', events: 'События', accounts: 'Учётные записи', customers: 'Водители' }).map(([k, label]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="font-bold text-slate-800 tabular-nums">{num(data.records[k] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Режим">
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex justify-between gap-3"><span>Демо-режим</span><Pill tone={data.demo.mode ? 'amber' : 'green'}>{data.demo.mode ? 'включён' : 'выключен'}</Pill></li>
            <li className="flex justify-between gap-3"><span>Симуляция живой сети</span><Pill tone={data.demo.simulation ? 'amber' : 'slate'}>{data.demo.simulation ? 'идёт' : 'выключена'}</Pill></li>
          </ul>
          {w.lastError && <p className="mt-4 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{`Последняя ошибка вебхука: ${w.lastError.url} — ${w.lastError.error} (${dateTime(w.lastError.at)})`}</p>}
          {data.demo.mode && <p className="mt-4 text-xs text-slate-500">Перед запуском: DEMO_MODE=false, ключи Payme/Click, SMS-шлюз и DATABASE_URL — переменные описаны в README.</p>}
        </Card>
      </div>
    </Page>
  );
}

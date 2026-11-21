import { useCallback, useEffect, useState } from 'react';
import { Waypoints, RefreshCw, LoaderCircle } from 'lucide-react';
import type { UzgridStart, UzgridStatus } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime } from '../../lib/analytics';
import { Card, Pill } from './ui';

const START_RESULT: Record<UzgridStart['result'], string> = {
  sent: 'команда отправлена, ждём станцию',
  accepted: 'станция приняла команду',
  started: 'зарядка началась',
  rejected: 'станция отказала',
  refused: 'UZGRID отказал',
};

/** How the last start went, with what UZGRID support asks for: the time and the request_id. */
function LastStart({ s }: { s: UzgridStart }) {
  const bad = s.result === 'refused' || s.result === 'rejected';
  return (
    <div className="mt-2 text-xs">
      <p className={bad ? 'text-red-600' : 'text-slate-600'}>
        {`Последний запуск: ${dateTime(s.at)} · ${START_RESULT[s.result]}`}{s.code && <span className="font-mono" data-no-translate>{` (${s.code})`}</span>}
      </p>
      <p className="text-slate-400 truncate" title={s.where}>{s.where}</p>
      {(s.requestId || s.commandId) && (
        <p className="text-slate-400 font-mono select-all break-all" data-no-translate>
          {[s.requestId && `request_id ${s.requestId}`, s.commandId && `command_id ${s.commandId}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

/**
 * The UZGRID hub (Vendor API): networks such as Pulse come to Voli through it.
 * It is switched on by UZGRID_API_KEY in Render, never typed here.
 */
export function UzgridHub({ onChanged }: { onChanged: () => void }) {
  const { actions } = useSync();
  const [data, setData] = useState<UzgridStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    actions.uzgrid('admin').then(setData).catch(e => setNote({ ok: false, text: (e as Error).message }));
  }, [actions]);
  useEffect(load, [load]);

  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await actions.syncUzgrid('admin');
      setNote({ ok: true, text: `Станции обновлены: ${r.stations}` });
      setData(r);
      onChanged();
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Waypoints size={16} />Хаб UZGRID</span>}
      right={data && (data.enabled ? <Pill tone={data.error ? 'red' : 'green'}>{data.error ? 'Ошибка' : data.sandbox ? 'Подключён · тест' : 'Подключён'}</Pill> : <Pill tone="slate">Не подключён</Pill>)}
    >
      <p className="text-sm text-slate-500">Сети, которые работают через хаб UZGRID (например, Pulse): станции, цены и статусы приходят от UZGRID, запуск и остановка зарядки идут через него.</p>
      {note && <p role="status" className={`mt-3 text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}
      {data && !data.enabled && <p className="mt-3 text-sm text-slate-600">Чтобы подключить, впишите ключ из кабинета UZGRID в Render → Environment → UZGRID_API_KEY.</p>}
      {data?.enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-slate-100 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs text-slate-500">{`Станций: ${data.stations} · обновлено ${data.lastSync ? dateTime(data.lastSync) : '—'}`}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5" data-no-translate>{data.base}</p>
            {data.error && <p className="text-xs text-red-600 mt-0.5">{data.error}</p>}
            {data.lastStart && <LastStart s={data.lastStart} />}
          </div>
          <button onClick={sync} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {busy ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}Обновить станции
          </button>
        </div>
      )}
    </Card>
  );
}

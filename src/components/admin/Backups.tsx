import { useCallback, useEffect, useState } from 'react';
import { Archive, Download, LoaderCircle, ShieldCheck } from 'lucide-react';
import { downloadBackup, type BackupInfo } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { Card, Pill } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
const kb = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} МБ` : `${Math.round(b / 1024)} КБ`);

/**
 * The nightly copies of the database: when each was made, how big, that it
 * was checked against the live data, whether it left the server encrypted,
 * and a button to take one now or save one to this computer.
 */
export default function Backups() {
  const { actions } = useSync();
  const [list, setList] = useState<{ backups: BackupInfo[]; offsite: boolean; keep: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    actions.adminBackups().then(setList).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load]);

  const take = async () => {
    setBusy(true);
    setError('');
    try {
      await actions.takeBackup();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (name: string) => downloadBackup(name).catch(e => setError((e as Error).message));

  return (
    <Card pad={false}
      title={<span className="inline-flex items-center gap-2"><Archive size={15} />Резервные копии</span>}
      right={<button onClick={take} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-xs font-semibold disabled:opacity-50">{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Archive size={13} />}Сделать копию сейчас</button>}>
      <p className="px-5 pt-3 text-xs text-slate-500">
        {`Каждую ночь в 3–6 утра, хранятся ${list?.keep ?? 14} последних; каждая сразу проверяется по базе. `}
        {list?.offsite ? 'Зашифрованная копия уходит письмом в отдельный ящик.' : 'Копии только на сервере — чтобы отправлять их зашифрованными в отдельный ящик, задайте BACKUP_KEY (и при желании BACKUP_EMAIL).'}
      </p>
      {error && <p className="mx-5 mt-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      {list && !list.backups.length && <p className="px-5 py-4 text-sm text-slate-500">Копий ещё нет — первая будет сегодня ночью, или нажмите «Сделать копию сейчас».</p>}
      {!!list?.backups.length && (
        <ul className="divide-y divide-slate-50 mt-2">
          {list.backups.slice(0, 7).map(b => (
            <li key={b.name} className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[180px]">
                <span className="block text-sm font-semibold text-slate-800">{when(b.takenAt)}</span>
                <span className="block text-xs text-slate-500">{`${kb(b.bytes)} · водителей и сотрудников ${b.counts.accounts ?? 0} · зарядок ${b.counts.sessions ?? 0}${b.by !== 'расписание' ? ` · сделал ${b.by}` : ''}`}</span>
              </span>
              {b.verified && <Pill tone="green"><ShieldCheck size={11} />проверена</Pill>}
              {b.offsite && <Pill tone="slate">{`в ящике ${b.offsite.to}`}</Pill>}
              <button onClick={() => void save(b.name)} aria-label={`Скачать копию за ${when(b.takenAt)}`} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800"><Download size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

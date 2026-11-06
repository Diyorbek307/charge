import { useCallback, useEffect, useState } from 'react';
import { Check, X, LoaderCircle } from 'lucide-react';
import { driverPhotoUrl, type DriverPhoto } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { Page, Card, Empty, Pill } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

/** One waiting photo: the picture itself, whose and where, and the two answers. */
function Waiting({ p, onDecide }: { p: DriverPhoto; onDecide: (id: string, d: 'approve' | 'reject') => Promise<void> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  useEffect(() => {
    let url: string | null = null;
    driverPhotoUrl(p.id).then(u => setSrc((url = u))).catch(() => setSrc(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [p.id]);
  const decide = async (d: 'approve' | 'reject') => {
    setBusy(d);
    try {
      await onDecide(p.id, d);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
      <div className="aspect-[4/3] bg-slate-100 grid place-items-center">
        {src ? <img src={src} alt={`Фото станции ${p.stationName}`} className="w-full h-full object-cover" /> : <LoaderCircle size={20} className="animate-spin text-slate-400" />}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-800 truncate">{p.stationName}</p>
        <p className="text-xs text-slate-500">{`${p.user || 'Водитель'} · ${when(p.at)}`}</p>
        {p.note && <p className="text-xs text-slate-600 mt-1">{p.note}</p>}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => void decide('reject')} disabled={!!busy} className="h-9 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
            {busy === 'reject' ? <LoaderCircle size={13} className="animate-spin" /> : <X size={13} />}Отклонить
          </button>
          <button onClick={() => void decide('approve')} disabled={!!busy} className="h-9 rounded-xl bg-[#FFC83D] text-[#111] text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
            {busy === 'approve' ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}Опубликовать
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Photos drivers took at stations, waiting for a look: one that shows the
 * charger or the way to it goes into the station's gallery, anything else is
 * deleted. The driver hears either way.
 */
export default function AdminDriverPhotos() {
  const { actions } = useSync();
  const [list, setList] = useState<DriverPhoto[] | null>(null);
  const [done, setDone] = useState<DriverPhoto[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    actions.adminDriverPhotos('pending').then(r => setList(r.photos)).catch(e => setError((e as Error).message));
    actions.adminDriverPhotos('approved').then(r => setDone(r.photos)).catch(() => {});
  }, [actions]);
  useEffect(load, [load]);

  const decide = async (id: string, d: 'approve' | 'reject') => {
    try {
      await actions.decideDriverPhoto(id, d);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Page title="Фото от водителей" subtitle="Публикуйте снимки, где видно станцию или подъезд к ней; остальное отклоняйте — фото удалится, водитель получит ответ">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <Card title="Ждут проверки" right={list ? <Pill tone={list.length ? 'amber' : 'slate'}>{String(list.length)}</Pill> : undefined}>
        {!list ? <LoaderCircle size={18} className="animate-spin text-slate-400" /> : !list.length ? <Empty text="Новых фото нет" /> : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(p => <Waiting key={p.id} p={p} onDecide={decide} />)}
          </div>
        )}
      </Card>
      {!!done.length && (
        <Card pad={false} title="Уже опубликованы">
          <ul className="divide-y divide-slate-50">
            {done.slice(0, 20).map(p => (
              <li key={p.id} className="px-5 py-2.5 text-sm flex justify-between gap-3"><span className="truncate text-slate-700">{p.stationName}</span><span className="text-xs text-slate-400 shrink-0">{`${p.user} · ${when(p.at)}`}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

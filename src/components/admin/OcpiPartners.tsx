import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Network, RefreshCw, Copy, Check, LoaderCircle, Link2 } from 'lucide-react';
import type { OcpiOverview } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime } from '../../lib/analytics';
import { Card, Pill, ErrorNote } from './ui';

const STATUS = {
  connected: { tone: 'green' as const, label: 'Подключена' },
  connecting: { tone: 'amber' as const, label: 'Подключается' },
  disconnected: { tone: 'red' as const, label: 'Отключена' },
};

/**
 * Partner networks with their own back office and app, connected over OCPI
 * 2.2.1: the admin enters the partner's versions URL and the token A they
 * issued; stations, prices and statuses then come from the partner.
 */
export function OcpiPartners({ onChanged }: { onChanged: () => void }) {
  const { actions } = useSync();
  const [data, setData] = useState<OcpiOverview | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    actions.ocpi('admin').then(setData).catch(e => setNote({ ok: false, text: (e as Error).message }));
  }, [actions]);
  useEffect(load, [load]);

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('new');
    setNote(null);
    try {
      const r = await actions.connectOcpi('admin', url.trim(), token.trim());
      setNote({ ok: true, text: `Сеть ${r.partner.name} подключена · станций: ${r.synced}` });
      setUrl('');
      setToken('');
      load();
      onChanged();
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const sync = async (id: string) => {
    setBusy(id);
    setNote(null);
    try {
      const r = await actions.syncOcpi('admin', id);
      setNote({ ok: true, text: `Станции обновлены: ${r.stations}` });
      load();
      onChanged();
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.ourVersionsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is on screen */
    }
  };

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Network size={16} />Сети-партнёры по OCPI</span>} right={data && <Pill tone="slate">{`OCPI ${data.version}`}</Pill>}>
      <p className="text-sm text-slate-500">
        У сети уже есть своя система и приложение — подключаемся к ним, а не к её станциям напрямую. Станции, цены и статусы приходят от партнёра, запуск и остановка зарядки идут через его систему.
      </p>
      {note && <p role="status" className={`mt-3 text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}

      {data && data.partners.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 border border-slate-100 rounded-xl">
          {data.partners.map(p => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-[200px]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{p.name}</p>
                  <Pill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Pill>
                  <span className="text-xs text-slate-400 font-mono" data-no-translate>{`${p.country_code}*${p.party_id}`}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{`Станций: ${p.stations} · обновлено ${p.lastSync ? dateTime(p.lastSync) : '—'}`}</p>
                {p.error && <p className="text-xs text-red-600 mt-0.5">{p.error}</p>}
              </div>
              <button onClick={() => sync(p.id)} disabled={busy !== null || p.status !== 'connected'} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {busy === p.id ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}Обновить станции
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={connect} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
        <label className="text-xs font-semibold text-slate-500">
          Адрес versions партнёра
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://partner.uz/ocpi/versions" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-normal text-slate-800" data-no-translate />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Токен от партнёра (token A)
          <input value={token} onChange={e => setToken(e.target.value)} autoComplete="off" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-normal text-slate-800 font-mono" data-no-translate />
        </label>
        <button type="submit" disabled={busy !== null || !url.trim() || !token.trim()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
          {busy === 'new' ? <LoaderCircle size={15} className="animate-spin" /> : <Link2 size={15} />}Подключить сеть
        </button>
      </form>
      {data && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Наш адрес для партнёра:</span>
          <code className="px-2 py-1 rounded-lg bg-slate-50 text-slate-700" data-no-translate>{data.ourVersionsUrl}</code>
          <button onClick={copy} aria-label="Скопировать адрес" className="p-1.5 rounded-lg hover:bg-slate-100">{copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}</button>
          <span>{`· наша роль: eMSP ${data.party.country_code}*${data.party.party_id}`}</span>
        </div>
      )}
    </Card>
  );
}

export default OcpiPartners;

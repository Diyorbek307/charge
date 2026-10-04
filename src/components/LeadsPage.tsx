import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Inbox, Phone, Building2, Car, Handshake, Users, MessageSquare, LoaderCircle } from 'lucide-react';
import ExportButton from './ExportButton';
import { useSync } from '../lib/sync';
import type { Lead, LeadKind, LeadStatus } from '../lib/api';

const KIND: Record<LeadKind, { label: string; icon: ReactNode; cls: string }> = {
  driver: { label: 'Лист ожидания', icon: <Car size={13} />, cls: 'bg-sky-50 text-sky-700' },
  operator: { label: 'Оператор станций', icon: <Building2 size={13} />, cls: 'bg-emerald-50 text-emerald-700' },
  fleet: { label: 'Автопарк', icon: <Users size={13} />, cls: 'bg-violet-50 text-violet-700' },
  partner: { label: 'Партнёр', icon: <Handshake size={13} />, cls: 'bg-amber-50 text-amber-700' },
};

const STATUS: Record<LeadStatus, { label: string; cls: string }> = {
  new: { label: 'Новая', cls: 'bg-sky-100 text-sky-700' },
  contacted: { label: 'Связались', cls: 'bg-amber-100 text-amber-700' },
  won: { label: 'Договорились', cls: 'bg-emerald-100 text-emerald-700' },
  lost: { label: 'Отказ', cls: 'bg-slate-100 text-slate-600' },
  spam: { label: 'Спам', cls: 'bg-red-100 text-red-700' },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Leads from the landing page — launch waitlist and partner requests. Real
 * people's contact data: admin-only, and kept across demo resets.
 */
export default function LeadsPage() {
  const { actions, events } = useSync();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<LeadKind | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    actions
      .listLeads('admin')
      .then(r => { setLeads(r.leads); setError(''); })
      .catch(e => setError(e.message));
  }, [actions]);

  useEffect(load, [load]);

  // A new lead arrives as a live event; refetch rather than trust its payload.
  const lastLeadEvent = events.find(e => e.type === 'lead.new')?.id;
  useEffect(() => {
    if (lastLeadEvent) load();
  }, [lastLeadEvent, load]);

  const shown = useMemo(() => (leads ?? []).filter(l => kind === 'all' || l.kind === kind), [leads, kind]);
  const current = leads?.find(l => l.id === selected) ?? null;
  useEffect(() => setNote(current?.note ?? ''), [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (id: string, body: { status?: LeadStatus; note?: string }) => {
    try {
      const updated = await actions.updateLead('admin', id, body);
      setLeads(ls => ls?.map(l => (l.id === id ? updated : l)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const count = (k: LeadKind | 'all') => (leads ?? []).filter(l => (k === 'all' || l.kind === k) && l.status !== 'spam').length;
  const fresh = (leads ?? []).filter(l => l.status === 'new').length;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Заявки</h1>
            <p className="text-sm text-slate-500 inter">
              С лендинга: лист ожидания и запросы на партнёрство · {fresh} новых
            </p>
          </div>
          <ExportButton
            name="leads"
            title="Заявки с лендинга"
            portal="admin"
            headers={['ID', 'Тип', 'Имя', 'Телефон', 'Компания', 'Город', 'Размер', 'Сообщение', 'Статус', 'Заметка', 'Создана']}
            rows={shown.map(l => [l.id, KIND[l.kind].label, l.name, l.phone, l.company, l.city, l.size, l.message, STATUS[l.status].label, l.note, l.created])}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(['all', 'driver', 'operator', 'fleet', 'partner'] as const).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`text-left bg-white rounded-2xl p-4 border transition-all ${kind === k ? 'border-sky-400 shadow-md' : 'border-slate-100/80 hover:shadow-md'}`}
            >
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide inter">{k === 'all' ? 'Все заявки' : KIND[k].label}</p>
              <p className="text-[28px] font-bold text-slate-900 mono leading-none tracking-tight mt-2">{count(k)}</p>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <div className="bg-white rounded-2xl border border-slate-100/80 overflow-hidden">
          {leads === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><LoaderCircle size={16} className="animate-spin" />Загружаем…</div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400 text-sm">
              <Inbox size={28} />Заявок пока нет — они появятся, когда посетители заполнят форму на главной.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3 font-semibold">Заявка</th>
                    <th className="px-4 py-3 font-semibold">Контакт</th>
                    <th className="px-4 py-3 font-semibold">Компания</th>
                    <th className="px-4 py-3 font-semibold">Статус</th>
                    <th className="px-4 py-3 font-semibold">Создана</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(l => (
                    <tr
                      key={l.id}
                      onClick={() => setSelected(l.id)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${selected === l.id ? 'bg-sky-50/60' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${KIND[l.kind].cls}`}>{KIND[l.kind].icon}{KIND[l.kind].label}</span>
                        <p className="text-[11px] text-slate-400 mono mt-1">{l.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{l.name}</p>
                        <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()} className="text-xs text-sky-600 mono hover:underline">{l.phone}</a>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {l.company || '—'}
                        {(l.city || l.size) && <p className="text-xs text-slate-400">{[l.city, l.size].filter(Boolean).join(' · ')}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {current && (
        <aside className="w-[320px] shrink-0 border-l border-slate-100 bg-white p-5 overflow-y-auto space-y-4 hidden md:block">
          <div>
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${KIND[current.kind].cls}`}>{KIND[current.kind].icon}{KIND[current.kind].label}</span>
            <h2 className="text-lg font-bold text-slate-900 mt-2">{current.name}</h2>
            {current.company && <p className="text-sm text-slate-500">{current.company}</p>}
          </div>
          <a href={`tel:${current.phone}`} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-sky-500 text-white font-semibold text-sm hover:bg-sky-600">
            <Phone size={15} />{current.phone}
          </a>
          <dl className="text-sm space-y-2">
            {current.city && <div className="flex justify-between gap-3"><dt className="text-slate-400">Город</dt><dd className="text-slate-700 text-right">{current.city}</dd></div>}
            {current.size && <div className="flex justify-between gap-3"><dt className="text-slate-400">Размер</dt><dd className="text-slate-700 text-right">{current.size}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Язык</dt><dd className="text-slate-700 uppercase">{current.lang}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Согласие</dt><dd className="text-slate-700">{fmtDate(current.consentAt)}</dd></div>
          </dl>
          {current.message && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1"><MessageSquare size={12} />Сообщение</p>
              {current.message}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Статус</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS) as LeadStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => patch(current.id, { status: s })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${current.status === s ? `${STATUS[s].cls} border-transparent` : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  {STATUS[s].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="lead-note" className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Заметка</label>
            <textarea
              id="lead-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus:outline-none focus:border-sky-400"
            />
            <button
              onClick={() => patch(current.id, { note })}
              disabled={note === current.note}
              className="mt-2 w-full py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Сохранить заметку
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

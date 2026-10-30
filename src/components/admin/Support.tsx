import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Send, Check, LoaderCircle, Sparkles, UserRound, Bot } from 'lucide-react';
import type { SupportThread } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime } from '../../lib/analytics';
import { Page, Card, Loading, ErrorNote, Pill, Empty, Segmented } from './ui';
import AiAgents from './AiAgents';

/** Drivers' support chats: the newest first, answered here, closed when solved. */
export function AdminSupport() {
  const { actions, events } = useSync();
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'chats' | 'agents'>('chats');
  const latest = events.find(e => e.type === 'support.message')?.id;
  const load = useCallback(() => {
    actions.adminSupport().then(t => {
      setThreads(t);
      setOpen(o => o ?? t[0]?.id ?? null);
    }).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load, latest]);

  const send = async (close = false, ai?: boolean) => {
    if (!open) return;
    setBusy(true);
    try {
      await actions.answerSupport(open, ai !== undefined ? { ai } : close ? { close: true } : { text: reply.trim() });
      if (!close) setReply('');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tabs = <Segmented options={[{ id: 'chats', label: 'Чаты' }, { id: 'agents', label: 'ИИ-агенты' }]} value={tab} onChange={setTab} />;
  if (tab === 'agents') return <Page title="Поддержка" subtitle="ИИ-агенты отвечают водителям сразу и зовут человека, когда нужно" actions={tabs}><AiAgents /></Page>;
  if (!threads) return <Page title="Поддержка" actions={tabs}>{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const t = threads.find(x => x.id === open) ?? null;
  const held = !!t?.aiHoldUntil && Date.parse(t.aiHoldUntil) > Date.now();
  return (
    <Page title="Поддержка" subtitle="Чаты с водителями: ответ приходит им в приложение и уведомлением" actions={tabs}>
      {error && <ErrorNote text={error} />}
      {threads.length === 0 ? (
        <Card><Empty text="Обращений пока нет" /></Card>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <Card pad={false}>
            <div className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
              {threads.map(x => (
                <button key={x.id} onClick={() => setOpen(x.id)} className={`w-full text-left px-4 py-3 ${x.id === open ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 flex-1 truncate">{x.user}</p>
                    {x.needsHuman && x.status !== 'closed' && <Pill tone="red">нужен человек</Pill>}
                    {x.unreadAdmin > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold grid place-items-center">{x.unreadAdmin}</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{x.messages[x.messages.length - 1]?.text || 'Фото'}</p>
                  <p className="text-[11px] text-slate-400">{`${dateTime(x.updatedAt)} · ${x.status === 'closed' ? 'решено' : 'открыто'}`}</p>
                </button>
              ))}
            </div>
          </Card>
          {t && (
            <Card title={<span className="inline-flex items-center gap-2"><MessageCircle size={16} />{t.user}</span>} right={<Pill tone={t.status === 'closed' ? 'slate' : 'amber'}>{t.status === 'closed' ? 'Решено' : 'Открыто'}</Pill>}>
              <p className="text-xs text-slate-500 -mt-2 mb-3" data-no-translate>{t.phone ?? ''}</p>
              {t.needsHuman && t.status !== 'closed' && (
                <p className="mb-3 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-1.5"><UserRound size={13} />{`Агент позвал человека: ${t.handoffReason ?? 'нужен специалист'}`}</p>
              )}
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                <Bot size={13} />
                {held ? 'ИИ-агенты не отвечают в этом чате — отвечаете вы' : 'ИИ-агенты отвечают в этом чате'}
                <button onClick={() => send(false, held)} disabled={busy} className="font-semibold text-[#8A5B00] hover:underline">{held ? 'Вернуть агентов' : 'Отвечу сам'}</button>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto bg-slate-50 rounded-xl p-3">
                {t.messages.map(m => (
                  <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.from === 'support' ? 'bg-[#FFC83D] text-[#111]' : m.from === 'ai' ? 'bg-amber-50 border border-amber-100 text-[#111]' : 'bg-white border border-slate-100'}`}>
                      {m.from === 'ai' && <p className="text-[10px] font-semibold text-[#8A5B00] mb-0.5 inline-flex items-center gap-1"><Sparkles size={10} />{`ИИ · ${m.agentName ?? 'агент'}`}</p>}
                      {m.image && <img src={m.image} alt="Фото от водителя" className="rounded-xl mb-1 max-h-64" />}
                      {m.text && <p className="text-sm whitespace-pre-wrap">{m.text}</p>}
                      <p className="text-[10px] text-slate-500 mt-0.5">{dateTime(m.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2 items-end">
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Ответ водителю" aria-label="Ответ водителю" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                <button onClick={() => send(false)} disabled={busy || !reply.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
                  {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}Ответить
                </button>
              </div>
              {t.status !== 'closed' && (
                <button onClick={() => send(true)} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:underline"><Check size={13} />Отметить как решённое</button>
              )}
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

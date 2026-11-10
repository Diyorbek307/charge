import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Send, Check, LoaderCircle, Sparkles, UserRound, Bot } from 'lucide-react';
import { apiClient, type SupportProfile, type SupportThread } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime, money } from '../../lib/analytics';
import { Page, Card, Loading, ErrorNote, Pill, Empty, Segmented } from './ui';
import AiAgents from './AiAgents';

const WHO: Record<string, { label: string; tone: 'amber' | 'green' | 'sky' | 'slate' }> = {
  driver: { label: 'Водитель', tone: 'amber' },
  operator: { label: 'Сеть', tone: 'green' },
  business: { label: 'Автопарк', tone: 'sky' },
  api: { label: 'Разработчик', tone: 'slate' },
};
const STATUS: Record<string, string> = { completed: 'завершена', active: 'идёт', failed: 'ошибка', cancelled: 'отменена' };

/** What support can do for the person, right beside the chat. Each action asks first and lands in the audit log. */
function Actions({ p, onChanged }: { p: SupportProfile; onChanged: () => void }) {
  const [open, setOpen] = useState<null | 'bonus' | 'balance' | 'name'>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!p.id) return null;
  const id = p.id;
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await fn() });
      setOpen(null);
      setValue('');
      setReason('');
      onChanged();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const btn = 'px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  const sum = Number(value.replace(/\s/g, ''));
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Действия</p>
      <div className="flex flex-wrap gap-1.5">
        <button disabled={busy} className={btn} onClick={() => window.confirm(`Сбросить пароль: ${p.name}? Все его устройства выйдут из аккаунта.`) && void run(async () => {
          const r = await apiClient.adminResetPassword(id);
          return r.temporary ? `Временный пароль: ${r.temporary} — продиктуйте его, он показан один раз` : 'Пароль сброшен: войдёт по коду из SMS';
        })}>Сбросить пароль</button>
        {p.kind === 'driver' && <button disabled={busy} className={btn} onClick={() => window.confirm(p.blocked ? `Разблокировать ${p.name}?` : `Заблокировать ${p.name}? Он сразу выйдет из аккаунта.`) && void run(async () => {
          await apiClient.setUserStatus('admin', id, p.blocked ? 'active' : 'blocked');
          return p.blocked ? 'Разблокирован' : 'Заблокирован';
        })}>{p.blocked ? 'Разблокировать' : 'Заблокировать'}</button>}
        {p.kind === 'driver' && <button disabled={busy} className={btn} onClick={() => setOpen(open === 'bonus' ? null : 'bonus')}>Дать бонус</button>}
        {p.kind === 'driver' && <button disabled={busy} className={btn} onClick={() => { setOpen(open === 'balance' ? null : 'balance'); setValue(String(p.balance ?? 0)); }}>Поправить баланс</button>}
        <button disabled={busy} className={btn} onClick={() => { setOpen(open === 'name' ? null : 'name'); setValue(p.name); }}>Изменить имя</button>
        {p.kind === 'driver' && <button disabled={busy} className={`${btn} text-red-600 border-red-200 hover:bg-red-50`} onClick={() => window.prompt(`Удалить аккаунт ${p.name} навсегда? Напишите УДАЛИТЬ`)?.trim().toUpperCase() === 'УДАЛИТЬ' && void run(async () => {
          await apiClient.deleteAccountByAdmin(id);
          return 'Аккаунт удалён';
        })}>Удалить аккаунт</button>}
      </div>
      {open && (
        <div className="rounded-xl bg-slate-50 p-3 space-y-2">
          <input value={value} onChange={e => setValue(e.target.value)} inputMode={open === 'name' ? undefined : 'numeric'} placeholder={open === 'name' ? 'Имя и фамилия' : 'Сумма, сум'} aria-label={open === 'name' ? 'Имя' : 'Сумма'} className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm" />
          {open === 'bonus' && <input value={reason} onChange={e => setReason(e.target.value)} placeholder="За что (увидит водитель)" aria-label="За что" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm" />}
          <button disabled={busy || !value.trim() || (open !== 'name' && !(sum >= 0))} className="h-9 px-3 rounded-lg bg-[#111] text-white text-xs font-semibold disabled:opacity-40" onClick={() => void run(async () => {
            if (open === 'bonus') { await apiClient.grantBonus(id, sum, reason.trim() || 'Подарок от поддержки Voli'); return `Начислено ${money(sum)} бонусом`; }
            if (open === 'balance') { await apiClient.setBalance(id, sum); return `Баланс теперь ${money(sum)}`; }
            await apiClient.renameAccount(id, value.trim());
            return 'Имя изменено';
          })}>Сохранить</button>
        </div>
      )}
      {note && <p className={`text-xs rounded-lg px-2.5 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{note.text}</p>}
    </div>
  );
}

/** Who is writing: account, money and recent trouble, so the answer needs no other page. */
function ProfilePanel({ threadId }: { threadId: string }) {
  const [p, setP] = useState<SupportProfile | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setError('');
    apiClient.supportProfile(threadId).then(setP).catch(e => setError((e as Error).message));
  }, [threadId, tick]);
  useEffect(() => setP(null), [threadId]);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0 text-sm"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 text-right">{v}</span></div>
  );
  return (
    <Card title="О клиенте">
      {error ? <ErrorNote text={error} /> : !p ? <Loading /> : p.kind === 'gone' ? <p className="text-sm text-slate-500">Аккаунт удалён</p> : (
        <div className="space-y-4">
          <div>
            <p className="text-base font-bold text-slate-900">{p.name}</p>
            <p className="text-xs text-slate-500" data-no-translate>{p.login}</p>
            {p.org && <p className="text-xs text-slate-500 mt-0.5">{p.org}</p>}
            {p.blocked && <Pill tone="red">заблокирован</Pill>}
          </div>
          {p.kind === 'driver' && (
            <>
              <div>
                {row('Баланс', money(p.balance ?? 0))}
                {(p.debt ?? 0) > 0 && row('Долг', <span className="text-red-600">{money(p.debt ?? 0)}</span>)}
                {row('Потратил всего', money(p.totals?.spent ?? 0))}
                {row('Зарядок всего', p.totals?.sessions ?? 0)}
                {row('За 30 дней', `${p.month?.sessions ?? 0} · ${money(p.month?.spent ?? 0)}`)}
                {(p.month?.failed ?? 0) > 0 && row('Ошибок за 30 дней', <span className="text-red-600">{p.month?.failed}</span>)}
                {p.car && row('Машина', p.car)}
                {p.company && row('Автопарк', p.company)}
                {p.since && row('С нами с', dateTime(p.since).split(',')[0])}
              </div>
              {!!p.sessions?.length && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Последние зарядки</p>
                  <div className="space-y-1.5">
                    {p.sessions.map(x => (
                      <div key={x.id} className={`rounded-xl px-3 py-2 text-xs ${x.status === 'failed' ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <div className="flex justify-between gap-2"><span className="font-semibold text-slate-800 truncate">{x.station}</span><span className="text-slate-500 shrink-0">{dateTime(x.start)}</span></div>
                        <div className="flex justify-between gap-2 text-slate-500"><span>{`${STATUS[x.status] ?? x.status}${x.stopReason ? ` · ${x.stopReason}` : ''}`}</span><span>{`${x.energy} кВт·ч · ${money(x.cost)}`}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!!p.payments?.length && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Пополнения</p>
                  {p.payments.map(x => row(`${x.provider} · ${dateTime(x.at)}`, <span className={x.status === 'paid' ? 'text-emerald-700' : 'text-slate-400'}>{`${money(x.amount)}${x.status === 'paid' ? '' : ` · ${x.status}`}`}</span>))}
                </div>
              )}
              {!!p.reports?.length && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Жалобы на станции</p>
                  {p.reports.map(x => <p key={x.id} className="text-xs text-slate-600 py-1">{`${x.ack ? '✓' : '•'} ${x.message}`}</p>)}
                </div>
              )}
            </>
          )}
          {p.kind === 'operator' && (
            <div>
              {row('Станций', p.stations ?? 0)}
              {row('Разъёмов не работает', <span className={(p.down ?? 0) > 0 ? 'text-red-600' : ''}>{`${p.down ?? 0} из ${p.connectors ?? 0}`}</span>)}
              {row('Оповещений без ответа', p.openAlerts ?? 0)}
              {row('Выручка за 30 дней', money(p.month?.revenue ?? 0))}
              {row('Зарядок за 30 дней', p.month?.sessions ?? 0)}
              {row('Комиссия', `${p.commission ?? '—'}%`)}
              {row('Оплата', p.mode === 'direct' ? 'напрямую сети' : 'через Voli')}
              {row('Последняя выплата', p.lastPayout ? `${money(p.lastPayout.amount)} · ${p.lastPayout.paidAt} · п/п ${p.lastPayout.ref}` : 'ещё не было')}
            </div>
          )}
          {p.kind === 'business' && (
            <div>
              {row('Баланс счёта', money(p.balance ?? 0))}
              {row('Сотрудников', `${p.employees ?? 0}${p.waiting ? ` · ${p.waiting} ждут входа` : ''}`)}
              {row('Бюджет лимитов', money(p.budget ?? 0))}
              {row('За 30 дней', `${p.month?.sessions ?? 0} · ${money(p.month?.spent ?? 0)}`)}
            </div>
          )}
          {p.kind === 'api' && <div>{row('Вебхуков', p.webhooks ?? 0)}</div>}
          <Actions p={p} onChanged={() => setTick(t => t + 1)} />
        </div>
      )}
    </Card>
  );
}

/** Support chats from drivers, networks, fleets and developers: the newest first, answered here, closed when solved. */
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
    <Page title="Поддержка" subtitle="Чаты с водителями, сетями, автопарками и разработчиками: ответ приходит им в кабинет и уведомлением" actions={tabs}>
      {error && <ErrorNote text={error} />}
      {threads.length === 0 ? (
        <Card><Empty text="Обращений пока нет" /></Card>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_320px] gap-4 items-start">
          <Card pad={false}>
            <div className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
              {threads.map(x => (
                <button key={x.id} onClick={() => setOpen(x.id)} className={`w-full text-left px-4 py-3 ${x.id === open ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 flex-1 truncate">{x.user}</p>
                    <Pill tone={WHO[x.portal ?? 'driver']?.tone ?? 'slate'}>{WHO[x.portal ?? 'driver']?.label ?? ''}</Pill>
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
              <p className="text-xs text-slate-500 -mt-2 mb-3"><span data-no-translate>{t.phone ?? ''}</span>{t.org ? ` · ${t.org}` : ''}</p>
              {t.needsHuman && t.status !== 'closed' && (
                <p className="mb-3 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-1.5"><UserRound size={13} />{`Агент позвал человека: ${t.handoffReason ?? 'нужен специалист'}`}</p>
              )}
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                <Bot size={13} />
                {held ? 'ИИ-агенты не отвечают в этом чате — отвечаете вы' : 'ИИ-агенты отвечают в этом чате'}
                <button onClick={() => send(false, held)} disabled={busy} className="font-semibold text-[#3D6B00] hover:underline">{held ? 'Вернуть агентов' : 'Отвечу сам'}</button>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto bg-slate-50 rounded-xl p-3">
                {t.messages.map(m => (
                  <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.from === 'support' ? 'bg-[#C6F432] text-[#111]' : m.from === 'ai' ? 'bg-amber-50 border border-amber-100 text-[#111]' : 'bg-white border border-slate-100'}`}>
                      {m.from === 'ai' && <p className="text-[10px] font-semibold text-[#3D6B00] mb-0.5 inline-flex items-center gap-1"><Sparkles size={10} />{`ИИ · ${m.agentName ?? 'агент'}`}</p>}
                      {m.image && <img src={m.image} alt="Фото от водителя" className="rounded-xl mb-1 max-h-64" />}
                      {m.text && <p className="text-sm whitespace-pre-wrap">{m.text}</p>}
                      <p className="text-[10px] text-slate-500 mt-0.5">{dateTime(m.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2 items-end">
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Ответ" aria-label="Ответ" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                <button onClick={() => send(false)} disabled={busy || !reply.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C6F432] text-[#111] text-sm font-semibold disabled:opacity-50">
                  {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}Ответить
                </button>
              </div>
              {t.status !== 'closed' && (
                <button onClick={() => send(true)} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:underline"><Check size={13} />Отметить как решённое</button>
              )}
            </Card>
          )}
          {t && <ProfilePanel threadId={t.id} />}
        </div>
      )}
    </Page>
  );
}

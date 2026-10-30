import { useCallback, useEffect, useState } from 'react';
import { Bot, LoaderCircle, Save, Send, UserRound } from 'lucide-react';
import type { AiAgent, AiAgentsView, AiAnswer } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { num } from '../../lib/analytics';
import { Card, Kpi, Loading, ErrorNote, Pill } from './ui';

/**
 * The AI agents of the support chat: on or off, what each is called and
 * told, how many chats they answered and passed to a person, and a box to
 * try them on a question before drivers do.
 */
export default function AiAgents() {
  const { actions } = useSync();
  const [view, setView] = useState<AiAgentsView | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<AiAgent>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => {
    actions.aiAgents().then(setView).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load]);

  const save = async (body: Parameters<typeof actions.saveAiAgents>[0]) => {
    setBusy(true);
    setError('');
    try {
      setView(await actions.saveAiAgents(body));
      setDraft({});
      setNote('Сохранено — агенты уже отвечают по-новому');
      setTimeout(() => setNote(''), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ask = async () => {
    setAsking(true);
    setError('');
    setAnswer(null);
    try {
      setAnswer(await actions.testAiAgents(q.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  if (!view) return error ? <ErrorNote text={error} /> : <Loading />;
  const answered = view.agents.reduce((n, a) => n + a.answered, 0);
  const handoffs = view.agents.reduce((n, a) => n + a.handoffs, 0);
  const edit = (id: string, k: keyof AiAgent, v: string | boolean) => setDraft(d => ({ ...d, [id]: { ...d[id], id, [k]: v } }));
  const field = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      {error && <ErrorNote text={error} />}
      {note && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{note}</p>}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#FFC83D] grid place-items-center"><Bot size={20} className="text-[#111]" /></span>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-bold text-slate-900">{view.on ? 'ИИ-агенты отвечают водителям' : 'ИИ-агенты выключены — отвечают только люди'}</p>
            <p className="text-xs text-slate-500">
              {view.connected
                ? `Работают на Claude (${view.model}): понимают любой вопрос, видят баланс и последние зарядки водителя`
                : 'Базовый режим: отвечают на частые вопросы, остальное передают людям. Чтобы включить Claude, добавьте ANTHROPIC_API_KEY в переменные окружения Render'}
            </p>
          </div>
          <button onClick={() => save({ on: !view.on })} disabled={busy} className={`px-4 py-2 rounded-xl text-sm font-semibold ${view.on ? 'bg-slate-100 text-slate-700' : 'bg-[#FFC83D] text-[#111]'}`}>
            {view.on ? 'Выключить' : 'Включить'}
          </button>
        </div>
      </Card>

      <div className="grid sm:grid-cols-3 gap-3">
        <Kpi label="Ответов агентов" value={num(answered)} tone="amber" />
        <Kpi label="Передали людям" value={num(handoffs)} sub={answered ? `${Math.round((handoffs / answered) * 100)}% ответов` : undefined} tone="slate" />
        <Kpi label="Ждут человека" value={num(view.waiting)} sub="чаты, куда агент позвал специалиста" tone={view.waiting ? 'red' : 'slate'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {view.agents.map(a => {
          const d = { ...a, ...draft[a.id] };
          const dirty = !!draft[a.id];
          return (
            <Card key={a.id} title={<span className="inline-flex items-center gap-2"><span aria-hidden="true">{a.emoji}</span>{a.name}</span>} right={<Pill tone={d.on ? 'green' : 'slate'}>{d.on ? 'работает' : 'выключен'}</Pill>}>
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-600">Имя
                  <input value={d.name} onChange={e => edit(a.id, 'name', e.target.value)} maxLength={40} className={`${field} mt-1`} />
                </label>
                <label className="block text-xs font-semibold text-slate-600">Темы
                  <textarea value={d.topics} onChange={e => edit(a.id, 'topics', e.target.value)} rows={3} maxLength={400} className={`${field} mt-1`} />
                </label>
                <label className="block text-xs font-semibold text-slate-600">Указания агенту
                  <textarea value={d.instructions} onChange={e => edit(a.id, 'instructions', e.target.value)} rows={4} maxLength={1500} className={`${field} mt-1`} />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!d.on} onChange={e => edit(a.id, 'on', e.target.checked)} />Отвечает водителям
                </label>
                <p className="text-xs text-slate-400">{`${num(a.answered)} ответов · ${num(a.handoffs)} передано людям`}</p>
                {dirty && (
                  <button onClick={() => save({ agents: [draft[a.id]] })} disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[#111] text-[#FFC83D] text-sm font-semibold disabled:opacity-50">
                    <Save size={14} />Сохранить
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Проверить агентов">
        <p className="text-xs text-slate-500 -mt-1 mb-2">Задайте вопрос как водитель — увидите, кто из агентов ответит и позовёт ли он человека. Водителю ничего не отправляется.</p>
        <div className="flex gap-2 items-end">
          <textarea value={q} onChange={e => setQ(e.target.value)} rows={2} placeholder="Например: зарядка не начинается на станции в Чиланзаре" aria-label="Вопрос для проверки" className={`${field} flex-1`} />
          <button onClick={ask} disabled={asking || !q.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
            {asking ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}Спросить
          </button>
        </div>
        {answer && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold text-[#8A5B00] flex items-center gap-2 flex-wrap">
              {`${answer.emoji} ${answer.agentName}`}
              <Pill tone="slate">{answer.source === 'claude' ? 'Claude' : 'базовый режим'}</Pill>
              {answer.handoff && <Pill tone="red"><span className="inline-flex items-center gap-1"><UserRound size={11} />позовёт человека</span></Pill>}
            </p>
            <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{answer.reply}</p>
            {answer.reason && <p className="text-xs text-slate-400 mt-1">{`Для команды: ${answer.reason}`}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

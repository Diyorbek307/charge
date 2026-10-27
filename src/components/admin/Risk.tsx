import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ShieldAlert, Zap, Users, CreditCard, RotateCcw, Check, X, Ban } from 'lucide-react';
import type { RiskReport, RiskFinding } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty, Segmented } from './ui';

const RULE: Record<RiskFinding['rule'], { label: string; icon: ReactNode; why: string }> = {
  failed_starts: { label: 'Неудачные запуски', icon: <Zap size={15} />, why: '3+ неудачных старта за неделю: неисправный адаптер у водителя или перебор станций' },
  impossible_energy: { label: 'Невозможная энергия', icon: <Zap size={15} />, why: 'Счётчик показал больше, чем разъём мог отдать за это время: сбой счётчика или подмена данных' },
  parallel_sessions: { label: 'Две зарядки сразу', icon: <Users size={15} />, why: 'Один аккаунт заряжается в двух местах одновременно: аккаунтом пользуются несколько людей или он украден' },
  abandoned_payments: { label: 'Брошенные пополнения', icon: <CreditCard size={15} />, why: '3+ отменённых или неоплаченных пополнения за сутки: часто так проверяют чужие карты' },
  repeated_refunds: { label: 'Частые возвраты', icon: <RotateCcw size={15} />, why: '2+ возврата за 30 дней у одного человека' },
};
const TONE = { critical: 'red', high: 'amber', medium: 'sky' } as const;
const RISK_LABEL = { critical: 'Критично', high: 'Высокий', medium: 'Средний' };

/** Risk signals computed by rules over the last 30 days; an admin confirms or dismisses each. */
export default function AdminRisk() {
  const { actions } = useSync();
  const [data, setData] = useState<RiskReport | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'open' | 'all'>('open');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    actions.riskReport('admin').then(r => { setData(r); setError(''); }).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load]);

  const review = async (f: RiskFinding, decision: 'confirmed' | 'dismissed', block = false) => {
    setBusy(f.id);
    try {
      await actions.reviewRisk('admin', f.id, decision, block);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Page title="Риски и фрод">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const list = data.findings.filter(f => view === 'all' || !f.review);
  const count = (r: string) => data.findings.filter(f => !f.review && f.risk === r).length;

  return (
    <Page title="Риски и фрод" subtitle={`Правила по ${data.checked.sessions} зарядкам и ${data.checked.payments} платежам за 30 дней — каждый сигнал ссылается на записи, на которых основан`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Открыто" value={data.open} sub="ждут решения" icon={<ShieldAlert size={14} />} tone="violet" />
        <Kpi label="Критично" value={count('critical')} icon={<ShieldAlert size={14} />} tone="red" />
        <Kpi label="Высокий" value={count('high')} icon={<ShieldAlert size={14} />} tone="amber" />
        <Kpi label="Средний" value={count('medium')} icon={<ShieldAlert size={14} />} tone="sky" />
      </div>
      {error && <ErrorNote text={error} />}
      <Segmented options={[{ id: 'open', label: 'Открытые' }, { id: 'all', label: 'Все' }]} value={view} onChange={setView} />
      {list.length === 0 ? (
        <Card><Empty text={view === 'open' ? 'Открытых сигналов нет' : 'Сигналов за 30 дней нет'} /></Card>
      ) : (
        <div className="space-y-3">
          {list.map(f => {
            const rule = RULE[f.rule];
            return (
              <Card key={f.id} className={f.review ? 'opacity-70' : ''}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${f.risk === 'critical' ? 'bg-red-50 text-red-500' : f.risk === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>{rule.icon}</span>
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={TONE[f.risk]}>{RISK_LABEL[f.risk]}</Pill>
                      <span className="text-sm font-bold text-slate-900">{rule.label}</span>
                      <span className="text-xs text-slate-400">{dateTime(f.at)}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1.5">{`${f.user} · ${f.detail}`}</p>
                    <p className="text-xs text-slate-400 mt-1">{rule.why}</p>
                    <p className="text-[11px] text-slate-400 mt-1.5 font-mono break-all">{f.refs.join(' · ')}</p>
                    {f.review && <p className="text-xs mt-2 text-slate-500">{`${f.review.decision === 'confirmed' ? 'Подтверждено' : 'Отклонено'} · ${f.review.by} · ${dateTime(f.review.at)}`}</p>}
                  </div>
                  {!f.review && (
                    <div className="flex flex-wrap gap-1.5">
                      <button disabled={!!busy} onClick={() => review(f, 'dismissed')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40"><X size={12} />Ложный</button>
                      <button disabled={!!busy} onClick={() => review(f, 'confirmed')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 disabled:opacity-40"><Check size={12} />Подтвердить</button>
                      <button disabled={!!busy} onClick={() => review(f, 'confirmed', true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 text-xs font-semibold text-white disabled:opacity-40"><Ban size={12} />Заблокировать</button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}

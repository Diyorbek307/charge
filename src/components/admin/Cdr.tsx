import { useEffect, useState } from 'react';
import { FileCheck2, AlertTriangle, Zap, Wallet } from 'lucide-react';
import type { CdrReport } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { money, num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty, Segmented } from './ui';
import ExportButton from '../ExportButton';

const CHECK: Record<string, string> = {
  time: 'Время',
  energy: 'Энергия',
  amount: 'Сумма',
  tariff: 'Тариф',
  payment: 'Списание',
  station: 'Станция',
};

/** Every completed charge must add up: time, energy within what the connector can deliver, price × energy, and the money taken. */
export default function AdminCdr() {
  const { actions, events } = useSync();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CdrReport | null>(null);
  const [error, setError] = useState('');
  const latest = events.find(e => e.type === 'session.stop')?.id;

  useEffect(() => {
    actions.cdrReport('admin', days).then(r => { setData(r); setError(''); }).catch(e => setError((e as Error).message));
  }, [actions, days, latest]);

  if (!data) return <Page title="Проверка CDR">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;
  const rate = data.checked ? (data.passed / data.checked) * 100 : 100;

  return (
    <Page
      title="Проверка CDR"
      subtitle="Автоматическая сверка записей о зарядках: время, энергия, цена и списание"
      actions={
        <>
          <Segmented options={[{ id: 7, label: '7 дней' }, { id: 30, label: '30 дней' }, { id: 60, label: '60 дней' }]} value={days} onChange={setDays} />
          <ExportButton name="cdr-issues" title="Расхождения в CDR" portal="admin" headers={['Сессия', 'Проверка', 'Описание', 'Станция', 'Оператор', 'Начало', 'Сумма, сум']} rows={data.issues.map(i => [i.sessionId, CHECK[i.check] ?? i.check, i.detail, i.station, i.operator, dateTime(i.start), i.cost])} />
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Проверено" value={num(data.checked)} sub="завершённых зарядок" icon={<FileCheck2 size={14} />} tone="violet" />
        <Kpi label="Без расхождений" value={`${num(rate, 2)}%`} sub={`${num(data.passed)} записей`} icon={<FileCheck2 size={14} />} tone="emerald" />
        <Kpi label="Энергия" value={num(data.energy)} sub="кВт·ч в проверенных записях" icon={<Zap size={14} />} tone="sky" />
        <Kpi label="Сумма" value={money(data.amount, false)} sub="сум по проверенным записям" icon={<Wallet size={14} />} tone="amber" />
      </div>

      <Card pad={false} title={<span className="flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500" />Расхождения</span>} right={<span className="text-xs text-slate-400">{data.issues.length}</span>}>
        {data.issues.length === 0 ? (
          <Empty text="Все записи сходятся" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
                  <th className="px-5 py-3 font-semibold">Сессия</th>
                  <th className="px-5 py-3 font-semibold">Проверка</th>
                  <th className="px-5 py-3 font-semibold">Что не так</th>
                  <th className="px-5 py-3 font-semibold">Станция</th>
                  <th className="px-5 py-3 font-semibold text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {data.issues.map(i => (
                  <tr key={i.sessionId + i.check} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5"><p className="font-mono text-xs text-sky-600">{i.sessionId}</p><p className="text-[11px] text-slate-400">{dateTime(i.start)}</p></td>
                    <td className="px-5 py-2.5"><Pill tone={i.check === 'energy' || i.check === 'payment' ? 'red' : 'amber'}>{CHECK[i.check] ?? i.check}</Pill></td>
                    <td className="px-5 py-2.5 text-slate-700">{i.detail}</td>
                    <td className="px-5 py-2.5"><p className="text-slate-700">{i.station}</p><p className="text-[11px] text-slate-400">{i.operator}</p></td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-800">{money(i.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">Энергия сверяется с максимумом разъёма за время зарядки (+5% на погрешность счётчика), сумма — с ценой × кВт·ч, цена — с базовым тарифом × множителем часа, списание — с транзакцией.</p>
      </Card>
    </Page>
  );
}

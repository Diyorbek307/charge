import { useEffect, useState } from 'react';
import { ShieldCheck, Check, Minus } from 'lucide-react';
import type { StaffAccount } from '../../lib/api';
import { useSync } from '../../lib/sync';
import { dateTime } from '../../lib/analytics';
import { Page, Card, Loading, ErrorNote, Pill } from './ui';

const PORTAL: Record<string, string> = { admin: 'Администратор', operator: 'Оператор', business: 'Автопарк', api: 'Партнёр API' };

/** What each portal may do — as enforced by the server, one row per capability. */
const MATRIX: [string, ('admin' | 'operator' | 'business' | 'api' | 'driver')[]][] = [
  ['Видеть всю сеть, всех операторов и пользователей', ['admin']],
  ['Комиссии, статус операторов, возвраты, блокировка пользователей', ['admin']],
  ['Тарифные окна сети, риски, проверка CDR', ['admin']],
  ['Свои станции: добавление, цены разъёмов, команды OCPP', ['operator']],
  ['Сессии и выручка своих станций, клиенты с маскированными телефонами', ['operator', 'admin']],
  ['Остановить зарядку на своей станции', ['operator', 'admin']],
  ['Корпоративный счёт, лимиты сотрудников, расходы автопарка', ['business', 'admin']],
  ['Станции и статусы разъёмов через API, вебхуки', ['api', 'admin']],
  ['Начать и оплатить зарядку, бронь, очередь', ['driver', 'business']],
];
const COLS: ('admin' | 'operator' | 'business' | 'api' | 'driver')[] = ['admin', 'operator', 'business', 'api', 'driver'];
const COL_LABEL = { admin: 'Админ', operator: 'Оператор', business: 'Автопарк', api: 'API', driver: 'Водитель' };

export default function AdminRoles() {
  const { actions } = useSync();
  const [accounts, setAccounts] = useState<StaffAccount[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    actions.staffAccounts('admin').then(setAccounts).catch(e => setError((e as Error).message));
  }, [actions]);

  return (
    <Page title="Роли и доступ" subtitle="Учётные записи кабинетов и права каждой роли — так, как их проверяет сервер">
      {error && <ErrorNote text={error} />}
      <Card pad={false} title="Учётные записи кабинетов" right={<span className="text-xs text-slate-400">водители — в разделе «Пользователи»</span>}>
        {!accounts ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
                  <th className="px-5 py-3 font-semibold">Пользователь</th>
                  <th className="px-5 py-3 font-semibold">Роль</th>
                  <th className="px-5 py-3 font-semibold">Организация</th>
                  <th className="px-5 py-3 font-semibold">Последний вход</th>
                  <th className="px-5 py-3 font-semibold">2FA</th>
                  <th className="px-5 py-3 font-semibold text-right">Устройств</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5"><p className="font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.login}</p></td>
                    <td className="px-5 py-2.5"><Pill tone={a.portal === 'admin' ? 'violet' : a.portal === 'operator' ? 'sky' : a.portal === 'business' ? 'amber' : 'slate'}>{PORTAL[a.portal] ?? a.portal}</Pill></td>
                    <td className="px-5 py-2.5 text-slate-600">{a.org ?? '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">{a.lastLogin ? dateTime(a.lastLogin) : 'не входил'}</td>
                    <td className="px-5 py-2.5">{a.twoFactor ? <Pill tone="green"><ShieldCheck size={11} />включена</Pill> : <Pill tone="amber">выключена</Pill>}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{a.devices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">Для учётных записей администраторов включите 2FA — это доступ ко всей сети и деньгам.</p>
      </Card>

      <Card pad={false} title="Права ролей">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-50">
                <th className="px-5 py-3 font-semibold">Возможность</th>
                {COLS.map(c => <th key={c} className="px-3 py-3 font-semibold text-center">{COL_LABEL[c]}</th>)}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([what, who]) => (
                <tr key={what} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5 text-slate-700">{what}</td>
                  {COLS.map(c => (
                    <td key={c} className="px-3 py-2.5 text-center">
                      {who.includes(c) ? <Check size={15} className="inline text-emerald-500" aria-label="да" /> : <Minus size={15} className="inline text-slate-200" aria-label="нет" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

import { Building2, Bell, Languages, Mail } from 'lucide-react';
import { useSync } from '../../lib/sync';
import { BRAND } from '../../brand';
import { Page, Card } from '../admin/ui';
import TwoFactorPanel from '../TwoFactorPanel';
import PushToggle from '../PushToggle';
import LangSwitcher from '../LangSwitcher';

/** Account settings — only what the platform actually applies. */
export default function BusinessSettings() {
  const { sessions } = useSync();
  const me = sessions.business;

  return (
    <Page title="Настройки" subtitle="Профиль компании, безопасность входа и уведомления">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title={<span className="flex items-center gap-2"><Building2 size={15} className="text-indigo-500" />Компания</span>}>
          <dl className="space-y-3 text-sm">
            {[
              ['Организация', me?.org ?? '—'],
              ['Менеджер автопарка', me?.name ?? '—'],
              ['Роль', me?.role ?? '—'],
              ['Логин', me?.login ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-50 pb-2 last:border-0">
                <dt className="text-slate-400">{k}</dt>
                <dd className="font-semibold text-slate-800 text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-500 flex items-start gap-2">
            <Mail size={13} className="shrink-0 mt-0.5" />
            {`Реквизиты, договор и состав сотрудников меняются через менеджера платформы: ${BRAND.emails.business}`}
          </p>
        </Card>

        <div className="space-y-4">
          <Card title={<span className="flex items-center gap-2"><Bell size={15} className="text-indigo-500" />Уведомления</span>}>
            <p className="text-sm text-slate-500 mb-3">Push в этом браузере: сотрудник у лимита, низкий баланс счёта и пополнения.</p>
            <PushToggle portal="business" />
          </Card>
          <Card title={<span className="flex items-center gap-2"><Languages size={15} className="text-indigo-500" />Язык интерфейса</span>}>
            <p className="text-sm text-slate-500 mb-3">Русский, O‘zbekcha или English — применяется сразу ко всему кабинету.</p>
            <LangSwitcher />
          </Card>
        </div>
      </div>

      <TwoFactorPanel portal="business" />
    </Page>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Copy, Mail, Plus, Wallet, X } from 'lucide-react';
import { useSync } from '../../lib/sync';
import type { Company } from '../../lib/api';
import { money, num, dateTime } from '../../lib/analytics';
import { Page, Card, Kpi, Loading, ErrorNote, Pill, Empty } from './ui';

type Link = { company: string; link: string; mail: { sent: boolean; error?: string } };

/**
 * Companies whose staff charge on the company's money. The admin makes one
 * after the contract: the name and the manager's email; the manager gets a
 * letter with a link and sets the password. Money comes in by bank transfer
 * (credited here with the payment order's number) or by Payme from the cabinet.
 */
export default function AdminCompanies() {
  const { actions } = useSync();
  const [list, setList] = useState<Company[] | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', inn: '', managerName: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<Link | null>(null);
  const [credit, setCredit] = useState<{ id: string; amount: string; reference: string } | null>(null);

  const load = useCallback(() => {
    actions.adminCompanies().then(setList).catch(e => setError((e as Error).message));
  }, [actions]);
  useEffect(load, [load]);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(''), 4000);
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await actions.createCompany(form);
      setLink({ company: r.company.name, link: r.link, mail: r.mail });
      setForm({ name: '', inn: '', managerName: '', email: '' });
      setAdding(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reinvite = async (c: Company) => {
    setError('');
    try {
      const r = await actions.companyInvite(c.id);
      setLink({ company: c.name, link: r.link, mail: r.mail });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doCredit = async () => {
    if (!credit) return;
    setBusy(true);
    setError('');
    try {
      const r = await actions.companyCredit(credit.id, Number(credit.amount.replace(/\D/g, '')), credit.reference);
      flash(`Зачислено ${money(r.order.amount)} · ${r.company.name}`);
      setCredit(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!list) return <Page title="Компании">{error ? <ErrorNote text={error} /> : <Loading />}</Page>;

  const field = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white';
  const total = list.reduce((n, c) => n + c.balance, 0);
  const spend = list.reduce((n, c) => n + c.monthSpend, 0);

  return (
    <Page
      title="Компании"
      subtitle="Автопарки и бизнес: сотрудники заряжаются за счёт компании. Каждая компания видит только своих людей и свои деньги."
      actions={<button onClick={() => setAdding(true)} className="px-4 py-2 rounded-xl bg-[#111] text-white text-sm font-semibold inline-flex items-center gap-1.5"><Plus size={15} />Новая компания</button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Компаний" value={num(list.length)} tone="slate" />
        <Kpi label="Сотрудников" value={num(list.reduce((n, c) => n + c.employees, 0))} tone="sky" />
        <Kpi label="На счетах компаний" value={money(total)} tone="emerald" />
        <Kpi label="Потратили в этом месяце" value={money(spend)} tone="violet" />
      </div>
      {error && <ErrorNote text={error} />}
      {note && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">{note}</p>}

      {link && (
        <Card title={`Ссылка для менеджера · ${link.company}`} right={<button onClick={() => setLink(null)} aria-label="Закрыть" className="p-1 text-slate-400"><X size={16} /></button>}>
          <p className="text-sm text-slate-600 mb-3">
            {link.mail.sent ? 'Письмо со ссылкой отправлено менеджеру. Ссылку можно переслать и в мессенджер — она действует 7 дней и открывает только задание пароля.' : link.mail.error ?? 'Отправьте ссылку менеджеру сами.'}
          </p>
          <div className="flex gap-2">
            <input readOnly value={link.link} aria-label="Ссылка для менеджера" className={`${field} font-mono text-xs`} onFocus={e => e.target.select()} />
            <button onClick={() => void navigator.clipboard.writeText(link.link).then(() => flash('Ссылка скопирована'))} className="px-3 rounded-xl border border-slate-200 text-slate-600 inline-flex items-center gap-1.5 text-sm"><Copy size={14} />Копировать</button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Ссылка показывается один раз. Потеряли — нажмите «Новая ссылка» у компании.</p>
        </Card>
      )}

      {adding && (
        <Card title="Новая компания">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Название компании<input className={`${field} mt-1`} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Например, Yandex Go Taxi Park" /></label>
            <label className="text-xs text-slate-500">ИНН (необязательно)<input className={`${field} mt-1`} inputMode="numeric" value={form.inn} onChange={e => setForm({ ...form, inn: e.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="9 цифр" /></label>
            <label className="text-xs text-slate-500">Имя менеджера<input className={`${field} mt-1`} value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })} placeholder="Имя и фамилия" /></label>
            <label className="text-xs text-slate-500">Почта менеджера — это логин<input className={`${field} mt-1`} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="fleet@company.uz" /></label>
          </div>
          <p className="text-xs text-slate-500 mt-3">Менеджер получит письмо со ссылкой и сам задаст пароль. Пароль вы не видите и не передаёте.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => void create()} disabled={busy || !form.name || !form.managerName || !form.email} className="px-4 py-2 rounded-xl bg-[#111] text-white text-sm font-semibold disabled:opacity-40">{busy ? 'Создаём…' : 'Создать и пригласить'}</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600">Отмена</button>
          </div>
        </Card>
      )}

      <Card pad={false} title="Все компании">
        {list.length === 0 ? <Empty text="Компаний пока нет — создайте первую после договора" /> : (
          <div className="divide-y divide-slate-50">
            {list.map(c => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-100 grid place-items-center text-slate-600 shrink-0"><Briefcase size={18} /></span>
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-semibold text-slate-900 flex items-center gap-2">{c.name}{c.demo && <Pill tone="slate">демо</Pill>}</p>
                    <p className="text-xs text-slate-500">{`${c.inn ? `ИНН ${c.inn} · ` : ''}с ${dateTime(c.createdAt)} · ${c.employees} сотрудн. · в этом месяце ${money(c.monthSpend)}, ${num(c.monthKwh)} кВт·ч`}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.managers.map(m => (
                        <span key={m.id} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2 py-1">
                          {`${m.name} · ${m.login} · `}{m.active ? <span className="text-emerald-600">вошёл</span> : <span className="text-amber-600">{`ждёт пароль${m.inviteExpires ? ` до ${dateTime(m.inviteExpires)}` : ''}`}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums">{money(c.balance)}</p>
                    <p className="text-[11px] text-slate-400">на счёте</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setCredit({ id: c.id, amount: '', reference: '' })} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"><Wallet size={13} />Зачислить перевод</button>
                  {!c.demo && <button onClick={() => void reinvite(c)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"><Mail size={13} />Новая ссылка менеджеру</button>}
                </div>
                {credit?.id === c.id && (
                  <div className="mt-3 grid sm:grid-cols-[1fr_1.4fr_auto_auto] gap-2 items-end bg-slate-50 rounded-xl p-3">
                    <label className="text-xs text-slate-500">Сумма, сум<input className={`${field} mt-1`} inputMode="numeric" value={credit.amount} onChange={e => setCredit({ ...credit, amount: e.target.value.replace(/[^\d ]/g, '') })} placeholder="5 000 000" /></label>
                    <label className="text-xs text-slate-500">Платёжка или основание<input className={`${field} mt-1`} value={credit.reference} onChange={e => setCredit({ ...credit, reference: e.target.value })} placeholder="п/п №124 от 23.11" /></label>
                    <button onClick={() => void doCredit()} disabled={busy || !credit.amount || !credit.reference} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40">Зачислить</button>
                    <button onClick={() => setCredit(null)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">Отмена</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

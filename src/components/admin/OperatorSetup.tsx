import { useEffect, useState } from 'react';
import { Copy, Check, KeyRound, LoaderCircle, Plug, Wallet } from 'lucide-react';
import type { IntegrationSettings, IntegrationType, PayoutSettings } from '../../lib/api';
import { useSync } from '../../lib/sync';

const TYPES: { id: IntegrationType; label: string; hint: string }[] = [
  { id: 'OCPP 1.6-J', label: 'OCPP — станции напрямую', hint: 'Своей системы у сети нет: зарядки подключаются к нам по OCPP 1.6-J.' },
  { id: 'OCPI 2.2.1', label: 'OCPI 2.2.1', hint: 'У сети своя система с OCPI — подключается в блоке «Сети-партнёры по OCPI».' },
  { id: 'Network API', label: 'API Zaryad24 для сетей', hint: 'Своя система без OCPI: сеть передаёт станции, статусы и зарядки в наше API, а команды старта и остановки получает на свой вебхук.' },
  { id: 'Только карта', label: 'Только на карте', hint: 'Без интеграции: станции, разъёмы и цены видны на карте, заряжаются в приложении сети.' },
];

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <code className="px-2 py-1 rounded-lg bg-slate-50 text-slate-700 break-all" data-no-translate>{value}</code>
      <button
        onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => {})}
        aria-label={`Скопировать: ${label}`}
        className="p-1 rounded-lg hover:bg-slate-100"
      >
        {done ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

const input = 'mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-normal text-slate-800';

/** How a network connects, and where the drivers' money for it goes. */
export function OperatorSetup({ operatorId, onChanged }: { operatorId: string; onChanged: () => void }) {
  const { actions } = useSync();
  const [integration, setIntegration] = useState<IntegrationSettings | null>(null);
  const [payout, setPayout] = useState<PayoutSettings | null>(null);
  const [type, setType] = useState<IntegrationType>('OCPP 1.6-J');
  const [webhook, setWebhook] = useState('');
  const [issued, setIssued] = useState<{ key: string; secret: string } | null>(null);
  const [mode, setMode] = useState<'platform' | 'direct'>('platform');
  const [pm, setPm] = useState({ merchantId: '', key: '' });
  const [ck, setCk] = useState({ serviceId: '', merchantId: '', secret: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    actions.integration('admin', operatorId).then(i => {
      setIntegration(i);
      setType((TYPES.find(t => t.id === i.type)?.id ?? 'OCPP 1.6-J') as IntegrationType);
      setWebhook(i.networkApi?.webhookUrl ?? '');
    }).catch(e => setNote({ ok: false, text: (e as Error).message }));
    actions.payout('admin', operatorId).then(p => {
      setPayout(p);
      setMode(p.mode);
      setPm({ merchantId: p.payme?.merchantId ?? '', key: '' });
      setCk({ serviceId: p.click?.serviceId ?? '', merchantId: p.click?.merchantId ?? '', secret: '' });
    }).catch(e => setNote({ ok: false, text: (e as Error).message }));
  }, [actions, operatorId]);

  const run = async (what: string, fn: () => Promise<void>, ok: string) => {
    setBusy(what);
    setNote(null);
    try {
      await fn();
      setNote({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const saveIntegration = () =>
    run('int', async () => {
      const r = await actions.setIntegration('admin', operatorId, { type, ...(type === 'Network API' ? { webhookUrl: webhook.trim() } : {}) });
      setIntegration(r);
      if (r.key && r.secret) setIssued({ key: r.key, secret: r.secret });
    }, 'Подключение сохранено');
  const rotate = () =>
    run('rot', async () => {
      const r = await actions.rotateNetworkKey('admin', operatorId);
      setIntegration(r);
      if (r.key && r.secret) setIssued({ key: r.key, secret: r.secret });
    }, 'Выпущен новый ключ — старый больше не работает');
  const savePayout = () =>
    run('pay', async () => {
      const body: Record<string, unknown> = { mode };
      if (pm.merchantId.trim()) body.payme = { merchantId: pm.merchantId.trim(), key: pm.key.trim() };
      if (ck.serviceId.trim()) body.click = { serviceId: ck.serviceId.trim(), merchantId: ck.merchantId.trim(), secret: ck.secret.trim() };
      const p = await actions.setPayout('admin', operatorId, body);
      setPayout(p);
      setPm(v => ({ ...v, key: '' }));
      setCk(v => ({ ...v, secret: '' }));
    }, mode === 'direct' ? 'Оплата напрямую сети включена' : 'Расчёты через платформу');

  const hint = TYPES.find(t => t.id === type)?.hint;
  return (
    <div className="mt-4 rounded-xl border border-slate-100 p-4 space-y-5 bg-slate-50/50">
      {note && <p role="status" className={`text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}

      <section className="space-y-2">
        <p className="text-sm font-semibold text-slate-800 inline-flex items-center gap-2"><Plug size={15} />Как подключена сеть</p>
        <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Способ подключения">
          {TYPES.map(t => (
            <button key={t.id} role="radio" aria-checked={type === t.id} disabled={t.id === 'OCPI 2.2.1' && integration?.type !== 'OCPI 2.2.1'} onClick={() => setType(t.id)}
              className={`text-left px-3 py-2 rounded-xl border text-sm disabled:opacity-50 ${type === t.id ? 'border-[#FFB000] bg-amber-50 font-semibold text-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
        {type === 'Network API' && (
          <label className="block text-xs font-semibold text-slate-500">
            Вебхук сети для команд старта и остановки
            <input value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://network.uz/zaryad24/hook" className={input} data-no-translate />
          </label>
        )}
        {type === 'Network API' && integration?.networkApi && !issued && (
          <p className="text-xs text-slate-500">{`Ключ ${integration.networkApi.keyPrefix}… выпущен — полностью он показывается только при выпуске.`}</p>
        )}
        {issued && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-amber-900">Передайте сети сейчас — больше эти значения не покажутся:</p>
            <CopyLine label="API-ключ (Bearer)" value={issued.key} />
            <CopyLine label="Секрет подписи вебхука" value={issued.secret} />
            <p className="text-[11px] text-amber-900/80" data-no-translate>PUT /api/network/v1/stations/:ref · PATCH /api/network/v1/stations/:ref/connectors/:cref · POST /api/network/v1/sessions/:ref</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={saveIntegration} disabled={busy !== null || type === 'OCPI 2.2.1'} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
            {busy === 'int' && <LoaderCircle size={14} className="animate-spin" />}Сохранить подключение
          </button>
          {integration?.type === 'Network API' && (
            <button onClick={rotate} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 disabled:opacity-50">
              <KeyRound size={14} />Выпустить новый ключ
            </button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-slate-800 inline-flex items-center gap-2"><Wallet size={15} />Куда идут деньги водителей</p>
        <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Расчёты">
          {([['platform', 'Через платформу', 'Водитель платит из кошелька Zaryad24, сети — выплата за вычетом комиссии.'], ['direct', 'Напрямую сети', 'У водителя баланс этой сети; пополнение идёт в кассу сети в Payme или Click, мы видим каждый платёж.']] as const).map(([id, label, text]) => (
            <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`text-left px-3 py-2 rounded-xl border ${mode === id ? 'border-[#FFB000] bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <span className="block text-sm font-semibold text-slate-800">{label}</span>
              <span className="block text-xs text-slate-500">{text}</span>
            </button>
          ))}
        </div>
        {mode === 'direct' && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-500">
                Payme: ID кассы
                <input value={pm.merchantId} onChange={e => setPm(v => ({ ...v, merchantId: e.target.value }))} className={input} data-no-translate />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Payme: ключ кассы
                <input type="password" autoComplete="off" value={pm.key} onChange={e => setPm(v => ({ ...v, key: e.target.value }))} placeholder={payout?.payme ? 'сохранён — оставьте пустым' : ''} className={input} />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Click: service_id
                <input value={ck.serviceId} onChange={e => setCk(v => ({ ...v, serviceId: e.target.value }))} inputMode="numeric" className={input} data-no-translate />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Click: merchant_id
                <input value={ck.merchantId} onChange={e => setCk(v => ({ ...v, merchantId: e.target.value }))} inputMode="numeric" className={input} data-no-translate />
              </label>
              <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
                Click: секретный ключ
                <input type="password" autoComplete="off" value={ck.secret} onChange={e => setCk(v => ({ ...v, secret: e.target.value }))} placeholder={payout?.click ? 'сохранён — оставьте пустым' : ''} className={input} />
              </label>
            </div>
            {payout && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Сеть указывает эти адреса в настройках своей кассы — так деньги идут ей, а подтверждения приходят нам:</p>
                <CopyLine label="Payme (Merchant API)" value={payout.callbacks.payme} />
                <CopyLine label="Click Prepare" value={payout.callbacks.clickPrepare} />
                <CopyLine label="Click Complete" value={payout.callbacks.clickComplete} />
              </div>
            )}
            {payout?.sandbox && <p className="text-xs text-slate-500 bg-slate-100 rounded-xl px-3 py-2">Демо-касса: платежи проходят весь путь подтверждения, но деньги не списываются.</p>}
          </>
        )}
        <button onClick={savePayout} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FFC83D] text-[#111] text-sm font-semibold disabled:opacity-50">
          {busy === 'pay' && <LoaderCircle size={14} className="animate-spin" />}Сохранить расчёты
        </button>
      </section>
    </div>
  );
}

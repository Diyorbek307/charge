import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Power, Send, Copy, Check, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created: string;
}

interface Delivery {
  id: string;
  webhookId: string;
  event: string;
  url: string;
  body: string;
  headers: Record<string, string>;
  status: string;
  ts: string;
}

const token = () => {
  try {
    return localStorage.getItem('oc-token-api');
  } catch {
    return null;
  }
};

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token()}`,
      ...options.headers,
    },
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data as T;
}

/**
 * Live webhook sandbox.
 *
 * The platform signs every matching event and records exactly what it would
 * POST, but never performs the outbound request: this service is publicly
 * reachable, so calling arbitrary partner-supplied URLs would turn it into an
 * SSRF gadget. Partners get the signed payload and headers to verify against.
 */
export default function WebhooksLive() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string[]>(['session.start', 'session.stop']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openDelivery, setOpenDelivery] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, d] = await Promise.all([
        call<Webhook[]>('/webhooks'),
        call<Delivery[]>('/webhooks/deliveries?limit=25'),
      ]);
      setHooks(h);
      setDeliveries(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить');
    }
  }, []);

  useEffect(() => {
    call<string[]>('/webhooks/events').then(setAvailable).catch(() => setAvailable([]));
    void refresh();
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { webhook } = await call<{ webhook: Webhook }>('/webhooks', {
        method: 'POST',
        body: JSON.stringify({ url, events: picked }),
      });
      setFreshSecret(webhook.secret);
      setUrl('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать');
    } finally {
      setBusy(false);
    }
  };

  const copy = (id: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };

  const toggleEvent = (ev: string) =>
    setPicked(p => (p.includes(ev) ? p.filter(x => x !== ev) : [...p, ev]));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={15} className="text-emerald-400" />
        <h3 className="text-sm font-bold text-white">Песочница · живые webhooks</h3>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Каждое событие платформы подписывается HMAC-SHA256 и попадает в журнал ниже. Исходящий
        запрос на ваш адрес не отправляется — сервис публичный, и вызов произвольных URL сделал бы
        его SSRF-инструментом. Вы получаете точный payload и заголовки, чтобы проверить подпись.
      </p>

      {/* Register */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400">НОВЫЙ ENDPOINT</p>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://your-server.uz/hooks/one-charge"
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-sky-500 font-mono"
        />
        <div className="flex flex-wrap gap-1.5">
          {available.map(ev => (
            <button
              key={ev}
              onClick={() => toggleEvent(ev)}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition-colors ${
                picked.includes(ev)
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {ev}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-[11px] text-rose-400">
            <TriangleAlert size={12} />
            {error}
          </p>
        )}
        <button
          onClick={create}
          disabled={busy || !url || picked.length === 0}
          className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
        >
          {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />}
          Зарегистрировать
        </button>

        {freshSecret && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
            <p className="text-[11px] text-amber-300 font-semibold mb-1.5">
              Сохраните секрет — он показывается один раз
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] text-amber-200 font-mono break-all">{freshSecret}</code>
              <button
                onClick={() => copy('secret', freshSecret)}
                className="text-amber-300 hover:text-amber-100 shrink-0"
                aria-label="Скопировать секрет"
              >
                {copied === 'secret' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Registered */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400">ЗАРЕГИСТРИРОВАННЫЕ ({hooks.length})</p>
        {hooks.map(h => (
          <div
            key={h.id}
            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex items-start gap-3 flex-wrap"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${h.active ? 'bg-emerald-400' : 'bg-slate-600'}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono text-white break-all">{h.url}</p>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">{h.events.join(' · ')}</p>
              <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{h.secret}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => call(`/webhooks/${h.id}/test`, { method: 'POST' }).then(refresh)}
                title="Отправить тестовое событие"
                className="w-7 h-7 grid place-items-center rounded-lg text-slate-500 hover:text-sky-400 hover:bg-slate-700 transition-colors"
              >
                <Send size={12} />
              </button>
              <button
                onClick={() => call(`/webhooks/${h.id}/toggle`, { method: 'POST' }).then(refresh)}
                title={h.active ? 'Отключить' : 'Включить'}
                className="w-7 h-7 grid place-items-center rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-700 transition-colors"
              >
                <Power size={12} />
              </button>
              <button
                onClick={() => call(`/webhooks/${h.id}`, { method: 'DELETE' }).then(refresh)}
                title="Удалить"
                className="w-7 h-7 grid place-items-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-700 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {hooks.length === 0 && <p className="text-xs text-slate-600">Пока нет endpoint'ов</p>}
      </div>

      {/* Deliveries */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400">ЖУРНАЛ ДОСТАВОК ({deliveries.length})</p>
        {deliveries.length === 0 && (
          <p className="text-xs text-slate-600">
            Пусто. Начните зарядку в Driver App — событие подпишется и появится здесь.
          </p>
        )}
        {deliveries.map(d => (
          <div key={d.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenDelivery(openDelivery === d.id ? null : d.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700/40 transition-colors"
            >
              <span className="text-[10px] font-mono text-emerald-400 shrink-0">{d.status}</span>
              <span className="text-[11px] font-mono text-sky-300 shrink-0">{d.event}</span>
              <span className="text-[10px] text-slate-500 truncate flex-1">{d.url}</span>
              <span className="text-[10px] text-slate-600 shrink-0">
                {new Date(d.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
            {openDelivery === d.id && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-700/50 pt-2.5">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">HEADERS</p>
                  <pre className="bg-slate-950 rounded-lg p-2.5 text-[10px] font-mono text-slate-300 overflow-x-auto">
                    {Object.entries(d.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')}
                  </pre>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-slate-500">BODY</p>
                    <button
                      onClick={() => copy(d.id, d.body)}
                      className={`text-[10px] flex items-center gap-1 ${copied === d.id ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {copied === d.id ? <Check size={10} /> : <Copy size={10} />} Copy
                    </button>
                  </div>
                  <pre className="bg-slate-950 rounded-lg p-2.5 text-[10px] font-mono text-green-300 overflow-x-auto">
                    {JSON.stringify(JSON.parse(d.body), null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

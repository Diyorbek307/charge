import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, LoaderCircle } from 'lucide-react';
import { tokenStore, type Portal } from '../lib/api';

type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'busy';

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function pushCall<T>(path: string, portal: Portal, body?: unknown): Promise<T> {
  const token = tokenStore.get(portal);
  const res = await fetch(`/api/push${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data as T;
}

const COPY: Record<PushState, string> = {
  unsupported: 'Этот браузер не поддерживает push-уведомления',
  denied: 'Уведомления запрещены в настройках браузера',
  off: 'Узнайте о своей очереди и конце зарядки, даже когда приложение закрыто',
  on: 'Включены на этом устройстве',
  busy: 'Подключаем…',
};

/** Enables Web Push for one portal's account on this device. */
export default function PushToggle({ portal, compact = false }: { portal: Portal; compact?: boolean }) {
  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [state, setState] = useState<PushState>(supported ? 'off' : 'unsupported');
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (!supported) return;
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then(reg => reg?.pushManager.getSubscription())
      .then(sub => setState(sub ? 'on' : 'off'))
      .catch(() => {});
  }, [supported]);

  const enable = async () => {
    setError(null);
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const { publicKey } = await pushCall<{ publicKey: string }>('/vapid-key', portal);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await pushCall('/subscribe', portal, sub.toJSON());
      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось включить уведомления');
      setState('off');
    }
  };

  const disable = async () => {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await pushCall('/unsubscribe', portal, { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setState('on');
    }
  };

  const sendTest = async () => {
    setError(null);
    try {
      await pushCall('/test', portal, {});
      setTested(true);
      setTimeout(() => setTested(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить');
    }
  };

  const Icon = state === 'on' ? BellRing : state === 'busy' ? LoaderCircle : state === 'off' ? Bell : BellOff;
  const actionable = state === 'off' || state === 'on';

  return (
    <div className={`rounded-2xl border border-slate-100 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${
            state === 'on' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Icon size={17} className={state === 'busy' ? 'animate-spin' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Push-уведомления</p>
          <p className="text-xs text-slate-500 leading-snug">{COPY[state]}</p>
        </div>
        {actionable && (
          <button
            onClick={state === 'on' ? disable : enable}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              state === 'on' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-sky-500 text-white hover:bg-sky-600'
            }`}
          >
            {state === 'on' ? 'Выключить' : 'Включить'}
          </button>
        )}
      </div>
      {state === 'on' && (
        <button onClick={sendTest} className="mt-2 text-xs font-medium text-sky-600 hover:underline">
          {tested ? 'Отправлено — проверьте уведомления' : 'Прислать тестовое уведомление'}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

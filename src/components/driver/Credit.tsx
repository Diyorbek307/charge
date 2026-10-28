import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, LoaderCircle, ScanFace, ShieldCheck, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import type { CreditState } from '../../lib/api';
import { useSync } from '../../lib/sync';

const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
// Numeric dates read the same in every language.
const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Draws a frame into a 320×400 portrait JPEG — small enough to send, big enough to recognise a face. */
function toJpeg(source: CanvasImageSource, w: number, h: number, mirror: boolean): string {
  const W = 320;
  const H = 400;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(W / w, H / h);
  const dw = w * scale;
  const dh = h * scale;
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Front camera with an oval guide. Where the browser has no camera access
 * (or the person declines it), the phone's own camera app is offered instead.
 */
export function FaceCapture({ title, hint, busy, error, onShot, onClose }: { title: string; hint: string; busy: boolean; error: string | null; onShot: (image: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState<'starting' | 'on' | 'off'>('starting');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false })
      .then(s => {
        if (cancelled) return s.getTracks().forEach(t => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setLive('on');
      })
      .catch(() => setLive('off')) ?? setLive('off');
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    onShot(toJpeg(v, v.videoWidth, v.videoHeight, true));
  };
  const fromFile = (f: File | undefined) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      onShot(toJpeg(img, img.naturalWidth, img.naturalHeight, false));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className="absolute inset-0 z-[10000] bg-[#111] flex flex-col text-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={onClose} aria-label="Закрыть" className="p-2 rounded-xl bg-white/10"><X size={18} /></button>
        <p className="font-bold flex-1">{title}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="relative w-64 h-80 rounded-[50%] overflow-hidden border-4 border-[#FFC83D] bg-black/60 grid place-items-center">
          <video ref={video} playsInline muted className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${live === 'on' ? '' : 'hidden'}`} />
          {live !== 'on' && <ScanFace size={72} className="text-white/30" />}
          {busy && (
            <div className="absolute inset-0 bg-black/50 grid place-items-center">
              <LoaderCircle size={36} className="animate-spin text-[#FFC83D]" />
            </div>
          )}
        </div>
        <p className="text-sm text-white/80 text-center max-w-xs">{hint}</p>
        {live === 'off' && <p className="text-xs text-white/60 text-center max-w-xs">Нет доступа к камере в браузере — сделайте селфи камерой телефона.</p>}
        {error && (
          <p role="alert" className="text-sm text-red-300 bg-red-500/15 rounded-xl px-3 py-2 text-center max-w-xs">{error}</p>
        )}
      </div>
      <div className="px-4 pb-8 pt-2 space-y-2">
        {live === 'on' ? (
          <button onClick={snap} disabled={busy} className="w-full py-4 rounded-2xl bg-[#FFC83D] text-[#111] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <Camera size={18} />Сделать фото
          </button>
        ) : (
          <button onClick={() => file.current?.click()} disabled={busy || live === 'starting'} className="w-full py-4 rounded-2xl bg-[#FFC83D] text-[#111] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <Upload size={18} />Сделать селфи
          </button>
        )}
        <input ref={file} type="file" accept="image/*" capture="user" className="hidden" onChange={e => fromFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Before a credit charge: a fresh photo, checked by the server, returns a single-use token. */
export function FaceCheck({ onVerified, onClose }: { onVerified: (faceToken: string) => void; onClose: () => void }) {
  const { actions } = useSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shot = async (image: string) => {
    setBusy(true);
    setError(null);
    try {
      onVerified((await actions.verifyFace(image)).faceToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return <FaceCapture title="Подтвердите, что это вы" hint="Посмотрите в камеру. Зарядка в долг начинается только после проверки лица." busy={busy} error={error} onShot={shot} onClose={onClose} />;
}

function Terms({ c }: { c: CreditState }) {
  const items = [
    `Лимит — до ${sum(c.limit)} одновременно.`,
    `Каждую зарядку нужно оплатить в течение ${c.days} дней после её окончания.`,
    'Без процентов и комиссий: вы возвращаете ровно стоимость зарядки.',
    'Гасите долг из кошелька в любой момент, частями или сразу.',
    'Пока есть просрочка, новые зарядки в долг недоступны. Обычная оплата из кошелька работает.',
    'Перед каждой зарядкой в долг приложение проверяет ваше лицо — так никто другой не сможет зарядиться за ваш счёт.',
    'Фото лица хранится только для этой проверки и не показывается операторам станций. Удалить его можно в любой момент, когда долга нет.',
  ];
  return (
    <ol className="space-y-2 text-sm text-slate-600 list-decimal pl-5">
      {items.map(t => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
}

export function CreditScreen({ onBack }: { onBack: () => void }) {
  const { state, sessions, actions, refresh } = useSync();
  const c = state?.credit;
  const me = sessions.driver;
  const balance = (me && state?.wallets[me.id]?.balance) ?? 0;
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeFace, setAgreeFace] = useState(false);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNote(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNote({ ok: true, text: ok });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const enroll = async (image: string) => {
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      await actions.enrollCredit(image, c.termsVersion);
      await refresh();
      setCamera(false);
      setNote({ ok: true, text: 'Готово: теперь при старте зарядки можно выбрать «В долг»' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl bg-slate-100"><ArrowLeft size={18} className="text-slate-600" /></button>
        <h1 className="text-base font-bold text-slate-900 flex-1">Зарядка в долг</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {note && <p role="status" className={`text-sm rounded-xl px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{note.text}</p>}
        {!c ? (
          <div className="py-10 grid place-items-center"><LoaderCircle className="animate-spin text-slate-400" /></div>
        ) : !c.enrolled ? (
          <>
            <div className="rounded-2xl p-4 bg-[#111] text-white">
              <p className="text-xs text-white/60">Зарядитесь сейчас — заплатите потом. Лимит:</p>
              <p className="text-2xl font-bold mt-1 text-[#FFC83D]">{sum(c.limit)}</p>
              <p className="text-sm text-white/70 mt-1">{`${c.days} дней на оплату · без процентов · подтверждение лицом`}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <p className="text-sm font-semibold text-slate-800 mb-2">Как это работает</p>
              <div className="space-y-2">
                {[
                  ['1', 'Один раз сохраняете фото лица и принимаете условия'],
                  ['2', 'При старте зарядки выбираете «В долг» и смотрите в камеру'],
                  ['3', 'Заряжаетесь, а оплачиваете из кошелька, когда удобно — в пределах срока'],
                ].map(([n, t]) => (
                  <div key={n} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-[#FFC83D] text-[#111] text-xs font-bold grid place-items-center shrink-0">{n}</span>
                    <p className="text-sm text-slate-600">{t}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <p className="text-sm font-semibold text-slate-800 mb-2">Условия</p>
              <Terms c={c} />
              <p className="text-xs text-slate-400 mt-3">{`Редакция ${c.termsVersion}`}</p>
            </div>
            <label className="flex gap-3 items-start bg-white rounded-2xl p-4 border border-slate-100 cursor-pointer">
              <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#FFB000]" />
              <span className="text-sm text-slate-700">Я прочитал(а) условия и принимаю их</span>
            </label>
            <label className="flex gap-3 items-start bg-white rounded-2xl p-4 border border-slate-100 cursor-pointer">
              <input type="checkbox" checked={agreeFace} onChange={e => setAgreeFace(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#FFB000]" />
              <span className="text-sm text-slate-700">Согласен(на) на сохранение и обработку фото моего лица для подтверждения зарядок в долг</span>
            </label>
            {c.provider === 'sandbox' && (
              <p className="text-xs text-slate-500 bg-slate-100 rounded-xl px-3 py-2">Демо-режим: фото сохраняется, а сравнение лица с эталоном заработает после подключения MyID.</p>
            )}
          </>
        ) : (
          <>
            {c.overdue && (
              <div role="alert" className="flex gap-2 items-start bg-red-50 border border-red-100 rounded-2xl p-3">
                <TriangleAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">Срок оплаты прошёл. Погасите долг — после этого зарядка в долг снова станет доступна.</p>
              </div>
            )}
            {c.status === 'paused' && <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">Зарядка в долг приостановлена поддержкой.</p>}
            <div className="rounded-2xl p-4 bg-[#111] text-white">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-white/60">Доступно в долг</p>
                  <p className="text-2xl font-bold text-[#FFC83D] tabular-nums">{sum(c.available)}</p>
                  <p className="text-xs text-white/60 mt-0.5">{`Лимит в долг: ${sum(c.limit)}`}</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-white/15 mt-3 overflow-hidden">
                <div className="h-full bg-[#FFC83D]" style={{ width: `${Math.min(100, (c.debt / Math.max(1, c.limit)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-3">
                <span>{`Долг: ${sum(c.debt)}`}</span>
                {c.nextDue && <span className={c.overdue ? 'text-red-300' : 'text-white/70'}>{`оплатить до ${day(c.nextDue)}`}</span>}
              </div>
            </div>
            {c.debt > 0 && (
              <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-2">
                <p className="text-sm text-slate-600">{`В кошельке ${sum(balance)}`}</p>
                <button
                  onClick={() => run(() => actions.repayCredit(), 'Долг погашен из кошелька')}
                  disabled={busy || balance <= 0}
                  className="w-full py-3 rounded-xl bg-[#FFC83D] text-[#111] font-bold disabled:opacity-50"
                >
                  {balance >= c.debt ? `Погасить ${sum(c.debt)}` : `Погасить ${sum(balance)} из кошелька`}
                </button>
                {balance < c.debt && <p className="text-xs text-slate-500">Пополните кошелёк через Payme или Click, чтобы погасить всё.</p>}
              </div>
            )}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <p className="text-xs font-semibold text-slate-500 px-4 pt-3 pb-2">ЗАРЯДКИ В ДОЛГ</p>
              {c.debts.length === 0 && <p className="text-sm text-slate-500 px-4 pb-4">Пока не было. При старте зарядки выберите «В долг».</p>}
              {c.debts.map(d => (
                <div key={d.id} className="px-4 py-3 border-t border-slate-100 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{d.station}</p>
                    <p className="text-xs text-slate-500">{d.refunded ? 'Возврат — долг списан' : d.paidAt ? `Оплачено ${day(d.paidAt)}` : `оплатить до ${day(d.dueAt)}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{sum(d.amount)}</p>
                    {!d.paidAt && d.repaid > 0 && <p className="text-xs text-slate-500">{`осталось оплатить ${sum(d.left)}`}</p>}
                    {d.paidAt && !d.refunded && <Check size={14} className="text-emerald-600 inline" />}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center gap-3">
              <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-slate-600 flex-1">{`Фото лица сохранено ${c.faceSavedAt ? day(c.faceSavedAt) : ''}. Условия приняты ${c.acceptedAt ? day(c.acceptedAt) : ''}.`}</p>
            </div>
            <button
              onClick={() => run(() => actions.deleteCredit(), 'Фото удалено, зарядка в долг отключена')}
              disabled={busy || c.debt > 0}
              className="w-full py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={15} />Удалить фото и отключить
            </button>
            {c.debt > 0 && <p className="text-xs text-slate-500 text-center">Удалить фото можно после погашения долга.</p>}
          </>
        )}
      </div>
      {c && !c.enrolled && (
        <div className="px-4 pb-6 pt-2 bg-slate-50">
          <button
            onClick={() => { setError(null); setCamera(true); }}
            disabled={!agreeTerms || !agreeFace}
            className="w-full py-4 rounded-2xl bg-[#FFC83D] text-[#111] font-bold inline-flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <ScanFace size={18} />Сохранить лицо и подключить
          </button>
        </div>
      )}
      {camera && (
        <FaceCapture
          title="Фото лица"
          hint="Лицо целиком в овале, без очков и головного убора, при хорошем свете."
          busy={busy}
          error={error}
          onShot={enroll}
          onClose={() => setCamera(false)}
        />
      )}
    </div>
  );
}

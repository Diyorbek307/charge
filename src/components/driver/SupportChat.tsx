import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, Send, X } from 'lucide-react';
import type { SupportThread } from '../../lib/api';
import { useSync } from '../../lib/sync';

/** Shrinks a photo to ~1000 px so it travels fast and fits the request limit. */
export function shrink(file: File, max = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const time = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

/** Chat with support: text and a photo of the problem; answers arrive live. */
export default function SupportChat() {
  const { actions, events } = useSync();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const latest = events.find(e => e.type === 'support.message')?.id;

  const load = useCallback(() => {
    actions.supportThread().then(setThread).catch(() => {});
  }, [actions]);
  useEffect(() => {
    load();
  }, [load, latest]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  const send = async () => {
    if (!text.trim() && !image) return;
    setBusy(true);
    setError(null);
    try {
      setThread(await actions.sendSupport(text.trim(), image));
      setText('');
      setImage(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-800">Чат с поддержкой</p>
        <p className="text-xs text-slate-500">Опишите проблему и приложите фото — ответим здесь и пришлём уведомление</p>
      </div>
      <div className="max-h-72 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
        {(thread?.messages ?? []).length === 0 && <p className="text-center text-xs text-slate-400 py-4">Сообщений пока нет</p>}
        {thread?.messages.map(m => (
          <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.from === 'user' ? 'bg-[#FFC83D] text-[#111]' : 'bg-white border border-slate-100 text-slate-800'}`}>
              {m.from === 'support' && <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Поддержка Zaryad24</p>}
              {m.image && <img src={m.image} alt="Фото к сообщению" className="rounded-xl mb-1 max-h-48 object-cover" />}
              {m.text && <p className="text-sm whitespace-pre-wrap">{m.text}</p>}
              <p className={`text-[10px] mt-0.5 ${m.from === 'user' ? 'text-black/50' : 'text-slate-400'}`}>{time(m.at)}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {image && (
        <div className="px-3 pt-2 flex items-center gap-2">
          <img src={image} alt="Фото к отправке" className="w-12 h-12 rounded-lg object-cover" />
          <button onClick={() => setImage(null)} aria-label="Убрать фото" className="p-1 rounded-lg bg-slate-100"><X size={14} /></button>
        </div>
      )}
      {error && <p role="alert" className="mx-3 mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">{error}</p>}
      <div className="p-3 flex items-end gap-2">
        <button onClick={() => file.current?.click()} aria-label="Приложить фото" className="w-10 h-10 rounded-xl bg-slate-100 grid place-items-center shrink-0"><ImagePlus size={18} className="text-slate-600" /></button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && shrink(e.target.files[0]).then(setImage).catch(() => setError('Не удалось прочитать фото'))} />
        <textarea value={text} onChange={e => setText(e.target.value)} rows={1} placeholder="Сообщение" aria-label="Сообщение в поддержку"
          className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm max-h-28" />
        <button onClick={send} disabled={busy || (!text.trim() && !image)} aria-label="Отправить" className="w-10 h-10 rounded-xl bg-[#FFC83D] text-[#111] grid place-items-center shrink-0 disabled:opacity-40">
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}

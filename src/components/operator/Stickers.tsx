import { useEffect, useState, type ReactNode } from 'react';
import { Download, LoaderCircle, QrCode, X } from 'lucide-react';
import { downloadStickers, stickerPreview, stickerLink, type StickerStation } from '../../lib/stickers';
import { plural } from '../../lib/analytics';

/** Saves the PDF of stickers for these stations: one per charge point, four to a page. */
export function StickerButton({ stations, fileName, label, compact, icon }: { stations: StickerStation[]; fileName: string; label: string; compact?: boolean; icon?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const points = stations.reduce((n, s) => n + Math.max(1, s.connectors.length), 0);
  const run = async () => {
    setBusy(true);
    setError(false);
    try {
      await downloadStickers(stations, fileName);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (compact) {
    return (
      <button onClick={() => void run()} disabled={busy || !stations.length} aria-label={label} title={`${label} — ${points} ${plural(points, ['наклейка', 'наклейки', 'наклеек'])}, PDF`}
        className={`p-2 rounded-lg border ${error ? 'border-red-200 text-red-500' : 'border-slate-200 text-slate-500'} hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40`}>
        {busy ? <LoaderCircle size={15} className="animate-spin" /> : icon ?? <QrCode size={15} />}
      </button>
    );
  }
  return (
    <button onClick={() => void run()} disabled={busy || !stations.length} title={`${points} ${plural(points, ['наклейка', 'наклейки', 'наклеек'])} — по одной на каждую точку зарядки`}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-semibold disabled:opacity-50 ${error ? 'border-red-200 text-red-600' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
      {busy ? <LoaderCircle size={15} className="animate-spin" /> : icon ?? <QrCode size={15} />}
      {error ? 'Не получилось — ещё раз' : busy ? 'Готовим PDF…' : label}
    </button>
  );
}

/** The station's stickers, point by point, before they go to print. */
export function StickerPreview({ station }: { station: StickerStation }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSrc(null);
    void stickerPreview(station, index).then(url => alive && setSrc(url)).catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [open, index, station]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <>
      <button onClick={() => { setIndex(0); setOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <QrCode size={15} />Наклейка QR
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setOpen(false)} role="dialog" aria-modal="true" aria-label={`Наклейки QR · ${station.name}`}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-full overflow-y-auto p-5 space-y-4" style={{ animation: 'enter-up 0.25s ease both' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Наклейки QR</h3>
                <p className="text-xs text-slate-500">{`По одной на каждую точку · ${station.name}`}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Закрыть" className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {station.connectors.length > 1 && (
              <div className="flex gap-1.5" role="tablist" aria-label="Точка зарядки">
                {station.connectors.map((c, i) => (
                  <button key={c.id} role="tab" aria-selected={index === i} onClick={() => setIndex(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${index === i ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {`${String.fromCharCode(65 + i)} · ${c.type}`}
                  </button>
                ))}
              </div>
            )}
            <div className="aspect-[105/148] rounded-xl bg-slate-50 border border-slate-100 overflow-hidden grid place-items-center">
              {src ? <img src={src} alt={`Наклейка точки ${String.fromCharCode(65 + index)}`} className="w-full h-full object-contain" /> : src === '' ? <p className="text-sm text-red-500">Не удалось нарисовать наклейку</p> : <LoaderCircle size={22} className="animate-spin text-slate-400" />}
            </div>
            <p className="text-[11px] text-slate-400 break-all">{`В коде ссылка: ${stickerLink(station.id, station.connectors[index]?.id)}`}</p>
            <p className="text-xs text-slate-500">Печатайте в натуральную величину (A6, QR около 6 см) на виниловой плёнке. Клейте на корпус у своего разъёма, не на стекло экрана.</p>
            <StickerButton stations={[station]} fileName={`qr-${station.id}.pdf`} label={`Скачать PDF · ${Math.max(1, station.connectors.length)} ${plural(Math.max(1, station.connectors.length), ['наклейка', 'наклейки', 'наклеек'])}`} icon={<Download size={15} />} />
          </div>
        </div>
      )}
    </>
  );
}

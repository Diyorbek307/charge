import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Sheet, LoaderCircle, Check } from 'lucide-react';
import { exportCsv, exportPdf, type CsvValue } from '../lib/export';

interface Props {
  /** Base file name, without extension or timestamp. */
  name: string;
  title: string;
  headers: string[];
  rows: CsvValue[][];
  className?: string;
}

export default function ExportButton({ name, title, headers, rows, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | null>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const flash = () => {
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };

  const doCsv = () => {
    exportCsv(name, headers, rows);
    setOpen(false);
    flash();
  };

  const doPdf = async () => {
    setBusy('pdf');
    setFailed(false);
    try {
      await exportPdf(name, title, headers, rows);
      flash();
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={rows.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {done ? <Check size={13} className="text-green-600" /> : <Download size={13} />}
        {failed ? 'Ошибка' : done ? 'Готово' : 'Экспорт'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <button
            onClick={doCsv}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Sheet size={14} className="text-green-600 shrink-0" />
            <span>
              CSV для Excel
              <span className="block text-[10px] text-slate-400">{rows.length} строк</span>
            </span>
          </button>
          {(
            <button
              onClick={doPdf}
              disabled={busy === 'pdf'}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100 transition-colors disabled:opacity-60"
            >
              {busy === 'pdf' ? (
                <LoaderCircle size={14} className="text-red-500 shrink-0 animate-spin" />
              ) : (
                <FileText size={14} className="text-red-500 shrink-0" />
              )}
              <span>
                {busy === 'pdf' ? 'Формируем…' : 'PDF-отчёт'}
                <span className="block text-[10px] text-slate-400">A4, альбомная</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

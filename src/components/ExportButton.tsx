import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Sheet, LoaderCircle, Check, History } from 'lucide-react';
import { exportCsv, exportPdf, type CsvValue } from '../lib/export';
import { useI18n } from '../lib/i18n';
import { useSync } from '../lib/sync';
import type { Portal, ReportRecord } from '../lib/api';

interface Props {
  /** Base file name, without extension or timestamp. */
  name: string;
  title: string;
  headers: string[];
  rows: CsvValue[][];
  /** Portal whose credentials record the export in the audit history. */
  portal?: Portal;
  className?: string;
}

export default function ExportButton({ name, title, headers, rows, portal, className = '' }: Props) {
  const { t } = useI18n();
  const { actions } = useSync();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ReportRecord[]>([]);
  const [busy, setBusy] = useState<'pdf' | null>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !portal) return;
    actions
      .listReports(portal, name)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [open, portal, name, actions]);

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

  /** Best-effort audit trail; a failed record must not break the download. */
  const record = (format: 'csv' | 'pdf') => {
    if (!portal) return;
    actions.recordReport(portal, { name, title, format, rows: rows.length }).catch(() => {});
  };

  const doCsv = () => {
    exportCsv(name, headers, rows);
    record('csv');
    setOpen(false);
    flash();
  };

  const doPdf = async () => {
    setBusy('pdf');
    setFailed(false);
    try {
      await exportPdf(name, title, headers, rows);
      record('pdf');
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
        {failed ? t('export.error') : done ? t('export.done') : t('export.button')}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <button
            onClick={doCsv}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Sheet size={14} className="text-green-600 shrink-0" />
            <span>
              {t('export.csv')}
              <span className="block text-[10px] text-slate-400">{rows.length} {t('export.rows')}</span>
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
                {busy === 'pdf' ? t('export.building') : t('export.pdf')}
                <span className="block text-[10px] text-slate-400">{t('export.pdfHint')}</span>
              </span>
            </button>
          )}

          {history.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                <History size={10} />
                {t('export.history')}
              </p>
              <div className="space-y-1">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="font-mono uppercase text-slate-400 w-7 shrink-0">{h.format}</span>
                    <span className="truncate flex-1">{h.actor}</span>
                    <span className="shrink-0 text-slate-400">
                      {new Date(h.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Report exports.
 *
 * CSV is written with a BOM and semicolon separators so Excel on a Russian
 * locale opens it with Cyrillic intact and columns already split.
 *
 * PDF is drawn onto a canvas from the same rows the CSV uses, then embedded
 * as an image. Two reasons for that over the obvious alternatives:
 *   - jsPDF's built-in fonts are Latin-only, so Cyrillic text would be
 *     rendered as garbage;
 *   - html2canvas cannot parse the `oklch()` colours Tailwind v4 emits, so
 *     screenshotting the live table throws.
 * Drawing it ourselves sidesteps both and gives a cleaner report than a
 * screenshot would.
 */

export type CsvValue = string | number | null | undefined;

function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Excel treats a leading =, +, - or @ (also after a tab or line break) as a formula;
  // prefix text to neutralise it. Real numbers, such as a refund of -5000, stay numbers.
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const inApp = () => typeof window !== 'undefined' && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
type FileShare = Navigator & { canShare?: (data: ShareData) => boolean };

/**
 * A small sheet over the page for the store app: its web view cannot download a
 * file made on the page, so the file goes to the phone's share sheet (save to
 * Files, send to Telegram), from a tap of its own — the phone wants a fresh tap.
 */
function shareSheet(file: File | null) {
  document.getElementById('pg-file-sheet')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'pg-file-sheet';
  wrap.setAttribute('role', 'dialog');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;font-family:Inter,system-ui,sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'width:100%;max-width:480px;background:#fff;border-radius:22px 22px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box';
  const title = document.createElement('p');
  title.style.cssText = 'margin:0 0 6px;font-size:17px;font-weight:800;color:#111';
  title.textContent = file ? 'Файл готов' : 'Скачать файл здесь не получится';
  const note = document.createElement('p');
  note.style.cssText = 'margin:0 0 16px;font-size:14px;line-height:1.45;color:#64748b';
  note.textContent = file ? 'Сохраните его в «Файлы» или отправьте в мессенджер.' : 'Откройте app.voli.uz в браузере телефона или компьютера — там файл скачается.';
  const close = () => wrap.remove();
  const main = document.createElement('button');
  main.type = 'button';
  main.style.cssText = 'width:100%;height:50px;border:0;border-radius:16px;background:#C6F432;color:#111;font-size:16px;font-weight:700';
  main.textContent = file ? 'Сохранить или отправить' : 'Понятно';
  main.onclick = async () => {
    if (!file) return close();
    try {
      await (navigator as FileShare).share({ files: [file], title: file.name });
    } catch {
      /* closed by the user */
    }
    close();
  };
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.style.cssText = 'width:100%;height:44px;margin-top:6px;border:0;background:none;color:#64748b;font-size:14px;font-weight:600';
  cancel.textContent = 'Закрыть';
  cancel.onclick = close;
  wrap.onclick = e => { if (e.target === wrap) close(); };
  box.append(title, note, main, ...(file ? [cancel] : []));
  wrap.append(box);
  document.body.append(wrap);
}

/** In a browser: a download. In the store app: the phone's share sheet. */
async function deliver(blob: Blob, filename: string) {
  if (!inApp()) return triggerDownload(blob, filename);
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as FileShare;
  if (!nav.share || !nav.canShare?.({ files: [file] })) return shareSheet(null);
  try {
    await nav.share({ files: [file], title: filename });
  } catch (err) {
    // The tap that asked for the file is too long ago once it is drawn: ask for a fresh one.
    if ((err as Error).name !== 'AbortError') shareSheet(file);
  }
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

export function exportCsv(baseName: string, headers: string[], rows: CsvValue[][]): void {
  const lines = [headers.map(csvCell).join(';'), ...rows.map(r => r.map(csvCell).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  void deliver(blob, `${baseName}_${stamp()}.csv`);
}

const text = (v: CsvValue) => (v === null || v === undefined ? '' : String(v));

const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';
const ROW_H = 34;
const HEAD_H = 40;
const PAD = 14;
const TITLE_H = 74;
const MIN_TABLE_W = 1100;

/** Measures columns once so every page shares the same layout. */
function measureColumns(
  ctx: CanvasRenderingContext2D,
  headers: string[],
  rows: CsvValue[][],
  maxWidth: number,
): number[] {
  ctx.font = `600 14px ${FONT}`;
  const widths = headers.map(h => ctx.measureText(h).width);

  ctx.font = `14px ${FONT}`;
  // Sampling keeps this fast on long reports while still catching wide cells.
  const step = Math.max(1, Math.floor(rows.length / 200));
  for (let i = 0; i < rows.length; i += step) {
    rows[i].forEach((cell, c) => {
      const w = ctx.measureText(text(cell)).width;
      if (w > widths[c]) widths[c] = w;
    });
  }

  const withPadding = widths.map(w => w + PAD * 2);
  const total = withPadding.reduce((a, b) => a + b, 0);
  // A narrow table (a receipt: two columns) is widened, so the page does not blow it up
  // to a huge font with five rows a page; the last column takes the room.
  if (total < MIN_TABLE_W) withPadding[withPadding.length - 1] += MIN_TABLE_W - total;
  if (Math.max(total, MIN_TABLE_W) <= maxWidth) return withPadding;

  // Shrink proportionally; cells are ellipsised when they still don't fit.
  const scale = maxWidth / total;
  return withPadding.map(w => Math.max(60, w * scale));
}

function ellipsise(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

function renderPage(
  headers: string[],
  rows: CsvValue[][],
  widths: number[],
  title: string,
  page: number,
  pages: number,
): HTMLCanvasElement {
  const dpr = 2;
  const width = widths.reduce((a, b) => a + b, 0);
  const height = TITLE_H + HEAD_H + rows.length * ROW_H + 30;

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Title block
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 19px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Voli', PAD, 26);

  ctx.fillStyle = '#64748B';
  ctx.font = `13px ${FONT}`;
  ctx.fillText(
    `${title} · ${new Date().toLocaleString('ru-RU')} · стр. ${page + 1} из ${pages}`,
    PAD,
    50,
  );

  // Header row
  const headTop = TITLE_H;
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, headTop, width, HEAD_H);
  ctx.fillStyle = '#C6F432';
  ctx.font = `600 14px ${FONT}`;

  let x = 0;
  headers.forEach((h, c) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, headTop, widths[c], HEAD_H);
    ctx.clip();
    ctx.fillText(ellipsise(ctx, h, widths[c] - PAD * 2), x + PAD, headTop + HEAD_H / 2);
    ctx.restore();
    x += widths[c];
  });

  // Body
  rows.forEach((row, r) => {
    const y = headTop + HEAD_H + r * ROW_H;
    if (r % 2 === 1) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, y, width, ROW_H);
    }

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + ROW_H - 0.5);
    ctx.lineTo(width, y + ROW_H - 0.5);
    ctx.stroke();

    ctx.fillStyle = '#1E293B';
    ctx.font = `14px ${FONT}`;
    let cx = 0;
    row.forEach((cell, c) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, y, widths[c], ROW_H);
      ctx.clip();
      ctx.fillText(ellipsise(ctx, text(cell), widths[c] - PAD * 2), cx + PAD, y + ROW_H / 2);
      ctx.restore();
      cx += widths[c];
    });
  });

  return canvas;
}

export async function exportPdf(
  baseName: string,
  title: string,
  headers: string[],
  rows: CsvValue[][],
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  // Measure once against a throwaway context.
  const probe = document.createElement('canvas').getContext('2d')!;
  const widths = measureColumns(probe, headers, rows, 1700);

  // Choose rows-per-page so a full page keeps the A4 aspect ratio.
  const canvasWidth = widths.reduce((a, b) => a + b, 0);
  const targetHeight = (canvasWidth * usableHeight) / usableWidth;
  const rowsPerPage = Math.max(
    5,
    Math.floor((targetHeight - TITLE_H - HEAD_H - 30) / ROW_H),
  );

  const chunks: CsvValue[][][] = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    chunks.push(rows.slice(i, i + rowsPerPage));
  }
  if (chunks.length === 0) chunks.push([]);

  chunks.forEach((chunk, i) => {
    if (i > 0) pdf.addPage();
    const canvas = renderPage(headers, chunk, widths, title, i, chunks.length);
    const imgHeight = (canvas.height / canvas.width) * usableWidth;
    // JPEG so jsPDF embeds a DCT-compressed stream; PNG would go in as raw
    // RGB and blow a five-row report up to several megabytes.
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.92),
      'JPEG',
      margin,
      margin,
      usableWidth,
      Math.min(imgHeight, usableHeight),
    );
  });

  await deliver(pdf.output('blob'), `${baseName}_${stamp()}.pdf`);
}

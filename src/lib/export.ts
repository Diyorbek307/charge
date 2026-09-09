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
  // Excel treats a leading =, +, - or @ as a formula; prefix to neutralise it.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
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

function stamp() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

export function exportCsv(baseName: string, headers: string[], rows: CsvValue[][]): void {
  const lines = [headers.map(csvCell).join(';'), ...rows.map(r => r.map(csvCell).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${baseName}_${stamp()}.csv`);
}

const text = (v: CsvValue) => (v === null || v === undefined ? '' : String(v));

const FONT = '"DM Sans", "Segoe UI", system-ui, sans-serif';
const ROW_H = 34;
const HEAD_H = 40;
const PAD = 14;
const TITLE_H = 74;

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
  if (total <= maxWidth) return withPadding;

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
  ctx.fillText('ONE CHARGE UZ', PAD, 26);

  ctx.fillStyle = '#64748B';
  ctx.font = `13px ${FONT}`;
  ctx.fillText(
    `${title} · ${new Date().toLocaleString('ru-RU')} · стр. ${page + 1} из ${pages}`,
    PAD,
    50,
  );

  // Header row
  const headTop = TITLE_H;
  ctx.fillStyle = '#0EA5E9';
  ctx.fillRect(0, headTop, width, HEAD_H);
  ctx.fillStyle = '#ffffff';
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

  pdf.save(`${baseName}_${stamp()}.pdf`);
}

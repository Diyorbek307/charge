/**
 * QR stickers for a network's chargers, one per charge point, four to an A4
 * page. The code is a link: a phone's own camera opens Voli on that
 * station, and the in-app scanner reads the station and point from it.
 *
 * Drawn on a canvas and placed in the PDF as an image, like the other PDF
 * exports: jsPDF's built-in fonts have no Cyrillic.
 */
import { BRAND } from '../brand';

export interface StickerStation {
  id: string;
  name: string;
  address: string;
  city: string;
  operator: string;
  connectors: { id: string; type: string; power: number }[];
}

/** Where printed stickers lead: the public app, set at build time, else this site. */
export const PUBLIC_URL = ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || window.location.origin).replace(/\/$/, '');

/** The link a sticker carries. */
export const stickerLink = (stationId: string, pointId?: string, origin = PUBLIC_URL) =>
  `${origin}/?portal=driver&station=${encodeURIComponent(stationId)}${pointId ? `&point=${encodeURIComponent(pointId)}` : ''}`;

/** Station and point a scanned sticker link names, if it is one. */
export function readStickerLink(text: string): { station: string; point: string | null } | null {
  const station = text.match(/[?&]station=([\w-]+)/i)?.[1];
  if (!station) return null;
  return { station: station.toLowerCase(), point: text.match(/[?&]point=([\w-]+)/i)?.[1] ?? null };
}

// A6 portrait at ~300 dpi.
const W = 1240;
const H = 1748;
const YELLOW = '#FFC83D';
const INK = '#111111';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the line fits. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 800) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px Inter, Arial, sans-serif`;
    s -= 2;
  } while (ctx.measureText(text).width > maxWidth && s > 18);
  return text;
}

function bolt(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string) {
  const k = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * k, cy - 12 * k);
  ctx.scale(k, k);
  ctx.fillStyle = fill;
  ctx.fill(new Path2D('M13 2 3 14h9l-1 8 10-12h-9l1-8z'));
  ctx.restore();
}

async function drawSticker(st: StickerStation, index: number, origin: string): Promise<HTMLCanvasElement> {
  const QR = await import('qrcode');
  const point = st.connectors[index];
  const letter = String.fromCharCode(65 + index);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Paper and a thin cut line.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#D4D4D4';
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.setLineDash([]);

  // Black head with the wordmark.
  roundRect(ctx, 40, 40, W - 80, 230, 44);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.font = '900 112px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  const [w1, w2] = BRAND.wordmark;
  const x0 = 96;
  ctx.fillStyle = YELLOW;
  ctx.fillText(w1, x0, 132);
  ctx.fillStyle = '#fff';
  ctx.fillText(w2, x0 + ctx.measureText(w1).width, 132);
  ctx.font = '600 40px Inter, Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Зарядка по QR-коду', x0, 216);
  // The charge point letter, as on the station card in the app.
  ctx.beginPath();
  ctx.arc(W - 170, 155, 82, 0, Math.PI * 2);
  ctx.fillStyle = YELLOW;
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '900 104px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(letter, W - 170, 160);
  ctx.textAlign = 'left';

  // The code itself, on a yellow frame. High error correction leaves room for the bolt in the middle.
  const link = stickerLink(st.id, point?.id, origin);
  const qr = QR.create(link, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const frame = 820;
  const fx = (W - frame) / 2;
  const fy = 320;
  roundRect(ctx, fx, fy, frame, frame, 56);
  ctx.fillStyle = YELLOW;
  ctx.fill();
  const inner = frame - 80;
  roundRect(ctx, fx + 40, fy + 40, inner, inner, 28);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const quiet = 4;
  const cell = Math.floor((inner - 40) / (n + quiet * 2));
  const size = cell * n;
  const qx = Math.round(fx + 40 + (inner - size) / 2);
  const qy = Math.round(fy + 40 + (inner - size) / 2);
  ctx.fillStyle = INK;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, cell, cell);
  const badge = Math.round(size * 0.2);
  roundRect(ctx, qx + (size - badge) / 2, qy + (size - badge) / 2, badge, badge, badge * 0.22);
  ctx.fillStyle = YELLOW;
  ctx.fill();
  ctx.lineWidth = cell * 0.9;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  bolt(ctx, qx + size / 2, qy + size / 2, badge * 0.7, INK);

  // What it is and where.
  let y = fy + frame + 92;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, st.name, W - 160, 68), W / 2, y);
  y += 66;
  ctx.font = '500 38px Inter, Arial, sans-serif';
  ctx.fillStyle = '#525252';
  ctx.fillText(fitText(ctx, `${st.address}, ${st.city}`, W - 160, 38, 500), W / 2, y);
  y += 84;
  roundRect(ctx, 160, y - 46, W - 320, 92, 46);
  ctx.fillStyle = '#F5F5F5';
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '800 46px Inter, Arial, sans-serif';
  ctx.fillText(point ? `Точка ${letter} · ${point.type} · ${point.power} кВт` : 'Станция', W / 2, y + 2);

  // Three steps and the typed code for when the camera cannot read it.
  y += 110;
  ctx.fillStyle = '#3A3A3A';
  ctx.fillText(fitText(ctx, 'Наведите камеру телефона → подключите кабель → «Начать»', W - 140, 36, 600), W / 2, y);
  y += 72;
  ctx.fillStyle = '#737373';
  ctx.fillText(fitText(ctx, 'Не считывается? Введите код в приложении:', W - 140, 34, 500), W / 2, y);
  y += 64;
  ctx.font = '900 60px "JetBrains Mono", Consolas, monospace';
  ctx.fillStyle = INK;
  ctx.fillText(st.id.toUpperCase(), W / 2, y);

  // Whose charger it is and who answers.
  ctx.fillStyle = '#A3A3A3';
  ctx.fillText(fitText(ctx, `Сеть ${st.operator} · ${BRAND.emails.support}`, W - 140, 30, 500), W / 2, H - 60);
  ctx.textAlign = 'left';
  return canvas;
}

/** Saves a PDF with a sticker for every charge point of the given stations. */
export async function downloadStickers(stations: StickerStation[], fileName: string, origin = PUBLIC_URL) {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const slots = [[0, 0], [105, 0], [0, 148.5], [105, 148.5]] as const;
  let i = 0;
  for (const st of stations) {
    const points = st.connectors.length ? st.connectors.map((_, k) => k) : [0];
    for (const k of points) {
      if (i > 0 && i % 4 === 0) pdf.addPage();
      const [x, y] = slots[i % 4];
      const canvas = await drawSticker(st, k, origin);
      // Lossless and compressed: the QR stays crisp, the file stays small.
      pdf.addImage(canvas, 'PNG', x, y, 105, 148, `sticker-${i}`, 'FAST');
      i++;
    }
  }
  pdf.save(fileName);
}

/** One sticker as an image, for a preview. */
export async function stickerPreview(st: StickerStation, index = 0, origin = PUBLIC_URL) {
  return (await drawSticker(st, index, origin)).toDataURL('image/png');
}

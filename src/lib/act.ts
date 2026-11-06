import { CO, REQ } from '../landing/legal';

/** One month of a network's charges through Voli, as the settlement shows it. */
export interface ActInvoice {
  id: string;
  operator: string;
  month: string;
  sessions: number;
  energy: number;
  revenue: number;
  commissionRate: number;
  commission: number;
  payout: number;
  iban?: string;
}

export const W = 1240;
export const H = 1754;
export const M = 110;
export const INK = '#111111';
export const MUTED = '#5b5b66';
export const FONT = '"Inter", "Segoe UI", Arial, sans-serif';

export const sum = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} сум`;
export const monthName = (month: string) => new Date(`${month}-01T00:00:00+05:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Asia/Tashkent' });
export const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** Writes `text` wrapped to `width`, returns where the next line goes. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineH: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineH;
}

/**
 * The act of services for one month, drawn on an A4 page: Voli's fee for
 * bringing drivers and taking their payments at the network's stations, with
 * both parties, the figures and places to sign. Drawn on a canvas because
 * jsPDF's own fonts have no Cyrillic.
 */
function drawAct(inv: ActInvoice) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFC83D';
  ctx.fillRect(0, 0, W, 14);

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(`АКТ № ${inv.id}`, W / 2, 130);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`оказанных услуг за ${monthName(inv.month)} · от ${lastDay(inv.month)}`, W / 2, 172);
  ctx.textAlign = 'left';

  let y = 250;
  const party = (label: string, lines: string[]) => {
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(label, M, y);
    y += 34;
    ctx.font = `400 21px ${FONT}`;
    ctx.fillStyle = MUTED;
    for (const l of lines) y = wrap(ctx, l, M, y, W - M * 2, 30);
    y += 22;
  };
  party('Исполнитель', REQ);
  party('Заказчик', [inv.operator, ...(inv.iban ? [`Счёт для выплат: ${inv.iban}`] : [])]);

  ctx.font = `400 21px ${FONT}`;
  ctx.fillStyle = INK;
  y = wrap(ctx, `Исполнитель оказал Заказчику услуги по привлечению водителей электромобилей через приложение Voli и приёму их платежей за зарядку на станциях Заказчика за ${monthName(inv.month).replace(/\.$/, '')}. Вознаграждение Исполнителя — ${inv.commissionRate.toLocaleString('ru-RU')}% от оплаченных зарядок.`, M, y + 6, W - M * 2, 31) + 18;

  // The figures, as a table.
  const rows: [string, string][] = [
    ['Зарядок через Voli', inv.sessions.toLocaleString('ru-RU')],
    ['Отпущено энергии', `${inv.energy.toLocaleString('ru-RU')} кВт·ч`],
    ['Оплачено водителями', sum(inv.revenue)],
    [`Вознаграждение Исполнителя (${inv.commissionRate.toLocaleString('ru-RU')}%)`, sum(inv.commission)],
    ['К перечислению Заказчику', sum(inv.payout)],
  ];
  const rowH = 58;
  ctx.strokeStyle = '#d9d9d9';
  ctx.lineWidth = 2;
  rows.forEach(([k, v], i) => {
    const top = y + i * rowH;
    const last = i === rows.length - 1;
    if (last) {
      ctx.fillStyle = '#FFF4D2';
      ctx.fillRect(M, top, W - M * 2, rowH);
    }
    ctx.strokeRect(M, top, W - M * 2, rowH);
    ctx.fillStyle = INK;
    ctx.font = `${last || i === 3 ? 700 : 400} 22px ${FONT}`;
    ctx.fillText(k, M + 20, top + 37);
    ctx.textAlign = 'right';
    ctx.fillText(v, W - M - 20, top + 37);
    ctx.textAlign = 'left';
  });
  y += rows.length * rowH + 50;

  ctx.font = `400 21px ${FONT}`;
  ctx.fillStyle = MUTED;
  y = wrap(ctx, 'Услуги оказаны полностью и в срок. Стороны претензий друг к другу не имеют. Данные по каждой зарядке доступны обеим сторонам в кабинете сети Voli.', M, y, W - M * 2, 30) + 70;

  // Places to sign.
  const col = (W - M * 2 - 60) / 2;
  [['Исполнитель', CO], ['Заказчик', inv.operator]].forEach(([role, name], i) => {
    const x = M + i * (col + 60);
    ctx.fillStyle = INK;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(role, x, y);
    ctx.font = `400 20px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(name, x, y + 32);
    ctx.strokeStyle = '#9a9a9a';
    ctx.beginPath();
    ctx.moveTo(x, y + 120);
    ctx.lineTo(x + col, y + 120);
    ctx.stroke();
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText('подпись / печать', x, y + 146);
  });

  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = '#9a9a9a';
  ctx.fillText(`Сформировано в Voli · ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`, M, H - 60);
  return canvas;
}

/** Saves the act as a one-page PDF. */
export async function downloadAct(inv: ActInvoice) {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(drawAct(inv).toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  pdf.save(`act_${inv.id}.pdf`);
}

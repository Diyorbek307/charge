import { CO, REQ, VAT_RATE } from '../landing/legal';
import { W, H, M, INK, MUTED, FONT, sum, monthName, lastDay, wrap } from './act';

/** One month of a company's charges on its corporate account. */
export interface CompanyMonth {
  month: string;
  buyer: string;
  sessions: number;
  energy: number;
  /** What the charges cost, VAT included. */
  total: number;
}

/** The VAT inside a price that already includes it. */
export function vatOf(total: number, rate = VAT_RATE) {
  const vat = rate > 0 ? Math.round((total * rate) / (100 + rate)) : 0;
  return { net: total - vat, vat, rate };
}

/**
 * The month's invoice for a company, on an A4 page: seller and buyer, the
 * charging as one line with its kWh, the price without VAT, the VAT and the
 * total. In Uzbekistan the invoice that counts for tax is the electronic one
 * (ESF, through Didox or soliq.uz); this page is for checking it and for the
 * company's books, and says so.
 */
function drawInvoice(m: CompanyMonth) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFC83D';
  ctx.fillRect(0, 0, W, 14);

  const number = `SF-${m.month.replace('-', '')}`;
  const { net, vat, rate } = vatOf(m.total);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(`СЧЁТ-ФАКТУРА № ${number}`, W / 2, 130);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`за ${monthName(m.month)} · от ${lastDay(m.month)}`, W / 2, 172);
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
  party('Поставщик', REQ);
  party('Покупатель', [m.buyer, 'ИНН (STIR): ____________________']);

  // One line of goods: the charging of the company's cars.
  const cols = [
    { h: 'Наименование', w: 320, v: 'Услуга зарядки электромобилей сотрудников' },
    { h: 'Ед.', w: 80, v: 'кВт·ч' },
    { h: 'Кол-во', w: 110, v: m.energy.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) },
    { h: 'Без НДС', w: 175, v: sum(net) },
    { h: rate ? `НДС ${rate}%` : 'НДС', w: 150, v: rate ? sum(vat) : 'Без НДС' },
  ];
  const tableW = W - M * 2;
  const lastW = tableW - cols.reduce((n, c) => n + c.w, 0);
  const all = [...cols, { h: 'С НДС', w: lastW, v: sum(m.total) }];
  ctx.strokeStyle = '#d9d9d9';
  ctx.lineWidth = 2;
  let x = M;
  for (const c of all) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(x, y, c.w, 56);
    ctx.strokeRect(x, y, c.w, 56);
    ctx.strokeRect(x, y + 56, c.w, 96);
    ctx.fillStyle = INK;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(c.h, x + 12, y + 35);
    ctx.font = `400 19px ${FONT}`;
    wrap(ctx, c.v, x + 12, y + 92, c.w - 24, 26);
    x += c.w;
  }
  y += 56 + 96 + 40;

  const totals: [string, string][] = [
    ['Итого без НДС', sum(net)],
    [rate ? `НДС ${rate}%` : 'НДС', rate ? sum(vat) : 'Без НДС'],
    ['Всего к оплате', sum(m.total)],
  ];
  for (const [k, v] of totals) {
    const strong = k === 'Всего к оплате';
    ctx.font = `${strong ? 700 : 400} 23px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(k, W - M - 260, y);
    ctx.fillText(v, W - M, y);
    ctx.textAlign = 'left';
    y += 38;
  }
  y += 24;

  ctx.font = `400 20px ${FONT}`;
  ctx.fillStyle = MUTED;
  y = wrap(ctx, `${m.sessions.toLocaleString('ru-RU')} зарядок сотрудников за месяц, оплачены с корпоративного счёта. Каждая зарядка с датой, станцией и суммой — в кабинете компании, раздел «Расходы».`, M, y, W - M * 2, 29) + 10;
  y = wrap(ctx, 'Документ для сверки и бухгалтерии. Налоговая счёт-фактура — электронная (ЭСФ), выставляется через Didox / soliq.uz по этим же данным.', M, y, W - M * 2, 29) + 60;

  const col = (W - M * 2 - 60) / 2;
  [['Руководитель', CO], ['Главный бухгалтер', CO]].forEach(([role, name], i) => {
    const px = M + i * (col + 60);
    ctx.fillStyle = INK;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(role, px, y);
    ctx.font = `400 20px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(name, px, y + 32);
    ctx.strokeStyle = '#9a9a9a';
    ctx.beginPath();
    ctx.moveTo(px, y + 110);
    ctx.lineTo(px + col, y + 110);
    ctx.stroke();
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText('подпись / печать', px, y + 136);
  });

  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = '#9a9a9a';
  ctx.fillText(`Сформировано в Voli · ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`, M, H - 60);
  return canvas;
}

/** Saves the month's invoice as a one-page PDF. */
export async function downloadVatInvoice(m: CompanyMonth) {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(drawInvoice(m).toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  pdf.save(`invoice_${m.month}.pdf`);
}

/**
 * Letters to the team: a new application from the site, a driver writing to
 * support, an SOS. Sent over SMTP (Zoho, Gmail, any mail host) when SMTP_HOST,
 * SMTP_USER and SMTP_PASS are set; without them nothing is sent and the
 * admin panel still shows everything.
 *
 *   NOTIFY_EMAIL  where the letters go (default info@voli.uz)
 *   MAIL_FROM     the sender shown (default "Voli <SMTP_USER>")
 *   SMTP_PORT     465 (SSL, default) or 587 (STARTTLS)
 */
import { report } from './monitoring.js';

const HOST = process.env.SMTP_HOST || '';
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const PORT = Number(process.env.SMTP_PORT || 465);
export const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'info@voli.uz';
const FROM = process.env.MAIL_FROM || (USER ? `Voli <${USER}>` : '');
const SITE = (process.env.PUBLIC_URL || 'https://app.voli.uz').replace(/\/+$/, '');

export const mailConfigured = () => Boolean(HOST && USER && PASS);

let transport = null;
async function transporter() {
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({ host: HOST, port: PORT, secure: PORT === 465, auth: { user: USER, pass: PASS } });
  }
  return transport;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A plain letter: a heading, label–value rows and a button into the admin panel. */
function letter(title, rows, link) {
  const filled = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  const text = [title, '', ...filled.map(([k, v]) => `${k}: ${v}`), '', link ? `Открыть: ${SITE}${link}` : ''].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
<div style="background:#FFC83D;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;font-size:18px">Voli · ${esc(title)}</div>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-top:0">
${filled.map(([k, v]) => `<tr><td style="padding:10px 20px;color:#777;width:35%;vertical-align:top;border-top:1px solid #f2f2f2">${esc(k)}</td><td style="padding:10px 20px;border-top:1px solid #f2f2f2;white-space:pre-wrap">${esc(v)}</td></tr>`).join('\n')}
</table>
${link ? `<p style="text-align:center;margin:20px 0"><a href="${SITE}${link}" style="background:#111;color:#FFC83D;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Открыть в админ-панели</a></p>` : ''}
</div>`;
  return { text, html };
}

/** Sends to the team without holding up the request that caused it. */
export function notifyTeam(subject, rows, link) {
  if (!mailConfigured()) return;
  const { text, html } = letter(subject, rows, link);
  void transporter()
    .then(t => t.sendMail({ from: FROM, to: NOTIFY_TO, subject: `Voli · ${subject}`, text, html }))
    .catch(err => {
      console.warn('[mail]', err.message);
      report(err, 'mail');
    });
}

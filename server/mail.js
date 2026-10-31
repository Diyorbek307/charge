/**
 * Letters to the team: a new application from the site, a driver writing to
 * support, an SOS. Two ways to send, the first that is set up wins:
 *
 *   RESEND_API_KEY   over HTTPS through Resend (resend.com). Works on any
 *                    host, including Render's free plan, which blocks the
 *                    SMTP ports 25, 465 and 587. The domain voli.uz must be
 *                    verified in Resend (three DNS records).
 *   SMTP_HOST, SMTP_USER, SMTP_PASS
 *                    over SMTP (VK WorkSpace smtp.mail.ru, Gmail, any host).
 *                    SMTP_PORT 465 (SSL, default) or 587 (STARTTLS).
 *
 * Without either nothing is sent and the admin panel still shows everything.
 *
 *   NOTIFY_EMAIL  the general mailbox (default info@voli.uz)
 *   MAIL_FROM     the sender shown (default "Voli <SMTP_USER>", or
 *                 "Voli <info@voli.uz>" with Resend)
 *
 * Each letter goes to the mailbox of its kind: networks to partners@, fleets
 * to business@, waitlisted drivers to hello@, support and SOS to support@.
 * MAIL_TO_<BOX> (MAIL_TO_PARTNERS, …) points one of them elsewhere.
 *
 * The last attempt is kept in memory, so the admin's system page shows
 * whether letters leave and, if not, why in plain words.
 */
import { report } from './monitoring.js';

const HOST = process.env.SMTP_HOST || '';
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const PORT = Number(process.env.SMTP_PORT || 465);
const RESEND = process.env.RESEND_API_KEY || '';
export const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'info@voli.uz';
const BOX = { info: NOTIFY_TO, hello: 'hello@voli.uz', partners: 'partners@voli.uz', business: 'business@voli.uz', support: 'support@voli.uz' };
export const mailbox = box => process.env[`MAIL_TO_${box.toUpperCase()}`] || BOX[box] || NOTIFY_TO;
const FROM = process.env.MAIL_FROM || (USER ? `Voli <${USER}>` : 'Voli <info@voli.uz>');
const SITE = (process.env.PUBLIC_URL || 'https://app.voli.uz').replace(/\/+$/, '');

/** How letters leave: 'resend', 'smtp' or null. */
export const mailVia = () => (RESEND ? 'resend' : HOST && USER && PASS ? 'smtp' : null);
export const mailConfigured = () => mailVia() !== null;

let last = null;
/** The last attempt: when, to whom, and the error in plain words if it failed. */
export const mailStatus = () => ({ via: mailVia(), host: mailVia() === 'smtp' ? `${HOST}:${PORT}` : mailVia() === 'resend' ? 'api.resend.com' : null, last });

let transport = null;
async function transporter() {
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({
      host: HOST, port: PORT, secure: PORT === 465, auth: { user: USER, pass: PASS },
      // A blocked port hangs rather than refuses: give up in seconds, not minutes.
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    });
  }
  return transport;
}

async function viaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Resend ответил ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

/** What went wrong, for the admin: the cause and what to do about it. */
export function explain(err) {
  const msg = String(err?.message ?? err);
  const code = err?.code ?? '';
  if (mailVia() === 'resend') {
    if (err?.status === 401 || err?.status === 403) {
      return /domain/i.test(msg)
        ? `Домен отправителя не подтверждён в Resend: добавьте его DNS-записи и дождитесь статуса Verified (${msg})`
        : `Resend не принял ключ: проверьте RESEND_API_KEY (${msg})`;
    }
    if (err?.status === 422) return `Resend отклонил письмо: проверьте MAIL_FROM — адрес должен быть на подтверждённом домене (${msg})`;
    return `Resend: ${msg}`;
  }
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(code) || /timeout|timed out/i.test(msg)) {
    return `Нет соединения с ${HOST}:${PORT}. Почти всегда это бесплатный тариф Render: он блокирует почтовые порты. Перейдите на тариф Starter или подключите отправку через Resend (RESEND_API_KEY)`;
  }
  if (code === 'EAUTH' || /535|auth/i.test(msg)) {
    return 'Почтовый сервер не принял логин или пароль. Для VK WorkSpace нужен пароль для внешнего приложения (не пароль от ящика), а в настройках ящика должен быть разрешён доступ по SMTP';
  }
  if (code === 'EENVELOPE' || /550|553|sender/i.test(msg)) return `Сервер отказался отправлять от имени ${FROM}: адрес в MAIL_FROM должен совпадать с SMTP_USER или его псевдонимом (${msg})`;
  if (code === 'EDNS' || /ENOTFOUND/.test(msg)) return `Не найден сервер ${HOST} — проверьте SMTP_HOST`;
  return msg;
}

async function send(to, subject, text, html) {
  const via = mailVia();
  try {
    if (via === 'resend') await viaResend({ to, subject, text, html });
    else await (await transporter()).sendMail({ from: FROM, to, subject, text, html });
    last = { ok: true, to, subject, at: new Date().toISOString() };
  } catch (err) {
    last = { ok: false, to, subject, at: new Date().toISOString(), error: explain(err) };
    throw err;
  }
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

/** Sends to the team's mailbox `box` without holding up the request that caused it. */
export function notifyTeam(subject, rows, link, box = 'info') {
  if (!mailConfigured()) return;
  const { text, html } = letter(subject, rows, link);
  void send(mailbox(box), `Voli · ${subject}`, text, html).catch(err => {
    console.warn('[mail]', explain(err));
    report(err, 'mail');
  });
}

/** A sign-in code for a driver who chose email. Waits, so a failure can be told to them. */
export async function sendCodeLetter(to, code) {
  const text = `Ваш код для входа в Voli: ${code}\n\nКод действует 5 минут. Никому его не сообщайте — сотрудники Voli его не спрашивают.\n\nVoli’ga kirish kodi: ${code}. Hech kimga aytmang.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;text-align:center">
<div style="background:#111;color:#FFC83D;padding:18px;border-radius:14px 14px 0 0;font-weight:bold;font-size:20px">Voli</div>
<div style="background:#fff;border:1px solid #eee;border-top:0;padding:28px 20px;border-radius:0 0 14px 14px">
<p style="margin:0 0 14px;color:#555">Ваш код для входа</p>
<p style="margin:0;font-size:36px;font-weight:bold;letter-spacing:8px">${code}</p>
<p style="margin:18px 0 0;color:#888;font-size:13px">Код действует 5 минут. Никому его не сообщайте.<br>Kirish kodi — hech kimga aytmang.</p>
</div></div>`;
  await send(to, `Voli · код для входа ${code}`, text, html);
}

/** The admin's test letter: waits for the answer, so the page can say what happened. */
export async function sendTestLetter(to, actor) {
  if (!mailConfigured()) return { ok: false, error: 'Отправка не настроена: задайте RESEND_API_KEY или SMTP_HOST, SMTP_USER и SMTP_PASS в переменных окружения' };
  const { text, html } = letter('Тестовое письмо', [['Отправил', actor], ['Способ', mailVia() === 'resend' ? 'Resend (HTTPS)' : `SMTP ${HOST}:${PORT}`], ['Время', new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })]], '/?portal=admin&page=system_health');
  try {
    await send(to, 'Voli · Тестовое письмо', text, html);
    return { ok: true, to };
  } catch (err) {
    console.warn('[mail]', explain(err));
    return { ok: false, to, error: explain(err) };
  }
}

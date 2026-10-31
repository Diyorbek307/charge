/**
 * Letters to the team: the admin's test letter says plainly why a letter did
 * not leave (here: the mail server refuses the password), and the system
 * page keeps the last attempt. A tiny SMTP server on localhost plays the
 * mail host.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8100 + Math.floor(Math.random() * 300);
const SMTP = PORT + 400;
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;
let smtp;
let dataDir;
let acceptPassword = false;
const received = [];

/** Just enough SMTP: greet, offer AUTH, refuse or accept the password, take the letter. */
function fakeSmtp() {
  return net.createServer(sock => {
    let data = false;
    let body = '';
    sock.write('220 mock ESMTP\r\n');
    sock.on('data', chunk => {
      for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
        if (data) {
          if (line === '.') {
            data = false;
            received.push(body);
            sock.write('250 queued\r\n');
          } else body += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-mock\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (cmd === 'AUTH') sock.write(acceptPassword ? '235 ok\r\n' : '535 5.7.8 authentication failed\r\n');
        else if (cmd === 'MAIL' || cmd === 'RCPT') sock.write('250 ok\r\n');
        else if (cmd === 'DATA') {
          data = true;
          sock.write('354 go\r\n');
        } else if (cmd === 'QUIT') sock.end('221 bye\r\n');
        else sock.write('250 ok\r\n');
      }
    });
  });
}

before(async () => {
  smtp = fakeSmtp();
  await new Promise(r => smtp.listen(SMTP, '127.0.0.1', r));
  dataDir = mkdtempSync(join(tmpdir(), 'oc-mail-'));
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DEMO_SIMULATION: 'false', DATABASE_URL: '', RESEND_API_KEY: '',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP), SMTP_USER: 'info@voli.uz', SMTP_PASS: 'wrong', MAIL_FROM: 'Voli <info@voli.uz>',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/state`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  smtp?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold files briefly */
  }
});

test('the test letter explains a refused password, then goes through', async () => {
  const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'admin', login: 'admin@voli.uz', password: 'Admin2026' }) });
  const { token } = await login.json();
  const auth = { Authorization: `Bearer ${token}` };

  const failed = await (await fetch(`${BASE}/admin/mail/test`, { method: 'POST', headers: auth })).json();
  assert.equal(failed.ok, false);
  assert.match(failed.error, /пароль для внешнего приложения/);
  const health = await (await fetch(`${BASE}/admin/health`, { headers: auth })).json();
  assert.equal(health.mail.via, 'smtp');
  assert.equal(health.mail.last.ok, false, 'the system page keeps the failure');

  acceptPassword = true;
  const sent = await (await fetch(`${BASE}/admin/mail/test`, { method: 'POST', headers: auth })).json();
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(sent.to, 'info@voli.uz');
  assert.ok(received.some(b => b.includes('Voli')), 'the letter reached the mail server');
  assert.equal((await (await fetch(`${BASE}/admin/health`, { headers: auth })).json()).mail.last.ok, true);
});

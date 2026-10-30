import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { api, requireAuth } from './api.js';

/**
 * The navigator's voice: a neural speech service instead of the robotic
 * voice built into phones. Phrases repeat endlessly ("Через 300 метров
 * поверните направо"), so each one is synthesised once and kept on disk.
 *
 *   azure    Microsoft Azure Speech — neural Russian and Uzbek voices
 *            (ru-RU-SvetlanaNeural, uz-UZ-MadinaNeural). AZURE_SPEECH_KEY,
 *            AZURE_SPEECH_REGION.
 *   yandex   Yandex SpeechKit — the voices of Yandex's own apps, under its
 *            cloud contract. YANDEX_SPEECHKIT_KEY (a service-account API key),
 *            optional YANDEX_FOLDER_ID.
 *   mock     a fixed short clip, for tests.
 *
 * Without a key the app falls back to the phone's own voice.
 */

const LANGS = ['ru', 'uz', 'en'];
const MAX_TEXT = 300;

const AZURE_VOICES = { ru: 'ru-RU-SvetlanaNeural', uz: 'uz-UZ-MadinaNeural', en: 'en-US-JennyNeural' };
const YANDEX_VOICES = { ru: ['ru-RU', 'alena'], uz: ['uz-UZ', 'nigora'], en: ['en-US', 'john'] };

export function ttsProvider() {
  const forced = process.env.TTS_PROVIDER;
  if (forced === 'mock' || forced === 'none') return forced === 'mock' ? 'mock' : null;
  if ((forced === 'azure' || !forced) && process.env.AZURE_SPEECH_KEY) return 'azure';
  if ((forced === 'yandex' || !forced) && process.env.YANDEX_SPEECHKIT_KEY) return 'yandex';
  return null;
}

const voiceFor = (provider, lang) =>
  process.env[`TTS_VOICE_${lang.toUpperCase()}`] || (provider === 'azure' ? AZURE_VOICES[lang] : provider === 'yandex' ? YANDEX_VOICES[lang][1] : 'mock');

const xml = s => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

async function synthesize(provider, lang, text) {
  if (provider === 'mock') return Buffer.from(`ID3mock:${lang}:${text}`);
  if (provider === 'azure') {
    const region = process.env.AZURE_SPEECH_REGION || 'westeurope';
    const voice = voiceFor('azure', lang);
    const locale = voice.split('-').slice(0, 2).join('-');
    const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="+6%">${xml(text)}</prosody></voice></speak>`;
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Voli',
      },
      body: ssml,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Azure TTS ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const [locale] = YANDEX_VOICES[lang];
  const body = new URLSearchParams({ text, lang: locale, voice: voiceFor('yandex', lang), format: 'mp3', speed: '1.05' });
  if (process.env.YANDEX_FOLDER_ID) body.set('folderId', process.env.YANDEX_FOLDER_ID);
  const res = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${process.env.YANDEX_SPEECHKIT_KEY}` },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yandex SpeechKit ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Disk cache next to the database, and a small in-memory one in front of it.
const cacheDir = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), '.data'), 'tts');
const memory = new Map();
const MEMORY_MAX = 300;

function remember(key, buf) {
  memory.set(key, buf);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

// A paid service behind a public app: a driver gets a generous but finite number of new phrases.
const fresh = new Map();
function allowFresh(userId) {
  const now = Date.now();
  const list = (fresh.get(userId) ?? []).filter(t => now - t < 60_000);
  if (list.length >= 40) return false;
  list.push(now);
  fresh.set(userId, list);
  return true;
}

api.get('/tts/status', (_req, res) => {
  const provider = ttsProvider();
  res.json({ provider, voices: provider ? Object.fromEntries(LANGS.map(l => [l, voiceFor(provider, l)])) : null });
});

api.get('/tts', requireAuth('driver'), async (req, res) => {
  const provider = ttsProvider();
  if (!provider) return res.status(503).json({ error: 'Голосовой сервис не подключён' });
  const lang = String(req.query.lang ?? 'ru');
  const text = String(req.query.text ?? '').trim().replace(/\s+/g, ' ');
  if (!LANGS.includes(lang)) return res.status(400).json({ error: 'Язык — ru, uz или en' });
  if (!text || text.length > MAX_TEXT) return res.status(400).json({ error: `Текст — от 1 до ${MAX_TEXT} символов` });

  const key = crypto.createHash('sha256').update(`${provider}|${voiceFor(provider, lang)}|${lang}|${text}`).digest('hex');
  const file = path.join(cacheDir(), `${key}.mp3`);
  const send = (buf, hit) =>
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=604800', 'X-TTS-Cache': hit }).send(buf);

  const inMemory = memory.get(key);
  if (inMemory) return send(inMemory, 'hit');
  try {
    const buf = await fs.promises.readFile(file);
    remember(key, buf);
    return send(buf, 'hit');
  } catch {
    /* not on disk yet */
  }
  if (!allowFresh(req.account.id)) return res.status(429).json({ error: 'Слишком много новых фраз — подождите минуту' });
  try {
    const buf = await synthesize(provider, lang, text);
    remember(key, buf);
    fs.promises.mkdir(cacheDir(), { recursive: true }).then(() => fs.promises.writeFile(file, buf)).catch(() => {});
    send(buf, 'miss');
  } catch (e) {
    res.status(502).json({ error: `Голосовой сервис не ответил: ${e.message}` });
  }
});

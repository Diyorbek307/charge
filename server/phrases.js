import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Notifications in the driver's language. The server writes them in Russian,
 * like the rest of the app; they are translated with the same phrase
 * dictionary the screens use (src/lib/phrases/*.json, {0} placeholders).
 *
 * A message not in the dictionary as a whole is translated piece by piece
 * between " · ", and a piece still unknown stays Russian: better a Russian
 * word than no notification.
 */

const CYR = /[А-Яа-яЁё]/;
const LANGS = ['uz', 'en'];
const dicts = new Map();

function load(lang) {
  if (dicts.has(lang)) return dicts.get(lang);
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(fileURLToPath(new URL(`../src/lib/phrases/${lang}.json`, import.meta.url)), 'utf8'));
  } catch (err) {
    console.warn(`[phrases] ${lang}:`, err.message);
  }
  const exact = new Map();
  const patterns = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!value) continue;
    if (!/\{\d+\}/.test(key)) {
      exact.set(key, value);
      continue;
    }
    const parts = key.split(/\{(\d+)\}/);
    let source = '^';
    const slots = [];
    let literal = 0;
    let letters = false;
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        source += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        literal += part.trim().length;
        letters ||= /\p{L}/u.test(part);
      } else {
        source += '(.+?)';
        slots.push(Number(part));
      }
    });
    if (!letters) continue;
    patterns.push({ re: new RegExp(source + '$', 's'), slots, value, weight: literal });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  const dict = { exact, patterns };
  dicts.set(lang, dict);
  return dict;
}

function lookup(dict, core, depth = 0) {
  const hit = dict.exact.get(core);
  if (hit) return hit;
  if (depth >= 3) return null;
  for (const p of dict.patterns) {
    const m = p.re.exec(core);
    if (!m) continue;
    return p.value.replace(/\{(\d+)\}/g, (_, n) => {
      const idx = p.slots.indexOf(Number(n));
      const captured = idx >= 0 ? m[idx + 1] : '';
      return CYR.test(captured) ? (lookup(dict, captured.trim(), depth + 1) ?? captured) : captured;
    });
  }
  return null;
}

/** One piece, keeping a leading emoji or sign ("✅ ", "⚡ ") as it is. */
function piece(dict, text) {
  if (!CYR.test(text)) return text;
  const core = text.trim();
  const lead = core.match(/^[^\p{L}\d]+/u)?.[0] ?? '';
  const rest = core.slice(lead.length);
  // Exact phrases first: a loose pattern must not take a phrase the dictionary has as it is.
  const exact = dict.exact.get(core) ?? (lead && dict.exact.get(rest) ? lead + dict.exact.get(rest) : null);
  if (exact) return exact;
  const whole = lookup(dict, core);
  if (whole) return whole;
  const after = lead ? lookup(dict, rest) : null;
  return after ? lead + after : core;
}

/** Russian text in the driver's language ('ru', 'uz' or 'en'). */
export function translate(text, lang) {
  if (!text || !LANGS.includes(lang) || !CYR.test(text)) return text;
  const dict = load(lang);
  // A loose pattern over the whole text can leave Russian inside; then piece by piece.
  const whole = lookup(dict, text.trim());
  if (whole && !CYR.test(whole)) return whole;
  if (!text.includes(' · ')) return whole ?? piece(dict, text);
  return text.split(' · ').map(p => piece(dict, p)).join(' · ');
}

export const pushLang = value => (['ru', 'uz', 'en'].includes(value) ? value : null);

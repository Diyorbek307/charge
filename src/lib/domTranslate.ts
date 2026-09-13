import type { Lang } from './i18n';

/**
 * Page-wide phrase translation.
 *
 * Russian is the source language of the whole app, including text built from
 * module-level constants and messages that arrive from the server, which a
 * keyed t() call cannot reach. So translation happens on what is rendered:
 * text nodes and a few attributes are looked up in a phrase dictionary
 * (Russian → target), with {0}-style placeholders for the dynamic parts.
 *
 * Only nodeValue and attribute values are changed — never the node structure
 * React owns — and the Russian original is remembered per node, so switching
 * back restores it and a React update simply becomes the new source text.
 */

type Phrases = Record<string, string>;

const CYR = /[А-Яа-яЁё]/;
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP = 'script, style, code, pre, textarea, [contenteditable="true"], [data-no-translate]';

let lang: Lang = 'ru';
let exact = new Map<string, string>();
let patterns: { re: RegExp; slots: number[]; value: string; weight: number }[] = [];
let cache = new Map<string, string | null>();

// Per node: the Russian source, and what we last wrote, to tell our own
// writes apart from React's.
const textSource = new WeakMap<Text, string>();
const textWritten = new WeakMap<Text, string>();
const attrSource = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(dict: Phrases) {
  exact = new Map();
  patterns = [];
  cache = new Map();
  for (const [key, value] of Object.entries(dict)) {
    if (!value) continue;
    if (!/\{\d+\}/.test(key)) {
      exact.set(key, value);
      continue;
    }
    const parts = key.split(/\{(\d+)\}/);
    let source = '^';
    const slots: number[] = [];
    let literal = 0;
    let letters = false;
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        source += escapeRe(part);
        literal += part.trim().length;
        letters ||= /\p{L}/u.test(part);
      } else {
        source += '(.+?)';
        slots.push(Number(part));
      }
    });
    // A pattern with no words of its own ("{0} · {1}") would swallow unrelated text.
    if (!letters) continue;
    patterns.push({ re: new RegExp(source + '$', 's'), slots, value, weight: literal });
  }
  // Most specific first.
  patterns.sort((a, b) => b.weight - a.weight);
}

const MONTHS: Record<string, [string, string]> = {
  янв: ['yan', 'Jan'], фев: ['fev', 'Feb'], мар: ['mar', 'Mar'], апр: ['apr', 'Apr'], мая: ['may', 'May'], май: ['may', 'May'],
  июн: ['iyun', 'Jun'], июл: ['iyul', 'Jul'], авг: ['avg', 'Aug'], сен: ['sen', 'Sep'], сент: ['sen', 'Sep'], окт: ['okt', 'Oct'],
  ноя: ['noy', 'Nov'], нояб: ['noy', 'Nov'], дек: ['dek', 'Dec'],
  января: ['yanvar', 'January'], февраля: ['fevral', 'February'], марта: ['mart', 'March'], апреля: ['aprel', 'April'],
  июня: ['iyun', 'June'], июля: ['iyul', 'July'], августа: ['avgust', 'August'], сентября: ['sentyabr', 'September'],
  октября: ['oktyabr', 'October'], ноября: ['noyabr', 'November'], декабря: ['dekabr', 'December'],
};

/** Dates formatted with the ru-RU locale ("07 сент., 14:20") carry Russian month names. */
function translateDates(text: string): string | null {
  let changed = false;
  const out = text.replace(/(\d{1,2})\s+([а-я]{3,8})\.?(?=[\s,]|$)/g, (m, day, word) => {
    const hit = MONTHS[word];
    if (!hit) return m;
    changed = true;
    return `${day} ${lang === 'uz' ? hit[0] : hit[1]}`;
  });
  return changed ? out : null;
}

function lookup(core: string, depth = 0): string | null {
  if (cache.has(core)) return cache.get(core)!;
  let out = exact.get(core) ?? null;
  if (out === null && depth < 3) {
    for (const p of patterns) {
      const m = p.re.exec(core);
      if (!m) continue;
      out = p.value.replace(/\{(\d+)\}/g, (_, n) => {
        const idx = p.slots.indexOf(Number(n));
        const captured = idx >= 0 ? m[idx + 1] : '';
        return CYR.test(captured) ? (lookup(captured.trim(), depth + 1) ?? captured) : captured;
      });
      break;
    }
  }
  if (out === null) out = translateDates(core);
  cache.set(core, out);
  return out;
}

/** Translates one string, keeping its surrounding whitespace; null when unknown. */
export function translatePhrase(raw: string): string | null {
  if (lang === 'ru' || !CYR.test(raw)) return null;
  const core = raw.replace(/\s+/g, ' ').trim();
  const hit = lookup(core);
  if (hit === null) return null;
  const lead = raw.match(/^\s*/)![0];
  const trail = raw.match(/\s*$/)![0];
  return lead + hit + trail;
}

function skipped(el: Element | null) {
  return !!el?.closest(SKIP);
}

function applyText(node: Text) {
  if (skipped(node.parentElement)) return;
  const current = node.nodeValue ?? '';
  const ours = textWritten.get(node) === current;
  const source = ours ? textSource.get(node)! : current;
  if (!ours) textSource.set(node, source);

  const next = lang === 'ru' ? source : (translatePhrase(source) ?? source);
  if (next !== current) {
    textWritten.set(node, next);
    node.nodeValue = next;
  } else if (!ours) {
    textWritten.delete(node);
  }
}

function applyAttr(el: Element, name: string) {
  const current = el.getAttribute(name);
  if (current === null) return;
  const written = attrWritten.get(el) ?? new Map<string, string>();
  const sources = attrSource.get(el) ?? new Map<string, string>();
  const ours = written.get(name) === current;
  const source = ours ? sources.get(name)! : current;
  sources.set(name, source);
  attrSource.set(el, sources);

  const next = lang === 'ru' ? source : (translatePhrase(source) ?? source);
  if (next !== current) {
    written.set(name, next);
    attrWritten.set(el, written);
    el.setAttribute(name, next);
  }
}

function applyTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return applyText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  const el = root as Element;
  if (root.nodeType === Node.ELEMENT_NODE && skipped(el)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    // Restoring Russian must reach nodes we changed even if they no longer contain Cyrillic.
    if (CYR.test(text.nodeValue ?? '') || textWritten.has(text)) applyText(text);
  }
  const selector = ATTRS.map(a => `[${a}]`).join(',');
  const elements = root.nodeType === Node.ELEMENT_NODE && el.matches(selector) ? [el] : [];
  (root as ParentNode).querySelectorAll?.(selector).forEach(e => elements.push(e));
  for (const e of elements) for (const a of ATTRS) if (e.hasAttribute(a)) applyAttr(e, a);
}

let observer: MutationObserver | null = null;

function observe() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(records => {
    if (lang === 'ru') return;
    for (const r of records) {
      if (r.type === 'characterData') applyText(r.target as Text);
      else if (r.type === 'attributes' && r.attributeName) applyAttr(r.target as Element, r.attributeName);
      else r.addedNodes.forEach(applyTree);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}

const loaders: Record<Exclude<Lang, 'ru'>, () => Promise<{ default: Phrases }>> = {
  uz: () => import('./phrases/uz.json'),
  en: () => import('./phrases/en.json'),
};

let generation = 0;

/** Switches the rendered page to a language; loads its phrase table on first use. */
export async function setPageLanguage(next: Lang) {
  const mine = ++generation;
  if (next !== 'ru') {
    const { default: dict } = await loaders[next]();
    if (mine !== generation) return;
    compile(dict);
  }
  lang = next;
  observe();
  applyTree(document.body);
}

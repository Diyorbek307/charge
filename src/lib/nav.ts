/**
 * Turn-by-turn navigation inside the app: the route from a routing service
 * (OSRM by default; VITE_ROUTER_URL points at our own server in production),
 * where the car is on it, what to do next, and the cameras ahead.
 */

import { useEffect, useState } from 'react';

export type LatLng = { lat: number; lng: number };
export type Lang = 'ru' | 'uz' | 'en';

export interface Step {
  type: string;
  modifier?: string;
  exit?: number;
  name: string;
  /** Where the manoeuvre happens. */
  at: LatLng;
  /** Distance along the route to the manoeuvre, metres. */
  along: number;
}
export interface Route {
  line: LatLng[];
  /** Cumulative metres along `line`. */
  cum: number[];
  length: number;
  duration: number;
  steps: Step[];
}
export interface Camera { id: string; lat: number; lng: number; maxspeed: number | null; kind: 'speed' | 'redlight' | 'average'; source: 'osm' | 'drivers'; confirmed?: number }

const ROUTER = (import.meta.env.VITE_ROUTER_URL as string | undefined) ?? 'https://router.project-osrm.org';
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points. */
export function dist(a: LatLng, b: LatLng) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest point of the route to `p`: distance off the route, and how far along it that point is. */
export function project(route: Route, p: LatLng): { off: number; along: number; point: LatLng; seg: number } {
  let best = { off: Infinity, along: 0, point: route.line[0], seg: 0 };
  const kx = Math.cos(rad(p.lat)) * 111320;
  const ky = 110540;
  for (let i = 0; i < route.line.length - 1; i++) {
    const a = route.line[i];
    const b = route.line[i + 1];
    const ax = (a.lng - p.lng) * kx;
    const ay = (a.lat - p.lat) * ky;
    const bx = (b.lng - p.lng) * kx;
    const by = (b.lat - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx;
    const y = ay + t * dy;
    const off = Math.hypot(x, y);
    if (off < best.off) {
      best = { off, along: route.cum[i] + t * (route.cum[i + 1] - route.cum[i]), point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }, seg: i };
    }
  }
  return best;
}

/** The point `along` metres from the start of the route. */
export function pointAt(route: Route, along: number): LatLng {
  const i = Math.max(0, route.cum.findIndex(c => c >= along) - 1);
  const a = route.line[i];
  const b = route.line[Math.min(i + 1, route.line.length - 1)];
  const span = route.cum[i + 1] - route.cum[i] || 1;
  const t = Math.max(0, Math.min(1, (along - route.cum[i]) / span));
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
}

/** Compass bearing from a to b, degrees. */
export function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface OsrmStep { maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] }; name: string; distance: number }

export async function fetchRoute(from: LatLng, to: LatLng): Promise<Route> {
  const url = `${ROUTER}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error('Сервис маршрутов не ответил');
  const json = (await res.json()) as { code: string; routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: OsrmStep[] }[] }[] };
  if (json.code !== 'Ok' || !json.routes.length) throw new Error('Маршрут не найден');
  const r = json.routes[0];
  const line = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
  const route: Route = { line, cum, length: cum[cum.length - 1], duration: r.duration, steps: [] };
  route.steps = r.legs[0].steps.map(s => {
    const at = { lat: s.maneuver.location[1], lng: s.maneuver.location[0] };
    return { type: s.maneuver.type, modifier: s.maneuver.modifier, exit: s.maneuver.exit, name: s.name, at, along: project(route, at).along };
  });
  return route;
}

export async function fetchCameras(route: Route): Promise<Camera[]> {
  const lats = route.line.map(p => p.lat);
  const lngs = route.line.map(p => p.lng);
  const box = [Math.min(...lats) - 0.01, Math.min(...lngs) - 0.01, Math.max(...lats) + 0.01, Math.max(...lngs) + 0.01].map(v => v.toFixed(4)).join(',');
  const res = await fetch(`/api/cameras?bbox=${box}`);
  if (!res.ok) return [];
  const { cameras } = (await res.json()) as { cameras: Camera[] };
  // Only those on the route itself: within 35 m of the line.
  return cameras.filter(c => project(route, c).off < 35);
}

// ---------------------------------------------------------------------------
// Words: what to do next, on screen and spoken
// ---------------------------------------------------------------------------

const WORDS: Record<Lang, Record<string, string>> = {
  ru: {
    right: 'Поверните направо', left: 'Поверните налево', 'slight right': 'Держитесь правее', 'slight left': 'Держитесь левее',
    'sharp right': 'Резко направо', 'sharp left': 'Резко налево', uturn: 'Развернитесь', straight: 'Прямо',
    roundabout: 'На круговом движении — съезд {n}', arrive: 'Вы приехали', depart: 'Поехали', in: 'Через {d}', onto: 'на {name}',
    camera: 'Камера через {d}', limit: 'ограничение {v}', over: 'Снизьте скорость', reroute: 'Перестраиваем маршрут', m: 'м', km: 'км',
    now: 'Сейчас', then: 'затем', camAhead: 'Впереди камера', limitSay: 'Ограничение скорости {v}', overSay: 'Вы превышаете скорость. Ограничение {v}',
    arriveSay: 'Вы приехали. Зарядная станция {name}', departSay: 'Маршрут построен. Ехать {d}, примерно {t}',
  },
  uz: {
    right: 'O‘ngga buriling', left: 'Chapga buriling', 'slight right': 'O‘ngroqdan yuring', 'slight left': 'Chaproqdan yuring',
    'sharp right': 'Keskin o‘ngga', 'sharp left': 'Keskin chapga', uturn: 'Orqaga buriling', straight: 'To‘g‘riga',
    roundabout: 'Aylanma yo‘lda — {n}-chiqish', arrive: 'Yetib keldingiz', depart: 'Yo‘lga chiqdik', in: '{d} dan keyin', onto: '{name} ga',
    camera: '{d} dan keyin kamera', limit: 'cheklov {v}', over: 'Tezlikni pasaytiring', reroute: 'Yo‘nalish qayta tuzilmoqda', m: 'm', km: 'km',
    now: 'Hozir', then: 'keyin', camAhead: 'Oldinda kamera', limitSay: 'Tezlik cheklovi {v}', overSay: 'Tezlikni oshiryapsiz. Cheklov {v}',
    arriveSay: 'Yetib keldingiz. Quvvatlash stansiyasi {name}', departSay: 'Yo‘nalish tayyor. {d}, taxminan {t}',
  },
  en: {
    right: 'Turn right', left: 'Turn left', 'slight right': 'Keep right', 'slight left': 'Keep left',
    'sharp right': 'Sharp right', 'sharp left': 'Sharp left', uturn: 'Make a U-turn', straight: 'Go straight',
    roundabout: 'At the roundabout take exit {n}', arrive: 'You have arrived', depart: 'Let’s go', in: 'In {d}', onto: 'onto {name}',
    camera: 'Camera in {d}', limit: 'limit {v}', over: 'Slow down', reroute: 'Rerouting', m: 'm', km: 'km',
    now: 'Now', then: 'then', camAhead: 'Speed camera ahead', limitSay: 'Speed limit {v}', overSay: 'You are speeding. Limit {v}',
    arriveSay: 'You have arrived at {name}', departSay: 'Route ready. {d}, about {t}',
  },
};
export const word = (lang: Lang, k: string, vars: Record<string, string | number> = {}) =>
  (WORDS[lang][k] ?? WORDS.ru[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ''));

export function fmtDist(lang: Lang, m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace('.', lang === 'en' ? '.' : ',')} ${word(lang, 'km')}`;
  return `${Math.max(10, Math.round(m / 10) * 10)} ${word(lang, 'm')}`;
}

const ruPlural = (n: number, forms: [string, string, string]) => {
  const t = Math.abs(n) % 100;
  const o = t % 10;
  return forms[t > 10 && t < 20 ? 2 : o === 1 ? 0 : o >= 2 && o <= 4 ? 1 : 2];
};

/**
 * A distance as a navigator says it aloud: rounded the way people round
 * ("через 300 метров", "через полтора километра"), units in full words so the
 * voice does not read "м" as a letter.
 */
export function spokenDist(lang: Lang, m: number) {
  if (m >= 950) {
    const km = m >= 10_000 ? Math.round(m / 1000) : Math.round(m / 500) / 2;
    if (lang === 'ru') {
      if (km === 1.5) return 'полтора километра';
      if (!Number.isInteger(km)) return `${String(km).replace('.', ',')} километра`;
      return `${km} ${ruPlural(km, ['километр', 'километра', 'километров'])}`;
    }
    if (lang === 'uz') return `${String(km).replace('.', ',')} kilometr`;
    return `${km} ${km === 1 ? 'kilometer' : 'kilometers'}`;
  }
  const step = m >= 300 ? 100 : 50;
  const r = Math.max(50, Math.round(m / step) * step);
  if (lang === 'ru') return `${r} ${ruPlural(r, ['метр', 'метра', 'метров'])}`;
  if (lang === 'uz') return `${r} metr`;
  return `${r} meters`;
}

/** Drive time aloud: "12 минут", "1 час 5 минут". */
export function spokenTime(lang: Lang, min: number) {
  const h = Math.floor(min / 60);
  const mm = Math.max(1, Math.round(min % 60));
  if (lang === 'ru') return `${h ? `${h} ${ruPlural(h, ['час', 'часа', 'часов'])} ` : ''}${mm} ${ruPlural(mm, ['минута', 'минуты', 'минут'])}`;
  if (lang === 'uz') return `${h ? `${h} soat ` : ''}${mm} daqiqa`;
  return `${h ? `${h} h ` : ''}${mm} min`;
}

/** The manoeuvre as words, without the distance: "Поверните направо на ул. Навои". */
export function action(lang: Lang, s: Step) {
  let base: string;
  if (s.type === 'arrive') base = word(lang, 'arrive');
  else if (s.type === 'depart') base = word(lang, 'depart');
  else if (s.type === 'roundabout' || s.type === 'rotary') base = word(lang, 'roundabout', { n: s.exit ?? 1 });
  else base = word(lang, s.modifier ?? 'straight');
  return { base, street: s.name && s.type !== 'arrive' ? s.name : '' };
}

/** The language the device can speak: Uzbek voices are rare, Russian is understood by most drivers here. */
export function voiceLang(lang: Lang): Lang {
  try {
    if (lang === 'uz' && !speechSynthesis.getVoices().some(v => v.lang.toLowerCase().startsWith('uz'))) return 'ru';
  } catch {
    /* no voices */
  }
  return lang;
}

/**
 * The most natural voice the device has for the language: the neural ones
 * ("Natural", "Online", Google's) sound like a person, the old ones like a robot.
 */
function bestVoice(code: string) {
  const all = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(code));
  const score = (v: SpeechSynthesisVoice) => (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return all.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function deviceSay(lang: Lang, text: string, urgent: boolean) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'uz' ? 'uz-UZ' : lang === 'en' ? 'en-US' : 'ru-RU';
    const v = bestVoice(lang);
    if (v) u.voice = v;
    u.rate = 1.05;
    if (urgent) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* no voice */
  }
}

// ---------------------------------------------------------------------------
// Neural voice from our server (Azure or Yandex SpeechKit), when connected
// ---------------------------------------------------------------------------

let neural: Promise<boolean> | null = null;
const neuralReady = () =>
  (neural ??= fetch('/api/tts/status')
    .then(r => (r.ok ? r.json() : null))
    .then(d => !!d?.provider)
    .catch(() => false));

const clips = new Map<string, Promise<string | null>>();
const clipKey = (lang: Lang, text: string) => `${lang}|${text}`;

/** Fetches (once) the spoken clip for a phrase; null when the service cannot. */
function clip(lang: Lang, text: string) {
  const key = clipKey(lang, text);
  let p = clips.get(key);
  if (!p) {
    let token: string | null = null;
    try {
      token = localStorage.getItem('oc-token-driver');
    } catch {
      /* private mode */
    }
    p = fetch(`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    clips.set(key, p);
    // A failed fetch may succeed later (back online).
    void p.then(url => { if (!url) clips.delete(key); });
  }
  return p;
}

/** Warms the cache for phrases about to be said, so the voice is never late. */
export function prefetchSpeech(lang: Lang, texts: string[]) {
  void neuralReady().then(ok => {
    if (ok) for (const t of texts) void clip(lang, t);
  });
}

/** A short two-note chime before a camera warning, as in big navigators. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    /* no audio */
  }
}

type Line = { lang: Lang; text: string; chime: boolean };
const queue: Line[] = [];
let playing: HTMLAudioElement | null = null;
let busy = false;

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const line = queue.shift()!;
    if (line.chime) {
      chime();
      await new Promise(r => setTimeout(r, 520));
    }
    const url = (await neuralReady()) ? await clip(line.lang, line.text) : null;
    if (!url) {
      deviceSay(line.lang, line.text, false);
      continue;
    }
    await new Promise<void>(done => {
      const a = new Audio(url);
      playing = a;
      a.onended = a.onerror = () => done();
      a.play().catch(() => {
        // Autoplay refused: the phone's voice still gets the message across.
        deviceSay(line.lang, line.text, false);
        done();
      });
    });
    playing = null;
  }
  busy = false;
}

/**
 * Speaks text already written in the given language: our neural voice when
 * the server has one, otherwise the phone's own. Phrases queue up so nothing
 * is lost; an urgent one (the turn right now, speeding) cuts in first.
 */
export function say(lang: Lang, text: string, urgent = false, opts: { chime?: boolean } = {}) {
  if (urgent) {
    queue.length = 0;
    playing?.pause();
    try {
      speechSynthesis.cancel();
    } catch {
      /* no voice */
    }
  }
  queue.push({ lang, text, chime: !!opts.chime });
  void drain();
}

/**
 * The real way to a station: kilometres and minutes by road, not as the crow
 * flies. Asked once per station and ~100 m of the driver's position; null
 * until it is known or when the road service cannot be reached.
 */
/**
 * The routing service times empty roads. In town the traffic adds to that,
 * most at the morning and evening peaks (Tashkent time); out on the highway
 * hardly at all.
 */
export function trafficFactor(km: number, at = Date.now()) {
  const h = new Date(at + 5 * 3600_000).getUTCHours() + new Date(at).getUTCMinutes() / 60;
  const peak = (h >= 7.5 && h < 10) || (h >= 17 && h < 20);
  const town = peak ? 1.45 : h >= 10 && h < 17 ? 1.2 : h >= 20 && h < 23 ? 1.1 : 1;
  // Long trips are mostly highway: the town share fades out over 60 km.
  const share = Math.max(0, Math.min(1, (60 - km) / 60));
  return 1 + (town - 1) * Math.max(share, 0.08);
}

const roadCache = new Map<string, { km: number; min: number } | null>();
export function useRoadDistance(from: LatLng | null, to: LatLng | null) {
  const key = from && to ? `${from.lat.toFixed(3)},${from.lng.toFixed(3)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}` : null;
  const [road, setRoad] = useState(() => (key ? roadCache.get(key) ?? null : null));
  useEffect(() => {
    if (!key || !from || !to) return setRoad(null);
    if (roadCache.has(key)) return setRoad(roadCache.get(key) ?? null);
    setRoad(null);
    let alive = true;
    const url = `${ROUTER}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    void fetch(url, { signal: AbortSignal.timeout(8000) })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { code?: string; routes?: { distance: number; duration: number }[] } | null) => {
        const r = j?.code === 'Ok' ? j.routes?.[0] : undefined;
        const v = r ? { km: r.distance / 1000, min: Math.max(1, Math.round((r.duration / 60) * trafficFactor(r.distance / 1000))) } : null;
        roadCache.set(key, v);
        if (alive) setRoad(v);
      })
      .catch(() => alive && setRoad(null));
    return () => {
      alive = false;
    };
    // The key holds both ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return road;
}

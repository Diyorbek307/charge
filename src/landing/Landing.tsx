import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowRight, ArrowUpRight, BellRing, CalendarClock, Check, Clock, CircleDollarSign, Gift, Handshake, HeartPulse,
  Layers, Map as MapIcon, Menu, Minus, Moon, Navigation, QrCode, ScanLine, ScrollText, Send, Siren, Sparkles,
  Car, Apple, Play, WifiOff, X, Zap, MapPin, Users, BadgePercent, Coffee, Megaphone, ChartColumn, Wallet, CreditCard, Lock,
  ScanFace, KeyRound, LifeBuoy, Mail,
} from 'lucide-react';
import { useI18n, LANGS, type Lang } from '../lib/i18n';
import { useSync } from '../lib/sync';
import { apiClient, type Station, type TariffForecast, type TariffHour } from '../lib/api';
import { BRAND } from '../brand';
import { COPY, CARS, type LandingCopy } from './content';
import { Logo, LogoMark } from './Logo';
import Join from './Join';
import LegalPage, { LEGAL_IDS, legalHref } from './LegalPage';
import type { LegalDocId } from './legal';
import { track } from './analytics';
import { HUB_CITIES } from './heroScene';
import { APP_URL } from '../lib/site';
import './landing.css';
import './landing-pro.css';
import LoadIntro, { loadIntroDue } from './LoadIntro';

const fmt = (n: number, lang: Lang) =>
  Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU').replace(/,/g, lang === 'en' ? ',' : ' ');

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

// ───────────────────────── Pages and routing ─────────────────────────

/**
 * The landing is a handful of pages on real paths (/drivers, /networks…) —
 * the server answers every path with index.html, so each one works as a
 * direct link. Moving between them swaps the page in place, animated with
 * the View Transitions API where the browser has it.
 */
export type Page = 'home' | 'drivers' | 'networks' | 'prices' | 'guide' | 'faq' | 'about' | 'join' | CityId;
type CityId = 'tashkent' | 'samarkand' | 'bukhara';
const CITY_IDS: CityId[] = ['tashkent', 'samarkand', 'bukhara'];
const isCity = (p: Page): p is CityId => (CITY_IDS as string[]).includes(p);
const PATHS: Record<Page, string> = { home: '/', drivers: '/drivers', networks: '/networks', prices: '/prices', guide: '/guide', faq: '/faq', about: '/about', join: '/join', tashkent: '/tashkent', samarkand: '/samarkand', bukhara: '/bukhara' };
const PAGES = Object.keys(PATHS) as Page[];

function pageFromUrl(): Page {
  try {
    const q = new URLSearchParams(window.location.search).get('page') as Page | null;
    if (q && PAGES.includes(q)) return q;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return PAGES.find(p => PATHS[p] === path) ?? 'home';
  } catch {
    return 'home';
  }
}

/** ?doc=offer|privacy|terms|consent shows a legal document inside the landing shell. */
function docFromUrl(): LegalDocId | null {
  try {
    const d = new URLSearchParams(window.location.search).get('doc');
    return LEGAL_IDS.includes(d as LegalDocId) ? (d as LegalDocId) : null;
  } catch {
    return null;
  }
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => unknown };
const canTransition = () =>
  typeof document !== 'undefined' && !!(document as ViewTransitionDoc).startViewTransition
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const GoCtx = createContext<(p: Page) => void>(() => {});

/** An ordinary link to a page — modified clicks still open a new tab. */
function PageLink({ to, className, children, onClick, style }: { to: Page; className?: string; children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  const go = useContext(GoCtx);
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onClick?.();
    go(to);
  };
  return <a href={PATHS[to]} className={className} style={style} onClick={click}>{children}</a>;
}

/** Adds `.in` to every `.rv` element as it scrolls into view. */
function useReveal(root: HTMLElement | null, key: unknown) {
  useEffect(() => {
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('.rv:not(.in)');
    if (!('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
      // The huge top margin also reveals anything scrolled past too quickly to catch.
      { root, rootMargin: '100000px 0px -6% 0px', threshold: 0.06 },
    );
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [root, key]);
}

function Count({ value, decimals = 0, lang }: { value: number; decimals?: number; lang: Lang }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min((t - start) / 1200, 1);
      const v = a + (value - a) * (1 - Math.pow(1 - p, 4));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{decimals ? shown.toFixed(decimals) : fmt(shown, lang)}</>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="lp-kicker"><span />{children}</p>;
}

function SectionHead({ kicker, title, sub, center }: { kicker: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={`lp-head ${center ? 'is-center' : ''}`}>
      <div className="rv"><Kicker>{kicker}</Kicker></div>
      <h2 className="lp-h2 rv" style={delay(60)}>{title}</h2>
      {sub && <p className="lp-sub rv" style={delay(120)}>{sub}</p>}
    </div>
  );
}

/** The opening of an inner page: a big title in place of the home page's hero. */
function PageHead({ kicker, title, sub, children }: { kicker: string; title: string; sub: string; children?: ReactNode }) {
  return (
    <header className="lp-phead">
      <div className="lp-hero-bg" aria-hidden="true"><span className="lp-blob lp-blob-a" /></div>
      <div className="lp-wrap">
        <div className="rv"><Kicker>{kicker}</Kicker></div>
        <h1 className="lp-ptitle rv" style={delay(80)}>{title}</h1>
        <p className="lp-psub rv" style={delay(160)}>{sub}</p>
        {children}
      </div>
    </header>
  );
}

// ───────────────────────── Nav ─────────────────────────

function LangPills() {
  const { lang, setLang } = useI18n();
  return (
    <div role="radiogroup" aria-label="Язык · Til · Language" className="lp-langs">
      {LANGS.map(l => (
        <button key={l.id} role="radio" aria-checked={l.id === lang} title={l.full} onClick={() => { setLang(l.id); track('lang', { lang: l.id }); }}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

const NAV_PAGES: Page[] = ['drivers', 'networks', 'prices', 'guide', 'faq', 'about'];

function Nav({ c, page, scrolled }: { c: LandingCopy; page: Page | null; scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  const go = useContext(GoCtx);
  return (
    <header className={`lp-nav ${scrolled ? 'is-solid' : ''} ${open ? 'is-open' : ''}`}>
      <div className="lp-wrap lp-nav-in">
        <PageLink to="home" className="lp-nav-logo"><Logo /><span className="lp-sr">{c.nav.home}</span></PageLink>
        <nav className="lp-nav-links" aria-label="Main">
          {NAV_PAGES.map(p => (
            <PageLink key={p} to={p} className={page === p ? 'is-on' : ''}>
              {page === p && <span className="lp-nav-pill" aria-hidden="true" />}
              <span className="lp-nav-t" aria-current={page === p ? 'page' : undefined}>{c.nav[p]}</span>
            </PageLink>
          ))}
        </nav>
        <div className="lp-nav-right">
          <LangPills />
          <PageLink to="join" className="lp-btn lp-btn-dark lp-btn-sm lp-hide-sm">{c.nav.join}<ArrowRight size={15} /></PageLink>
          <button className="lp-burger" aria-label={open ? c.nav.close : c.nav.menu} aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="lp-sheet">
          {(['home', ...NAV_PAGES] as Page[]).map((p, i) => (
            <a key={p} href={PATHS[p]} className={page === p ? 'is-on' : ''} style={delay(i * 40)}
              onClick={e => { e.preventDefault(); setOpen(false); go(p); }}>
              {c.nav[p]}<ArrowRight size={18} />
            </a>
          ))}
          <PageLink to="join" className="lp-btn lp-btn-dark" onClick={() => setOpen(false)}>{c.nav.join}<ArrowRight size={16} /></PageLink>
        </div>
      )}
    </header>
  );
}

// ───────────────────────── Home ─────────────────────────

function Hero({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-wrap lp-hero-in">
        <div className="lp-hero-copy">
          <p className="lp-badge">{c.hero.badge}</p>
          <h1 className="lp-h1">
            {c.hero.title.map((line, i) => <span key={i} className="lp-h1-line">{line}</span>)}
          </h1>
          <p className="lp-hero-sub">{c.hero.sub}</p>
          <div className="lp-hero-cta">
            <PageLink to="join" className="lp-btn lp-btn-primary lp-btn-lg">{c.cta.join}<ArrowRight size={18} /></PageLink>
            <PageLink to="drivers" className="lp-btn lp-btn-ghost lp-btn-lg">{c.hero.secondary}</PageLink>
          </div>
        </div>
        <div className="lp-hero-art lp-hero-phones" aria-hidden="true">
          <img className="lp-hero-ph lp-hero-ph-back" src={shot(lang, '3-station')} alt="" width={540} height={1169} decoding="async" />
          <img className="lp-hero-ph lp-hero-ph-front" src={shot(lang, '2-map')} alt="" width={540} height={1169} decoding="async" fetchPriority="high" />
        </div>
      </div>
    </section>
  );
}

/** The problem, as a plain struck-through list rather than a grid of tiles. */
function Pains({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec">
      <div className="lp-wrap lp-pains">
        <div className="lp-pains-head">
          <div className="rv"><Kicker>{c.pains.kicker}</Kicker></div>
          <h2 className="lp-h2 rv" style={delay(60)}>{c.pains.title}</h2>
        </div>
        <ol className="lp-pains-list">
          {c.pains.items.map((it, i) => (
            <li key={i} className="rv" style={delay(i * 90)}>
              <span className="lp-pains-n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3><span>{it.t}</span></h3>
                <p>{it.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="lp-wrap">
        <p className="lp-answer rv"><LogoMark size={44} /><span>{c.pains.answer}</span></p>
      </div>
    </section>
  );
}

/** How it works, step by step — for a driver or for a network, one switch apart. */
function HowTo({ c }: { c: LandingCopy }) {
  const [who, setWho] = useState<'driver' | 'network'>('driver');
  const h = c.howTo;
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <div className="lp-howto-head">
          <div>
            <div className="rv"><Kicker>{h.kicker}</Kicker></div>
            <h2 className="lp-h2 rv" style={delay(60)}>{h.title}</h2>
          </div>
          <div className="lp-switcher rv" role="tablist" aria-label={h.kicker} data-on={who}>
            {(['driver', 'network'] as const).map(k => (
              <button key={k} role="tab" aria-selected={who === k} onClick={() => setWho(k)}>{h.tabs[k]}</button>
            ))}
          </div>
        </div>
        <ol className="lp-howto" key={who} role="tabpanel">
          {h[who].map((st, i) => (
            <li key={i} style={delay(i * 90)}>
              <span className="lp-howto-n">{i + 1}</span>
              <h3>{st.t}</h3>
              <p>{st.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The app itself on the home page: a phone with the real screens (the same
 * shots as the guide), turning by themselves until a tab is picked.
 */
function Showcase({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const sc = c.showcase;
  const [on, setOn] = useState(0);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { root: el.closest('.lp'), threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (held || !seen || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setOn(i => (i + 1) % sc.tabs.length), 3200);
    return () => clearInterval(t);
  }, [held, seen, sc.tabs.length]);
  return (
    <section className="lp-sec lp-show" ref={box}>
      <div className="lp-wrap lp-show-in">
        <div className="lp-show-copy">
          <SectionHead kicker={sc.kicker} title={sc.title} sub={sc.sub} />
          <div className="lp-show-tabs rv" role="tablist" aria-label={sc.kicker}>
            {sc.tabs.map((tab, i) => (
              <button key={tab.id} role="tab" aria-selected={i === on} className={i === on ? 'is-on' : ''} onClick={() => { setOn(i); setHeld(true); }}>
                {tab.t}
                {i === on && !held && <i key={on} className="lp-show-timer" />}
              </button>
            ))}
          </div>
        </div>
        <div className="lp-show-stage rv" style={delay(120)}>
          <span className="lp-show-glow" aria-hidden="true" />
          <div className="lp-shot lp-show-phone">
            {sc.tabs.map((tab, i) => (
              <img key={tab.id} src={shot(lang, tab.id)} alt={i === on ? `${sc.kicker}: ${tab.t}` : ''} width={540} height={1169} className={i === on ? 'is-on' : ''} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Big typographic links to the inner pages. */
function NextPages({ c }: { c: LandingCopy }) {
  const items = ['drivers', 'networks', 'prices', 'guide'] as const;
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <div className="rv"><Kicker>{c.next.kicker}</Kicker></div>
        <nav className="lp-next" aria-label={c.next.kicker}>
          {items.map((p, i) => {
            const it = c.next.items[p];
            return (
              <PageLink key={p} to={p} className="lp-next-row rv" style={delay(i * 90)}>
                <span className="lp-next-t">{it.t}</span>
                <span className="lp-next-d">{it.d}</span>
                <span className="lp-next-go"><ArrowUpRight size={28} /></span>
              </PageLink>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

function HomePage({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <>
      <Hero c={c} lang={lang} />
      <Pains c={c} />
      <HowTo c={c} />
      <Showcase c={c} lang={lang} />
      <NextPages c={c} />
      <Cta c={c} />
    </>
  );
}

// ───────────────────────── Drivers ─────────────────────────

const PILLAR_ICON: Record<string, ReactNode> = {
  find: <MapIcon size={22} />, charge: <ScanLine size={22} />, road: <Navigation size={22} />, care: <Sparkles size={22} />,
};

/**
 * A city map drawn in the app's own style: quarters, avenues, a canal,
 * station markers. Static SVG — nothing runs after it is drawn.
 */
const MAP_STREETS = (() => {
  const d: string[] = [];
  for (let x = -40; x < 700; x += 74) d.push(`M${x} -40 L${x + 70} 520`);
  for (let y = -20; y < 560; y += 62) d.push(`M-40 ${y} L700 ${y - 60}`);
  return d.join(' ');
})();
type MapPin = { x: number; y: number; free?: boolean; big?: boolean; label?: string };
function CityMap({ pins, route, me, children }: { pins: MapPin[]; route?: string; me?: [number, number]; children?: ReactNode }) {
  return (
    <div className="lp-cmap">
      <svg viewBox="0 0 640 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="640" height="480" fill="#EFEDE6" />
        <path d="M410 -10 C440 90 520 120 560 200 S 600 380 660 430" className="lp-cmap-water" />
        <path d="M60 300 l90 -14 l18 70 l-92 18 z M470 300 l70 -10 l12 52 l-70 12 z" className="lp-cmap-park" />
        <path d={MAP_STREETS} className="lp-cmap-street" />
        <g className="lp-cmap-avenue">
          <path d="M-20 120 C160 110 330 70 660 40" />
          <path d="M-20 360 C180 330 360 380 660 330" />
          <path d="M210 -20 C230 140 190 300 240 500" />
          <path d="M470 -20 C440 160 500 300 460 500" />
        </g>
        {route && <><path d={route} pathLength={1} className="lp-cmap-route-case" /><path d={route} pathLength={1} className="lp-cmap-route" /></>}
        {me && <g transform={`translate(${me[0]} ${me[1]})`}><circle r="22" className="lp-cmap-me-halo" /><circle r="8" className="lp-cmap-me" /></g>}
        {pins.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y})`} className={`lp-cmap-pin${p.free ? ' is-free' : ''}${p.big ? ' is-big' : ''}`} style={{ '--i': i } as CSSProperties}>
            <path d="M0 0 C-4 -9 -14 -14 -14 -26 A14 14 0 1 1 14 -26 C14 -14 4 -9 0 0 Z" />
            <path d="M1.5 -34 L-5 -24 L-0.5 -24 L-2 -17 L5 -28 L0.5 -28 Z" className="lp-cmap-bolt" />
            {p.label && <g transform="translate(16 -46)"><rect width="64" height="26" rx="13" className="lp-cmap-tag" /><text x="32" y="17.5" textAnchor="middle">{p.label}</text></g>}
          </g>
        ))}
      </svg>
      {children}
    </div>
  );
}

function PillarVisual({ id, ui }: { id: string; ui: string[] }) {
  if (id === 'find')
    return (
      <div className="lp-pv lp-pv-find">
        <CityMap
          me={[96, 420]}
          route="M96 420 C150 400 200 380 214 352 C226 300 214 220 226 140 C232 104 330 94 448 70"
          pins={[{ x: 120, y: 160 }, { x: 330, y: 230, free: true }, { x: 560, y: 120 }, { x: 214, y: 352, free: true }, { x: 520, y: 270 }, { x: 448, y: 70, free: true, big: true }]}
        >
          <div className="lp-pv-card">
            <span className="lp-pv-badge"><Check size={13} strokeWidth={3} />{ui[0]}</span>
            <b>{ui[1]}</b>
            <small>{ui[2]}</small>
          </div>
        </CityMap>
      </div>
    );
  if (id === 'charge')
    return (
      <div className="lp-pv lp-pv-charge">
        <div className="lp-pv-qr">
          <QrCode size={96} strokeWidth={1.4} />
          <i className="lp-pv-scan" />
          <span className="lp-pv-corner is-tl" /><span className="lp-pv-corner is-tr" /><span className="lp-pv-corner is-bl" /><span className="lp-pv-corner is-br" />
        </div>
        <p className="lp-pv-hint">{ui[0]}</p>
        <div className="lp-pv-price">
          <small>{ui[1]}</small>
          <b>{ui[2]}</b>
        </div>
        <div className="lp-pv-pay">{['Payme', 'Click', 'Uzum', 'Humo'].map(p => <span key={p}>{p}</span>)}</div>
      </div>
    );
  if (id === 'road')
    return (
      <div className="lp-pv lp-pv-road">
        <div className="lp-pv-sky" />
        <div className="lp-pv-asphalt"><i /><i /><i /><i /><i /></div>
        <div className="lp-pv-turn"><Navigation size={18} /><span>{ui[0]}</span></div>
        <div className="lp-pv-off"><WifiOff size={15} />{ui[1]}</div>
        <div className="lp-pv-sos"><Siren size={16} />{ui[2]}</div>
      </div>
    );
  return (
    <div className="lp-pv lp-pv-care">
      <Moon className="lp-pv-moon" size={46} />
      <div className="lp-pv-bars">
        {[10, 10, 10, 10, 10, 10, 10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 12, 12, 12, 12, 12, 10, 7].map((v, i) => (
          <span key={i} className={i < 7 || i === 23 ? 'is-night' : ''} style={{ height: `${(i < 7 || i === 23 ? 7 : v) * 7}%`, animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="lp-pv-tags">
        <span className="is-dark"><Moon size={14} />{ui[0]}</span>
        <span><Gift size={14} />{ui[1]}</span>
        <span><HeartPulse size={14} />{ui[2]}</span>
      </div>
    </div>
  );
}

/** Four open text-and-picture rows, alternating sides. */
function Pillars({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec lp-sec-tight">
      <div className="lp-wrap lp-pillars">
        {c.gives.pillars.map((p, i) => (
          <article key={p.id} className={`lp-pillar ${i % 2 ? 'is-flip' : ''}`}>
            <div className="lp-pillar-copy rv">
              <p className="lp-pillar-n"><span className="lp-pillar-ic">{PILLAR_ICON[p.id]}</span>{p.n}</p>
              <h2 className="lp-h3">{p.t}</h2>
              <p className="lp-pillar-lead">{p.lead}</p>
              <ul>
                {p.points.map((pt, j) => <li key={pt} className="rv" style={delay(120 + j * 60)}><Check size={17} strokeWidth={3} />{pt}</li>)}
              </ul>
            </div>
            <div className="lp-pillar-art rv" style={delay(120)}>
              <PillarVisual id={p.id} ui={p.ui} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type ActivityKind = 'start' | 'stop' | 'reserved' | 'offline';
type Activity = { id: string; kind: ActivityKind; station: string; city: string; connector: string; at: Date };

/**
 * Builds a public activity feed by diffing connector statuses between live
 * updates — the anonymous state carries no session events, and a feed built
 * from statuses names no driver.
 */
function useActivity(stations: Station[] | undefined, kw: string) {
  const prev = useRef<Map<string, string> | null>(null);
  const [feed, setFeed] = useState<Activity[]>([]);
  useEffect(() => {
    if (!stations) return;
    const next = new Map<string, string>();
    const fresh: Activity[] = [];
    for (const st of stations) {
      for (const k of st.connectors) {
        const key = `${st.id}:${k.id}`;
        next.set(key, k.status);
        const was = prev.current?.get(key);
        if (was === undefined || was === k.status) continue;
        const kind: ActivityKind | null =
          k.status === 'occupied' ? 'start'
          : k.status === 'reserved' ? 'reserved'
          : k.status === 'unavailable' ? 'offline'
          : was === 'occupied' || was === 'reserved' ? 'stop'
          : null;
        if (kind) fresh.push({ id: `${key}:${Date.now()}`, kind, station: st.name, city: st.city, connector: `${k.type} · ${k.power} ${kw}`, at: new Date() });
      }
    }
    prev.current = next;
    if (fresh.length) setFeed(f => [...fresh.reverse(), ...f].slice(0, 7));
  }, [stations, kw]);
  return feed;
}

const ACT_ICON: Record<ActivityKind, ReactNode> = {
  start: <Zap size={14} />, stop: <Check size={14} />, reserved: <CalendarClock size={14} />, offline: <X size={14} />,
};

/** The live demo network as one list of stations beside the event feed. */
function LiveNetwork({ c, lang, fc }: { c: LandingCopy; lang: Lang; fc: TariffForecast }) {
  const { state } = useSync();
  const stations = state?.stations;
  const feed = useActivity(stations, c.phone.kw);
  const [filter, setFilter] = useState<'all' | 'free' | 'fast'>('all');
  const shown = (stations ?? []).filter(st =>
    filter === 'free' ? st.connectors.some(k => k.status === 'available')
    : filter === 'fast' ? st.connectors.some(k => k.power >= 50)
    : true,
  );
  const time = (d: Date) =>
    d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <section className="lp-sec" id="network">
      <div className="lp-wrap">
        <SectionHead kicker={c.network.kicker} title={c.network.title} sub={c.network.sub} />
        <div className="lp-net">
          <div className="lp-card lp-st-list rv">
            <div className="lp-chips" role="group" aria-label={c.network.kicker}>
              {(['all', 'free', 'fast'] as const).map(f => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{c.network.filters[f]}</button>
              ))}
            </div>
            <div className="lp-st-rows">
              {shown.map(st => {
                const free = st.connectors.filter(k => k.status === 'available').length;
                const min = Math.min(...st.connectors.map(k => k.price));
                return (
                  <article key={st.id} className="lp-st">
                    <div className="lp-st-name">
                      <h3>{st.name}</h3>
                      <p>{st.city} · {st.operator}</p>
                    </div>
                    <ul className="lp-st-dots" aria-label={`${free}/${st.connectors.length} ${c.network.freeOf}`}>
                      {st.connectors.map(k => <li key={k.id} className={`is-${k.status}`} title={`${k.type} · ${k.power} ${c.phone.kw} · ${c.network.status[k.status]}`} />)}
                    </ul>
                    <span className={`lp-st-free ${free ? 'is-free' : 'is-full'}`}>{free}/{st.connectors.length} {c.network.freeOf}</span>
                    <span className="lp-st-price"><b>{fmt(min * fc.current.multiplier, lang)}</b> {c.network.perKwh}</span>
                  </article>
                );
              })}
              {stations && shown.length === 0 && <p className="lp-note">{c.network.none}</p>}
            </div>
          </div>
          <aside className="lp-card lp-feed rv" aria-live="polite">
            <p className="lp-live"><span className="lp-dot" />{c.network.feed}</p>
            {feed.length === 0 ? (
              <p className="lp-feed-empty">{c.network.empty}</p>
            ) : (
              <ol>
                {feed.map(a => (
                  <li key={a.id} className={`is-${a.kind}`}>
                    <span className="lp-feed-ic">{ACT_ICON[a.kind]}</span>
                    <div>
                      <b>{c.network.ev[a.kind]}</b>
                      <span>{a.station} · {a.city}</span>
                      <small>{a.connector} · {time(a.at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Mark({ v, label }: { v: number; label: string }) {
  return (
    <span className={`lp-mark is-${v}`} title={label} aria-label={label}>
      {v === 2 ? <Check size={15} strokeWidth={3} /> : v === 1 ? <span className="lp-half" /> : <Minus size={15} />}
    </span>
  );
}

function Compare({ c }: { c: LandingCopy }) {
  const labels = [c.compare.legend[2], c.compare.legend[1], c.compare.legend[0]];
  return (
    <section className="lp-sec" id="compare">
      <div className="lp-wrap">
        <SectionHead kicker={c.compare.kicker} title={c.compare.title} sub={c.compare.sub} center />
        <div className="lp-compare rv">
          <div className="lp-compare-scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  {c.compare.cols.map((col, i) => (
                    <th key={i} className={i === 0 ? 'is-us' : ''}>{i === 0 ? <span className="lp-compare-us"><LogoMark size={22} />{col}</span> : col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.compare.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.t}</td>
                    {r.v.map((v, j) => <td key={j} className={j === 0 ? 'is-us' : ''}><Mark v={v} label={labels[v]} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lp-legend lp-compare-legend">
            <span><Mark v={2} label={c.compare.legend[0]} />{c.compare.legend[0]}</span>
            <span><Mark v={1} label={c.compare.legend[1]} />{c.compare.legend[1]}</span>
            <span><Mark v={0} label={c.compare.legend[2]} />{c.compare.legend[2]}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const SAFETY_ICON = [Wallet, CreditCard, Lock, ScanFace, KeyRound, LifeBuoy];

/** Payments and safety as an open grid of short statements. */
function Safety({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec" id="safety">
      <div className="lp-wrap">
        <SectionHead kicker={c.safety.kicker} title={c.safety.title} />
        <ul className="lp-safety">
          {c.safety.items.map((it, i) => {
            const Icon = SAFETY_ICON[i] ?? Lock;
            return (
              <li key={i} className="rv" style={delay((i % 3) * 90)}>
                <span className="lp-safety-ic"><Icon size={22} /></span>
                <h3>{it.t}</h3>
                <p>{it.d}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function DriversPage({ c, lang, fc }: { c: LandingCopy; lang: Lang; fc: TariffForecast }) {
  const p = c.pages.drivers;
  return (
    <>
      <PageHead kicker={p.kicker} title={p.title} sub={p.sub} />
      <Pillars c={c} />
      <Safety c={c} />
      <LiveNetwork c={c} lang={lang} fc={fc} />
      <Compare c={c} />
      <Cta c={c} />
    </>
  );
}

// ───────────────────────── Networks ─────────────────────────

/** Driver → Voli → the network's till, with a charge travelling along the line. */
function Flow({ c }: { c: LandingCopy }) {
  const [a, b, z] = c.partners.flow;
  return (
    <div className="lp-flow rv" aria-label={c.partners.flow.join(' → ')}>
      <span className="lp-flow-node"><Car size={22} />{a}</span>
      <span className="lp-flow-line"><i /></span>
      <span className="lp-flow-node is-us"><LogoMark size={30} />{b}</span>
      <span className="lp-flow-line"><i style={{ animationDelay: '1.2s' }} /></span>
      <span className="lp-flow-node is-dark"><CircleDollarSign size={22} />{z}</span>
    </div>
  );
}

const PROMO_ICON: Record<string, typeof Users> = {
  reach: Users, deals: BadgePercent, night: Moon, nearby: Coffee, rewards: Gift, launch: Megaphone, forecast: CalendarClock, insights: ChartColumn,
};

/** A quiet charger getting busier: its deal tag on the map and hourly usage rising. */
function PromoVisual({ mock }: { mock: LandingCopy['promo']['mock'] }) {
  const bars = [2, 2, 1, 1, 1, 2, 3, 5, 6, 5, 4, 5, 6, 7, 6, 6, 7, 8, 9, 8, 6, 5, 4, 3];
  return (
    <div className="lp-promo-art rv" style={delay(120)} aria-hidden="true">
      <div className="lp-promo-map">
        <CityMap pins={[{ x: 110, y: 150 }, { x: 250, y: 330 }, { x: 520, y: 120 }, { x: 560, y: 300 }, { x: 330, y: 190, free: true, big: true, label: mock.deal }]}>
          <div className="lp-promo-card"><b>{mock.name}</b><small>{mock.deal} · {mock.note}</small></div>
        </CityMap>
      </div>
      <div className="lp-promo-load">
        <span>{mock.load}</span>
        <div className="lp-promo-bars">{bars.map((v, i) => <i key={i} className={i >= 10 && i <= 15 ? 'is-deal' : ''} style={{ height: `${v * 11}%`, '--i': i } as CSSProperties} />)}</div>
        <div className="lp-promo-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </div>
    </div>
  );
}

/** How Voli helps a network fill chargers that see few drivers. */
function Promo({ c }: { c: LandingCopy }) {
  const p = c.promo;
  return (
    <section className="lp-sec" id="promo">
      <div className="lp-wrap lp-promo">
        <div className="lp-promo-copy">
          <SectionHead kicker={p.kicker} title={p.title} sub={p.sub} />
          <ol className="lp-promo-list">
            {p.items.map((it, i) => {
              const Icon = PROMO_ICON[it.id] ?? Zap;
              return (
                <li key={it.id} className="rv" style={delay((i % 2) * 90)}>
                  <span className="lp-promo-ic"><Icon size={20} /></span>
                  <div>
                    <h3>{it.t}</h3>
                    <p>{it.d}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <PromoVisual mock={p.mock} />
      </div>
    </section>
  );
}

function NetworksPage({ c }: { c: LandingCopy }) {
  const p = c.partners;
  const head = c.pages.networks;
  return (
    <>
      <PageHead kicker={head.kicker} title={head.title} sub={head.sub}>
        <Flow c={c} />
      </PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap">
          <ol className="lp-benefits">
            {p.items.map((it, i) => (
              <li key={i} className="rv" style={delay((i % 2) * 100)}>
                <span className="lp-benefits-n">{String(i + 1).padStart(2, '0')}</span>
                <h2>{it.t}</h2>
                <p>{it.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <Promo c={c} />
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-band rv">
            <div className="lp-band-market">
              <Kicker>{p.market.title}</Kicker>
              <dl>
                {p.market.items.map((m, i) => <div key={i}><dd>{m.n}</dd><dt>{m.t}</dt></div>)}
              </dl>
            </div>
            <div className="lp-band-steps">
              <Kicker>{p.stepsTitle}</Kicker>
              <ol>
                {c.howTo.network.map((st, i) => <li key={i}><span>{i + 1}</span>{st.t}</li>)}
              </ol>
              <PageLink to="join" className="lp-btn lp-btn-primary lp-btn-lg"><Handshake size={18} />{p.cta}<ArrowRight size={18} /></PageLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ───────────────────────── Prices ─────────────────────────

function fallbackForecast(): TariffForecast {
  const band = (h: number): TariffHour['band'] =>
    h >= 23 || h < 7 ? 'green' : h >= 17 && h < 22 ? 'peak' : h >= 10 && h < 17 ? 'day' : 'standard';
  const mult = { green: 0.7, standard: 1, day: 0.9, peak: 1.25 } as const;
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, band: band(h), multiplier: mult[band(h)] }));
  const now = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Tashkent' }).format(new Date())) % 24;
  return { timezone: 'Asia/Tashkent', currentHour: now, current: hours[now], hours, bestWindow: { from: 23, to: 7, multiplier: 0.7, startsInHours: 0 } };
}

/** Night-rate forecast from the server, refreshed every 10 minutes; rule-based until it arrives. */
function useForecast() {
  const [fc, setFc] = useState<TariffForecast>(fallbackForecast);
  useEffect(() => {
    let alive = true;
    const load = () => apiClient.tariffForecast().then(f => alive && setFc(f)).catch(() => {});
    load();
    const t = setInterval(load, 10 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return fc;
}

function GreenHours({ c, fc }: { c: LandingCopy; fc: TariffForecast }) {
  return (
    <div className="lp-card lp-green rv">
      <div className="lp-green-head">
        <div>
          <Kicker>{c.green.kicker}</Kicker>
          <h2 className="lp-h3">{c.green.title}</h2>
          <p className="lp-sub">{c.green.sub}</p>
        </div>
        <div className="lp-green-now">
          <span>{c.green.now} · {String(fc.currentHour).padStart(2, '0')}:00</span>
          <b className={`is-${fc.current.band}`}>×{fc.current.multiplier}</b>
        </div>
      </div>
      <div className="lp-chart" role="img" aria-label={c.green.title}>
        {fc.hours.map(h => (
          <div key={h.hour} className={`lp-chart-col ${h.hour === fc.currentHour ? 'is-now' : ''}`}>
            <span className={`lp-chart-bar is-${h.band}`} style={{ height: `${(h.multiplier / 1.25) * 100}%`, animationDelay: `${h.hour * 30}ms` }} />
            <small>{h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}</small>
          </div>
        ))}
      </div>
      <div className="lp-green-best">
        <Moon size={22} />
        <div>
          <span>{c.green.best}</span>
          <b>
            {String(fc.bestWindow.from).padStart(2, '0')}:00–{String(fc.bestWindow.to).padStart(2, '0')}:00 · ×{fc.bestWindow.multiplier}
            {' · '}
            {fc.bestWindow.startsInHours > 0 ? `${c.green.in} ${fc.bestWindow.startsInHours} ${c.green.h}`.trim() : c.green.active}
          </b>
        </div>
      </div>
      <div className="lp-legend">
        {(['green', 'day', 'standard', 'peak'] as const).map(b => (
          <span key={b}><i className={`is-${b}`} />{c.green.bands[b]}</span>
        ))}
      </div>
    </div>
  );
}

function Calculator({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const [car, setCar] = useState(CARS[0].id);
  const [km, setKm] = useState(2000);
  const [petrol, setPetrol] = useState(10500);
  const [price, setPrice] = useState(1600);
  const [night, setNight] = useState(true);
  const m = CARS.find(x => x.id === car) ?? CARS[0];
  const mult = night ? 0.7 : 1;
  const evMonth = (km / 100) * m.use * price * mult;
  const petMonth = (km / 100) * 8 * petrol;
  const year = (petMonth - evMonth) * 12;
  const full = m.battery * price * mult;
  const range = (m.battery / m.use) * 100;
  const share = Math.max(4, Math.min(100, (evMonth / Math.max(petMonth, 1)) * 100));

  return (
    <div className="lp-card lp-calc rv" style={delay(100)}>
      <Kicker>{c.calc.kicker}</Kicker>
      <h2 className="lp-h3">{c.calc.title}</h2>
      <p className="lp-sub">{c.calc.sub}</p>
      <div className="lp-calc-grid">
        <div className="lp-calc-in">
          <label className="lp-field">
            <span>{c.calc.car}</span>
            <select value={car} onChange={e => setCar(e.target.value)}>
              {CARS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="lp-field">
            <span>{c.calc.km} <b>{fmt(km, lang)}</b></span>
            <input type="range" min={300} max={8000} step={100} value={km} onChange={e => setKm(+e.target.value)} />
          </label>
          <div className="lp-field-row">
            <label className="lp-field">
              <span>{c.calc.petrol}</span>
              <input type="number" inputMode="numeric" min={1000} step={100} value={petrol} onChange={e => setPetrol(Math.max(0, +e.target.value))} />
            </label>
            <label className="lp-field">
              <span>{c.calc.kwh}</span>
              <input type="number" inputMode="numeric" min={100} step={50} value={price} onChange={e => setPrice(Math.max(0, +e.target.value))} />
            </label>
          </div>
          <label className="lp-switch">
            <input type="checkbox" checked={night} onChange={e => setNight(e.target.checked)} />
            <span className="lp-switch-ui" /><Moon size={15} />{c.calc.night} <em>×0,7</em>
          </label>
        </div>
        <div className="lp-calc-out">
          <div className="lp-calc-bars">
            <div>
              <span>{c.calc.petrolMonth}</span>
              <div className="lp-cbar"><i className="is-petrol" style={{ width: '100%' }} /></div>
              <b>{fmt(petMonth, lang)} {c.calc.sum}</b>
            </div>
            <div>
              <span>{c.calc.evMonth}</span>
              <div className="lp-cbar"><i className="is-ev" style={{ width: `${share}%` }} /></div>
              <b>{fmt(evMonth, lang)} {c.calc.sum}</b>
            </div>
          </div>
          <div className="lp-calc-save">
            <span>{c.calc.save}</span>
            <b>{fmt(Math.max(year, 0), lang)} {c.calc.sum}</b>
          </div>
          <div className="lp-calc-kv">
            <div><span>{c.calc.full}</span><b>{fmt(full, lang)} {c.calc.sum}</b></div>
            <div><span>{c.calc.range}</span><b>≈ {fmt(range, lang)} {c.calc.km_}</b></div>
          </div>
        </div>
      </div>
      <p className="lp-note">{c.calc.note}</p>
    </div>
  );
}

function PricesPage({ c, lang, fc }: { c: LandingCopy; lang: Lang; fc: TariffForecast }) {
  const p = c.pages.prices;
  return (
    <>
      <PageHead kicker={p.kicker} title={p.title} sub={p.sub}>
        <dl className="lp-facts">
          {c.facts.map((f, i) => <div key={i} className="rv" style={delay(220 + i * 80)}><dd>{f.n}</dd><dt>{f.t}</dt></div>)}
        </dl>
      </PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-pricing">
          <GreenHours c={c} fc={fc} />
          <Calculator c={c} lang={lang} />
        </div>
      </section>
      <Cta c={c} />
    </>
  );
}

// ───────────────────────── FAQ and join ─────────────────────────

function FaqPage({ c }: { c: LandingCopy }) {
  const p = c.pages.faq;
  return (
    <>
      <PageHead kicker={p.kicker} title={p.title} sub={p.sub} />
      <section className="lp-sec lp-sec-tight" id="faq">
        <div className="lp-wrap">
          {c.faq.groups.map((g, gi) => (
            <div key={gi} className="lp-faq-group">
              <h2 className="lp-faq-gt rv">{g.t}</h2>
              <div className="lp-faq-list">
                {g.items.map((f, i) => (
                  <details key={i} className="lp-faq-item rv" style={delay((i % 5) * 50)} open={gi === 0 && i === 0}>
                    <summary>{f.q}<span className="lp-faq-plus" aria-hidden="true" /></summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <Cta c={c} />
    </>
  );
}

// ───────────────────────── Cities (for search) ─────────────────────────

const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
/** Stations within ~35 km of the city centre, whatever spelling their address uses. */
function nearCity(id: CityId, st: Station) {
  const c = HUB_CITIES.find(x => x.id === id);
  if (!c || typeof st.geoLat !== 'number' || typeof st.geoLng !== 'number') return false;
  const dLat = (st.geoLat - c.lat) * 111;
  const dLng = (st.geoLng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) <= 35;
}

/** "EV charging in Tashkent": live stations, prices and answers, for people searching by city. */
function CityPage({ c, lang, id }: { c: LandingCopy; lang: Lang; id: CityId }) {
  const { state } = useSync();
  const k = c.cityPage;
  const v = { in: k.in[id] };
  const list = useMemo(() => (state?.stations ?? []).filter(st => nearCity(id, st)), [state?.stations, id]);
  const connectors = list.flatMap(st => st.connectors);
  const free = connectors.filter(x => x.status === 'available').length;
  const minPrice = connectors.length ? Math.min(...connectors.map(x => x.price)) : 0;
  const shown = [...list].sort((a, b) => b.connectors.filter(x => x.status === 'available').length - a.connectors.filter(x => x.status === 'available').length).slice(0, 12);
  const app = `${APP_URL}/?portal=driver`;
  return (
    <>
      <PageHead kicker={k.kicker} title={fill(k.title, v)} sub={fill(k.sub, v)}>
        <a href={app} className="lp-btn lp-btn-primary lp-btn-lg"><MapPin size={18} />{k.open}</a>
      </PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap">
          <dl className="lp-city-stats rv">
            <div><dd>{list.length}</dd><dt>{k.stats.stations}</dt></div>
            <div><dd>{connectors.length}</dd><dt>{k.stats.connectors}</dt></div>
            <div><dd>{free}</dd><dt>{k.stats.free}</dt></div>
            <div><dd>{minPrice ? fmt(minPrice, lang) : '—'}</dd><dt>{k.stats.from}</dt></div>
          </dl>
          <h2 className="lp-h2 rv" style={{ marginTop: 56 }}>{fill(k.listTitle, v)}</h2>
          {shown.length === 0 ? <p className="lp-city-empty rv">{fill(k.empty, v)}</p> : (
            <div className="lp-city-grid">
              {shown.map((st, i) => {
                const f = st.connectors.filter(x => x.status === 'available').length;
                const kw = Math.max(...st.connectors.map(x => x.power));
                const p = Math.min(...st.connectors.map(x => x.price));
                return (
                  <a key={st.id} href={`${APP_URL}/?portal=driver&station=${encodeURIComponent(st.id)}`} className="lp-city-card rv" style={delay((i % 6) * 50)}>
                    <b>{st.name}</b>
                    <span className="lp-city-addr">{st.address}</span>
                    <span className="lp-city-op">{st.operator}</span>
                    <span className="lp-city-row">
                      <em className={f ? 'is-free' : 'is-busy'}>{f ? fill(k.free, { f, t: st.connectors.length }) : k.busy}</em>
                      <em>{fill(k.upTo, { kw })}</em>
                      <em>{fill(k.price, { p: fmt(p, lang) })}</em>
                    </span>
                  </a>
                );
              })}
            </div>
          )}
          {list.length > shown.length && <p className="lp-city-more"><a href={app}>{fill(k.more, { n: list.length - shown.length })} →</a></p>}
        </div>
      </section>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap">
          <h2 className="lp-h2 rv">{k.whyTitle}</h2>
          <div className="lp-city-why">
            {k.why.map((w, i) => <div key={i} className="lp-city-why-item rv" style={delay(i * 80)}><b>{w.t}</b><p>{w.d}</p></div>)}
          </div>
        </div>
      </section>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap">
          <h2 className="lp-h2 rv">{k.faqTitle}</h2>
          <div className="lp-faq-list">
            {k.faq.map((f, i) => (
              <details key={i} className="lp-faq-item rv" open={i === 0}>
                <summary>{fill(f.q, v)}<span className="lp-faq-plus" aria-hidden="true" /></summary>
                <p>{fill(f.a, v)}</p>
              </details>
            ))}
          </div>
          <p className="lp-city-others rv">{CITY_IDS.filter(x => x !== id).map(x => <PageLink key={x} to={x}>{c.nav[x]}</PageLink>)}</p>
        </div>
      </section>
      <Cta c={c} />
    </>
  );
}

// ───────────────────────── Guide ─────────────────────────

const shot = (lang: Lang, id: string) => `/landing/guide/${lang}/${id}.webp`;

/** A phone with a real screenshot of the app inside. */
function PhoneShot({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="lp-shot">
      <img src={src} alt={alt} width={540} height={1169} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </div>
  );
}

/**
 * The steps scroll past a phone that stays in place on wide screens and
 * swaps to each step's screen; on a phone every step carries its own shot.
 */
function GuideSteps({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const g = c.guide;
  const [active, setActive] = useState(0);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const root = el.closest('.lp');
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i)); }),
      { root, rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('li').forEach(li => io.observe(li));
    return () => io.disconnect();
  }, []);
  return (
    <section className="lp-sec lp-sec-tight">
      <div className="lp-wrap lp-guide">
        <div className="lp-guide-phone" aria-hidden="true">
          <div className="lp-shot">
            {g.steps.map((s, i) => (
              <img key={s.id} src={shot(lang, s.id)} alt="" width={540} height={1169} className={i === active ? 'is-on' : ''} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
            ))}
          </div>
          <div className="lp-guide-dots">{g.steps.map((s, i) => <i key={s.id} className={i === active ? 'is-on' : ''} />)}</div>
        </div>
        <ol className="lp-guide-steps" ref={list}>
          {g.steps.map((s, i) => (
            <li key={s.id} data-i={i} className={i === active ? 'is-on' : ''}>
              <span className="lp-guide-n">{String(i + 1).padStart(2, '0')}</span>
              <h2>{s.t}</h2>
              <p>{s.d}</p>
              <div className="lp-guide-inline"><PhoneShot src={shot(lang, s.id)} alt={`${g.alt}: ${s.t}`} /></div>
            </li>
          ))}
        </ol>
      </div>
      <div className="lp-wrap"><p className="lp-note">{g.note}</p></div>
    </section>
  );
}

/** The Voli mark as an app icon inside a notification. */
const AppIcon = ({ size = 20 }: { size?: number }) => <span className="lp-n-icon"><LogoMark size={size} /></span>;

function AndroidLock({ c }: { c: LandingCopy }) {
  const d = c.devices;
  const a = d.android;
  return (
    <div className="lp-dev lp-dev-android" aria-hidden="true">
      <div className="lp-dev-screen lp-wall-a">
        <div className="lp-dev-status"><span>21:47</span><span className="lp-dev-sys"><i /><i /><b>78%</b></span></div>
        <p className="lp-lock-time lp-lock-time-a">21:47</p>
        <p className="lp-lock-date">{d.date}</p>
        <div className="lp-n-stack">
          {/* The live card exactly as the app draws it (android …/push/ChargeNotice.java) */}
          <div className="lp-n lp-n-a lp-n-live" style={delay(200)}>
            <div className="lp-n-head"><AppIcon /><span>Voli</span></div>
            <div className="lp-lc">
              <div className="lp-lc-top">
                <span className="lp-lc-bolt"><Zap size={15} fill="currentColor" strokeWidth={0} /></span>
                <div className="lp-lc-name"><b>{a.card.station}</b><small>{a.card.sub}</small></div>
                <strong className="lp-lc-pct">72%</strong>
              </div>
              <div className="lp-lc-bar"><i /></div>
              <div className="lp-lc-nums">
                <span><small>{a.card.lEnergy}</small>{a.card.energy}</span>
                <span><small>{a.card.lCost}</small>{a.card.cost}</span>
                <span><small>{a.card.lPower}</small>{a.card.power}</span>
              </div>
              <p className="lp-lc-status">{a.card.status}</p>
            </div>
          </div>
          <div className="lp-n lp-n-a" style={delay(700)}>
            <div className="lp-n-head"><AppIcon /><span>Voli</span><em>· {d.ago}</em></div>
            <b>{a.queue.title}</b>
            <p>{a.queue.body}</p>
          </div>
          <div className="lp-n lp-n-a" style={delay(1200)}>
            <div className="lp-n-head"><AppIcon /><span>Voli</span><em>· 1 h</em></div>
            <b>{a.done.title}</b>
            <p>{a.done.body}</p>
          </div>
        </div>
        <span className="lp-dev-home" />
      </div>
    </div>
  );
}

function IphoneLock({ c }: { c: LandingCopy }) {
  const d = c.devices;
  const o = d.ios;
  const rows = [[o.goal, d.now], [o.support, d.ago], [o.booking, '9:12']] as const;
  return (
    <div className="lp-dev lp-dev-ios" aria-hidden="true">
      <div className="lp-dev-screen lp-wall-i">
        <span className="lp-dev-island" />
        <div className="lp-dev-status lp-dev-status-i"><span>9:41</span><span className="lp-dev-sys"><i /><i /><b /></span></div>
        <p className="lp-lock-date lp-lock-date-i">{d.date}</p>
        <p className="lp-lock-time">9:41</p>
        <div className="lp-n-stack lp-n-stack-i">
          {rows.map(([n, when], i) => (
            <div key={i} className="lp-n lp-n-i" style={delay(200 + i * 500)}>
              <AppIcon size={30} />
              <div>
                <div className="lp-n-row"><b>{n.title}</b><em>{when}</em></div>
                <p>{n.body}</p>
              </div>
            </div>
          ))}
        </div>
        <span className="lp-dev-home" />
      </div>
    </div>
  );
}

/** Demo stations as the car screens list them (CarPlaySceneDelegate / StationsScreen). */
const CAR_STATIONS = [
  { name: 'Toshkent Siti Hub', km: 1.2, op: 'GreenCharge UZ', free: 3, total: 4, kw: 150, price: 2000, x: 62, y: 46 },
  { name: 'Yunusobod Mall Charge', km: 4.6, op: 'EcoVolt', free: 0, total: 3, kw: 120, price: 1600, x: 84, y: 24 },
  { name: 'Samarqand Gateway', km: 289, op: 'SilkRoad EV', free: 2, total: 2, kw: 120, price: 1900, x: 74, y: 80 },
];

function CarScreen({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const k = c.devices.car;
  const [sys, setSys] = useState<'carplay' | 'auto'>('carplay');
  const km = (v: number) => `${v.toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 })} ${k.km}`;
  const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, key: string) => String(v[key] ?? ''));
  const status = (s: typeof CAR_STATIONS[number], withPrice: boolean) =>
    s.free > 0
      ? fill(k.free, { f: s.free, t: s.total, kw: s.kw }) + (withPrice ? ` · ${fill(k.price, { p: fmt(s.price, lang) })}` : '')
      : fill(k.busy, { kw: s.kw });
  return (
    <div className="lp-car-wrap">
      <div className="lp-switcher lp-switcher-sm" role="tablist" data-on={sys === 'carplay' ? 'driver' : 'network'}>
        {(['carplay', 'auto'] as const).map(s => <button key={s} role="tab" aria-selected={sys === s} onClick={() => setSys(s)}>{k.tabs[s]}</button>)}
      </div>
      <div className={`lp-car lp-car-${sys}`} aria-hidden="true">
        <div className="lp-car-screen" key={sys}>
          {sys === 'carplay' ? (
            <>
              <div className="lp-cp-dock">
                <span className="lp-cp-time">9:41</span>
                <span className="lp-cp-app is-on"><LogoMark size={30} /></span>
                <span className="lp-cp-app lp-cp-maps" />
                <span className="lp-cp-app lp-cp-music" />
                <span className="lp-cp-grid" />
              </div>
              <div className="lp-car-map">
                {CAR_STATIONS.map((s, i) => <span key={i} className={`lp-car-pin ${i === 0 ? 'is-sel' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>{i + 1}</span>)}
                <span className="lp-car-me" style={{ left: '56%', top: '60%' }} />
              </div>
              <div className="lp-cp-panel">
                <p className="lp-cp-title">Voli</p>
                {CAR_STATIONS.map((s, i) => (
                  <div key={i} className={`lp-cp-row ${i === 0 ? 'is-sel' : ''}`}>
                    <span className="lp-cp-n">{i + 1}</span>
                    <div><b>{s.name}</b><small>{km(s.km)} · {s.op}</small><em className={s.free ? '' : 'is-busy'}>{status(s, false)}</em></div>
                  </div>
                ))}
                <span className="lp-cp-btn">{k.route}</span>
              </div>
            </>
          ) : (
            <>
              <div className="lp-aa-rail"><span className="lp-aa-time">9:41</span><span className="lp-aa-ic lp-aa-nav" /><span className="lp-aa-ic is-on"><LogoMark size={26} /></span><span className="lp-aa-ic lp-aa-media" /><span className="lp-aa-ic lp-aa-dots" /></div>
              <div className="lp-aa-panel">
                <div className="lp-aa-head"><LogoMark size={22} /><b>{k.aaTitle}</b><span>{k.refresh}</span></div>
                {CAR_STATIONS.map((s, i) => (
                  <div key={i} className="lp-aa-row">
                    <span className={`lp-aa-mark ${s.free ? '' : 'is-busy'}`}>{i + 1}</span>
                    <div><b>{s.name}</b><small><strong>{km(s.km)}</strong>  ·  {s.op}</small><em>{status(s, true)}</em></div>
                  </div>
                ))}
              </div>
              <div className="lp-car-map lp-aa-map">
                {CAR_STATIONS.map((s, i) => <span key={i} className={`lp-car-pin lp-aa-pin ${s.free ? '' : 'is-busy'}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>{i + 1}</span>)}
                <span className="lp-car-me" style={{ left: '40%', top: '58%' }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Devices({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const d = c.devices;
  return (
    <section className="lp-sec" id="devices">
      <div className="lp-wrap">
        <SectionHead kicker={d.kicker} title={d.title} sub={d.sub} />
        <div className="lp-scene rv">
          <div className="lp-scene-copy">
            <h3>{d.android.t}</h3>
            <p>{d.android.d}</p>
          </div>
          <AndroidLock c={c} />
        </div>
        <div className="lp-scene is-flip rv">
          <div className="lp-scene-copy">
            <h3>{d.ios.t}</h3>
            <p>{d.ios.d}</p>
            <h4>{d.kinds.title}</h4>
            <ul className="lp-kinds">
              {d.kinds.items.map((it, i) => <li key={i}><b>{it.t}</b><span>{it.d}</span></li>)}
            </ul>
          </div>
          <IphoneLock c={c} />
        </div>
        <div className="lp-scene lp-scene-car rv">
          <div className="lp-scene-copy">
            <h3>{d.car.t}</h3>
            <p>{d.car.d}</p>
            <p className="lp-scene-soon"><Clock size={16} />{d.car.soon}</p>
          </div>
          <CarScreen c={c} lang={lang} />
        </div>
      </div>
    </section>
  );
}

function GuidePage({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const g = c.guide;
  return (
    <>
      <PageHead kicker={g.kicker} title={g.title} sub={g.sub} />
      <GuideSteps c={c} lang={lang} />
      <Devices c={c} lang={lang} />
      <Cta c={c} />
    </>
  );
}

const MAILBOXES = ['info', 'partners', 'business', 'support', 'hr'] as const;

function AboutPage({ c }: { c: LandingCopy }) {
  const a = c.about;
  const p = c.pages.about;
  return (
    <>
      <PageHead kicker={p.kicker} title={p.title} sub={p.sub} />
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-mission">
          <div className="rv"><Kicker>{a.mission.kicker}</Kicker></div>
          <h2 className="lp-h2 rv" style={delay(60)}>{a.mission.title}</h2>
          <p className="rv" style={delay(140)}>{a.mission.text}</p>
        </div>
        <div className="lp-wrap">
          <dl className="lp-facts">
            {a.facts.map((f, i) => <div key={i} className="rv" style={delay(i * 80)}><dd>{f.n}</dd><dt>{f.t}</dt></div>)}
          </dl>
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="rv"><Kicker>{a.principles.kicker}</Kicker></div>
          <ol className="lp-benefits lp-benefits-mt">
            {a.principles.items.map((it, i) => (
              <li key={i} className="rv" style={delay((i % 2) * 100)}>
                <span className="lp-benefits-n">{String(i + 1).padStart(2, '0')}</span>
                <h2>{it.t}</h2>
                <p>{it.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="lp-sec" id="contacts">
        <div className="lp-wrap">
          <SectionHead kicker={a.contacts.kicker} title={a.contacts.title} sub={a.contacts.sub} />
          <div className="lp-next">
            {MAILBOXES.map((k, i) => (
              <a key={k} href={`mailto:${BRAND.emails[k]}`} className="lp-next-row lp-mail-row rv" style={delay(i * 70)}>
                <span className="lp-next-t">{c.footer.mail[k]}</span>
                <span className="lp-next-d">{BRAND.emails[k]}</span>
                <span className="lp-next-go"><Mail size={24} /></span>
              </a>
            ))}
          </div>
        </div>
      </section>
      <Cta c={c} />
    </>
  );
}

function JoinPage({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <div className="lp-joinpage">
      <div className="lp-hero-bg" aria-hidden="true"><span className="lp-blob lp-blob-a" /></div>
      <Join c={c} lang={lang} privacyHref={legalHref('privacy')} />
      <div className="lp-wrap">
        <div className="lp-stores rv">
          <p>{c.app.title}</p>
          <span className="lp-store" aria-disabled="true"><Apple size={22} /><span><small>{c.app.soon}</small>App Store</span></span>
          <span className="lp-store" aria-disabled="true"><Play size={20} /><span><small>{c.app.soon}</small>Google Play</span></span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── CTA + footer ─────────────────────────

function Cta({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec lp-cta-sec">
      <div className="lp-wrap">
        <div className="lp-cta rv">
          <span className="lp-cta-ring" aria-hidden="true" />
          <span className="lp-cta-ring is-2" aria-hidden="true" />
          <LogoMark size={64} />
          <h2 className="lp-cta-t">{c.cta.title}</h2>
          <p className="lp-cta-sub">{c.cta.sub}</p>
          <div className="lp-hero-cta">
            <PageLink to="join" className="lp-btn lp-btn-dark lp-btn-lg">{c.cta.join}<ArrowRight size={18} /></PageLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ c }: { c: LandingCopy }) {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-in">
        <div className="lp-footer-brand">
          <Logo size={34} />
          <p>{c.footer.about}</p>
          <LangPills />
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.pages}</p>
          {(['home', 'drivers', 'networks', 'prices', 'guide', 'faq', 'about', 'join'] as Page[]).map(p => <PageLink key={p} to={p}>{c.nav[p]}</PageLink>)}
          {CITY_IDS.map(p => <PageLink key={p} to={p}>{c.nav[p]}</PageLink>)}
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.company}</p>
          {(['info', 'partners', 'business', 'support', 'hr'] as const).map(k => (
            <a key={k} href={`mailto:${BRAND.emails[k]}`}><Send size={14} /><span>{c.footer.mail[k]}<span className="lp-footer-muted"> · {BRAND.emails[k]}</span></span></a>
          ))}
          {LEGAL_IDS.map(d => <a key={d} href={legalHref(d)}><ScrollText size={14} />{c.legal[d]}</a>)}
        </div>
      </div>
      <div className="lp-wrap lp-footer-base">
        <span>© {new Date().getFullYear()} {BRAND.name}. {c.footer.rights}</span>
        <span>{c.footer.demo}</span>
      </div>
      <p className="lp-footer-giant" aria-hidden="true">{BRAND.name}</p>
    </footer>
  );
}

// ───────────────────────── Shell ─────────────────────────

export default function Landing() {
  const { lang } = useI18n();
  const c = COPY[lang] ?? COPY.ru;
  const [page, setPage] = useState<Page>(pageFromUrl);
  const [doc, setDoc] = useState(docFromUrl);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [vt] = useState(canTransition);
  // The charging opening plays once a visit, on the front page only.
  const [intro, setIntro] = useState(() => pageFromUrl() === 'home' && !docFromUrl() && loadIntroDue());
  const fc = useForecast();
  useReveal(root, `${lang}:${page}:${doc}`);

  /** Swaps to the page in the URL, through a view transition when there is one. */
  const show = useCallback((p: Page, d: LegalDocId | null) => {
    const apply = () => {
      flushSync(() => { setPage(p); setDoc(d); });
      if (root) root.scrollTop = 0;
    };
    if (canTransition()) (document as ViewTransitionDoc).startViewTransition!(apply);
    else apply();
  }, [root]);

  const go = useCallback((p: Page) => {
    if (p === page && !doc) {
      root?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.history.pushState({ page: p }, '', PATHS[p]);
    track('page', { page: p });
    show(p, null);
  }, [page, doc, root, show]);

  useEffect(() => {
    const onPop = () => show(pageFromUrl(), docFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [show]);

  useEffect(() => {
    if (!root) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = Math.max(root.scrollHeight - root.clientHeight, 1);
        root.style.setProperty('--progress', String(root.scrollTop / max));
        root.style.setProperty('--sy', `${Math.min(root.scrollTop, 900)}px`);
        setScrolled(root.scrollTop > 24);
      });
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => { root.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [root, page]);

  useEffect(() => {
    const prev = document.title;
    const name = doc ? c.legal[doc] : page === 'home' ? null : isCity(page) ? fill(c.cityPage.title, { in: c.cityPage.in[page] }) : c.nav[page];
    document.title = name ? `${name} — ${BRAND.name}` : c.meta.title;
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = desc?.content;
    if (desc) desc.content = !doc && isCity(page) ? fill(c.cityPage.sub, { in: c.cityPage.in[page] }) : c.network.meta;
    // FAQPage structured data, so search results can show the answers.
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: BRAND.name, url: `https://${BRAND.domain}`, logo: `https://${BRAND.domain}/icon-512.png`, areaServed: 'UZ', slogan: BRAND.tagline },
        ...(!doc && isCity(page) ? [{ '@type': 'FAQPage', inLanguage: lang, mainEntity: c.cityPage.faq.map(f => ({ '@type': 'Question', name: fill(f.q, { in: c.cityPage.in[page] }), acceptedAnswer: { '@type': 'Answer', text: fill(f.a, { in: c.cityPage.in[page] }) } })) }] : []),
        ...(page === 'faq' ? [{ '@type': 'FAQPage', inLanguage: lang, mainEntity: c.faq.groups.flatMap(g => g.items).map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
      ],
    });
    document.head.appendChild(ld);
    // One address per language for search engines: Russian at the plain path, the others with ?lang=.
    const path = `https://${BRAND.domain}${PATHS[page]}`;
    const at = (l: Lang) => (l === 'ru' ? path : `${path}?lang=${l}`);
    const links = [
      Object.assign(document.createElement('link'), { rel: 'canonical', href: at(lang) }),
      ...(['ru', 'uz', 'en'] as Lang[]).map(l => Object.assign(document.createElement('link'), { rel: 'alternate', hreflang: l, href: at(l) })),
      Object.assign(document.createElement('link'), { rel: 'alternate', hreflang: 'x-default', href: path }),
    ];
    if (!doc) links.forEach(l => document.head.appendChild(l));
    document.documentElement.lang = lang;
    return () => {
      document.title = prev;
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
      ld.remove();
      links.forEach(l => l.remove());
    };
  }, [c, lang, page, doc]);

  return (
    <GoCtx.Provider value={go}>
      <div ref={setRoot} className={`lp ${vt ? 'has-vt' : ''}`} data-no-translate>
        <div className="lp-progress" aria-hidden="true" />
        <Nav c={c} page={doc ? null : page} scrolled={scrolled || !!doc} />
        <main key={doc ?? page} className="lp-main">
          {doc ? <LegalPage c={c} id={doc} />
            : page === 'drivers' ? <DriversPage c={c} lang={lang} fc={fc} />
            : page === 'networks' ? <NetworksPage c={c} />
            : page === 'prices' ? <PricesPage c={c} lang={lang} fc={fc} />
            : page === 'guide' ? <GuidePage c={c} lang={lang} />
            : page === 'faq' ? <FaqPage c={c} />
            : page === 'about' ? <AboutPage c={c} />
            : page === 'join' ? <JoinPage c={c} lang={lang} />
            : isCity(page) ? <CityPage c={c} lang={lang} id={page} />
            : <HomePage key={intro ? 'behind' : 'in'} c={c} lang={lang} />}
        </main>
        <Footer c={c} />
        {intro && <LoadIntro lang={lang} onDone={() => setIntro(false)} />}
      </div>
    </GoCtx.Provider>
  );
}

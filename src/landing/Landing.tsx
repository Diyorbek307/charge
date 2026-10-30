import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowRight, ArrowUpRight, BellRing, CalendarClock, Check, Clock, CircleDollarSign, Gift, Handshake, HeartPulse,
  Layers, Map as MapIcon, Menu, Minus, Moon, Navigation, Plug, QrCode, ScanLine, ScrollText, Send, Siren, Sparkles,
  Car, Apple, Play, WifiOff, X, Zap,
} from 'lucide-react';
import { useI18n, LANGS, type Lang } from '../lib/i18n';
import { useSync } from '../lib/sync';
import { apiClient, type Station, type TariffForecast, type TariffHour } from '../lib/api';
import { BRAND } from '../brand';
import { COPY, CARS, type LandingCopy } from './content';
import { Logo, LogoMark } from './Logo';
import HeroMap from './HeroCanvas';
import type { SceneStation } from './heroScene';
import Join from './Join';
import LegalPage, { LEGAL_IDS, legalHref } from './LegalPage';
import type { LegalDocId } from './legal';
import { track } from './analytics';
import './landing.css';

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
export type Page = 'home' | 'drivers' | 'networks' | 'prices' | 'faq' | 'join';
const PATHS: Record<Page, string> = { home: '/', drivers: '/drivers', networks: '/networks', prices: '/prices', faq: '/faq', join: '/join' };
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

const NAV_PAGES: Page[] = ['drivers', 'networks', 'prices', 'faq'];

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
  const { state } = useSync();
  const go = useContext(GoCtx);
  const stations = useMemo<SceneStation[]>(
    () =>
      (state?.stations ?? [])
        .filter(s => typeof s.geoLat === 'number' && typeof s.geoLng === 'number')
        .map(s => ({
          id: s.id,
          lat: s.geoLat as number,
          lng: s.geoLng as number,
          power: s.totalPower ?? Math.max(...s.connectors.map(k => k.power)),
          free: s.connectors.filter(k => k.status === 'available').length,
          total: s.connectors.length,
        })),
    [state?.stations],
  );
  const cities = useMemo(
    () => (['tashkent', 'samarkand', 'bukhara', 'khiva', 'nukus', 'fergana', 'termez', 'namangan', 'karshi', 'navoi'] as const)
      .map(id => ({ id, name: c.cities[id], major: id === 'tashkent' || id === 'samarkand' || id === 'bukhara' || id === 'khiva' })),
    [c],
  );
  const st = state?.stats;
  const renderTip = useCallback(
    (id: string) => {
      const s = state?.stations.find(x => x.id === id);
      if (!s) return null;
      const free = s.connectors.filter(k => k.status === 'available').length;
      return (
        <>
          <b>{s.name}</b>
          <span>{s.city} · {s.operator}</span>
          <span className="lp-tip-row">
            <em className={free ? 'is-free' : 'is-full'}>{free}/{s.connectors.length} {c.network.freeOf}</em>
            <em>{Math.max(...s.connectors.map(k => k.power))} {c.phone.kw}</em>
          </span>
        </>
      );
    },
    [state?.stations, c],
  );

  return (
    <section className="lp-hero" id="top">
      <div className="lp-hero-bg" aria-hidden="true">
        <span className="lp-blob lp-blob-a" />
        <span className="lp-blob lp-blob-b" />
        <span className="lp-hero-grid" />
      </div>
      <div className="lp-wrap lp-hero-in">
        <div className="lp-hero-copy">
          <p className="lp-badge rv"><span className="lp-dot" />{c.hero.badge}</p>
          <h1 className="lp-h1">
            {c.hero.title.map((line, i) => (
              <span key={i} className="lp-h1-line">
                <span className="lp-h1-in" style={delay(120 + i * 110)}>{i === 1 ? <mark className="lp-h1-mark">{line}</mark> : line}</span>
              </span>
            ))}
          </h1>
          <p className="lp-hero-sub rv" style={delay(420)}>{c.hero.sub}</p>
          <div className="lp-hero-cta rv" style={delay(520)}>
            <PageLink to="join" className="lp-btn lp-btn-primary lp-btn-lg"><BellRing size={18} />{c.cta.join}</PageLink>
            <PageLink to="drivers" className="lp-btn lp-btn-ghost lp-btn-lg">{c.hero.secondary}<ArrowRight size={18} /></PageLink>
          </div>
          <dl className="lp-hero-stats rv" style={delay(620)} aria-live="polite">
            <div><dt>{c.hero.stations}</dt><dd><Count value={st?.stations ?? 0} lang={lang} /></dd></div>
            <div><dt>{c.hero.connectors}</dt><dd><Count value={st?.evseTotal ?? 0} lang={lang} /></dd></div>
            <div><dt>{c.hero.online}</dt><dd><Count value={st?.availability ?? 0} decimals={1} lang={lang} /><small>%</small></dd></div>
          </dl>
          <p className="lp-live rv" style={delay(680)}><span className="lp-dot" />{c.hero.live}</p>
        </div>
        <div className="lp-hero-art rv" style={delay(200)}>
          <div className="lp-map-card">
            <p className="lp-map-label"><Layers size={14} />{c.hero.map}</p>
            <HeroMap stations={stations} cities={cities} renderTip={renderTip} onPick={() => go('drivers')} />
          </div>
          <div className="lp-chip lp-chip-a"><span className="lp-chip-ic"><Clock size={16} /></span><span><small>{c.hero.chips.arrive}</small><b>{c.hero.chips.arriveV}</b></span></div>
          <div className="lp-chip lp-chip-b"><span className="lp-chip-ic is-dark"><Moon size={16} /></span><span><small>{c.hero.chips.night}</small><b>{c.hero.chips.nightV}</b></span></div>
          <div className="lp-chip lp-chip-c"><span className="lp-chip-ic"><CircleDollarSign size={16} /></span><span><small>{c.hero.chips.price}</small><b>{c.hero.chips.priceV}</b></span></div>
        </div>
      </div>
    </section>
  );
}

function Marquee({ c }: { c: LandingCopy }) {
  const row = c.marquee.flatMap((w, i) => [
    <span key={`w${i}`} className="lp-mq-w">{w}</span>,
    <span key={`s${i}`} className="lp-mq-s" aria-hidden="true"><Zap size={22} /></span>,
  ]);
  return (
    <div className="lp-mq" aria-label={c.marquee.join(' · ')}>
      <div className="lp-mq-track" aria-hidden="true">
        <div>{row}</div>
        <div>{row}</div>
      </div>
    </div>
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

function How({ c }: { c: LandingCopy }) {
  const icons = [<MapIcon key="m" size={26} />, <Plug key="p" size={26} />, <Car key="c" size={26} />];
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <SectionHead kicker={c.how.kicker} title={c.how.title} center />
        <ol className="lp-steps">
          {c.how.steps.map((s, i) => (
            <li key={i} className="rv" style={delay(i * 140)}>
              <span className="lp-step-ic">{icons[i]}</span>
              <span className="lp-step-n">{i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Big typographic links to the inner pages. */
function NextPages({ c }: { c: LandingCopy }) {
  const items: Page[] = ['drivers', 'networks', 'prices'];
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <div className="rv"><Kicker>{c.next.kicker}</Kicker></div>
        <nav className="lp-next" aria-label={c.next.kicker}>
          {items.map((p, i) => {
            const it = c.next.items[p as 'drivers' | 'networks' | 'prices'];
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
      <Marquee c={c} />
      <Pains c={c} />
      <How c={c} />
      <NextPages c={c} />
      <Cta c={c} />
    </>
  );
}

// ───────────────────────── Drivers ─────────────────────────

const PILLAR_ICON: Record<string, ReactNode> = {
  find: <MapIcon size={22} />, charge: <ScanLine size={22} />, road: <Navigation size={22} />, care: <Sparkles size={22} />,
};

function PillarVisual({ id, ui }: { id: string; ui: string[] }) {
  if (id === 'find')
    return (
      <div className="lp-pv lp-pv-find">
        <svg viewBox="0 0 320 240" className="lp-pv-roads" preserveAspectRatio="xMidYMid slice">
          <path d="M-10 60 C80 70 140 20 330 50" />
          <path d="M-10 170 C90 150 170 210 330 180" />
          <path d="M90 -10 C100 80 70 160 110 250" />
          <path d="M230 -10 C210 90 250 170 220 250" />
          <path d="M38 206 C70 196 92 178 96 150 S 104 104 150 96 S 216 66 226 44" className="lp-pv-route" />
        </svg>
        {[[18, 22, 1], [46, 30, 0], [30, 62, 1], [82, 55, 0], [58, 70, 1]].map(([x, y, f], i) => (
          <span key={i} className={`lp-pv-pin ${f ? 'is-free' : ''}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.3}s` }}><Zap size={11} /></span>
        ))}
        <span className="lp-pv-me" style={{ left: '12%', top: '86%' }} />
        <span className="lp-pv-pin is-free is-target" style={{ left: '70.6%', top: '18.3%' }}><Zap size={11} /></span>
        <div className="lp-pv-card">
          <span className="lp-pv-badge"><Check size={13} strokeWidth={3} />{ui[0]}</span>
          <b>{ui[1]}</b>
          <small>{ui[2]}</small>
        </div>
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

function DriversPage({ c, lang, fc }: { c: LandingCopy; lang: Lang; fc: TariffForecast }) {
  const p = c.pages.drivers;
  return (
    <>
      <PageHead kicker={p.kicker} title={p.title} sub={p.sub} />
      <Pillars c={c} />
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
                {p.steps.map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}
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
        <div className="lp-wrap lp-faq-list">
          {c.faq.items.map((f, i) => (
            <details key={i} className="lp-faq-item rv" style={delay((i % 5) * 50)} open={i === 0}>
              <summary>{f.q}<span className="lp-faq-plus" aria-hidden="true" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
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
            <PageLink to="join" className="lp-btn lp-btn-dark lp-btn-lg"><BellRing size={18} />{c.cta.join}</PageLink>
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
          {(['home', 'drivers', 'networks', 'prices', 'faq', 'join'] as Page[]).map(p => <PageLink key={p} to={p}>{c.nav[p]}</PageLink>)}
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
    const name = doc ? c.legal[doc] : page === 'home' ? null : c.nav[page];
    document.title = name ? `${name} — ${BRAND.name}` : c.meta.title;
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = desc?.content;
    if (desc) desc.content = c.network.meta;
    // FAQPage structured data, so search results can show the answers.
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: BRAND.name, url: `https://${BRAND.domain}`, logo: `https://${BRAND.domain}/icon-512.png`, areaServed: 'UZ', slogan: BRAND.tagline },
        ...(page === 'faq' ? [{ '@type': 'FAQPage', inLanguage: lang, mainEntity: c.faq.items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
      ],
    });
    document.head.appendChild(ld);
    return () => {
      document.title = prev;
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
      ld.remove();
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
            : page === 'faq' ? <FaqPage c={c} />
            : page === 'join' ? <JoinPage c={c} lang={lang} />
            : <HomePage c={c} lang={lang} />}
        </main>
        <Footer c={c} />
      </div>
    </GoCtx.Provider>
  );
}

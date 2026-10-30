import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, BatteryCharging, BellRing, CalendarClock, Check, ChevronDown, Columns2, Moon,
  Map as MapIcon, Menu, Minus, Navigation, Network, QrCode, Route, ScanLine, Server, Smartphone,
  Wallet, X, Zap, Car, Building2, Code2, Apple, Play, ScrollText, ShieldCheck, Sparkles, Handshake,
  Layers, Clock, CircleDollarSign, Users, Wifi, WifiOff, Siren, Gift, HeartPulse, Coins, Plug, Send,
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

export type LandingTarget = 'driver' | 'operator' | 'admin' | 'business' | 'api' | 'architecture';

const fmt = (n: number, lang: Lang) =>
  Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU').replace(/,/g, lang === 'en' ? ',' : ' ');

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

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
      // The huge top margin also reveals anything jumped past via an anchor link.
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

function Nav({ c, scrolled, base }: { c: LandingCopy; scrolled: boolean; base: string }) {
  const [open, setOpen] = useState(false);
  const links = [
    ['#gives', c.nav.drivers],
    ['#network', c.nav.map],
    ['#pricing', c.nav.pricing],
    ['#partners', c.nav.partners],
    ['#compare', c.nav.compare],
    ['#faq', c.nav.faq],
    ['#join', c.nav.join],
  ].map(([h, l]) => [base + h, l] as const);
  return (
    <header className={`lp-nav ${scrolled ? 'is-solid' : ''} ${open ? 'is-open' : ''}`}>
      <div className="lp-wrap lp-nav-in">
        <a href={base ? '/' : '#top'} className="lp-nav-logo" aria-label={BRAND.name}><Logo /></a>
        <nav className="lp-nav-links" aria-label="Main">
          {links.map(([h, l], i) => <a key={i} href={h}>{l}</a>)}
        </nav>
        <div className="lp-nav-right">
          <LangPills />
          <a className="lp-btn lp-btn-dark lp-btn-sm lp-hide-sm" href={`${base}#join`}>
            {c.nav.join}<ArrowRight size={15} />
          </a>
          <button className="lp-burger" aria-label={open ? c.nav.close : c.nav.menu} aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="lp-sheet">
          {links.map(([h, l], i) => <a key={i} href={h} onClick={() => setOpen(false)}>{l}</a>)}
          <a className="lp-btn lp-btn-dark" href={`${base}#join`} onClick={() => setOpen(false)}>
            {c.nav.join}<ArrowRight size={16} />
          </a>
        </div>
      )}
    </header>
  );
}

// ───────────────────────── Hero ─────────────────────────

function Hero({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const { state } = useSync();
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
              <span key={i} className={`lp-h1-line ${i === 1 ? 'is-mark' : ''}`}>
                <span className="lp-h1-in" style={delay(120 + i * 110)}>{i === 1 ? <mark className="lp-h1-mark">{line}</mark> : line}</span>
              </span>
            ))}
          </h1>
          <p className="lp-hero-sub rv" style={delay(420)}>{c.hero.sub}</p>
          <div className="lp-hero-cta rv" style={delay(520)}>
            <a className="lp-btn lp-btn-primary lp-btn-lg" href="#join">
              <Zap size={18} />{c.cta.join}
            </a>
            <a className="lp-btn lp-btn-ghost lp-btn-lg" href="#gives">{c.hero.secondary}<ChevronDown size={18} /></a>
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
            <HeroMap stations={stations} cities={cities} renderTip={renderTip} onPick={() => document.getElementById('network')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
          <div className="lp-chip lp-chip-a"><span className="lp-chip-ic"><Clock size={16} /></span><span><small>{c.hero.chips.arrive}</small><b>{c.hero.chips.arriveV}</b></span></div>
          <div className="lp-chip lp-chip-b"><span className="lp-chip-ic is-dark"><Moon size={16} /></span><span><small>{c.hero.chips.night}</small><b>{c.hero.chips.nightV}</b></span></div>
          <div className="lp-chip lp-chip-c"><span className="lp-chip-ic"><CircleDollarSign size={16} /></span><span><small>{c.hero.chips.price}</small><b>{c.hero.chips.priceV}</b></span></div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Marquee ─────────────────────────

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

// ───────────────────────── Pains ─────────────────────────

const PAIN_ICON = [<Layers key={0} size={24} />, <Clock key={1} size={24} />, <CircleDollarSign key={2} size={24} />, <Route key={3} size={24} />, <Users key={4} size={24} />, <Moon key={5} size={24} />];

function Pains({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec" id="pains">
      <div className="lp-wrap">
        <SectionHead kicker={c.pains.kicker} title={c.pains.title} sub={c.pains.sub} />
        <div className="lp-pains">
          {c.pains.items.map((it, i) => (
            <article key={i} className="lp-pain rv" style={delay((i % 3) * 90)}>
              <div className="lp-pain-top">
                <span className="lp-pain-ic">{PAIN_ICON[i]}</span>
                <span className="lp-pain-n">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3>{it.t}</h3>
              <p>{it.d}</p>
            </article>
          ))}
        </div>
        <a href="#gives" className="lp-answer rv">
          <LogoMark size={40} />
          <span>{c.pains.answer}</span>
          <ArrowRight size={26} />
        </a>
      </div>
    </section>
  );
}

// ───────────────────────── What Voli gives ─────────────────────────

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

function Gives({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec lp-gives-sec" id="gives">
      <div className="lp-wrap">
        <SectionHead kicker={c.gives.kicker} title={c.gives.title} sub={c.gives.sub} />
        <div className="lp-pillars">
          {c.gives.pillars.map((p, i) => (
            <article key={p.id} className={`lp-pillar lp-pillar-${p.id} ${i % 2 ? 'is-flip' : ''}`}>
              <div className="lp-pillar-copy rv">
                <p className="lp-pillar-n"><span className="lp-pillar-ic">{PILLAR_ICON[p.id]}</span>{p.n}</p>
                <h3 className="lp-h3">{p.t}</h3>
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
      </div>
    </section>
  );
}

// ───────────────────────── How ─────────────────────────

function How({ c }: { c: LandingCopy }) {
  const icons = [<MapIcon key="m" size={26} />, <Plug key="p" size={26} />, <Car key="c" size={26} />];
  return (
    <section className="lp-sec lp-how-sec" id="how">
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

// ───────────────────────── Live network ─────────────────────────

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
          <div>
            <div className="lp-net-bar rv">
              <div className="lp-chips" role="group" aria-label={c.network.kicker}>
                {(['all', 'free', 'fast'] as const).map(f => (
                  <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{c.network.filters[f]}</button>
                ))}
              </div>
            </div>
            <div className="lp-net-grid">
              {shown.map(st => {
                const free = st.connectors.filter(k => k.status === 'available').length;
                const min = Math.min(...st.connectors.map(k => k.price));
                return (
                  <article key={st.id} className="lp-card lp-st">
                    <div className="lp-st-head">
                      <div>
                        <h3>{st.name}</h3>
                        <p>{st.city} · {st.operator}</p>
                      </div>
                      <span className={`lp-st-free ${free ? 'is-free' : 'is-full'}`}>{free}/{st.connectors.length} {c.network.freeOf}</span>
                    </div>
                    <ul className="lp-st-conns">
                      {st.connectors.map(k => (
                        <li key={k.id} className={`is-${k.status}`}>
                          <i />
                          <span>{k.type}</span>
                          <b>{k.power} {c.phone.kw}</b>
                          <em>{c.network.status[k.status]}</em>
                        </li>
                      ))}
                    </ul>
                    <div className="lp-st-foot">
                      <span>
                        <b>{fmt(min * fc.current.multiplier, lang)}</b> {c.network.perKwh}
                        {fc.current.multiplier !== 1 && <small className={`is-${fc.current.band}`}>×{fc.current.multiplier}</small>}
                      </span>
                    </div>
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

// ───────────────────────── Pricing: night rate + calculator ─────────────────────────

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
          <h3 className="lp-h3">{c.green.title}</h3>
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
      <h3 className="lp-h3">{c.calc.title}</h3>
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

function Pricing({ c, lang, fc }: { c: LandingCopy; lang: Lang; fc: TariffForecast }) {
  return (
    <section className="lp-sec" id="pricing">
      <div className="lp-wrap lp-pricing">
        <GreenHours c={c} fc={fc} />
        <Calculator c={c} lang={lang} />
      </div>
    </section>
  );
}

// ───────────────────────── Partners ─────────────────────────

const PARTNER_ICON = [<ShieldCheck key={0} size={24} />, <Coins key={1} size={24} />, <Users key={2} size={24} />, <Handshake key={3} size={24} />];

function Partners({ c }: { c: LandingCopy }) {
  const p = c.partners;
  return (
    <section className="lp-sec" id="partners">
      <div className="lp-wrap">
        <div className="lp-partners rv">
          <span className="lp-partners-bolt" aria-hidden="true"><LogoMark size={420} /></span>
          <div className="lp-partners-head">
            <Kicker>{p.kicker}</Kicker>
            <h2 className="lp-h2">{p.title}</h2>
            <p className="lp-sub">{p.sub}</p>
          </div>
          <div className="lp-partners-grid">
            {p.items.map((it, i) => (
              <div key={i} className="lp-partner rv" style={delay(i * 90)}>
                <span className="lp-partner-ic">{PARTNER_ICON[i]}</span>
                <h3>{it.t}</h3>
                <p>{it.d}</p>
              </div>
            ))}
          </div>
          <div className="lp-partners-foot">
            <div className="lp-market rv">
              <p className="lp-market-t">{p.market.title}</p>
              <dl>
                {p.market.items.map((m, i) => <div key={i}><dd>{m.n}</dd><dt>{m.t}</dt></div>)}
              </dl>
            </div>
            <ol className="lp-psteps rv" style={delay(120)}>
              {p.steps.map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}
            </ol>
            <a href="#join" className="lp-btn lp-btn-primary lp-btn-lg rv" style={delay(200)}><Handshake size={18} />{p.cta}<ArrowRight size={18} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Compare ─────────────────────────

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
        <div className="lp-card lp-compare rv">
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

// ───────────────────────── Phone mock (app section) ─────────────────────────

function Phone({ c }: { c: LandingCopy }) {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-screen">
        <div className="lp-phone-notch" />
        <div className="lp-pm-charge">
          <p className="lp-pm-near">{c.phone.charging}</p>
          <div className="lp-pm-ring">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" className="lp-pm-ring-bg" />
              <circle cx="60" cy="60" r="50" className="lp-pm-ring-fg" />
            </svg>
            <div className="lp-pm-pct"><BatteryCharging size={16} /><b>72%</b></div>
          </div>
          <div className="lp-pm-kv">
            <div><b>34.6</b><span>{c.phone.added}</span></div>
            <div><b>41 520</b><span>{c.phone.cost}</span></div>
            <div><b>12</b><span>{c.phone.left}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppSection({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <div className="lp-app rv">
          <div className="lp-app-copy">
            <Kicker>{c.app.kicker}</Kicker>
            <h2 className="lp-h2">{c.app.title}</h2>
            <p className="lp-sub">{c.app.sub}</p>
            <div className="lp-stores">
              <span className="lp-store" aria-disabled="true"><Apple size={22} /><span><small>{c.app.soon}</small>App Store</span></span>
              <span className="lp-store" aria-disabled="true"><Play size={20} /><span><small>{c.app.soon}</small>Google Play</span></span>
            </div>
          </div>
          <div className="lp-app-phone"><Phone c={c} /></div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── FAQ ─────────────────────────

function Faq({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec" id="faq">
      <div className="lp-wrap lp-faq">
        <SectionHead kicker={c.faq.kicker} title={c.faq.title} />
        <div className="lp-faq-list">
          {c.faq.items.map((f, i) => (
            <details key={i} className="lp-faq-item rv" style={delay((i % 5) * 50)} open={i === 0}>
              <summary>{f.q}<span className="lp-faq-plus" aria-hidden="true" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
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
            <a className="lp-btn lp-btn-dark lp-btn-lg" href="#join"><BellRing size={18} />{c.cta.join}</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ c, base }: { c: LandingCopy; base: string }) {
  const L = c.footer.links;
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-in">
        <div className="lp-footer-brand">
          <Logo size={34} />
          <p>{c.footer.about}</p>
          <LangPills />
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.product}</p>
          <a href={`${base}#gives`}><Car size={14} />{L.drivers}</a>
          <a href={`${base}#network`}><Server size={14} />{c.nav.map}</a>
          <a href={`${base}#pricing`}><Wallet size={14} />{c.nav.pricing}</a>
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.platform}</p>
          <a href={`${base}#partners`}><Handshake size={14} />{L.partners}</a>
          <a href={`${base}#compare`}><Wallet size={14} />{L.compare}</a>
          <a href={`${base}#faq`}><ChevronDown size={14} />{L.faq}</a>
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.company}</p>
          <a href={`mailto:${BRAND.email}`}><Send size={14} />{L.contact}</a>
          <span className="lp-footer-muted">{BRAND.email}</span>
          {LEGAL_IDS.map(d => <a key={d} href={legalHref(d)}><ScrollText size={14} />{c.legal[d]}</a>)}
        </div>
      </div>
      <div className="lp-wrap lp-footer-base">
        <span>© {new Date().getFullYear()} {BRAND.name}. {c.footer.rights}</span>
        <span><Wifi size={13} /> {c.footer.demo}</span>
      </div>
      <p className="lp-footer-giant" aria-hidden="true">{BRAND.name}</p>
    </footer>
  );
}

// ───────────────────────── Page ─────────────────────────

/** ?doc=offer|privacy|terms shows a legal document inside the landing shell. */
function docFromUrl(): LegalDocId | null {
  try {
    const d = new URLSearchParams(window.location.search).get('doc');
    return LEGAL_IDS.includes(d as LegalDocId) ? (d as LegalDocId) : null;
  } catch {
    return null;
  }
}

export default function Landing() {
  const { lang } = useI18n();
  const [doc] = useState(docFromUrl);
  const base = doc ? '/' : '';
  const c = COPY[lang] ?? COPY.ru;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const fc = useForecast();
  useReveal(root, lang);

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
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => { root.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [root]);

  useEffect(() => {
    const prev = document.title;
    document.title = c.meta.title;
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
        { '@type': 'FAQPage', inLanguage: lang, mainEntity: c.faq.items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      ],
    });
    document.head.appendChild(ld);
    return () => {
      document.title = prev;
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
      ld.remove();
    };
  }, [c, lang]);

  return (
    <div ref={setRoot} className="lp" data-no-translate>
      <div className="lp-progress" aria-hidden="true" />
      <Nav c={c} scrolled={scrolled || !!doc} base={base} />
      <main>
        {doc ? <LegalPage c={c} id={doc} /> : <>
        <Hero c={c} lang={lang} />
        <Marquee c={c} />
        <Pains c={c} />
        <Gives c={c} />
        <How c={c} />
        <LiveNetwork c={c} lang={lang} fc={fc} />
        <Pricing c={c} lang={lang} fc={fc} />
        <Partners c={c} />
        <Compare c={c} />
        <AppSection c={c} />
        <Join c={c} lang={lang} privacyHref={legalHref('privacy')} />
        <Faq c={c} />
        <Cta c={c} />
        </>}
      </main>
      <Footer c={c} base={base} />
    </div>
  );
}

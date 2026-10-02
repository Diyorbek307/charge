import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, Battery, BellRing, CalendarClock, Check, ChevronDown, Columns2, Leaf, Lock,
  Map as MapIcon, Menu, Minus, Moon, Network, Route, ScanLine, Server, ShieldCheck, Smartphone, Users,
  Wallet, Webhook, X, Zap, Languages, MessageSquareWarning, KeyRound, Car, Building2, Code2, Apple, Play,
} from 'lucide-react';
import { useI18n, LANGS, type Lang } from '../lib/i18n';
import { useSync } from '../lib/sync';
import { apiClient, type TariffForecast, type TariffHour } from '../lib/api';
import { BRAND } from '../brand';
import { COPY, CARS, type LandingCopy } from './content';
import { Logo, LogoMark } from './Logo';
import type { SceneStation } from './heroScene';
import './landing.css';

const HeroCanvas = lazy(() => import('./HeroCanvas'));

export type LandingTarget = 'driver' | 'operator' | 'admin' | 'business' | 'api' | 'architecture';

const fmt = (n: number, lang: Lang) =>
  Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU').replace(/,/g, lang === 'en' ? ',' : ' ');

/** Adds `.in` to every `.rv` element as it scrolls into view. */
function useReveal(root: HTMLElement | null) {
  useEffect(() => {
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('.rv');
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
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [root]);
}

/** Pointer-follow tilt for cards; sets CSS vars the stylesheet turns into a 3D rotation. */
function tilt(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
  el.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
  el.style.setProperty('--mx', `${x * 100}%`);
  el.style.setProperty('--my', `${y * 100}%`);
}
function untilt(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
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
    <div className={`lp-head rv ${center ? 'is-center' : ''}`}>
      <Kicker>{kicker}</Kicker>
      <h2 className="lp-h2">{title}</h2>
      {sub && <p className="lp-sub">{sub}</p>}
    </div>
  );
}

// ───────────────────────── Nav ─────────────────────────

function LangPills() {
  const { lang, setLang } = useI18n();
  return (
    <div role="radiogroup" aria-label="Язык · Til · Language" className="lp-langs">
      {LANGS.map(l => (
        <button key={l.id} role="radio" aria-checked={l.id === lang} title={l.full} onClick={() => setLang(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

function Nav({ c, scrolled, onDemo }: { c: LandingCopy; scrolled: boolean; onDemo: () => void }) {
  const [open, setOpen] = useState(false);
  const links = [
    ['#how', c.nav.drivers],
    ['#platform', c.nav.business],
    ['#platform', c.nav.operators],
    ['#pricing', c.nav.pricing],
    ['#compare', c.nav.compare],
    ['#faq', c.nav.faq],
  ] as const;
  return (
    <header className={`lp-nav ${scrolled ? 'is-solid' : ''} ${open ? 'is-open' : ''}`}>
      <div className="lp-wrap lp-nav-in">
        <a href="#top" className="lp-nav-logo" aria-label={BRAND.name}><Logo /></a>
        <nav className="lp-nav-links" aria-label="Main">
          {links.map(([h, l], i) => <a key={i} href={h}>{l}</a>)}
        </nav>
        <div className="lp-nav-right">
          <LangPills />
          <button className="lp-btn lp-btn-primary lp-btn-sm lp-hide-sm" onClick={onDemo}>
            {c.nav.demo}<ArrowRight size={15} />
          </button>
          <button className="lp-burger" aria-label={open ? c.nav.close : c.nav.menu} aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="lp-sheet">
          {links.map(([h, l], i) => <a key={i} href={h} onClick={() => setOpen(false)}>{l}</a>)}
          <button className="lp-btn lp-btn-primary" onClick={() => { setOpen(false); onDemo(); }}>
            {c.nav.demo}<ArrowRight size={16} />
          </button>
        </div>
      )}
    </header>
  );
}

// ───────────────────────── Hero ─────────────────────────

function HeroPoster() {
  // Shown while three.js loads and as the fallback when WebGL is unavailable.
  return <div className="lp-hero-poster" aria-hidden="true" />;
}

function Hero({ c, lang, scrollEl, onDemo }: { c: LandingCopy; lang: Lang; scrollEl: HTMLElement | null; onDemo: () => void }) {
  const { state } = useSync();
  const [webgl, setWebgl] = useState(true);
  const onFail = useCallback(() => setWebgl(false), []);
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
      .map(id => ({ id, name: c.cities[id], major: id === 'tashkent' || id === 'samarkand' || id === 'bukhara' })),
    [c],
  );
  const st = state?.stats;

  return (
    <section className="lp-hero" id="top">
      <HeroPoster />
      {webgl && (
        <Suspense fallback={null}>
          <HeroCanvas stations={stations} cities={cities} scrollEl={scrollEl} onFail={onFail} />
        </Suspense>
      )}
      <div className="lp-hero-fade" aria-hidden="true" />
      <div className="lp-wrap lp-hero-in">
        <div className="lp-hero-copy">
          <p className="lp-badge rv"><span className="lp-dot" />{c.hero.badge}</p>
          <h1 className="lp-h1 rv">
            <span>{c.hero.title[0]}</span>
            <span className="lp-grad">{c.hero.title[1]}</span>
            <span>{c.hero.title[2]}</span>
          </h1>
          <p className="lp-hero-sub rv">{c.hero.sub}</p>
          <div className="lp-hero-cta rv">
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onDemo}>
              <Zap size={18} />{c.hero.primary}
            </button>
            <a className="lp-btn lp-btn-ghost lp-btn-lg" href="#how">{c.hero.secondary}<ChevronDown size={18} /></a>
          </div>
        </div>
      </div>
      <div className="lp-wrap lp-hero-foot">
        <div className="lp-hero-stats rv" aria-live="polite">
          <p className="lp-live"><span className="lp-dot" />{c.hero.live}</p>
          <dl>
            <div><dt>{c.hero.stations}</dt><dd><Count value={st?.stations ?? 0} lang={lang} /></dd></div>
            <div><dt>{c.hero.connectors}</dt><dd><Count value={st?.evseTotal ?? 0} lang={lang} /></dd></div>
            <div><dt>{c.hero.online}</dt><dd><Count value={st?.availability ?? 0} decimals={1} lang={lang} /><small>%</small></dd></div>
            <div><dt>{c.hero.energy}</dt><dd><Count value={st?.energyToday ?? 0} lang={lang} /></dd></div>
          </dl>
        </div>
      </div>
      <a href="#strip" className="lp-scroll" aria-label={c.hero.scroll}><span /></a>
    </section>
  );
}

// ───────────────────────── Strip ─────────────────────────

function Strip({ c }: { c: LandingCopy }) {
  const groups: [string, string[]][] = [
    [c.strip.pay, ['Payme', 'Click', 'Humo', 'Uzcard', 'Visa', 'Mastercard']],
    [c.strip.standards, ['OCPP 1.6-J', 'CCS2', 'Type 2', 'CHAdeMO', 'REST API', 'HMAC Webhooks', 'TOTP 2FA', 'PWA']],
    [c.strip.langs, ["O‘zbekcha", 'Русский', 'English']],
  ];
  const row = groups.flatMap(([g, items]) => [
    <span key={`g-${g}`} className="lp-strip-g">{g}</span>,
    ...items.map(i => <span key={`${g}-${i}`} className="lp-strip-i">{i}</span>),
  ]);
  return (
    <div className="lp-strip" id="strip">
      <div className="lp-strip-track">
        <div>{row}</div>
        <div aria-hidden="true">{row}</div>
      </div>
    </div>
  );
}

// ───────────────────────── Problem ─────────────────────────

function Problem({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec">
      <div className="lp-wrap lp-problem">
        <SectionHead kicker={c.problem.kicker} title={c.problem.title} sub={c.problem.sub} />
        <div className="lp-problem-grid">
          {c.problem.items.map((it, i) => (
            <div key={i} className="lp-card lp-problem-card rv" style={{ '--d': `${i * 90}ms` } as CSSProperties}>
              <p className="lp-problem-n">{it.n}</p>
              <p className="lp-problem-t">{it.t}</p>
              <p className="lp-problem-d">{it.d}</p>
            </div>
          ))}
        </div>
        <p className="lp-answer rv"><LogoMark size={26} id="ans" />{c.problem.answer}</p>
      </div>
    </section>
  );
}

// ───────────────────────── Phone mock ─────────────────────────

function Phone({ c, variant }: { c: LandingCopy; variant: 'map' | 'charge' }) {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-screen">
        <div className="lp-phone-notch" />
        {variant === 'map' ? (
          <div className="lp-pm-map">
            <svg viewBox="0 0 200 300" className="lp-pm-roads">
              <path d="M-10 80 C60 90 90 40 210 60" />
              <path d="M-10 190 C70 170 120 230 210 200" />
              <path d="M60 -10 C70 90 40 180 80 310" />
              <path d="M150 -10 C130 100 170 200 140 310" />
              <path d="M-10 130 L210 140" className="lp-pm-main" />
            </svg>
            {[[28, 22, 1], [62, 35, 0], [40, 55, 1], [74, 62, 1], [20, 72, 0]].map(([x, y, f], i) => (
              <span key={i} className={`lp-pm-pin ${f ? 'is-free' : 'is-busy'}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.4}s` }}>
                <Zap size={10} />
              </span>
            ))}
            <div className="lp-pm-sheet">
              <p className="lp-pm-near">{c.phone.near}</p>
              <p className="lp-pm-name">Toshkent Siti Hub</p>
              <div className="lp-pm-row">
                <span className="lp-pm-chip is-free">2/4 {c.phone.free}</span>
                <span className="lp-pm-chip">150 {c.phone.kw}</span>
                <span className="lp-pm-chip">CCS2</span>
              </div>
              <div className="lp-pm-btn"><Zap size={12} />{c.phone.start}</div>
            </div>
          </div>
        ) : (
          <div className="lp-pm-charge">
            <p className="lp-pm-near">{c.phone.charging}</p>
            <div className="lp-pm-ring">
              <svg viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="pmg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#3BF0C8" />
                    <stop offset="1" stopColor="#FFC857" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="50" className="lp-pm-ring-bg" />
                <circle cx="60" cy="60" r="50" className="lp-pm-ring-fg" stroke="url(#pmg)" />
              </svg>
              <div className="lp-pm-pct"><Battery size={14} /><b>72%</b></div>
            </div>
            <div className="lp-pm-kv">
              <div><b>34.6</b><span>{c.phone.added}</span></div>
              <div><b>41 520</b><span>{c.phone.cost}</span></div>
              <div><b>12</b><span>{c.phone.left}</span></div>
            </div>
            <div className="lp-pm-wave"><span /><span /><span /><span /><span /></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── How ─────────────────────────

function How({ c }: { c: LandingCopy }) {
  const icons = [<MapIcon key="m" size={22} />, <ScanLine key="s" size={22} />, <Wallet key="w" size={22} />];
  return (
    <section className="lp-sec" id="how">
      <div className="lp-wrap lp-how">
        <div className="lp-how-copy">
          <SectionHead kicker={c.how.kicker} title={c.how.title} />
          <ol className="lp-steps">
            {c.how.steps.map((s, i) => (
              <li key={i} className="rv" style={{ '--d': `${i * 110}ms` } as CSSProperties}>
                <span className="lp-step-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="lp-step-ic">{icons[i]}</span>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="lp-how-phones rv">
          <div className="lp-float lp-float-a"><Phone c={c} variant="map" /></div>
          <div className="lp-float lp-float-b"><Phone c={c} variant="charge" /></div>
          <div className="lp-how-glow" />
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Features ─────────────────────────

const FEATURE_ICON: Record<string, ReactNode> = {
  map: <MapIcon size={20} />, queue: <Users size={20} />, book: <CalendarClock size={20} />, green: <Moon size={20} />,
  trip: <Route size={20} />, wallet: <Wallet size={20} />, push: <BellRing size={20} />, eco: <Leaf size={20} />,
  report: <MessageSquareWarning size={20} />, lang: <Languages size={20} />,
};

function FeatureVisual({ id }: { id: string }) {
  if (id === 'map')
    return (
      <div className="lp-fv lp-fv-map">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37) % 92 + 4}%`, top: `${(i * 53) % 80 + 10}%`, animationDelay: `${(i % 6) * 0.35}s` }} className={i % 4 === 0 ? 'is-busy' : ''} />
        ))}
      </div>
    );
  if (id === 'queue')
    return (
      <div className="lp-fv lp-fv-queue">
        {[0, 1, 2, 3].map(i => <span key={i} style={{ animationDelay: `${i * 0.5}s` }}><Car size={14} /></span>)}
        <i><Zap size={14} /></i>
      </div>
    );
  if (id === 'green')
    return (
      <div className="lp-fv lp-fv-bars">
        {[7, 7, 7, 7, 7, 7, 7, 10, 10, 10, 9, 9, 9, 9, 9, 9, 9, 9, 12.5, 12.5, 12.5, 12.5, 10, 7].map((v, i) => (
          <span key={i} style={{ height: `${v * 7}%` }} className={v === 7 ? 'is-g' : v > 11 ? 'is-p' : ''} />
        ))}
      </div>
    );
  return null;
}

function Features({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec" id="features">
      <div className="lp-wrap">
        <SectionHead kicker={c.features.kicker} title={c.features.title} sub={c.features.sub} />
        <div className="lp-bento">
          {c.features.items.map((f, i) => (
            <article
              key={f.id}
              className={`lp-card lp-feat rv lp-feat-${f.id}`}
              style={{ '--d': `${(i % 4) * 70}ms` } as CSSProperties}
              onPointerMove={tilt}
              onPointerLeave={untilt}
            >
              <div className="lp-feat-ic">{FEATURE_ICON[f.id]}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
              <FeatureVisual id={f.id} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Pricing: green hours + calculator ─────────────────────────

function fallbackForecast(): TariffForecast {
  const band = (h: number): TariffHour['band'] =>
    h >= 23 || h < 7 ? 'green' : h < 10 ? 'standard' : h < 18 ? 'day' : 'peak';
  const mult = { green: 0.7, standard: 1, day: 0.9, peak: 1.25 } as const;
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, band: band(h), multiplier: mult[band(h)] }));
  const now = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Tashkent' }).format(new Date())) % 24;
  return { timezone: 'Asia/Tashkent', currentHour: now, current: hours[now], hours, bestWindow: { from: 23, to: 7, multiplier: 0.7, startsInHours: 0 } };
}

function GreenHours({ c }: { c: LandingCopy }) {
  const [fc, setFc] = useState<TariffForecast>(fallbackForecast);
  useEffect(() => {
    let alive = true;
    apiClient.tariffForecast().then(f => alive && setFc(f)).catch(() => {});
    return () => { alive = false; };
  }, []);
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
            <span className={`lp-chart-bar is-${h.band}`} style={{ height: `${(h.multiplier / 1.25) * 100}%` }} />
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
    <div className="lp-card lp-calc rv">
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
            <span className="lp-switch-ui" /><Moon size={15} />{c.calc.night} <em>×0.7</em>
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
            <b className="lp-grad">{fmt(Math.max(year, 0), lang)} {c.calc.sum}</b>
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

function Pricing({ c, lang }: { c: LandingCopy; lang: Lang }) {
  return (
    <section className="lp-sec" id="pricing">
      <div className="lp-wrap lp-pricing">
        <GreenHours c={c} />
        <Calculator c={c} lang={lang} />
      </div>
    </section>
  );
}

// ───────────────────────── Route ─────────────────────────

function RouteSection({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const total = c.route.stops[c.route.stops.length - 1].km;
  return (
    <section className="lp-sec lp-route-sec">
      <div className="lp-wrap">
        <SectionHead kicker={c.route.kicker} title={c.route.title} sub={c.route.sub} />
        <div className="lp-card lp-route rv">
          <div className="lp-route-line">
            <div className="lp-route-track"><i /></div>
            <span className="lp-route-car"><Car size={16} /></span>
            {c.route.stops.map((s, i) => (
              <div key={i} className={`lp-route-stop ${i === 0 || i === c.route.stops.length - 1 ? 'is-end' : ''}`} style={{ left: `${(s.km / total) * 100}%` }}>
                <span className="lp-route-dot">{i > 0 && i < c.route.stops.length - 1 ? <Zap size={12} /> : null}</span>
                <b>{s.city}</b>
                <small>{fmt(s.km, lang)} {c.calc.km_}</small>
                <em>{s.note}</em>
              </div>
            ))}
          </div>
          <p className="lp-route-total"><Route size={16} />{c.route.total}</p>
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
                    <th key={i} className={i === 0 ? 'is-us' : ''}>{i === 0 ? <span className="lp-compare-us"><LogoMark size={18} id="cmp" />{col}</span> : col}</th>
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

// ───────────────────────── Audiences ─────────────────────────

const TAB_ICON: Record<string, ReactNode> = {
  driver: <Smartphone size={18} />, business: <Building2 size={18} />, operator: <Server size={18} />, api: <Code2 size={18} />,
};

function Audiences({ c, onOpen, onSplit }: { c: LandingCopy; onOpen: (p: LandingTarget) => void; onSplit: () => void }) {
  const [tab, setTab] = useState(0);
  const t = c.audiences.tabs[tab];
  return (
    <section className="lp-sec" id="platform">
      <div className="lp-wrap">
        <SectionHead kicker={c.audiences.kicker} title={c.audiences.title} sub={c.audiences.sub} />
        <div className="lp-tabs rv" role="tablist">
          {c.audiences.tabs.map((x, i) => (
            <button key={x.id} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}>
              {TAB_ICON[x.id]}{x.label}
            </button>
          ))}
        </div>
        <div className="lp-aud rv" role="tabpanel">
          <div className="lp-card lp-aud-copy">
            <p className="lp-aud-title">{t.title}</p>
            <p className="lp-aud-d">{t.d}</p>
            <ul>
              {t.points.map(p => <li key={p}><Check size={16} />{p}</li>)}
            </ul>
            <div className="lp-aud-cta">
              <button className="lp-btn lp-btn-primary" onClick={() => onOpen(t.portal as LandingTarget)}>{c.audiences.open}<ArrowUpRight size={16} /></button>
              <button className="lp-btn lp-btn-ghost" onClick={onSplit}><Columns2 size={16} />{c.cta.compare}</button>
            </div>
          </div>
          <div className="lp-aud-visual" onPointerMove={tilt} onPointerLeave={untilt}>
            {t.id === 'driver' ? <div className="lp-aud-phone"><Phone c={c} variant="map" /></div> : (
            <div className="lp-window">
              <div className="lp-window-bar"><i /><i /><i /><span>{t.title}</span></div>
              <div className="lp-window-body">
                <div className="lp-wb-side">{[0, 1, 2, 3, 4, 5].map(i => <span key={i} className={i === 0 ? 'is-on' : ''} />)}</div>
                <div className="lp-wb-main">
                  <div className="lp-wb-kpis">{[0, 1, 2, 3].map(i => <div key={i}><span /><b /></div>)}</div>
                  <div className="lp-wb-chart">
                    <svg viewBox="0 0 300 90" preserveAspectRatio="none">
                      <path d="M0 70 C30 60 50 40 80 48 S130 20 160 30 S220 60 250 25 S290 15 300 18 L300 90 L0 90 Z" className="lp-wb-area" />
                      <path d="M0 70 C30 60 50 40 80 48 S130 20 160 30 S220 60 250 25 S290 15 300 18" className="lp-wb-line" />
                    </svg>
                  </div>
                  <div className="lp-wb-rows">{[0, 1, 2, 3].map(i => <div key={i}><span /><span /><i /></div>)}</div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
        <button className="lp-admin rv" onClick={() => onOpen('admin')}>
          <ShieldCheck size={18} />{c.audiences.admin}<ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

// ───────────────────────── Security ─────────────────────────

const SEC_ICON = [<KeyRound key={0} size={20} />, <Lock key={1} size={20} />, <Smartphone key={2} size={20} />, <Webhook key={3} size={20} />, <Users key={4} size={20} />, <Server key={5} size={20} />];

function Security({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec" id="security">
      <div className="lp-wrap">
        <SectionHead kicker={c.security.kicker} title={c.security.title} />
        <div className="lp-sec-grid">
          {c.security.items.map((s, i) => (
            <div key={i} className="lp-card lp-secure rv" style={{ '--d': `${(i % 3) * 80}ms` } as CSSProperties}>
              <span className="lp-feat-ic">{SEC_ICON[i]}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Roadmap ─────────────────────────

function Roadmap({ c }: { c: LandingCopy }) {
  return (
    <section className="lp-sec" id="roadmap">
      <div className="lp-wrap">
        <SectionHead kicker={c.roadmap.kicker} title={c.roadmap.title} />
        <ol className="lp-road">
          {c.roadmap.items.map((r, i) => (
            <li key={i} className={`rv ${r.done ? 'is-done' : ''}`} style={{ '--d': `${i * 80}ms` } as CSSProperties}>
              <span className="lp-road-dot">{r.done ? <Check size={13} strokeWidth={3} /> : null}</span>
              <p className="lp-road-when">{r.when}{r.done && <em>{c.roadmap.done}</em>}</p>
              <h3>{r.t}</h3>
              <p>{r.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ───────────────────────── App download ─────────────────────────

function AppSection({ c, onDemo }: { c: LandingCopy; onDemo: () => void }) {
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <div className="lp-card lp-app rv">
          <div className="lp-app-copy">
            <Kicker>{c.app.kicker}</Kicker>
            <h2 className="lp-h2">{c.app.title}</h2>
            <p className="lp-sub">{c.app.sub}</p>
            <div className="lp-stores">
              <span className="lp-store" aria-disabled="true"><Apple size={22} /><span><small>{c.app.soon}</small>App Store</span></span>
              <span className="lp-store" aria-disabled="true"><Play size={20} /><span><small>{c.app.soon}</small>Google Play</span></span>
              <button className="lp-btn lp-btn-primary" onClick={onDemo}><Smartphone size={16} />{c.app.web}</button>
            </div>
          </div>
          <div className="lp-app-phone"><Phone c={c} variant="charge" /></div>
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
            <details key={i} className="lp-faq-item rv" open={i === 0}>
              <summary>{f.q}<ChevronDown size={18} /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── CTA + footer ─────────────────────────

function Cta({ c, onDemo, onSplit }: { c: LandingCopy; onDemo: () => void; onSplit: () => void }) {
  return (
    <section className="lp-sec">
      <div className="lp-wrap">
        <div className="lp-cta rv">
          <div className="lp-cta-glow" />
          <h2 className="lp-h2">{c.cta.title}</h2>
          <p className="lp-sub">{c.cta.sub}</p>
          <div className="lp-hero-cta">
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onDemo}><Zap size={18} />{c.cta.button}</button>
            <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={onSplit}><Columns2 size={18} />{c.cta.compare}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ c, onOpen }: { c: LandingCopy; onOpen: (p: LandingTarget) => void }) {
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
          <button onClick={() => onOpen('driver')}><Car size={14} />{L.drivers}</button>
          <button onClick={() => onOpen('business')}><Building2 size={14} />{L.business}</button>
          <button onClick={() => onOpen('operator')}><Server size={14} />{L.operators}</button>
          <button onClick={() => onOpen('api')}><Code2 size={14} />{L.api}</button>
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.platform}</p>
          <button onClick={() => onOpen('architecture')}><Network size={14} />{L.arch}</button>
          <a href="#roadmap"><Route size={14} />{L.roadmap}</a>
          <a href="#security"><ShieldCheck size={14} />{L.security}</a>
          <a href="#faq"><ChevronDown size={14} />{L.faq}</a>
        </div>
        <div>
          <p className="lp-footer-h">{c.footer.company}</p>
          <a href={`mailto:${BRAND.email}`}><ArrowUpRight size={14} />{L.contact}</a>
          <span className="lp-footer-muted">{BRAND.email}</span>
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

// ───────────────────────── Page ─────────────────────────

export default function Landing({ onSelect, onSplitView }: { onSelect: (p: LandingTarget) => void; onSplitView: () => void }) {
  const { lang } = useI18n();
  const c = COPY[lang] ?? COPY.ru;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useReveal(root);

  useEffect(() => {
    if (!root) return;
    const onScroll = () => setScrolled(root.scrollTop > 40);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [root]);

  useEffect(() => {
    const prev = document.title;
    document.title = c.meta.title;
    return () => { document.title = prev; };
  }, [c]);

  const demo = () => onSelect('driver');

  return (
    <div ref={setRoot} className="lp" data-no-translate>
      <Nav c={c} scrolled={scrolled} onDemo={demo} />
      <main>
        <Hero c={c} lang={lang} scrollEl={root} onDemo={demo} />
        <Strip c={c} />
        <Problem c={c} />
        <How c={c} />
        <Features c={c} />
        <Pricing c={c} lang={lang} />
        <RouteSection c={c} lang={lang} />
        <Compare c={c} />
        <Audiences c={c} onOpen={onSelect} onSplit={onSplitView} />
        <Security c={c} />
        <Roadmap c={c} />
        <AppSection c={c} onDemo={demo} />
        <Faq c={c} />
        <Cta c={c} onDemo={demo} onSplit={onSplitView} />
      </main>
      <Footer c={c} onOpen={onSelect} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { V_STROKE, V_BLADE, WORD } from './Logo';
import './intro.css';

const KEY = 'voli-intro';
/** When the logo is full and the cut through the screen begins. */
const CUT_MS = 4300;
/** The cut and the halves sliding apart. */
const OUT_MS = 1100;
/** The logo's charge, in ms from the start: begins once the gun is in, ends full. */
const CHARGE_FROM = 1500;
const CHARGE_FOR = 1900;

/** Whether this visit still has to see the opening: once per browser tab, never with reduced motion. */
export function introDue() {
  try {
    // ?intro plays it again on demand, to show it.
    if (new URLSearchParams(window.location.search).has('intro')) return true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

/** The logo's shapes, for its outline, its clip and its finished colours. */
function LogoShapes({ mode }: { mode: 'outline' | 'clip' | 'final' }) {
  // The mask is drawn in white; the outline is styled in CSS; the finished logo has its own colours.
  const ink = mode === 'final' ? '#fff' : mode === 'clip' ? '#fff' : undefined;
  return (
    <>
      <path d={V_STROKE} fill="none" stroke={ink} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" className={mode === 'outline' ? 'lpi-o-stroke' : undefined} />
      <path d={V_BLADE} fill={mode === 'final' ? 'url(#lpi-blade)' : ink ?? 'none'} />
      <path fillRule="evenodd" d={WORD.o} fill={ink ?? 'none'} />
      {[WORD.l, WORD.i].map(([x, y, w, h]) => <rect key={x} x={x} y={y} width={w} height={h} rx="5" fill={ink ?? 'none'} />)}
      <circle cx={WORD.dot[0]} cy={WORD.dot[1]} r={WORD.dot[2]} fill={mode === 'final' ? '#FFC83D' : ink ?? 'none'} />
    </>
  );
}

/**
 * Where things stand, in the SVG's units: side by side on a wide screen,
 * one above the other on an upright phone.
 */
const LAYOUT = {
  wide: { box: '0 0 1000 600', car: 'M1040 -40 L700 -40 C640 60 628 200 640 300 C652 420 690 520 760 640 L1040 640 Z', port: [664, 330], gun: [446, 330], logo: [430, 165], scale: 2.25, stream: 'M640 300 C 580 250, 530 240, 470 215', status: [712, 418], arch: [880, 640] },
  tall: { box: '0 0 600 1000', car: 'M640 520 L470 520 C430 600 420 700 430 760 C440 860 470 940 520 1040 L640 1040 Z', port: [452, 760], gun: [234, 760], logo: [300, 330], scale: 2.4, stream: 'M440 736 C 400 640, 330 560, 300 470', status: [372, 868], arch: [600, 1040] },
} as const;

/** The charging gun in profile, nose to the right at x 218 (the connector face), its cable leaving the grip. */
function Gun({ tall }: { tall: boolean }) {
  return (
    <g className="lpi-gun">
      <path className="lpi-cable" d={tall ? 'M-8 92 C -40 200, -160 180, -260 420' : 'M-8 92 C -30 190, -200 200, -480 300'} />
      <path className="lpi-cable-sheen" d={tall ? 'M-8 92 C -40 200, -160 180, -260 420' : 'M-8 92 C -30 190, -200 200, -480 300'} />
      {/* grip and body, lit from above */}
      <path d="M64 -34 L22 -42 C0 -44 -14 -32 -14 -14 L-36 70 C-40 90 -22 100 -4 95 L12 90 L32 24 L64 26 Z" fill="url(#lpi-gun-g)" stroke="#3d3d3d" strokeWidth="2" />
      <path d="M-10 -20 L-28 60" stroke="rgba(255,255,255,.08)" strokeWidth="5" strokeLinecap="round" />
      {/* the trigger and its guard */}
      <path d="M34 24 C38 48 62 52 74 28" fill="none" stroke="#2c2c2c" strokeWidth="6" strokeLinecap="round" />
      <path d="M44 26 L50 40" stroke="#FFC83D" strokeOpacity=".7" strokeWidth="5" strokeLinecap="round" />
      {/* the head and the connector */}
      <rect x="56" y="-38" width="148" height="76" rx="20" fill="url(#lpi-gun-g)" stroke="#3d3d3d" strokeWidth="2" />
      <path d="M74 -30 H 186" stroke="rgba(255,255,255,.16)" strokeWidth="3" strokeLinecap="round" />
      <rect x="202" y="-29" width="20" height="58" rx="7" fill="#151515" stroke="#4a4a4a" strokeWidth="2" />
      <rect x="80" y="20" width="96" height="6" rx="3" className="lpi-gun-led" />
      <text x="130" y="7" className="lpi-gun-mark">VOLI</text>
    </g>
  );
}

/**
 * The landing's opening: night at a charging station, the photo soft behind.
 * A charging gun swings in and clicks into the port on the flank of an
 * electric car; the port's ring lights and pulses, and energy streams from
 * it into the Voli logo, which fills from the bottom like a battery — a
 * moving surface, bubbles, the percent counting — until at 100% it flashes
 * into its own colours and "Вся зарядка Узбекистана" appears. Then a line
 * of light cuts the screen along the V's slant, the halves slide apart and
 * the site is underneath. About five seconds, once a visit; a tap skips to
 * the cut.
 */
export default function Intro({ tagline, onDone }: { tagline: string; onDone: () => void }) {
  const [cut, setCut] = useState(false);
  const [pct, setPct] = useState(0);
  const [tall] = useState(() => window.innerHeight > window.innerWidth * 1.05);
  const L = tall ? LAYOUT.tall : LAYOUT.wide;

  const out = () => {
    if (cut) return;
    setCut(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* shown again next time, nothing worse */
    }
    setTimeout(onDone, OUT_MS);
  };
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0 - CHARGE_FROM) / CHARGE_FOR));
      setPct(Math.round((p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(out, CUT_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [px, py] = L.port;
  const [gx, gy] = L.gun;
  const [lx, ly] = L.logo;
  // The liquid's surface inside the logo, in the logo's own units (it spans y 14–76).
  const level = 78 - (64 * pct) / 100;
  const full = pct >= 100;

  const picture = (
    <>
      <div className="lpi-photo" />
      <div className="lpi-shade" />
      <svg className="lpi-scene" viewBox={L.box} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lpi-blade" x1="0.2" y1="1" x2="0.8" y2="0">
            <stop offset="0" stopColor="#E09A00" />
            <stop offset="0.45" stopColor="#FFC83D" />
            <stop offset="1" stopColor="#FFE58A" />
          </linearGradient>
          <linearGradient id="lpi-liquid" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#E09A00" />
            <stop offset="0.6" stopColor="#FFC83D" />
            <stop offset="1" stopColor="#FFF0B0" />
          </linearGradient>
          <linearGradient id="lpi-paint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2a2a2a" />
            <stop offset="0.25" stopColor="#141414" />
            <stop offset="1" stopColor="#0a0a0a" />
          </linearGradient>
          <mask id="lpi-logo-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="100"><LogoShapes mode="clip" /></mask>
          <linearGradient id="lpi-gun-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#353535" />
            <stop offset="0.5" stopColor="#1d1d1d" />
            <stop offset="1" stopColor="#0f0f0f" />
          </linearGradient>
          <radialGradient id="lpi-flash-g"><stop offset="0" stopColor="#FFF8DC" stopOpacity="1" /><stop offset=".4" stopColor="#FFC83D" stopOpacity=".5" /><stop offset="1" stopColor="#FFC83D" stopOpacity="0" /></radialGradient>
        </defs>

        {/* The car's flank, glossy, a line of light along its edge */}
        <path d={L.car} fill="url(#lpi-paint)" className="lpi-car" />
        <path d={L.car} fill="none" className="lpi-car-edge" />
        <path d={L.car} fill="none" className="lpi-car-sheen" transform="translate(26 0)" />
        <circle cx={L.arch[0]} cy={L.arch[1]} r="120" className="lpi-arch" />
        <circle cx={L.arch[0]} cy={L.arch[1]} r="96" className="lpi-tyre" />

        {/* The port: open flap, the inlet, the ring that lights */}
        <g className="lpi-port">
          <rect x={px - 6} y={py - 46} width="44" height="92" rx="18" fill="#0a0a0a" stroke="#2e2e2e" strokeWidth="2" />
          <circle cx={px + 16} cy={py} r="30" fill="none" className="lpi-port-ring" />
          <circle cx={px + 16} cy={py} r="22" fill="#121212" />
        </g>

        {/* The gun swings in and clicks into the port */}
        <g transform={`translate(${gx} ${gy})`}>
          <Gun tall={tall} />
        </g>
        <circle cx={px + 16} cy={py} r="30" className="lpi-ripple" />
        <circle cx={px + 16} cy={py} r="30" className={`lpi-ripple lpi-ripple-full${full ? ' is-on' : ''}`} />
        <g className="lpi-click" transform={`translate(${px} ${py})`}>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <line key={i} x1={Math.cos(a) * 26} y1={Math.sin(a) * 26} x2={Math.cos(a) * (46 + (i % 3) * 10)} y2={Math.sin(a) * (46 + (i % 3) * 10)} />;
          })}
        </g>

        {/* Energy from the port into the logo */}
        <path d={L.stream} className="lpi-stream" />
        {[0, 1, 2, 3, 4].map(i => (
          <circle key={i} r="4" className="lpi-spark" style={{ offsetPath: `path('${L.stream}')`, animationDelay: `${1.5 + i * 0.14}s` }} />
        ))}

        {/* The status on the car */}
        <g className="lpi-status" transform={`translate(${L.status[0]} ${L.status[1]})`}>
          <rect x="-8" y="-20" width={full ? 92 : 150} height="30" rx="15" className={`lpi-status-pill${full ? ' is-full' : ''}`} />
          <text x="8" y="0">{full ? '⚡ 100%' : `⚡ Заряжается · ${pct}%`}</text>
        </g>

        {/* The logo: an outline that fills like a battery, then its own colours */}
        <g transform={`translate(${lx} ${ly}) scale(${L.scale}) translate(-89 -44)`}>
          <g className={`lpi-outline${full ? ' is-full' : ''}`}><LogoShapes mode="outline" /></g>
          <g mask="url(#lpi-logo-mask)" className={full ? 'lpi-liquid is-full' : 'lpi-liquid'}>
            <g style={{ transform: `translateY(${level}px)`, transition: 'transform .12s linear' }}>
              <path className="lpi-wave" d="M-40 0 Q-25 -4 -10 0 T20 0 T50 0 T80 0 T110 0 T140 0 T170 0 T200 0 T230 0 V80 H-40 Z" fill="url(#lpi-liquid)" />
              <path className="lpi-wave lpi-surface" d="M-40 0 Q-25 -4 -10 0 T20 0 T50 0 T80 0 T110 0 T140 0 T170 0 T200 0 T230 0" />
            </g>
            {!full && [40, 60, 92, 118, 140].map((x, i) => <circle key={x} cx={x} cy="76" r={1.2 + (i % 2)} className="lpi-bubble" style={{ animationDelay: `${1.6 + i * 0.25}s`, ['--rise' as string]: `${Math.max(6, 76 - level)}px` }} />)}
          </g>
          <g className={`lpi-final${full ? ' is-on' : ''}`} style={{ transformOrigin: '89px 44px' }}><LogoShapes mode="final" /></g>
        </g>
        {/* At 100%: a burst of light, then the line under the logo */}
        <circle cx={lx} cy={ly} r="160" fill="url(#lpi-flash-g)" className={`lpi-flash${full ? ' is-on' : ''}`} />
        <text x={lx} y={ly + 44 * L.scale - 10} className={`lpi-pct${full ? ' is-full' : ''}`}>{`${pct}%`}</text>
        <text x={lx} y={ly + 44 * L.scale + 22} className={`lpi-tag${full ? ' is-on' : ''}`}>{tagline}</text>
      </svg>
    </>
  );

  return (
    <div className={`lpi-intro${cut ? ' is-cut' : ''}${tall ? ' is-tall' : ''}`} onClick={out} role="presentation" aria-hidden="true">
      <div className="lpi-half lpi-half-a">{picture}</div>
      <div className="lpi-half lpi-half-b">{picture}</div>
      <span className="lpi-slash" />
    </div>
  );
}

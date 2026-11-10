import { useEffect, useMemo, useRef, useState } from 'react';
import { MARK_SRC } from '../../landing/Logo';

/**
 * The first seconds of the app, as a charge: comets of energy stream in from
 * the edges, the V is drawn as a glowing line and fills from the bottom with
 * liquid light (bubbles, a shining wave) while arcs crackle, a charge ring
 * closes round it and a counter runs to 100%. At full charge a flash and a
 * shock wave throw sparks out, the V takes its colours and steps aside for the
 * letters; then the dark melts away and the wordmark flies up to its place on
 * the welcome underneath. Once per visit; a tap skips it.
 */

const TOTAL_MS = 3750;
const FILL_FROM = 950;
const FILL_TO = 2150;
const EXIT_AT = 2850;
// The V's middle in the wordmark's own units (viewBox 22 12 134 64), and in pixels on the 270 px wide logo.
const VX = 58.5;
const VY = 44;
const LOGO_W = 270;
const LOGO_H = (LOGO_W * 64) / 134;
const V_PX = { x: ((VX - 22) * LOGO_W) / 134, y: ((VY - 12) * LOGO_H) / 64 };
const RING_R = 98;

/** A jagged line between two points: one flicker of an electric arc. */
function arc(x1: number, y1: number, x2: number, y2: number, jitter: number) {
  const steps = 7;
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    d += ` L${(x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter).toFixed(1)} ${(y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter).toFixed(1)}`;
  }
  return `${d} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export default function Splash({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const [arcs, setArcs] = useState<string[]>([]);
  const [fly, setFly] = useState<{ x: number; y: number; s: number } | null>(null);
  const logo = useRef<SVGSVGElement>(null);

  // Comets of energy: a first wave from every side, then a steady stream while the V charges.
  const comets = useMemo(
    () => Array.from({ length: 46 }, (_, i) => ({
      a: Math.random() * 360,
      r: 260 + Math.random() * 280,
      d: i < 22 ? Math.random() * 0.7 : 0.8 + Math.random() * 1.2,
      len: 14 + Math.random() * 22,
    })),
    [],
  );
  const burst = useMemo(() => Array.from({ length: 20 }, (_, i) => ({ a: (i / 20) * 360 + Math.random() * 10, l: 40 + Math.random() * 80 })), []);
  const bubbles = useMemo(() => Array.from({ length: 9 }, () => ({ x: 30 + Math.random() * 62, r: 0.8 + Math.random() * 1.6, d: Math.random() * 1.4 })), []);

  useEffect(() => {
    try {
      sessionStorage.setItem('voli-splash', '1');
    } catch {
      /* nothing kept */
    }
    const start = performance.now();
    let raf = 0;
    let lastArc = 0;
    const tick = (now: number) => {
      const t = now - start;
      setPct(Math.round(Math.min(1, Math.max(0, (t - FILL_FROM) / (FILL_TO - FILL_FROM))) * 100));
      // Arcs crackle round the V while it charges, a new pair every 60 ms.
      if (t > FILL_FROM - 150 && t < FILL_TO + 100) {
        if (now - lastArc > 60) {
          lastArc = now;
          const pick = () => {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 12;
            return [VX + Math.cos(a) * r, VY + Math.sin(a) * r * 0.85] as const;
          };
          setArcs([0, 1].map(() => {
            const [x1, y1] = pick();
            const [x2, y2] = Math.random() < 0.5 ? pick() : [VX + (Math.random() - 0.5) * 30, VY + (Math.random() - 0.5) * 34];
            return arc(x1, y1, x2, y2, 9);
          }));
        }
      } else if (t >= FILL_TO + 100) setArcs([]);
      if (t < TOTAL_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // At the end the wordmark flies to where the welcome's own wordmark stands.
    const exit = setTimeout(() => {
      const from = logo.current?.getBoundingClientRect();
      const to = document.querySelector('[data-welcome-logo] svg')?.getBoundingClientRect();
      if (!from || !to) return;
      setFly({ x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2), s: to.height / from.height });
    }, EXIT_AT);
    const done = setTimeout(onDone, TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(exit);
      clearTimeout(done);
    };
  }, [onDone]);

  const full = pct >= 100;
  const head = (pct / 100) * Math.PI * 2 - Math.PI / 2;

  return (
    <div className="absolute inset-0 overflow-hidden grid place-items-center" onClick={onDone} role="img" aria-label="Voli">
      {/* The dark, the light and the energy: they melt away at the end */}
      <div className={`absolute inset-0 bg-[#050505] ${fly ? 'sp3-melt' : ''}`}>
        <div className="absolute left-1/2 top-[46%] w-[640px] h-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full sp2-glow" style={{ background: 'radial-gradient(closest-side, rgba(198,244,50,.17), rgba(198,244,50,.05) 55%, rgba(198,244,50,0))' }} />
        <div className="absolute left-1/2 top-[46%] w-0 h-0" aria-hidden="true">
          {comets.map((c, i) => (
            <span key={i} className="absolute left-0 top-0 h-[2px] rounded-full sp3-comet" style={{ width: c.len, background: 'linear-gradient(90deg, #EFFCC9, rgba(198,244,50,.6) 40%, rgba(198,244,50,0))', boxShadow: '0 0 6px rgba(198,244,50,.8)', ['--a' as string]: `${c.a}deg`, ['--r' as string]: `${c.r}px`, animationDelay: `${c.d}s` }} />
          ))}
        </div>
        <div className="absolute inset-0 sp2-flash pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 46%, rgba(255,240,190,.75), rgba(198,244,50,.25) 30%, rgba(0,0,0,0) 60%)' }} />
        <div className="absolute left-1/2 top-[46%] w-[200px] h-[200px] -ml-[100px] -mt-[100px] rounded-full border-[3px] border-[#DEF88C] sp2-shock" style={{ boxShadow: '0 0 30px rgba(198,244,50,.7), inset 0 0 30px rgba(198,244,50,.5)' }} />
        <div className="absolute left-1/2 top-[46%] w-0 h-0" aria-hidden="true">
          {burst.map((b, i) => (
            <span key={i} className="absolute left-0 top-0 h-[3px] rounded-full sp2-spark" style={{ width: b.l, background: 'linear-gradient(90deg, rgba(255,226,122,0), #DEF88C)', ['--a' as string]: `${b.a}deg` }} />
          ))}
        </div>
      </div>

      <div className="relative flex flex-col items-center -mt-[8%]">
        {/* The V charges in the middle, then steps aside for the letters, then flies to the welcome */}
        <div className="relative" style={fly
          ? { transform: `translate(${fly.x}px, ${fly.y}px) scale(${fly.s})`, transition: 'transform .75s cubic-bezier(.65,0,.3,1)' }
          : { transform: full ? 'translateX(0)' : `translateX(${LOGO_W / 2 - V_PX.x}px)`, transition: 'transform .55s cubic-bezier(.2,.8,.2,1)' }}>
          {/* The charge ring closing round the V */}
          <svg className={`absolute pointer-events-none overflow-visible ${full ? 'sp3-ring-out' : ''}`} style={{ left: V_PX.x - RING_R - 6, top: V_PX.y - RING_R - 6, width: RING_R * 2 + 12, height: RING_R * 2 + 12 }} viewBox={`${-RING_R - 6} ${-RING_R - 6} ${RING_R * 2 + 12} ${RING_R * 2 + 12}`} aria-hidden="true">
            <circle r={RING_R} fill="none" stroke="#FFFFFF" strokeOpacity=".07" strokeWidth="3" className="sp3-ring-in" />
            <circle r={RING_R} fill="none" stroke="#C6F432" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - pct / 100} transform="rotate(-90)" style={{ filter: 'drop-shadow(0 0 5px rgba(198,244,50,.9))' }} />
            {pct > 0 && <circle cx={Math.cos(head) * RING_R} cy={Math.sin(head) * RING_R} r="4.5" fill="#EFFCC9" style={{ filter: 'drop-shadow(0 0 8px #C6F432)' }} />}
          </svg>

          <svg ref={logo} viewBox="22 12 134 64" width={LOGO_W} className="relative block overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="sp2-blade" x1="0.2" y1="1" x2="0.8" y2="0">
                <stop offset="0" stopColor="#1FA33A" />
                <stop offset="0.45" stopColor="#C6F432" />
                <stop offset="1" stopColor="#E9FB8F" />
              </linearGradient>
              <linearGradient id="sp2-liquid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#EFFCC9" />
                <stop offset="0.25" stopColor="#C6F432" />
                <stop offset="1" stopColor="#1FA33A" />
              </linearGradient>
              <mask id="sp2-vmask" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="100" style={{ maskType: 'alpha' }}>
                <image href={MARK_SRC} x="22" y="22" width="60" height="43.6" />
              </mask>
            </defs>

            {/* Liquid light rising inside the V: a moving wave with a shine on its crest, and bubbles */}
            {!full && (
              <g mask="url(#sp2-vmask)">
                <g style={{ transform: `translateY(${(1 - pct / 100) * 64}px)`, transition: 'transform 80ms linear' }}>
                  <g className="sp2-wave">
                    <path d="M0 12 Q 10 7 20 12 T 40 12 T 60 12 T 80 12 T 100 12 T 120 12 T 140 12 T 160 12 T 180 12 T 200 12 V 90 H 0 Z" fill="url(#sp2-liquid)" />
                    <path d="M0 12 Q 10 7 20 12 T 40 12 T 60 12 T 80 12 T 100 12 T 120 12 T 140 12 T 160 12 T 180 12 T 200 12" fill="none" stroke="#FFFFFF" strokeOpacity=".75" strokeWidth=".9" />
                  </g>
                  {bubbles.map((b, i) => <circle key={i} cx={b.x} cy={40} r={b.r} fill="#FFF8DD" fillOpacity=".7" className="sp3-bubble" style={{ animationDelay: `${b.d}s` }} />)}
                </g>
              </g>
            )}
            {/* The glowing outline drawn first, and the finished V at full charge */}
            <image href={MARK_SRC} x="22" y="22" width="60" height="43.6" opacity="0.14" />
            <g className={full ? 'sp2-final on' : 'sp2-final'}>
              <image href={MARK_SRC} x="22" y="22" width="60" height="43.6" />
            </g>

            {/* Arcs crackling round the V while it charges */}
            <g fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2.5px #C6F432)' }}>
              {arcs.map((d, i) => <path key={i} d={d} stroke={i ? '#DEF88C' : '#FFFFFF'} strokeWidth={i ? 0.9 : 1.3} />)}
            </g>

            {/* The letters, once charged */}
            <g className={full ? 'sp2-word on' : 'sp2-word'}>
              <text x="88" y="61" fill="#FFFFFF" fontSize="46" fontWeight="800" fontStyle="italic" letterSpacing="-1.4" fontFamily="Inter, system-ui, sans-serif" className="sp2-letter">voli</text>
            </g>
          </svg>
        </div>

        {/* The counter while charging, the tagline once full */}
        <div className={`relative mt-9 h-[48px] w-[340px] ${fly ? 'sp3-fade' : ''}`}>
          <div className={`absolute inset-0 flex flex-col items-center transition-opacity duration-300 ${full ? 'opacity-0' : 'opacity-100'}`}>
            <p className="text-[26px] font-extrabold tabular-nums text-white tracking-tight leading-none"><span className="text-[#C6F432]">⚡</span> {pct}<span className="text-[16px] text-white/60 ml-0.5">%</span></p>
            <p className="mt-2 text-[10px] font-semibold tracking-[0.3em] uppercase text-white/40">Заряжаем</p>
          </div>
          <p className={`absolute inset-x-0 top-2 text-center text-[12px] font-semibold tracking-[0.32em] uppercase text-white/65 ${full ? 'sp2-tag on' : 'sp2-tag'}`}>Вся зарядка Узбекистана</p>
        </div>
      </div>
    </div>
  );
}

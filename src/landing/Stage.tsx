import { useEffect, useRef, useState } from 'react';

export interface StageCopy {
  word: string;
  kicker: string;
  line: string;
  hud: [string, string, string, string];
  facts: { value: string; label: string }[];
}

/**
 * The landing's dark stage, right under the hero: one huge outlined word that
 * fills with yellow as it scrolls through the screen, like a battery taking a
 * charge, with the percent counting along; sparks trail the cursor over it,
 * and small technical labels sit in the corners. Without motion (reduced
 * motion, or no scroll yet) the word simply shows filled.
 */
export default function Stage({ copy }: { copy: StageCopy }) {
  const box = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fill, setFill] = useState(0);

  // The fill follows the stage's way through the viewport: empty as it enters, full by the middle.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFill(100);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (vh - r.top) / (vh * 0.75 + r.height * 0.25);
      setFill(Math.round(Math.min(1, Math.max(0, p)) * 100));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    // The page may scroll in an inner box rather than the window: listen to any scroll.
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Sparks behind the cursor: small yellow embers that drift down and fade.
  useEffect(() => {
    const cv = canvas.current;
    const el = box.current;
    if (!cv || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      cv.width = el.clientWidth * dpr;
      cv.height = el.clientHeight * dpr;
    };
    size();
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; r: number };
    const sparks: Spark[] = [];
    let last: { x: number; y: number } | null = null;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) * dpr;
      const y = (e.clientY - r.top) * dpr;
      const n = last ? Math.min(6, 1 + Math.hypot(x - last.x, y - last.y) / (14 * dpr)) : 1;
      for (let i = 0; i < n; i++) {
        sparks.push({ x, y, vx: (Math.random() - 0.5) * 1.6 * dpr, vy: (Math.random() * 0.6 + 0.2) * dpr, life: 1, r: (Math.random() * 1.8 + 0.8) * dpr });
      }
      if (sparks.length > 260) sparks.splice(0, sparks.length - 260);
      last = { x, y };
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.035 * dpr;
        s.life -= 0.022;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${190 + Math.round(40 * s.life)}, ${Math.round(80 * s.life)}, ${s.life})`;
        ctx.shadowColor = 'rgba(198,244,50,.9)';
        ctx.shadowBlur = 8 * dpr;
        ctx.fill();
      }
      raf = sparks.length ? requestAnimationFrame(tick) : 0;
    };
    el.addEventListener('pointermove', onMove);
    window.addEventListener('resize', size);
    return () => {
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', size);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={box} className="lp-stage" aria-label={copy.word}>
      <canvas ref={canvas} className="lp-stage-sparks" aria-hidden="true" />
      <div className="lp-stage-hud" aria-hidden="true">
        <span>{copy.hud[0]}</span>
        <span>{copy.hud[1]}</span>
        <span>{copy.hud[2]}</span>
        <span>{copy.hud[3]}</span>
      </div>
      <div className="lp-wrap lp-stage-in">
        <p className="lp-stage-kicker"><span className="lp-dot" />{copy.kicker}</p>
        <div className="lp-stage-word" style={{ ['--fill' as string]: `${fill}%`, ['--front' as string]: fill > 0 && fill < 100 ? 1 : 0 }}>
          <span className="lp-stage-outline" aria-hidden="true">{copy.word}</span>
          <span className="lp-stage-solid">{copy.word}</span>
          <span className="lp-stage-meter" aria-hidden="true">
            <b>{fill}</b>%
          </span>
        </div>
        <p className="lp-stage-line">{copy.line}</p>
        <dl className="lp-stage-facts">
          {copy.facts.map(f => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

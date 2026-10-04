import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createHeroScene, HUB_CITIES, type HeroScene, type SceneStation } from './heroScene';

export type CityName = { id: string; name: string; major?: boolean };

/**
 * Mounts the 3D map and wires it to the page: size, pointer, scroll position
 * of the landing's scroll container, and whether the hero is on screen.
 */
export default function HeroCanvas({
  stations,
  cities,
  scrollEl,
  onFail,
  renderTip,
  onPick,
}: {
  stations: SceneStation[];
  cities: CityName[];
  scrollEl: HTMLElement | null;
  onFail: () => void;
  /** Tooltip body for a hovered station beam. */
  renderTip: (id: string) => ReactNode;
  onPick: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const [ready, setReady] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const lite = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: HeroScene;
    try {
      scene = createHeroScene(cv, { lite, still });
    } catch {
      onFail();
      return;
    }
    sceneRef.current = scene;
    scene.setLabels(labelRefs.current);
    const hero = el.parentElement;
    scene.setTooltip(tipRef.current, id => {
      hoveredRef.current = id;
      setHovered(id);
      hero?.classList.toggle('is-picking', !!id);
    });

    const ro = new ResizeObserver(([e]) => scene.resize(e.contentRect.width, e.contentRect.height));
    ro.observe(el);

    let onScreen = true;
    const sync = () => scene.setRunning(onScreen && document.visibilityState === 'visible');
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    sync();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      // Over buttons and text the page wins; beams are picked only on the open map.
      const overUi = (e.target as Element | null)?.closest('a, button, input, h1, p, dl');
      scene.setHover(inside && !overUi ? { x: e.clientX - r.left, y: e.clientY - r.top } : null);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    // The copy layer sits above the canvas, so clicks are caught on the hero.
    const onClick = (e: MouseEvent) => {
      if (hoveredRef.current && !(e.target as Element | null)?.closest('a, button')) pickRef.current(hoveredRef.current);
    };
    hero?.addEventListener('click', onClick);
    setReady(true);

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointermove', onMove);
      hero?.removeEventListener('click', onClick);
      hero?.classList.remove('is-picking');
      scene.dispose();
      sceneRef.current = null;
    };
  }, [onFail]);

  useEffect(() => {
    sceneRef.current?.setStations(stations);
  }, [stations, ready]);

  useEffect(() => {
    if (!scrollEl) return;
    const onScroll = () => sceneRef.current?.setScroll(scrollEl.scrollTop / Math.max(window.innerHeight, 1));
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [scrollEl]);

  const known = new Set(HUB_CITIES.map(c => c.id));
  return (
    <div ref={wrap} className={`lp-hero-canvas ${ready ? 'is-ready' : ''}`} aria-hidden="true">
      <canvas ref={canvas} />
      <div ref={tipRef} className="lp-tip" role="tooltip">{hovered && renderTip(hovered)}</div>
      {cities.filter(c => known.has(c.id)).map(c => (
        <span
          key={c.id}
          ref={el => {
            if (el) labelRefs.current.set(c.id, el);
            else labelRefs.current.delete(c.id);
          }}
          className={`lp-city ${c.major ? 'is-major' : ''}`}
        >
          {c.name}
        </span>
      ))}
    </div>
  );
}

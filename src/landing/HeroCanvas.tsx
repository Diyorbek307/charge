import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CORRIDOR_PATHS, HUB_CITIES, MAP_H, MAP_W, TRIP_PATH, UZ_PATH, project, type SceneStation } from './heroScene';

export type CityName = { id: string; name: string; major?: boolean };

const still = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The hero map: Uzbekistan at night. The country stands as a dark slab with
 * a glowing rim, energy runs along the charging corridors, every live station
 * of the demo network glows where it is, a car drives the Silk Road, a beam of
 * light sweeps the land, and the whole map leans after the pointer.
 */
export default function HeroCanvas({
  stations,
  cities,
  renderTip,
  onPick,
}: {
  stations: SceneStation[];
  cities: CityName[];
  /** Tooltip body for a hovered station pin. */
  renderTip: (id: string) => ReactNode;
  onPick: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [motion] = useState(() => !still());
  const box = useRef<HTMLDivElement>(null);
  const pins = useMemo(() => stations.map(s => {
    const [x, y] = project(s.lng, s.lat);
    return { ...s, x, y };
  }), [stations]);
  const names = new Map(cities.map(c => [c.id, c]));
  const tip = pins.find(p => p.id === hover);

  // The lean: a few degrees towards the pointer, back to rest when it leaves.
  const lean = (e: React.PointerEvent) => {
    if (!motion || e.pointerType !== 'mouse' || !box.current) return;
    const r = box.current.getBoundingClientRect();
    box.current.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height) - 0.5) * -8}deg`);
    box.current.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 10}deg`);
  };
  const rest = () => {
    box.current?.style.setProperty('--rx', '0deg');
    box.current?.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="lp-map" ref={box} onPointerMove={lean} onPointerLeave={rest} aria-hidden="true">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="lp-map-svg">
        <defs>
          <pattern id="lp-dots" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" className="lp-map-dot" />
          </pattern>
          <clipPath id="lp-uz"><path d={UZ_PATH} clipRule="evenodd" /></clipPath>
          <linearGradient id="lp-land-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#262420" />
            <stop offset="1" stopColor="#151412" />
          </linearGradient>
          <linearGradient id="lp-beam-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFC83D" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFC83D" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFC83D" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="lp-glow-g">
            <stop offset="0" stopColor="#FFC83D" stopOpacity="0.55" />
            <stop offset="1" stopColor="#FFC83D" stopOpacity="0" />
          </radialGradient>
          <filter id="lp-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>

        {/* The slab: the country raised off the card, its edge lit from below */}
        <path d={UZ_PATH} className="lp-map-side" fillRule="evenodd" transform="translate(0 16)" />
        <path d={UZ_PATH} className="lp-map-side lp-map-side-2" fillRule="evenodd" transform="translate(0 8)" />
        <path d={UZ_PATH} className="lp-map-land" fill="url(#lp-land-g)" fillRule="evenodd" />
        <rect width={MAP_W} height={MAP_H} fill="url(#lp-dots)" clipPath="url(#lp-uz)" />
        {motion && (
          <g clipPath="url(#lp-uz)">
            <rect className="lp-map-beam" x={-MAP_W * 0.35} y="0" width={MAP_W * 0.35} height={MAP_H} fill="url(#lp-beam-g)" style={{ '--w': `${Math.round(MAP_W * 1.4)}px` } as React.CSSProperties} />
          </g>
        )}
        <path d={UZ_PATH} className="lp-map-rim-glow" fillRule="evenodd" filter="url(#lp-blur)" />
        <path d={UZ_PATH} className="lp-map-rim" fillRule="evenodd" pathLength={1} />

        {/* Corridors, with energy running along them */}
        {CORRIDOR_PATHS.map((d, i) => <path key={i} d={d} className="lp-map-road" />)}
        {motion && CORRIDOR_PATHS.map((d, i) => (
          <path key={`e${i}`} d={d} className="lp-map-energy" pathLength={100} style={{ animationDuration: `${2.2 + (i % 4) * 0.5}s`, animationDelay: `${(i * 0.37) % 2.4}s` }} />
        ))}
        <path d={TRIP_PATH} className="lp-map-trip-glow" filter="url(#lp-blur)" />
        <path d={TRIP_PATH} className="lp-map-trip" pathLength={1} />

        {HUB_CITIES.map(c => {
          const [x, y] = project(c.lng, c.lat);
          const n = names.get(c.id);
          return (
            <g key={c.id} className={`lp-map-city ${n?.major ? 'is-major' : ''}`}>
              {n?.major && <circle cx={x} cy={y} r={34} fill="url(#lp-glow-g)" className="lp-map-city-glow" />}
              <circle cx={x} cy={y} r={n?.major ? 5 : 3.5} />
              {n && <text x={x + 10} y={y - 10}>{n.name}</text>}
            </g>
          );
        })}

        {pins.map((p, i) => (
          <g
            key={p.id}
            className={`lp-map-pin ${p.free ? 'is-free' : 'is-full'} ${hover === p.id ? 'is-hover' : ''}`}
            style={{ animationDelay: `${0.8 + (i % 12) * 0.08}s` }}
            onPointerEnter={() => setHover(p.id)}
            onPointerLeave={() => setHover(h => (h === p.id ? null : h))}
            onClick={() => onPick(p.id)}
          >
            {p.free > 0 && <circle cx={p.x} cy={p.y} r={10} className="lp-map-ping" style={{ animationDelay: `${(i % 9) * 0.35}s` }} />}
            <circle cx={p.x} cy={p.y} r={p.power >= 100 ? 8.5 : 6.5} className="lp-map-core" />
            {p.power >= 100 && <path d={`M${p.x + 1} ${p.y - 5}l-4 6h3l-1 4 4-6h-3z`} className="lp-map-bolt" />}
          </g>
        ))}

        {motion && (
          <g className="lp-map-car">
            <circle r="18" fill="url(#lp-glow-g)" />
            <circle r="6" className="lp-map-car-dot" />
            <animateMotion dur="14s" repeatCount="indefinite" path={TRIP_PATH} rotate="auto" />
          </g>
        )}
      </svg>

      {tip && (
        <div className="lp-tip is-on" role="tooltip" style={{ left: `${(tip.x / MAP_W) * 100}%`, top: `${(tip.y / MAP_H) * 100}%` }}>
          {renderTip(tip.id)}
        </div>
      )}
    </div>
  );
}

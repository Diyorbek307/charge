import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CORRIDOR_PATHS, HUB_CITIES, MAP_H, MAP_W, TRIP_PATH, UZ_PATH, project, type SceneStation } from './heroScene';

export type CityName = { id: string; name: string; major?: boolean };

const still = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The hero map: Uzbekistan in light paper tones, the charging corridors, a car
 * driving the Silk Road and every live station from the demo network as a pin.
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
  const pins = useMemo(() => stations.map(s => {
    const [x, y] = project(s.lng, s.lat);
    return { ...s, x, y };
  }), [stations]);
  const names = new Map(cities.map(c => [c.id, c]));
  const tip = pins.find(p => p.id === hover);

  return (
    <div className="lp-map" aria-hidden="true">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="lp-map-svg">
        <defs>
          <pattern id="lp-dots" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="lp-map-dot" />
          </pattern>
          <clipPath id="lp-uz"><path d={UZ_PATH} clipRule="evenodd" /></clipPath>
        </defs>
        <path d={UZ_PATH} className="lp-map-land" fillRule="evenodd" />
        <rect width={MAP_W} height={MAP_H} fill="url(#lp-dots)" clipPath="url(#lp-uz)" />
        <path d={UZ_PATH} className="lp-map-rim" fillRule="evenodd" />
        {CORRIDOR_PATHS.map((d, i) => <path key={i} d={d} className="lp-map-road" />)}
        <path d={TRIP_PATH} className="lp-map-trip" pathLength={1} />
        {HUB_CITIES.map(c => {
          const [x, y] = project(c.lng, c.lat);
          const n = names.get(c.id);
          return (
            <g key={c.id} className={`lp-map-city ${n?.major ? 'is-major' : ''}`}>
              <circle cx={x} cy={y} r={n?.major ? 6 : 4} />
              {n && <text x={x + 10} y={y - 9}>{n.name}</text>}
            </g>
          );
        })}
        {pins.map((p, i) => (
          <g
            key={p.id}
            className={`lp-map-pin ${p.free ? 'is-free' : 'is-full'} ${hover === p.id ? 'is-hover' : ''}`}
            style={{ animationDelay: `${(i % 9) * 0.35}s` }}
            onPointerEnter={() => setHover(p.id)}
            onPointerLeave={() => setHover(h => (h === p.id ? null : h))}
            onClick={() => onPick(p.id)}
          >
            {p.free > 0 && <circle cx={p.x} cy={p.y} r={9} className="lp-map-ping" />}
            <circle cx={p.x} cy={p.y} r={p.power >= 100 ? 8 : 6.5} className="lp-map-core" />
          </g>
        ))}
        {motion && (
          <g className="lp-map-car">
            <circle r="10" className="lp-map-car-halo" />
            <circle r="5.5" className="lp-map-car-dot" />
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

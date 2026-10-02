import { BRAND } from '../brand';

/**
 * Brand mark: an eight-point girih star — the motif of Samarkand and Bukhara
 * tilework — with a lightning bolt cut through it.
 */
export function LogoMark({ size = 32, id = 'lm' }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3BF0C8" />
          <stop offset="0.55" stopColor="#4CC9F0" />
          <stop offset="1" stopColor="#FFC857" />
        </linearGradient>
      </defs>
      <g transform="translate(24 24)">
        <rect x="-15" y="-15" width="30" height="30" rx="4" fill={`url(#${id}-g)`} />
        <rect x="-15" y="-15" width="30" height="30" rx="4" fill={`url(#${id}-g)`} transform="rotate(45)" />
        <circle r="10.5" fill="#04060c" />
        <path d="M2.6 -8.5 L-5 1.2 H-0.6 L-2.6 8.5 L5 -1.4 H0.6 Z" fill={`url(#${id}-g)`} />
      </g>
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  const [a, b] = BRAND.wordmark;
  return (
    <span className="lp-logo">
      <LogoMark size={size} />
      <span className="lp-logo-word">
        <span className="lp-logo-a">{a}</span>
        <span>{b}</span>
      </span>
    </span>
  );
}

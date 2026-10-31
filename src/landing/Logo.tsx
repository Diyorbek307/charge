import { useId } from 'react';

/**
 * The V of the mark: a dark left stroke and, laid over the right one, a
 * yellow blade that runs past it to the top right. Drawn in a box of about
 * 24–94 × 14–75, the same units as the wordmark below.
 */
export const V_STROKE = 'M32.5 28.5 L52 64.5 L62 50';
export const V_BLADE = 'M50.5 52 L66.5 22.5 C70 16.5 74 14.5 80 14.5 L91 14.5 C92.8 14.5 93.6 16.3 92.7 17.8 L66 63 C62 69 57.5 70 54 69 C49.5 67.5 48 58 50.5 52 Z';
const V_SHINE = 'M58 56 L71 31 C74 25.5 78 23 84 23 L87.5 23 L66.5 59.5 C63.5 64 59.5 63 58 56 Z';

/** Gradients for the blade and the dot of the i, light at the top as on the brand sheet. */
function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}b`} x1="0.2" y1="1" x2="0.8" y2="0">
        <stop offset="0" stopColor="#E09A00" />
        <stop offset="0.45" stopColor="#FFC83D" />
        <stop offset="1" stopColor="#FFE58A" />
      </linearGradient>
      <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFE58A" />
        <stop offset="1" stopColor="#F2AE00" />
      </linearGradient>
    </defs>
  );
}

/** The V: `ink` is the colour of its left stroke. */
function V({ id, ink }: { id: string; ink: string }) {
  return (
    <>
      <path d={V_STROKE} fill="none" stroke={ink} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <path d={V_BLADE} fill={`url(#${id}b)`} />
      <path d={V_SHINE} fill="#FFF3C4" opacity="0.45" />
    </>
  );
}

/**
 * Brand mark: the V on a black rounded square, the app icon in small. The
 * yellow blade reads on white and on black, and at favicon size.
 */
export function LogoMark({ size = 32 }: { size?: number; id?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <Defs id={id} />
      <rect width="48" height="48" rx="12" fill="#111111" />
      <g transform="translate(24 24.5) scale(0.6) translate(-58.5 -44.5)">
        <V id={id} ink="#FFFFFF" />
      </g>
    </svg>
  );
}

/** The wordmark «Voli»: `size` is its height; `ink` its letters (white on dark). */
export function Logo({ size = 30, ink = '#111111' }: { size?: number; ink?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className="lp-logo">
      <svg height={size} viewBox="22 12 134 64" role="img" aria-label="Voli" style={{ width: 'auto', display: 'block' }}>
        <Defs id={id} />
        <V id={id} ink={ink} />
        <path fillRule="evenodd" fill={ink} d="M77.3 55.5 a20.7 19.3 0 1 0 41.4 0 a20.7 19.3 0 1 0 -41.4 0 Z M89.3 55.5 a8.7 8.6 0 1 0 17.4 0 a8.7 8.6 0 1 0 -17.4 0 Z" />
        <rect x="121.2" y="23.5" width="13.6" height="51" rx="5" fill={ink} />
        <rect x="139.7" y="37" width="13.6" height="37.5" rx="5" fill={ink} />
        <circle cx="146.5" cy="28.5" r="6.6" fill={`url(#${id}d)`} />
      </svg>
    </span>
  );
}

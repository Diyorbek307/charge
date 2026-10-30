import { BRAND } from '../brand';

/** The V of the mark, its right stroke kinked like a lightning bolt (48×48 box). */
export const V_PATH = 'M8 11 H17.5 L24.5 27 L31.5 9 H41 L34 24.5 H38 L27.5 39.5 H21 Z';

/**
 * Brand mark: a black V-bolt on a yellow rounded square — readable on white
 * and on black, and at favicon size.
 */
export function LogoMark({ size = 32 }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#FFC83D" />
      <path d={V_PATH} fill="#111111" />
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

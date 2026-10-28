import { BRAND } from '../brand';

/** The bolt drawn in the mark and the app icons (48×48 box). */
export const BOLT_PATH = 'M28.5 6 L12.5 27.5 H22.5 L19 42 L35.5 19.5 H25.5 Z';

/**
 * Brand mark: a black lightning bolt on a yellow rounded square — readable on
 * white and on black, and at favicon size.
 */
export function LogoMark({ size = 32, id: _id }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#FFC83D" />
      <path d={BOLT_PATH} fill="#111111" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  const [a, b] = BRAND.wordmark;
  return (
    <span className="lp-logo">
      <LogoMark size={size} />
      <span className="lp-logo-word">
        <span>{a}</span>
        <span className="lp-logo-a">{b}</span>
      </span>
    </span>
  );
}

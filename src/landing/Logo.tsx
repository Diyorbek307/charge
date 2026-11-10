/** The owner's logo, transparent, and its width / height. */
export const MARK_SRC = '/brand/voli-mark.png';
const RATIO = 837 / 608;

/** Brand mark: the green V on a near-black rounded square, the app icon in small. */
export function LogoMark({ size = 32 }: { size?: number; id?: string }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size * 0.25, background: '#060B0A', display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
      <img src={MARK_SRC} alt="" width={Math.round(size * 0.84)} height={Math.round((size * 0.84) / RATIO)} style={{ display: 'block' }} />
    </span>
  );
}

/** The logo «voli»: the V and the word. `size` is its height; `ink` the letters (white on dark). */
export function Logo({ size = 36, ink = '#111111' }: { size?: number; ink?: string }) {
  return (
    <span className="lp-logo" role="img" aria-label="Voli" style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.18, lineHeight: 1 }}>
      <img src={MARK_SRC} alt="" height={size} width={Math.round(size * RATIO)} style={{ display: 'block', height: size, width: 'auto' }} />
      <span style={{ color: ink, fontSize: size * 0.98, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.03em', fontFamily: 'Inter, system-ui, sans-serif', marginTop: -size * 0.06 }}>voli</span>
    </span>
  );
}

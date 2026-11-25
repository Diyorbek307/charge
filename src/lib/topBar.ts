import { useEffect, useRef, useState } from 'react';
import { inNativeShell } from './site';

/**
 * The strip under the phone's clock. On a phone the page runs under the status bar and the
 * driver frame keeps the app below it with a safe-area padding (`.safe-top`); that strip takes
 * the colour of the screen showing, and in the store app the clock turns white over dark
 * screens and black over light ones.
 *
 * Screens say their colour with useTopBar / <TopBar>; the one shown last wins (an overlay over
 * a screen), and when it closes the strip goes back to the screen under it.
 */
type Bar = { color: string; dark: boolean };
const shown: Bar[] = [];
let clock = '';

/** How far the page reaches under the status bar; 0 when the phone keeps it out itself. */
function underStatusBar(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:max(env(safe-area-inset-top), var(--safe-area-inset-top, 0px))';
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return inset;
}

function apply() {
  const bar = shown[shown.length - 1];
  if (!bar) return;
  document.documentElement.style.setProperty('--topbar', bar.color);
  // Only where the page itself draws under the clock: elsewhere the strip is the phone's own and its clock stays as it is.
  if (!inNativeShell() || underStatusBar() <= 0) return;
  const style = bar.dark ? 'DARK' : 'LIGHT';
  if (style === clock) return;
  clock = style;
  void import('@capacitor/core')
    .then(({ SystemBars, SystemBarsStyle }) => SystemBars.setStyle({ style: bar.dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }))
    .catch(() => { clock = ''; });
}

/** Paints the strip under the clock while this screen is shown; `dark` turns the clock white. */
export function useTopBar(color: string, dark: boolean) {
  const bar = useRef<Bar>({ color, dark });
  useEffect(() => {
    const mine = bar.current;
    shown.push(mine);
    apply();
    return () => {
      const i = shown.indexOf(mine);
      if (i >= 0) shown.splice(i, 1);
      apply();
    };
  }, []);
  useEffect(() => {
    bar.current.color = color;
    bar.current.dark = dark;
    apply();
  }, [color, dark]);
}

/** The same as a component, for a screen rendered conditionally. */
export function TopBar({ color, dark }: Bar) {
  useTopBar(color, dark);
  return null;
}

/** The strip under a dimmed backdrop (a bottom sheet): the colour under it, darkened as much as the backdrop. */
export function DimTopBar({ by }: { by: number }) {
  const [color] = useState(() => {
    const under = shown[shown.length - 1]?.color ?? '#ffffff';
    const m = /^#([0-9a-f]{6})$/i.exec(under.trim());
    if (!m) return under;
    const n = parseInt(m[1], 16);
    const ch = (v: number) => Math.round(v * (1 - by)).toString(16).padStart(2, '0');
    return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
  });
  useTopBar(color, true);
  return null;
}

let bleeding = 0;
/** While shown, this screen fills the phone up to the top edge, under the clock and the camera (see .pg-bleed). */
export function useFullBleed(on = true) {
  useEffect(() => {
    if (!on) return;
    bleeding++;
    document.documentElement.classList.add('pg-bleed');
    return () => {
      bleeding = Math.max(0, bleeding - 1);
      if (!bleeding) document.documentElement.classList.remove('pg-bleed');
    };
  }, [on]);
}

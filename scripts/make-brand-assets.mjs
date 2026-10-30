/**
 * Renders the brand mark into every icon the product ships: the favicon, the
 * PWA and Apple touch icons, the Android launcher icons and splash screens,
 * the iOS app icon and splash, and captures the landing hero as the Open
 * Graph preview image.
 *
 * Needs the app running for the preview (npm run build && npm start), then:
 *   node scripts/make-brand-assets.mjs
 * Env: URL (default http://localhost:3000/), PW_CHANNEL (e.g. msedge) to use
 * an installed browser instead of Playwright's own Chromium, NO_OG=1 to skip
 * the preview image.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const url = process.env.URL ?? 'http://localhost:3000/';

// Same drawing as LogoMark in src/landing/Logo.tsx.
const V = 'M8 11 H17.5 L24.5 27 L31.5 9 H41 L34 24.5 H38 L27.5 39.5 H21 Z';
const YELLOW = '#FFC83D';
const INK = '#111111';

/**
 * The mark as SVG. `bleed` fills the whole square with no rounding (launchers
 * and iOS round it themselves); `scale` shrinks the V into the maskable safe
 * zone; `bg: false` leaves the square transparent (Android's foreground layer).
 */
const mark = ({ bleed = false, scale = 1, bg = true, size } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"${size ? ` width="${size}" height="${size}"` : ''}>
${bg ? `<rect width="48" height="48"${bleed ? '' : ' rx="12"'} fill="${YELLOW}"/>` : ''}
<path d="${V}" fill="${INK}" transform="translate(24 24) scale(${scale}) translate(-24 -24)"/>
</svg>`;

writeFileSync(join(pub, 'favicon.svg'), mark());

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** Draws `html` on a w×h canvas of colour `bg` (or transparent) into `file`. */
async function render(file, w, h, html, bg = 'transparent') {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;width:${w}px;height:${h}px;background:${bg}}svg{display:block}</style>${html}`);
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
}
const centred = (w, h, s) => `<div style="width:${w}px;height:${h}px;display:grid;place-items:center">${mark({ size: s })}</div>`;

/** Width and height of a PNG, from its header. */
const pngSize = file => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const walk = dir => readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

// Web: the yellow square with a safe margin, so the PWA icons also work as maskable icons.
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await render(join(pub, file), size, size, mark({ bleed: true, scale: 0.78, size }), YELLOW);
}

// Android: each file redrawn at the size it already has.
const res = join(root, 'android/app/src/main/res');
for (const file of walk(res).filter(f => f.endsWith('.png'))) {
  const [w, h] = pngSize(file);
  if (file.endsWith('ic_launcher_foreground.png')) {
    // The adaptive icon's top layer: the V alone, inside the 66/108 safe zone.
    await render(file, w, h, mark({ bg: false, scale: 0.6, size: w }));
  } else if (file.endsWith('ic_launcher_round.png')) {
    await render(file, w, h, `<div style="width:${w}px;height:${h}px;border-radius:50%;overflow:hidden">${mark({ bleed: true, scale: 0.72, size: w })}</div>`);
  } else if (file.endsWith('ic_launcher.png')) {
    await render(file, w, h, mark({ scale: 0.86, size: w }));
  } else if (file.endsWith('splash.png')) {
    await render(file, w, h, centred(w, h, Math.round(Math.min(w, h) * 0.3)), INK);
  }
}
const bgXml = join(res, 'values/ic_launcher_background.xml');
writeFileSync(bgXml, readFileSync(bgXml, 'utf8').replace(/#[0-9A-Fa-f]{6}/, YELLOW));

// iOS: a full-bleed app icon and the splash.
const assets = join(root, 'ios/App/App/Assets.xcassets');
await render(join(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024, 1024, mark({ bleed: true, scale: 0.78, size: 1024 }), YELLOW);
for (const file of walk(join(assets, 'Splash.imageset')).filter(f => f.endsWith('.png'))) {
  const [w, h] = pngSize(file);
  await render(file, w, h, centred(w, h, Math.round(Math.min(w, h) * 0.22)), INK);
}

if (!process.env.NO_OG) {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.addStyleTag({ content: '.lp-nav-right .lp-btn, .lp-scroll, .lp-hero-foot { display: none !important; }' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(pub, 'og-image.png') });
}

await browser.close();
console.log('wrote the web, Android and iOS icons and splashes' + (process.env.NO_OG ? '' : ', and og-image.png'));

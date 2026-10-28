/**
 * Renders the brand mark into the favicon, PWA and Apple touch icons, and
 * captures the landing hero as the Open Graph preview image.
 *
 * Needs the app running for the preview (npm run build && npm start), then:
 *   node scripts/make-brand-assets.mjs
 * Env: URL (default http://localhost:3000/), PW_CHANNEL (e.g. msedge) to use
 * an installed browser instead of Playwright's own Chromium.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const url = process.env.URL ?? 'http://localhost:3000/';

// Same drawing as LogoMark in src/landing/Logo.tsx.
// App icons fill the whole square (launchers round it themselves) and keep the
// bolt inside the maskable safe zone.
const BOLT = 'M28.5 6 L12.5 27.5 H22.5 L19 42 L35.5 19.5 H25.5 Z';
const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<rect width="48" height="48"${bg ? '' : ' rx="12"'} fill="#FFC83D"/>
<path d="${BOLT}" fill="#111111"${bg ? ' transform="translate(24 24) scale(.78) translate(-24 -24)"' : ''}/>
</svg>`;

writeFileSync(join(pub, 'favicon.svg'), mark(false));

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

// Icons are the yellow brand square with a safe margin, so they also
// work as maskable icons that launchers crop to a circle.
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:#FFC83D}svg{display:block;width:${size}px;height:${size}px}</style>${mark(true)}`);
  await page.screenshot({ path: join(pub, file) });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.addStyleTag({ content: '.lp-nav-right .lp-btn, .lp-scroll, .lp-hero-foot { display: none !important; }' });
await page.waitForTimeout(500);
await page.screenshot({ path: join(pub, 'og-image.png') });

await browser.close();
console.log('wrote favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png');

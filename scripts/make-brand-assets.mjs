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
const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3BF0C8"/><stop offset=".55" stop-color="#4CC9F0"/><stop offset="1" stop-color="#FFC857"/></linearGradient></defs>
${bg ? '<rect width="48" height="48" fill="#04060c"/>' : ''}
<g transform="translate(24 24)${bg ? ' scale(.72)' : ''}">
<rect x="-15" y="-15" width="30" height="30" rx="4" fill="url(#g)"/>
<rect x="-15" y="-15" width="30" height="30" rx="4" fill="url(#g)" transform="rotate(45)"/>
<circle r="10.5" fill="#04060c"/>
<path d="M2.6 -8.5 L-5 1.2 H-0.6 L-2.6 8.5 L5 -1.4 H0.6 Z" fill="url(#g)"/>
</g></svg>`;

writeFileSync(join(pub, 'favicon.svg'), mark(false));

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

// Icons sit on the dark brand background with a safe margin, so they also
// work as maskable icons that launchers crop to a circle.
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:#04060c}svg{display:block;width:${size}px;height:${size}px}</style>${mark(true)}`);
  await page.screenshot({ path: join(pub, file) });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.addStyleTag({ content: '.lp-nav-right .lp-btn, .lp-scroll, .lp-hero-foot { display: none !important; }' });
await page.waitForTimeout(500);
await page.screenshot({ path: join(pub, 'og-image.png') });

await browser.close();
console.log('wrote favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png');

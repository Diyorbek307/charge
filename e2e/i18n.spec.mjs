import { test, expect } from '@playwright/test';
import { resetDemo, signIn } from './helpers.mjs';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

/** Share of letters on the page that are Cyrillic. */
const cyrillicShare = page =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    const cyr = text.match(/[А-Яа-яЁё]/g)?.length ?? 0;
    return letters ? cyr / letters : 0;
  });

for (const lang of ['en', 'uz']) {
  test(`the operator dashboard renders in ${lang} and switches back to Russian`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('oc-lang', l), lang);
    await signIn(page, 'operator');
    await expect(page.locator('main, [class*="overflow"]').first()).toBeVisible();

    // Translation is applied as the dashboard renders; give lazy phrase tables a moment.
    await expect.poll(() => cyrillicShare(page), { timeout: 10_000 }).toBeLessThan(0.03);

    for (const section of lang === 'en' ? ['Sessions', 'Alerts', 'Finance'] : ['Seanslar', 'Ogohlantirishlar', 'Moliya']) {
      await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click();
      await expect.poll(() => cyrillicShare(page), { timeout: 10_000 }).toBeLessThan(0.03);
    }

    await page.evaluate(() => {
      localStorage.setItem('oc-lang', 'ru');
      window.dispatchEvent(new CustomEvent('oc-lang-change', { detail: { lang: 'ru' } }));
    });
    await expect.poll(() => cyrillicShare(page), { timeout: 10_000 }).toBeGreaterThan(0.5);
  });
}

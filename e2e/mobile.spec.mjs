import { test, expect } from '@playwright/test';
import { resetDemo, signIn, skipOnboarding, openStation } from './helpers.mjs';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('dashboards do not overflow horizontally on a phone', async ({ page }) => {
  await signIn(page, 'operator');
  for (const section of ['Дашборд', 'Станции', 'Сессии', 'Оповещения', 'Финансы']) {
    // On a phone the sidebar lives off-canvas behind the menu button; it
    // closes again after each navigation.
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${section} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('the fleet portal fits a phone on every page', async ({ page }) => {
  await signIn(page, 'business');
  for (const section of ['Дашборд', 'Автопарк', 'Сотрудники', 'Расходы', 'Счёт и оплата', 'Настройки']) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${section} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('the driver app fills a phone screen and every tab stays in view', async ({ page }) => {
  await signIn(page, 'driver');
  await skipOnboarding(page);
  for (const tab of ['Зарядка', 'Скидки', 'Профиль', 'Карта']) {
    await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).click();
    const box = await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).boundingBox();
    const width = page.viewportSize().width;
    expect(box.x, `${tab} tab is off screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${tab} tab is off screen`).toBeLessThanOrEqual(width + 1);
  }
});

test('on a phone the station card sits above the map, not under it', async ({ page }) => {
  await signIn(page, 'driver');
  await skipOnboarding(page);
  await openStation(page, 'Samarqand Gateway');
  // Leaflet's panes use z-index 400+. Unless the map is its own stacking context they paint over
  // the station card and the QR button — and tiles let taps through, so a hit test cannot tell.
  const contained = await page.evaluate(() => {
    const map = document.querySelector('.leaflet-container');
    for (let el = map?.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.isolation === 'isolate' || (cs.position !== 'static' && cs.zIndex !== 'auto')) return el.contains(map);
      if (el.querySelector(':scope > button, :scope > div > button')) break;
    }
    return false;
  });
  expect(contained, 'the map layers can cover the station card').toBe(true);
  await expect(page.getByRole('button', { name: /Начать зарядку|Встать в очередь|Ваша очередь/ }).first()).toBeVisible();
});

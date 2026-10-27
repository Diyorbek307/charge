import { test, expect } from '@playwright/test';
import { resetDemo, signIn, skipOnboarding } from './helpers.mjs';

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
  for (const tab of ['Поездки', 'Зарядка', 'История', 'Профиль', 'Карта']) {
    await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).click();
    const box = await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).boundingBox();
    const width = page.viewportSize().width;
    expect(box.x, `${tab} tab is off screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${tab} tab is off screen`).toBeLessThanOrEqual(width + 1);
  }
});

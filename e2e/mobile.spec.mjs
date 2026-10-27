import { test, expect } from '@playwright/test';
import { resetDemo, signIn } from './helpers.mjs';

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

import { test, expect } from '@playwright/test';
import { apiToken, resetDemo, signIn, skipOnboarding, openStation } from './helpers.mjs';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('landing page renders and switches language', async ({ page }) => {
  await page.goto('/');
  const changelog = page.getByRole('button', { name: /Отлично, поехали/ });
  if (await changelog.isVisible().catch(() => false)) await changelog.click();

  await expect(page.getByText('Одно приложение.')).toBeVisible();
  await page.getByRole('radio', { name: 'EN' }).click();
  await expect(page.getByText('One app.')).toBeVisible();
  await page.getByRole('radio', { name: 'UZ' }).click();
  await expect(page.getByText('Bitta ilova.')).toBeVisible();
});

test('a driver charges end to end and the session is billed', async ({ page, request }) => {
  await signIn(page, 'driver');
  await skipOnboarding(page);
  await openStation(page, 'Samarqand Gateway');

  await page.getByRole('button', { name: 'Начать зарядку' }).first().click();
  await page.getByRole('button', { name: 'Удалённо' }).click();
  await page.getByRole('button', { name: /Подтвердить и начать зарядку/ }).click();
  await expect(page.getByText(/ЗАРЯДКА АКТИВНА/i)).toBeVisible();

  const token = await apiToken(request, 'driver');
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  let state = await (await request.get('/api/state', auth)).json();
  const active = state.sessions.find(s => s.status === 'active');
  expect(active?.stationName).toBe('Samarqand Gateway');

  await page.getByRole('button', { name: 'Остановить зарядку' }).click();
  await expect(page.getByText('Зарядка завершена!')).toBeVisible();

  state = await (await request.get('/api/state', auth)).json();
  expect(state.sessions.find(s => s.id === active.id).status).toBe('completed');
  expect(state.transactions.some(t => t.sessionId === active.id)).toBeTruthy();
});

test('a wallet top-up goes through the Payme sandbox and credits the balance', async ({ page, request }) => {
  const token = await apiToken(request, 'driver');
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const before = (await (await request.get('/api/state', auth)).json()).wallets['acc-driver'].balance;

  await signIn(page, 'driver');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByText('Кошелёк', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Пополнить', exact: true }).click();
  await page.getByRole('button', { name: '50K' }).click();
  // The provider button's name includes its letter badge ("P Payme").
  await page.getByRole('button', { name: /Payme$/ }).click();
  await page.getByRole('button', { name: /Оплатить через Payme/ }).click();
  await expect(page.getByText('Пополнено успешно!')).toBeVisible();

  const after = (await (await request.get('/api/state', auth)).json()).wallets['acc-driver'].balance;
  expect(after).toBe(before + 50_000);
});

test("a driver's problem report reaches the operator's alerts", async ({ page, request }) => {
  const driver = await apiToken(request, 'driver');
  const report = await request.post('/api/stations/st-001/issues', {
    headers: { Authorization: `Bearer ${driver}` },
    data: { category: 'Коннектор не работает', details: 'e2e: разъём не блокируется' },
  });
  expect(report.ok()).toBeTruthy();

  await signIn(page, 'operator');
  await page.getByRole('button', { name: /^(Оповещения|Alerts|Ogohlantirishlar)/ }).click();
  await expect(page.getByText(/e2e: разъём не блокируется/)).toBeVisible();
});

test('an operator never sees a competitor network in the browser', async ({ page }) => {
  await signIn(page, 'operator'); // GreenCharge UZ, op-001
  const state = await page.evaluate(async () => {
    const token = localStorage.getItem('oc-token-operator');
    return (await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })).json();
  });
  expect(state.sessions.every(s => s.operatorId === 'op-001')).toBeTruthy();
  expect(Object.keys(state.wallets)).toHaveLength(0);
});

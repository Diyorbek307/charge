import { expect } from '@playwright/test';

export const CREDS = {
  driver: { login: '+998901234567', password: 'Driver2026' },
  operator: { login: 'operator@greencharge.uz', password: 'Operator2026' },
  admin: { login: 'admin@powergo.uz', password: 'Admin2026' },
  business: { login: 'fleet@uzauto.uz', password: 'Business2026' },
};

/** API login from the test runner, for setting up state or checking results. */
export async function apiToken(request, portal) {
  const res = await request.post('/api/auth/login', { data: { portal, ...CREDS[portal] } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

export async function resetDemo(request) {
  const token = await apiToken(request, 'admin');
  const res = await request.post('/api/admin/reset', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
}

/** This device has been through the first-run screens (they have a test of their own). */
export async function pastFirstRun(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('pg-first-run')) localStorage.setItem('pg-first-run', JSON.stringify({ version: 1, marketing: false, push: false, at: new Date().toISOString() }));
  });
}

/** Signs into a portal through its real login form. */
export async function signIn(page, portal) {
  await pastFirstRun(page);
  await page.goto(`/?portal=${portal}`);
  await page.locator(`#${portal}-login`).fill(CREDS[portal].login);
  await page.locator(`#${portal}-password`).fill(CREDS[portal].password);
  await page.getByRole('button', { name: /^(Войти|Sign in|Kirish)$/ }).click();
  await expect(page.locator(`#${portal}-login`)).toHaveCount(0);
}

/** After the first sign-in the Driver App asks about the car, then walks over the map; go past both. */
export async function skipOnboarding(page) {
  const appears = loc => loc.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  if (await appears(page.getByRole('heading', { name: 'Ваш автомобиль' }))) {
    await page.getByRole('button', { name: 'Добавить позже' }).click();
    await page.getByRole('button', { name: /^Готово — к карте/ }).click();
  }
  const skipTour = page.getByRole('button', { name: 'Пропустить обучение' });
  if (await appears(skipTour)) await skipTour.click();
  await expect(page.getByRole('dialog', { name: 'Обучение' })).toHaveCount(0);
}

/** Opens a station's sheet the way a driver would: search, then tap the result. */
export async function openStation(page, stationName) {
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск станции' }).fill(stationName);
  await page.getByRole('option', { name: new RegExp(stationName) }).first().click();
  await expect(page.getByRole('button', { name: /Начать зарядку|Встать в очередь|Ваша очередь/ }).first()).toBeVisible();
}

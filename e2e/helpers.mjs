import { expect } from '@playwright/test';

export const CREDS = {
  driver: { login: '+998901234567', password: 'Driver2026' },
  operator: { login: 'operator@greencharge.uz', password: 'Operator2026' },
  admin: { login: 'admin@onecharge.uz', password: 'Admin2026' },
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

/** Signs into a portal through its real login form. */
export async function signIn(page, portal) {
  await page.goto(`/?portal=${portal}`);
  await page.locator(`#${portal}-login`).fill(CREDS[portal].login);
  await page.locator(`#${portal}-password`).fill(CREDS[portal].password);
  await page.getByRole('button', { name: /^(Войти|Sign in|Kirish)$/ }).click();
  await expect(page.locator(`#${portal}-login`)).toHaveCount(0);
}

/** The Driver App shows a three-step first-run carousel; walk past it if it is there. */
export async function skipOnboarding(page) {
  const welcome = page.getByRole('heading', { name: /Добро пожаловать в ONE CHARGE/ });
  if (!(await welcome.isVisible({ timeout: 3000 }).catch(() => false))) return;
  for (let i = 0; i < 4; i++) {
    const next = page.getByRole('button', { name: /^(Далее|Готово — начать)/ });
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
  }
  await expect(page.getByRole('button', { name: /^Далее/ })).toHaveCount(0);
}

/** Opens a station's sheet the way a driver would: search, then tap the result. */
export async function openStation(page, stationName) {
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск станции' }).fill(stationName);
  await page.getByRole('option', { name: new RegExp(stationName) }).first().click();
  await expect(page.getByRole('button', { name: /Начать зарядку|Встать в очередь|Ваша очередь/ }).first()).toBeVisible();
}

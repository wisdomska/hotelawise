import { expect, test } from '@playwright/test';
import { makeUser } from './support/db';
import { totp } from './support/totp';

test.describe.configure({ mode: 'serial' });

const email = `esi+${Date.now()}@hotelawise.com`;
let secret = '';

test('first sign-in: new password, then TOTP enrolment, then the dashboard', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'account setup runs once');
  await makeUser({ email, role: 'super_admin', password: 'temporary1' });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('temporary1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/setup=change-password/);

  await page.getByLabel('Temporary password').fill('temporary1');
  await page.getByLabel('New password').fill('password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.locator('form [role=alert]')).toContainText('number');
  await page.getByLabel('New password').fill('akwaaba2026');
  await page.getByRole('button', { name: 'Save password' }).click();

  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
  await page.getByLabel('Password').fill('akwaaba2026');
  await page.getByRole('button', { name: 'Continue' }).click();
  secret = (await page.locator('code').innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you, Esi/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('link')).toHaveCount(14);
});

test('later sign-ins ask for the TOTP code', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium' || !secret, 'needs the enrolled account');
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form [role=alert]')).toContainText('don’t match');
  await page.getByLabel('Password').fill('akwaaba2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible();
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('form [role=alert]')).toBeVisible();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
});

test('staff see only their screens, and are refused a Super Admin URL', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'runs once');
  const staffEmail = `kojo+${Date.now()}@hotelawise.com`;
  await makeUser({ email: staffEmail, role: 'staff', password: 'temporary1' });
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(staffEmail);
  await page.getByLabel('Password').fill('temporary1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/setup=change-password/);
  await page.getByLabel('Temporary password').fill('temporary1');
  await page.getByLabel('New password').fill('adinkra2026');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you, Kojo/ })).toBeVisible();
  const links = page.getByRole('navigation', { name: 'Admin' }).getByRole('link');
  await expect(links).toHaveCount(8);
  await expect(links.filter({ hasText: 'Audit log' })).toHaveCount(0);
  const res = await page.goto('/admin/audit');
  expect(res?.status()).toBe(403);
  await expect(page.getByRole('heading', { name: /isn't part of your role/ })).toBeVisible();
});

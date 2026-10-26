import { expect, test } from '@playwright/test';
import { makeUser, setSetting } from './support/db';
import { totp } from './support/totp';

test.describe.configure({ mode: 'serial' });

// Two-step sign-in for Super Admins is a setting (D-42, off by default); these
// tests switch it on to cover the set-up flow, then put it back.
test.beforeAll(() => setSetting('security.requireTwoFactor', true));
test.afterAll(() => setSetting('security.requireTwoFactor', false));

const email = `esi+${Date.now()}@hotelawise.com`;
let secret = '';

test('first sign-in: new password, then TOTP enrolment, then the dashboard', async ({ page }) => {
  await makeUser({ email, role: 'super_admin', password: 'temporary1' });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('temporary1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/setup=change-password/);

  await page.getByLabel('Temporary password', { exact: true }).fill('temporary1');
  await page.getByLabel('New password', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.locator('form [role=alert]').first()).toContainText('number');
  await page.getByLabel('New password', { exact: true }).fill('akwaaba2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('akwaaba2026');
  await page.getByRole('button', { name: 'Save password' }).click();

  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('akwaaba2026');
  await page.getByRole('button', { name: 'Continue' }).click();
  secret = (await page.locator('code').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel('I’ve saved my backup codes somewhere safe.').check();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you, Esi/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Screens' }).getByRole('link')).toHaveCount(14);
});

test('later sign-ins ask for the TOTP code', async ({ page }) => {
  test.skip(!secret, 'needs the enrolled account');
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('don’t match');
  await page.getByLabel('Password', { exact: true }).fill('akwaaba2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  // Six digits submit on their own.
  await page.getByLabel('6-digit code').fill('000000');
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
});

test('staff see only their screens, and are refused a Super Admin URL', async ({ page }) => {
  const staffEmail = `kojo+${Date.now()}@hotelawise.com`;
  await makeUser({ email: staffEmail, role: 'staff', password: 'temporary1' });
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(staffEmail);
  await page.getByLabel('Password', { exact: true }).fill('temporary1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/setup=change-password/);
  await page.getByLabel('Temporary password', { exact: true }).fill('temporary1');
  await page.getByLabel('New password', { exact: true }).fill('adinkra2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('adinkra2026');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you, Kojo/ })).toBeVisible();
  const links = page.getByRole('navigation', { name: 'Screens' }).getByRole('link');
  await expect(links).toHaveCount(8);
  await expect(links.filter({ hasText: 'Audit log' })).toHaveCount(0);
  const res = await page.goto('/admin/audit');
  expect(res?.status()).toBe(403);
  await expect(page.getByRole('heading', { name: /isn't part of your role/ })).toBeVisible();
});

test('with two-step not required, a new Super Admin goes straight in after choosing a password', async ({ page }) => {
  await setSetting('security.requireTwoFactor', false);
  const e = `ama+${Date.now()}@hotelawise.com`;
  await makeUser({ email: e, role: 'super_admin', password: 'temporary1' });
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(e);
  await page.getByLabel('Password', { exact: true }).fill('temporary1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Temporary password', { exact: true }).fill('temporary1');
  await page.getByLabel('New password', { exact: true }).fill('akwaaba2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('akwaaba2026');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
});

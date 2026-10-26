import { expect, test, type Locator, type Page } from '@playwright/test';
import { clearSignInLimits, makeUser, setSetting } from './support/db';

// Every admin screen renders for a Super Admin, and the desk's main jobs work
// end to end against the real database.
test.describe.configure({ mode: 'serial' });
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'desktop Chromium only');

const email = `daniel+${Date.now()}@hotelawise.com`;
const PASSWORD = 'akwaaba2026';

async function signIn(page: Page, first: boolean) {
  await page.goto('/admin/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(first ? 'temporary1' : PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (first) {
    await page.getByLabel('Temporary password', { exact: true }).fill('temporary1');
    await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm new password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Save password' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}

/** The admin uses its own listbox select, not a native <select>. */
async function pick(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByRole('button', { name: new RegExp(`^${label} `) }).click();
  await page.getByRole('listbox', { name: label }).getByRole('option', { name: option }).click();
}

test.beforeAll(async () => {
  await setSetting('security.requireTwoFactor', false);
  await clearSignInLimits();
  await makeUser({ email, role: 'super_admin', password: 'temporary1' });
});

test('every screen opens', async ({ page }) => {
  await signIn(page, true);
  const screens: [string, RegExp][] = [
    ['/admin', /Good (morning|afternoon|evening)/],
    ['/admin/bookings', /Room bookings/],
    ['/admin/bookings?tab=Calendar', /Room bookings/],
    ['/admin/rooms', /Rooms & rates/],
    ['/admin/customers', /Customers/],
    ['/admin/inbox', /Inbox/],
    ['/admin/rentals', /Rental orders/],
    ['/admin/inventory', /Rental inventory/],
    ['/admin/venues', /Venues/],
    ['/admin/payments', /Payments/],
    ['/admin/reports', /Reports/],
    ['/admin/content', /Content/],
    ['/admin/settings', /Settings/],
    ['/admin/users', /Users/],
    ['/admin/audit', /Audit log/],
    ['/admin/account', /account/i],
  ];
  for (const [href, name] of screens) {
    const res = await page.goto(href);
    expect(res?.status(), href).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name }), href).toBeVisible();
    await expect(page.getByText('This screen is being built')).toHaveCount(0);
  }
});

test('desk booking: create a walk-in, check in, take payment', async ({ page }) => {
  await signIn(page, false);
  await page.goto('/admin/bookings');
  await page.getByRole('button', { name: 'New booking' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Guest name').fill('Yaw Darko');
  await dialog.getByLabel('Phone').fill('024 412 3456');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByLabel('Check-in')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await pick(page, dialog, 'Payment', 'Not paid yet');
  await dialog.getByRole('button', { name: /Create booking/ }).click();
  await expect(page.getByText(/AW-[A-Z0-9]+ created\./).first()).toBeVisible();

  // The new booking's drawer opens; check the guest in.
  const drawer = page.getByRole('dialog', { name: /Yaw Darko/ });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByText(/checked in/i).first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Take payment' }).click();
  const pay = page.getByRole('dialog').filter({ hasText: 'Record a payment' });
  await pay.getByLabel('Your password').fill(PASSWORD);
  await pay.getByRole('button', { name: /Record/ }).click();
  await expect(page.getByText('Payment recorded.').first()).toBeVisible();
});

test('rooms & rates: promo code and blocked dates', async ({ page }) => {
  await signIn(page, false);
  const code = `T${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await page.goto('/admin/rooms?tab=Promo+codes');
  await page.getByRole('button', { name: 'New promo code' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Code').fill(code);
  await d.getByLabel('Percentage', { exact: true }).fill('10');
  await d.getByRole('button', { name: 'Continue' }).click();
  await pick(page, d, 'Ends', 'No end date');
  await d.getByRole('button', { name: 'Save code' }).click();
  await expect(page.getByRole('cell', { name: code })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: code });
  await row.getByRole('button', { name: 'Pause code' }).click();
  await expect(row.getByText('Paused')).toBeVisible();
  await row.getByRole('button', { name: 'Delete code' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete code' }).click();
  await expect(page.getByRole('cell', { name: code })).toHaveCount(0);

  await page.goto('/admin/rooms?tab=Blocked+dates');
  await page.getByRole('button', { name: 'Block dates' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Repainting test');
  await page.getByRole('dialog').getByRole('button', { name: 'Block dates' }).click();
  const b = page.getByRole('row').filter({ hasText: 'Repainting test' });
  await expect(b).toBeVisible();
  await b.getByRole('button', { name: 'Unblock' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unblock' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Repainting test' })).toHaveCount(0);
});

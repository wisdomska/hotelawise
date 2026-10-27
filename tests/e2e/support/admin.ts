import { expect, type Page } from '@playwright/test';
import { makeUser } from './db';
import { ownAddress } from './ip';
import { totp } from './totp';

const TEMP = 'temporary1';
const PASSWORD = 'akwaaba2026';

/**
 * A Super Admin for one test file. `signIn` handles the first sign-in (new
 * password) and, because another file switches "require two-step sign-in" on
 * and off while this one runs, whichever step the login asks for next.
 */
export function superAdmin(prefix: string) {
  const email = `${prefix}+${Date.now()}@hotelawise.com`;
  let changed = false;
  let secret = '';
  return {
    email,
    password: PASSWORD,
    create: () => makeUser({ email, role: 'super_admin', password: TEMP }),
    async signIn(page: Page) {
      const first = !changed;
      await ownAddress(page);
      await page.goto('/admin/login');
      await page.getByLabel('Work email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(first ? TEMP : PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      if (first) {
        await page.getByLabel('Temporary password', { exact: true }).fill(TEMP);
        await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
        await page.getByLabel('Confirm new password', { exact: true }).fill(PASSWORD);
        await page.getByRole('button', { name: 'Save password' }).click();
        changed = true;
      }
      const home = page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ });
      const enrol = page.getByRole('heading', { name: 'Set up two-step sign-in' });
      const code = page.getByRole('heading', { name: 'Enter your code' });
      await expect(home.or(enrol).or(code)).toBeVisible();
      if (await enrol.isVisible()) {
        await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
        await page.getByRole('button', { name: 'Continue' }).click();
        secret = (await page.locator('code').innerText()).replace(/\s/g, '');
        await page.getByLabel('I’ve saved my backup codes somewhere safe.').check();
        await page.getByLabel('6-digit code').fill(totp(secret));
        await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
      } else if (await code.isVisible()) {
        await page.getByLabel('6-digit code').fill(totp(secret));
      }
      await expect(home).toBeVisible();
    },
  };
}

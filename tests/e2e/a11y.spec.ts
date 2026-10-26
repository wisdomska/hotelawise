// WCAG 2.2 AA checks with axe on every public page, plus the open overlays.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  '/',
  '/rooms',
  '/rooms/std',
  '/rooms/exe',
  '/gallery',
  '/contact',
  '/no-such-page',
  '/book',
  '/manage',
  '/rent',
  '/rent/checkout',
  '/venues',
];

async function audit(page: Page) {
  // The first-visit loader fades out; audit the page, not a frame of that animation.
  await expect(page.locator('.aw-boot')).toBeHidden();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}

for (const path of PAGES) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await audit(page);
  });
}

test('no axe violations with the lightbox open', async ({ page }) => {
  await page.goto('/rooms/vip');
  // Retry the click until hydration has wired it up.
  await expect(async () => {
    await page.getByRole('button', { name: 'Open photo gallery' }).click();
    await expect(page.getByRole('dialog', { name: 'Photo viewer' })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await audit(page);
});

test('no axe violations with contact form errors showing', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send to reception' }).click();
  await expect(page.locator('form [role=alert]').first()).toBeVisible();
  await audit(page);
});

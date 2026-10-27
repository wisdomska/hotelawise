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
  // Let the open animation settle so contrast is measured on the final frame.
  await page.getByRole('dialog', { name: 'Photo viewer' }).evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  await audit(page);
});

test('no axe violations with contact form errors showing', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send to reception' }).click();
  await expect(page.locator('form [role=alert]').first()).toBeVisible();
  await audit(page);
});

// WCAG 1.4.10 (reflow) and 1.4.12 (text spacing): at 320px wide, and with the
// user's own wider letter, word and line spacing, the page never scrolls sideways.
test.describe('reflow and text spacing', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop browsers resize to 320px');
  for (const path of PAGES) {
    test(`320px wide: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expect(page.locator('.aw-boot')).toBeHidden();
      const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await over(), 'reflow').toBeLessThanOrEqual(0);
      await page.addStyleTag({
        content:
          '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
      });
      expect(await over(), 'text spacing').toBeLessThanOrEqual(0);
    });
  }
});

test('keyboard: the first Tab reaches a visible skip link that jumps to the content', async ({ page }) => {
  await page.goto('/rooms');
  await expect(page.locator('.aw-boot')).toBeHidden();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  expect(await page.evaluate(() => document.getElementById('main') !== null)).toBe(true);
});

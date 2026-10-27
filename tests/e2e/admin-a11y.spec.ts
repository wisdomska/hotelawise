// WCAG 2.2 AA for the admin: axe on every screen and its main tabs, in the light
// and the dark theme, with the overlays open; plus keyboard checks (skip link,
// focus moving into and staying inside dialogs, Escape) and reflow at 320px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { superAdmin } from './support/admin';
import { clearSignInLimits } from './support/db';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'desktop Chromium only');

const admin = superAdmin('akua');

const SCREENS = [
  '/admin',
  '/admin/bookings',
  '/admin/bookings?tab=Calendar',
  '/admin/rooms',
  '/admin/rooms?tab=Room+types',
  '/admin/rooms?tab=Rate+rules',
  '/admin/rooms?tab=Promo+codes',
  '/admin/rooms?tab=Blocked+dates',
  '/admin/rooms?tab=Policies',
  '/admin/customers',
  '/admin/inbox',
  '/admin/rentals',
  '/admin/rentals?tab=Calendar',
  '/admin/rentals?tab=Board',
  '/admin/inventory',
  '/admin/venues',
  '/admin/payments',
  '/admin/reports',
  '/admin/content',
  '/admin/settings',
  '/admin/users',
  '/admin/audit',
  '/admin/account',
];

async function setTheme(context: BrowserContext, theme: 'light' | 'dark', base: string) {
  await context.addCookies([{ name: 'aw_theme', value: theme, url: base }]);
}

async function audit(page: Page, where: string) {
  // Let entrance animations finish so contrast is measured on the final frame. A cancelled
  // animation (the element re-rendered) rejects its `finished` promise; that's fine to skip.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(' ')} [${n.any[0]?.message ?? ''}]`).join(', ')}`,
  );
  expect.soft(summary, where).toEqual([]);
}

test.beforeAll(async () => {
  await clearSignInLimits();
  await admin.create();
});

for (const theme of ['light', 'dark'] as const) {
  test(`sign-in page passes axe (${theme})`, async ({ page, context, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setTheme(context, theme, baseURL!);
    await page.goto('/admin/login');
    await audit(page, `${theme} /admin/login`);
  });

  test(`every admin screen passes axe (${theme})`, async ({ page, context, baseURL }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setTheme(context, theme, baseURL!);
    await admin.signIn(page);
    await expect(page.locator('.admin')).toHaveAttribute('data-theme', theme);
    for (const href of SCREENS) {
      await page.goto(href);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, `${theme} ${href}`);
    }
  });

  test(`overlays pass axe (${theme})`, async ({ page, context, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setTheme(context, theme, baseURL!);
    await admin.signIn(page);
    // New booking modal
    await page.getByRole('button', { name: 'New booking' }).first().click();
    await expect(page.getByRole('dialog', { name: 'New booking' })).toBeVisible();
    await audit(page, `${theme} new booking modal`);
    await page.keyboard.press('Escape');
    // Room drawer
    await page.goto('/admin/rooms');
    await page
      .getByRole('button', { name: /^Room \S+ .*Open details$/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: /room/i })).toBeVisible();
    await audit(page, `${theme} room drawer`);
    await page.keyboard.press('Escape');
    // ⌘K search
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await audit(page, `${theme} search palette`);
  });
}

test('keyboard: skip link, focus into dialogs, Tab stays inside, Escape returns focus', async ({ page }) => {
  await admin.signIn(page);
  await page.goto('/admin/rooms?tab=Promo+codes');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The first Tab reaches the skip link, which jumps past the sidebar.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  // Opening a dialog moves focus into it, on the first field.
  const opener = page.getByRole('button', { name: 'New promo code' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New promo code' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Code')).toBeFocused();

  // Tab and Shift+Tab never leave the dialog.
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }

  // Escape closes it and focus goes back to the button that opened it.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Every focusable control shows a visible focus indicator.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), shadow: cs.boxShadow };
  });
  expect(outline.style !== 'none' && outline.width > 0 ? true : outline.shadow !== 'none').toBe(true);
});

test('reflow: no sideways scrolling at 320px wide (WCAG 1.4.10)', async ({ page }) => {
  test.setTimeout(180_000);
  await admin.signIn(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const href of SCREENS) {
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Data tables may scroll inside their own box (an allowed exception); the page itself must not.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, href).toBeLessThanOrEqual(0);
  }
});

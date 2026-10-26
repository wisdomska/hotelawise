// Visual regression for the public pages at desktop and phone sizes. Baselines
// were checked against design/reference-screens when they were recorded; any
// later pixel drift fails here. Update on purpose with:
//   pnpm build && pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots
import { expect, test } from '@playwright/test';

const PAGES = [
  ['home', '/'],
  ['rooms', '/rooms'],
  ['room-exe', '/rooms/exe'],
  ['gallery', '/gallery'],
  ['contact', '/contact'],
  ['404', '/no-such-page'],
] as const;

test.describe('visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are recorded in Chromium only');

  for (const [name, path] of PAGES) {
    test(name, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Skip the first-visit loader.
      await page.addInitScript(() => sessionStorage.setItem('aw.booted', '1'));
      await page.goto(path);
      // Load every lazy image, then return to the top.
      // Images in sideways scrollers stay lazy until swiped; load them all for the capture.
      await page.evaluate(() =>
        document.querySelectorAll('img[loading=lazy]').forEach((img) => ((img as HTMLImageElement).loading = 'eager')),
      );
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        window.scrollTo(0, 0);
      });
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              [...document.images].filter((img) => img.getClientRects().length > 0).every((img) => img.complete && img.naturalWidth > 0),
            ),
          { timeout: 20_000 },
        )
        .toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        animations: 'disabled',
        // Dates default to today; the clock and tonight's counts move on their own.
        mask: [page.locator('[aria-haspopup=dialog]'), page.getByText(/left tonight|last one tonight|sold out tonight/i)],
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});

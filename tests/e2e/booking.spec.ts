import { expect, test } from '@playwright/test';
import { plantGuestCode } from './support/db';

// Each run books Standard rooms on its own far-future dates so runs never collide.
function stayDates(seed: number) {
  const d = new Date(Date.UTC(2028, 0, 1) + ((Date.now() / 1000 + seed * 977) % 600) * 86_400_000);
  const ci = d.toISOString().slice(0, 10);
  const co = new Date(d.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  return { ci, co };
}

test('book a room, pay at the hotel, then manage it with a texted code', async ({ page, isMobile }, info) => {
  const { ci, co } = stayDates(info.parallelIndex + info.repeatEachIndex + (isMobile ? 7 : 0) + info.project.name.length);
  await page.goto(`/book?ci=${ci}&co=${co}&g=2&room=STD`);
  const continueBtn = isMobile
    ? page.locator('.aw-mobile-bar button')
    : page.getByRole('complementary', { name: 'Booking summary' }).getByRole('button', { name: /Continue/ });
  await expect(page.getByRole('radio', { name: /Standard/ })).toBeEnabled();
  await continueBtn.click();
  await expect(page.getByRole('timer')).toContainText('Room held for you');

  await continueBtn.click();
  await expect(page.locator('#bk-name-err')).toHaveText('We’ll need a name for the key.');
  await page.getByPlaceholder('e.g. Kofi Mensah').fill('Ama Owusu');
  await page.locator('#bk-phone').fill('024 412 3456');
  await continueBtn.click();

  await expect(page.getByRole('heading', { name: /Settle up/ })).toBeVisible();
  await page.getByRole('radio', { name: /Pay at the hotel/ }).click();
  await (isMobile ? page.locator('.aw-mobile-bar button') : page.getByRole('button', { name: 'Confirm booking' })).click();

  await expect(page).toHaveURL(/\/book\/confirmation\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('booked');
  const ref = (await page.getByText(/^AW-[2-9A-Z]{4,7}$/).innerText()).trim();
  await expect(page.getByText('CONFIRMED · PAY AT HOTEL')).toBeVisible();
  const ics = await page.request.get(
    await page
      .getByRole('link', { name: 'Add to calendar' })
      .getAttribute('href')
      .then((h) => h!),
  );
  expect(await ics.text()).toContain(`DTSTART;VALUE=DATE:${ci.replace(/-/g, '')}`);

  await page.getByRole('main').getByRole('link', { name: 'Manage booking' }).last().click();
  await page.locator('input[type=tel]').fill('0244123456');
  await page.getByRole('button', { name: 'Find my booking' }).click();
  await expect(page.getByText(/6-digit code/)).toBeVisible();
  await plantGuestCode(ref, '482916');
  await page.getByPlaceholder('••••••').fill('482916');
  await page.getByRole('button', { name: 'Open my booking' }).click();
  await expect(page.getByText(ref, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('This booking is cancelled')).toBeVisible();
});

test('the hold expires gracefully and can be renewed', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'clock control once is enough');
  const { ci, co } = stayDates(42);
  await page.clock.install();
  await page.goto(`/book?ci=${ci}&co=${co}&g=1&room=STD`);
  await expect(page.getByRole('radio', { name: /Standard/ })).toBeEnabled();
  await page
    .getByRole('complementary', { name: 'Booking summary' })
    .getByRole('button', { name: /Continue/ })
    .click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('16:00');
  await expect(page.getByText('Your 15-minute hold ran out.')).toBeVisible();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
});

test('manage refuses a reference and phone that do not match', async ({ page }) => {
  await page.goto('/manage');
  await page.getByPlaceholder('AW-XXXX').fill('AW-ZZZZ');
  await page.locator('input[type=tel]').fill('0244123456');
  await page.getByRole('button', { name: 'Find my booking' }).click();
  await expect(page.locator('form [role=alert]')).toContainText("We couldn't find a booking with that reference and phone number.");
});

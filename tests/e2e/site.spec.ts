import { expect, test } from '@playwright/test';

test.describe('rooms', () => {
  test('guest and budget filters narrow the list, and Clear filters brings it back', async ({ page }) => {
    await page.goto('/rooms');
    const count = page.getByText(/of 4 room types/);
    await expect(count).toHaveText('4 of 4 room types');
    await page.getByRole('button', { name: '3–4' }).click();
    await expect(count).toHaveText('1 of 4 room types');
    await page.getByRole('button', { name: '≤ 200' }).click();
    await expect(page.getByText('0 ROOMS MATCH')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(count).toHaveText('4 of 4 room types');
  });

  test('room page prices the stay and carries the choices to checkout', async ({ page, isMobile }) => {
    await page.goto('/rooms/exe?ci=2027-02-10&co=2027-02-13&g=2');
    if (isMobile) await page.getByRole('button', { name: 'Reserve', exact: true }).click();
    const card = page.getByRole('complementary', { name: 'Reserve this room' });
    await card.getByRole('radio', { name: /Executive Plus/ }).click();
    await card.getByLabel(/Breakfast/).check();
    await expect(card).toContainText('EXECUTIVE PLUS × 3 nights');
    await expect(card).toContainText('BREAKFAST × 2 × 3');
    await expect(card.getByRole('link', { name: /Continue to book/ })).toHaveAttribute(
      'href',
      '/book?ci=2027-02-10&co=2027-02-13&g=2&room=EXE&tier=1&bf=1&rs=0',
    );
  });

  test('the lightbox steps through photos and closes on Escape', async ({ page }) => {
    await page.goto('/rooms/vip');
    await page.getByRole('button', { name: 'Open photo gallery' }).click();
    const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
    await expect(viewer).toContainText('1 / 4');
    await viewer.getByRole('button', { name: 'Next photo' }).click();
    await expect(viewer).toContainText('2 / 4');
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
  });
});

test('gallery filters by category', async ({ page }) => {
  await page.goto('/gallery');
  await page.getByRole('button', { name: /^Bathrooms/ }).click();
  await expect(page.getByRole('button', { name: /^Open photo:/ })).toHaveCount(4);
});

test.describe('contact', () => {
  test('shows each mistake in the prototype’s words', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: 'Send to reception' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText([
      'We’d like to know who we’re talking to.',
      'Enter a Ghana mobile number, like 055 555 7090.',
      'A few more words, please.',
    ]);
  });

  test('sends a message to reception', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'one real message per run');
    await page.goto('/contact');
    await page.getByRole('radio', { name: 'Special request' }).click();
    await page.getByPlaceholder('e.g. Ama Owusu').fill('Ama Owusu');
    await page.locator('[name=phone]').fill('024 412 3456');
    await page.locator('[name=message]').fill('We land at 2am on Friday. Can someone meet us at the gate?');
    await page.getByRole('button', { name: 'Send to reception' }).click();
    await expect(page.getByText('Message sent.')).toBeVisible();
  });
});

test('an unknown address shows the 404 with the four rooms', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText("This room doesn't exist.");
  await expect(page.getByRole('link', { name: /Room, GHS/ })).toHaveCount(4);
});

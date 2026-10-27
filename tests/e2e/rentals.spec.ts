import { expect, test } from '@playwright/test';

// Each run rents on its own far-future date so stock never runs out between runs.
function eventDate(seed: number) {
  return new Date(Date.UTC(2029, 0, 1) + ((Math.floor(Date.now() / 1000) + seed * 613) % 700) * 86_400_000).toISOString().slice(0, 10);
}

test('reserve rentals to collect and pay at pickup', async ({ page, isMobile }, info) => {
  const date = eventDate([...info.project.name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 997);
  await page.goto(`/rent?date=${date}`);
  const canopies = page.getByRole('group', { name: 'Canopy quantity' });
  await expect(canopies.getByRole('button', { name: 'More canopys' })).toBeEnabled();
  await canopies.getByRole('button', { name: 'More canopys' }).click();
  await canopies.getByRole('button', { name: 'More canopys' }).click();
  await canopies.getByRole('textbox', { name: 'Quantity' }).fill('9999');
  await expect(page.locator('article [role=alert]').first()).toContainText('free for those dates');

  const go = isMobile
    ? page.locator('.aw-mobile-bar button')
    : page.getByRole('complementary', { name: 'Your reservation' }).getByRole('button', { name: /Continue/ });
  await go.click();
  await expect(page).toHaveURL(/\/rent\/checkout/);
  const next = isMobile
    ? page.locator('.aw-mobile-bar button')
    : page.getByRole('complementary', { name: 'Order summary' }).getByRole('button', { name: /Continue|Reserve|Pay/ });
  await next.click();
  await expect(page.locator('#rf-name-err')).toHaveText('Who will collect? We check the name at the desk.');
  await page.getByPlaceholder('e.g. Abena Owusu').fill('Abena Owusu');
  await page.getByPlaceholder('055 555 7090').fill('0244123456');
  await next.click();
  await page.getByRole('radio', { name: /Pay when you collect/ }).click();
  await next.click();
  await expect(page).toHaveURL(/\/rent\/confirmation\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chairs: sorted.');
  await expect(page.getByText(/^AWR-[2-9A-Z]{4,7}$/)).toBeVisible();
  await expect(page.getByText('● RESERVED · PAY AT PICKUP')).toBeVisible();
});

test('the venue enquiry asks for what it needs', async ({ page }) => {
  await page.goto('/venues');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.locator('form [role=alert]')).toHaveText([
    'Which day?',
    'Your name, please.',
    "That doesn't look like a Ghana number.",
  ]);
  await page.getByRole('button', { name: 'Enquire about this' }).last().click();
  await expect(page.getByText('Enquire about the conference room')).toBeVisible();
  await expect(page.getByRole('radio', { name: '60' })).toBeVisible();
});

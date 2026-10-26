import type { Page } from '@playwright/test';

let n = 0;

/**
 * Sign-in limits count per client IP, read from cf-connecting-ip (Cloudflare
 * sets it in production). Locally there is no Cloudflare, so each test sends its
 * own address and doesn't eat into another test's budget.
 */
export async function ownAddress(page: Page) {
  n += 1;
  await page.context().setExtraHTTPHeaders({ 'cf-connecting-ip': `10.${process.pid % 250}.${Math.floor(n / 250)}.${n % 250}` });
}

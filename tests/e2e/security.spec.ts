import { expect, test } from '@playwright/test';

// The Content-Security-Policy must not block anything the site itself uses.
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'desktop Chromium only');

const PAGES = [
  '/',
  '/rooms',
  '/rooms/std',
  '/gallery',
  '/contact',
  '/rent',
  '/rent/checkout',
  '/venues',
  '/book',
  '/manage',
  '/admin/login',
];

for (const path of PAGES)
  test(`no policy violations on ${path}`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(m.text())) violations.push(m.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load ${e.violatedDirective} ${e.blockedURI}`));
    });
    const res = await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(res?.status()).toBeLessThan(400);
    const csp = res!.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    if (/^\/(book|manage|admin)/.test(path)) expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(violations).toEqual([]);
  });

test('security headers on every response', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['strict-transport-security']).toContain('max-age=63072000');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['x-powered-by']).toBeUndefined();
});

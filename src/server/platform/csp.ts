// Content-Security-Policy (DECISIONS D-45). Pages rendered on every request
// (admin, booking, manage, confirmations) get a per-request nonce, so only
// scripts Next.js stamps can run. The pre-rendered marketing pages are cached
// HTML that can't carry a nonce; they allow inline scripts but keep every other
// rule. Either way: no plugins, no framing, forms post only to us.

/** SHA-256 of FIRST_VISIT_SCRIPT, the one inline script in the root layout (tests keep it in step). */
export const FIRST_VISIT_HASH = "'sha256-l5n4TOENNGn0HAG6cV2cesBrFTmZ2xDu74aMWoG9UY8='";

/** Routes that are always rendered per request, so a nonce reaches every script. */
const NONCE_ROUTES = [/^\/admin(\/|$)/, /^\/book(\/|$)/, /^\/manage(\/|$)/, /^\/rent\/confirmation\//];

export function wantsNonce(pathname: string): boolean {
  return NONCE_ROUTES.some((r) => r.test(pathname));
}

export function contentSecurityPolicy(nonce: string | null, opts: { dev?: boolean } = {}): string {
  const script = nonce ? [`'self'`, `'nonce-${nonce}'`, FIRST_VISIT_HASH] : [`'self'`, `'unsafe-inline'`];
  if (opts.dev) script.push(`'unsafe-eval'`);
  const d: Record<string, string[]> = {
    'default-src': [`'self'`],
    'script-src': [...script, 'https://js.paystack.co', 'https://challenges.cloudflare.com'],
    'style-src': [`'self'`, `'unsafe-inline'`, 'https://*.paystack.co', 'https://*.paystack.com'],
    'img-src': [`'self'`, 'data:', 'blob:', 'https://res.cloudinary.com', 'https://*.paystack.co', 'https://*.paystack.com'],
    'font-src': [`'self'`, 'data:'],
    'connect-src': [
      `'self'`,
      'https://api.paystack.co',
      'https://*.paystack.co',
      'https://*.paystack.com',
      'https://api.cloudinary.com',
      'https://challenges.cloudflare.com',
    ],
    'frame-src': [
      'https://checkout.paystack.com',
      'https://*.paystack.co',
      'https://*.paystack.com',
      'https://www.google.com',
      'https://maps.google.com',
      'https://challenges.cloudflare.com',
    ],
    'object-src': [`'none'`],
    'base-uri': [`'self'`],
    'form-action': [`'self'`],
    'frame-ancestors': [`'none'`],
    'worker-src': [`'self'`, 'blob:'],
    'manifest-src': [`'self'`],
  };
  const parts = Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!opts.dev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

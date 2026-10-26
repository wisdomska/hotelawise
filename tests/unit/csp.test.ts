import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { FIRST_VISIT_SCRIPT } from '@/components/site/knot-loader';
import { contentSecurityPolicy, FIRST_VISIT_HASH, makeNonce, wantsNonce } from '@/server/platform/csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('content security policy', () => {
  it('uses a nonce on per-request pages and inline on cached ones', () => {
    for (const p of ['/admin', '/admin/bookings', '/book', '/book/confirmation/x', '/manage', '/rent/confirmation/t'])
      expect(wantsNonce(p)).toBe(true);
    for (const p of ['/', '/rooms', '/rent', '/rent/checkout', '/contact', '/administrator', '/booking']) expect(wantsNonce(p)).toBe(false);
  });

  it('lets only stamped scripts run when there is a nonce', () => {
    const csp = contentSecurityPolicy('abc123');
    expect(directive(csp, 'script-src')).toBe(
      `script-src 'self' 'nonce-abc123' ${FIRST_VISIT_HASH} https://js.paystack.co https://challenges.cloudflare.com`,
    );
    expect(csp).not.toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy(null), 'script-src')).toContain("'unsafe-inline'");
  });

  it('blocks plugins, framing and foreign form posts everywhere', () => {
    const csp = contentSecurityPolicy(null);
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('allows eval only in development', () => {
    const csp = contentSecurityPolicy(null, { dev: true });
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('makes a fresh 128-bit nonce each time', () => {
    const a = makeNonce();
    expect(atob(a)).toHaveLength(16);
    expect(makeNonce()).not.toBe(a);
  });

  it('allows the root layout’s inline script by its hash', () => {
    expect(FIRST_VISIT_HASH).toBe(`'sha256-${createHash('sha256').update(FIRST_VISIT_SCRIPT).digest('base64')}'`);
  });
});

describe('outside sources the site needs', () => {
  it('lets Turnstile load its script and frame', () => {
    const csp = contentSecurityPolicy(null);
    for (const d of ['script-src', 'frame-src', 'connect-src']) expect(directive(csp, d)).toContain('https://challenges.cloudflare.com');
  });
});

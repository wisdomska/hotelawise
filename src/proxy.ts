import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, makeNonce, wantsNonce } from '@/server/platform/csp';
import { previewGate } from '@/server/platform/preview-gate';

export function proxy(request: NextRequest) {
  const blocked = previewGate(request, {
    appEnv: process.env.APP_ENV,
    password: process.env.PREVIEW_PASSWORD,
    gate: process.env.PREVIEW_GATE,
  });
  if (blocked) return blocked;
  const dev = process.env.NODE_ENV === 'development';
  const nonce = wantsNonce(request.nextUrl.pathname) ? makeNonce() : null;
  const csp = contentSecurityPolicy(nonce, { dev });
  // Next.js reads the nonce from the request's CSP header and stamps its scripts with it.
  const headers = new Headers(request.headers);
  if (nonce) {
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
  }
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('content-security-policy', csp);
  if (process.env.APP_ENV !== 'production') res.headers.set('x-robots-tag', 'noindex, nofollow');
  return res;
}

export const config = {
  // Skip Next's static files; everything else (pages and APIs) passes the gate.
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
};

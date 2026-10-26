import { NextResponse, type NextRequest } from 'next/server';
import { previewGate } from '@/server/platform/preview-gate';

export function proxy(request: NextRequest) {
  const blocked = previewGate(request, {
    appEnv: process.env.APP_ENV,
    password: process.env.PREVIEW_PASSWORD,
    gate: process.env.PREVIEW_GATE,
  });
  if (blocked) return blocked;
  const res = NextResponse.next();
  if (process.env.APP_ENV !== 'production') res.headers.set('x-robots-tag', 'noindex, nofollow');
  return res;
}

export const config = {
  // Skip Next's static files; everything else (pages and APIs) passes the gate.
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
};

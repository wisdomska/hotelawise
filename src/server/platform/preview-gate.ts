// Keeps the public and search engines off the staging site without Cloudflare
// Access (whose sign-up asks for a payment method; DECISIONS D-30). HTTP Basic
// auth, any username, password = PREVIEW_PASSWORD. Only active when APP_ENV=preview,
// and the owner can open the preview with PREVIEW_GATE=off (DECISIONS D-41); pages
// still carry noindex and robots.txt still disallows everything.

/** Paths that must stay reachable on preview: payment webhooks and the health check. */
const OPEN_PATHS = [/^\/api\/paystack\/webhook$/, /^\/api\/health$/];

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function previewGate(
  request: { headers: Headers; nextUrl: { pathname: string } },
  config: { appEnv?: string; password?: string; gate?: string },
): Response | null {
  if (config.appEnv !== 'preview' || config.gate === 'off') return null;
  if (OPEN_PATHS.some((p) => p.test(request.nextUrl.pathname))) return null;
  const challenge = new Response('This is the Hotel A-Wise staging site.', {
    status: 401,
    headers: {
      'www-authenticate': 'Basic realm="Hotel A-Wise preview", charset="UTF-8"',
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  });
  // Fail closed: a preview without a password set is never public.
  if (!config.password) return challenge;
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return challenge;
  let decoded = '';
  try {
    decoded = atob(header.slice(6));
  } catch {
    return challenge;
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(password, config.password) ? null : challenge;
}

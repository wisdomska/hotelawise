// Cloudflare Turnstile verification for public forms.
import 'server-only';
import { env } from '@/server/platform/env';

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Local development without keys; deployed environments always set the secret.
    return env().APP_ENV === 'development';
  }
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

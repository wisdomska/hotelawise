import 'server-only';
import { headers } from 'next/headers';

/** The client IP as Cloudflare reports it (falls back for local development). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
}

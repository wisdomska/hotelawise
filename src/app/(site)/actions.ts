'use server';
// Public-site server actions. Each one validates input with Zod, checks
// Turnstile and a rate limit, and never trusts anything from the browser.
import { z } from 'zod';
import * as schema from '@/server/db/schema';
import { verifyTurnstile } from '@/server/integrations/turnstile';
import { db } from '@/server/platform/db';
import { allow } from '@/server/platform/rate-limit';
import { clientIp } from '@/server/platform/request';

export type FormResult = { ok: true; title: string; body?: string } | { ok: false; error: string; field?: string };

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

export async function subscribeNewsletter(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  const parsed = email.safeParse(form.get('email'));
  if (!parsed.success) return { ok: false, field: 'email', error: parsed.error.issues[0]?.message ?? 'Enter a valid email address.' };
  const ip = await clientIp();
  if (!(await allow('newsletter', ip))) return { ok: false, error: 'Too many tries. Give it a few minutes.' };
  if (!(await verifyTurnstile(String(form.get('cf-turnstile-response') ?? ''), ip))) {
    return { ok: false, error: 'We couldn’t confirm you’re not a bot. Refresh and try again.' };
  }
  const database = await db();
  const added = await database
    .insert(schema.newsletterSubscribers)
    .values({ email: parsed.data, source: 'footer' })
    .onConflictDoNothing()
    .returning({ id: schema.newsletterSubscribers.id });
  return added.length
    ? { ok: true, title: 'You’re on the list.', body: 'One letter a month, at most.' }
    : { ok: true, title: 'You’re already on the list.', body: 'Nothing more to do.' };
}

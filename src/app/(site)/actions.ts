'use server';
// Public-site server actions. Each one validates input with Zod, checks
// Turnstile and a rate limit, and never trusts anything from the browser.
import { z } from 'zod';
import { isIsoDate, nightsBetween } from '@/lib/dates';
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

export type AvailabilityResult = { ok: true; free: number } | { ok: false; error: string };

const stayQuery = z
  .object({
    variant: z.enum(['STD', 'EXE', 'EXE_PLUS', 'VIP', 'DBL']),
    checkIn: z.string().refine(isIsoDate),
    checkOut: z.string().refine(isIsoDate),
  })
  .refine((q) => q.checkOut > q.checkIn && nightsBetween(q.checkIn, q.checkOut) <= 60);

/** Free rooms of one rate for the chosen dates (room page › Reserve). Read-only, so no Turnstile. */
export async function checkRoomAvailability(variant: string, checkIn: string, checkOut: string): Promise<AvailabilityResult> {
  const q = stayQuery.safeParse({ variant, checkIn, checkOut });
  if (!q.success) return { ok: false, error: 'Pick a check-out date after your check-in.' };
  if (!(await allow('availability', await clientIp()))) return { ok: false, error: 'Too many checks. Give it a minute.' };
  if (!process.env.DATABASE_URL) {
    const { defaultSiteData } = await import('@/server/content/site-data');
    const v = defaultSiteData()
      .rooms.flatMap((r) => r.variants)
      .find((x) => x.code === q.data.variant);
    return { ok: true, free: v?.roomCount ?? 0 };
  }
  const { freeRoomsForStay } = await import('@/server/services/tonight');
  return { ok: true, free: await freeRoomsForStay(await db(), q.data.variant, q.data.checkIn, q.data.checkOut, new Date()) };
}

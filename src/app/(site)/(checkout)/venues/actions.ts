'use server';
// Venue enquiries: the events desk calls back with a quote.
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isIsoDate, todayInAccra } from '@/lib/dates';
import { parseGhanaPhone } from '@/lib/phone';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';
import * as schema from '@/server/db/schema';
import { verifyTurnstile } from '@/server/integrations/turnstile';
import { withTransactionDb } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import { allow } from '@/server/platform/rate-limit';
import { clientIp } from '@/server/platform/request';
import { staffAlert } from '@/server/services/notify';
import { nextRef } from '@/server/services/references';

export type EnquiryErrors = Partial<Record<'date' | 'name' | 'phone', string>>;
export type EnquiryResult = { ok: true; ref: string } | { ok: false; error?: string; errors?: EnquiryErrors };

const input = z.object({
  venue: z.string().max(40),
  date: z.string(),
  guests: z.number().int().min(1).max(1000),
  name: z.string().max(200),
  phone: z.string().max(40),
  notes: z.string().max(2000),
  turnstile: z.string().nullable(),
});

export async function sendEnquiry(raw: z.input<typeof input>): Promise<EnquiryResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Something on the form needs another look.' };
  const v = parsed.data;
  const errors: EnquiryErrors = {};
  if (!isIsoDate(v.date) || v.date < todayInAccra()) errors.date = 'Which day?';
  if (v.name.trim().length < 2) errors.name = 'Your name, please.';
  const phone = parseGhanaPhone(v.phone);
  if (!phone.ok) errors.phone = "That doesn't look like a Ghana number.";
  if (Object.keys(errors).length || !phone.ok) return { ok: false, errors };
  const ip = await clientIp();
  if (!(await allow('enquiry', ip))) return { ok: false, error: 'Too many enquiries. Give it a few minutes, or call us.' };
  const data = await getSiteData();
  const ct = contactFrom(data);
  if (!process.env.DATABASE_URL) return { ok: false, error: `Online enquiries open soon. Call ${ct.phone} and the events desk will help.` };
  if (!(await verifyTurnstile(v.turnstile, ip)))
    return { ok: false, error: 'We couldn’t confirm you’re not a bot. Refresh and try again.' };

  const ref = await withTransactionDb((db) =>
    db.transaction(async (tx) => {
      const [venue] = await tx.select().from(schema.venues).where(eq(schema.venues.slug, v.venue));
      if (!venue) throw new RangeError('Pick a venue.');
      const [customer] = await tx
        .insert(schema.customers)
        .values({ name: v.name.trim(), phoneE164: phone.e164 })
        // An existing customer keeps their name and email (see upsertCustomer in services/bookings.ts).
        .onConflictDoUpdate({ target: schema.customers.phoneE164, set: { updatedAt: sql`now()` } })
        .returning({ id: schema.customers.id });
      const r = await nextRef(tx, 'enquiry', env().REF_SECRET);
      const guests = Math.min(Math.max(v.guests, venue.capacityMin ?? 1), venue.capacityMax ?? v.guests);
      await tx.insert(schema.enquiries).values({
        ref: r,
        venueId: venue.id,
        customerId: customer!.id,
        eventDate: v.date,
        guests,
        eventType: v.notes.trim() ? v.notes.trim().slice(0, 60) : 'Event enquiry',
        message: v.notes.trim(),
      });
      return { r, venueName: venue.name, guests };
    }),
  );
  await staffAlert(
    ct.email,
    `New venue enquiry ${ref.r}`,
    `${v.name.trim()} (${phone.e164}) asked about the ${ref.venueName} on ${v.date} for ${ref.guests} guests.\n\n${v.notes.trim() || '(no notes)'}\n\nQuote it from Admin › Venues.`,
  );
  return { ok: true, ref: ref.r };
}

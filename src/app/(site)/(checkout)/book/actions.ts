'use server';
// Booking page actions: live availability, the 15-minute hold, promo codes,
// checkout and payment. Every amount is recomputed on the server.
import { cookies } from 'next/headers';
import { z } from 'zod';
import { checkGuest, checkMomo, type GuestErrors, type PayMethod } from '@/lib/booking-form';
import { addDays, isIsoDate, nightsBetween, todayInAccra } from '@/lib/dates';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';
import {
  chargeMomo,
  failureReason,
  initializeCard,
  MOMO_PROVIDER,
  PaystackError,
  PaystackNotConfiguredError,
  paystackConfigured,
  type ChargeResult,
} from '@/server/integrations/paystack';
import { verifyTurnstile } from '@/server/integrations/turnstile';
import { db, withTransactionDb } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import { allow } from '@/server/platform/rate-limit';
import { clientIp } from '@/server/platform/request';
import {
  abandonHold,
  bookingBy,
  checkout,
  createPendingPayment,
  findPromo,
  freeByVariant,
  HoldExpiredError,
  NoRoomAvailableError,
  soldOutNights,
  startHold,
  UNKNOWN_PROMO,
  type PayPlan,
} from '@/server/services/bookings';
import { bookingConfirmed } from '@/server/services/notify';
import { checkAndSettle, contactAndTemplate } from '@/server/services/payment-flow';
import type { PromoCode } from '@/server/services/pricing';

const SESSION_COOKIE = 'aw_bk';
const dbReady = () => !!process.env.DATABASE_URL;

async function callUs() {
  return contactFrom(await getSiteData()).phone;
}

async function session(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const have = jar.get(SESSION_COOKIE)?.value;
  if (have || !create) return have ?? null;
  const id = crypto.randomUUID();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_ENV !== 'development',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return id;
}

const range = z
  .object({ checkIn: z.string().refine(isIsoDate), checkOut: z.string().refine(isIsoDate) })
  .refine((r) => nightsBetween(r.checkIn, r.checkOut) >= 1 && nightsBetween(r.checkIn, r.checkOut) <= 60);

/* ───────────── availability ───────────── */

export type AvailabilityView = { ok: true; free: Record<string, number>; soldOut: string[] } | { ok: false; error: string };

/** Free rooms per rate for the stay, and sold-out nights for the two months on screen. */
export async function bookingAvailability(checkIn: string, checkOut: string, monthStart: string): Promise<AvailabilityView> {
  const r = range.safeParse({ checkIn, checkOut });
  if (!r.success || !isIsoDate(monthStart)) return { ok: false, error: 'Pick a check-out date after your check-in.' };
  if (!(await allow('availability', await clientIp()))) return { ok: false, error: 'Too many checks. Give it a minute.' };
  if (!dbReady()) {
    const data = await getSiteData();
    return { ok: true, free: Object.fromEntries(data.rooms.flatMap((x) => x.variants).map((v) => [v.code, v.roomCount])), soldOut: [] };
  }
  const now = new Date();
  const d = await db();
  const from = monthStart < todayInAccra(now) ? todayInAccra(now) : monthStart;
  const [free, soldOut] = await Promise.all([
    freeByVariant(d, checkIn, checkOut, now),
    soldOutNights(d, from, Math.max(1, nightsBetween(from, addDays(monthStart, 62))), now),
  ]);
  return { ok: true, free, soldOut };
}

/* ───────────── hold ───────────── */

/** `expiresIn` is relative, so a phone with a wrong clock still counts down correctly. */
export type HoldResult = { ok: true; token: string; expiresIn: number } | { ok: false; error: string; soldOut?: boolean };

export async function holdRoom(input: {
  variant: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  turnstile: string | null;
}): Promise<HoldResult> {
  const r = range.safeParse(input);
  if (!r.success) return { ok: false, error: 'Pick a check-out date after your check-in.' };
  const ip = await clientIp();
  if (!(await allow('hold', ip))) return { ok: false, error: 'Too many tries. Give it a few minutes, or call us.' };
  if (!dbReady()) return { ok: false, error: `Online booking opens soon. Call ${await callUs()} and the desk will book you in.` };
  if (!(await verifyTurnstile(input.turnstile, ip)))
    return { ok: false, error: 'We couldn’t confirm you’re not a bot. Refresh and try again.' };
  const sid = (await session(true))!;
  try {
    const held = await withTransactionDb((tx) =>
      startHold(tx, {
        variantCode: input.variant,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: Math.round(input.guests),
        sessionId: sid,
      }),
    );
    return { ok: true, token: held.token, expiresIn: held.expiresAt.getTime() - Date.now() };
  } catch (e) {
    if (e instanceof NoRoomAvailableError)
      return { ok: false, soldOut: true, error: 'Someone just took the last one for those dates. Try another room or other dates.' };
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function releaseRoom(token: string): Promise<void> {
  const sid = await session(false);
  if (!sid || !dbReady() || typeof token !== 'string') return;
  await withTransactionDb((tx) => abandonHold(tx, token, sid));
}

/* ───────────── promo ───────────── */

export type PromoView = { ok: true; promo: PromoCode } | { ok: false; error: string };

/** Looks a code up so the page can show the saving; checkout re-checks it. */
export async function lookupPromo(code: string): Promise<PromoView> {
  const c = String(code ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 32);
  if (!c) return { ok: false, error: 'Enter a code.' };
  if (!(await allow('promo', await clientIp()))) return { ok: false, error: 'Too many tries. Give it a minute.' };
  if (!dbReady()) return { ok: false, error: UNKNOWN_PROMO };
  const p = await findPromo(await db(), c);
  return p ? { ok: true, promo: p } : { ok: false, error: UNKNOWN_PROMO };
}

/* ───────────── checkout and payment ───────────── */

export type PayStart =
  | { ok: true; kind: 'confirmed'; token: string }
  | { ok: true; kind: 'momo'; payRef: string; token: string; stage: 'prompt' | 'otp'; display: string }
  | { ok: true; kind: 'card'; payRef: string; token: string; accessCode: string; publicKey: string | null }
  | { ok: false; error: string; errors?: GuestErrors; field?: 'momo' | 'promo'; holdExpired?: boolean; failed?: boolean };

const submitSchema = z.object({
  token: z.string().min(10).max(64),
  guests: z.number().int().min(1).max(8),
  guest: z.object({ name: z.string(), dialCode: z.string(), phone: z.string(), email: z.string(), arrival: z.string(), notes: z.string() }),
  breakfast: z.boolean(),
  roomService: z.boolean(),
  promo: z.string().max(32).nullable(),
  plan: z.enum(['full', 'deposit', 'at_hotel']),
  method: z.enum(['mtn', 'telecel', 'airteltigo', 'card']),
  momo: z.string().max(32),
});

function promptText(c: ChargeResult, momoNumber: string): string {
  return c.display_text || `We've sent a prompt to ${momoNumber}. Enter your MoMo PIN to approve.`;
}

export async function submitBooking(raw: z.input<typeof submitSchema>): Promise<PayStart> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Something on the form needs another look.' };
  const input = parsed.data;
  const g = checkGuest(input.guest);
  if (!g.ok) return { ok: false, error: 'Check the highlighted details.', errors: g.errors };
  const online = input.plan !== 'at_hotel';
  const isMomo = input.method !== 'card';
  const momo = online && isMomo ? checkMomo(input.momo) : null;
  if (momo && !momo.ok) return { ok: false, field: 'momo', error: momo.error };
  if (!(await allow('payment', await clientIp()))) return { ok: false, error: 'Too many tries. Give it a few minutes, or call us.' };
  if (online && !paystackConfigured()) {
    return { ok: false, error: `Online payment isn't switched on yet. Choose “Pay at the hotel”, or call ${await callUs()}.` };
  }
  const sid = await session(false);
  if (!sid) return { ok: false, holdExpired: true, error: 'Your 15-minute hold ran out.' };

  try {
    const res = await withTransactionDb((tx) =>
      checkout(tx, {
        token: input.token,
        sessionId: sid,
        guests: input.guests,
        guest: g.value,
        breakfast: input.breakfast,
        roomService: input.roomService,
        promoCode: input.promo,
        plan: input.plan as PayPlan,
        refSecret: env().REF_SECRET,
      }),
    );
    if (res.promoError) return { ok: false, field: 'promo', error: res.promoError };
    if (res.status === 'confirmed') {
      const b = await bookingBy(await db(), { token: res.token });
      if (b) {
        const { contact, smsTemplate } = await contactAndTemplate();
        await bookingConfirmed(b, contact, smsTemplate);
      }
      return { ok: true, kind: 'confirmed', token: res.token };
    }
    const email = g.value.email ?? `guest-${res.ref.toLowerCase()}@hotelawise.com`;
    const payRef = await withTransactionDb((tx) =>
      createPendingPayment(tx, { bookingId: res.bookingId, amount: res.dueNow, method: input.method as PayMethod }),
    );
    const metadata = { booking_ref: res.ref, booking_token: res.token, kind: 'booking' };
    if (isMomo) {
      const c = await chargeMomo({
        email,
        amount: res.dueNow,
        reference: payRef,
        phone: momo!.ok ? momo!.e164.replace('+233', '0') : '',
        provider: MOMO_PROVIDER[input.method as 'mtn' | 'telecel' | 'airteltigo'],
        metadata,
      });
      if (c.status === 'failed') return { ok: false, failed: true, error: failureReason(c.gateway_response ?? c.message, 'momo') };
      if (c.status === 'success') {
        await withTransactionDb((tx) => checkAndSettle(tx, payRef));
        return { ok: true, kind: 'confirmed', token: res.token };
      }
      return {
        ok: true,
        kind: 'momo',
        payRef,
        token: res.token,
        stage: c.status === 'send_otp' ? 'otp' : 'prompt',
        display: promptText(c, input.momo),
      };
    }
    const init = await initializeCard({
      email,
      amount: res.dueNow,
      reference: payRef,
      callbackUrl: `${env().APP_URL}/book/confirmation/${res.token}`,
      metadata,
    });
    return {
      ok: true,
      kind: 'card',
      payRef,
      token: res.token,
      accessCode: init.access_code,
      publicKey: env().NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? null,
    };
  } catch (e) {
    if (e instanceof HoldExpiredError) return { ok: false, holdExpired: true, error: e.message };
    if (e instanceof PaystackNotConfiguredError)
      return { ok: false, error: `Online payment isn't switched on yet. Choose “Pay at the hotel”, or call ${await callUs()}.` };
    if (e instanceof PaystackError)
      return {
        ok: false,
        failed: true,
        error: 'Paystack couldn’t start the payment. Nothing was taken. Try again, or use a card instead.',
      };
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Whether online payment is switched on; checked at run time so cached pages follow the Worker's keys. */
export async function onlinePaymentOn(): Promise<boolean> {
  return paystackConfigured();
}

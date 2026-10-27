// Room bookings: holds, checkout, confirmation from a verified payment, and the
// guest's own changes. Every figure is recomputed here from the database; the
// browser's totals are never trusted. Functions take a transaction-capable db
// (withTransactionDb on Workers).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { accraInstant, addDays, nightsBetween, todayInAccra, type IsoDate } from '@/lib/dates';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import { SEED_SETTINGS } from '@/server/content/defaults';
import { createHold, expireLapsedHolds, isExclusionViolation, NoRoomAvailableError, type AnyDb } from './holds';
import type { PromoCode, RateRule, VariantCode } from './pricing';
import { depositFor, quoteStay, type Quote } from './quote';
import { nextRef } from './references';

export class HoldExpiredError extends Error {
  constructor() {
    super('Your 15-minute hold ran out.');
    this.name = 'HoldExpiredError';
  }
}
export class BookingNotFoundError extends Error {
  constructor() {
    super('Booking not found.');
    this.name = 'BookingNotFoundError';
  }
}

export const UNKNOWN_PROMO = "We don't recognise that code. Check the spelling.";

export type PayPlan = 'full' | 'deposit' | 'at_hotel';
export type GuestDetails = { name: string; phoneE164: string; email: string | null; arrivalHour: number | null; requests: string };

/** Unguessable token for confirmation, .ics and hold links. */
export function newToken(bytes = 18): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* ───────────── pricing inputs, always from the database ───────────── */

export type PricingContext = {
  rules: RateRule[];
  breakfastPerGuestNight: number;
  roomService: number;
  depositPercent: number;
  payAtHotel: boolean;
  holdMinutes: number;
};

export async function loadPricing(db: AnyDb): Promise<PricingContext> {
  const [settingRows, ruleRows] = await Promise.all([
    db.select().from(s.settings),
    db.select().from(s.rateRules).where(eq(s.rateRules.active, true)),
  ]);
  const st = new Map(settingRows.map((r) => [r.key, r.value]));
  const num = (k: keyof typeof SEED_SETTINGS) => Number(st.get(k) ?? SEED_SETTINGS[k]);
  return {
    rules: ruleRows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      from: r.monthDayFrom,
      to: r.monthDayTo,
      minNights: r.minNights,
      appliesTo: r.appliesTo?.length ? (r.appliesTo as VariantCode[]) : 'all',
      direction: r.direction,
      unit: r.unit,
      amount: r.amount,
      active: r.active,
    })),
    breakfastPerGuestNight: num('fees.breakfastPerGuestNightPesewas'),
    roomService: num('fees.roomServicePesewas'),
    depositPercent: num('booking.depositPercent'),
    payAtHotel: (st.get('booking.payAtHotel') ?? SEED_SETTINGS['booking.payAtHotel']) !== false,
    holdMinutes: num('booking.holdMinutes'),
  };
}

export async function findPromo(db: AnyDb, code: string): Promise<PromoCode | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const [p] = await db
    .select()
    .from(s.promoCodes)
    .where(sql`upper(${s.promoCodes.code}) = ${c}`)
    .limit(1);
  if (!p) return null;
  return {
    code: p.code.toUpperCase(),
    type: p.type,
    value: p.value,
    endsOn: p.endsOn,
    appliesTo: (p.appliesTo as VariantCode | null) ?? 'all',
    minNights: p.minNights,
    active: p.active,
  };
}

async function variantByCode(db: AnyDb, code: string) {
  const [v] = await db
    .select({
      id: s.rateVariants.id,
      code: s.rateVariants.code,
      name: s.rateVariants.name,
      price: s.rateVariants.pricePesewas,
      sleeps: s.roomTypes.sleeps,
    })
    .from(s.rateVariants)
    .innerJoin(s.roomTypes, eq(s.roomTypes.id, s.rateVariants.roomTypeId))
    .where(eq(s.rateVariants.code, code));
  return v ?? null;
}

/* ───────────── availability for the booking page ───────────── */

/** Free rooms per rate variant for every night of [checkIn, checkOut). */
export async function freeByVariant(db: AnyDb, checkIn: IsoDate, checkOut: IsoDate, now: Date): Promise<Record<string, number>> {
  const res = await db.execute(sql`
    select v.code, count(r.id) filter (where
             r.status not in ('maintenance', 'out_of_order', 'retired')
         and not exists (select 1 from blackout_dates b
                          where b.starts < ${checkOut}::date and b.ends >= ${checkIn}::date
                            and (b.room_ids is null or r.id = any(b.room_ids)))
         and not exists (select 1 from room_allocations a
                          where a.room_id = r.id and a.active
                            and (a.hold_expires_at is null or a.hold_expires_at > ${now.toISOString()})
                            and a.stay && daterange(${checkIn}::date, ${checkOut}::date)))::int as free
      from rate_variants v left join rooms r on r.rate_variant_id = v.id
     group by v.code`);
  return Object.fromEntries(rowsOf<{ code: string; free: number }>(res).map((r) => [r.code, r.free]));
}

/** Nights in [from, from+days) with no room of any kind left (struck through on the calendar). */
export async function soldOutNights(db: AnyDb, from: IsoDate, days: number, now: Date): Promise<IsoDate[]> {
  const res = await db.execute(sql`
    select to_char(n, 'YYYY-MM-DD') as night
      from generate_series(${from}::date, ${addDays(from, days - 1)}::date, interval '1 day') as n
     where not exists (
       select 1 from rooms r
        where r.status not in ('maintenance', 'out_of_order', 'retired')
          and not exists (select 1 from blackout_dates b
                           where n::date between b.starts and b.ends
                             and (b.room_ids is null or r.id = any(b.room_ids)))
          and not exists (select 1 from room_allocations a
                           where a.room_id = r.id and a.active
                             and (a.hold_expires_at is null or a.hold_expires_at > ${now.toISOString()})
                             and a.stay @> n::date))`);
  return rowsOf<{ night: string }>(res).map((r) => r.night);
}

/* ───────────── holds ───────────── */

export async function startHold(
  db: AnyDb,
  input: { variantCode: string; checkIn: IsoDate; checkOut: IsoDate; guests: number; sessionId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const v = await variantByCode(db, input.variantCode);
  if (!v) throw new BookingNotFoundError();
  if (input.guests < 1 || input.guests > v.sleeps) throw new RangeError(`This room sleeps ${v.sleeps}.`);
  if (input.checkIn < todayInAccra(now)) throw new RangeError('Check-in is in the past.');
  if (nightsBetween(input.checkIn, input.checkOut) > 60) throw new RangeError('For stays over 60 nights, call the desk.');
  const token = newToken();
  const hold = await createHold(db, {
    rateVariantId: v.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    sessionId: input.sessionId,
    publicToken: token,
    now,
  });
  return { token, expiresAt: hold.expiresAt };
}

/** Lets go of a hold the guest walked away from (back to step 1, new dates). */
export async function abandonHold(db: AnyDb, token: string, sessionId: string) {
  await db.transaction(async (tx) => {
    const [b] = await tx
      .select({ id: s.bookings.id })
      .from(s.bookings)
      .where(and(eq(s.bookings.publicToken, token), eq(s.bookings.holdSessionId, sessionId), eq(s.bookings.status, 'held')));
    if (!b) return;
    await tx.update(s.roomAllocations).set({ active: false }).where(eq(s.roomAllocations.bookingId, b.id));
    await tx.update(s.bookings).set({ status: 'expired' }).where(eq(s.bookings.id, b.id));
  });
}

/* ───────────── checkout ───────────── */

/**
 * Finds the customer by phone, or adds them. Only the front desk (`trusted`),
 * who sees the guest, may change an existing customer's name or email: the
 * manage-booking code goes to that email, so a public form must never be able
 * to point someone else's bookings at a new address.
 */
export async function upsertCustomer(tx: AnyDb, g: GuestDetails, opts: { trusted?: boolean } = {}): Promise<string> {
  const [c] = await tx
    .insert(s.customers)
    .values({ name: g.name, phoneE164: g.phoneE164, email: g.email })
    .onConflictDoUpdate({
      target: s.customers.phoneE164,
      set: opts.trusted
        ? { name: g.name, email: sql`coalesce(${g.email}, ${s.customers.email})`, updatedAt: sql`now()` }
        : { updatedAt: sql`now()` },
    })
    .returning({ id: s.customers.id });
  return c!.id;
}

export function chargeRows(bookingId: string, q: Quote) {
  return q.lines
    .filter((l) => l.kind !== 'promo')
    .map((l) => ({
      bookingId,
      kind: (l.kind === 'breakfast' ? 'breakfast' : l.kind === 'room_service' ? 'room_service' : l.kind === 'room' ? 'room' : 'other') as
        'room' | 'breakfast' | 'room_service' | 'other',
      description: l.label,
      qty: 1,
      unitPesewas: l.amount,
    }));
}

export type CheckoutInput = {
  token: string;
  sessionId: string;
  guests: number;
  guest: GuestDetails;
  breakfast: boolean;
  roomService: boolean;
  promoCode: string | null;
  plan: PayPlan;
  refSecret: string;
  now?: Date;
};

export type CheckoutResult = {
  bookingId: string;
  ref: string;
  token: string;
  total: number;
  dueNow: number;
  status: 'confirmed' | 'pending_payment';
  promoError: string | null;
};

/** Saves the guest's details and the server's own price onto the hold. Pay-at-hotel confirms at once. */
export async function checkout(db: AnyDb, input: CheckoutInput): Promise<CheckoutResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select()
      .from(s.bookings)
      .where(and(eq(s.bookings.publicToken, input.token), eq(s.bookings.holdSessionId, input.sessionId)))
      .for('update');
    if (!b || !['held', 'pending_payment'].includes(b.status)) throw new HoldExpiredError();
    const [alloc] = await tx.select().from(s.roomAllocations).where(eq(s.roomAllocations.bookingId, b.id));
    if (!alloc?.active || (alloc.holdExpiresAt && alloc.holdExpiresAt <= now)) throw new HoldExpiredError();

    const [v] = await tx
      .select({ code: s.rateVariants.code, name: s.rateVariants.name, price: s.rateVariants.pricePesewas, sleeps: s.roomTypes.sleeps })
      .from(s.rateVariants)
      .innerJoin(s.roomTypes, eq(s.roomTypes.id, s.rateVariants.roomTypeId))
      .where(eq(s.rateVariants.id, b.rateVariantId));
    const pricing = await loadPricing(tx);
    if (input.plan === 'at_hotel' && !pricing.payAtHotel) throw new RangeError('Pay at the hotel is switched off.');
    const guests = Math.min(Math.max(1, input.guests), v!.sleeps);
    const promo = input.promoCode ? await findPromo(tx, input.promoCode) : null;
    const q = quoteStay({
      variant: { code: v!.code as VariantCode, name: v!.name, price: v!.price },
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guests,
      breakfast: input.breakfast,
      roomService: input.roomService,
      rules: pricing.rules,
      fees: { breakfastPerGuestNight: pricing.breakfastPerGuestNight, roomService: pricing.roomService },
      depositPercent: pricing.depositPercent,
      promo,
      today: todayInAccra(now),
    });
    const promoOk = q.promo?.ok === true;
    const [promoRow] = promoOk
      ? await tx
          .select({ id: s.promoCodes.id })
          .from(s.promoCodes)
          .where(sql`upper(${s.promoCodes.code}) = ${q.promo!.ok ? q.promo!.code : ''}`)
      : [];

    const customerId = await upsertCustomer(tx, input.guest);
    const ref = b.ref ?? (await nextRef(tx, 'booking', input.refSecret));
    const atHotel = input.plan === 'at_hotel';
    await tx.delete(s.bookingCharges).where(eq(s.bookingCharges.bookingId, b.id));
    const rows = chargeRows(b.id, q);
    if (rows.length) await tx.insert(s.bookingCharges).values(rows);
    await tx
      .update(s.bookings)
      .set({
        ref,
        customerId,
        guests,
        arrivalHour: input.guest.arrivalHour,
        requests: input.guest.requests,
        breakfast: input.breakfast,
        payMode: input.plan,
        subtotalPesewas: q.total + q.discount,
        discountPesewas: q.discount,
        totalPesewas: q.total,
        promoCodeId: promoRow?.id ?? null,
        status: atHotel ? 'confirmed' : 'pending_payment',
        holdExpiresAt: atHotel ? null : b.holdExpiresAt,
      })
      .where(eq(s.bookings.id, b.id));
    if (atHotel) {
      await tx.update(s.roomAllocations).set({ holdExpiresAt: null }).where(eq(s.roomAllocations.bookingId, b.id));
      if (promoRow)
        await tx
          .update(s.promoCodes)
          .set({ usedCount: sql`${s.promoCodes.usedCount} + 1` })
          .where(eq(s.promoCodes.id, promoRow.id));
    }
    const dueNow = atHotel ? 0 : input.plan === 'full' ? q.total : depositFor(q.total, pricing.depositPercent);
    return {
      bookingId: b.id,
      ref,
      token: b.publicToken,
      total: q.total,
      dueNow,
      status: atHotel ? 'confirmed' : 'pending_payment',
      promoError: !input.promoCode || promoOk ? null : q.promo && !q.promo.ok ? q.promo.error : UNKNOWN_PROMO,
    };
  });
}

/** Creates the pending payment row for an online payment attempt. */
export async function createPendingPayment(
  db: AnyDb,
  input: ({ bookingId: string; orderId?: never } | { orderId: string; bookingId?: never }) & {
    amount: number;
    method: 'mtn' | 'telecel' | 'airteltigo' | 'card';
  },
): Promise<string> {
  const ref = `AWP-${newToken(9)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)}`;
  await db.insert(s.payments).values({
    ref,
    bookingId: input.bookingId ?? null,
    orderId: input.orderId ?? null,
    amountPesewas: input.amount,
    method: input.method,
    channel: 'paystack',
    paystackRef: ref,
    status: 'pending',
  });
  return ref;
}

/* ───────────── confirmation from a verified payment ───────────── */

export type Verified = { reference: string; status: string; amount: number; currency: string; channel?: string; paidAt?: string | null };

export type SettleOutcome =
  | { kind: 'confirmed'; bookingId: string; firstTime: boolean }
  | { kind: 'already'; bookingId: string }
  | { kind: 'failed'; bookingId: string | null; reason: string }
  | { kind: 'refund'; bookingId: string; paymentId: string; refundId: string; amount: number; paystackRef: string }
  | { kind: 'ignored'; reason: string }
  | { kind: 'order_confirmed'; orderId: string; firstTime: boolean }
  | { kind: 'order_already'; orderId: string }
  | { kind: 'order_failed'; orderId: string; reason: string }
  | { kind: 'order_refund'; orderId: string; paymentId: string; refundId: string; amount: number; paystackRef: string };

export async function reallocate(tx: AnyDb, b: typeof s.bookings.$inferSelect, now: Date): Promise<boolean> {
  await expireLapsedHolds(tx, now, { checkIn: b.checkIn, checkOut: b.checkOut });
  const res = await tx.execute(sql`
    select r.id from rooms r
     where r.rate_variant_id = ${b.rateVariantId}
       and r.status not in ('maintenance', 'out_of_order', 'retired')
       and not exists (select 1 from blackout_dates x where x.starts < ${b.checkOut}::date and x.ends >= ${b.checkIn}::date
                         and (x.room_ids is null or r.id = any(x.room_ids)))
     order by r.number`);
  for (const { id: roomId } of rowsOf<{ id: string }>(res)) {
    try {
      await tx.transaction(async (sp) => {
        await sp
          .insert(s.roomAllocations)
          .values({ bookingId: b.id, roomId, checkIn: b.checkIn, checkOut: b.checkOut, active: true, holdExpiresAt: null })
          .onConflictDoUpdate({
            target: s.roomAllocations.bookingId,
            set: { roomId, checkIn: b.checkIn, checkOut: b.checkOut, active: true, holdExpiresAt: null },
          });
        await sp.update(s.bookings).set({ roomId }).where(eq(s.bookings.id, b.id));
      });
      return true;
    } catch (e) {
      if (isExclusionViolation(e)) continue;
      throw e;
    }
  }
  return false;
}

/**
 * Applies a Paystack-verified transaction to its payment and booking. Idempotent:
 * the webhook and the browser's status check may both call it for one payment.
 */
export async function settlePayment(db: AnyDb, v: Verified, now: Date = new Date()): Promise<SettleOutcome> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(s.payments).where(eq(s.payments.paystackRef, v.reference)).for('update');
    if (!p) return { kind: 'ignored', reason: 'unknown reference' } as const;
    if (p.orderId) return settleOrder(tx, p, v, now);
    if (!p.bookingId) return { kind: 'ignored', reason: 'not a booking payment' } as const;
    if (p.status === 'success') return { kind: 'already', bookingId: p.bookingId } as const;
    if (v.status !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(v.status))
        await tx.update(s.payments).set({ status: 'failed' }).where(eq(s.payments.id, p.id));
      return { kind: 'failed', bookingId: p.bookingId, reason: v.status } as const;
    }
    if (v.amount !== p.amountPesewas || v.currency !== 'GHS') {
      await tx
        .update(s.payments)
        .set({ status: 'failed', externalTxnId: `mismatch:${v.amount}${v.currency}` })
        .where(eq(s.payments.id, p.id));
      return { kind: 'failed', bookingId: p.bookingId, reason: 'amount mismatch' } as const;
    }
    await tx
      .update(s.payments)
      .set({ status: 'success', paidAt: v.paidAt ? new Date(v.paidAt) : now })
      .where(eq(s.payments.id, p.id));
    const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, p.bookingId)).for('update');
    const paid = b!.paidPesewas + p.amountPesewas;
    const paymentStatus = paid >= b!.totalPesewas ? 'paid' : 'deposit';
    const firstTime = ['held', 'pending_payment', 'expired'].includes(b!.status);

    if (firstTime) {
      const [alloc] = await tx.select().from(s.roomAllocations).where(eq(s.roomAllocations.bookingId, b!.id));
      const live = alloc?.active && (!alloc.holdExpiresAt || alloc.holdExpiresAt > now);
      const ok = live
        ? (await tx.update(s.roomAllocations).set({ holdExpiresAt: null }).where(eq(s.roomAllocations.bookingId, b!.id)), true)
        : await reallocate(tx, b!, now);
      if (!ok) {
        // Paid after the hold lapsed and the room went to someone else: refund in full (DECISIONS D-15).
        await tx
          .update(s.bookings)
          .set({
            status: 'cancelled',
            paidPesewas: paid,
            paymentStatus,
            cancelledAt: now,
            notes: sql`${s.bookings.notes} || ${'Paid after the hold lapsed; no room left. Refunded automatically.'}`,
          })
          .where(eq(s.bookings.id, b!.id));
        const [r] = await tx
          .insert(s.refunds)
          .values({
            paymentId: p.id,
            amountPesewas: p.amountPesewas,
            reason: 'Paid after the hold expired and the room was taken',
            status: 'processing',
          })
          .returning({ id: s.refunds.id });
        return {
          kind: 'refund',
          bookingId: b!.id,
          paymentId: p.id,
          refundId: r!.id,
          amount: p.amountPesewas,
          paystackRef: v.reference,
        } as const;
      }
      if (b!.promoCodeId)
        await tx
          .update(s.promoCodes)
          .set({ usedCount: sql`${s.promoCodes.usedCount} + 1` })
          .where(eq(s.promoCodes.id, b!.promoCodeId));
    }
    await tx
      .update(s.bookings)
      .set({ paidPesewas: paid, paymentStatus, status: firstTime ? 'confirmed' : b!.status, holdExpiresAt: null })
      .where(eq(s.bookings.id, b!.id));
    return { kind: 'confirmed', bookingId: b!.id, firstTime } as const;
  });
}

/* ───────────── reading a booking for the guest ───────────── */

export type GuestBooking = {
  id: string;
  ref: string | null;
  token: string;
  status: (typeof s.bookingStatusEnum.enumValues)[number];
  paymentStatus: (typeof s.paymentStatusEnum.enumValues)[number];
  payMode: PayPlan | null;
  variantCode: string;
  typeCode: string;
  typeName: string;
  variantName: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  guests: number;
  guestName: string;
  phone: string;
  email: string | null;
  arrivalHour: number | null;
  breakfast: boolean;
  lines: { label: string; amount: number }[];
  discount: number;
  promoCode: string | null;
  total: number;
  paid: number;
  lastMethod: string | null;
  refundPending: number;
  holdExpiresAt: Date | null;
};

export async function bookingBy(db: AnyDb, where: { token?: string; ref?: string }): Promise<GuestBooking | null> {
  const cond = where.token ? eq(s.bookings.publicToken, where.token) : eq(s.bookings.ref, where.ref ?? '');
  const [row] = await db
    .select({
      b: s.bookings,
      variantCode: s.rateVariants.code,
      variantName: s.rateVariants.name,
      typeCode: s.roomTypes.code,
      typeName: s.roomTypes.name,
      guestName: s.customers.name,
      phone: s.customers.phoneE164,
      email: s.customers.email,
      promoCode: s.promoCodes.code,
    })
    .from(s.bookings)
    .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.bookings.rateVariantId))
    .innerJoin(s.roomTypes, eq(s.roomTypes.id, s.rateVariants.roomTypeId))
    .leftJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
    .leftJoin(s.promoCodes, eq(s.promoCodes.id, s.bookings.promoCodeId))
    .where(cond);
  if (!row) return null;
  const b = row.b;
  const [charges, lastPay, refundRows] = await Promise.all([
    db.select().from(s.bookingCharges).where(eq(s.bookingCharges.bookingId, b.id)).orderBy(s.bookingCharges.createdAt),
    db
      .select({ method: s.payments.method })
      .from(s.payments)
      .where(and(eq(s.payments.bookingId, b.id), eq(s.payments.status, 'success')))
      .orderBy(desc(s.payments.createdAt))
      .limit(1),
    db
      .select({ amount: s.refunds.amountPesewas })
      .from(s.refunds)
      .innerJoin(s.payments, eq(s.payments.id, s.refunds.paymentId))
      .where(
        and(eq(s.payments.bookingId, b.id), inArray(s.refunds.status, ['pending_approval', 'processing', 'refunded', 'manual_refunded'])),
      ),
  ]);
  return {
    id: b.id,
    ref: b.ref,
    token: b.publicToken,
    status: b.status,
    paymentStatus: b.paymentStatus,
    payMode: b.payMode,
    variantCode: row.variantCode,
    typeCode: row.typeCode,
    typeName: row.typeName,
    variantName: row.variantName,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: nightsBetween(b.checkIn, b.checkOut),
    guests: b.guests,
    guestName: row.guestName ?? '',
    phone: row.phone ?? '',
    email: row.email,
    arrivalHour: b.arrivalHour,
    breakfast: b.breakfast,
    lines: charges.map((c) => ({ label: c.description, amount: c.qty * c.unitPesewas })),
    discount: b.discountPesewas,
    promoCode: row.promoCode,
    total: b.totalPesewas,
    paid: b.paidPesewas,
    lastMethod: lastPay[0]?.method ?? null,
    refundPending: refundRows.reduce((a, r) => a + r.amount, 0),
    holdExpiresAt: b.holdExpiresAt,
  };
}

/* ───────────── the guest's own changes ───────────── */

/** Check-in time on the day, in Accra (2pm by default). */
export function checkInInstant(checkIn: IsoDate, checkInTime = '14:00'): Date {
  const [h, m] = checkInTime.split(':').map(Number);
  return accraInstant(checkIn, h ?? 14, m ?? 0);
}

export type CancelTerms = { free: boolean; refund: number; kept: number; freeUntil: Date };

/** Free cancellation more than 48 hours before check-in; inside that, the deposit is kept. */
export function cancelTerms(
  b: Pick<GuestBooking, 'checkIn' | 'total' | 'paid'>,
  opts: { now: Date; freeHours: number; depositPercent: number; checkInTime?: string },
): CancelTerms {
  const start = checkInInstant(b.checkIn, opts.checkInTime);
  const freeUntil = new Date(start.getTime() - opts.freeHours * 3600_000);
  const free = opts.now < freeUntil;
  const kept = free ? 0 : Math.min(b.paid, depositFor(b.total, opts.depositPercent));
  return { free, refund: b.paid - kept, kept, freeUntil };
}

export async function cancelByGuest(db: AnyDb, ref: string, now: Date = new Date()) {
  return db.transaction(async (tx) => {
    const b = await bookingBy(tx, { ref });
    if (!b) throw new BookingNotFoundError();
    if (!['confirmed', 'pending_payment'].includes(b.status)) throw new RangeError('This booking can no longer be changed online.');
    const pricing = await loadPricing(tx);
    const [freeHoursRow] = await tx.select().from(s.settings).where(eq(s.settings.key, 'booking.freeCancellationHours'));
    const terms = cancelTerms(b, {
      now,
      freeHours: Number(freeHoursRow?.value ?? SEED_SETTINGS['booking.freeCancellationHours']),
      depositPercent: pricing.depositPercent,
    });
    await tx.update(s.bookings).set({ status: 'cancelled', cancelledAt: now }).where(eq(s.bookings.id, b.id));
    await tx.update(s.roomAllocations).set({ active: false }).where(eq(s.roomAllocations.bookingId, b.id));
    let left = terms.refund;
    if (left > 0) {
      // Refund against the guest's payments, newest first; staff approve and send it from Payments.
      const pays = await tx
        .select()
        .from(s.payments)
        .where(and(eq(s.payments.bookingId, b.id), eq(s.payments.status, 'success')))
        .orderBy(desc(s.payments.createdAt));
      for (const p of pays) {
        if (left <= 0) break;
        const amount = Math.min(left, p.amountPesewas);
        await tx.insert(s.refunds).values({
          paymentId: p.id,
          amountPesewas: amount,
          reason: terms.free ? 'Guest cancelled online, more than 48 hours out' : 'Guest cancelled online, inside 48 hours',
          status: 'pending_approval',
        });
        left -= amount;
      }
    }
    return { booking: b, terms };
  });
}

export type DateChangeCheck = { ok: true; newTotal: number; due: number } | { ok: false; reason: 'range' | 'unchanged' | 'unavailable' };

export async function repriceFor(tx: AnyDb, b: GuestBooking, checkIn: IsoDate, checkOut: IsoDate, now: Date) {
  const pricing = await loadPricing(tx);
  const [v] = await tx.select().from(s.rateVariants).where(eq(s.rateVariants.code, b.variantCode));
  const hadRoomService = b.lines.some((l) => l.label === 'ROOM SERVICE');
  const promo = b.promoCode ? await findPromo(tx, b.promoCode) : null;
  return quoteStay({
    variant: { code: v!.code as VariantCode, name: v!.name, price: v!.pricePesewas },
    checkIn,
    checkOut,
    guests: b.guests,
    breakfast: b.breakfast,
    roomService: hadRoomService,
    rules: pricing.rules,
    fees: { breakfastPerGuestNight: pricing.breakfastPerGuestNight, roomService: pricing.roomService },
    depositPercent: pricing.depositPercent,
    promo,
    today: todayInAccra(now),
  });
}

/** Moves a confirmed booking to new dates, keeping the room if it's free and otherwise any room of the same rate. */
export async function changeDatesByGuest(db: AnyDb, ref: string, checkIn: IsoDate, checkOut: IsoDate, now: Date = new Date()) {
  if (nightsBetween(checkIn, checkOut) < 1 || checkIn < todayInAccra(now)) return { ok: false, reason: 'range' } as const;
  return db.transaction(async (tx) => {
    const b = await bookingBy(tx, { ref });
    if (!b) throw new BookingNotFoundError();
    if (!['confirmed', 'pending_payment'].includes(b.status)) throw new RangeError('This booking can no longer be changed online.');
    if (b.checkIn === checkIn && b.checkOut === checkOut) return { ok: false, reason: 'unchanged' } as const;
    const [alloc] = await tx.select().from(s.roomAllocations).where(eq(s.roomAllocations.bookingId, b.id));
    await expireLapsedHolds(tx, now, { checkIn, checkOut });
    const candidates = rowsOf<{ id: string }>(
      await tx.execute(sql`
        select r.id from rooms r
          join rate_variants v on v.id = r.rate_variant_id
         where v.code = ${b.variantCode}
           and r.status not in ('maintenance', 'out_of_order', 'retired')
           and not exists (select 1 from blackout_dates x where x.starts < ${checkOut}::date and x.ends >= ${checkIn}::date
                             and (x.room_ids is null or r.id = any(x.room_ids)))
         order by (r.id = ${alloc?.roomId ?? null}) desc, r.number`),
    ).map((r) => r.id);
    let moved = false;
    for (const roomId of candidates) {
      try {
        await tx.transaction(async (sp) => {
          await sp
            .update(s.roomAllocations)
            .set({ roomId, checkIn, checkOut, active: true, holdExpiresAt: null })
            .where(eq(s.roomAllocations.bookingId, b.id));
        });
        await tx.update(s.bookings).set({ roomId, checkIn, checkOut }).where(eq(s.bookings.id, b.id));
        moved = true;
        break;
      } catch (e) {
        if (isExclusionViolation(e)) continue;
        throw e;
      }
    }
    if (!moved) return { ok: false, reason: 'unavailable' } as const;
    const q = await repriceFor(tx, b, checkIn, checkOut, now);
    await tx.delete(s.bookingCharges).where(eq(s.bookingCharges.bookingId, b.id));
    const rows = chargeRows(b.id, q);
    if (rows.length) await tx.insert(s.bookingCharges).values(rows);
    await tx
      .update(s.bookings)
      .set({
        subtotalPesewas: q.total + q.discount,
        discountPesewas: q.discount,
        totalPesewas: q.total,
        paymentStatus: b.paid >= q.total && b.paid > 0 ? 'paid' : b.paid > 0 ? 'deposit' : 'unpaid',
      })
      .where(eq(s.bookings.id, b.id));
    return {
      ok: true,
      newTotal: q.total,
      due: Math.max(0, q.total - b.paid),
      before: { checkIn: b.checkIn, checkOut: b.checkOut },
    } as const;
  });
}

/** What the new dates would cost and whether they're free, without changing anything. */
export async function previewDateChange(
  db: AnyDb,
  ref: string,
  checkIn: IsoDate,
  checkOut: IsoDate,
  now: Date = new Date(),
): Promise<DateChangeCheck> {
  if (nightsBetween(checkIn, checkOut) < 1) return { ok: false, reason: 'range' };
  const b = await bookingBy(db, { ref });
  if (!b) throw new BookingNotFoundError();
  if (b.checkIn === checkIn && b.checkOut === checkOut) return { ok: false, reason: 'unchanged' };
  const res = await db.execute(sql`
    select count(*)::int as n from rooms r join rate_variants v on v.id = r.rate_variant_id
     where v.code = ${b.variantCode}
       and r.status not in ('maintenance', 'out_of_order', 'retired')
       and not exists (select 1 from blackout_dates x where x.starts < ${checkOut}::date and x.ends >= ${checkIn}::date
                         and (x.room_ids is null or r.id = any(x.room_ids)))
       and not exists (select 1 from room_allocations a
                        where a.room_id = r.id and a.active and a.booking_id <> ${b.id}
                          and (a.hold_expires_at is null or a.hold_expires_at > ${now.toISOString()})
                          and a.stay && daterange(${checkIn}::date, ${checkOut}::date))`);
  if (!(rowsOf<{ n: number }>(res)[0]?.n ?? 0)) return { ok: false, reason: 'unavailable' };
  const q = await repriceFor(db, b, checkIn, checkOut, now);
  return { ok: true, newTotal: q.total, due: Math.max(0, q.total - b.paid) };
}

export { NoRoomAvailableError };

/** The rental-order side of settlePayment (same transaction, payment row locked). */
async function settleOrder(tx: AnyDb, p: typeof s.payments.$inferSelect, v: Verified, now: Date): Promise<SettleOutcome> {
  const orderId = p.orderId!;
  if (p.status === 'success') return { kind: 'order_already', orderId };
  if (v.status !== 'success') {
    if (['failed', 'abandoned', 'reversed'].includes(v.status))
      await tx.update(s.payments).set({ status: 'failed' }).where(eq(s.payments.id, p.id));
    return { kind: 'order_failed', orderId, reason: v.status };
  }
  if (v.amount !== p.amountPesewas || v.currency !== 'GHS') {
    await tx
      .update(s.payments)
      .set({ status: 'failed', externalTxnId: `mismatch:${v.amount}${v.currency}` })
      .where(eq(s.payments.id, p.id));
    return { kind: 'order_failed', orderId, reason: 'amount mismatch' };
  }
  await tx
    .update(s.payments)
    .set({ status: 'success', paidAt: v.paidAt ? new Date(v.paidAt) : now })
    .where(eq(s.payments.id, p.id));
  const [o] = await tx.select().from(s.rentalOrders).where(eq(s.rentalOrders.id, orderId)).for('update');
  const paid = o!.paidPesewas + p.amountPesewas;
  const firstTime = o!.status === 'pending_payment';
  if (firstTime) {
    const { orderStillFits } = await import('./rentals');
    if (!(await orderStillFits(tx, orderId, now))) {
      await tx
        .update(s.rentalOrders)
        .set({ status: 'cancelled', paidPesewas: paid, holdUntil: null })
        .where(eq(s.rentalOrders.id, orderId));
      await tx
        .insert(s.orderStatusEvents)
        .values({ orderId, from: 'pending_payment', to: 'cancelled', reason: 'Paid after the hold lapsed; stock gone' });
      const [r] = await tx
        .insert(s.refunds)
        .values({
          paymentId: p.id,
          amountPesewas: p.amountPesewas,
          reason: 'Paid after the hold expired and the items were taken',
          status: 'processing',
        })
        .returning({ id: s.refunds.id });
      return { kind: 'order_refund', orderId, paymentId: p.id, refundId: r!.id, amount: p.amountPesewas, paystackRef: v.reference };
    }
    await tx.insert(s.orderStatusEvents).values({ orderId, from: 'pending_payment', to: 'reserved', reason: 'Paid online' });
  }
  await tx
    .update(s.rentalOrders)
    .set({ paidPesewas: paid, status: firstTime ? 'reserved' : o!.status, holdUntil: firstTime ? null : o!.holdUntil })
    .where(eq(s.rentalOrders.id, orderId));
  return { kind: 'order_confirmed', orderId, firstTime };
}

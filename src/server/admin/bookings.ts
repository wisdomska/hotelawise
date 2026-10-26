// Room bookings as the front desk sees them: lists, the two-week timeline, the
// detail drawer, and every desk action (walk-in/phone bookings, check-in/out,
// payments at the desk, cancel, extras, moving a stay). Prices come from the
// same quote the website uses; the room-allocation constraint still makes
// double-booking impossible. Every change writes one audit row.
import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from 'drizzle-orm';
import { addDays, nightsBetween, todayInAccra, type IsoDate } from '@/lib/dates';
import { BOOKING_STATUS, METHOD, SOURCE, type BookingStatus, type Method, type Source } from '@/lib/admin/labels';
import { formatGhs } from '@/lib/money';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import { audit } from '@/server/services/audit';
import { bookingBy, chargeRows, loadPricing, reallocate, repriceFor, upsertCustomer } from '@/server/services/bookings';
import { expireLapsedHolds, isExclusionViolation, type AnyDb } from '@/server/services/holds';
import type { VariantCode } from '@/server/services/pricing';
import { quoteStay } from '@/server/services/quote';
import { nextRef } from '@/server/services/references';

export type Who = { id: string; name: string };

/** A booking the desk can see: anything that got past the 15-minute hold. */
const VISIBLE = notInArray(s.bookings.status, ['held', 'expired']);

export type BookingRow = {
  ref: string;
  guest: string;
  phone: string;
  code: string;
  room: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  status: BookingStatus;
  source: Source;
  total: number;
  paid: number;
};

const rowSelect = {
  ref: s.bookings.ref,
  guest: s.customers.name,
  phone: s.customers.phoneE164,
  code: s.rateVariants.displayCode,
  room: s.rooms.number,
  checkIn: s.bookings.checkIn,
  checkOut: s.bookings.checkOut,
  status: s.bookings.status,
  source: s.bookings.source,
  total: s.bookings.totalPesewas,
  paid: s.bookings.paidPesewas,
};

function baseRows(db: AnyDb) {
  return db
    .select(rowSelect)
    .from(s.bookings)
    .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.bookings.rateVariantId))
    .leftJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
    .leftJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId));
}

function toRow(r: Awaited<ReturnType<ReturnType<typeof baseRows>['execute']>>[number]): BookingRow {
  return {
    ref: r.ref ?? '',
    guest: r.guest ?? 'Guest',
    phone: r.phone ?? '',
    code: r.code,
    room: r.room ?? '—',
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: nightsBetween(r.checkIn, r.checkOut),
    status: r.status,
    source: r.source,
    total: r.total,
    paid: r.paid,
  };
}

export const PAGE_SIZE = 8;

export async function listBookings(db: AnyDb, opts: { status?: BookingStatus; page: number }) {
  const where = opts.status ? and(VISIBLE, eq(s.bookings.status, opts.status)) : VISIBLE;
  const [rows, [{ n } = { n: 0 }], counts] = await Promise.all([
    baseRows(db)
      .where(where)
      .orderBy(asc(s.bookings.checkIn), asc(s.bookings.ref))
      .limit(PAGE_SIZE)
      .offset(Math.max(0, opts.page) * PAGE_SIZE),
    db.select({ n: count() }).from(s.bookings).where(where),
    db.select({ status: s.bookings.status, n: count() }).from(s.bookings).where(VISIBLE).groupBy(s.bookings.status),
  ]);
  return {
    rows: rows.map(toRow),
    total: Number(n),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<BookingStatus, number>>,
  };
}

/** Arriving today (still to check in) and leaving today (checked in). */
export async function arrivalsAndDepartures(db: AnyDb, today: IsoDate) {
  const rows = await baseRows(db)
    .where(
      sql`(${s.bookings.checkIn} = ${today} and ${s.bookings.status} in ('confirmed','pending_payment'))
        or (${s.bookings.checkOut} = ${today} and ${s.bookings.status} = 'checked_in')`,
    )
    .orderBy(asc(s.bookings.status), asc(s.rooms.number));
  return rows.map(toRow);
}

/** Every booking touching [from, from+days), for the Rooms-by-day timeline. */
export async function timelineBookings(db: AnyDb, from: IsoDate, days = 14) {
  const to = addDays(from, days);
  const rows = await baseRows(db)
    .where(and(VISIBLE, ne(s.bookings.status, 'cancelled'), lt(s.bookings.checkIn, to), sql`${s.bookings.checkOut} > ${from}`))
    .orderBy(asc(s.bookings.checkIn));
  return rows.map(toRow);
}

export type BookingDetail = BookingRow & {
  email: string | null;
  guests: number;
  typeName: string;
  arrivalHour: number | null;
  requests: string;
  notes: string;
  lines: { label: string; amount: number }[];
  roomCharges: number;
  method: string | null;
  refunded: number;
  refundable: number;
};

export async function bookingDetail(db: AnyDb, ref: string): Promise<BookingDetail | null> {
  const [r] = await baseRows(db).where(and(VISIBLE, eq(s.bookings.ref, ref)));
  if (!r) return null;
  const [b] = await db
    .select({
      id: s.bookings.id,
      email: s.customers.email,
      guests: s.bookings.guests,
      arrivalHour: s.bookings.arrivalHour,
      requests: s.bookings.requests,
      notes: s.bookings.notes,
      typeName: s.rateVariants.name,
    })
    .from(s.bookings)
    .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.bookings.rateVariantId))
    .leftJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
    .where(eq(s.bookings.ref, ref));
  const [charges, pays, refunds] = await Promise.all([
    db
      .select({
        kind: s.bookingCharges.kind,
        label: s.bookingCharges.description,
        qty: s.bookingCharges.qty,
        unit: s.bookingCharges.unitPesewas,
      })
      .from(s.bookingCharges)
      .where(eq(s.bookingCharges.bookingId, b!.id))
      .orderBy(asc(s.bookingCharges.createdAt)),
    db
      .select({ method: s.payments.method, amount: s.payments.amountPesewas })
      .from(s.payments)
      .where(and(eq(s.payments.bookingId, b!.id), eq(s.payments.status, 'success')))
      .orderBy(desc(s.payments.createdAt)),
    refundedFor(db, { bookingId: b!.id }),
  ]);
  const paidIn = pays.reduce((t, p) => t + p.amount, 0);
  return {
    ...toRow(r),
    email: b!.email,
    guests: b!.guests,
    typeName: b!.typeName,
    arrivalHour: b!.arrivalHour,
    requests: b!.requests,
    notes: b!.notes,
    lines: charges.map((c) => ({ label: c.label, amount: c.qty * c.unit })),
    roomCharges: charges.filter((c) => c.kind === 'room').reduce((t, c) => t + c.qty * c.unit, 0),
    method: pays[0]?.method ? METHOD[pays[0].method as Method] : null,
    refunded: refunds,
    refundable: Math.max(0, paidIn - refunds),
  };
}

/** Money already sent back, or on its way, for a booking or order. */
export async function refundedFor(db: AnyDb, target: { bookingId: string } | { orderId: string }) {
  const where = 'bookingId' in target ? eq(s.payments.bookingId, target.bookingId) : eq(s.payments.orderId, target.orderId);
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${s.refunds.amountPesewas}), 0)::int` })
    .from(s.refunds)
    .innerJoin(s.payments, eq(s.payments.id, s.refunds.paymentId))
    .where(and(where, inArray(s.refunds.status, ['pending_approval', 'processing', 'refunded', 'manual_refunded'])));
  return Number(r?.n ?? 0);
}

/* ───────────── desk bookings (phone, WhatsApp, walk-in) ───────────── */

export type DeskVariant = { code: string; displayCode: string; name: string; price: number; sleeps: number };

export async function deskVariants(db: AnyDb): Promise<DeskVariant[]> {
  const rows = await db
    .select({
      code: s.rateVariants.code,
      displayCode: s.rateVariants.displayCode,
      name: s.rateVariants.name,
      price: s.rateVariants.pricePesewas,
      sleeps: s.roomTypes.sleeps,
    })
    .from(s.rateVariants)
    .innerJoin(s.roomTypes, eq(s.roomTypes.id, s.rateVariants.roomTypeId))
    .orderBy(asc(s.roomTypes.position), asc(s.rateVariants.position));
  return rows;
}

/** Free rooms of a rate for a stay (room-number order) and what the stay costs. */
export async function deskQuote(db: AnyDb, input: { variant: string; checkIn: IsoDate; nights: number; guests: number }, now = new Date()) {
  const checkOut = addDays(input.checkIn, input.nights);
  const [v] = await db
    .select({ id: s.rateVariants.id, code: s.rateVariants.code, name: s.rateVariants.name, price: s.rateVariants.pricePesewas })
    .from(s.rateVariants)
    .where(eq(s.rateVariants.code, input.variant));
  if (!v) throw new RangeError('Pick a room type.');
  const free = rowsOf<{ number: string }>(
    await db.execute(sql`
      select r.number from rooms r
       where r.rate_variant_id = ${v.id}
         and r.status not in ('maintenance', 'out_of_order')
         and not exists (select 1 from blackout_dates x where x.starts < ${checkOut}::date and x.ends >= ${input.checkIn}::date
                           and (x.room_ids is null or r.id = any(x.room_ids)))
         and not exists (select 1 from room_allocations a
                          where a.room_id = r.id and a.active
                            and (a.hold_expires_at is null or a.hold_expires_at > ${now.toISOString()})
                            and a.stay && daterange(${input.checkIn}::date, ${checkOut}::date, '[)'))
       order by r.number`),
  ).map((r) => r.number);
  const pricing = await loadPricing(db);
  const q = quoteStay({
    variant: { code: v.code as VariantCode, name: v.name, price: v.price },
    checkIn: input.checkIn,
    checkOut,
    guests: input.guests,
    breakfast: false,
    roomService: false,
    rules: pricing.rules,
    fees: { breakfastPerGuestNight: pricing.breakfastPerGuestNight, roomService: pricing.roomService },
    depositPercent: pricing.depositPercent,
    promo: null,
    today: todayInAccra(now),
  });
  return { free, total: q.total, quote: q, checkOut, variantId: v.id };
}

export type DeskBookingInput = {
  guest: { name: string; phoneE164: string; email: string | null };
  variant: string;
  checkIn: IsoDate;
  nights: number;
  guests: number;
  room: string;
  source: Exclude<Source, 'web'>;
  pay: { method: Method; txn: string } | null;
  refSecret: string;
};

export class RoomTakenError extends Error {
  constructor(readonly room: string) {
    super(`Room ${room} is taken or blocked on one of those nights.`);
    this.name = 'RoomTakenError';
  }
}

export async function createDeskBooking(db: AnyDb, by: Who, input: DeskBookingInput, now = new Date()) {
  if (input.checkIn < todayInAccra(now)) throw new RangeError('Check-in can’t be in the past.');
  return db.transaction(async (tx) => {
    const checkOut = addDays(input.checkIn, input.nights);
    await expireLapsedHolds(tx, now, { checkIn: input.checkIn, checkOut });
    const q = await deskQuote(tx, input, now);
    if (!q.free.includes(input.room)) throw new RoomTakenError(input.room);
    const [room] = await tx.select({ id: s.rooms.id }).from(s.rooms).where(eq(s.rooms.number, input.room));
    const customerId = await upsertCustomer(tx, { ...input.guest, arrivalHour: null, requests: '' });
    const ref = await nextRef(tx, 'booking', input.refSecret);
    const paid = input.pay ? q.total : 0;
    const [b] = await tx
      .insert(s.bookings)
      .values({
        ref,
        publicToken: crypto.randomUUID().replace(/-/g, ''),
        customerId,
        rateVariantId: q.variantId,
        roomId: room!.id,
        checkIn: input.checkIn,
        checkOut,
        guests: input.guests,
        status: input.pay ? 'confirmed' : 'pending_payment',
        paymentStatus: input.pay ? 'paid' : 'unpaid',
        payMode: input.pay ? 'full' : 'at_hotel',
        source: input.source,
        subtotalPesewas: q.total + q.quote.discount,
        discountPesewas: q.quote.discount,
        totalPesewas: q.total,
        paidPesewas: paid,
        createdBy: by.id,
      })
      .returning({ id: s.bookings.id });
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(s.roomAllocations).values({ bookingId: b!.id, roomId: room!.id, checkIn: input.checkIn, checkOut, active: true });
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw new RoomTakenError(input.room);
      throw e;
    }
    const rows = chargeRows(b!.id, q.quote);
    if (rows.length) await tx.insert(s.bookingCharges).values(rows);
    if (input.pay) await insertDeskPayment(tx, by, { bookingId: b!.id }, q.total, input.pay, now);
    await audit(tx, {
      actor: by,
      action: 'Created booking',
      entity: 'booking',
      entityId: b!.id,
      target: `${ref} · ${input.guest.name}`,
      after: {
        source: SOURCE[input.source],
        room: input.room,
        total: formatGhs(q.total),
        paid: input.pay ? METHOD[input.pay.method] : 'Not paid yet',
      },
    });
    return { ref, total: q.total };
  });
}

async function insertDeskPayment(
  tx: AnyDb,
  by: Who,
  target: { bookingId: string } | { orderId: string },
  amount: number,
  pay: { method: Method; txn: string },
  now: Date,
) {
  const ref = `DESK-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  await tx.insert(s.payments).values({
    ref,
    ...target,
    amountPesewas: amount,
    method: pay.method,
    channel: 'desk',
    externalTxnId: pay.txn || null,
    status: 'success',
    byUserId: by.id,
    paidAt: now,
  });
  return ref;
}

export { insertDeskPayment };

/* ───────────── desk actions on one booking ───────────── */

export class BookingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingStateError';
  }
}

async function lockByRef(tx: AnyDb, ref: string) {
  const [b] = await tx
    .select({ b: s.bookings, guest: s.customers.name, room: s.rooms.number })
    .from(s.bookings)
    .leftJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
    .leftJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId))
    .where(and(eq(s.bookings.ref, ref), VISIBLE))
    .for('update', { of: s.bookings });
  if (!b) throw new BookingStateError('That booking no longer exists.');
  return { ...b.b, guest: b.guest ?? 'Guest', room: b.room ?? '—' };
}

const label = (st: BookingStatus) => BOOKING_STATUS[st];

export async function recordBookingPayment(
  db: AnyDb,
  by: Who,
  input: { ref: string; amount: number; method: Method; txn: string },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, input.ref);
    if (['cancelled', 'no_show'].includes(b.status)) throw new BookingStateError('This booking is cancelled. Make a new one instead.');
    const balance = b.totalPesewas - b.paidPesewas;
    if (input.amount <= 0) throw new BookingStateError('Enter an amount above 0.');
    if (input.amount > balance) throw new BookingStateError(`That's more than the balance of ${formatGhs(balance)}.`);
    if (b.status === 'pending_payment') {
      // A web booking whose online payment never came: make sure it still has its room.
      const [alloc] = await tx.select().from(s.roomAllocations).where(eq(s.roomAllocations.bookingId, b.id));
      const live = alloc?.active && (!alloc.holdExpiresAt || alloc.holdExpiresAt > now);
      if (live) await tx.update(s.roomAllocations).set({ holdExpiresAt: null }).where(eq(s.roomAllocations.bookingId, b.id));
      else if (!(await reallocate(tx, b, now))) throw new BookingStateError('No room of this type is free for these dates any more.');
    }
    await insertDeskPayment(tx, by, { bookingId: b.id }, input.amount, { method: input.method, txn: input.txn }, now);
    const paid = b.paidPesewas + input.amount;
    const status: BookingStatus = b.status === 'pending_payment' ? 'confirmed' : b.status;
    await tx
      .update(s.bookings)
      .set({ paidPesewas: paid, paymentStatus: paid >= b.totalPesewas ? 'paid' : 'deposit', status, holdExpiresAt: null })
      .where(eq(s.bookings.id, b.id));
    await audit(tx, {
      actor: by,
      action: 'Recorded payment',
      entity: 'booking',
      entityId: b.id,
      target: `${b.ref} · ${b.guest}`,
      before: { paid: formatGhs(b.paidPesewas) },
      after: { paid: formatGhs(paid), method: METHOD[input.method] },
    });
    return { guest: b.guest, amount: input.amount };
  });
}

export async function checkInBooking(db: AnyDb, by: Who, ref: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    if (!['confirmed', 'pending_payment'].includes(b.status))
      throw new BookingStateError(`This booking is ${label(b.status).toLowerCase()}.`);
    if (b.checkIn > todayInAccra(now)) throw new BookingStateError('Guests can check in from their arrival day.');
    await tx.update(s.bookings).set({ status: 'checked_in' }).where(eq(s.bookings.id, b.id));
    await audit(tx, {
      actor: by,
      action: 'Checked in',
      entity: 'booking',
      entityId: b.id,
      target: `${ref} · ${b.guest}`,
      before: { status: label(b.status) },
      after: { status: 'Checked-in' },
    });
    return { guest: b.guest, room: b.room };
  });
}

export async function checkOutBooking(db: AnyDb, by: Who, ref: string) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    if (b.status !== 'checked_in') throw new BookingStateError('Only checked-in guests can check out.');
    if (b.paidPesewas < b.totalPesewas)
      throw new BookingStateError(`${formatGhs(b.totalPesewas - b.paidPesewas)} is still due. Take payment first.`);
    await tx.update(s.bookings).set({ status: 'checked_out' }).where(eq(s.bookings.id, b.id));
    // Nights not used go back on sale; the room needs cleaning before the next guest.
    await tx.update(s.roomAllocations).set({ active: false }).where(eq(s.roomAllocations.bookingId, b.id));
    if (b.roomId) await tx.update(s.rooms).set({ status: 'cleaning' }).where(eq(s.rooms.id, b.roomId));
    await audit(tx, {
      actor: by,
      action: 'Checked out',
      entity: 'booking',
      entityId: b.id,
      target: `${ref} · ${b.guest}`,
      before: { status: 'Checked-in' },
      after: { status: 'Checked-out', room: 'Cleaning' },
    });
    return { guest: b.guest, room: b.room };
  });
}

/** "Move back" with a reason (prototype openBack): Checked-in → Confirmed. */
export async function undoCheckIn(db: AnyDb, by: Who, ref: string, reason: string) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    if (b.status !== 'checked_in') throw new BookingStateError('This guest isn’t checked in.');
    await tx
      .update(s.bookings)
      .set({ status: b.paidPesewas > 0 || b.payMode === 'at_hotel' ? 'confirmed' : 'pending_payment' })
      .where(eq(s.bookings.id, b.id));
    await audit(tx, {
      actor: by,
      action: 'Moved back',
      entity: 'booking',
      entityId: b.id,
      target: ref,
      before: { status: 'Checked-in' },
      after: { status: 'Confirmed', reason },
    });
  });
}

export async function cancelBookingAtDesk(db: AnyDb, by: Who, ref: string, now = new Date()) {
  const out = await db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    if (['cancelled', 'checked_out', 'no_show'].includes(b.status))
      throw new BookingStateError(`This booking is already ${label(b.status).toLowerCase()}.`);
    await tx.update(s.bookings).set({ status: 'cancelled', cancelledAt: now }).where(eq(s.bookings.id, b.id));
    await tx.update(s.roomAllocations).set({ active: false }).where(eq(s.roomAllocations.bookingId, b.id));
    await audit(tx, {
      actor: by,
      action: 'Cancelled booking',
      entity: 'booking',
      entityId: b.id,
      target: `${ref} · ${b.guest}`,
      before: { status: label(b.status) },
      after: { status: 'Cancelled' },
    });
    return { guest: b.guest, paid: b.paidPesewas };
  });
  const gb = await bookingBy(db, { ref });
  return { ...out, booking: gb };
}

export async function addRoomService(db: AnyDb, by: Who, ref: string) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    if (!['confirmed', 'checked_in'].includes(b.status))
      throw new BookingStateError('Room service can be added to confirmed or checked-in stays.');
    const { roomService } = await loadPricing(tx);
    await tx.insert(s.bookingCharges).values({
      bookingId: b.id,
      kind: 'room_service',
      description: 'Room service (desk)',
      qty: 1,
      unitPesewas: roomService,
      createdBy: by.id,
    });
    const total = b.totalPesewas + roomService;
    await tx
      .update(s.bookings)
      .set({
        totalPesewas: total,
        subtotalPesewas: b.subtotalPesewas + roomService,
        paymentStatus: b.paidPesewas >= total ? 'paid' : b.paidPesewas > 0 ? 'deposit' : 'unpaid',
      })
      .where(eq(s.bookings.id, b.id));
    await audit(tx, {
      actor: by,
      action: 'Added charge',
      entity: 'booking',
      entityId: b.id,
      target: ref,
      before: { total: formatGhs(b.totalPesewas) },
      after: { total: formatGhs(total), charge: 'Room service' },
    });
    return { fee: roomService };
  });
}

export async function setBookingNote(db: AnyDb, by: Who, ref: string, note: string) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    await tx.update(s.bookings).set({ notes: note }).where(eq(s.bookings.id, b.id));
    await audit(tx, { actor: by, action: 'Edited staff note', entity: 'booking', entityId: b.id, target: ref });
  });
}

/** Super Admins only, and only for bookings with no money on record (test or duplicate). */
export async function deleteBooking(db: AnyDb, by: Who, ref: string) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, ref);
    const [p] = await tx.select({ n: count() }).from(s.payments).where(eq(s.payments.bookingId, b.id));
    if (Number(p?.n ?? 0) > 0)
      throw new BookingStateError('This booking has payments on record. Cancel it (and refund) instead, so the money stays traceable.');
    await tx.delete(s.bookings).where(eq(s.bookings.id, b.id));
    await audit(tx, {
      actor: by,
      action: 'Deleted booking',
      entity: 'booking',
      entityId: b.id,
      target: `${ref} · ${b.guest}`,
      before: { status: label(b.status), total: formatGhs(b.totalPesewas) },
    });
  });
}

/**
 * Timeline drag: move the stay (same room, same nights) or change its nights.
 * The room's other bookings and blocked dates are respected; the price is redone
 * from today's rates, keeping extras staff added.
 */
export async function moveBooking(db: AnyDb, by: Who, input: { ref: string; mode: 'move' | 'extend'; delta: number }, now = new Date()) {
  return db.transaction(async (tx) => {
    const b = await lockByRef(tx, input.ref);
    if (['checked_out', 'no_show', 'cancelled'].includes(b.status))
      throw new BookingStateError('This stay is finished. Past bookings can’t be moved.');
    if (input.mode === 'move' && b.status === 'checked_in')
      throw new BookingStateError('Guest is already in. You can only change the nights for a checked-in guest.');
    const nights = nightsBetween(b.checkIn, b.checkOut);
    const checkIn = input.mode === 'move' ? addDays(b.checkIn, input.delta) : b.checkIn;
    const newNights = input.mode === 'extend' ? Math.max(1, nights + input.delta) : nights;
    const checkOut = addDays(checkIn, newNights);
    if (input.mode === 'move' && checkIn < todayInAccra(now)) throw new BookingStateError('Can’t move into the past.');
    if (!b.roomId) throw new BookingStateError('This booking has no room yet.');
    const blocked = rowsOf<{ n: number }>(
      await tx.execute(sql`select count(*)::int as n from blackout_dates x where x.starts < ${checkOut}::date and x.ends >= ${checkIn}::date
                             and (x.room_ids is null or ${b.roomId}::uuid = any(x.room_ids))`),
    )[0]?.n;
    if (blocked) throw new RoomTakenError(b.room);
    await expireLapsedHolds(tx, now, { checkIn, checkOut });
    try {
      await tx.transaction(async (sp) => {
        await sp
          .update(s.roomAllocations)
          .set({ checkIn, checkOut, active: true, holdExpiresAt: null })
          .where(eq(s.roomAllocations.bookingId, b.id));
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw new RoomTakenError(b.room);
      throw e;
    }
    await tx.update(s.bookings).set({ checkIn, checkOut }).where(eq(s.bookings.id, b.id));
    const gb = await bookingBy(tx, { ref: input.ref });
    const q = await repriceFor(tx, gb!, checkIn, checkOut, now);
    const extras = await tx
      .select({ amt: sql<number>`coalesce(sum(${s.bookingCharges.qty} * ${s.bookingCharges.unitPesewas}), 0)::int` })
      .from(s.bookingCharges)
      .where(and(eq(s.bookingCharges.bookingId, b.id), isNotNull(s.bookingCharges.createdBy)));
    const staffExtras = Number(extras[0]?.amt ?? 0);
    await tx.delete(s.bookingCharges).where(and(eq(s.bookingCharges.bookingId, b.id), isNull(s.bookingCharges.createdBy)));
    const rows = chargeRows(b.id, q);
    if (rows.length) await tx.insert(s.bookingCharges).values(rows);
    const total = q.total + staffExtras;
    await tx
      .update(s.bookings)
      .set({
        subtotalPesewas: total + q.discount,
        discountPesewas: q.discount,
        totalPesewas: total,
        paymentStatus: b.paidPesewas >= total && b.paidPesewas > 0 ? 'paid' : b.paidPesewas > 0 ? 'deposit' : 'unpaid',
      })
      .where(eq(s.bookings.id, b.id));
    await audit(tx, {
      actor: by,
      action: input.mode === 'move' ? 'Moved booking' : 'Changed nights',
      entity: 'booking',
      entityId: b.id,
      target: `${input.ref} · ${b.guest}`,
      before: { dates: `${b.checkIn} → ${b.checkOut}`, total: formatGhs(b.totalPesewas) },
      after: { dates: `${checkIn} → ${checkOut}`, total: formatGhs(total) },
    });
    return { checkIn, checkOut, nights: newNights, booking: gb };
  });
}

/* ───────────── rooms ───────────── */

export type RoomTile = {
  number: string;
  code: string;
  variant: string;
  status: string;
  guest: string | null;
  leaves: IsoDate | null;
  ref: string | null;
};

export async function roomBoard(db: AnyDb): Promise<RoomTile[]> {
  const rows = await db
    .select({
      number: s.rooms.number,
      code: s.rateVariants.displayCode,
      variant: s.rateVariants.name,
      status: s.rooms.status,
      guest: s.customers.name,
      leaves: s.bookings.checkOut,
      ref: s.bookings.ref,
    })
    .from(s.rooms)
    .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.rooms.rateVariantId))
    .leftJoin(s.bookings, and(eq(s.bookings.roomId, s.rooms.id), eq(s.bookings.status, 'checked_in')))
    .leftJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
    .orderBy(asc(s.rooms.number));
  return rows.map((r) => ({ ...r, status: r.ref ? 'occupied' : r.status === 'occupied' ? 'available' : r.status }));
}

export async function roomDetail(db: AnyDb, number: string, today: IsoDate) {
  const [room] = await db
    .select({
      id: s.rooms.id,
      number: s.rooms.number,
      status: s.rooms.status,
      code: s.rateVariants.displayCode,
      name: s.rateVariants.name,
      price: s.rateVariants.pricePesewas,
      sleeps: s.roomTypes.sleeps,
      beds: s.roomTypes.beds,
    })
    .from(s.rooms)
    .innerJoin(s.rateVariants, eq(s.rateVariants.id, s.rooms.rateVariantId))
    .innerJoin(s.roomTypes, eq(s.roomTypes.id, s.rateVariants.roomTypeId))
    .where(eq(s.rooms.number, number));
  if (!room) return null;
  const [current] = await baseRows(db).where(and(eq(s.bookings.roomId, room.id), eq(s.bookings.status, 'checked_in')));
  const upcoming = await baseRows(db)
    .where(
      and(eq(s.bookings.roomId, room.id), inArray(s.bookings.status, ['confirmed', 'pending_payment']), gte(s.bookings.checkIn, today)),
    )
    .orderBy(asc(s.bookings.checkIn))
    .limit(5);
  return { ...room, current: current ? toRow(current) : null, upcoming: upcoming.map(toRow) };
}

export const SETTABLE_ROOM_STATUS = ['available', 'cleaning', 'maintenance', 'out_of_order'] as const;
export type SettableRoomStatus = (typeof SETTABLE_ROOM_STATUS)[number];

export async function setRoomStatus(db: AnyDb, by: Who, number: string, status: SettableRoomStatus) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(s.rooms).where(eq(s.rooms.number, number)).for('update');
    if (!r) throw new BookingStateError('That room doesn’t exist.');
    const [inUse] = await tx
      .select({ n: count() })
      .from(s.bookings)
      .where(and(eq(s.bookings.roomId, r.id), eq(s.bookings.status, 'checked_in')));
    if (Number(inUse?.n ?? 0)) throw new BookingStateError(`A guest is in room ${number}. Check them out first.`);
    await tx.update(s.rooms).set({ status }).where(eq(s.rooms.id, r.id));
    await audit(tx, {
      actor: by,
      action: 'Room status',
      entity: 'room',
      entityId: r.id,
      target: number,
      before: { status: r.status },
      after: { status },
    });
  });
}

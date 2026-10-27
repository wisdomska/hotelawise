// The refusals and edge cases around bookings: bad input, switched-off options,
// Paystack answers other than "success", and date changes that can't happen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import {
  abandonHold,
  BookingNotFoundError,
  bookingBy,
  cancelByGuest,
  changeDatesByGuest,
  checkout,
  createPendingPayment,
  findPromo,
  freeByVariant,
  previewDateChange,
  settlePayment,
  startHold,
  UNKNOWN_PROMO,
} from '@/server/services/bookings';
import { placeRentalOrder } from '@/server/services/rentals';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
const SECRET = 'booking-edges-secret-0123';
const NOW = new Date('2027-01-05T10:00:00Z');
const guest = (phone = '+233244123456') => ({
  name: 'Kofi Mensah',
  phoneE164: phone,
  email: 'kofi@example.com',
  arrivalHour: null,
  requests: '',
});

beforeAll(async () => {
  h = await freshDb('booking_edges');
  const [t] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'VIP', name: 'VIP', beds: 'Large double bed', sleeps: 2, bathroom: 'VIP bathroom' })
    .returning();
  const [v] = await h.db
    .insert(s.rateVariants)
    .values({ roomTypeId: t!.id, code: 'VIP', displayCode: 'VIP', name: 'VIP', pricePesewas: 30000 })
    .returning();
  await h.db.insert(s.rooms).values({ number: '206', rateVariantId: v!.id });
  await h.db.insert(s.promoCodes).values([
    { code: 'AWISE3', type: 'breakfast', value: 0, minNights: 3 },
    { code: 'NIGHTOWL', type: 'ghs', value: 2000 },
  ]);
  await h.db
    .insert(s.rentalItems)
    .values({ slug: 'canopy', name: 'Canopy', pricePerDayPesewas: 25000, depositPerUnitPesewas: 10000, stockTotal: 4, position: 0 });
});
afterAll(async () => h?.drop());

let n = 0;
async function book(ci: string, co: string, over: Partial<Parameters<typeof checkout>[1]> = {}) {
  const sessionId = `e${++n}`;
  const held = await startHold(h.db, { variantCode: 'VIP', checkIn: ci, checkOut: co, guests: 2, sessionId, now: NOW });
  return checkout(h.db, {
    token: held.token,
    sessionId,
    guests: 2,
    guest: guest(),
    breakfast: false,
    roomService: false,
    promoCode: null,
    plan: 'at_hotel',
    refSecret: SECRET,
    now: NOW,
    ...over,
  });
}

describe('starting a hold', () => {
  const base = { variantCode: 'VIP', checkIn: '2027-02-01', checkOut: '2027-02-02', guests: 2, sessionId: 'x', now: NOW };
  it('refuses an unknown rate, too many guests, past dates and very long stays', async () => {
    await expect(startHold(h.db, { ...base, variantCode: 'NOPE' })).rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(startHold(h.db, { ...base, guests: 3 })).rejects.toThrow('This room sleeps 2.');
    await expect(startHold(h.db, { ...base, guests: 0 })).rejects.toThrow('This room sleeps 2.');
    await expect(startHold(h.db, { ...base, checkIn: '2027-01-01' })).rejects.toThrow('Check-in is in the past.');
    await expect(startHold(h.db, { ...base, checkOut: '2027-04-05' })).rejects.toThrow('For stays over 60 nights, call the desk.');
  });

  it('only lets the browser that made a hold abandon it', async () => {
    const held = await startHold(h.db, { ...base, checkIn: '2027-02-03', checkOut: '2027-02-04', sessionId: 'mine' });
    await abandonHold(h.db, held.token, 'someone-else');
    expect((await freeByVariant(h.db, '2027-02-03', '2027-02-04', NOW)).VIP).toBe(0);
    await abandonHold(h.db, held.token, 'mine');
    expect((await freeByVariant(h.db, '2027-02-03', '2027-02-04', NOW)).VIP).toBe(1);
  });
});

describe('checkout', () => {
  it('ignores a blank promo lookup and finds codes case-insensitively', async () => {
    expect(await findPromo(h.db, '   ')).toBeNull();
    expect(await findPromo(h.db, 'nope')).toBeNull();
    expect(await findPromo(h.db, ' awise3 ')).toMatchObject({ code: 'AWISE3', type: 'breakfast', minNights: 3, appliesTo: 'all' });
  });

  it('explains why a real code does not apply, and names an unknown one', async () => {
    const short = await book('2027-02-10', '2027-02-11', { promoCode: 'AWISE3' });
    expect(short.promoError).toBe('That code needs a stay of 3 nights or more.');
    expect(short.total).toBe(30000);
    const unknown = await book('2027-02-12', '2027-02-13', { promoCode: 'FREEROOM' });
    expect(unknown.promoError).toBe(UNKNOWN_PROMO);
  });

  it('caps guests at what the room sleeps and saves room service as a charge', async () => {
    const r = await book('2027-02-14', '2027-02-15', { guests: 9, roomService: true, breakfast: true });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect(b!.guests).toBe(2);
    expect(b!.lines.map((l) => l.label)).toContain('ROOM SERVICE');
  });

  it('refuses pay-at-hotel when the hotel has switched it off', async () => {
    await h.db.insert(s.settings).values({ key: 'booking.payAtHotel', value: false });
    try {
      await expect(book('2027-02-16', '2027-02-17')).rejects.toThrow('Pay at the hotel is switched off.');
    } finally {
      await h.db.delete(s.settings).where(eq(s.settings.key, 'booking.payAtHotel'));
    }
  });
});

describe('settling payments', () => {
  it('ignores references it never issued', async () => {
    expect(await settlePayment(h.db, { reference: 'AWP-unknown', status: 'success', amount: 1, currency: 'GHS' }, NOW)).toEqual({
      kind: 'ignored',
      reason: 'unknown reference',
    });
  });

  it('marks a declined payment failed but leaves a pending one alone', async () => {
    const r = await book('2027-03-01', '2027-03-02', { plan: 'full' });
    const declined = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'mtn' });
    expect(await settlePayment(h.db, { reference: declined, status: 'failed', amount: r.dueNow, currency: 'GHS' }, NOW)).toMatchObject({
      kind: 'failed',
      reason: 'failed',
    });
    const waiting = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'mtn' });
    expect(await settlePayment(h.db, { reference: waiting, status: 'ongoing', amount: r.dueNow, currency: 'GHS' }, NOW)).toMatchObject({
      kind: 'failed',
      reason: 'ongoing',
    });
    const rows = await h.db
      .select({ ref: s.payments.paystackRef, status: s.payments.status })
      .from(s.payments)
      .where(eq(s.payments.bookingId, r.bookingId));
    expect(Object.fromEntries(rows.map((p) => [p.ref, p.status]))).toEqual({ [declined]: 'failed', [waiting]: 'pending' });
  });

  it('records Paystack’s paid-at time and counts the promo once paid', async () => {
    const r = await book('2027-03-05', '2027-03-06', { plan: 'full', promoCode: 'NIGHTOWL' });
    const ref = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'card' });
    const [before] = await h.db.select().from(s.promoCodes).where(eq(s.promoCodes.code, 'NIGHTOWL'));
    await settlePayment(
      h.db,
      { reference: ref, status: 'success', amount: r.dueNow, currency: 'GHS', paidAt: '2027-01-05T10:03:00Z' },
      NOW,
    );
    const [p] = await h.db.select().from(s.payments).where(eq(s.payments.paystackRef, ref));
    expect(p!.paidAt!.toISOString()).toBe('2027-01-05T10:03:00.000Z');
    const [after] = await h.db.select().from(s.promoCodes).where(eq(s.promoCodes.code, 'NIGHTOWL'));
    expect(after!.usedCount).toBe(before!.usedCount + 1);
  });

  it('applies the same rules to rental payments', async () => {
    const o = await placeRentalOrder(h.db, {
      starts: '2027-04-01',
      ends: '2027-04-01',
      cart: { canopy: 1 },
      packs: [],
      collector: { name: 'Abena Owusu', phoneE164: '+233244123456', email: null },
      occasion: 'Wedding',
      payMode: 'online',
      publicToken: 'edge-order-xxxxxxxxxxxx',
      refSecret: SECRET,
      now: NOW,
    });
    const pay = () => createPendingPayment(h.db, { orderId: o.id, amount: o.totalPesewas, method: 'mtn' });
    const a = await pay();
    expect(await settlePayment(h.db, { reference: a, status: 'abandoned', amount: o.totalPesewas, currency: 'GHS' }, NOW)).toEqual({
      kind: 'order_failed',
      orderId: o.id,
      reason: 'abandoned',
    });
    const b = await pay();
    expect(await settlePayment(h.db, { reference: b, status: 'pending', amount: o.totalPesewas, currency: 'GHS' }, NOW)).toMatchObject({
      kind: 'order_failed',
      reason: 'pending',
    });
    expect(await settlePayment(h.db, { reference: b, status: 'success', amount: o.totalPesewas, currency: 'USD' }, NOW)).toMatchObject({
      kind: 'order_failed',
      reason: 'amount mismatch',
    });
    const c = await pay();
    expect(
      await settlePayment(
        h.db,
        { reference: c, status: 'success', amount: o.totalPesewas, currency: 'GHS', paidAt: '2027-01-05T10:01:00Z' },
        NOW,
      ),
    ).toEqual({ kind: 'order_confirmed', orderId: o.id, firstTime: true });
    const statuses = await h.db
      .select({ ref: s.payments.paystackRef, status: s.payments.status })
      .from(s.payments)
      .where(eq(s.payments.orderId, o.id));
    expect(Object.fromEntries(statuses.map((p) => [p.ref, p.status]))).toEqual({ [a]: 'failed', [b]: 'failed', [c]: 'success' });
  });
});

describe('guest changes that cannot happen', () => {
  it('refuses unknown references and bookings that are already cancelled', async () => {
    await expect(cancelByGuest(h.db, 'AW-NONE', NOW)).rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(changeDatesByGuest(h.db, 'AW-NONE', '2027-05-01', '2027-05-02', NOW)).rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(previewDateChange(h.db, 'AW-NONE', '2027-05-01', '2027-05-02', NOW)).rejects.toBeInstanceOf(BookingNotFoundError);
    const r = await book('2027-05-01', '2027-05-02');
    const { terms } = await cancelByGuest(h.db, r.ref, NOW);
    expect(terms.refund).toBe(0);
    await expect(cancelByGuest(h.db, r.ref, NOW)).rejects.toThrow('This booking can no longer be changed online.');
    await expect(changeDatesByGuest(h.db, r.ref, '2027-05-03', '2027-05-04', NOW)).rejects.toThrow(
      'This booking can no longer be changed online.',
    );
  });

  it('rejects empty, past and unchanged ranges, and dates with no room', async () => {
    const r = await book('2027-05-10', '2027-05-12');
    expect(await changeDatesByGuest(h.db, r.ref, '2027-05-20', '2027-05-20', NOW)).toEqual({ ok: false, reason: 'range' });
    expect(await changeDatesByGuest(h.db, r.ref, '2027-01-01', '2027-01-02', NOW)).toEqual({ ok: false, reason: 'range' });
    expect(await previewDateChange(h.db, r.ref, '2027-05-20', '2027-05-19', NOW)).toEqual({ ok: false, reason: 'range' });
    expect(await changeDatesByGuest(h.db, r.ref, '2027-05-10', '2027-05-12', NOW)).toEqual({ ok: false, reason: 'unchanged' });
    expect(await previewDateChange(h.db, r.ref, '2027-05-10', '2027-05-12', NOW)).toEqual({ ok: false, reason: 'unchanged' });
    await book('2027-05-20', '2027-05-21');
    expect(await previewDateChange(h.db, r.ref, '2027-05-20', '2027-05-21', NOW)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await changeDatesByGuest(h.db, r.ref, '2027-05-20', '2027-05-21', NOW)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('keeps room service and a paid deposit when the dates move', async () => {
    const r = await book('2027-06-01', '2027-06-02', { plan: 'deposit', roomService: true });
    const ref = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'mtn' });
    await settlePayment(h.db, { reference: ref, status: 'success', amount: r.dueNow, currency: 'GHS' }, NOW);
    const moved = await changeDatesByGuest(h.db, r.ref, '2027-06-05', '2027-06-07', NOW);
    expect(moved).toMatchObject({ ok: true, before: { checkIn: '2027-06-01', checkOut: '2027-06-02' } });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect(b!.lines.map((l) => l.label)).toContain('ROOM SERVICE');
    expect([b!.paymentStatus, b!.paid]).toEqual(['deposit', r.dueNow]);
  });

  it('marks a fully paid booking paid after a cheaper move', async () => {
    const r = await book('2027-06-10', '2027-06-13', { plan: 'full' });
    const ref = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'card' });
    await settlePayment(h.db, { reference: ref, status: 'success', amount: r.dueNow, currency: 'GHS' }, NOW);
    expect(await changeDatesByGuest(h.db, r.ref, '2027-06-20', '2027-06-21', NOW)).toMatchObject({ ok: true, newTotal: 30000, due: 0 });
    expect((await bookingBy(h.db, { ref: r.ref }))!.paymentStatus).toBe('paid');
  });
});

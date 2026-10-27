import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import {
  abandonHold,
  bookingBy,
  cancelByGuest,
  cancelTerms,
  changeDatesByGuest,
  checkout,
  createPendingPayment,
  freeByVariant,
  HoldExpiredError,
  previewDateChange,
  settlePayment,
  soldOutNights,
  startHold,
} from '@/server/services/bookings';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
const SECRET = 'test-ref-secret-0123456789';
const guest = (phone = '+233244123456') => ({ name: 'Kofi Mensah', phoneE164: phone, email: null, arrivalHour: 22, requests: '' });

beforeAll(async () => {
  h = await freshDb('bookings');
  const [vipType] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'VIP', name: 'VIP', beds: 'Large double bed', sleeps: 2, bathroom: 'VIP bathroom' })
    .returning();
  const [vip] = await h.db
    .insert(s.rateVariants)
    .values({ roomTypeId: vipType!.id, code: 'VIP', displayCode: 'VIP', name: 'VIP', pricePesewas: 30000 })
    .returning();
  await h.db.insert(s.rooms).values([
    { number: '206', rateVariantId: vip!.id },
    { number: '207', rateVariantId: vip!.id },
  ]);
  await h.db.insert(s.promoCodes).values({ code: 'NIGHTOWL', type: 'ghs', value: 2000 });
});
afterAll(async () => h?.drop());

const NOW = new Date('2027-01-05T10:00:00Z');
let n = 0;
const hold = (ci: string, co: string, now = NOW) =>
  startHold(h.db, { variantCode: 'VIP', checkIn: ci, checkOut: co, guests: 2, sessionId: `s${++n}`, now });

describe('booking checkout', () => {
  it('pay at hotel confirms at once with the server’s own price and a reference', async () => {
    const held = await hold('2027-02-01', '2027-02-03');
    const sessionId = `s${n}`;
    const r = await checkout(h.db, {
      token: held.token,
      sessionId,
      guests: 2,
      guest: guest(),
      breakfast: true,
      roomService: false,
      promoCode: 'nightowl',
      plan: 'at_hotel',
      refSecret: SECRET,
      now: NOW,
    });
    expect(r.status).toBe('confirmed');
    expect(r.ref).toMatch(/^AW-[2-9A-HJ-NP-Z]{4}$/);
    // 2 × 300 + breakfast 2 × 2 × 50 − 20 = 780
    expect(r.total).toBe(78000);
    expect(r.dueNow).toBe(0);
    const b = await bookingBy(h.db, { token: held.token });
    expect(b!.lines.map((l) => l.label)).toEqual(['VIP × 2', 'BREAKFAST × 2 × 2']);
    expect([b!.discount, b!.promoCode, b!.holdExpiresAt]).toEqual([2000, 'NIGHTOWL', null]);
    const [alloc] = await h.db.select().from(s.roomAllocations).where(eq(s.roomAllocations.bookingId, b!.id));
    expect(alloc!.holdExpiresAt).toBeNull();
    const [promo] = await h.db.select().from(s.promoCodes);
    expect(promo!.usedCount).toBe(1);
  });

  it('refuses a hold from another browser session or one that has lapsed', async () => {
    const held = await hold('2027-02-10', '2027-02-11');
    const base = {
      token: held.token,
      guests: 2,
      guest: guest(),
      breakfast: false,
      roomService: false,
      promoCode: null,
      plan: 'full' as const,
      refSecret: SECRET,
    };
    await expect(checkout(h.db, { ...base, sessionId: 'someone-else', now: NOW })).rejects.toBeInstanceOf(HoldExpiredError);
    await expect(checkout(h.db, { ...base, sessionId: `s${n}`, now: new Date(NOW.getTime() + 16 * 60_000) })).rejects.toBeInstanceOf(
      HoldExpiredError,
    );
  });

  it('reports an unknown promo code and charges full price', async () => {
    const held = await hold('2027-02-12', '2027-02-13');
    const r = await checkout(h.db, {
      token: held.token,
      sessionId: `s${n}`,
      guests: 2,
      guest: guest(),
      breakfast: false,
      roomService: false,
      promoCode: 'NOPE',
      plan: 'full',
      refSecret: SECRET,
      now: NOW,
    });
    expect(r.promoError).toBe("We don't recognise that code. Check the spelling.");
    expect(r.total).toBe(30000);
  });
});

describe('settling a Paystack payment', () => {
  async function pendingBooking(ci: string, co: string, plan: 'full' | 'deposit' = 'deposit', now = NOW) {
    const held = await hold(ci, co, now);
    const r = await checkout(h.db, {
      token: held.token,
      sessionId: `s${n}`,
      guests: 2,
      guest: guest(),
      breakfast: false,
      roomService: false,
      promoCode: null,
      plan,
      refSecret: SECRET,
      now,
    });
    const ref = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'mtn' });
    return { ...r, payRef: ref };
  }

  it('confirms once, records the deposit, and ignores the second delivery', async () => {
    const r = await pendingBooking('2027-03-01', '2027-03-03');
    expect(r.dueNow).toBe(18000); // 30% of 600
    const v = { reference: r.payRef, status: 'success', amount: 18000, currency: 'GHS' };
    expect(await settlePayment(h.db, v, NOW)).toMatchObject({ kind: 'confirmed', firstTime: true });
    expect(await settlePayment(h.db, v, NOW)).toMatchObject({ kind: 'already' });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect([b!.status, b!.paymentStatus, b!.paid]).toEqual(['confirmed', 'deposit', 18000]);
  });

  it('never confirms on a short or foreign-currency payment', async () => {
    const r = await pendingBooking('2027-03-05', '2027-03-06', 'full');
    expect(await settlePayment(h.db, { reference: r.payRef, status: 'success', amount: 100, currency: 'GHS' }, NOW)).toMatchObject({
      kind: 'failed',
      reason: 'amount mismatch',
    });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect(b!.status).toBe('pending_payment');
  });

  it('a payment after the hold lapsed still confirms when a room is free', async () => {
    const r = await pendingBooking('2027-03-10', '2027-03-11', 'full');
    const late = new Date(NOW.getTime() + 20 * 60_000);
    expect(await settlePayment(h.db, { reference: r.payRef, status: 'success', amount: 30000, currency: 'GHS' }, late)).toMatchObject({
      kind: 'confirmed',
    });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect([b!.status, b!.paymentStatus]).toEqual(['confirmed', 'paid']);
  });

  it('a payment after the hold lapsed and both rooms went is refunded in full', async () => {
    const r = await pendingBooking('2027-03-20', '2027-03-21', 'full');
    const late = new Date(NOW.getTime() + 20 * 60_000);
    // Two other guests take both VIP rooms after the first hold lapsed.
    for (let i = 0; i < 2; i++) {
      const other = await hold('2027-03-20', '2027-03-21', late);
      await checkout(h.db, {
        token: other.token,
        sessionId: `s${n}`,
        guests: 1,
        guest: guest(`+23324412345${i}`),
        breakfast: false,
        roomService: false,
        promoCode: null,
        plan: 'at_hotel',
        refSecret: SECRET,
        now: late,
      });
    }
    const out = await settlePayment(h.db, { reference: r.payRef, status: 'success', amount: 30000, currency: 'GHS' }, late);
    expect(out).toMatchObject({ kind: 'refund', amount: 30000 });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect([b!.status, b!.paid]).toEqual(['cancelled', 30000]);
  });
});

describe('availability for the booking page', () => {
  it('counts free rooms per rate and strikes through sold-out nights', async () => {
    const before = await freeByVariant(h.db, '2027-04-01', '2027-04-02', NOW);
    expect(before.VIP).toBe(2);
    for (let i = 0; i < 2; i++) {
      const held = await hold('2027-04-01', '2027-04-02');
      await checkout(h.db, {
        token: held.token,
        sessionId: `s${n}`,
        guests: 1,
        guest: guest(`+23324498765${i}`),
        breakfast: false,
        roomService: false,
        promoCode: null,
        plan: 'at_hotel',
        refSecret: SECRET,
        now: NOW,
      });
    }
    expect((await freeByVariant(h.db, '2027-04-01', '2027-04-02', NOW)).VIP).toBe(0);
    expect(await soldOutNights(h.db, '2027-03-31', 3, NOW)).toEqual(['2027-04-01']);
  });

  it('frees the room as soon as a guest goes back from step 2', async () => {
    const held = await hold('2027-04-05', '2027-04-06');
    expect((await freeByVariant(h.db, '2027-04-05', '2027-04-06', NOW)).VIP).toBe(1);
    await abandonHold(h.db, held.token, `s${n}`);
    expect((await freeByVariant(h.db, '2027-04-05', '2027-04-06', NOW)).VIP).toBe(2);
  });
});

describe('guest changes', () => {
  it('cancels for free more than 48 hours out, keeps the deposit inside that', () => {
    const b = { checkIn: '2027-06-10', total: 60000, paid: 60000 };
    const early = cancelTerms(b, { now: new Date('2027-06-08T13:59:00Z'), freeHours: 48, depositPercent: 30 });
    expect([early.free, early.refund, early.kept]).toEqual([true, 60000, 0]);
    const late = cancelTerms(b, { now: new Date('2027-06-08T14:01:00Z'), freeHours: 48, depositPercent: 30 });
    expect([late.free, late.refund, late.kept]).toEqual([false, 42000, 18000]);
  });

  it('cancelling releases the room and queues the refund for approval', async () => {
    const held = await hold('2027-07-01', '2027-07-02');
    const r = await checkout(h.db, {
      token: held.token,
      sessionId: `s${n}`,
      guests: 2,
      guest: guest(),
      breakfast: false,
      roomService: false,
      promoCode: null,
      plan: 'full',
      refSecret: SECRET,
      now: NOW,
    });
    const pay = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'card' });
    await settlePayment(h.db, { reference: pay, status: 'success', amount: r.dueNow, currency: 'GHS' }, NOW);
    const { terms } = await cancelByGuest(h.db, r.ref, NOW);
    expect([terms.free, terms.refund]).toEqual([true, 30000]);
    const b = await bookingBy(h.db, { ref: r.ref });
    expect([b!.status, b!.refundPending]).toEqual(['cancelled', 30000]);
    expect((await freeByVariant(h.db, '2027-07-01', '2027-07-02', NOW)).VIP).toBe(2);
  });

  it('moves dates when a room is free and reprices the stay', async () => {
    const held = await hold('2027-08-01', '2027-08-02');
    const r = await checkout(h.db, {
      token: held.token,
      sessionId: `s${n}`,
      guests: 2,
      guest: guest(),
      breakfast: false,
      roomService: false,
      promoCode: null,
      plan: 'at_hotel',
      refSecret: SECRET,
      now: NOW,
    });
    expect(await previewDateChange(h.db, r.ref, '2027-08-10', '2027-08-13', NOW)).toEqual({ ok: true, newTotal: 90000, due: 90000 });
    expect(await changeDatesByGuest(h.db, r.ref, '2027-08-10', '2027-08-13', NOW)).toMatchObject({ ok: true, newTotal: 90000 });
    const b = await bookingBy(h.db, { ref: r.ref });
    expect([b!.checkIn, b!.checkOut, b!.total]).toEqual(['2027-08-10', '2027-08-13', 90000]);
    expect((await freeByVariant(h.db, '2027-08-01', '2027-08-02', NOW)).VIP).toBe(2);
  });

  it('refuses dates when every room of the rate is taken', async () => {
    const held = await hold('2027-09-01', '2027-09-02');
    const mine = await checkout(h.db, {
      token: held.token,
      sessionId: `s${n}`,
      guests: 2,
      guest: guest(),
      breakfast: false,
      roomService: false,
      promoCode: null,
      plan: 'at_hotel',
      refSecret: SECRET,
      now: NOW,
    });
    for (let i = 0; i < 2; i++) {
      const o = await hold('2027-09-10', '2027-09-11');
      await checkout(h.db, {
        token: o.token,
        sessionId: `s${n}`,
        guests: 1,
        guest: guest(`+23324455566${i}`),
        breakfast: false,
        roomService: false,
        promoCode: null,
        plan: 'at_hotel',
        refSecret: SECRET,
        now: NOW,
      });
    }
    expect(await previewDateChange(h.db, mine.ref, '2027-09-10', '2027-09-11', NOW)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await changeDatesByGuest(h.db, mine.ref, '2027-09-10', '2027-09-11', NOW)).toEqual({ ok: false, reason: 'unavailable' });
  });
});

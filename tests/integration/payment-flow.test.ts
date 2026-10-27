import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';

vi.mock('server-only', () => ({}));
const paystack = { verifyTransaction: vi.fn(), refundTransaction: vi.fn() };
vi.mock('@/server/integrations/paystack', () => ({
  verifyTransaction: (...a: unknown[]) => paystack.verifyTransaction(...a),
  refundTransaction: (...a: unknown[]) => paystack.refundTransaction(...a),
}));
const SETTINGS: Record<string, unknown> = {
  'notify.smsTemplate': 'Booked {ref}',
  'rentals.pickupFromHour': 8,
  'rentals.returnByHour': 18,
};
vi.mock('@/server/content/site-data', () => ({ getSiteData: async () => ({}), setting: (_: unknown, k: string) => SETTINGS[k] }));
vi.mock('@/server/content/contact', () => ({ contactFrom: () => ({ phone: '055 555 7090', email: 'desk@hotelawise.com' }) }));
const notify = {
  bookingConfirmed: vi.fn(),
  lateRefund: vi.fn(),
  rentalConfirmed: vi.fn(),
  rentalLateRefund: vi.fn(),
  staffAlert: vi.fn(),
};
vi.mock('@/server/services/notify', () => notify);

const { checkout, createPendingPayment, settlePayment, startHold } = await import('@/server/services/bookings');
const { placeRentalOrder } = await import('@/server/services/rentals');
const { afterSettle, checkAndSettle, contactAndTemplate } = await import('@/server/services/payment-flow');
const { freshDb } = await import('./db');

let h: Awaited<ReturnType<typeof freshDb>>;
const SECRET = 'payment-flow-secret-0123';
const CONTACT = { phone: '055 555 7090', email: 'desk@hotelawise.com' };

beforeAll(async () => {
  h = await freshDb('payment_flow');
  const [t] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'VIP', name: 'VIP', beds: 'Large double bed', sleeps: 2, bathroom: 'VIP bathroom' })
    .returning();
  const [v] = await h.db
    .insert(s.rateVariants)
    .values({ roomTypeId: t!.id, code: 'VIP', displayCode: 'VIP', name: 'VIP', pricePesewas: 30000 })
    .returning();
  await h.db.insert(s.rooms).values({ number: '206', rateVariantId: v!.id });
  await h.db
    .insert(s.rentalItems)
    .values({ slug: 'canopy', name: 'Canopy', pricePerDayPesewas: 25000, depositPerUnitPesewas: 10000, stockTotal: 2, position: 0 });
});
afterAll(async () => h?.drop());
beforeEach(() => {
  for (const f of [...Object.values(notify), paystack.verifyTransaction, paystack.refundTransaction]) f.mockReset();
});

let n = 0;
const guest = (phone: string) => ({ name: 'Kofi Mensah', phoneE164: phone, email: null, arrivalHour: null, requests: '' });
async function pendingBooking(ci: string, now: Date) {
  const sessionId = `pf${++n}`;
  const co = new Date(Date.parse(ci) + 86_400_000).toISOString().slice(0, 10);
  const held = await startHold(h.db, { variantCode: 'VIP', checkIn: ci, checkOut: co, guests: 2, sessionId, now });
  const r = await checkout(h.db, {
    token: held.token,
    sessionId,
    guests: 2,
    guest: guest('+233244123456'),
    breakfast: false,
    roomService: false,
    promoCode: null,
    plan: 'full',
    refSecret: SECRET,
    now,
  });
  const payRef = await createPendingPayment(h.db, { bookingId: r.bookingId, amount: r.dueNow, method: 'mtn' });
  return { ...r, held, payRef };
}
async function takeRoom(ci: string, now: Date) {
  const sessionId = `pf${++n}`;
  const co = new Date(Date.parse(ci) + 86_400_000).toISOString().slice(0, 10);
  const held = await startHold(h.db, { variantCode: 'VIP', checkIn: ci, checkOut: co, guests: 1, sessionId, now });
  await checkout(h.db, {
    token: held.token,
    sessionId,
    guests: 1,
    guest: guest('+233244000111'),
    breakfast: false,
    roomService: false,
    promoCode: null,
    plan: 'at_hotel',
    refSecret: SECRET,
    now,
  });
}
const onlineOrder = (starts: string, canopies: number, now: Date) =>
  placeRentalOrder(h.db, {
    starts,
    ends: starts,
    cart: { canopy: canopies },
    packs: [],
    collector: { name: 'Abena Owusu', phoneE164: '+233244123456', email: null },
    occasion: 'Wedding',
    payMode: 'online',
    publicToken: `pf-${++n}-xxxxxxxxxxxxxxxx`,
    refSecret: SECRET,
    now,
  });

describe('contactAndTemplate', () => {
  it('reads the desk contact, SMS template and pickup hours from the site data', async () => {
    expect(await contactAndTemplate()).toEqual({ contact: CONTACT, smsTemplate: 'Booked {ref}', hours: { pickupFrom: 8, returnBy: 18 } });
  });
});

describe('checkAndSettle', () => {
  it('verifies with Paystack, confirms the booking and texts the guest once', async () => {
    const now = new Date();
    const r = await pendingBooking('2030-01-10', now);
    paystack.verifyTransaction.mockResolvedValue({
      reference: r.payRef,
      status: 'success',
      amount: r.dueNow,
      currency: 'GHS',
      channel: 'mobile_money',
      paid_at: now.toISOString(),
    });
    expect(await checkAndSettle(h.db, r.payRef)).toMatchObject({ kind: 'confirmed', firstTime: true });
    expect(paystack.verifyTransaction).toHaveBeenCalledWith(r.payRef);
    expect(notify.bookingConfirmed).toHaveBeenCalledTimes(1);
    const [b, contact, template] = notify.bookingConfirmed.mock.calls[0]!;
    expect([b.ref, b.status, contact, template]).toEqual([r.ref, 'confirmed', CONTACT, 'Booked {ref}']);
    // The webhook and the page may both ask: the second answer sends nothing.
    expect(await checkAndSettle(h.db, r.payRef)).toMatchObject({ kind: 'already' });
    expect(notify.bookingConfirmed).toHaveBeenCalledTimes(1);
  });
});

describe('afterSettle', () => {
  const NOW = new Date('2027-01-05T10:00:00Z');
  const LATE = new Date(NOW.getTime() + 20 * 60_000);

  async function lateBookingRefund(ci: string) {
    const r = await pendingBooking(ci, NOW);
    await takeRoom(ci, LATE);
    const out = await settlePayment(h.db, { reference: r.payRef, status: 'success', amount: r.dueNow, currency: 'GHS' }, LATE);
    expect(out.kind).toBe('refund');
    return { r, out };
  }

  it('refunds a late booking payment automatically, tells the guest and the desk', async () => {
    const { r, out } = await lateBookingRefund('2027-02-01');
    paystack.refundTransaction.mockResolvedValue({ id: 98765 });
    await afterSettle(h.db, out);
    expect(paystack.refundTransaction).toHaveBeenCalledWith(r.payRef, 30000, 'Paid after the hold expired; room no longer available');
    if (out.kind !== 'refund') throw new Error('unreachable');
    const [refund] = await h.db.select().from(s.refunds).where(eq(s.refunds.id, out.refundId));
    expect([refund!.status, refund!.paystackRefundId]).toEqual(['refunded', '98765']);
    expect(notify.lateRefund).toHaveBeenCalledWith(expect.objectContaining({ ref: r.ref }), 30000, CONTACT);
    expect(notify.staffAlert).toHaveBeenCalledWith(
      'desk@hotelawise.com',
      `Late payment refunded: ${r.ref}`,
      'Kofi Mensah (+233244123456) paid GHS 300 after their hold lapsed and no VIP room was left. Paystack is refunding it in full.',
    );
  });

  it('flags a failed automatic refund for the desk and does not tell the guest it is coming', async () => {
    const { r, out } = await lateBookingRefund('2027-02-05');
    paystack.refundTransaction.mockRejectedValue(new Error('Paystack 500'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await afterSettle(h.db, out);
    err.mockRestore();
    if (out.kind !== 'refund') throw new Error('unreachable');
    const [refund] = await h.db.select().from(s.refunds).where(eq(s.refunds.id, out.refundId));
    expect([refund!.status, refund!.paystackRefundId]).toEqual(['failed', null]);
    expect(notify.lateRefund).not.toHaveBeenCalled();
    expect(notify.staffAlert.mock.calls[0]![1]).toBe(`ACTION NEEDED: refund failed for ${r.ref}`);
    expect(notify.staffAlert.mock.calls[0]![2]).toContain('The automatic refund failed: refund it by hand from Payments.');
  });

  it('sends the rental confirmation only the first time an order is confirmed', async () => {
    const o = await onlineOrder('2027-06-01', 1, NOW);
    const ref = await createPendingPayment(h.db, { orderId: o.id, amount: o.totalPesewas, method: 'mtn' });
    const v = { reference: ref, status: 'success', amount: o.totalPesewas, currency: 'GHS' };
    await afterSettle(h.db, await settlePayment(h.db, v, NOW));
    await afterSettle(h.db, await settlePayment(h.db, v, NOW));
    expect(notify.rentalConfirmed).toHaveBeenCalledTimes(1);
    expect(notify.rentalConfirmed).toHaveBeenCalledWith(expect.objectContaining({ ref: o.ref }), CONTACT, { pickupFrom: 8, returnBy: 18 });
  });

  async function lateOrderRefund(day: string) {
    const o = await onlineOrder(day, 2, NOW);
    const ref = await createPendingPayment(h.db, { orderId: o.id, amount: o.totalPesewas, method: 'card' });
    await placeRentalOrder(h.db, {
      starts: day,
      ends: day,
      cart: { canopy: 1 },
      packs: [],
      collector: { name: 'Ama Boateng', phoneE164: '+233244000222', email: null },
      occasion: 'Funeral',
      payMode: 'at_pickup',
      publicToken: `pf-${++n}-yyyyyyyyyyyyyyyy`,
      refSecret: SECRET,
      now: LATE,
    });
    const out = await settlePayment(h.db, { reference: ref, status: 'success', amount: o.totalPesewas, currency: 'GHS' }, LATE);
    expect(out.kind).toBe('order_refund');
    return { o, ref, out };
  }

  it('refunds a late rental payment and texts the collector', async () => {
    const { o, ref, out } = await lateOrderRefund('2027-07-01');
    paystack.refundTransaction.mockResolvedValue({ id: 555 });
    await afterSettle(h.db, out);
    expect(paystack.refundTransaction).toHaveBeenCalledWith(ref, o.totalPesewas, 'Paid after the hold expired; items no longer available');
    expect(notify.rentalLateRefund).toHaveBeenCalledWith(expect.objectContaining({ ref: o.ref }), o.totalPesewas, CONTACT);
    expect(notify.staffAlert.mock.calls[0]![1]).toBe(`Late rental payment refunded: ${o.ref}`);
    expect(notify.staffAlert.mock.calls[0]![2]).toBe(
      `Abena Owusu (+233244123456) paid GHS ${o.totalPesewas / 100} after the hold lapsed and some items had gone. Paystack is refunding it in full.`,
    );
  });

  it('asks the desk to refund a rental by hand when Paystack refuses', async () => {
    const { o, out } = await lateOrderRefund('2027-07-10');
    paystack.refundTransaction.mockRejectedValue(new Error('nope'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await afterSettle(h.db, out);
    err.mockRestore();
    expect(notify.rentalLateRefund).not.toHaveBeenCalled();
    expect(notify.staffAlert.mock.calls[0]![1]).toBe(`ACTION NEEDED: refund failed for ${o.ref}`);
  });

  it('does nothing for failed, ignored or repeated outcomes', async () => {
    await afterSettle(h.db, { kind: 'ignored', reason: 'unknown reference' });
    await afterSettle(h.db, { kind: 'failed', bookingId: null, reason: 'failed' });
    await afterSettle(h.db, { kind: 'confirmed', bookingId: '00000000-0000-0000-0000-000000000000', firstTime: false });
    await afterSettle(h.db, { kind: 'order_confirmed', orderId: '00000000-0000-0000-0000-000000000000', firstTime: true });
    for (const f of Object.values(notify)) expect(f).not.toHaveBeenCalled();
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '@/server/db/schema';
import { createPendingPayment, settlePayment } from '@/server/services/bookings';
import { orderBy, placeRentalOrder, stockForRange } from '@/server/services/rentals';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
const SECRET = 'rental-orders-secret-0123';
const NOW = new Date('2027-05-01T09:00:00Z');

beforeAll(async () => {
  h = await freshDb('rental_orders');
  const items = await h.db
    .insert(s.rentalItems)
    .values([
      { slug: 'canopy', name: 'Canopy', pricePerDayPesewas: 25000, depositPerUnitPesewas: 10000, stockTotal: 6, position: 0 },
      {
        slug: 'foldchair',
        name: 'Foldable chair',
        pricePerDayPesewas: 500,
        depositPerUnitPesewas: 200,
        stockTotal: 300,
        unitsInRepair: 10,
        position: 1,
      },
    ])
    .returning();
  const [pack] = await h.db.insert(s.bundles).values({ name: 'Party pack', pctOff: 10 }).returning();
  await h.db.insert(s.bundleItems).values([
    { bundleId: pack!.id, itemId: items[0]!.id, qty: 2 },
    { bundleId: pack!.id, itemId: items[1]!.id, qty: 50 },
  ]);
});
afterAll(async () => h?.drop());

let n = 0;
const place = (
  cart: Record<string, number>,
  payMode: 'online' | 'at_pickup' = 'at_pickup',
  packs: string[] = [],
  starts = '2027-06-05',
  ends = '2027-06-06',
  now = NOW,
) =>
  placeRentalOrder(h.db, {
    starts,
    ends,
    cart,
    packs,
    collector: { name: 'Abena Owusu', phoneE164: '+233244123456', email: null },
    occasion: 'Wedding',
    payMode,
    publicToken: `rt-${++n}-xxxxxxxxxxxxxxxx`,
    refSecret: SECRET,
    now,
  });

describe('rental orders from the website', () => {
  it('shows stock for the whole range, the day after included', async () => {
    expect(await stockForRange(h.db, '2027-06-05', '2027-06-06', NOW)).toEqual({ canopy: 6, foldchair: 290 });
    await place({ canopy: 2 }, 'at_pickup', [], '2027-06-07', '2027-06-07');
    // The order on the 7th blocks the 7th and the 8th (returns); a hire ending on the 6th needs the 7th.
    expect((await stockForRange(h.db, '2027-06-05', '2027-06-06', NOW)).canopy).toBe(4);
    expect((await stockForRange(h.db, '2027-06-01', '2027-06-02', NOW)).canopy).toBe(6);
  });

  it('prices packs on the server and records the discount', async () => {
    const o = await place({ canopy: 2, foldchair: 50 }, 'at_pickup', ['Party pack']);
    // 2 days × (2×250 + 50×5) = 1,500; 10% off = 150; deposit 2×100 + 50×2 = 300
    expect([o.subtotalPesewas, o.discountPesewas, o.depositPesewas, o.totalPesewas, o.status]).toEqual([
      150000,
      15000,
      30000,
      165000,
      'reserved',
    ]);
    expect(o.ref).toMatch(/^AWR-/);
    const view = await orderBy(h.db, { token: o.publicToken });
    expect(view!.lines.map((l) => [l.name, l.qty, l.amount])).toEqual([
      ['Canopy', 2, 100000],
      ['Foldable chair', 50, 50000],
    ]);
  });

  it('confirms an online order once Paystack verifies it', async () => {
    const o = await place({ canopy: 1 }, 'online', [], '2027-07-01', '2027-07-01');
    expect(o.status).toBe('pending_payment');
    const ref = await createPendingPayment(h.db, { orderId: o.id, amount: o.totalPesewas, method: 'mtn' });
    const v = { reference: ref, status: 'success', amount: o.totalPesewas, currency: 'GHS' };
    expect(await settlePayment(h.db, v, NOW)).toMatchObject({ kind: 'order_confirmed', firstTime: true });
    expect(await settlePayment(h.db, v, NOW)).toMatchObject({ kind: 'order_already' });
    const view = await orderBy(h.db, { token: o.publicToken });
    expect([view!.status, view!.paid]).toEqual(['reserved', o.totalPesewas]);
  });

  it('refunds an online payment that lands after the hold lapsed and the stock went', async () => {
    const o = await place({ canopy: 6 }, 'online', [], '2027-08-01', '2027-08-01');
    const ref = await createPendingPayment(h.db, { orderId: o.id, amount: o.totalPesewas, method: 'card' });
    const later = new Date(NOW.getTime() + 20 * 60_000);
    await place({ canopy: 1 }, 'at_pickup', [], '2027-08-01', '2027-08-01', later);
    expect(await settlePayment(h.db, { reference: ref, status: 'success', amount: o.totalPesewas, currency: 'GHS' }, later)).toMatchObject({
      kind: 'order_refund',
      amount: o.totalPesewas,
    });
    expect((await orderBy(h.db, { token: o.publicToken }))!.status).toBe('cancelled');
  });

  it('still confirms a late payment when the stock is free', async () => {
    const o = await place({ canopy: 1 }, 'online', [], '2027-09-01', '2027-09-01');
    const ref = await createPendingPayment(h.db, { orderId: o.id, amount: o.totalPesewas, method: 'mtn' });
    const later = new Date(NOW.getTime() + 30 * 60_000);
    expect(await settlePayment(h.db, { reference: ref, status: 'success', amount: o.totalPesewas, currency: 'GHS' }, later)).toMatchObject({
      kind: 'order_confirmed',
    });
  });
});

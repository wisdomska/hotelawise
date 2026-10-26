import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/server/db/schema';
import { createRentalOrder, NotEnoughStockError, rentalDays } from '@/server/services/rentals';
import { freshDb } from './db';

let h: Awaited<ReturnType<typeof freshDb>>;
let chairId: string;
let canopyId: string;
let customerId: string;

beforeAll(async () => {
  h = await freshDb('rentals');
  const items = await h.db.insert(schema.rentalItems).values([
    { slug: 'chair', name: 'Regular plastic chair', pricePerDayPesewas: 300, depositPerUnitPesewas: 100, stockTotal: 400, unitsInRepair: 4 },
    { slug: 'canopy', name: 'Canopy', pricePerDayPesewas: 25000, depositPerUnitPesewas: 10000, stockTotal: 12, unitsInRepair: 1 },
  ]).returning();
  chairId = items[0]!.id;
  canopyId = items[1]!.id;
  const [c] = await h.db.insert(schema.customers).values({ name: 'Ofori family', phoneE164: '+233558732210' }).returning();
  customerId = c!.id;
});
afterAll(async () => h?.drop());

let n = 0;
const order = (lines: { itemId: string; qty: number }[], starts = '2027-06-05', ends = '2027-06-06', extra: Partial<Parameters<typeof createRentalOrder>[1]> = {}) =>
  createRentalOrder(h.db, {
    customerId, starts, ends, occasion: 'Funeral', payMode: 'at_pickup', collectorName: 'Kwame', collectorPhoneE164: '+233558732210',
    lines, publicToken: `t${++n}`, refSecret: 'secret', ...extra,
  });

describe('rental orders', () => {
  it('prices per day inclusive and adds refundable deposits', async () => {
    expect(rentalDays('2027-06-05', '2027-06-06')).toBe(2);
    const o = await order([{ itemId: canopyId, qty: 2 }]);
    expect(o.ref).toMatch(/^AWR-[A-Z2-9]{4}$/);
    expect(o.subtotalPesewas).toBe(2 * 25000 * 2);
    expect(o.depositPesewas).toBe(2 * 10000);
    expect(o.totalPesewas).toBe(100000 + 20000);
    expect(o.status).toBe('reserved');
    expect(o.holdUntil!.toISOString()).toBe('2027-06-05T10:00:00.000Z');
  });

  it('20 parallel buyers for the last 100 chairs: exactly the right number succeed', async () => {
    // 396 sellable; take 296 first, leaving 100. Each racer wants 10 → exactly 10 should win.
    await order([{ itemId: chairId, qty: 296 }], '2027-07-01', '2027-07-01');
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => order([{ itemId: chairId, qty: 10 }], '2027-07-01', '2027-07-01')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(lost).toHaveLength(10);
    for (const l of lost) expect(l.reason).toBeInstanceOf(NotEnoughStockError);
  });

  it('keeps the day after the end date for returns', async () => {
    // Chairs are fully booked on 1 Jul, and still out on 2 Jul (return day).
    await expect(order([{ itemId: chairId, qty: 1 }], '2027-07-02', '2027-07-02')).rejects.toBeInstanceOf(NotEnoughStockError);
    const ok = await order([{ itemId: chairId, qty: 396 }], '2027-07-03', '2027-07-03');
    expect(ok.status).toBe('reserved');
  });

  it('reports every shortage and releases lapsed pay-at-pickup holds', async () => {
    const err = await order([{ itemId: canopyId, qty: 50 }], '2027-08-01', '2027-08-01').catch((e) => e);
    expect(err).toBeInstanceOf(NotEnoughStockError);
    expect(err.shortages).toEqual([{ itemId: canopyId, name: 'Canopy', requested: 50, available: 11 }]);
    await order([{ itemId: canopyId, qty: 11 }], '2027-08-10', '2027-08-10');
    // At 10:01 on pickup day the unpaid hold has lapsed, so the stock is free again.
    const after = await order([{ itemId: canopyId, qty: 11 }], '2027-08-10', '2027-08-10', { now: new Date('2027-08-10T10:01:00Z') });
    expect(after.status).toBe('reserved');
  });

  it('validates input', async () => {
    await expect(order([], '2027-09-01', '2027-09-01')).rejects.toBeInstanceOf(RangeError);
    await expect(order([{ itemId: chairId, qty: 1 }], '2027-09-02', '2027-09-01')).rejects.toBeInstanceOf(RangeError);
  });
});

// Rental orders: reserve and collect (pickup only, DECISIONS D-01).
// Overselling is prevented by locking the item rows (SELECT … FOR UPDATE, in id
// order to avoid deadlocks), re-checking stock for every date from the start
// date to the day after the end date, then inserting — all in one transaction.
import { and, inArray, sql } from 'drizzle-orm';
import { accraInstant, addDays, nightsBetween, type IsoDate } from '@/lib/dates';
import * as schema from '@/server/db/schema';
import type { AnyDb } from './holds';
import { rowsOf } from '@/server/db/rows';
import { nextRef } from './references';

export class NotEnoughStockError extends Error {
  constructor(readonly shortages: { itemId: string; name: string; requested: number; available: number }[]) {
    super('Not enough stock for those dates.');
    this.name = 'NotEnoughStockError';
  }
}

export type RentalOrderInput = {
  customerId: string;
  starts: IsoDate;
  ends: IsoDate;
  occasion: string;
  payMode: 'online' | 'at_pickup';
  collectorName: string;
  collectorPhoneE164: string;
  lines: { itemId: string; qty: number }[];
  bundleId?: string | null;
  discountPesewas?: number;
  publicToken: string;
  refSecret: string;
  source?: 'web' | 'phone' | 'walk_in' | 'whatsapp';
  createdBy?: string | null;
  /** Online orders hold stock while the guest pays. */
  paymentWindowMinutes?: number;
  now?: Date;
};

/** Days charged: the start and end dates inclusive (a one-day event is one day). */
export function rentalDays(starts: IsoDate, ends: IsoDate): number {
  return nightsBetween(starts, ends) + 1;
}

/** Units of each item committed on each date of [from, to], from orders that still hold stock. */
async function committedUnits(tx: AnyDb, itemIds: string[], from: IsoDate, to: IsoDate, now: Date) {
  const rows = await tx.execute(sql`
    select l.item_id, d::date::text as day, sum(l.qty)::int as qty
      from ${schema.orderLines} l
      join ${schema.rentalOrders} o on o.id = l.order_id
      cross join generate_series(${from}::date, ${to}::date, interval '1 day') d
     where l.item_id in (${sql.join(
       itemIds.map((i) => sql`${i}::uuid`),
       sql`, `,
     )})
       and o.status not in ('cancelled', 'returned', 'completed')
       and not (o.status in ('pending_payment', 'reserved') and o.hold_until is not null and o.hold_until <= ${now.toISOString()})
       and d::date between o.starts and o.ends + 1
     group by l.item_id, d`);
  const map = new Map<string, number>();
  for (const r of rowsOf<{ item_id: string; day: string; qty: number }>(rows)) map.set(`${r.item_id}|${r.day}`, r.qty);
  return map;
}

export async function createRentalOrder(db: AnyDb, input: RentalOrderInput) {
  const now = input.now ?? new Date();
  if (input.ends < input.starts) throw new RangeError('The end date is before the start date.');
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new RangeError('Add at least one item.');
  const itemIds = [...new Set(lines.map((l) => l.itemId))].sort();

  return db.transaction(async (tx) => {
    const items = await tx
      .select()
      .from(schema.rentalItems)
      .where(and(inArray(schema.rentalItems.id, itemIds), sql`not ${schema.rentalItems.archived}`))
      .orderBy(schema.rentalItems.id)
      .for('update');
    if (items.length !== itemIds.length) throw new RangeError('One of those items is no longer available.');

    const lastDay = addDays(input.ends, 1);
    const committed = await committedUnits(tx, itemIds, input.starts, lastDay, now);
    const shortages: NotEnoughStockError['shortages'] = [];
    for (const item of items) {
      const requested = lines.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.qty, 0);
      let available = Infinity;
      for (let d = input.starts; d <= lastDay; d = addDays(d, 1)) {
        available = Math.min(available, item.stockTotal - item.unitsInRepair - (committed.get(`${item.id}|${d}`) ?? 0));
      }
      if (requested > available) shortages.push({ itemId: item.id, name: item.name, requested, available: Math.max(0, available) });
    }
    if (shortages.length) throw new NotEnoughStockError(shortages);

    const days = rentalDays(input.starts, input.ends);
    const priced = lines.map((l) => {
      const item = items.find((i) => i.id === l.itemId)!;
      return { ...l, unit: item.pricePerDayPesewas, deposit: item.depositPerUnitPesewas };
    });
    const subtotal = priced.reduce((s, l) => s + l.unit * l.qty * days, 0);
    const deposit = priced.reduce((s, l) => s + l.deposit * l.qty, 0);
    const discount = Math.min(subtotal, input.discountPesewas ?? 0);

    // Pay-at-pickup: held until 10:00 Accra on pickup day. Online: held while paying.
    const holdUntil =
      input.payMode === 'at_pickup'
        ? accraInstant(input.starts, 10)
        : new Date(now.getTime() + (input.paymentWindowMinutes ?? 15) * 60_000);

    const ref = await nextRef(tx, 'rental', input.refSecret);
    const [order] = await tx
      .insert(schema.rentalOrders)
      .values({
        ref,
        publicToken: input.publicToken,
        customerId: input.customerId,
        starts: input.starts,
        ends: input.ends,
        occasion: input.occasion,
        payMode: input.payMode,
        collectorName: input.collectorName,
        collectorPhoneE164: input.collectorPhoneE164,
        status: input.payMode === 'online' ? 'pending_payment' : 'reserved',
        holdUntil,
        subtotalPesewas: subtotal,
        discountPesewas: discount,
        depositPesewas: deposit,
        totalPesewas: subtotal - discount + deposit,
        bundleId: input.bundleId ?? null,
        source: input.source ?? 'web',
        createdBy: input.createdBy ?? null,
      })
      .returning();
    await tx
      .insert(schema.orderLines)
      .values(
        priced.map((l) => ({ orderId: order!.id, itemId: l.itemId, qty: l.qty, unitPesewas: l.unit, depositPesewas: l.deposit, days })),
      );
    await tx.insert(schema.orderStatusEvents).values({ orderId: order!.id, from: null, to: order!.status });
    return order!;
  });
}

// Messages that go out on a schedule: the day-before reminders for check-in,
// rental pickup and rental return (07:00 Accra), and releasing pay-at-pickup
// orders nobody paid for by 10:00 on pickup day. Each reminder is sent once:
// the row is stamped, so a re-run or a retried cron does nothing twice.
import 'server-only';
import { and, eq, inArray, isNull, lt, lte } from 'drizzle-orm';
import { addDays, type IsoDate } from '@/lib/dates';
import { contactFrom } from '@/server/content/contact';
import { getSiteDataFresh, setting } from '@/server/content/site-data';
import * as s from '@/server/db/schema';
import { audit } from './audit';
import { bookingBy } from './bookings';
import type { AnyDb } from './holds';
import { checkInReminder, orderReleased, pickupReminder, returnReminder } from './notify';
import { orderBy } from './rentals';

/** Resend's free plan allows 100 emails a day; leave room for confirmations. */
export const REMINDER_BATCH = 60;

async function context() {
  const data = await getSiteDataFresh();
  const c = contactFrom(data);
  return {
    contact: { phone: c.phone, email: c.email },
    checkIn: setting<string>(data, 'hotel.checkIn'),
    hours: { pickupFrom: setting<number>(data, 'rentals.pickupFromHour'), returnBy: setting<number>(data, 'rentals.returnByHour') },
  };
}

export type ReminderCounts = { checkIn: number; pickup: number; returns: number };

export async function sendReminders(db: AnyDb, today: IsoDate, now = new Date()): Promise<ReminderCounts> {
  const tomorrow = addDays(today, 1);
  const ctx = await context();
  const counts: ReminderCounts = { checkIn: 0, pickup: 0, returns: 0 };
  let budget = REMINDER_BATCH;

  const stays = await db
    .select({ ref: s.bookings.ref, id: s.bookings.id })
    .from(s.bookings)
    .where(
      and(
        eq(s.bookings.checkIn, tomorrow),
        inArray(s.bookings.status, ['confirmed', 'pending_payment']),
        isNull(s.bookings.reminderSentAt),
      ),
    )
    .limit(budget);
  for (const row of stays) {
    const b = row.ref ? await bookingBy(db, { ref: row.ref }) : null;
    if (!b) continue;
    if (await checkInReminder(b, ctx.contact, ctx.checkIn)) {
      await db.update(s.bookings).set({ reminderSentAt: now }).where(eq(s.bookings.id, row.id));
      counts.checkIn += 1;
    }
  }
  budget -= stays.length;

  if (budget > 0) {
    const pickups = await db
      .select({ id: s.rentalOrders.id })
      .from(s.rentalOrders)
      .where(
        and(
          eq(s.rentalOrders.starts, tomorrow),
          inArray(s.rentalOrders.status, ['reserved', 'ready_for_pickup']),
          isNull(s.rentalOrders.pickupReminderAt),
        ),
      )
      .limit(budget);
    for (const row of pickups) {
      const o = await orderBy(db, { id: row.id });
      if (o && (await pickupReminder(o, ctx.contact, ctx.hours))) {
        await db.update(s.rentalOrders).set({ pickupReminderAt: now }).where(eq(s.rentalOrders.id, row.id));
        counts.pickup += 1;
      }
    }
    budget -= pickups.length;
  }

  if (budget > 0) {
    // Items come back the day after the last hire day, so "ends today" means "due back tomorrow".
    const returns = await db
      .select({ id: s.rentalOrders.id })
      .from(s.rentalOrders)
      .where(and(eq(s.rentalOrders.ends, today), eq(s.rentalOrders.status, 'collected'), isNull(s.rentalOrders.returnReminderAt)))
      .limit(budget);
    for (const row of returns) {
      const o = await orderBy(db, { id: row.id });
      if (o && (await returnReminder(o, ctx.contact, ctx.hours))) {
        await db.update(s.rentalOrders).set({ returnReminderAt: now }).where(eq(s.rentalOrders.id, row.id));
        counts.returns += 1;
      }
    }
  }
  return counts;
}

/**
 * Pay-at-pickup orders stop holding stock at 10:00 on pickup day (every query
 * already ignores them after hold_until). This marks them cancelled so the desk
 * sees it, logs why, and tells the customer.
 */
export async function releaseUnpaidPickups(db: AnyDb, now = new Date()): Promise<number> {
  const lapsed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: s.rentalOrders.id, ref: s.rentalOrders.ref, status: s.rentalOrders.status, who: s.rentalOrders.collectorName })
      .from(s.rentalOrders)
      .where(
        and(
          eq(s.rentalOrders.payMode, 'at_pickup'),
          inArray(s.rentalOrders.status, ['reserved', 'pending_payment']),
          lte(s.rentalOrders.holdUntil, now),
          lt(s.rentalOrders.paidPesewas, s.rentalOrders.totalPesewas),
        ),
      )
      .for('update');
    if (!rows.length) return rows;
    await tx
      .update(s.rentalOrders)
      .set({ status: 'cancelled', holdUntil: null })
      .where(
        inArray(
          s.rentalOrders.id,
          rows.map((r) => r.id),
        ),
      );
    const reason = 'Not paid by 10:00 on pickup day';
    await tx.insert(s.orderStatusEvents).values(rows.map((o) => ({ orderId: o.id, from: o.status, to: 'cancelled' as const, reason })));
    for (const o of rows)
      await audit(tx, {
        actor: 'system',
        action: 'Released unpaid order',
        entity: 'rental_order',
        entityId: o.id,
        target: `${o.ref} · ${o.who}`,
        after: { status: 'Cancelled', reason },
      });
    return rows;
  });
  if (!lapsed.length) return 0;
  const { contact } = await context();
  for (const row of lapsed) {
    const o = await orderBy(db, { id: row.id });
    if (o) await orderReleased(o, contact);
  }
  return lapsed.length;
}

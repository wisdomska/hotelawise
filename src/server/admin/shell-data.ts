// Sidebar badges and account-menu numbers for the signed-in user, in one query.
import 'server-only';
import { sql } from 'drizzle-orm';
import { todayInAccra } from '@/lib/dates';
import { rowsOf } from '@/server/db/rows';
import type { AnyDb } from '@/server/services/holds';

export type ShellCounts = {
  pendingBookings: number;
  newMessages: number;
  rentalsToDo: number;
  pickupsToday: number;
  newEnquiries: number;
  refundsToApprove: number;
};

const ZERO: ShellCounts = { pendingBookings: 0, newMessages: 0, rentalsToDo: 0, pickupsToday: 0, newEnquiries: 0, refundsToApprove: 0 };

export async function shellCounts(db: AnyDb, today = todayInAccra()): Promise<ShellCounts> {
  const r = await db.execute(sql`
    select
      (select count(*) from bookings where status = 'pending_payment') as "pendingBookings",
      (select count(*) from messages where status = 'new') as "newMessages",
      (select count(*) from rental_orders
         where status = 'pending_payment' or (status = 'collected' and ends < ${today}::date)) as "rentalsToDo",
      (select count(*) from rental_orders
         where starts = ${today}::date and status in ('reserved', 'ready_for_pickup')) as "pickupsToday",
      (select count(*) from enquiries where stage = 'new') as "newEnquiries",
      (select count(*) from refunds where status = 'pending_approval') as "refundsToApprove"
  `);
  const [row] = rowsOf<Record<string, string | number>>(r);
  if (!row) return ZERO;
  return Object.fromEntries(Object.keys(ZERO).map((k) => [k, Number(row[k] ?? 0)])) as ShellCounts;
}

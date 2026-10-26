// Pure availability maths, shared by the site, checkout and admin. The database
// enforces the same rules (EXCLUDE constraint for rooms, row locks for rentals);
// these functions answer "how many are free?" for display and pre-checks.
import { addDays, eachNight, rangesOverlap, type IsoDate } from '@/lib/dates';

export type RoomLike = { id: string; status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'out_of_order' };
export type AllocationLike = { roomId: string; checkIn: IsoDate; checkOut: IsoDate; active: boolean; holdExpiresAt: Date | null };
export type BlackoutLike = { starts: IsoDate; ends: IsoDate; roomIds: readonly string[] | null };

/** A hold whose time has passed no longer counts, whether or not cron has cleaned it up. */
export function allocationCounts(a: AllocationLike, now: Date): boolean {
  if (!a.active) return false;
  return a.holdExpiresAt === null || a.holdExpiresAt.getTime() > now.getTime();
}

/** Rooms that can be sold: Maintenance and Out of order take a room off sale. */
export function sellable(room: RoomLike): boolean {
  return room.status !== 'maintenance' && room.status !== 'out_of_order';
}

function blackedOut(roomId: string, night: IsoDate, blackouts: readonly BlackoutLike[]): boolean {
  return blackouts.some((b) => night >= b.starts && night <= b.ends && (b.roomIds === null || b.roomIds.includes(roomId)));
}

/** Rooms of one rate variant free for every night of [checkIn, checkOut). */
export function freeRooms(
  rooms: readonly RoomLike[],
  allocations: readonly AllocationLike[],
  blackouts: readonly BlackoutLike[],
  checkIn: IsoDate,
  checkOut: IsoDate,
  now: Date,
): RoomLike[] {
  const nights = eachNight(checkIn, checkOut);
  return rooms.filter((room) => {
    if (!sellable(room)) return false;
    if (nights.some((n) => blackedOut(room.id, n, blackouts))) return false;
    return !allocations.some(
      (a) => a.roomId === room.id && allocationCounts(a, now) && rangesOverlap(a.checkIn, a.checkOut, checkIn, checkOut),
    );
  });
}

/** Per-night count of free rooms, for the date picker (sold-out nights are struck through). */
export function freeByNight(
  rooms: readonly RoomLike[],
  allocations: readonly AllocationLike[],
  blackouts: readonly BlackoutLike[],
  from: IsoDate,
  days: number,
  now: Date,
): Map<IsoDate, number> {
  const out = new Map<IsoDate, number>();
  for (let i = 0; i < days; i++) {
    const night = addDays(from, i);
    out.set(night, freeRooms(rooms, allocations, blackouts, night, addDays(night, 1), now).length);
  }
  return out;
}

/** A range is bookable only if no night inside it is sold out. */
export function rangeBookable(perNight: ReadonlyMap<IsoDate, number>, checkIn: IsoDate, checkOut: IsoDate): boolean {
  return eachNight(checkIn, checkOut).every((n) => (perNight.get(n) ?? 0) > 0);
}

/* Rentals: stock on a date = owned − in repair − units on active orders whose
 * [starts, ends + 1] covers the date (the day after the end is kept for returns). */

export type RentalOrderLike = {
  starts: IsoDate;
  ends: IsoDate;
  status: 'pending_payment' | 'reserved' | 'ready_for_pickup' | 'collected' | 'returned' | 'completed' | 'cancelled';
  holdUntil: Date | null;
  lines: readonly { itemId: string; qty: number }[];
};

export function orderHoldsStock(o: RentalOrderLike, now: Date): boolean {
  if (o.status === 'cancelled' || o.status === 'completed' || o.status === 'returned') return false;
  // Unpaid pay-at-pickup / pending online orders stop counting once their hold lapses.
  if ((o.status === 'pending_payment' || o.status === 'reserved') && o.holdUntil && o.holdUntil.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

export function stockOnDate(
  item: { id: string; stockTotal: number; unitsInRepair: number },
  orders: readonly RentalOrderLike[],
  date: IsoDate,
  now: Date,
): number {
  const out = orders
    .filter((o) => orderHoldsStock(o, now) && date >= o.starts && date <= addDays(o.ends, 1))
    .reduce((sum, o) => sum + o.lines.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.qty, 0), 0);
  return Math.max(0, item.stockTotal - item.unitsInRepair - out);
}

/** The lowest free count across [starts, ends + 1] — what a new order can take. */
export function stockForRange(
  item: { id: string; stockTotal: number; unitsInRepair: number },
  orders: readonly RentalOrderLike[],
  starts: IsoDate,
  ends: IsoDate,
  now: Date,
): number {
  let min = Infinity;
  for (let d = starts; d <= addDays(ends, 1); d = addDays(d, 1)) {
    min = Math.min(min, stockOnDate(item, orders, d, now));
  }
  return min === Infinity ? 0 : min;
}

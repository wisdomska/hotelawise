// Room holds and allocation. A hold is a booking in status 'held' with a
// room_allocations row, so the database EXCLUDE constraint covers holds too.
// Correctness never depends on cron: expired holds overlapping the requested
// range are deactivated inside the same transaction before allocating.
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { nightsBetween, type IsoDate } from '@/lib/dates';
import * as schema from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema, any>;

export const HOLD_MINUTES = 15;
const EXCLUSION_VIOLATION = '23P01';

export class NoRoomAvailableError extends Error {
  constructor() {
    super('No room of this type is free for those dates.');
    this.name = 'NoRoomAvailableError';
  }
}

function isExclusionViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === 'object' && cur !== null && 'code' in cur && (cur as { code: unknown }).code === EXCLUSION_VIOLATION) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Deactivates holds that have lapsed and overlap a range. Safe to run anywhere, any time. */
export async function expireLapsedHolds(tx: AnyDb, now: Date, range?: { checkIn: IsoDate; checkOut: IsoDate }) {
  const overlap = range
    ? sql`and ${schema.roomAllocations.checkIn} < ${range.checkOut} and ${range.checkIn} < ${schema.roomAllocations.checkOut}`
    : sql``;
  const expired = await tx.execute(sql`
    update ${schema.roomAllocations}
       set active = false
     where ${schema.roomAllocations.active}
       and ${schema.roomAllocations.holdExpiresAt} is not null
       and ${schema.roomAllocations.holdExpiresAt} <= ${now.toISOString()}
       ${overlap}
    returning booking_id`);
  const ids = rowsOf<{ booking_id: string }>(expired).map((r) => r.booking_id);
  if (ids.length) {
    await tx
      .update(schema.bookings)
      .set({ status: 'expired' })
      .where(and(inArray(schema.bookings.id, ids), eq(schema.bookings.status, 'held')));
  }
  return ids.length;
}

/** Candidate rooms for a variant, in room-number order, skipping blackouts and rooms off sale. */
async function candidateRooms(tx: AnyDb, rateVariantId: string, checkIn: IsoDate, checkOut: IsoDate, now: Date) {
  const rows = await tx.execute(sql`
    select r.id
      from ${schema.rooms} r
     where r.rate_variant_id = ${rateVariantId}
       and r.status not in ('maintenance', 'out_of_order', 'retired')
       and not exists (
         select 1 from ${schema.blackoutDates} b
          where b.starts < ${checkOut} and ${checkIn} <= b.ends
            and (b.room_ids is null or r.id = any(b.room_ids)))
       and not exists (
         select 1 from ${schema.roomAllocations} a
          where a.room_id = r.id and a.active
            and (a.hold_expires_at is null or a.hold_expires_at > ${now.toISOString()})
            and a.stay && daterange(${checkIn}::date, ${checkOut}::date, '[)'))
     order by r.number`);
  return rowsOf<{ id: string }>(rows).map((r) => r.id);
}

export type HoldInput = {
  rateVariantId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guests: number;
  sessionId: string;
  publicToken: string;
  now?: Date;
};

/**
 * Creates a 15-minute hold on the first free room of a variant. Concurrent callers
 * racing for the last room: exactly one wins; the rest get NoRoomAvailableError.
 */
export async function createHold(db: AnyDb, input: HoldInput) {
  const now = input.now ?? new Date();
  if (nightsBetween(input.checkIn, input.checkOut) < 1) throw new RangeError('A stay is at least one night.');
  const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);

  await db.transaction(async (tx) => {
    await expireLapsedHolds(tx, now, input);
  });

  const candidates = await candidateRooms(db, input.rateVariantId, input.checkIn, input.checkOut, now);
  for (const roomId of candidates) {
    try {
      return await db.transaction(async (tx) => {
        const [booking] = await tx
          .insert(schema.bookings)
          .values({
            publicToken: input.publicToken,
            rateVariantId: input.rateVariantId,
            roomId,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            guests: input.guests,
            status: 'held',
            holdExpiresAt: expiresAt,
            holdSessionId: input.sessionId,
          })
          .returning({ id: schema.bookings.id });
        await tx.insert(schema.roomAllocations).values({
          bookingId: booking!.id,
          roomId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          holdExpiresAt: expiresAt,
        });
        return { bookingId: booking!.id, roomId, expiresAt };
      });
    } catch (e) {
      if (isExclusionViolation(e)) continue; // someone took this room a moment ago; try the next one
      throw e;
    }
  }
  throw new NoRoomAvailableError();
}

/** Turns a live hold into a confirmed allocation (no expiry). Returns false if the hold has lapsed or was released. */
export async function confirmHold(db: AnyDb, bookingId: string, now: Date = new Date()): Promise<boolean> {
  const res = await db
    .update(schema.roomAllocations)
    .set({ holdExpiresAt: null })
    .where(
      and(
        eq(schema.roomAllocations.bookingId, bookingId),
        eq(schema.roomAllocations.active, true),
        isNotNull(schema.roomAllocations.holdExpiresAt),
        gt(schema.roomAllocations.holdExpiresAt, now),
      ),
    )
    .returning({ id: schema.roomAllocations.bookingId });
  return res.length === 1;
}

/** Releases a hold the guest abandoned (back button, new dates). */
export async function releaseHold(db: AnyDb, bookingId: string) {
  await db.transaction(async (tx) => {
    await tx.update(schema.roomAllocations).set({ active: false }).where(eq(schema.roomAllocations.bookingId, bookingId));
    await tx
      .update(schema.bookings)
      .set({ status: 'expired' })
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.status, 'held')));
  });
}

/** Cron: tidy every lapsed hold. Returns how many were released. */
export async function sweepExpiredHolds(db: AnyDb, now: Date = new Date()) {
  return db.transaction((tx) => expireLapsedHolds(tx, now));
}

export { isExclusionViolation };

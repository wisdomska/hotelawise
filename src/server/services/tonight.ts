// Free rooms per room type for one night: rooms on sale, not blacked out, with no
// live allocation (a confirmed booking or an unexpired hold) covering the night.
import { sql } from 'drizzle-orm';
import type { IsoDate } from '@/lib/dates';
import { rowsOf } from '@/server/db/rows';
import type { AnyDb } from './holds';

export async function freeRoomsByType(db: AnyDb, night: IsoDate, now: Date): Promise<Record<string, number>> {
  const res = await db.execute(sql`
    select t.code, count(r.id)::int as free
      from room_types t
      join rate_variants v on v.room_type_id = t.id
      join rooms r on r.rate_variant_id = v.id
     where r.status not in ('maintenance', 'out_of_order')
       and not exists (
         select 1 from blackout_dates b
          where ${night}::date between b.starts and b.ends
            and (b.room_ids is null or r.id = any(b.room_ids)))
       and not exists (
         select 1 from room_allocations a
          where a.room_id = r.id and a.active
            and (a.hold_expires_at is null or a.hold_expires_at > ${now.toISOString()})
            and a.stay @> ${night}::date)
     group by t.code`);
  return Object.fromEntries(rowsOf<{ code: string; free: number }>(res).map((r) => [r.code, r.free]));
}

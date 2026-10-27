// Dashboard figures, all from real records: revenue is verified payments by the
// day they landed (Accra = UTC); occupancy is rooms held by live bookings per
// night over all 16 rooms.
import 'server-only';
import { count, eq, inArray, ne, sql, sum } from 'drizzle-orm';
import { addDays, type IsoDate } from '@/lib/dates';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import type { AnyDb } from '@/server/services/holds';

export type Series = { days: IsoDate[]; rooms: number[]; rentals: number[]; occupancy: number[] };

const LIVE = `('confirmed','checked_in','checked_out','pending_payment')`;

export async function last30(db: AnyDb, today: IsoDate): Promise<Series> {
  const from = addDays(today, -29);
  const days = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const [money, occ, [{ n: roomCount } = { n: 0 }]] = await Promise.all([
    db.execute(sql`
      select (p.paid_at at time zone 'UTC')::date::text as day,
             sum(case when p.booking_id is not null then p.amount_pesewas else 0 end)::int as rooms,
             sum(case when p.order_id is not null then p.amount_pesewas else 0 end)::int as rentals
        from payments p
       where p.status = 'success' and p.paid_at >= ${from}::date and p.paid_at < ${addDays(today, 1)}::date
       group by 1`),
    db.execute(
      sql.raw(`
      select d::date::text as day, count(distinct b.room_id)::int as n
        from generate_series('${from}'::date, '${today}'::date, interval '1 day') d
        join bookings b on b.room_id is not null and b.status in ${LIVE}
                       and b.check_in <= d::date and b.check_out > d::date
       group by 1`),
    ),
    db.select({ n: count() }).from(s.rooms).where(ne(s.rooms.status, 'retired')),
  ]);
  const m = new Map(rowsOf<{ day: string; rooms: number; rentals: number }>(money).map((r) => [r.day, r]));
  const o = new Map(rowsOf<{ day: string; n: number }>(occ).map((r) => [r.day, r.n]));
  const total = Number(roomCount) || 1;
  return {
    days,
    rooms: days.map((d) => m.get(d)?.rooms ?? 0),
    rentals: days.map((d) => m.get(d)?.rentals ?? 0),
    occupancy: days.map((d) => Math.round(((o.get(d) ?? 0) / total) * 100)),
  };
}

/** Rooms booked tonight per rate, e.g. ["Standard", 2, 6]. */
export async function tonightByRate(db: AnyDb, today: IsoDate): Promise<[string, number, number][]> {
  const rows = rowsOf<{ name: string; booked: number; total: number }>(
    await db.execute(
      sql.raw(`
      select v.name, v.position,
             count(distinct b.room_id) filter (where b.id is not null)::int as booked,
             count(distinct r.id)::int as total
        from rate_variants v
        join rooms r on r.rate_variant_id = v.id and r.status <> 'retired'
        left join bookings b on b.room_id = r.id and b.status in ${LIVE} and b.status <> 'checked_out'
                            and b.check_in <= '${today}'::date and b.check_out > '${today}'::date
       group by v.name, v.position
       order by v.position`),
    ),
  );
  return rows.map((r) => [r.name, r.booked, r.total]);
}

export async function awaitingPayment(db: AnyDb) {
  const [[b] = [], [o] = []] = await Promise.all([
    db
      .select({ n: count(), owed: sum(sql`${s.bookings.totalPesewas} - ${s.bookings.paidPesewas}`) })
      .from(s.bookings)
      .where(eq(s.bookings.status, 'pending_payment')),
    db
      .select({ n: count(), owed: sum(sql`${s.rentalOrders.totalPesewas} - ${s.rentalOrders.paidPesewas}`) })
      .from(s.rentalOrders)
      .where(inArray(s.rentalOrders.status, ['pending_payment'])),
  ]);
  return { count: Number(b?.n ?? 0) + Number(o?.n ?? 0), owed: Number(b?.owed ?? 0) + Number(o?.owed ?? 0) };
}

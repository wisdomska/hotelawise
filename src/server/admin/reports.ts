// Reports › Rooms, Rentals, Staff: the last 30 days from real bookings,
// payments, rental orders, replies and the audit log.
import 'server-only';
import { sql } from 'drizzle-orm';
import { SOURCE, type Source } from '@/lib/admin/labels';
import { addDays, type IsoDate } from '@/lib/dates';
import { rowsOf } from '@/server/db/rows';
import type { AnyDb } from '@/server/services/holds';
import { last30 } from './dashboard';

const LIVE = sql.raw(`('confirmed','checked_in','checked_out','pending_payment')`);

export async function roomsReport(d: AnyDb, today: IsoDate) {
  const from = addDays(today, -29);
  const end = addDays(today, 1);
  const [series, nights, byType, bySource] = await Promise.all([
    last30(d, today),
    // Room-nights sold in the window, and the room charge for them (total spread evenly over the stay).
    d.execute(sql`
      select coalesce(sum(n), 0)::int as nights,
             coalesce(sum(n * (b.subtotal_pesewas - b.discount_pesewas)::numeric / (b.check_out - b.check_in)), 0)::bigint as revenue
        from bookings b,
             lateral (select greatest(0, least(b.check_out, ${end}::date) - greatest(b.check_in, ${from}::date)) as n) x
       where b.status in ${LIVE} and b.check_in < ${end}::date and b.check_out > ${from}::date`),
    d.execute(sql`
      select t.name, t.position, coalesce(sum(p.amount_pesewas), 0)::bigint as amount
        from room_types t
        left join rate_variants v on v.room_type_id = t.id
        left join bookings b on b.rate_variant_id = v.id
        left join payments p on p.booking_id = b.id and p.status = 'success'
                            and p.paid_at >= ${from}::date and p.paid_at < ${end}::date
       group by t.name, t.position
       order by t.position`),
    d.execute(sql`
      select source, count(*)::int as n from bookings
       where ref is not null and created_at >= ${from}::date and created_at < ${end}::date
       group by source`),
  ]);
  const [{ nights: sold = 0, revenue = 0 } = {}] = rowsOf<{ nights: number; revenue: number | string }>(nights);
  const occ = Math.round(series.occupancy.reduce((a, b) => a + b, 0) / series.occupancy.length);
  const rev = Number(revenue);
  const rooms = await d.execute(sql`select count(*)::int as n from rooms where status <> 'retired'`);
  const roomCount = rowsOf<{ n: number }>(rooms)[0]?.n || 16;
  return {
    occupancy: occ,
    adr: sold ? Math.round(rev / sold) : 0,
    revpar: Math.round(rev / (roomCount * 30)),
    nightsSold: sold,
    byType: rowsOf<{ name: string; amount: number | string }>(byType).map((r) => [r.name, Number(r.amount)] as [string, number]),
    bySource: (Object.keys(SOURCE) as Source[]).map((k) => {
      const r = rowsOf<{ source: Source; n: number }>(bySource).find((x) => x.source === k);
      return [k === 'web' ? 'Website' : SOURCE[k], r?.n ?? 0] as [string, number];
    }),
  };
}

export async function rentalsReport(d: AnyDb, today: IsoDate) {
  const from = addDays(today, -29);
  const end = addDays(today, 1);
  const [util, orders, items, occasions] = await Promise.all([
    // Units out per day over total stock, averaged across the 30 days.
    d.execute(sql`
      select coalesce(avg(out::numeric / nullif(stock, 0)), 0)::float as share
        from generate_series(${from}::date, ${today}::date, interval '1 day') g(day)
        cross join lateral (
          select coalesce(sum(l.qty), 0) as out from order_lines l join rental_orders o on o.id = l.order_id
           where o.status in ('reserved','ready_for_pickup','collected','returned','completed')
             and o.starts <= g.day::date and o.ends >= g.day::date) u
        cross join lateral (select coalesce(sum(stock_total), 0) as stock from rental_items where not archived) st`),
    d.execute(sql`
      select count(*)::int as n, coalesce(sum(total_pesewas - deposit_pesewas), 0)::bigint as hire
        from rental_orders where status <> 'cancelled' and created_at >= ${from}::date and created_at < ${end}::date`),
    d.execute(sql`
      select i.name, coalesce(sum(l.qty * l.days), 0)::int as unit_days
        from order_lines l
        join rental_orders o on o.id = l.order_id and o.status <> 'cancelled' and o.starts < ${end}::date and o.ends >= ${from}::date
        join rental_items i on i.id = l.item_id
       group by i.name order by 2 desc limit 8`),
    d.execute(sql`
      select coalesce(nullif(trim(occasion), ''), 'Not given') as occasion, count(*)::int as n
        from rental_orders where status <> 'cancelled' and created_at >= ${from}::date and created_at < ${end}::date
       group by 1 order by 2 desc limit 8`),
  ]);
  const o = rowsOf<{ n: number; hire: number | string }>(orders)[0];
  return {
    utilisation: Math.round((rowsOf<{ share: number }>(util)[0]?.share ?? 0) * 100),
    orders: o?.n ?? 0,
    hire: Number(o?.hire ?? 0),
    items: rowsOf<{ name: string; unit_days: number }>(items).map((r) => [r.name, r.unit_days] as [string, number]),
    occasions: rowsOf<{ occasion: string; n: number }>(occasions).map((r) => [r.occasion, r.n] as [string, number]),
  };
}

export type StaffRow = { id: string; name: string; checkIns: number; payments: number; orders: number; replies: number };

export async function staffReport(d: AnyDb, today: IsoDate): Promise<StaffRow[]> {
  const from = addDays(today, -29);
  const end = addDays(today, 1);
  const rows = rowsOf<{ id: string; name: string; check_ins: number; payments: number; orders: number; replies: number }>(
    await d.execute(sql`
      select u.id, u.name,
        (select count(*) from audit_log a where a.user_id = u.id and a.action = 'Checked in' and a.created_at >= ${from}::date and a.created_at < ${end}::date)::int as check_ins,
        (select count(*) from payments p where p.by_user_id = u.id and p.channel = 'desk' and p.status = 'success' and p.created_at >= ${from}::date and p.created_at < ${end}::date)::int as payments,
        (select count(distinct a.entity_id) from audit_log a where a.user_id = u.id and a.entity = 'rental_order' and a.created_at >= ${from}::date and a.created_at < ${end}::date)::int as orders,
        (select count(*) from message_replies r where r.by_user_id = u.id and r.created_at >= ${from}::date and r.created_at < ${end}::date)::int as replies
        from "user" u
       order by u.name`),
  );
  return rows.map((r) => ({ id: r.id, name: r.name, checkIns: r.check_ins, payments: r.payments, orders: r.orders, replies: r.replies }));
}

const csvCell = (v: unknown) => {
  const t = String(v ?? '');
  // A leading = + - @ would run as a formula in Excel; prefix it with a quote.
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

const cedis = (p: number | string) => (Number(p) / 100).toFixed(2);

/** The CSV for a report tab: the rows behind the numbers, not the charts. */
export async function reportCsv(d: AnyDb, tab: 'Rooms' | 'Rentals' | 'Staff', today: IsoDate) {
  const from = addDays(today, -29);
  const end = addDays(today, 1);
  if (tab === 'Staff') {
    const r = await staffReport(d, today);
    return [
      ['staff', 'check_ins', 'desk_payments', 'orders_handled', 'replies'],
      ...r.map((x) => [x.name, x.checkIns, x.payments, x.orders, x.replies]),
    ];
  }
  if (tab === 'Rooms') {
    const r = rowsOf<Record<string, string | number>>(
      await d.execute(sql`
        select b.ref, coalesce(c.name, '') as guest, v.name as rate, coalesce(r.number, '') as room, b.check_in::text, (b.check_out - b.check_in) as nights,
               b.source, b.status, b.total_pesewas, b.paid_pesewas, to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as created
          from bookings b
          join rate_variants v on v.id = b.rate_variant_id
          left join customers c on c.id = b.customer_id
          left join rooms r on r.id = b.room_id
         where b.ref is not null and b.check_in < ${end}::date and b.check_out > ${from}::date
         order by b.check_in, b.ref`),
    );
    return [
      ['ref', 'guest', 'rate', 'room', 'check_in', 'nights', 'source', 'status', 'total_ghs', 'paid_ghs', 'created'],
      ...r.map((x) => [
        x.ref,
        x.guest,
        x.rate,
        x.room,
        x.check_in,
        x.nights,
        x.source,
        x.status,
        cedis(x.total_pesewas!),
        cedis(x.paid_pesewas!),
        x.created,
      ]),
    ];
  }
  const r = rowsOf<Record<string, string | number>>(
    await d.execute(sql`
      select o.ref, o.collector_name as customer, o.occasion, o.starts::text, o.ends::text, o.status, o.pay_mode,
             o.total_pesewas, o.deposit_pesewas, o.paid_pesewas
        from rental_orders o
       where o.starts < ${end}::date and o.ends >= ${from}::date
       order by o.starts, o.ref`),
  );
  return [
    ['ref', 'customer', 'occasion', 'starts', 'ends', 'status', 'pay_mode', 'total_ghs', 'deposit_ghs', 'paid_ghs'],
    ...r.map((x) => [
      x.ref,
      x.customer,
      x.occasion,
      x.starts,
      x.ends,
      x.status,
      x.pay_mode,
      cedis(x.total_pesewas!),
      cedis(x.deposit_pesewas!),
      cedis(x.paid_pesewas!),
    ]),
  ];
}

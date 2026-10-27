// Customers: guests, rental customers and venue enquirers in one list (one row
// per phone number), the customer drawer, staff notes and newsletter
// subscribers. Abandoned checkouts (holds that expired) don't make anyone a
// customer.
import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { BOOKING_STATUS, ENQUIRY_STAGE, RENTAL_STATUS, type BookingStatus, type EnquiryStage, type RentalStatus } from '@/lib/admin/labels';
import * as s from '@/server/db/schema';
import { rowsOf } from '@/server/db/rows';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { AdminError } from './act';
import type { Who } from './bookings';

export const CUST_PAGE = 8;

const SEEN = sql`(
  exists (select 1 from bookings b where b.customer_id = c.id and b.status not in ('held', 'expired'))
  or exists (select 1 from rental_orders o where o.customer_id = c.id)
  or exists (select 1 from enquiries e where e.customer_id = c.id))`;

/** Name, email or phone; "055 555 7090", "0555557090" and "+233555557090" all find the same person. */
function matches(q: string) {
  const t = q.trim();
  if (!t) return sql`true`;
  const like = `%${t.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  const digits = t.replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '');
  return digits.length >= 4
    ? sql`(c.name ilike ${like} or c.email ilike ${like} or c.phone_e164 like ${'%' + digits + '%'})`
    : sql`(c.name ilike ${like} or c.email ilike ${like})`;
}

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stays: number;
  orders: number;
  events: number;
  last: string;
};

export async function listCustomers(db: AnyDb, opts: { q: string; page: number }) {
  const where = sql`${SEEN} and ${matches(opts.q)}`;
  const [rows, [n]] = await Promise.all([
    db.execute(sql`
      select c.id, c.name, c.phone_e164 as phone, c.email,
             (select count(*) from bookings b where b.customer_id = c.id and b.status not in ('held', 'expired'))::int as stays,
             (select count(*) from rental_orders o where o.customer_id = c.id)::int as orders,
             (select count(*) from enquiries e where e.customer_id = c.id)::int as events,
             greatest(
               (select max(b.check_in) from bookings b where b.customer_id = c.id and b.status not in ('held', 'expired')),
               (select max(o.starts) from rental_orders o where o.customer_id = c.id),
               (select max(e.event_date) from enquiries e where e.customer_id = c.id)
             )::text as last
        from customers c
       where ${where}
       order by last desc nulls last, c.name
       limit ${CUST_PAGE} offset ${Math.max(0, opts.page) * CUST_PAGE}`),
    db.execute(sql`select count(*)::int as n from customers c where ${where}`).then((r) => rowsOf<{ n: number }>(r)),
  ]);
  return { rows: rowsOf<CustomerRow>(rows), total: Number(n?.n ?? 0) };
}

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string;
  since: string;
  spend: number;
  history: { kind: 'booking' | 'rental' | 'enquiry'; ref: string; label: string; date: string; status: string }[];
};

export async function customerDetail(db: AnyDb, id: string): Promise<CustomerDetail | null> {
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, id));
  if (!c) return null;
  const [hist, money] = await Promise.all([
    db.execute(sql`
      select * from (
        select 'booking' as kind, b.ref, v.display_code || ' · ' || coalesce('No. ' || r.number, 'room to assign') as label,
               b.check_in::text as date, b.status::text as status
          from bookings b join rate_variants v on v.id = b.rate_variant_id left join rooms r on r.id = b.room_id
         where b.customer_id = ${id} and b.status not in ('held', 'expired')
        union all
        select 'rental', o.ref, coalesce(nullif(o.occasion, ''), 'Rental order'), o.starts::text, o.status::text
          from rental_orders o where o.customer_id = ${id}
        union all
        select 'enquiry', e.ref, coalesce(nullif(e.event_type, ''), 'Event') || ' · ' || v.name, e.event_date::text, e.stage
          from enquiries e join venues v on v.id = e.venue_id where e.customer_id = ${id}
      ) h order by date desc limit 50`),
    db.execute(sql`
      select coalesce(sum(p.amount_pesewas), 0)::int
             - coalesce((select sum(r.amount_pesewas) from refunds r join payments p2 on p2.id = r.payment_id
                          left join bookings b2 on b2.id = p2.booking_id
                          left join rental_orders o2 on o2.id = p2.order_id
                          left join enquiries e2 on e2.id = p2.enquiry_id
                         where r.status in ('processing', 'refunded', 'manual_refunded')
                           and ${id} in (b2.customer_id, o2.customer_id, e2.customer_id)), 0)::int as spend
        from payments p
        left join bookings b on b.id = p.booking_id
        left join rental_orders o on o.id = p.order_id
        left join enquiries e on e.id = p.enquiry_id
       where p.status = 'success' and ${id} in (b.customer_id, o.customer_id, e.customer_id)`),
  ]);
  const label = (kind: string, st: string) =>
    kind === 'booking'
      ? (BOOKING_STATUS[st as BookingStatus] ?? st)
      : kind === 'rental'
        ? (RENTAL_STATUS[st as RentalStatus] ?? st)
        : (ENQUIRY_STAGE[st as EnquiryStage] ?? st);
  return {
    id: c.id,
    name: c.name,
    phone: c.phoneE164,
    email: c.email,
    notes: c.notes,
    since: c.createdAt.toISOString().slice(0, 10),
    spend: Number(rowsOf<{ spend: number }>(money)[0]?.spend ?? 0),
    history: rowsOf<{ kind: 'booking' | 'rental' | 'enquiry'; ref: string; label: string; date: string; status: string }>(hist).map(
      (h) => ({
        ...h,
        status: label(h.kind, h.status),
      }),
    ),
  };
}

export async function setCustomerNote(db: AnyDb, by: Who, id: string, note: string) {
  const [c] = await db.select({ name: s.customers.name, notes: s.customers.notes }).from(s.customers).where(eq(s.customers.id, id));
  if (!c) throw new AdminError('That customer no longer exists.');
  if (c.notes === note) return;
  await db.update(s.customers).set({ notes: note }).where(eq(s.customers.id, id));
  await audit(db, {
    actor: by,
    action: 'Edited customer note',
    entity: 'customer',
    entityId: id,
    target: c.name,
    before: { note: c.notes },
    after: { note },
  });
}

/* ── newsletter ── */

export type Subscriber = { id: string; email: string; source: string; at: string };

export async function listSubscribers(db: AnyDb, page: number) {
  const where = isNull(s.newsletterSubscribers.unsubscribedAt);
  const [rows, [n]] = await Promise.all([
    db
      .select({
        id: s.newsletterSubscribers.id,
        email: s.newsletterSubscribers.email,
        source: s.newsletterSubscribers.source,
        at: s.newsletterSubscribers.createdAt,
      })
      .from(s.newsletterSubscribers)
      .where(where)
      .orderBy(sql`${s.newsletterSubscribers.createdAt} desc`)
      .limit(CUST_PAGE)
      .offset(Math.max(0, page) * CUST_PAGE),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.newsletterSubscribers)
      .where(where),
  ]);
  return { rows: rows.map((r): Subscriber => ({ ...r, at: r.at.toISOString().slice(0, 10) })), total: Number(n?.n ?? 0) };
}

export async function allSubscribers(db: AnyDb) {
  return db
    .select({ email: s.newsletterSubscribers.email, source: s.newsletterSubscribers.source, at: s.newsletterSubscribers.createdAt })
    .from(s.newsletterSubscribers)
    .where(isNull(s.newsletterSubscribers.unsubscribedAt))
    .orderBy(s.newsletterSubscribers.createdAt);
}

/** Unsubscribes rather than deletes, so a re-import can't quietly add them back. */
export async function removeSubscriber(db: AnyDb, by: Who, id: string) {
  const [r] = await db
    .update(s.newsletterSubscribers)
    .set({ unsubscribedAt: new Date() })
    .where(and(eq(s.newsletterSubscribers.id, id), isNull(s.newsletterSubscribers.unsubscribedAt)))
    .returning({ email: s.newsletterSubscribers.email });
  if (!r) throw new AdminError('That subscriber has already been removed.');
  await audit(db, { actor: by, action: 'Removed subscriber', entity: 'newsletter', entityId: id, target: r.email });
  return r.email;
}

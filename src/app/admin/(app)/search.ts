'use server';
// ⌘K search: bookings by reference or guest, rental orders, and customers.
// Each kind is only searched when the signed-in user can see it.
import { desc, eq, ilike, or } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import { can } from '@/server/auth/permissions';
import { currentActor } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export type Hit = { label: string; kind: 'Booking' | 'Rental' | 'Customer'; href: string; ref: string };

export async function searchAdmin(raw: string): Promise<Hit[]> {
  const actor = await currentActor();
  const q = raw.trim().slice(0, 60);
  if (!actor || !actor.active || q.length < 2 || !process.env.DATABASE_URL) return [];
  const d = await db();
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  const out: Hit[] = [];
  if (can(actor, 'bookings.view')) {
    const rows = await d
      .select({ ref: s.bookings.ref, name: s.customers.name, room: s.rooms.number })
      .from(s.bookings)
      .leftJoin(s.customers, eq(s.customers.id, s.bookings.customerId))
      .leftJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId))
      .where(or(ilike(s.bookings.ref, like), ilike(s.customers.name, like), ilike(s.customers.phoneE164, like)))
      .orderBy(desc(s.bookings.checkIn))
      .limit(6);
    for (const r of rows)
      if (r.ref)
        out.push({
          label: `${r.ref} · ${r.name ?? 'Guest'}${r.room ? ` · room ${r.room}` : ''}`,
          kind: 'Booking',
          href: '/admin/bookings',
          ref: r.ref,
        });
  }
  if (can(actor, 'rentals.view')) {
    const rows = await d
      .select({ ref: s.rentalOrders.ref, name: s.rentalOrders.collectorName })
      .from(s.rentalOrders)
      .where(or(ilike(s.rentalOrders.ref, like), ilike(s.rentalOrders.collectorName, like)))
      .orderBy(desc(s.rentalOrders.starts))
      .limit(4);
    for (const r of rows) out.push({ label: `${r.ref} · ${r.name}`, kind: 'Rental', href: '/admin/rentals', ref: r.ref });
  }
  if (can(actor, 'customers.view')) {
    const rows = await d
      .select({ id: s.customers.id, name: s.customers.name, phone: s.customers.phoneE164 })
      .from(s.customers)
      .where(or(ilike(s.customers.name, like), ilike(s.customers.phoneE164, like), ilike(s.customers.email, like)))
      .limit(4);
    for (const r of rows) out.push({ label: `${r.name} · ${r.phone}`, kind: 'Customer', href: '/admin/customers', ref: r.id });
  }
  return out;
}

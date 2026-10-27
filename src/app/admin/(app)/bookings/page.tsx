import { BookingsView } from '@/components/admin/bookings/view';
import { BOOKING_FILTERS, type BookingStatus } from '@/lib/admin/labels';
import { addDays, isIsoDate, todayInAccra } from '@/lib/dates';
import { listBookings, roomRows, timelineBookings } from '@/server/admin/bookings';
import { can } from '@/server/auth/permissions';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Room bookings' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function BookingsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requirePage('bookings.view');
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? '';
  const today = todayInAccra();
  const calendar = one('tab') === 'Calendar';
  const status = BOOKING_FILTERS.includes(one('s') as BookingStatus) ? (one('s') as BookingStatus) : undefined;
  const page = Math.max(0, Math.floor(Number(one('p_b')) || 0));
  const from = isIsoDate(one('from')) ? one('from') : addDays(today, -2);
  const d = await db();
  const [list, timeline, rooms] = await Promise.all([
    calendar ? null : listBookings(d, { status, page }),
    calendar ? timelineBookings(d, from) : null,
    calendar ? roomRows(d) : null,
  ]);
  return (
    <BookingsView
      today={today}
      status={status ?? null}
      page={page}
      list={list}
      timeline={timeline}
      from={from}
      rooms={rooms}
      canExport={can(actor, 'exports.download')}
    />
  );
}

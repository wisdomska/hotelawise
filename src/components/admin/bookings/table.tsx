'use client';
// The bookings table from Admin.dc.html (bkTable), used on the dashboard and
// the Room bookings list.
import { BOOKING_STATUS, SOURCE } from '@/lib/admin/labels';
import { formatDayMonth } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhoneLocal } from '@/lib/phone';
import type { BookingRow } from '@/server/admin/bookings';
import { useAdmin } from '../context';
import { c, col, DataTable, type FilterChip } from '../table';
import type { AnyIconName } from '@/components/ui/icon';
import { useBookingActions } from './use-booking-actions';

export function BookingTable(p: {
  title: string;
  rows: BookingRow[];
  count?: string;
  chips?: FilterChip[];
  pager?: { page: number; total: number; href: (page: number) => string };
  empty: { icon: AnyIconName; text: string; sub?: string };
}) {
  const { openDrawer } = useAdmin();
  const actions = useBookingActions();
  return (
    <DataTable
      title={p.title}
      count={p.count ?? String(p.rows.length)}
      chips={p.chips}
      pager={p.pager}
      minW={900}
      empty={p.empty}
      cols={[col('REF'), col('GUEST'), col('ROOM'), col('DATES'), col('STATUS'), col('PAID / TOTAL', 'right')]}
      rows={p.rows.map((b) => ({
        key: b.ref,
        on: () => openDrawer({ kind: 'booking', ref: b.ref }),
        cells: [
          c(b.ref, 'mono'),
          c(b.guest, undefined, b.phone ? formatPhoneLocal(b.phone) : undefined),
          c(`${b.code} · ${b.room}`, 'mono'),
          c(
            `${formatDayMonth(b.checkIn)} → ${formatDayMonth(b.checkOut)}`,
            'mono',
            `${b.nights} night${b.nights > 1 ? 's' : ''} · ${SOURCE[b.source]}`,
          ),
          c(BOOKING_STATUS[b.status], 'chip'),
          c(`${formatGhs(b.paid)} / ${formatGhs(b.total)}`, 'money'),
        ],
        actions: actions(b, false),
      }))}
    />
  );
}

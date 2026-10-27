import { BOOKING_STATUS, SOURCE } from '@/lib/admin/labels';
import { todayInAccra } from '@/lib/dates';
import { allBookingRows } from '@/server/admin/bookings';
import { csvDownload } from '@/server/admin/csv-response';

export async function GET(req: Request) {
  return csvDownload(req, ['bookings.view', 'exports.download'], 'Bookings', `hotelawise-bookings-${todayInAccra()}`, async (d) => [
    ['Ref', 'Guest', 'Phone', 'Room type', 'Room', 'Check-in', 'Check-out', 'Nights', 'Status', 'Source', 'Total (GHS)', 'Paid (GHS)'],
    ...(await allBookingRows(d)).map((b) => [
      b.ref,
      b.guest,
      b.phone,
      b.code,
      b.room,
      b.checkIn,
      b.checkOut,
      b.nights,
      BOOKING_STATUS[b.status],
      SOURCE[b.source],
      (b.total / 100).toFixed(2),
      (b.paid / 100).toFixed(2),
    ]),
  ]);
}

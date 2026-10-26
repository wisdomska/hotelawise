// "Add to calendar" for a booking, by its unguessable public token.
import { icsFile } from '@/lib/ics';
import { db } from '@/server/platform/db';
import { bookingBy } from '@/server/services/bookings';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await bookingBy(await db(), { token });
  if (!b || !b.ref || !['confirmed', 'pending_payment', 'checked_in'].includes(b.status)) return new Response('Not found', { status: 404 });
  const body = icsFile({
    uid: `${b.ref}@hotelawise.com`,
    summary: `Hotel A-Wise · ${b.variantName} (${b.ref})`,
    description: `Booking ${b.ref}. Check-in from 2pm, check-out by 12 noon. The desk is open all night.`,
    location: 'No. 1 Wisepak Lane, New Asofan, Accra',
    start: b.checkIn,
    end: b.checkOut,
  });
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="hotel-a-wise-${b.ref}.ics"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

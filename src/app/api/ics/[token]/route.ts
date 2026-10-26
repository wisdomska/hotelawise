// "Add to calendar" for a booking (the stay) or a rental (the pickup), by the
// unguessable public token.
import { accraInstant } from '@/lib/dates';
import { icsFile } from '@/lib/ics';
import { getSiteData, setting } from '@/server/content/site-data';
import { db } from '@/server/platform/db';
import { bookingBy } from '@/server/services/bookings';
import { orderBy } from '@/server/services/rentals';

const LOCATION = 'No. 1 Wisepak Lane, New Asofan, Accra';

function respond(name: string, body: string) {
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${name}.ics"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.DATABASE_URL || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response('Not found', { status: 404 });
  const d = await db();
  const b = await bookingBy(d, { token });
  if (b?.ref && ['confirmed', 'pending_payment', 'checked_in'].includes(b.status)) {
    return respond(
      `hotel-a-wise-${b.ref}`,
      icsFile({
        uid: `${b.ref}@hotelawise.com`,
        summary: `Hotel A-Wise · ${b.variantName} (${b.ref})`,
        description: `Booking ${b.ref}. Check-in from 2pm, check-out by 12 noon. The desk is open all night.`,
        location: LOCATION,
        start: b.checkIn,
        end: b.checkOut,
      }),
    );
  }
  const o = await orderBy(d, { token });
  if (o && ['reserved', 'ready_for_pickup', 'pending_payment'].includes(o.status)) {
    const from = setting<number>(await getSiteData(), 'rentals.pickupFromHour');
    return respond(
      `hotel-a-wise-pickup-${o.ref}`,
      icsFile({
        uid: `${o.ref}@hotelawise.com`,
        summary: `Collect rentals · Hotel A-Wise (${o.ref})`,
        description: `Order ${o.ref}. Bring your reference and a vehicle big enough.`,
        location: LOCATION,
        start: accraInstant(o.starts, from),
        end: accraInstant(o.starts, from + 1),
      }),
    );
  }
  return new Response('Not found', { status: 404 });
}

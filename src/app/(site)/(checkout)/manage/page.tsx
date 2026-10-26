// /manage — find a booking by reference + phone, confirm with a code, then
// change dates or cancel (Checkout.dc.html › MANAGE BOOKING).
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ManageBooking } from '@/components/checkout/manage-booking';
import { normaliseRef } from '@/lib/refs';
import { contactFrom } from '@/server/content/contact';
import { getSiteData, setting } from '@/server/content/site-data';
import { db } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import { bookingBy } from '@/server/services/bookings';
import { PASS_COOKIE, readPass } from '@/server/services/guest-access';
import { manageView } from '@/server/services/manage-view';

export const metadata: Metadata = {
  title: 'Manage my booking',
  robots: { index: false, follow: false },
  alternates: { canonical: '/manage' },
};

type Search = Record<string, string | string[] | undefined>;

export default async function ManagePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, data] = await Promise.all([searchParams, getSiteData()]);
  const initialRef = typeof sp.ref === 'string' ? normaliseRef(sp.ref).slice(0, 12) : '';
  let view = null;
  if (process.env.DATABASE_URL) {
    const ref = await readPass((await cookies()).get(PASS_COOKIE)?.value, env().REF_SECRET);
    const b = ref ? await bookingBy(await db(), { ref }) : null;
    if (b) {
      view = manageView(b, {
        now: new Date(),
        freeHours: setting<number>(data, 'booking.freeCancellationHours'),
        depositPercent: setting<number>(data, 'booking.depositPercent'),
        checkInTime: setting<string>(data, 'hotel.checkIn'),
        deskPhone: contactFrom(data).phone,
      });
    }
  }
  return <ManageBooking key={view?.ref ?? 'lookup'} view={view} initialRef={initialRef} />;
}

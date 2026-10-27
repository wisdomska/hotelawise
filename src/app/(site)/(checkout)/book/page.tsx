// /book — dates & room, your details, pay (Checkout.dc.html › ROOM BOOKING).
import type { Metadata } from 'next';
import { BookFlow, type BookRoom } from '@/components/checkout/book-flow';
import { contactFrom } from '@/server/content/contact';
import { getSiteData, setting } from '@/server/content/site-data';

export const metadata: Metadata = {
  title: 'Book a room',
  description:
    'Pick your dates, choose a room and pay by MoMo or card, or at the hotel. We hold the room for 15 minutes while you check out.',
  alternates: { canonical: '/book' },
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BookPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, data] = await Promise.all([searchParams, getSiteData()]);
  const contact = contactFrom(data);
  const rooms: BookRoom[] = data.rooms.map((r) => ({
    code: r.code,
    name: r.name,
    beds: r.beds,
    sleeps: r.sleeps,
    image: data.photos[`room.${r.code}`]!,
    variants: r.variants.map((v) => ({ code: v.code, name: v.name, price: v.price })),
  }));
  const g = Number(one(sp.g));
  return (
    <BookFlow
      rooms={rooms}
      rules={data.rateRules}
      fees={{
        breakfastPerGuestNight: setting<number>(data, 'fees.breakfastPerGuestNightPesewas'),
        roomService: setting<number>(data, 'fees.roomServicePesewas'),
      }}
      depositPercent={setting<number>(data, 'booking.depositPercent')}
      payAtHotel={setting<boolean>(data, 'booking.payAtHotel') !== false}
      freeHours={setting<number>(data, 'booking.freeCancellationHours')}
      contact={{ phone: contact.phone, tel: contact.tel, wa: contact.wa }}
      turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null}
      initial={{
        ci: one(sp.ci),
        co: one(sp.co),
        guests: Number.isFinite(g) && g > 0 ? g : undefined,
        room: one(sp.room)?.toUpperCase(),
        tier: Number(one(sp.tier)) || 0,
        bf: one(sp.bf) === '1',
        rs: one(sp.rs) === '1',
      }}
    />
  );
}

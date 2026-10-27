// /rent — canopies, tables and chairs to reserve and collect, and the venues to hold the
// event in (Checkout.dc.html › RENTALS CATALOGUE + VENUES). /venues redirects here.
import type { Metadata } from 'next';
import { RentFlow } from '@/components/checkout/rent-flow';
import { VenuesView } from '@/components/checkout/venues-view';
import { isIsoDate } from '@/lib/dates';
import { rentProps } from '@/server/content/rent-props';
import { getSiteData } from '@/server/content/site-data';

export const metadata: Metadata = {
  title: 'Rentals & venues',
  description:
    'Canopies, tables and chairs for weddings, funerals and parties in Accra, and the venue to hold it in: an event compound for 100 to 200 guests and a conference room for up to 60. Reserve online, collect from New Asofan.',
  alternates: { canonical: '/rent' },
};

type Search = Record<string, string | string[] | undefined>;

export default async function RentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = typeof sp.from === 'string' ? sp.from : typeof sp.date === 'string' ? sp.date : '';
  const from = isIsoDate(raw) ? raw : null;
  const to = typeof sp.to === 'string' && isIsoDate(sp.to) ? sp.to : from;
  const [props, data] = await Promise.all([rentProps(), getSiteData()]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sy)' }}>
      <RentFlow mode="catalogue" {...props} initialRange={from ? { from, to: to! } : null} />
      <VenuesView
        venues={data.venues.map((v) => ({
          slug: v.slug,
          name: v.name,
          label: v.label,
          description: v.description,
          min: v.min ?? 1,
          max: v.max ?? 500,
          image: v.image,
        }))}
        intro={data.content['pages.venueIntro'] ?? ''}
        turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null}
      />
    </div>
  );
}

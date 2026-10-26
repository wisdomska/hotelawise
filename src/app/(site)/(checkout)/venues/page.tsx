// /venues — the compound and the conference room, quoted per event.
import type { Metadata } from 'next';
import { VenuesView } from '@/components/checkout/venues-view';
import { getSiteData } from '@/server/content/site-data';

export const metadata: Metadata = {
  title: 'Venues',
  description:
    'Host your wedding, funeral reception or meeting at Hotel A-Wise: an event compound for 100 to 200 guests and a conference room for up to 60. Quoted per event.',
  alternates: { canonical: '/venues' },
};

export default async function VenuesPage() {
  const data = await getSiteData();
  return (
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
  );
}

// What the rentals pages need from SiteData (both /rent and /rent/checkout).
import 'server-only';
import { contactFrom } from './contact';
import { getSiteData, setting } from './site-data';

export async function rentProps() {
  const data = await getSiteData();
  const ct = contactFrom(data);
  return {
    items: data.rentals,
    packs: data.bundles.map((b) => ({ name: b.name, pctOff: b.pctOff, description: b.description, items: b.items })),
    intro: data.content['pages.rentIntro'] ?? '',
    hours: {
      pickupFrom: setting<number>(data, 'rentals.pickupFromHour'),
      returnBy: setting<number>(data, 'rentals.returnByHour'),
      payAtPickupRelease: setting<number>(data, 'rentals.payAtPickupReleaseHour'),
    },
    contact: { phone: ct.phone, tel: ct.tel, wa: ct.wa, mapsDirections: ct.mapsDirections },
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? null,
  };
}

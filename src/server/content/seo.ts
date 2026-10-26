// Search and share metadata: Open Graph images and schema.org data for the hotel
// and its rooms. Prices and contact details come from the same SiteData the
// pages render, so search results never disagree with the site.
import { formatGhs } from '@/lib/money';
import { contactFrom } from './contact';
import { setting, type SiteData, type SiteImage, type SiteRoom } from './site-data';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

/** A 1200×630 share image (Cloudinary crop), or the original photo before Cloudinary is set up. */
export function shareImage(image: SiteImage) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const url = cloud
    ? `https://res.cloudinary.com/${cloud}/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/${image.id}`
    : `${appUrl()}/photos/${image.id}.jpg`;
  return { url, width: 1200, height: 630, alt: image.alt };
}

function absolute(path: string) {
  return new URL(path, appUrl()).toString();
}

export function hotelJsonLd(data: SiteData) {
  const ct = contactFrom(data);
  const pin = setting<{ lat: number; lng: number }>(data, 'contact.mapPin');
  const prices = data.rooms.flatMap((r) => r.variants.map((v) => v.price));
  const hero = data.photos.hero;
  return {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    '@id': absolute('/#hotel'),
    name: 'Hotel A-Wise',
    url: absolute('/'),
    description: data.content['home.heroSub'],
    image: hero ? shareImage(hero).url : undefined,
    telephone: setting<string>(data, 'contact.phone'),
    email: ct.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'No. 1 Wisepak Lane',
      addressLocality: 'New Asofan, Accra',
      addressCountry: 'GH',
    },
    geo: { '@type': 'GeoCoordinates', latitude: pin.lat, longitude: pin.lng },
    hasMap: ct.mapsSearch,
    checkinTime: setting<string>(data, 'hotel.checkIn'),
    checkoutTime: setting<string>(data, 'hotel.checkOut'),
    currenciesAccepted: 'GHS',
    paymentAccepted: 'Mobile Money, Visa, Mastercard, Cash',
    priceRange: prices.length ? `${formatGhs(Math.min(...prices))}–${formatGhs(Math.max(...prices))} per night` : undefined,
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    amenityFeature: [
      'Front desk open 24 hours',
      'Free Wi-Fi',
      'Air-conditioning',
      'Breakfast',
      'Room service',
      'Conference room',
      'Event space',
    ].map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
  };
}

export function roomJsonLd(data: SiteData, room: SiteRoom) {
  const photo = data.photos[`room.${room.code}`];
  return {
    '@context': 'https://schema.org',
    '@type': 'HotelRoom',
    name: `${room.name} Room`,
    description: room.blurb,
    url: absolute(`/rooms/${room.code.toLowerCase()}`),
    image: photo ? shareImage(photo).url : undefined,
    bed: room.beds,
    occupancy: { '@type': 'QuantitativeValue', maxValue: room.sleeps },
    amenityFeature: room.amenities.map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
    containedInPlace: { '@id': absolute('/#hotel') },
    offers: room.variants.map((v) => ({
      '@type': 'Offer',
      name: v.name,
      price: (v.price / 100).toFixed(2),
      priceCurrency: 'GHS',
      unitText: 'per night',
      url: absolute(`/rooms/${room.code.toLowerCase()}`),
    })),
  };
}

/** Serialises JSON-LD for a <script> tag; `<` is escaped so content can't close the tag. */
export function ldJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

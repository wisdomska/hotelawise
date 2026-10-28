// Everything the public pages need, loaded in one cached read and tagged 'site'
// so an admin edit (revalidateTag('site')) updates the live site at once.
// When no database is configured (the Worker build), it returns the seeded
// catalogue and default copy, so pages still prerender.
import 'server-only';
import { asc, eq, ne } from 'drizzle-orm';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import * as s from '@/server/db/schema';
import { BUNDLES, FAQS, GHS, RENTAL_ITEMS, ROOM_TYPES, VENUES } from './catalogue';
import { SEED_CONTENT, SEED_SETTINGS } from './defaults';
import type { RateRule, VariantCode } from '@/server/services/pricing';
import { cloudinaryId, GALLERY, IMAGES, PHOTO_SLOTS } from './images';

export const SITE_TAG = 'site';

export type SiteImage = { id: string; alt: string; concept: boolean };
export type SiteVariant = { code: VariantCode; displayCode: string; name: string; note: string | null; price: number; roomCount: number };
export type SiteRoom = {
  code: string;
  name: string;
  blurb: string;
  beds: string;
  sleeps: number;
  bathroom: string;
  bestFor: string;
  amenities: string[];
  variants: SiteVariant[];
  /** Lowest nightly price, pesewas. */
  from: number;
  roomNumbers: string[];
};
export type SiteRentalItem = {
  slug: string;
  name: string;
  spec: string;
  price: number;
  deposit: number;
  image: SiteImage | null;
  custom: boolean;
  stockTotal: number;
};
export type SiteBundle = { name: string; pctOff: number; description: string; items: Record<string, number> };
export type SiteVenue = {
  slug: string;
  name: string;
  label: string;
  description: string;
  min: number | null;
  max: number | null;
  image: SiteImage | null;
};
export type SiteGalleryItem = { image: SiteImage; category: 'Rooms' | 'Bathrooms' | 'Spaces' | 'Events' };

export type SiteData = {
  settings: Record<string, unknown>;
  content: Record<string, string>;
  rooms: SiteRoom[];
  photos: Record<string, SiteImage>;
  rentals: SiteRentalItem[];
  bundles: SiteBundle[];
  venues: SiteVenue[];
  faqs: { q: string; a: string }[];
  testimonial: { quote: string; from: string } | null;
  gallery: SiteGalleryItem[];
  comingSoon: { key: string; title: string; description: string; nowOpen: boolean }[];
  /** Active seasonal and long-stay rules, for prices shown before checkout. */
  rateRules: RateRule[];
};

function img(key: keyof typeof IMAGES): SiteImage {
  const i: { alt: string; concept?: boolean } = IMAGES[key];
  return { id: cloudinaryId(key), alt: i.alt, concept: !!i.concept };
}

/** The seeded catalogue as SiteData: the fallback when the database isn't available. */
export function defaultSiteData(): SiteData {
  return {
    settings: { ...SEED_SETTINGS },
    content: { ...SEED_CONTENT },
    rooms: ROOM_TYPES.map((t) => {
      const variants = t.variants.map((v) => ({
        code: v.code as VariantCode,
        displayCode: v.displayCode,
        name: v.name,
        note: 'note' in v ? v.note : null,
        price: GHS(v.price),
        roomCount: ((t.rooms as Record<string, readonly string[]>)[v.code] ?? []).length,
      }));
      return {
        code: t.code,
        name: t.name,
        blurb: SEED_CONTENT[`rooms.blurb.${t.code}`] ?? '',
        beds: t.beds,
        sleeps: t.sleeps,
        bathroom: t.bathroom,
        bestFor: t.bestFor,
        amenities: [...t.amenities],
        variants,
        from: Math.min(...variants.map((v) => v.price)),
        roomNumbers: Object.values(t.rooms as Record<string, readonly string[]>).flat(),
      };
    }),
    photos: Object.fromEntries(Object.entries(PHOTO_SLOTS).map(([slot, key]) => [slot, img(key)])),
    rentals: RENTAL_ITEMS.map((r) => ({
      slug: r.slug,
      name: r.name,
      spec: r.spec,
      price: GHS(r.price),
      deposit: GHS(r.deposit),
      image: r.image ? img(r.image) : null,
      custom: 'custom' in r && !!r.custom,
      stockTotal: r.stock,
    })),
    bundles: BUNDLES.map((b) => ({ name: b.name, pctOff: b.pctOff, description: b.description, items: { ...b.items } })),
    venues: VENUES.map((v) => ({
      slug: v.slug,
      name: v.name,
      label: v.label,
      description: v.description,
      min: v.capacityMin,
      max: v.capacityMax,
      image: img(v.image),
    })),
    faqs: FAQS.map(([q, a]) => ({ q, a })),
    testimonial: { quote: 'Nothing short of extraordinary. Spotless room, incredibly comfortable bed.', from: 'John & Mary P. · Achimota' },
    gallery: GALLERY.filter((g) => g.published !== false).map((g) => ({
      image: { ...img(g.key), alt: g.alt ?? IMAGES[g.key].alt },
      category: g.category,
    })),
    comingSoon: [
      { key: 'breakfast', title: 'Breakfast', description: 'An all-day West African dining concept.', nowOpen: false },
      { key: 'summer_hut', title: 'Summer Hut', description: 'An open-air sundowner lounge.', nowOpen: false },
    ],
    // Seeded switched off (scripts/seed.ts); the hotel turns them on in Rates.
    rateRules: [],
  };
}

async function loadFromDatabase(): Promise<SiteData> {
  const { db } = await import('@/server/platform/db');
  const d = await db();
  const fallback = defaultSiteData();

  const [
    settingsRows,
    contentRows,
    types,
    variants,
    rooms,
    slots,
    items,
    bundleRows,
    bundleItemRows,
    venueRows,
    faqRows,
    testimonialRows,
    galleryRows,
    comingRows,
    ruleRows,
  ] = await Promise.all([
    d.select().from(s.settings),
    d.select().from(s.contentBlocks),
    d.select().from(s.roomTypes).orderBy(asc(s.roomTypes.position)),
    d.select().from(s.rateVariants).orderBy(asc(s.rateVariants.position)),
    d
      .select({ number: s.rooms.number, rateVariantId: s.rooms.rateVariantId })
      .from(s.rooms)
      .where(ne(s.rooms.status, 'retired'))
      .orderBy(asc(s.rooms.number)),
    d.select().from(s.imageSlots),
    d.select().from(s.rentalItems).where(eq(s.rentalItems.archived, false)).orderBy(asc(s.rentalItems.position)),
    d.select().from(s.bundles).where(eq(s.bundles.active, true)).orderBy(asc(s.bundles.position)),
    d
      .select({ bundleId: s.bundleItems.bundleId, qty: s.bundleItems.qty, slug: s.rentalItems.slug })
      .from(s.bundleItems)
      .innerJoin(s.rentalItems, eq(s.rentalItems.id, s.bundleItems.itemId)),
    d.select().from(s.venues).orderBy(asc(s.venues.position)),
    d.select().from(s.faqs).where(eq(s.faqs.published, true)).orderBy(asc(s.faqs.position)),
    d.select().from(s.testimonials).where(eq(s.testimonials.status, 'live')).orderBy(asc(s.testimonials.position)).limit(1),
    d.select().from(s.galleryItems).where(eq(s.galleryItems.published, true)).orderBy(asc(s.galleryItems.position)),
    d.select().from(s.comingSoon),
    d.select().from(s.rateRules).where(eq(s.rateRules.active, true)),
  ]);

  const content = { ...fallback.content };
  for (const row of contentRows) if (row.value.trim()) content[row.key] = row.value;

  const photos: Record<string, SiteImage> = { ...fallback.photos };
  for (const slot of slots) photos[slot.slotKey] = { id: slot.imageId, alt: slot.alt, concept: slot.conceptLabel };

  return {
    settings: { ...fallback.settings, ...Object.fromEntries(settingsRows.map((r) => [r.key, r.value])) },
    content,
    rooms: types.map((t) => {
      const vs = variants
        .filter((v) => v.roomTypeId === t.id)
        .map((v) => ({
          code: v.code as VariantCode,
          displayCode: v.displayCode,
          name: v.name,
          note: v.note,
          price: v.pricePesewas,
          roomCount: rooms.filter((r) => r.rateVariantId === v.id).length,
          id: v.id,
        }));
      return {
        code: t.code,
        name: t.name,
        blurb: content[`rooms.blurb.${t.code}`] || t.blurb,
        beds: t.beds,
        sleeps: t.sleeps,
        bathroom: t.bathroom,
        bestFor: t.bestFor,
        amenities: t.amenities,
        variants: vs.map(({ id: _id, ...v }) => v),
        from: vs.length ? Math.min(...vs.map((v) => v.price)) : 0,
        roomNumbers: rooms.filter((r) => vs.some((v) => v.id === r.rateVariantId)).map((r) => r.number),
      };
    }),
    photos,
    rentals: items.map((i) => ({
      slug: i.slug,
      name: i.name,
      spec: i.spec,
      price: i.pricePerDayPesewas,
      deposit: i.depositPerUnitPesewas,
      image: i.imageId ? { id: i.imageId, alt: i.imageAlt ?? i.name, concept: false } : null,
      custom: i.isCustom,
      stockTotal: i.stockTotal,
    })),
    bundles: bundleRows.map((b) => ({
      name: b.name,
      pctOff: b.pctOff,
      description: b.description,
      items: Object.fromEntries(bundleItemRows.filter((bi) => bi.bundleId === b.id).map((bi) => [bi.slug, bi.qty])),
    })),
    venues: venueRows.map((v) => ({
      slug: v.slug,
      name: v.name,
      label: v.label,
      description: v.description,
      min: v.capacityMin,
      max: v.capacityMax,
      image: v.imageId ? { id: v.imageId, alt: v.name, concept: false } : null,
    })),
    faqs: faqRows.map((f) => ({ q: f.question, a: f.answer })),
    testimonial: testimonialRows[0] ? { quote: testimonialRows[0].quote, from: testimonialRows[0].attribution } : null,
    gallery: galleryRows.map((g) => ({ image: { id: g.imageId, alt: g.alt, concept: false }, category: g.category })),
    comingSoon: comingRows.map((c) => ({ key: c.key, title: c.title, description: c.description, nowOpen: c.nowOpen })),
    rateRules: ruleRows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      from: r.monthDayFrom,
      to: r.monthDayTo,
      minNights: r.minNights,
      appliesTo: r.appliesTo?.length ? (r.appliesTo as VariantCode[]) : 'all',
      direction: r.direction,
      unit: r.unit,
      amount: r.amount,
      active: r.active,
    })),
  };
}

const cachedSiteData = unstable_cache(loadFromDatabase, ['site-data-v3'], { tags: [SITE_TAG], revalidate: 3600 });

// One read per request (React cache): /rent asks for it twice at once, and two misses together
// wrote the same Workers KV key in the same second, which KV refuses, so the page returned 500
// right after a deploy or an admin edit. If the cache itself fails, read the database directly.
export const getSiteData = cache(async (): Promise<SiteData> => {
  if (!process.env.DATABASE_URL) return defaultSiteData();
  try {
    return await cachedSiteData();
  } catch (e) {
    console.error('site data cache failed; reading the database directly', e);
    return loadFromDatabase();
  }
});

/** Straight from the database, for scheduled jobs that run outside a Next.js request. */
export async function getSiteDataFresh(): Promise<SiteData> {
  if (!process.env.DATABASE_URL) return defaultSiteData();
  return loadFromDatabase();
}

/** A typed setting with its seeded default. */
export function setting<T>(data: SiteData, key: keyof typeof SEED_SETTINGS): T {
  return (data.settings[key] ?? SEED_SETTINGS[key]) as T;
}

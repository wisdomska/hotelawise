// Seeds the real catalogue: rooms, rates, venues, rental items, packs, content,
// FAQ, photos and settings. No demo guests, bookings, orders, revenue or accounts
// on any environment (DECISIONS D-04). Safe to re-run: existing rows are kept,
// so edits made in the admin are never overwritten.
//   DATABASE_URL=… pnpm db:seed
import { connect } from './connect';
import * as s from '../src/server/db/schema';
import { cloudinaryId, GALLERY, IMAGES, PHOTO_SLOTS } from '../src/server/content/images';
import { SEED_SETTINGS, SEED_CONTENT } from '../src/server/content/defaults';
import { BUNDLES, FAQS, GHS, PROMOS, RATE_RULES, RENTAL_ITEMS, ROOM_TYPES, VENUES } from '../src/server/content/catalogue';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
const { db, close } = connect(url);
async function main() {
  await db.transaction(async (tx) => {
    for (const t of ROOM_TYPES) {
      const [type] = await tx
        .insert(s.roomTypes)
        .values({
          code: t.code,
          name: t.name,
          beds: t.beds,
          sleeps: t.sleeps,
          bathroom: t.bathroom,
          bestFor: t.bestFor,
          amenities: [...t.amenities],
          position: t.position,
          blurb: SEED_CONTENT[`rooms.blurb.${t.code}`] ?? '',
        })
        .onConflictDoUpdate({ target: s.roomTypes.code, set: { code: t.code } })
        .returning();
      for (const [i, v] of t.variants.entries()) {
        const [variant] = await tx
          .insert(s.rateVariants)
          .values({
            roomTypeId: type!.id,
            code: v.code,
            displayCode: v.displayCode,
            name: v.name,
            pricePesewas: GHS(v.price),
            note: 'note' in v ? v.note : null,
            position: i,
          })
          .onConflictDoUpdate({ target: s.rateVariants.code, set: { code: v.code } })
          .returning();
        for (const number of (t.rooms as Record<string, readonly string[]>)[v.code] ?? []) {
          await tx.insert(s.rooms).values({ number, rateVariantId: variant!.id }).onConflictDoNothing();
        }
      }
    }

    const itemIds: Record<string, string> = {};
    for (const [i, it] of RENTAL_ITEMS.entries()) {
      const [row] = await tx
        .insert(s.rentalItems)
        .values({
          slug: it.slug,
          name: it.name,
          spec: it.spec,
          position: i,
          pricePerDayPesewas: GHS(it.price),
          depositPerUnitPesewas: GHS(it.deposit),
          stockTotal: it.stock,
          isCustom: 'custom' in it && it.custom,
          imageId: it.image ? cloudinaryId(it.image) : null,
          imageAlt: it.image ? IMAGES[it.image].alt : null,
        })
        .onConflictDoUpdate({ target: s.rentalItems.slug, set: { slug: it.slug } })
        .returning();
      itemIds[it.slug] = row!.id;
    }
    const existingBundles = await tx.select().from(s.bundles);
    if (!existingBundles.length) {
      for (const [i, b] of BUNDLES.entries()) {
        const [row] = await tx
          .insert(s.bundles)
          .values({ name: b.name, pctOff: b.pctOff, description: b.description, position: i })
          .returning();
        await tx
          .insert(s.bundleItems)
          .values(Object.entries(b.items).map(([slug, qty]) => ({ bundleId: row!.id, itemId: itemIds[slug]!, qty })));
      }
    }
    if (!(await tx.select().from(s.deliveryZones)).length) {
      // Delivery is off (DECISIONS D-01); zones kept for later.
      await tx
        .insert(s.deliveryZones)
        .values([50, 100, 180, 250].map((fee, i) => ({ name: `Zone ${i + 1}`, feePesewas: GHS(fee), active: false })));
    }

    for (const v of VENUES) {
      await tx
        .insert(s.venues)
        .values({
          slug: v.slug,
          name: v.name,
          label: v.label,
          description: v.description,
          capacityMin: v.capacityMin,
          capacityMax: v.capacityMax,
          hirePesewas: GHS(v.hire),
          imageId: cloudinaryId(v.image),
          position: v.position,
        })
        .onConflictDoNothing();
    }

    if (!(await tx.select().from(s.faqs)).length) {
      await tx.insert(s.faqs).values(FAQS.map(([question, answer], position) => ({ question, answer, position })));
    }
    if (!(await tx.select().from(s.testimonials)).length) {
      await tx.insert(s.testimonials).values({
        quote: 'Nothing short of extraordinary. Spotless room, incredibly comfortable bed.',
        attribution: 'John & Mary P. · Achimota',
        status: 'live',
      });
    }
    await tx
      .insert(s.comingSoon)
      .values([
        { key: 'breakfast', title: 'Breakfast', description: 'An all-day West African dining concept.' },
        { key: 'summer_hut', title: 'Summer Hut', description: 'An open-air sundowner lounge.' },
      ])
      .onConflictDoNothing();

    if (!(await tx.select().from(s.rateRules)).length) {
      await tx.insert(s.rateRules).values(RATE_RULES.map((r) => ({ ...r, active: false })));
    }
    for (const p of PROMOS)
      await tx
        .insert(s.promoCodes)
        .values({ ...p, active: false })
        .onConflictDoNothing();

    for (const [slotKey, key] of Object.entries(PHOTO_SLOTS)) {
      const img: { alt: string; concept?: boolean; replaceBeforeLaunch?: string } = IMAGES[key];
      await tx
        .insert(s.imageSlots)
        .values({
          slotKey,
          imageId: cloudinaryId(key),
          originalImageId: cloudinaryId(key),
          alt: img.alt,
          conceptLabel: !!img.concept,
          replaceBeforeLaunch: !!img.replaceBeforeLaunch,
        })
        .onConflictDoNothing();
    }
    if (!(await tx.select().from(s.galleryItems)).length) {
      await tx.insert(s.galleryItems).values(
        GALLERY.map((g, position) => ({
          imageId: cloudinaryId(g.key),
          alt: g.alt ?? IMAGES[g.key].alt,
          category: g.category,
          position,
          published: g.published !== false,
        })),
      );
    }

    for (const [key, value] of Object.entries(SEED_SETTINGS)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoNothing();
    }
    for (const [key, value] of Object.entries(SEED_CONTENT)) {
      await tx.insert(s.contentBlocks).values({ key, value }).onConflictDoNothing();
    }
  });
  console.log('seed complete');
}

try {
  await main();
} finally {
  await close();
}

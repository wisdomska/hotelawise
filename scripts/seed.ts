// Seeds the real catalogue: rooms, rates, venues, rental items, packs, content,
// FAQ, photos and settings. No demo guests, bookings, orders, revenue or accounts
// on any environment (DECISIONS D-04). Safe to re-run: existing rows are kept,
// so edits made in the admin are never overwritten.
//   DATABASE_URL=… pnpm db:seed
import { createNodeDb } from '../src/server/db/node';
import * as s from '../src/server/db/schema';
import { cloudinaryId, GALLERY, IMAGES, PHOTO_SLOTS } from '../src/server/content/images';
import { SEED_SETTINGS, SEED_CONTENT } from '../src/server/content/defaults';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
const { db, close } = createNodeDb(url);
const GHS = (n: number) => Math.round(n * 100);

// Hotel facts from the spec; descriptions and amenities from the prototype.
const ROOM_TYPES = [
  {
    code: 'STD', name: 'Standard', beds: '1 queen bed', sleeps: 2, bathroom: 'Private shower room', bestFor: 'Solo trips, short stays', position: 0,
    amenities: ['Air-conditioning and ceiling fan', 'Wi-Fi', 'Flat-screen TV', 'Work desk and chair', 'Private bathroom, hot shower', 'A-Wise customised linen'],
    variants: [{ code: 'STD', displayCode: 'STD', name: 'Standard', price: 150 }],
    rooms: { STD: ['101', '102', '103', '104', '105', '106'] },
  },
  {
    code: 'EXE', name: 'Executive', beds: 'Large double bed', sleeps: 2, bathroom: 'Upgraded rain shower', bestFor: 'Business trips, longer stays', position: 1,
    amenities: ['Air-conditioning and ceiling fan', 'Wi-Fi', 'Flat-screen TV', 'Work desk facing the window', 'Rain shower, LED mirror', 'A-Wise customised linen'],
    variants: [
      { code: 'EXE', displayCode: 'EXE', name: 'Executive', price: 200 },
      { code: 'EXE_PLUS', displayCode: 'EXE+', name: 'Executive Plus', price: 250, note: 'More floor space, same upgraded bathroom' },
    ],
    rooms: { EXE: ['201', '202', '205'], EXE_PLUS: ['203', '204'] },
  },
  {
    code: 'VIP', name: 'VIP', beds: 'Large double bed', sleeps: 2, bathroom: 'VIP bathroom', bestFor: 'Anniversaries, treating yourself', position: 2,
    amenities: ['Air-conditioning', 'Wi-Fi', 'Flat-screen TV', 'Mini fridge', 'VIP bathroom, rain shower, LED mirror', 'A-Wise customised linen'],
    variants: [{ code: 'VIP', displayCode: 'VIP', name: 'VIP', price: 300 }],
    rooms: { VIP: ['206', '207', '208'] },
  },
  {
    code: 'DBL', name: 'Double', beds: '2 double beds', sleeps: 4, bathroom: 'Private bathroom', bestFor: 'Families, friends sharing', position: 3,
    amenities: ['Air-conditioning and ceiling fan', 'Wi-Fi', 'Flat-screen TV', 'Two double beds', 'Desk and two chairs', 'Private bathroom, hot shower'],
    variants: [{ code: 'DBL', displayCode: 'DBL', name: 'Double', price: 400 }],
    rooms: { DBL: ['107', '108'] },
  },
] as const;

const RENTAL_ITEMS = [
  { slug: 'canopy', name: 'Canopy', spec: '10 × 10 ft, white, steel frame', price: 250, deposit: 100, stock: 12, image: 'canopy' },
  { slug: 'longtable', name: 'Long table', spec: '6 ft, seats 6–8, foldable', price: 40, deposit: 20, stock: 30, image: 'table' },
  { slug: 'shorttable', name: 'Short table', spec: '4 ft, seats 4, foldable', price: 25, deposit: 15, stock: 40, image: 'table' },
  { slug: 'foldchair', name: 'Foldable chair', spec: 'Padded seat, blue, steel legs', price: 5, deposit: 2, stock: 300, image: 'foldableChair' },
  { slug: 'chair', name: 'Regular plastic chair', spec: 'Stackable, blue, with arms', price: 3, deposit: 1, stock: 400, image: null },
  { slug: 'cloth', name: 'Tablecloth', spec: 'White, fits long tables', price: 15, deposit: 5, stock: 60, image: null, custom: true },
  { slug: 'cover', name: 'Chair cover', spec: 'White stretch cover with sash', price: 4, deposit: 1, stock: 200, image: null, custom: true },
] as const;

const BUNDLES = [
  { name: 'Wedding pack', pctOff: 10, description: '4 canopies, 100 foldable chairs, 10 long tables.', items: { canopy: 4, foldchair: 100, longtable: 10 } },
  { name: 'Funeral pack', pctOff: 10, description: '6 canopies, 200 regular chairs, 10 long tables.', items: { canopy: 6, chair: 200, longtable: 10 } },
  { name: 'Party pack', pctOff: 8, description: '2 canopies, 50 regular chairs, 6 short tables.', items: { canopy: 2, chair: 50, shorttable: 6 } },
];

const VENUES = [
  {
    slug: 'compound', name: 'Event compound', label: '100–200 guests', capacityMin: 100, capacityMax: 200, hire: 2500, image: 'compoundWedding' as const, position: 0,
    description: "Gated, on our own grounds, with the hotel right there for guests who'd rather not drive home. Pair it with our canopies and chairs.",
  },
  {
    slug: 'conference', name: 'Conference room', label: '2nd floor', capacityMin: 10, capacityMax: 60, hire: 800, image: 'conferenceRoom2' as const, position: 1,
    description: 'Big windows, ceiling fans, AC and tables you can arrange how you like. Meetings, trainings, small receptions.',
  },
];

const FAQS: [string, string][] = [
  ['Can I really check in at 3am?', "Yes. The front desk is staffed 24 hours a day, 7 days a week, holidays included. If you know you'll land late, add your arrival time when you book so we have the room ready and the light on."],
  ['What are check-in and check-out times?', "Rooms are ready from 2pm and check-out is by 12 noon. Need it earlier or later? Ask the desk. If the room is free, we'll usually make it work."],
  ['Is breakfast included?', 'Breakfast is served 7 to 10am daily and can be added to any booking for GHS 50 per guest per day. Tick the box when you book, or ask at the desk.'],
  ['Do you do room service?', 'Yes, for an extra GHS 20 on top of whatever you order.'],
  ['How do I pay?', 'Online with Mobile Money (MTN, Telecel, AirtelTigo) or Visa and Mastercard through Paystack. You can pay in full or pay a deposit. Cash and MoMo are also fine at the desk.'],
  ['What is the cancellation policy?', 'Cancel free of charge up to 48 hours before check-in for a full refund. Inside 48 hours we keep the deposit. No-shows are charged the first night.'],
  ['Can I rent chairs and canopies without staying?', "Absolutely. Reserve online for your dates and collect from Wisepak Lane. Pay online, or at the desk when you pick up. We don't deliver yet."],
  ['Can I host my event at A-Wise?', "Yes. The outdoor compound takes 100 to 200 guests and the second-floor conference room suits meetings and small receptions. Send an enquiry and we'll call you back with a quote."],
];

// Offers from the prototype, seeded paused until the hotel confirms them.
const RATE_RULES = [
  { name: 'Christmas & New Year', kind: 'range' as const, monthDayFrom: '12-20', monthDayTo: '01-02', appliesTo: null, direction: 'up' as const, unit: 'pct' as const, amount: 15 },
  { name: 'Weekend nights', kind: 'weekend' as const, appliesTo: ['DBL'], direction: 'up' as const, unit: 'ghs' as const, amount: GHS(30) },
  { name: 'Long stay', kind: 'longstay' as const, minNights: 7, appliesTo: null, direction: 'down' as const, unit: 'pct' as const, amount: 10 },
  { name: 'Independence Day', kind: 'range' as const, monthDayFrom: '03-06', monthDayTo: '03-06', appliesTo: null, direction: 'up' as const, unit: 'pct' as const, amount: 10 },
];
const PROMOS = [
  { code: 'AWISE3', type: 'breakfast' as const, value: 0, minNights: 3 },
  { code: 'NIGHTOWL', type: 'ghs' as const, value: GHS(20) },
];

async function main() {
  await db.transaction(async (tx) => {
    for (const t of ROOM_TYPES) {
      const [type] = await tx
        .insert(s.roomTypes)
        .values({ code: t.code, name: t.name, beds: t.beds, sleeps: t.sleeps, bathroom: t.bathroom, bestFor: t.bestFor, amenities: [...t.amenities], position: t.position, blurb: SEED_CONTENT[`rooms.blurb.${t.code}`] ?? '' })
        .onConflictDoUpdate({ target: s.roomTypes.code, set: { code: t.code } })
        .returning();
      for (const [i, v] of t.variants.entries()) {
        const [variant] = await tx
          .insert(s.rateVariants)
          .values({ roomTypeId: type!.id, code: v.code, displayCode: v.displayCode, name: v.name, pricePesewas: GHS(v.price), note: 'note' in v ? v.note : null, position: i })
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
          slug: it.slug, name: it.name, spec: it.spec, position: i,
          pricePerDayPesewas: GHS(it.price), depositPerUnitPesewas: GHS(it.deposit), stockTotal: it.stock,
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
        const [row] = await tx.insert(s.bundles).values({ name: b.name, pctOff: b.pctOff, description: b.description, position: i }).returning();
        await tx.insert(s.bundleItems).values(Object.entries(b.items).map(([slug, qty]) => ({ bundleId: row!.id, itemId: itemIds[slug]!, qty })));
      }
    }
    if (!(await tx.select().from(s.deliveryZones)).length) {
      // Delivery is off (DECISIONS D-01); zones kept for later.
      await tx.insert(s.deliveryZones).values([50, 100, 180, 250].map((fee, i) => ({ name: `Zone ${i + 1}`, feePesewas: GHS(fee), active: false })));
    }

    for (const v of VENUES) {
      await tx
        .insert(s.venues)
        .values({ slug: v.slug, name: v.name, label: v.label, description: v.description, capacityMin: v.capacityMin, capacityMax: v.capacityMax, hirePesewas: GHS(v.hire), imageId: cloudinaryId(v.image), position: v.position })
        .onConflictDoNothing();
    }

    if (!(await tx.select().from(s.faqs)).length) {
      await tx.insert(s.faqs).values(FAQS.map(([question, answer], position) => ({ question, answer, position })));
    }
    if (!(await tx.select().from(s.testimonials)).length) {
      await tx.insert(s.testimonials).values({ quote: 'Nothing short of extraordinary. Spotless room, incredibly comfortable bed.', attribution: 'John & Mary P. · Achimota', status: 'live' });
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
    for (const p of PROMOS) await tx.insert(s.promoCodes).values({ ...p, active: false }).onConflictDoNothing();

    for (const [slotKey, key] of Object.entries(PHOTO_SLOTS)) {
      const img: { alt: string; concept?: boolean; replaceBeforeLaunch?: string } = IMAGES[key];
      await tx
        .insert(s.imageSlots)
        .values({ slotKey, imageId: cloudinaryId(key), originalImageId: cloudinaryId(key), alt: img.alt, conceptLabel: !!img.concept, replaceBeforeLaunch: !!img.replaceBeforeLaunch })
        .onConflictDoNothing();
    }
    if (!(await tx.select().from(s.galleryItems)).length) {
      await tx.insert(s.galleryItems).values(GALLERY.map((g, position) => ({ imageId: cloudinaryId(g.key), alt: g.alt ?? IMAGES[g.key].alt, category: g.category, position })));
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

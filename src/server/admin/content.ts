// Content › every tab: page copy (content_blocks), photo slots, the gallery,
// FAQ, testimonials, venue text and the banner. The public site reads all of
// it through getSiteData, so actions revalidate the 'site' tag.
import 'server-only';
import { asc, desc, eq, gt, inArray, lt, max } from 'drizzle-orm';
import { SEED_CONTENT, SEED_SETTINGS } from '@/server/content/defaults';
import { cloudinaryId, IMAGES, PHOTO_SLOTS } from '@/server/content/images';
import * as s from '@/server/db/schema';
import { audit, diff } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { AdminError } from './act';
import type { Who } from './bookings';
import { isUploadedId } from './cloudinary';

/** Copy keys staff may edit: the seeded ones, plus the overview tile names. */
export const CONTENT_KEYS = new Set(Object.keys(SEED_CONTENT));

export type Slot = { key: string; id: string; alt: string; custom: boolean };
export type GalleryRow = { id: string; imageId: string; alt: string; category: (typeof CATEGORIES)[number]; published: boolean };
export type FaqRow = { id: string; q: string; a: string; published: boolean };
export type TestimonialRow = { id: string; quote: string; from: string; live: boolean };
export type VenueRow = { slug: string; name: string; label: string; description: string; min: number | null; max: number | null };

export const CATEGORIES = ['Rooms', 'Bathrooms', 'Spaces', 'Events'] as const;

export async function contentData(d: AnyDb) {
  const [blocks, slots, gallery, faqRows, testi, venueRows, banner] = await Promise.all([
    d.select().from(s.contentBlocks),
    d.select().from(s.imageSlots),
    d.select().from(s.galleryItems).orderBy(asc(s.galleryItems.position), desc(s.galleryItems.createdAt)),
    d.select().from(s.faqs).orderBy(asc(s.faqs.position)),
    d.select().from(s.testimonials).orderBy(asc(s.testimonials.position)),
    d.select().from(s.venues).orderBy(asc(s.venues.position)),
    d
      .select()
      .from(s.settings)
      .where(inArray(s.settings.key, ['banner.enabled', 'banner.text'])),
  ]);
  const copy: Record<string, string> = {};
  for (const k of CONTENT_KEYS) copy[k] = '';
  for (const b of blocks) if (CONTENT_KEYS.has(b.key)) copy[b.key] = b.value;
  const rows = new Map(slots.map((r) => [r.slotKey, r]));
  const photo: Record<string, Slot> = {};
  for (const [key, img] of Object.entries(PHOTO_SLOTS)) {
    const r = rows.get(key);
    const def = cloudinaryId(img);
    photo[key] = r
      ? { key, id: r.imageId, alt: r.alt, custom: r.imageId !== r.originalImageId }
      : { key, id: def, alt: IMAGES[img].alt, custom: false };
  }
  const b = Object.fromEntries(banner.map((r) => [r.key, r.value]));
  return {
    copy,
    defaults: SEED_CONTENT,
    photo,
    gallery: gallery.map((g) => ({
      id: g.id,
      imageId: g.imageId,
      alt: g.alt,
      category: g.category,
      published: g.published,
    })) as GalleryRow[],
    faqs: faqRows.map((f) => ({ id: f.id, q: f.question, a: f.answer, published: f.published })) as FaqRow[],
    testimonials: testi.map((t) => ({ id: t.id, quote: t.quote, from: t.attribution, live: t.status === 'live' })) as TestimonialRow[],
    venues: venueRows.map((v) => ({
      slug: v.slug,
      name: v.name,
      label: v.label,
      description: v.description,
      min: v.capacityMin,
      max: v.capacityMax,
    })) as VenueRow[],
    banner: {
      'banner.enabled': (b['banner.enabled'] ?? SEED_SETTINGS['banner.enabled']) as boolean,
      'banner.text': String(b['banner.text'] ?? SEED_SETTINGS['banner.text']),
    },
  };
}
export type ContentData = Awaited<ReturnType<typeof contentData>>;

/** Saves copy; a blank field falls back to the default text on the site. */
export async function saveCopy(tx: AnyDb, by: Who, section: string, patch: Record<string, string>) {
  const keys = Object.keys(patch);
  if (!keys.length) throw new AdminError('Nothing to save.');
  for (const k of keys) if (!CONTENT_KEYS.has(k)) throw new AdminError('That field can’t be edited here.');
  const old = Object.fromEntries(
    (await tx.select().from(s.contentBlocks).where(inArray(s.contentBlocks.key, keys))).map((r) => [r.key, r.value]),
  );
  for (const k of keys) {
    const value = patch[k]!.trim().slice(0, 2000);
    await tx
      .insert(s.contentBlocks)
      .values({ key: k, value })
      .onConflictDoUpdate({ target: s.contentBlocks.key, set: { value, updatedAt: new Date() } });
  }
  const before = Object.fromEntries(keys.map((k) => [k, old[k] ?? '']));
  await audit(tx, { actor: by, action: 'Edited content', entity: 'content', target: section, ...diff(before, patch) });
}

export async function setSlotPhoto(tx: AnyDb, by: Who, slot: string, imageId: string | null) {
  const img = PHOTO_SLOTS[slot];
  if (!img) throw new AdminError('That photo slot doesn’t exist.');
  if (imageId && !isUploadedId(imageId, 'photos')) throw new AdminError('That upload wasn’t recognised. Try again.');
  const def = cloudinaryId(img);
  const [row] = await tx.select().from(s.imageSlots).where(eq(s.imageSlots.slotKey, slot));
  const original = row?.originalImageId ?? def;
  const next = imageId ?? original;
  if (row) await tx.update(s.imageSlots).set({ imageId: next, updatedAt: new Date() }).where(eq(s.imageSlots.slotKey, slot));
  else await tx.insert(s.imageSlots).values({ slotKey: slot, imageId: next, originalImageId: original, alt: IMAGES[img].alt });
  await audit(tx, {
    actor: by,
    action: imageId ? 'Replaced photo' : 'Reset photo',
    entity: 'photo',
    entityId: slot,
    target: slot,
    before: { image: row?.imageId ?? def },
    after: { image: next },
  });
}

export async function addGalleryPhotos(tx: AnyDb, by: Who, ids: string[]) {
  if (!ids.length || ids.length > 30) throw new AdminError('Upload between 1 and 30 photos at a time.');
  for (const id of ids) if (!isUploadedId(id, 'gallery')) throw new AdminError('That upload wasn’t recognised. Try again.');
  // New photos go first, unpublished until they have alt text (database check).
  const [first] = await tx.select({ p: s.galleryItems.position }).from(s.galleryItems).orderBy(asc(s.galleryItems.position)).limit(1);
  const top = first?.p ?? 0;
  await tx
    .insert(s.galleryItems)
    .values(
      ids.map((imageId, i) => ({ imageId, category: 'Spaces' as const, alt: '', published: false, position: top - (ids.length - i) * 10 })),
    );
  await audit(tx, { actor: by, action: 'Uploaded photos', entity: 'gallery', target: 'Gallery', after: { added: ids.length } });
}

export async function updateGalleryItem(
  tx: AnyDb,
  by: Who,
  id: string,
  patch: { alt: string; category: GalleryRow['category']; published: boolean },
) {
  const [row] = await tx.select().from(s.galleryItems).where(eq(s.galleryItems.id, id));
  if (!row) throw new AdminError('That photo was removed.');
  const alt = patch.alt.trim().slice(0, 200);
  if (patch.published && !alt) throw new AdminError('Add alt text before publishing.', { alt: 'Describe the photo for screen readers.' });
  await tx.update(s.galleryItems).set({ alt, category: patch.category, published: patch.published }).where(eq(s.galleryItems.id, id));
  await audit(tx, {
    actor: by,
    action: 'Edited gallery photo',
    entity: 'gallery',
    entityId: id,
    target: alt || 'Untitled photo',
    ...diff(
      { alt: row.alt, category: row.category, published: row.published },
      { alt, category: patch.category, published: patch.published },
    ),
  });
}

export async function deleteGalleryItem(tx: AnyDb, by: Who, id: string) {
  const [row] = await tx.delete(s.galleryItems).where(eq(s.galleryItems.id, id)).returning();
  if (!row) throw new AdminError('That photo was already removed.');
  await audit(tx, {
    actor: by,
    action: 'Deleted gallery photo',
    entity: 'gallery',
    entityId: id,
    target: row.alt || 'Untitled photo',
    before: { image: row.imageId },
  });
}

type Orderable = typeof s.faqs | typeof s.testimonials | typeof s.galleryItems;

/** Swaps an item with its neighbour above (-1) or below (+1). */
async function move(tx: AnyDb, table: Orderable, id: string, dir: -1 | 1) {
  const [row] = await tx.select({ id: table.id, position: table.position }).from(table).where(eq(table.id, id));
  if (!row) throw new AdminError('That item was removed.');
  const [other] = await tx
    .select({ id: table.id, position: table.position })
    .from(table)
    .where(dir < 0 ? lt(table.position, row.position) : gt(table.position, row.position))
    .orderBy(dir < 0 ? desc(table.position) : asc(table.position))
    .limit(1);
  if (!other) return false;
  await tx.update(table).set({ position: other.position }).where(eq(table.id, row.id));
  await tx.update(table).set({ position: row.position }).where(eq(table.id, other.id));
  return true;
}

/** Positions must be distinct for move() to work; seeded rows may share 0. */
async function renumber(tx: AnyDb, table: Orderable) {
  const rows = await tx.select({ id: table.id, position: table.position }).from(table).orderBy(asc(table.position));
  const dup = new Set(rows.map((r) => r.position)).size !== rows.length;
  if (dup)
    for (const [i, r] of rows.entries())
      await tx
        .update(table)
        .set({ position: i * 10 })
        .where(eq(table.id, r.id));
}

export async function moveItem(tx: AnyDb, by: Who, kind: 'faq' | 'testimonial' | 'gallery', id: string, dir: -1 | 1) {
  const table = kind === 'faq' ? s.faqs : kind === 'testimonial' ? s.testimonials : s.galleryItems;
  await renumber(tx, table);
  const moved = await move(tx, table, id, dir);
  if (moved) await audit(tx, { actor: by, action: 'Reordered', entity: kind, entityId: id, target: dir < 0 ? 'Moved up' : 'Moved down' });
  return moved;
}

async function nextPosition(tx: AnyDb, table: typeof s.faqs | typeof s.testimonials) {
  const [r] = await tx.select({ m: max(table.position) }).from(table);
  return (r?.m ?? 0) + 10;
}

export async function saveFaq(tx: AnyDb, by: Who, input: { id: string | null; q: string; a: string; published: boolean }) {
  const question = input.q.trim().slice(0, 200);
  const answer = input.a.trim().slice(0, 2000);
  const errs: Record<string, string> = {};
  if (question.length < 5) errs.q = 'Write the question.';
  if (answer.length < 5) errs.a = 'Write the answer.';
  if (Object.keys(errs).length) throw new AdminError('Check the highlighted fields.', errs);
  if (!input.id) {
    const [row] = await tx
      .insert(s.faqs)
      .values({ question, answer, published: input.published, position: await nextPosition(tx, s.faqs) })
      .returning({ id: s.faqs.id });
    await audit(tx, { actor: by, action: 'Added FAQ', entity: 'faq', entityId: row!.id, target: question.slice(0, 60) });
    return { created: true };
  }
  const [old] = await tx.select().from(s.faqs).where(eq(s.faqs.id, input.id));
  if (!old) throw new AdminError('That question was removed.');
  await tx.update(s.faqs).set({ question, answer, published: input.published }).where(eq(s.faqs.id, input.id));
  await audit(tx, {
    actor: by,
    action: 'Edited FAQ',
    entity: 'faq',
    entityId: input.id,
    target: question.slice(0, 60),
    ...diff({ question: old.question, answer: old.answer, published: old.published }, { question, answer, published: input.published }),
  });
  return { created: false };
}

export async function deleteFaq(tx: AnyDb, by: Who, id: string) {
  const [row] = await tx.delete(s.faqs).where(eq(s.faqs.id, id)).returning();
  if (!row) throw new AdminError('That question was already removed.');
  await audit(tx, {
    actor: by,
    action: 'Deleted FAQ',
    entity: 'faq',
    entityId: id,
    target: row.question.slice(0, 60),
    before: { question: row.question },
  });
}

export async function saveTestimonial(tx: AnyDb, by: Who, input: { id: string | null; quote: string; from: string; live: boolean }) {
  const quote = input.quote
    .trim()
    .replace(/^[“"]|[”"]$/g, '')
    .slice(0, 400);
  const attribution = input.from.trim().slice(0, 80);
  const errs: Record<string, string> = {};
  if (quote.length < 5) errs.quote = 'Write the quote.';
  if (attribution.length < 2) errs.from = 'Say who it’s from.';
  if (Object.keys(errs).length) throw new AdminError('Check the highlighted fields.', errs);
  const status = input.live ? ('live' as const) : ('draft' as const);
  if (!input.id) {
    const [row] = await tx
      .insert(s.testimonials)
      .values({ quote, attribution, status, position: await nextPosition(tx, s.testimonials) })
      .returning({ id: s.testimonials.id });
    await audit(tx, { actor: by, action: 'Added testimonial', entity: 'testimonial', entityId: row!.id, target: attribution });
    return;
  }
  const [old] = await tx.select().from(s.testimonials).where(eq(s.testimonials.id, input.id));
  if (!old) throw new AdminError('That testimonial was removed.');
  await tx.update(s.testimonials).set({ quote, attribution, status }).where(eq(s.testimonials.id, input.id));
  await audit(tx, {
    actor: by,
    action: old.status !== status ? (input.live ? 'Published testimonial' : 'Unpublished testimonial') : 'Edited testimonial',
    entity: 'testimonial',
    entityId: input.id,
    target: attribution,
    ...diff({ quote: old.quote, attribution: old.attribution, status: old.status }, { quote, attribution, status }),
  });
}

export async function setTestimonialLive(tx: AnyDb, by: Who, id: string, live: boolean) {
  const [old] = await tx.select().from(s.testimonials).where(eq(s.testimonials.id, id));
  if (!old) throw new AdminError('That testimonial was removed.');
  await saveTestimonial(tx, by, { id, quote: old.quote, from: old.attribution, live });
  return old.attribution;
}

export async function deleteTestimonial(tx: AnyDb, by: Who, id: string) {
  const [row] = await tx.delete(s.testimonials).where(eq(s.testimonials.id, id)).returning();
  if (!row) throw new AdminError('That testimonial was already removed.');
  await audit(tx, {
    actor: by,
    action: 'Deleted testimonial',
    entity: 'testimonial',
    entityId: id,
    target: row.attribution,
    before: { quote: row.quote },
  });
}

/** Only the fields present in `patch` change; the form sends just what was edited. */
export async function saveVenueText(
  tx: AnyDb,
  by: Who,
  slug: string,
  patch: { name?: string; label?: string; description?: string; min?: number | null; max?: number | null },
) {
  const [old] = await tx.select().from(s.venues).where(eq(s.venues.slug, slug));
  if (!old) throw new AdminError('That venue doesn’t exist.');
  const next = {
    name: patch.name?.trim().slice(0, 60) || old.name,
    label: patch.label === undefined ? old.label : patch.label.trim().slice(0, 60),
    description: patch.description === undefined ? old.description : patch.description.trim().slice(0, 1200),
    capacityMin: patch.min === undefined ? old.capacityMin : patch.min,
    capacityMax: patch.max === undefined ? old.capacityMax : patch.max,
  };
  if (next.capacityMin != null && next.capacityMax != null && next.capacityMin > next.capacityMax)
    throw new AdminError('The smallest number of guests is above the largest.', { min: 'Must be below the maximum.' });
  await tx.update(s.venues).set(next).where(eq(s.venues.slug, slug));
  await audit(tx, {
    actor: by,
    action: 'Edited venue',
    entity: 'venue',
    entityId: old.id,
    target: next.name,
    ...diff(
      { name: old.name, label: old.label, description: old.description, capacityMin: old.capacityMin, capacityMax: old.capacityMax },
      next,
    ),
  });
}

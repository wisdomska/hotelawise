'use server';
// Content › photos, gallery, copy, venues, FAQ, testimonials and the banner.
import { z } from 'zod';
import { done } from '@/lib/admin/result';
import { act, read } from '@/server/admin/act';
import { signUpload } from '@/server/admin/cloudinary';
import {
  addGalleryPhotos,
  CATEGORIES,
  deleteFaq,
  deleteGalleryItem,
  deleteTestimonial,
  moveItem,
  saveCopy,
  saveFaq,
  saveTestimonial,
  saveVenueText,
  setSlotPhoto,
  setTestimonialLive,
  updateGalleryItem,
} from '@/server/admin/content';
import { BANNER_KEYS, saveSettings } from '@/server/admin/settings';

const uuid = z.string().uuid();
const SITE = { site: true } as const;

export async function signPhotoUpload(area: 'photos' | 'gallery') {
  return read('content.edit', () => signUpload(z.enum(['photos', 'gallery']).parse(area)));
}

export async function saveCopyAction(section: string, patch: Record<string, string | boolean>) {
  const p = z.record(z.string().max(80), z.string().max(4000)).parse(patch);
  return act(
    'content.edit',
    async (tx, who) => {
      await saveCopy(tx, who, section.slice(0, 60), p);
      return done(`${section} saved.`, 'Live on the website now.');
    },
    SITE,
  );
}

export async function saveBannerAction(patch: Record<string, string | boolean>) {
  return act(
    'content.edit',
    async (tx, who) => {
      await saveSettings(tx, who, 'Announcement banner', patch, BANNER_KEYS);
      return done('Announcement banner saved.', 'Live on the website now.');
    },
    SITE,
  );
}

export async function setSlotAction(slot: string, imageId: string | null, label: string) {
  return act(
    'content.edit',
    async (tx, who) => {
      await setSlotPhoto(tx, who, z.string().max(40).parse(slot), imageId === null ? null : z.string().max(200).parse(imageId));
      return done(imageId ? 'Photo replaced.' : 'Original photo back.', `${label.slice(0, 60)} · live on the website now.`);
    },
    SITE,
  );
}

export async function addGalleryAction(ids: string[]) {
  const list = z.array(z.string().max(200)).max(30).parse(ids);
  return act(
    'content.edit',
    async (tx, who) => {
      await addGalleryPhotos(tx, who, list);
      return done(`${list.length} photo${list.length > 1 ? 's' : ''} uploaded.`, 'Add alt text to publish them on the site.');
    },
    SITE,
  );
}

export async function saveGalleryAction(id: string, patch: { alt: string; category: string; published: boolean }) {
  const p = z.object({ alt: z.string().max(300), category: z.enum(CATEGORIES), published: z.boolean() }).parse(patch);
  return act(
    'content.edit',
    async (tx, who) => {
      await updateGalleryItem(tx, who, uuid.parse(id), p);
      return done('Photo saved.', p.published ? 'Showing in the gallery.' : 'Hidden from the gallery.');
    },
    SITE,
  );
}

export async function deleteGalleryAction(id: string) {
  return act(
    'content.delete',
    async (tx, who) => {
      await deleteGalleryItem(tx, who, uuid.parse(id));
      return done('Photo deleted.');
    },
    SITE,
  );
}

export async function moveAction(kind: 'faq' | 'testimonial' | 'gallery', id: string, dir: -1 | 1) {
  const k = z.enum(['faq', 'testimonial', 'gallery']).parse(kind);
  return act(
    'content.edit',
    async (tx, who) => {
      const moved = await moveItem(tx, who, k, uuid.parse(id), dir < 0 ? -1 : 1);
      return done(moved ? 'Order saved.' : dir < 0 ? 'Already at the top.' : 'Already at the bottom.');
    },
    SITE,
  );
}

export async function saveFaqAction(input: { id: string | null; q: string; a: string; published: boolean }) {
  const p = z.object({ id: uuid.nullable(), q: z.string().max(400), a: z.string().max(4000), published: z.boolean() }).parse(input);
  return act(
    'content.edit',
    async (tx, who) => {
      const { created } = await saveFaq(tx, who, p);
      return done(created ? 'Question added.' : 'Question saved.', p.published ? 'Live on the Contact page.' : 'Saved as hidden.');
    },
    SITE,
  );
}

export async function deleteFaqAction(id: string) {
  return act(
    'content.delete',
    async (tx, who) => {
      await deleteFaq(tx, who, uuid.parse(id));
      return done('Question deleted.');
    },
    SITE,
  );
}

export async function saveTestimonialAction(input: { id: string | null; quote: string; from: string; live: boolean }) {
  const p = z.object({ id: uuid.nullable(), quote: z.string().max(800), from: z.string().max(200), live: z.boolean() }).parse(input);
  return act(
    'content.edit',
    async (tx, who) => {
      await saveTestimonial(tx, who, p);
      return done(p.id ? 'Testimonial saved.' : 'Testimonial added.', p.live ? 'Live on the home page.' : 'Saved as a draft.');
    },
    SITE,
  );
}

export async function testimonialLiveAction(id: string, live: boolean) {
  return act(
    'content.edit',
    async (tx, who) => {
      const from = await setTestimonialLive(tx, who, uuid.parse(id), !!live);
      return done(live ? 'Testimonial published.' : 'Testimonial unpublished.', from);
    },
    SITE,
  );
}

export async function deleteTestimonialAction(id: string) {
  return act(
    'content.delete',
    async (tx, who) => {
      await deleteTestimonial(tx, who, uuid.parse(id));
      return done('Testimonial deleted.');
    },
    SITE,
  );
}

const guests = (v: string | boolean | undefined, field: string) => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 5000) throw Object.assign(new Error('guests'), { field });
  return n;
};

export async function saveVenueAction(slug: string, patch: Record<string, string | boolean>) {
  const s = z.enum(['compound', 'conference']).parse(slug);
  let min: number | null, max: number | null;
  try {
    min = guests(patch.min, 'min');
    max = guests(patch.max, 'max');
  } catch (e) {
    const f = (e as { field?: string }).field ?? 'min';
    return {
      ok: false as const,
      error: 'Check the highlighted fields.',
      fields: { [f]: 'Enter a whole number of guests, or leave it blank.' },
    };
  }
  const str = (k: string) => (k in patch ? String(patch[k]) : undefined);
  return act(
    'content.edit',
    async (tx, who) => {
      await saveVenueText(tx, who, s, {
        name: str('name'),
        label: str('label'),
        description: str('description'),
        min: 'min' in patch ? min : undefined,
        max: 'max' in patch ? max : undefined,
      });
      return done('Venue saved.', 'Live on the home page and the Venues page.');
    },
    SITE,
  );
}

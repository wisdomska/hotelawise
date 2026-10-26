'use client';
// Gallery (Website.dc.html › GALLERY): category chips with counts, a masonry of
// photos twelve at a time, and the lightbox over the current set.
import { useState } from 'react';
import { IMAGE_SIZES } from '@/server/content/image-sizes';
import type { SiteGalleryItem } from '@/server/content/site-data';
import { Lightbox } from './lightbox';
import { Chip } from './rooms-filter';
import { SiteImage } from './site-image';

const CATS = ['All', 'Rooms', 'Bathrooms', 'Spaces', 'Events'] as const;
const PAGE = 12;

export function GalleryGrid({ items }: { items: SiteGalleryItem[] }) {
  const [cat, setCat] = useState<(typeof CATS)[number]>('All');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const list = items.filter((g) => cat === 'All' || g.category === cat);
  const visible = list.slice(0, shown);
  return (
    <>
      <div role="group" aria-label="Filter photos" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {CATS.map((c) => (
          <Chip
            key={c}
            active={cat === c}
            onClick={() => {
              setCat(c);
              setShown(PAGE);
            }}
          >
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {c}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.6 }}>
                {c === 'All' ? items.length : items.filter((g) => g.category === c).length}
              </span>
            </span>
          </Chip>
        ))}
      </div>
      {list.length === 0 && (
        <div style={{ padding: '64px 24px', border: '1px dashed rgba(0,0,99,0.3)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 28 }}>No photos in this set yet. The camera&apos;s charging.</p>
        </div>
      )}
      <div data-stagger="" style={{ columnCount: 'var(--gcols)' as unknown as number, columnGap: 12 }}>
        {visible.map((g, i) => {
          const [w, h] = IMAGE_SIZES[g.image.id] ?? [1200, 900];
          return (
            <figure key={`${g.image.id}-${i}`} style={{ margin: '0 0 12px', breakInside: 'avoid' }}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Open photo: ${g.image.alt}`}
                className="aw-gal-tile"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 0,
                  border: 'none',
                  background: '#F6E2B3',
                  borderRadius: 16,
                  overflow: 'hidden',
                  cursor: 'zoom-in',
                }}
              >
                <SiteImage
                  image={g.image}
                  width={w}
                  height={h}
                  sizes="(min-width: 640px) 33vw, 50vw"
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </button>
              <figcaption
                style={{
                  marginTop: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(0,0,58,0.6)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>{g.image.alt}</span>
                <span>{g.category}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {list.length > shown && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 28 }}>
          <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.62)' }}>
            Showing {Math.min(list.length, shown)} of {list.length} photos
          </span>
          <button
            type="button"
            data-mi-btn="ghost"
            onClick={() => setShown((n) => n + PAGE)}
            style={{
              height: 46,
              padding: '0 20px',
              borderRadius: 10,
              border: '1px solid #000063',
              background: 'transparent',
              color: '#000063',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Show more photos
          </button>
        </div>
      )}
      {open !== null && <Lightbox images={list.map((g) => g.image)} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

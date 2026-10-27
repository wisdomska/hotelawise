'use client';
// Room page photo grid: the main photo and up to three thumbnails, each opening
// the lightbox at that photo. Thumbnails hide on phones (prototype --db).
import { useState } from 'react';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import { Lightbox } from '../lightbox';
import { SiteImage } from '../site-image';

const tile: React.CSSProperties = {
  position: 'relative',
  padding: 0,
  border: 'none',
  background: '#F6E2B3',
  borderRadius: 16,
  overflow: 'hidden',
  cursor: 'zoom-in',
};

export function RoomGallery({ images }: { images: SiteImageT[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const thumbs = images.slice(1, 4);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-gal)', gridAutoRows: '1fr', gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen(0)}
          aria-label="Open photo gallery"
          style={{ ...tile, aspectRatio: '4/3', gridRow: `span ${Math.max(1, thumbs.length)}` }}
        >
          <SiteImage
            image={images[0]!}
            fill
            preload
            fetchPriority="high"
            loading="eager"
            sizes="(min-width: 1024px) 50vw, 100vw"
            style={{ objectFit: 'cover' }}
          />
        </button>
        {thumbs.map((img, i) => (
          <button
            key={img.id + i}
            type="button"
            onClick={() => setOpen(i + 1)}
            aria-label={img.alt}
            className="aw-room-thumb"
            style={{ ...tile, minHeight: 90 }}
          >
            <SiteImage image={img} alt="" fill sizes="(min-width: 1024px) 17vw, 33vw" style={{ objectFit: 'cover' }} />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

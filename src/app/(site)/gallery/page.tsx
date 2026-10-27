// Gallery (Website.dc.html › GALLERY).
import type { Metadata } from 'next';
import { GalleryGrid } from '@/components/site/gallery-grid';
import { getSiteData } from '@/server/content/site-data';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Real photos of Hotel A-Wise: rooms, bathrooms, porches, the conference room and the event compound in New Asofan, Accra.',
  alternates: { canonical: '/gallery' },
};

export const revalidate = 300;

export default async function GalleryPage() {
  const data = await getSiteData();
  return (
    <main id="main" style={{ paddingTop: 84 }}>
      <section data-screen-label="Gallery" style={{ padding: 'calc(var(--sy) * 0.6) var(--pad) var(--sy)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--c2)', gap: 32, alignItems: 'end', marginBottom: 32 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontWeight: 400,
              fontSize: 'var(--h1)',
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
            }}
          >
            Look around<em style={{ fontWeight: 300 }}>.</em>
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>{data.content['pages.galleryIntro']}</p>
        </div>
        <GalleryGrid items={data.gallery} />
      </section>
    </main>
  );
}

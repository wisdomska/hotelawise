'use client';
// "What's here": eight facility tiles; hovering or focusing one swaps the photo.
import { useState } from 'react';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import { SiteImage } from '../site-image';

const ICONS: AnyIconName[] = ['bell', 'coffee', 'utensils', 'sun', 'sofa', 'presentation', 'tent', 'bath'];

export function WhatsHere({ heading, tiles }: { heading: string; tiles: { title: string; image: SiteImageT }[] }) {
  const [active, setActive] = useState(0);
  const current = tiles[active] ?? tiles[0];
  return (
    <section data-screen-label="Home · What's here" style={{ padding: '0 var(--pad) var(--sy)' }}>
      <h2
        style={{
          margin: '0 0 var(--hmb)',
          paddingTop: 24,
          borderTop: '1px solid rgba(0,0,99,0.16)',
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 'var(--h2s)',
          lineHeight: 1.08,
          letterSpacing: '-0.04em',
        }}
      >
        {heading}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c55)', gap: 56 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
          {/* The prototype keeps an (empty) intro block here, which offsets the tiles by one gap. */}
          <div aria-hidden="true" />
          <ol
            data-stagger=""
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}
          >
            {tiles.map((t, i) => (
              <li
                key={t.title}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                tabIndex={0}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: 16,
                  borderRadius: 20,
                  background: '#FFFFFF',
                  border: '1px solid rgba(0,0,99,0.1)',
                  cursor: 'default',
                  opacity: i === active ? 1 : 0.62,
                  transition: 'opacity 200ms var(--ease-enter)',
                }}
              >
                <span
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: '#F6E2B3',
                    color: '#000063',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={ICONS[i] ?? 'star'} size={24} />
                </span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--fac-t)', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                  {t.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <figure className="hidden desk:block" style={{ margin: 0, position: 'sticky', top: 96, alignSelf: 'start' }}>
          <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', borderRadius: 16, background: '#F6E2B3' }}>
            {current && (
              <SiteImage
                key={current.image.id}
                image={current.image}
                fill
                sizes="(min-width: 1024px) 45vw, 0px"
                style={{ objectFit: 'cover', animation: 'aw-fade 240ms var(--ease-enter)' }}
              />
            )}
          </div>
        </figure>
      </div>
    </section>
  );
}

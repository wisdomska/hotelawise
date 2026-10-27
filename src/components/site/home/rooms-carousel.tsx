'use client';
// The home rooms strip. Below 1024px it is a swipeable carousel: cards run to the
// screen edge with the next one peeking, and a dot for each room plus previous and
// next buttons show where you are. From 1024px it is a plain four-column grid.
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

export function RoomsCarousel({ names, children }: { names: string[]; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = Children.count(children);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = [...el.children] as HTMLElement[];
        const left = el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).scrollPaddingLeft || '0');
        let best = 0;
        cards.forEach((c, i) => {
          if (Math.abs(c.getBoundingClientRect().left - left) < Math.abs(cards[best]!.getBoundingClientRect().left - left)) best = i;
        });
        // At the end of the strip the last card can't reach the start edge.
        setActive(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 ? cards.length - 1 : best);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      left: card.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || '0'),
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  const arrow: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid rgba(0,0,99,0.3)',
    background: 'transparent',
    color: '#000063',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Rooms">
      <div
        ref={track}
        data-stagger=""
        className="aw-carousel"
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--c4)',
          gap: 'clamp(16px,2vw,28px)',
          position: 'relative',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingBlock: '4px 8px',
        }}
      >
        {children}
      </div>
      <div className="flex desk:hidden" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {names.slice(0, count).map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${name}, room ${i + 1} of ${count}`}
              aria-current={i === active ? 'true' : undefined}
              className="aw-press"
              style={{
                width: 24,
                height: 24,
                padding: 0,
                border: 0,
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  height: 6,
                  width: i === active ? 20 : 6,
                  borderRadius: 999,
                  background: i === active ? '#000063' : 'rgba(0,0,99,0.28)',
                  transition: 'width 300ms cubic-bezier(0.23,1,0.32,1), background 300ms',
                }}
              />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="aw-press"
            aria-label="Previous room"
            disabled={active === 0}
            onClick={() => go(active - 1)}
            style={{ ...arrow, opacity: active === 0 ? 0.35 : 1 }}
          >
            <Icon name="chevleft" size={18} />
          </button>
          <button
            type="button"
            className="aw-press"
            aria-label="Next room"
            disabled={active === count - 1}
            onClick={() => go(active + 1)}
            style={{ ...arrow, opacity: active === count - 1 ? 0.35 : 1 }}
          >
            <Icon name="chevright" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

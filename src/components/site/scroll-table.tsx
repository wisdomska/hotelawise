'use client';
// A wide table that scrolls sideways on small screens. Instead of a scrollbar or a
// "scroll sideways" note, the edge that hides more columns fades out, the first
// column stays put, and previous/next buttons appear only while there is more to see.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

export function ScrollTable({ heading, label, children }: { heading: ReactNode; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, []);

  const step = (dir: 1 | -1) => {
    const el = box.current;
    if (!el) return;
    // One room column at a time: the first column (row labels) never moves.
    const col = el.querySelector<HTMLElement>('thead th:nth-child(2)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * (col?.offsetWidth ?? el.clientWidth / 2), behavior: reduce ? 'auto' : 'smooth' });
  };

  const arrow = (on: boolean): React.CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid rgba(0,0,99,0.3)',
    background: 'transparent',
    color: '#000063',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: on ? 1 : 0.35,
  });
  const scrollable = edges.start || edges.end;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, minHeight: 40 }}>
        {heading}
        {scrollable && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="aw-press"
              aria-label="Show earlier rooms"
              disabled={!edges.start}
              onClick={() => step(-1)}
              style={arrow(edges.start)}
            >
              <Icon name="chevleft" size={16} />
            </button>
            <button
              type="button"
              className="aw-press"
              aria-label="Show more rooms"
              disabled={!edges.end}
              onClick={() => step(1)}
              style={arrow(edges.end)}
            >
              <Icon name="chevright" size={16} />
            </button>
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={box} className="aw-scroll-table" tabIndex={0} role="region" aria-label={label}>
          {children}
        </div>
        <span aria-hidden="true" className="aw-scroll-fade" data-side="end" data-on={edges.end || undefined} />
      </div>
    </>
  );
}

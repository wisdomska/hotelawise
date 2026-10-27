'use client';
// Rooms list with guest and budget filters (Website.dc.html › ROOMS).
import { useId, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import type { SiteImage as SiteImageT, SiteRoom } from '@/server/content/site-data';
import { KeyCard } from './key-card';

const GUESTS = [
  ['any', 'Any'],
  ['2', '1–2'],
  ['4', '3–4'],
] as const;
const BUDGETS = [
  ['any', 'Any'],
  ['200', '≤ 200'],
  ['300', '≤ 300'],
  ['400', '≤ 400'],
] as const;

const label: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(0,0,58,0.6)',
  marginRight: 6,
};

export function Chip({
  active,
  onClick,
  mono,
  children,
}: {
  active: boolean;
  onClick: () => void;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-mi-btn="chip"
      style={{
        height: 'max(36px, var(--tap-min, 0px))',
        padding: '0 14px',
        borderRadius: 999,
        border: `1px solid ${active ? '#000063' : 'rgba(0,0,99,0.25)'}`,
        background: active ? '#000063' : 'transparent',
        color: active ? '#F5F2EA' : '#00003A',
        fontSize: 13,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}
    >
      {children}
    </button>
  );
}

export function RoomsFilter({
  rooms,
  images,
  left,
  tel,
}: {
  rooms: SiteRoom[];
  images: Record<string, SiteImageT>;
  left: Record<string, number>;
  tel: string;
}) {
  const [guests, setGuests] = useState<(typeof GUESTS)[number][0]>('any');
  const [budget, setBudget] = useState<(typeof BUDGETS)[number][0]>('any');
  // Below 1024px the chips fold behind a Filters button so the rooms stay in view.
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const activeCount = (guests !== 'any' ? 1 : 0) + (budget !== 'any' ? 1 : 0);
  const filtered = rooms.filter(
    (r) => (guests === 'any' || guests === '2' || r.sleeps >= 3) && (budget === 'any' || r.from <= Number(budget) * 100),
  );
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: '16px 24px',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '14px 0',
          borderTop: '1px solid rgba(0,0,99,0.16)',
          borderBottom: '1px solid rgba(0,0,99,0.16)',
          marginBottom: 32,
        }}
      >
        <button
          type="button"
          className="aw-press inline-flex desk:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          style={{
            alignItems: 'center',
            gap: 8,
            height: 44,
            padding: '0 16px',
            borderRadius: 999,
            border: `1px solid ${activeCount ? '#000063' : 'rgba(0,0,99,0.25)'}`,
            background: activeCount ? '#000063' : 'transparent',
            color: activeCount ? '#F5F2EA' : '#00003A',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Icon name="sliders" size={16} />
          Filters{activeCount ? ` · ${activeCount}` : ''}
          <Icon
            name="chevright"
            size={14}
            style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 200ms' }}
          />
        </button>
        {/* One count for every width; from 1024px it moves to the end of the row. */}
        <span
          className="aw-filter-count"
          aria-live="polite"
          style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.6)' }}
        >
          {filtered.length} of {rooms.length} room types
        </span>
        <div id={panelId} className={open ? 'aw-filter-panel is-open' : 'aw-filter-panel'}>
          <div role="group" aria-label="Guests" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={label}>Guests</span>
            {GUESTS.map(([v, l]) => (
              <Chip key={v} active={guests === v} onClick={() => setGuests(v)}>
                {l}
              </Chip>
            ))}
          </div>
          <div role="group" aria-label="Budget" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={label}>Budget / night</span>
            {BUDGETS.map(([v, l]) => (
              <Chip key={v} mono active={budget === v} onClick={() => setBudget(v)}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '64px 24px',
            border: '1px dashed rgba(0,0,99,0.3)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 14,
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>0 ROOMS MATCH</span>
          <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1.1 }}>
            Nothing fits that combination. Loosen the budget a little, or call us and we&apos;ll work something out.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-mi-btn="fill"
              onClick={() => {
                setGuests('any');
                setBudget('any');
              }}
              style={{
                height: 44,
                padding: '0 18px',
                borderRadius: 10,
                border: 'none',
                background: '#000063',
                color: '#F5F2EA',
                fontSize: 14,
              }}
            >
              Clear filters
            </button>
            <a
              href={tel}
              data-mi-btn="ghost"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 44,
                padding: '0 18px',
                borderRadius: 10,
                border: '1px solid #000063',
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              Call reception
            </a>
          </div>
        </div>
      ) : (
        // A wide gap between rows so each name and price clearly belongs to the photo above it.
        <div data-stagger="" style={{ display: 'grid', gridTemplateColumns: 'var(--c4g)', gap: '56px clamp(16px,2vw,28px)' }}>
          {filtered.map((room, i) => (
            <KeyCard
              key={room.code}
              first={i === 0}
              room={room}
              image={images[room.code]!}
              left={left[room.code]}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            />
          ))}
        </div>
      )}
    </>
  );
}

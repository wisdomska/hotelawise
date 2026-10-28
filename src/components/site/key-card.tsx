// The room card styled as a brass key fob (Handoff: KeyCard). Used on the home
// strip, the rooms list, similar rooms and the 404 page.
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { formatGhs } from '@/lib/money';
import type { SiteRoom, SiteImage as SiteImageT } from '@/server/content/site-data';
import { SiteImage } from './site-image';

export function priceLabel(room: SiteRoom): string {
  return room.variants.map((v) => formatGhs(v.price, { prefix: false })).join(' / ');
}

function roomRange(numbers: string[]): string {
  if (!numbers.length) return '';
  const sorted = [...numbers].sort();
  return sorted.length === 1 ? sorted[0]! : `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

// Only "Sold out tonight" is shown: the owner doesn't show how many rooms are left (D-55).
export function leftLabel(left: number | undefined): string | null {
  return left === 0 ? 'Sold out tonight' : null;
}

export function KeyCard({
  room,
  image,
  left,
  sizes,
  first,
}: {
  room: SiteRoom;
  image: SiteImageT;
  left?: number;
  sizes: string;
  /** The first card is usually the biggest thing on a phone screen: load it straight away. */
  first?: boolean;
}) {
  const label = leftLabel(left);
  const price = priceLabel(room);
  return (
    <Link
      data-mi-card=""
      href={`/rooms/${room.code.toLowerCase()}`}
      className="aw-keycard"
      style={{
        scrollSnapAlign: 'start',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 0,
        color: '#00003A',
        textDecoration: 'none',
        opacity: left === 0 ? 0.6 : 1,
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', borderRadius: 16, background: '#F6E2B3' }}>
        <SiteImage
          data-mi-img=""
          image={image}
          fill
          sizes={sizes}
          {...(first ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {})}
          grade={false}
          style={{ objectFit: 'cover', filter: 'saturate(0.95) contrast(1.03)' }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 'auto 0 0 0',
            height: '40%',
            background: 'linear-gradient(180deg,rgba(20,16,10,0) 0%,rgba(20,16,10,0.55) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          data-mi-tag=""
          style={{
            position: 'absolute',
            top: 0,
            left: 22,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transformOrigin: '50% 0',
          }}
        >
          <span style={{ width: 1, height: 22, background: 'rgba(245,242,234,0.9)' }} />
          <span
            style={{
              width: 58,
              padding: '10px 0 12px',
              borderRadius: '8px 8px 14px 14px',
              background: '#F5F2EA',
              color: '#000063',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 10px 22px -10px rgba(0,0,0,0.55)',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'transparent',
                boxShadow: 'inset 0 0 0 1.5px rgba(0,0,99,0.45)',
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, letterSpacing: '0.04em' }}>{room.code}</span>
            <span style={{ width: 24, height: 1, background: 'rgba(0,0,99,0.25)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', opacity: 0.7 }}>
              {roomRange(room.roomNumbers)}
            </span>
          </span>
        </div>
        {label && (
          <span
            style={{
              position: 'absolute',
              left: 14,
              bottom: 14,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              color: '#F5F2EA',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, lineHeight: 1, letterSpacing: '-0.05em' }}>{room.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'nowrap' }}>
          GHS {price}
          <span style={{ color: 'rgba(0,0,58,0.66)' }}> /night</span>
        </span>
      </div>
      <span style={{ marginTop: -6, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'rgba(0,0,58,0.68)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="bed" size={16} />
          {room.beds}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="users" size={16} />
          {room.sleeps} guests
        </span>
      </span>
    </Link>
  );
}

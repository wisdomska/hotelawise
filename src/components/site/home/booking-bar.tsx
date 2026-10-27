'use client';
// The hero's booking bar: Stay (dates + guests → /book) and Rent for an event
// (event date → /rent), with the prototype's sliding tab indicator.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { addDays, nightsBetween, todayInAccra, type IsoDate } from '@/lib/dates';

const EASE = 'cubic-bezier(0.23,1,0.32,1)';

export function BookingBar() {
  const router = useRouter();
  const today = useMemo(() => todayInAccra(), []);
  const [tab, setTab] = useState<'stay' | 'rent'>('stay');
  const [ci, setCi] = useState<IsoDate>(today);
  const [co, setCo] = useState<IsoDate>(addDays(today, 2));
  const [guests, setGuests] = useState(2);
  const [rentDate, setRentDate] = useState<IsoDate>(addDays(today, 7));
  const [error, setError] = useState<string | null>(null);
  const nights = nightsBetween(ci, co);
  // The bar straddles the hero's bottom edge: half over the photo, half over the next
  // section. Its height (which changes with the width and the tab) sets how far both move.
  const bar = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--bar-h', `${Math.round(el.offsetHeight)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--bar-h');
    };
  }, []);
  const tapBtn: React.CSSProperties = {
    width: 'max(32px, var(--tap-min, 0px))',
    height: 'max(32px, var(--tap-min, 0px))',
    borderRadius: 8,
    border: '1px solid var(--hl)',
    background: 'transparent',
    fontSize: 18,
    lineHeight: 1,
  };

  return (
    <form
      aria-label="Check availability"
      onSubmit={(e) => {
        e.preventDefault();
        if (nights < 1) return setError('Pick a check-out date after your check-in.');
        router.push(`/book?ci=${ci}&co=${co}&g=${guests}`);
      }}
      ref={bar}
      className="aw-bar"
      style={
        {
          position: 'relative',
          zIndex: 3,
          marginTop: 'var(--bar-mt)',
          marginBottom: 'calc(var(--bar-h) / -2)',
          '--hcard': 'rgba(255,255,255,0.55)',
          '--hf': '#00003A',
          '--hs': 'rgba(0,0,58,0.66)',
          '--hl': 'rgba(255,255,255,0.35)',
          background: 'rgba(245,242,234,0.42)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
          backdropFilter: 'blur(22px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,0.45)',
          color: '#00003A',
          borderRadius: 14,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxShadow: '0 30px 60px -30px rgba(0,0,0,0.6)',
        } as React.CSSProperties
      }
    >
      <div
        role="tablist"
        className="aw-bar-tabs"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          maxWidth: '100%',
          padding: 4,
          borderRadius: 12,
          background: 'rgba(0,0,99,0.07)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 4,
            width: 'calc(50% - 4px)',
            borderRadius: 9,
            background: '#FFFFFF',
            boxShadow: '0 1px 2px rgba(0,0,58,0.08),0 4px 12px -4px rgba(0,0,58,0.18)',
            transform: `translateX(${tab === 'rent' ? '100%' : '0%'})`,
            transition: `transform 320ms ${EASE}`,
          }}
        />
        {(['stay', 'rent'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="aw-press"
            style={{
              position: 'relative',
              height: 'max(38px, var(--tap-min, 0px))',
              padding: '0 18px',
              border: 'none',
              borderRadius: 9,
              background: 'transparent',
              color: '#00003A',
              fontSize: 14,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              opacity: tab === t ? 1 : 0.6,
              transition: `opacity 200ms ease, transform 150ms ${EASE}`,
            }}
          >
            {t === 'stay' ? 'Stay' : 'Rent for an event'}
          </button>
        ))}
      </div>

      {tab === 'stay' ? (
        <>
          <div
            className="aw-bar-grid"
            style={{
              animation: `aw-fade 260ms ${EASE}`,
              display: 'grid',
              gap: 1,
              background: 'var(--hl)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div style={{ background: 'var(--hcard)', padding: '12px 16px' }}>
              <DatePicker
                variant="bare"
                icon="calendar"
                label="Check-in"
                value={ci}
                min={today}
                rangeStart={ci}
                rangeEnd={co}
                onChange={(v) => {
                  setCi(v);
                  setError(null);
                  if (nightsBetween(v, co) < 1) setCo(addDays(v, 1));
                }}
              />
            </div>
            <div style={{ background: 'var(--hcard)', padding: '12px 16px' }}>
              <DatePicker
                variant="bare"
                icon="calendar"
                label="Check-out"
                value={co}
                min={addDays(ci, 1)}
                rangeStart={ci}
                rangeEnd={co}
                onChange={(v) => {
                  setCo(v);
                  setError(null);
                }}
              />
            </div>
            <div className="aw-bar-guests" style={{ background: 'var(--hcard)', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--hs)',
                }}
              >
                <Icon name="users" size={14} />
                Guests
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button type="button" aria-label="Fewer guests" onClick={() => setGuests((g) => Math.max(1, g - 1))} style={tapBtn}>
                  −
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, minWidth: 16, textAlign: 'center' }} aria-live="polite">
                  {guests}
                </span>
                <button type="button" aria-label="More guests" onClick={() => setGuests((g) => Math.min(8, g + 1))} style={tapBtn}>
                  +
                </button>
              </div>
            </div>
            <div className="aw-bar-span" style={{ background: 'var(--hcard)', padding: 10, display: 'flex', alignItems: 'stretch' }}>
              <button
                type="submit"
                data-mi-btn="fill"
                style={{
                  flex: 1,
                  minHeight: 52,
                  padding: '0 22px',
                  whiteSpace: 'nowrap',
                  border: 'none',
                  borderRadius: 8,
                  background: '#000063',
                  color: '#F5F2EA',
                  fontWeight: 600,
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <span>Check availability</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                  {nights >= 1 ? `${nights} night${nights === 1 ? '' : 's'}` : '—'}
                </span>
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" style={{ margin: '4px 8px 6px', fontSize: 13, color: '#B42318' }}>
              {error}
            </p>
          )}
        </>
      ) : (
        <div
          className="aw-bar-grid2"
          style={{
            animation: `aw-fade 260ms ${EASE}`,
            display: 'grid',
            gap: 1,
            background: 'var(--hl)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div style={{ background: 'var(--hcard)', padding: '12px 16px' }}>
            <DatePicker variant="bare" icon="calendar" label="Event date" value={rentDate} min={today} onChange={setRentDate} />
          </div>
          <div
            className="hidden desk:flex"
            style={{ background: 'var(--hcard)', padding: '12px 16px', alignItems: 'center', fontSize: 14, color: 'var(--hs)' }}
          >
            Canopies, long and short tables, foldable and regular chairs. Reserve online, collect from Wisepak Lane.
          </div>
          <div style={{ background: 'var(--hcard)', padding: 10, display: 'flex' }}>
            <Link
              href={`/rent?date=${rentDate}`}
              data-mi-btn="fill"
              style={{
                flex: 1,
                minHeight: 52,
                padding: '0 22px',
                borderRadius: 8,
                background: '#000063',
                color: '#F5F2EA',
                fontWeight: 600,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textDecoration: 'none',
                gap: 16,
              }}
            >
              Browse rentals <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      )}
    </form>
  );
}

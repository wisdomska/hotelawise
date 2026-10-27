// Home (Website.dc.html › HOME): hero with booking bar, rooms key-card strip,
// What's here, rentals, events, testimonial and getting here.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { BookingBar } from '@/components/site/home/booking-bar';
import { RoomsCarousel } from '@/components/site/home/rooms-carousel';
import { WhatsHere } from '@/components/site/home/whats-here';
import { JsonLd } from '@/components/site/json-ld';
import { KeyCard } from '@/components/site/key-card';
import { SiteImage } from '@/components/site/site-image';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { formatGhs } from '@/lib/money';
import { leftTonight } from '@/server/content/availability';
import { contactFrom } from '@/server/content/contact';
import { hotelJsonLd, shareImage } from '@/server/content/seo';
import { getSiteData } from '@/server/content/site-data';

export const revalidate = 300;

const h2: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-serif)',
  fontWeight: 400,
  fontSize: 'var(--h2s)',
  lineHeight: 1.08,
  letterSpacing: '-0.04em',
};
const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  padding: '0 14px 0 8px',
  borderRadius: 999,
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,99,0.1)',
  fontSize: 13.5,
  whiteSpace: 'nowrap',
};
const chipIcon: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: '#F6E2B3',
  color: '#000063',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const IN_EVERY_ROOM: [AnyIconName, string][] = [
  ['snow', 'AC'],
  ['wifi', 'Wi-Fi'],
  ['tv', 'TV'],
  ['droplets', 'Private bath'],
  ['sparkle', 'Fresh linen'],
];

export async function generateMetadata(): Promise<Metadata> {
  const data = await getSiteData();
  const hero = data.photos.hero;
  return {
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: 'Hotel A-Wise',
      locale: 'en_GH',
      title: 'Hotel A-Wise · Open all night, every night',
      description: data.content['home.heroSub'],
      images: hero ? [shareImage(hero)] : undefined,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function HomePage() {
  const data = await getSiteData();
  const left = await leftTonight(data);
  const contact = contactFrom(data);
  const c = data.content;
  const words = (c['home.heroTitle'] ?? '').trim().split(/\s+/);
  // The title sits on two lines of about equal length: break after the word that makes
  // the longer line as short as possible ("Your Gateway To / Unforgettable Memories").
  const lineLen = (ws: string[]) => ws.join(' ').length;
  const breakAt =
    words.length < 2
      ? -1
      : words.slice(1).reduce((best, _, k) => {
          const i = k + 1;
          const worst = Math.max(lineLen(words.slice(0, i)), lineLen(words.slice(i)));
          const bestWorst = Math.max(lineLen(words.slice(0, best)), lineLen(words.slice(best)));
          return worst < bestWorst ? i : best;
        }, 1);
  const price = (slug: string) => data.rentals.find((r) => r.slug === slug)?.price;
  const minPrice = (...slugs: string[]) => Math.min(...slugs.map(price).filter((p): p is number => p !== undefined));
  const rentals = [
    { name: 'Canopies', from: price('canopy'), image: data.photos['rental.canopies']!, alt: 'White event canopy' },
    { name: 'Tables', from: minPrice('longtable', 'shorttable'), image: data.photos['rental.tables']!, alt: 'Foldable event table' },
    { name: 'Chairs', from: minPrice('chair', 'foldchair'), image: data.photos['rental.chairs']!, alt: 'Blue foldable chair' },
  ];
  const [compound, conference] = data.venues;

  return (
    <main id="main" style={{ paddingTop: 0 }}>
      <JsonLd data={hotelJsonLd(data)} />
      <section
        data-noreveal=""
        data-screen-label="Home · Hero"
        style={{
          position: 'relative',
          background: '#1A1712',
          color: '#F5F2EA',
          minHeight: 'var(--hero-h)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'var(--hero-jc)',
          padding: 'var(--hero-pt) var(--pad) var(--hero-pb)',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', borderRadius: 'inherit' }}>
          <div data-parallax="0.1" style={{ position: 'absolute', inset: '-6% 0', height: '112%' }}>
            <SiteImage
              image={data.photos.hero!}
              alt=""
              fill
              preload
              fetchPriority="high"
              loading="eager"
              sizes="100vw"
              grade={false}
              style={{ objectFit: 'cover', objectPosition: 'center 55%' }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(20,16,10,0.35) 0%, rgba(20,16,10,0.08) 32%, rgba(20,16,10,0.72) 100%)',
            }}
          />
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <h1
            style={{
              margin: 0,
              // Title case, whatever the CMS text: "Your Gateway To Unforgettable Memories".
              textTransform: 'capitalize',
              fontFamily: 'var(--font-serif)',
              fontWeight: 300,
              fontSize: 'var(--h1)',
              lineHeight: 1.02,
              letterSpacing: '-0.05em',
              textShadow: '0 2px 24px rgba(0,0,0,0.25)',
            }}
          >
            {words.map((w, i) => (
              <Fragment key={`${w}-${i}`}>
                {i === breakAt && <br />}
                <span
                  style={{
                    display: 'inline-block',
                    overflow: 'hidden',
                    verticalAlign: 'top',
                    padding: '0 0.08em 0.1em 0.04em',
                    margin: '0 0 0 -0.04em',
                  }}
                >
                  <span className="aw-rise" style={{ animationDelay: `${i * 45}ms`, fontWeight: 400 }}>
                    {w}
                  </span>
                </span>
                {/* A real space, so the heading reads as words, not one run-together string. */}
                {i < words.length - 1 && i + 1 !== breakAt && ' '}
              </Fragment>
            ))}
          </h1>
          <div className="hidden tab:block" style={{ height: 1, background: 'rgba(245,242,234,0.4)' }} />
          <div className="hidden desk:flex" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, color: 'rgba(245,242,234,0.9)', textWrap: 'pretty' }}>
              {c['home.heroSub']}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <Link
                data-mi-arrow-host=""
                href="/rooms"
                className="aw-press"
                style={{
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 48,
                  padding: '0 6px 0 20px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.14)',
                  WebkitBackdropFilter: 'blur(14px)',
                  backdropFilter: 'blur(14px)',
                  color: '#F5F2EA',
                  textDecoration: 'none',
                  fontSize: 15,
                }}
              >
                View rooms
                <span
                  data-mi-arrow=""
                  aria-hidden="true"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#F5F2EA',
                    color: '#1A1712',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                  }}
                >
                  ↗
                </span>
              </Link>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(245,242,234,0.7)' }}>
                NO. 1 WISEPAK LANE · NEW ASOFAN · ACCRA
              </span>
            </div>
          </div>
        </div>
        <BookingBar />
      </section>

      <section
        data-screen-label="Home · Rooms strip"
        // Extra room on top for the lower half of the booking bar.
        style={{ padding: 'calc(var(--sy) + var(--bar-h) / 2) var(--pad) var(--sy)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--hgap)', marginBottom: 'var(--hmb)' }}>
          <h2 style={h2}>{c['home.roomsHeading']}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div aria-label="In every room" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {IN_EVERY_ROOM.map(([icon, label]) => (
                <span key={label} style={chip}>
                  <span style={chipIcon}>
                    <Icon name={icon} size={15} />
                  </span>
                  {label}
                </span>
              ))}
            </div>
            <Link href="/rooms" style={{ fontSize: 14, fontWeight: 500 }}>
              Compare all rooms <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <RoomsCarousel names={data.rooms.map((r) => r.name)}>
          {data.rooms.map((room) => (
            <KeyCard
              key={room.code}
              room={room}
              image={data.photos[`room.${room.code}`]!}
              left={left[room.code]}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 44vw, 80vw"
            />
          ))}
        </RoomsCarousel>
      </section>

      <WhatsHere
        heading={c['home.overviewHeading'] ?? ''}
        tiles={Array.from({ length: 8 }, (_, i) => ({ title: c[`home.fac.${i}`] ?? '', image: data.photos[`fac.${i}`]! }))}
      />

      <section data-screen-label="Home · Rentals" style={{ background: '#00003A', color: '#F5F2EA', padding: 'var(--sy) var(--pad)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--hgap)', marginBottom: 'var(--hmb)' }}>
          <h2 style={h2}>{c['home.rentalsHeading']}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'rgba(245,242,234,0.78)' }}>{c['home.rentalsSub']}</p>
            <Link href="/rent" style={{ color: '#F5F2EA', fontSize: 14, fontWeight: 500 }}>
              Reserve rentals online <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div data-stagger="" style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}>
          {rentals.map((it) => (
            <Link
              key={it.name}
              data-mi-card=""
              href="/rent"
              className="aw-lift"
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: '#000063',
                borderRadius: 10,
                overflow: 'hidden',
                color: '#F5F2EA',
                textDecoration: 'none',
              }}
            >
              <div style={{ position: 'relative', aspectRatio: '1/1', background: '#F5F2EA' }}>
                <SiteImage
                  data-mi-img=""
                  image={it.image}
                  alt={it.alt}
                  fill
                  sizes="(min-width: 1024px) 30vw, 90vw"
                  grade={false}
                  style={{ objectFit: 'contain', padding: 20, mixBlendMode: 'multiply' }}
                />
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>{it.name}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  <span style={{ opacity: 0.7 }}>from</span>
                  <span
                    style={{ flex: 1, borderBottom: '1.5px dotted rgba(245,242,234,0.35)', margin: '0 8px', transform: 'translateY(-4px)' }}
                  />
                  <span>{it.from !== undefined && Number.isFinite(it.from) ? `${formatGhs(it.from)} / day` : ''}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section data-screen-label="Home · Events">
        <figure style={{ margin: 0, position: 'relative' }}>
          <div style={{ position: 'relative', height: 'var(--ev-h)', overflow: 'hidden', background: '#000063' }}>
            <SiteImage
              image={data.photos.events!}
              alt="Wedding ceremony in the A-Wise compound: white aisle, flowers, rows of blue chairs under white canopies"
              fill
              sizes="100vw"
              grade={false}
              style={{ objectFit: 'cover', objectPosition: 'center 40%', filter: 'saturate(0.9) contrast(1.05)' }}
            />
          </div>
        </figure>
        <div style={{ padding: '56px var(--pad) var(--sy)', display: 'flex', flexDirection: 'column', gap: 'var(--hgap)' }}>
          <h2 style={h2}>{c['home.spacesHeading']}</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              {
                v: compound,
                icon: 'tent' as const,
                capIcon: 'users' as const,
                tag: 'Outdoor · gated',
                cap: compound ? `${compound.min}–${compound.max}` : '',
              },
              {
                v: conference,
                icon: 'presentation' as const,
                capIcon: 'stairs' as const,
                tag: 'Indoor · AC',
                cap: conference?.label ?? '',
              },
            ].map(({ v, icon, capIcon, tag, cap }, i) =>
              v ? (
                <Link
                  key={v.slug}
                  data-mi-nudge-host=""
                  href="/venues"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) auto',
                    gap: 16,
                    alignItems: 'center',
                    padding: '16px 0',
                    borderTop: '1px solid rgba(0,0,99,0.16)',
                    borderBottom: i === 1 ? '1px solid rgba(0,0,99,0.16)' : undefined,
                    color: '#00003A',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={icon} size={24} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, letterSpacing: '-0.03em' }}>{v.name}</span>
                      <span style={{ fontSize: 13.5, color: 'rgba(0,0,58,0.68)' }}>{tag}</span>
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Icon name={capIcon} size={15} />
                    {cap}
                  </span>
                </Link>
              ) : null,
            )}
            <Link
              href="/venues"
              data-mi-btn="fill"
              style={{
                marginTop: 24,
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                height: 46,
                padding: '0 20px',
                borderRadius: 10,
                background: '#000063',
                color: '#F5F2EA',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Enquire about a venue
            </Link>
          </div>
        </div>
      </section>

      {data.testimonial && (
        <section data-screen-label="Home · Testimonial" style={{ background: '#F6E2B3', padding: 'var(--sy) var(--pad)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--c55)', gap: 'var(--hgap)', alignItems: 'center' }}>
            <div
              style={{
                position: 'relative',
                aspectRatio: 'var(--tq-ar)',
                overflow: 'hidden',
                borderRadius: 16,
                maxWidth: 420,
                width: '100%',
              }}
            >
              <SiteImage
                data-mi-img=""
                image={data.photos.testimonial!}
                alt="Close-up of a pillow with the Hotel A-Wise customised label"
                fill
                sizes="(min-width: 1024px) 420px, 100vw"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <blockquote style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div role="img" aria-label="5 out of 5 stars" style={{ display: 'flex', gap: 4, color: '#B8860B' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Icon key={i} name="star" size={22} />
                ))}
              </div>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 300,
                  fontSize: 'var(--quote)',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                }}
              >
                “{data.testimonial.quote}”
              </p>
              <footer style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(0,0,58,0.72)' }}>{data.testimonial.from}</footer>
            </blockquote>
          </div>
        </section>
      )}

      <section data-screen-label="Home · Getting here" style={{ padding: '0 var(--pad) var(--sy)' }}>
        <h2 style={{ ...h2, margin: '0 0 var(--hmb)', paddingTop: 24, borderTop: '1px solid rgba(0,0,99,0.16)' }}>
          {c['home.mapHeading']}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--c55)', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 15 }}>
              <a href={contact.tel} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: '#00003A' }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: '#F6E2B3',
                    color: '#000063',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="phone" size={18} />
                </span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{contact.phone}</span>
              </a>
              <a href={contact.wa} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: '#00003A' }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(37,211,102,0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="whatsapp" size={18} />
                </span>
                WhatsApp the desk
              </a>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(0,0,58,0.7)' }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(0,0,99,0.06)',
                    color: '#000063',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="pin" size={18} />
                </span>
                <span>{contact.address}</span>
              </span>
            </div>
            <a
              href={contact.mapsDirections}
              target="_blank"
              rel="noopener"
              data-mi-btn="ghost"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                height: 46,
                padding: '0 20px',
                borderRadius: 10,
                border: '1px solid #000063',
                color: '#000063',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <Icon name="googlemaps" size={18} />
              Get directions
            </a>
          </div>
          <div style={{ minHeight: 380, borderRadius: 16, overflow: 'hidden', background: '#F6E2B3' }}>
            <iframe
              title="Map showing Hotel A-Wise, New Asofan, Accra"
              src="https://maps.google.com/maps?q=5.6455136,-0.2869356&z=15&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ width: '100%', height: '100%', minHeight: 380, border: 0, filter: 'grayscale(0.6) contrast(1.05)' }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

// Footer (Website.dc.html): photo band with the big wordmark and "Book your
// stay" disc, Pages, Contact info and the newsletter.
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import type { Contact } from '@/server/content/contact';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import { NewsletterForm } from './newsletter-form';
import { SiteImage } from './site-image';

const pageLink: React.CSSProperties = { color: '#F5F2EA', textDecoration: 'none', fontSize: 18 };

export function SiteFooter({ contact, photo, turnstileSiteKey }: { contact: Contact; photo: SiteImageT; turnstileSiteKey: string | null }) {
  return (
    <footer data-screen-label="Footer">
      <div style={{ position: 'relative', height: 'var(--foot-h)', overflow: 'hidden', background: '#1A1712' }}>
        <SiteImage
          image={photo}
          alt="The first-floor hallway at Hotel A-Wise: yellow walls, carved wooden doors, polished tiles"
          fill
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 60%' }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg,rgba(20,16,10,0.05) 0%,rgba(20,16,10,0.15) 50%,rgba(20,16,10,0.6) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 'var(--pad)',
            right: 'var(--pad)',
            bottom: 'clamp(24px,4vw,56px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#FFFFFF',
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--h1)',
              fontWeight: 300,
              lineHeight: 1.02,
              letterSpacing: '-0.05em',
            }}
          >
            Hotel A-Wise
          </p>
          <Link
            href="/book"
            className="aw-foot-book"
            style={{
              width: 'var(--foot-btn)',
              height: 'var(--foot-btn)',
              borderRadius: '50%',
              background: '#000063',
              color: '#F5F2EA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: 'clamp(15px,1.4vw,20px)',
              fontWeight: 500,
              lineHeight: 1.25,
              boxShadow: '0 0 0 10px rgba(255,255,255,0.12)',
            }}
          >
            Book your
            <br />
            stay
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 desk:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div
          style={{
            background: '#000063',
            color: '#F5F2EA',
            padding: 'clamp(40px,5vw,72px) var(--pad) 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 48,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, letterSpacing: '-0.05em' }}>Pages</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', justifyContent: 'start' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 22,
                  paddingRight: 48,
                  borderRight: '1px solid rgba(245,242,234,0.35)',
                }}
              >
                <Link href="/" style={pageLink}>
                  Home
                </Link>
                <Link href="/rooms" style={pageLink}>
                  Rooms
                </Link>
                <Link href="/rent" style={pageLink}>
                  Rentals
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingLeft: 48 }}>
                <Link href="/gallery" style={pageLink}>
                  Gallery
                </Link>
                <Link href="/contact" style={pageLink}>
                  Contact
                </Link>
                <Link href="/venues" style={pageLink}>
                  Venues
                </Link>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-0.05em' }}>
              © {new Date().getFullYear()} Hotel A-Wise
            </span>
            <Link href="/admin" style={{ color: 'rgba(245,242,234,0.55)', fontSize: 12 }}>
              Staff login
            </Link>
          </div>
        </div>
        <div
          style={{
            background: '#FFFFFF',
            color: '#00003A',
            padding: 'clamp(40px,5vw,64px) var(--pad) 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 30, color: '#000063', letterSpacing: '-0.05em' }}>Contact info</span>
          <div className="grid grid-cols-1 desk:grid-cols-3">
            <div className="aw-info-cell" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 32px 32px 0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'rgba(0,0,58,0.7)' }}>
                <Icon name="pin" size={18} />
                Address
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.55 }}>
                {contact.address}.
                <br />
                Or “Hotel A-Wise” on{' '}
                <a href={contact.mapsSearch} target="_blank" rel="noopener">
                  Google Maps
                </a>
                .
              </span>
            </div>
            <div className="aw-info-cell aw-info-mid" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'rgba(0,0,58,0.7)' }}>
                <Icon name="phone" size={18} />
                Phone
              </span>
              <a href={contact.tel} style={{ fontSize: 15, color: '#00003A', textDecoration: 'none' }}>
                {contact.phone}
              </a>
            </div>
            <div className="aw-info-last" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'rgba(0,0,58,0.7)' }}>
                <Icon name="mail" size={18} />
                Email
              </span>
              <a href={contact.mail} style={{ fontSize: 15, color: '#00003A', textDecoration: 'none' }}>
                {contact.email}
              </a>
            </div>
          </div>
          <NewsletterForm siteKey={turnstileSiteKey} />
        </div>
      </div>
      {/* Room for the sticky mobile "Book a room" button. */}
      <div aria-hidden="true" className="desk:hidden" style={{ height: 'calc(80px + env(safe-area-inset-bottom))' }} />
    </footer>
  );
}

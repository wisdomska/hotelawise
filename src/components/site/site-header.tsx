'use client';
// Announcement banner, sticky glass header and mobile menu (Website.dc.html).
// The header is transparent over the home hero and turns solid once scrolled,
// on every other page, or while the mobile menu is open.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/icon';
import { NyansapoMark } from '@/components/ui/nyansapo-mark';

const EASE = 'cubic-bezier(0.23,1,0.32,1)';
export const NAV_LINKS: [label: string, href: string][] = [
  ['Rooms', '/rooms'],
  ['Rentals', '/rent'],
  ['Venues', '/venues'],
  ['Gallery', '/gallery'],
  ['Contact', '/contact'],
];

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function SiteHeader({ banner, phone, tel }: { banner: string | null; phone: string; tel: string }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  // The page the menu was opened on; navigating anywhere else closes it.
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menu = menuOn === pathname;
  const setMenu = (open: boolean | ((m: boolean) => boolean)) => {
    const next = typeof open === 'function' ? open(menu) : open;
    setMenuOn(next ? pathname : null);
  };

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      setPastHero(window.scrollY > window.innerHeight * 0.75);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const raf = requestAnimationFrame(onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const solid = !isHome || scrolled || menu;
  const vars = {
    '--nf': solid ? '#00003A' : '#FFFFFF',
    '--nm': solid ? 'rgba(0,0,58,0.65)' : 'rgba(255,255,255,0.8)',
    '--nl': solid ? 'rgba(0,0,99,0.12)' : 'rgba(255,255,255,0.3)',
  } as React.CSSProperties;

  const showMobileBook = !pathname.startsWith('/rooms/') && !pathname.startsWith('/book') && !menu && (!isHome || pastHero);

  return (
    <>
      {!online && (
        <div
          role="status"
          style={{
            background: '#B42318',
            color: '#FFFFFF',
            fontSize: 13,
            padding: '10px var(--pad)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <span>You&apos;re offline. Prices and availability may be out of date.</span>
          <a href={tel} style={{ color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
            Call {phone}
          </a>
        </div>
      )}
      {showMobileBook && (
        <Link
          href="/book"
          className="desk:hidden"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 'calc(16px + env(safe-area-inset-bottom))',
            zIndex: 45,
            height: 48,
            padding: '0 20px',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 12,
            background: 'rgba(0,0,99,0.72)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#F5F2EA',
            fontWeight: 600,
            fontSize: 15,
            textDecoration: 'none',
            gap: 8,
            boxShadow: '0 10px 30px -10px rgba(0,0,58,0.5)',
            animation: 'aw-fade 200ms var(--ease-enter)',
          }}
        >
          <Icon name="key" size={18} />
          Book a room
        </Link>
      )}
      {banner && (
        <div
          className="aw-banner"
          role="region"
          aria-label="Announcement"
          style={{
            position: 'relative',
            zIndex: 41,
            background: '#00003A',
            color: '#F5F2EA',
            fontSize: 13.5,
            lineHeight: 1.4,
            padding: '10px 52px 10px var(--pad)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            textAlign: 'center',
          }}
        >
          <Icon name="sparkle" size={15} style={{ color: '#F2B544' }} />
          <span style={{ textWrap: 'balance' }}>{banner}</span>
          <button
            type="button"
            onClick={() => {
              document.documentElement.setAttribute('data-banner-off', '');
              try {
                sessionStorage.setItem('aw.bannerOff', '1');
              } catch {
                /* storage unavailable: hidden for this page view only */
              }
            }}
            aria-label="Dismiss announcement"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              border: 'none',
              borderRadius: 8,
              background: 'transparent',
              color: '#F5F2EA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, height: 0, display: 'flow-root' }}>
        <header
          style={{
            ...vars,
            position: 'relative',
            margin: '14px var(--navgap) 0',
            borderRadius: 16,
            color: 'var(--nf)',
            transition: 'color 200ms',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              background: 'rgba(245,242,234,0.86)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
              backdropFilter: 'blur(18px) saturate(1.4)',
              border: '1px solid rgba(0,0,99,0.08)',
              boxShadow: '0 14px 36px -20px rgba(20,16,10,0.45)',
              opacity: solid ? 1 : 0,
              transition: `opacity 280ms ${EASE}`,
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '10px 10px 10px 20px', minHeight: 60 }}>
              <Link
                href="/"
                aria-label="Hotel A-Wise home"
                style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--nf)', textDecoration: 'none' }}
              >
                <NyansapoMark size={30} />
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                  Hotel A-Wise
                </span>
              </Link>
              <div style={{ flex: 1 }} />
              <nav
                aria-label="Main"
                className="hidden desk:flex"
                style={{ gap: 'clamp(14px,2vw,28px)', fontSize: 14, minWidth: 0, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
              >
                {NAV_LINKS.map(([label, href]) => {
                  const current = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      data-mi-ul=""
                      href={href}
                      aria-current={current ? 'page' : undefined}
                      style={{
                        color: 'var(--nf)',
                        textDecoration: 'none',
                        position: 'relative',
                        padding: '6px 0',
                        opacity: current ? 1 : 0.86,
                      }}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <Link
                href="/book"
                data-mi-btn="fill"
                className="hidden desk:flex"
                style={{
                  alignItems: 'center',
                  height: 'max(42px, var(--tap-min, 0px))',
                  padding: '0 18px',
                  borderRadius: 10,
                  background: '#000063',
                  color: '#F5F2EA',
                  textDecoration: 'none',
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="key" size={16} />
                  Book a room
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                aria-expanded={menu}
                aria-controls="site-menu"
                aria-label="Menu"
                className="flex desk:hidden"
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 44,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid var(--nl)',
                  background: 'transparent',
                  color: 'var(--nf)',
                  fontSize: 14,
                }}
              >
                {menu ? 'Close' : 'Menu'}
              </button>
            </div>
            {menu && (
              <div
                id="site-menu"
                style={{
                  padding: '4px 20px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: '1px solid var(--nl)',
                  transformOrigin: '50% 0',
                  animation: `aw-menu 280ms ${EASE} both`,
                }}
              >
                {NAV_LINKS.map(([label, href], i) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenu(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: 52,
                      color: 'var(--nf)',
                      textDecoration: 'none',
                      fontFamily: 'var(--font-serif)',
                      fontSize: 24,
                      letterSpacing: '-0.03em',
                      borderBottom: '1px solid var(--nl)',
                      animation: `aw-menu-item 360ms ${EASE} both`,
                      animationDelay: `${40 + i * 30}ms`,
                    }}
                  >
                    {label}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.45 }}
                    >
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </Link>
                ))}
                <Link
                  href="/book"
                  onClick={() => setMenu(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minHeight: 48,
                    marginTop: 14,
                    borderRadius: 10,
                    background: '#000063',
                    color: '#F5F2EA',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: 15,
                    animation: `aw-menu-item 360ms ${EASE} 200ms both`,
                  }}
                >
                  <Icon name="key" size={16} />
                  Book a room
                </Link>
                <Link
                  href="/manage"
                  onClick={() => setMenu(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 44,
                    marginTop: 8,
                    color: 'var(--nm)',
                    fontSize: 14,
                    textDecoration: 'none',
                    animation: `aw-menu-item 360ms ${EASE} 220ms both`,
                  }}
                >
                  <Icon name="file" size={16} />
                  Manage my booking
                </Link>
              </div>
            )}
          </div>
        </header>
      </div>
    </>
  );
}

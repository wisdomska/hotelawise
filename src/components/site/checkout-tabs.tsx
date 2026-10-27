'use client';
// Book a room · Manage booking · Rentals · Venues (Checkout.dc.html › tabs).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type AnyIconName } from '@/components/ui/icon';

const TABS: [string, string, AnyIconName][] = [
  ['Book a room', '/book', 'key'],
  ['Manage booking', '/manage', 'file'],
  ['Rentals', '/rent', 'tent'],
  ['Venues', '/venues', 'building'],
];

export function CheckoutTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Booking and rentals"
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: 32,
        position: 'relative',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        padding: 4,
        borderRadius: 20,
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,99,0.1)',
        width: 'max-content',
        maxWidth: '100%',
      }}
    >
      {TABS.map(([label, href, icon]) => {
        const on = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            style={{
              height: 'max(36px, var(--tap-min, 0px))',
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 9,
              fontSize: 13.5,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              gap: 8,
              background: on ? '#000063' : 'transparent',
              color: on ? '#F5F2EA' : '#00003A',
              transition: 'background 220ms var(--ease-enter), color 220ms var(--ease-enter)',
            }}
          >
            <Icon name={icon} size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

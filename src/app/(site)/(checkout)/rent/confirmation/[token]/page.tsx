// Chairs: sorted (Checkout.dc.html › Rentals · Confirmed), by the order's token.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfirmPoller } from '@/components/checkout/confirm-poller';
import { Icon } from '@/components/ui/icon';
import { formatGhs } from '@/lib/money';
import { contactFrom } from '@/server/content/contact';
import { getSiteData, setting } from '@/server/content/site-data';
import { db } from '@/server/platform/db';
import { rentalNote } from '@/server/services/notify';
import { orderBy } from '@/server/services/rentals';

export const metadata: Metadata = { title: 'Rental reserved', robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function RentConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ token }, sp, data] = await Promise.all([params, searchParams, getSiteData()]);
  if (!process.env.DATABASE_URL || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const o = await orderBy(await db(), { token });
  if (!o) notFound();
  const ct = contactFrom(data);
  const reference = typeof sp.reference === 'string' ? sp.reference : typeof sp.trxref === 'string' ? sp.trxref : null;
  if (o.status === 'pending_payment') {
    if (reference) return <ConfirmPoller payRef={reference} tel={ct.tel} phone={ct.phone} />;
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 'var(--h2)',
            lineHeight: 1,
            letterSpacing: '-0.05em',
          }}
        >
          Waiting for your payment.
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
          We&apos;ll text you the moment Paystack confirms it. Questions? <a href={ct.tel}>{ct.phone}</a>
        </p>
      </section>
    );
  }
  if (o.status === 'cancelled') {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 'var(--h2)',
            lineHeight: 1,
            letterSpacing: '-0.05em',
          }}
        >
          Order {o.ref} is cancelled.
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
          Anything you paid is on its way back. Questions? <a href={ct.tel}>{ct.phone}</a>
        </p>
      </section>
    );
  }
  const online = o.payMode === 'online';
  const hours = { pickupFrom: setting<number>(data, 'rentals.pickupFromHour'), returnBy: setting<number>(data, 'rentals.returnByHour') };
  const stampColor = online ? '#1F7A4D' : '#000063';
  const btn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 46,
    padding: '0 18px',
    borderRadius: 10,
    textDecoration: 'none',
    fontSize: 14,
  };
  const leader: React.CSSProperties = {
    flex: 1,
    borderBottom: '1.5px dotted rgba(0,0,58,0.3)',
    margin: '0 8px',
    transform: 'translateY(-4px)',
  };
  const lines = [
    ...o.lines.map((l) => ({ label: `${l.name.toUpperCase()} × ${l.qty}`, amount: formatGhs(l.amount), color: 'inherit' })),
    ...(o.discount ? [{ label: 'PACK DISCOUNT', amount: `− ${formatGhs(o.discount)}`, color: '#1F7A4D' }] : []),
    { label: 'SECURITY DEPOSIT', amount: formatGhs(o.deposit), color: 'rgba(0,0,58,0.6)' },
  ];
  return (
    <section
      data-screen-label="Rentals · Confirmed"
      style={{
        display: 'grid',
        gridTemplateColumns: 'var(--c-main)',
        gap: 40,
        alignItems: 'start',
        animation: 'aw-up 500ms var(--ease-enter)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', color: '#1F7A4D' }}>
          ● RESERVED · {online ? 'PAID ONLINE' : 'PAY AT PICKUP'}
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 'var(--h1)',
            lineHeight: 0.95,
            letterSpacing: '-0.05em',
          }}
        >
          Chairs: sorted. <em style={{ fontWeight: 300 }}>Go plan the rest.</em>
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
          {rentalNote(o, hours)} We&apos;ve sent the details by SMS.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/api/ics/${o.token}`} data-mi-btn="fill" style={{ ...btn, background: '#000063', color: '#F5F2EA' }}>
            <Icon name="calendar" size={16} />
            Add pickup to calendar
          </a>
          <a href={ct.mapsDirections} target="_blank" rel="noopener" data-mi-btn="ghost" style={{ ...btn, border: '1px solid #000063' }}>
            <Icon name="googlemaps" size={16} />
            Directions
          </a>
          <a href={`/api/invoices/${o.token}`} download data-mi-btn="ghost" style={{ ...btn, border: '1px solid #000063' }}>
            <Icon name="download" size={16} />
            {o.paid >= o.total && o.total > 0 ? 'Download receipt' : 'Download invoice'}
          </a>
          <a href="/rent" data-mi-btn="ghost" style={{ ...btn, border: '1px solid #000063' }}>
            Start another order
          </a>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          borderRadius: 20,
          border: '1px solid rgba(0,0,99,0.14)',
          padding: 24,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <svg
          viewBox="0 0 32 32"
          width="260"
          height="260"
          fill="none"
          stroke="#000063"
          strokeWidth="0.6"
          aria-hidden="true"
          style={{ position: 'absolute', right: -60, bottom: -60, opacity: 0.06 }}
        >
          <circle cx="11" cy="11" r="5.5" />
          <circle cx="21" cy="11" r="5.5" />
          <circle cx="11" cy="21" r="5.5" />
          <circle cx="21" cy="21" r="5.5" />
          <rect x="12.5" y="12.5" width="7" height="7" transform="rotate(45 16 16)" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(0,0,58,0.6)' }}>
            RESERVATION REFERENCE
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 10px',
              border: `1.5px solid ${stampColor}`,
              color: stampColor,
              borderRadius: 6,
              transform: 'rotate(-6deg)',
            }}
          >
            {online ? 'PAID' : 'PAY AT DESK'}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, letterSpacing: '0.04em' }}>{o.ref}</span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            borderTop: '1.5px dashed rgba(0,0,99,0.3)',
            paddingTop: 12,
          }}
        >
          {lines.map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'baseline', color: l.color }}>
              <span>{l.label}</span>
              <span style={leader} />
              <span>{l.amount}</span>
            </div>
          ))}
          <div style={{ display: 'flex', fontWeight: 500, paddingTop: 8, borderTop: '1px solid rgba(0,0,99,0.2)' }}>
            <span>TOTAL</span>
            <span style={{ flex: 1 }} />
            <span>{formatGhs(o.total)}</span>
          </div>
          <div style={{ display: 'flex', color: online ? '#1F7A4D' : '#7A4E00' }}>
            <span>{online ? 'PAID' : 'DUE AT PICKUP'}</span>
            <span style={{ flex: 1 }} />
            <span>{formatGhs(online ? o.paid : o.total)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

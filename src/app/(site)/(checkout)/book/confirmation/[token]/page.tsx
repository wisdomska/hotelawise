// You're booked (Checkout.dc.html › Booking · Confirmed). Reached by the
// booking's unguessable token, never by its reference.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfirmPoller } from '@/components/checkout/confirm-poller';
import { Receipt, ReceiptTotal } from '@/components/checkout/receipt';
import { Icon } from '@/components/ui/icon';
import { formatShortDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';
import { db } from '@/server/platform/db';
import { bookingBy } from '@/server/services/bookings';

export const metadata: Metadata = { title: 'Booking confirmed', robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ token }, sp, data] = await Promise.all([params, searchParams, getSiteData()]);
  if (!process.env.DATABASE_URL || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const b = await bookingBy(await db(), { token });
  if (!b || !b.ref) notFound();
  const ct = contactFrom(data);
  const reference = typeof sp.reference === 'string' ? sp.reference : typeof sp.trxref === 'string' ? sp.trxref : null;

  if (b.status === 'pending_payment' || b.status === 'held') {
    return reference ? <ConfirmPoller payRef={reference} tel={ct.tel} phone={ct.phone} /> : <PendingNote tel={ct.tel} phone={ct.phone} />;
  }
  if (b.status === 'cancelled' || b.status === 'expired') {
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
          Booking {b.ref} is cancelled.
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
          {b.refundPending ? `${formatGhs(b.refundPending)} is on its way back to you. ` : ''}Questions? <a href={ct.tel}>{ct.phone}</a>
        </p>
      </section>
    );
  }

  const atHotel = b.payMode === 'at_hotel' && b.paid === 0;
  const full = b.paid >= b.total && b.total > 0;
  const doneStatus = atHotel ? 'CONFIRMED · PAY AT HOTEL' : full ? 'PAID IN FULL · CONFIRMED' : 'DEPOSIT PAID · CONFIRMED';
  const stamp = atHotel ? 'PAY AT DESK' : full ? 'PAID' : 'DEPOSIT PAID';
  const stampColor = atHotel ? '#000063' : '#1F7A4D';
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
  const lines = [
    ...b.lines.map((l) => ({ label: l.label, amount: l.amount < 0 ? `− ${formatGhs(-l.amount)}` : formatGhs(l.amount) })),
    ...(b.discount ? [{ label: `PROMO ${b.promoCode ?? ''}`.trim(), amount: `− ${formatGhs(b.discount)}` }] : []),
  ];

  return (
    <section
      data-screen-label="Booking · Confirmed"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'var(--c-main)',
        gap: 40,
        alignItems: 'start',
        animation: 'aw-up 500ms var(--ease-enter)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.06em',
            color: '#1F7A4D',
          }}
        >
          ● {doneStatus}
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
          You&apos;re booked. <em style={{ fontWeight: 300 }}>We&apos;ll leave the light on.</em>
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
          We&apos;ve texted {formatPhone(b.phone)} your reference. The desk is staffed all night, so arrive whenever you arrive. Say the
          reference at reception and we&apos;ll hand you the key.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/api/ics/${b.token}`} data-mi-btn="fill" style={{ ...btn, background: '#000063', color: '#F5F2EA' }}>
            <Icon name="calendar" size={16} />
            Add to calendar
          </a>
          <a href={ct.mapsDirections} target="_blank" rel="noopener" data-mi-btn="ghost" style={{ ...btn, border: '1px solid #000063' }}>
            <Icon name="googlemaps" size={16} />
            Directions
          </a>
          <a href={`/api/invoices/${b.token}`} download data-mi-btn="ghost" style={{ ...btn, border: '1px solid #000063' }}>
            <Icon name="download" size={16} />
            {full ? 'Download receipt' : 'Download invoice'}
          </a>
          <a href={`/manage?ref=${encodeURIComponent(b.ref)}`} data-mi-btn="ghost" style={{ ...btn, border: '1px solid rgba(0,0,99,0.3)' }}>
            Manage booking
          </a>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'rgba(0,0,58,0.72)' }}>
          <span>Getting here: No. 1 Wisepak Lane, New Asofan, Accra. Tell your driver “A-Wise, Wisepak Lane”.</span>
          <span>
            Questions? <a href={ct.tel}>{ct.phone}</a> · <a href={ct.wa}>WhatsApp</a>
          </span>
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
          gap: 14,
        }}
      >
        <svg
          viewBox="0 0 32 32"
          width="280"
          height="280"
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(0,0,58,0.6)' }}>
              BOOKING REFERENCE
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, letterSpacing: '0.04em' }}>{b.ref}</span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 10px',
              border: `1.5px solid ${stampColor}`,
              color: stampColor,
              borderRadius: 6,
              animation: 'aw-stamp 500ms var(--ease-enter) 200ms both',
            }}
          >
            {stamp}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>{b.variantName} Room</span>
          <span style={{ color: 'rgba(0,0,58,0.7)' }}>
            {formatShortDate(b.checkIn)} → {formatShortDate(b.checkOut)} · {b.nights} night{b.nights === 1 ? '' : 's'} · {b.guests} guest
            {b.guests === 1 ? '' : 's'}
          </span>
          <span style={{ color: 'rgba(0,0,58,0.7)' }}>
            {b.guestName} · {formatPhone(b.phone)}
          </span>
        </div>
        <Receipt lines={lines}>
          <ReceiptTotal label="TOTAL" amount={formatGhs(b.total)} size={13} />
          <ReceiptTotal label="PAID" amount={formatGhs(b.paid)} size={13} top={false} color="#1F7A4D" />
          <ReceiptTotal label="BALANCE AT DESK" amount={formatGhs(Math.max(0, b.total - b.paid))} size={13} top={false} />
        </Receipt>
        <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>Receipt sent by SMS{b.email ? `, and to ${b.email}` : ''}.</span>
      </div>
    </section>
  );
}

function PendingNote({ tel, phone }: { tel: string; phone: string }) {
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
        We&apos;ll text you the moment Paystack confirms it. Questions? <a href={tel}>{phone}</a>
      </p>
    </section>
  );
}

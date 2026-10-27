'use client';
// Customer drawer (Admin.dc.html buildDrawer "customer"): contact, history,
// lifetime spend for Super Admins, staff notes and quick actions.
import { useEffect, useState } from 'react';
import { loadCustomer, saveCustomerNote } from '@/app/admin/(app)/customers/actions';
import { formatDayMonth } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhoneLocal, telHref, whatsappHref } from '@/lib/phone';
import { QuickBooking } from '../bookings/modals';
import { useAdmin } from '../context';
import { DrawerFrame, DrawerLoading } from '../drawer';
import type { Action } from '../ui';

type Customer = NonNullable<Awaited<ReturnType<typeof loadCustomer>>>;

export function CustomerDrawer({ spec }: { spec: { id: string } }) {
  const { version, can, openModal, openDrawer, closeDrawer } = useAdmin();
  const [c, setC] = useState<Customer | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadCustomer(spec.id)
      .then((x) => live && setC(x))
      .catch(() => live && setC(null));
    return () => {
      live = false;
    };
  }, [spec.id, version]);
  if (c === undefined) return <DrawerLoading label="Customer" />;
  if (c === null) return null;
  const visits = c.history.length;
  const count = (k: Customer['history'][number]['kind']) => c.history.filter((h) => h.kind === k).length;
  const acts: Action[] = [];
  if (can('bookings.create'))
    acts.push({
      label: 'New booking',
      icon: 'plus',
      kind: 'primary',
      on: () => {
        closeDrawer();
        openModal(<QuickBooking prefill={{ guest: c.name, phone: formatPhoneLocal(c.phone) }} />);
      },
    });
  acts.push({ label: 'Call', icon: 'phone', on: () => (location.href = telHref(c.phone)) });
  acts.push({ label: 'WhatsApp', icon: 'whatsapp', on: () => window.open(whatsappHref(c.phone), '_blank', 'noopener') });
  if (c.email) acts.push({ label: 'Email', icon: 'mail', on: () => (location.href = `mailto:${c.email}`) });
  return (
    <DrawerFrame
      kicker="CUSTOMER"
      title={c.name}
      status={visits > 1 ? 'Repeat customer' : 'First visit'}
      tone={visits > 1 ? 'amber' : 'grey'}
      fields={[
        { k: 'Phone', v: formatPhoneLocal(c.phone), mono: true },
        ...(c.email ? [{ k: 'Email', v: c.email }] : []),
        { k: 'Stays', v: String(count('booking')), mono: true },
        { k: 'Rental orders', v: String(count('rental')), mono: true },
        ...(count('enquiry') ? [{ k: 'Venue enquiries', v: String(count('enquiry')), mono: true }] : []),
        ...(c.spend != null ? [{ k: 'Lifetime spend', v: formatGhs(c.spend), mono: true }] : []),
        { k: 'Customer since', v: formatDayMonth(c.since) },
      ]}
      sections={[
        {
          title: 'HISTORY',
          empty: 'No stays or orders yet.',
          lines: c.history.map((h) => ({ k: `${h.ref} · ${h.label} · ${formatDayMonth(h.date)}`, v: h.status })),
        },
      ]}
      note={can('customers.note') ? { value: c.notes, save: (v) => saveCustomerNote(c.id, v) } : undefined}
      actions={acts}
    >
      {visits > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {c.history.slice(0, 6).map((h) => (
            <button
              key={h.ref}
              type="button"
              onClick={() =>
                h.kind === 'booking'
                  ? openDrawer({ kind: 'booking', ref: h.ref })
                  : h.kind === 'rental'
                    ? openDrawer({ kind: 'rental', ref: h.ref })
                    : openDrawer({ kind: 'enquiry', ref: h.ref })
              }
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 999,
                border: '1px solid var(--line2)',
                background: 'transparent',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
              }}
            >
              Open {h.ref}
            </button>
          ))}
        </div>
      )}
    </DrawerFrame>
  );
}
